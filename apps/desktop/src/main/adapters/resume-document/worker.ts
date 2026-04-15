import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ResumeParserWorkerRequestSchema,
  ResumeParserWorkerResponseSchema,
  type ResumeDocumentFileKind,
  type ResumeDocumentParserKind,
  type ResumeParserWorkerRequest,
  type ResumeParserWorkerResponse,
} from '@unemployed/contracts'
import { extractDocxTextWithTextutil } from '../resume-document-macos'
import { buildBundleFromText, buildDocumentQualitySignal, normalizeExtractedText } from '../resume-document-utils'
import { runResumeParserSidecar } from '../resume-document-sidecar'
import { extractMacOsPdfDocumentBundle, extractPdfDocumentBundleWithPdfJs } from './pdf'
import {
  bundleToWorkerResponse,
  createEmbeddedParserManifest,
  createFailureResponse,
  uniqueWarnings,
} from './shared'
import type { ExtractResumeDocumentInput } from './types'

export function detectResumeDocumentFileKind(filePath: string): ResumeDocumentFileKind {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.txt') {
    return 'plain_text'
  }

  if (extension === '.md' || extension === '.markdown') {
    return 'markdown'
  }

  if (extension === '.docx') {
    return 'docx'
  }

  if (extension === '.pdf') {
    return 'pdf'
  }

  return 'unknown'
}

export function defaultPreferredRoute(
  fileKind: ResumeDocumentFileKind,
): ResumeParserWorkerRequest['preferredRoute'] {
  switch (fileKind) {
    case 'plain_text':
    case 'markdown':
      return 'plain_text_native'
    case 'docx':
      return 'docx_native'
    case 'pdf':
      return 'native_first'
    default:
      return 'unsupported_fallback'
  }
}

function preferredExecutorsForFileKind(fileKind: ResumeDocumentFileKind): ResumeDocumentParserKind[] {
  switch (fileKind) {
    case 'plain_text':
    case 'markdown':
      return ['plain_text']
    case 'docx':
      return process.platform === 'darwin'
        ? ['local_docx', 'textutil_docx', 'mammoth']
        : ['local_docx', 'mammoth']
    case 'pdf':
      return process.platform === 'darwin'
        ? ['local_pdf_layout', 'macos_pdfkit_text', 'macos_vision_ocr', 'pdfjs_text']
        : ['local_pdf_layout', 'local_pdf_text_probe', 'pdfjs_text']
    default:
      return ['local_sidecar_fallback']
  }
}

export function createResumeParserWorkerRequest(filePath: string): ResumeParserWorkerRequest {
  const fileKind = detectResumeDocumentFileKind(filePath)

  return ResumeParserWorkerRequestSchema.parse({
    requestId: `resume_parser_request_${Date.now()}`,
    filePath,
    fileKind,
    preferredRoute: defaultPreferredRoute(fileKind),
    preferredExecutors: preferredExecutorsForFileKind(fileKind),
  })
}

function shouldAttemptSidecar(fileKind: ResumeDocumentFileKind): boolean {
  if (process.env.UNEMPLOYED_RESUME_PARSER_SIDECAR === '0') {
    return false
  }

  return fileKind === 'pdf' || fileKind === 'docx'
}

function shouldFallbackFromSidecarResponse(response: ResumeParserWorkerResponse): boolean {
  if (!response.ok || !response.primaryParserKind) {
    return true
  }

  if (response.primaryParserKind === 'local_sidecar_fallback') {
    return true
  }

  const uniquePageNumbers = new Set(response.pages.map((page) => page.pageNumber))
  if (response.pages.length > 1 && uniquePageNumbers.size <= 1) {
    return true
  }

  return response.blocks.length === 0 && !response.fullText
}

function countWordLikeTokens(value: string | null | undefined): number {
  if (!value) {
    return 0
  }

  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length
}

export function shouldFallbackToEmbeddedDocxResponse(input: {
  sidecarResponse: ResumeParserWorkerResponse
  embeddedResponse: ResumeParserWorkerResponse
}): boolean {
  const { embeddedResponse, sidecarResponse } = input

  if (!sidecarResponse.ok || sidecarResponse.primaryParserKind !== 'local_docx') {
    return false
  }

  if (!embeddedResponse.ok || !embeddedResponse.primaryParserKind || !embeddedResponse.fullText) {
    return false
  }

  const sidecarTextLength = sidecarResponse.fullText?.trim().length ?? 0
  const embeddedTextLength = embeddedResponse.fullText.trim().length
  const sidecarTokenCount = countWordLikeTokens(sidecarResponse.fullText)
  const embeddedTokenCount = countWordLikeTokens(embeddedResponse.fullText)

  if (sidecarTextLength === 0) {
    return true
  }

  const lengthGap = embeddedTextLength - sidecarTextLength
  const tokenGap = embeddedTokenCount - sidecarTokenCount

  return (
    embeddedTextLength >= 200
    && embeddedTokenCount >= 40
    && lengthGap >= 120
    && tokenGap >= 20
    && embeddedTextLength >= Math.ceil(sidecarTextLength * 1.5)
  )
}

function mergeSidecarFallbackWarnings(
  sidecarResponse: ResumeParserWorkerResponse,
  embeddedResponse: ResumeParserWorkerResponse,
  fallbackMessage?: string,
): ResumeParserWorkerResponse {
  const sidecarWarnings = [...sidecarResponse.warnings]

  if (fallbackMessage) {
    sidecarWarnings.push(fallbackMessage)
  } else if (sidecarResponse.errorMessage) {
    sidecarWarnings.push(`Python resume parser sidecar fallback: ${sidecarResponse.errorMessage}`)
  } else {
    sidecarWarnings.push('Python resume parser sidecar returned no usable parse, so the desktop importer used the embedded parser.')
  }

  const route = embeddedResponse.route
    ? {
        ...embeddedResponse.route,
        triageReasons: uniqueWarnings([
          ...embeddedResponse.route.triageReasons,
          'python_sidecar_fallback',
        ]),
      }
    : embeddedResponse.route

  return ResumeParserWorkerResponseSchema.parse({
    ...embeddedResponse,
    route,
    warnings: uniqueWarnings([...sidecarWarnings, ...embeddedResponse.warnings]),
  })
}

async function executePlainTextParser(
  filePath: string,
  input: ExtractResumeDocumentInput,
  request: ResumeParserWorkerRequest,
): Promise<ResumeParserWorkerResponse> {
  const text = normalizeExtractedText(await readFile(filePath, 'utf8'))
  const bundle = buildBundleFromText({
    bundleId: input.bundleId,
    runId: input.runId,
    sourceResumeId: input.sourceResumeId,
    sourceFileKind: request.fileKind,
    parserKind: 'plain_text',
    text,
    routeKind: 'plain_text_native',
  })

  return bundleToWorkerResponse(request.requestId, bundle)
}

async function extractDocxText(filePath: string): Promise<string | null> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return normalizeExtractedText(result.value)
}

async function executeDocxParser(
  filePath: string,
  input: ExtractResumeDocumentInput,
  request: ResumeParserWorkerRequest,
): Promise<ResumeParserWorkerResponse> {
  let parserKind: ResumeDocumentParserKind = 'mammoth'
  let text: string | null = null

  if (process.platform === 'darwin') {
    try {
      text = await extractDocxTextWithTextutil(filePath)
      parserKind = 'textutil_docx'
    } catch {
      text = await extractDocxText(filePath)
      parserKind = 'mammoth'
    }
  } else {
    text = await extractDocxText(filePath)
    parserKind = 'mammoth'
  }

  const bundle = buildBundleFromText({
    bundleId: input.bundleId,
    runId: input.runId,
    sourceResumeId: input.sourceResumeId,
    sourceFileKind: 'docx',
    parserKind,
    text,
    routeKind: 'docx_native',
  })

  return bundleToWorkerResponse(request.requestId, bundle)
}

async function executePdfParser(
  filePath: string,
  input: ExtractResumeDocumentInput,
  request: ResumeParserWorkerRequest,
): Promise<ResumeParserWorkerResponse> {
  const bundle = process.platform === 'darwin'
    ? await extractMacOsPdfDocumentBundle(filePath, input, request)
    : await extractPdfDocumentBundleWithPdfJs(filePath, input, request)

  return bundleToWorkerResponse(request.requestId, bundle)
}

async function executeEmbeddedParserWorker(
  request: ResumeParserWorkerRequest,
  input: ExtractResumeDocumentInput,
): Promise<ResumeParserWorkerResponse> {
  try {
    switch (request.fileKind) {
      case 'plain_text':
      case 'markdown':
        return await executePlainTextParser(request.filePath, input, request)
      case 'docx':
        return await executeDocxParser(request.filePath, input, request)
      case 'pdf':
        return await executePdfParser(request.filePath, input, request)
      default:
        return ResumeParserWorkerResponseSchema.parse({
          requestId: request.requestId,
          ok: true,
          primaryParserKind: 'local_sidecar_fallback',
          parserKinds: ['local_sidecar_fallback'],
          route: {
            routeKind: 'unsupported_fallback',
            triageReasons: ['unsupported_file_kind'],
            preferredExecutors: request.preferredExecutors,
            usedExecutors: ['local_sidecar_fallback'],
          },
          parserManifest: createEmbeddedParserManifest({
            executorVersions: {
              local_sidecar_fallback: process.versions.node,
            },
            runtimeLabel: 'node-main-process',
            availableCapabilities: ['unsupported_fallback'],
          }),
          quality: buildDocumentQualitySignal({
            fullText: null,
            pages: [],
            blocks: [],
            readingOrderConfidence: 0,
            nativeTextCoverage: 0,
            imageCoverageRatio: 1,
            invalidUnicodeRatio: 0,
          }),
          qualityWarnings: ['unsupported_file_kind'],
          warnings: ['This file type is stored locally, but automatic text extraction is not available yet.'],
          pages: [],
          blocks: [],
          fullText: null,
          errorMessage: null,
        })
    }
  } catch (error) {
    return createFailureResponse({
      requestId: request.requestId,
      warnings: ['Resume extraction fell back before a canonical bundle could be produced.'],
      errorMessage:
        error instanceof Error
          ? error.message
          : 'Resume extraction failed before the embedded parser worker could respond.',
    })
  }
}

export async function executeResumeParserWorker(
  request: ResumeParserWorkerRequest,
  input: ExtractResumeDocumentInput,
): Promise<ResumeParserWorkerResponse> {
  if (!shouldAttemptSidecar(request.fileKind)) {
    return executeEmbeddedParserWorker(request, input)
  }

  const sidecarResponse = await runResumeParserSidecar(request)

  if (!shouldFallbackFromSidecarResponse(sidecarResponse) && request.fileKind === 'docx') {
    const embeddedDocxResponse = await executeEmbeddedParserWorker(request, input)

    if (shouldFallbackToEmbeddedDocxResponse({ sidecarResponse, embeddedResponse: embeddedDocxResponse })) {
      console.warn(
        `[ResumeImport] Sidecar DOCX parse looked incomplete, so the embedded parser was preferred: sidecarTokens=${countWordLikeTokens(sidecarResponse.fullText)} embeddedTokens=${countWordLikeTokens(embeddedDocxResponse.fullText)}`,
      )
      return mergeSidecarFallbackWarnings(
        sidecarResponse,
        embeddedDocxResponse,
        'Python resume parser sidecar returned a partial DOCX parse, so the desktop importer used the embedded parser.',
      )
    }
  }

  if (!shouldFallbackFromSidecarResponse(sidecarResponse)) {
    console.log(
      `[ResumeImport] Sidecar parser succeeded for ${request.fileKind}: primary=${sidecarResponse.primaryParserKind ?? 'unknown'} parsers=${sidecarResponse.parserKinds.join(',') || 'none'}`,
    )
    return sidecarResponse
  }

  console.warn(
    `[ResumeImport] Sidecar parser fell back for ${request.fileKind}: primary=${sidecarResponse.primaryParserKind ?? 'none'} error=${sidecarResponse.errorMessage ?? 'no usable parse'} warnings=${sidecarResponse.warnings.join(' | ') || 'none'}`,
  )

  const embeddedResponse = await executeEmbeddedParserWorker(request, input)
  console.log(
    `[ResumeImport] Embedded parser used for ${request.fileKind}: primary=${embeddedResponse.primaryParserKind ?? 'unknown'} parsers=${embeddedResponse.parserKinds.join(',') || 'none'}`,
  )
  return mergeSidecarFallbackWarnings(sidecarResponse, embeddedResponse)
}
