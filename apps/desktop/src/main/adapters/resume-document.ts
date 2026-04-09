import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResumeDocumentBundleSchema, type ResumeDocumentBlock, type ResumeDocumentBundle } from '@unemployed/contracts'
import { extractDocxTextWithTextutil, extractPdfDocumentBundleWithMacOs } from './resume-document-macos'

const require = createRequire(import.meta.url)

type MatrixTuple = [number, number, number, number, number, number]

function getMatrixNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toMatrixTuple(value: unknown): MatrixTuple {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const numbers = Array.from(value as ArrayLike<unknown>)

    if (numbers.length >= 16) {
      return [
        getMatrixNumber(numbers[0], 1),
        getMatrixNumber(numbers[1], 0),
        getMatrixNumber(numbers[4], 0),
        getMatrixNumber(numbers[5], 1),
        getMatrixNumber(numbers[12], 0),
        getMatrixNumber(numbers[13], 0)
      ]
    }

    if (numbers.length >= 6) {
      return [
        getMatrixNumber(numbers[0], 1),
        getMatrixNumber(numbers[1], 0),
        getMatrixNumber(numbers[2], 0),
        getMatrixNumber(numbers[3], 1),
        getMatrixNumber(numbers[4], 0),
        getMatrixNumber(numbers[5], 0)
      ]
    }
  }

  if (value && typeof value === 'object') {
    const matrix = value as {
      a?: unknown
      b?: unknown
      c?: unknown
      d?: unknown
      e?: unknown
      f?: unknown
      m11?: unknown
      m12?: unknown
      m21?: unknown
      m22?: unknown
      m41?: unknown
      m42?: unknown
    }

    return [
      getMatrixNumber(matrix.a ?? matrix.m11, 1),
      getMatrixNumber(matrix.b ?? matrix.m12, 0),
      getMatrixNumber(matrix.c ?? matrix.m21, 0),
      getMatrixNumber(matrix.d ?? matrix.m22, 1),
      getMatrixNumber(matrix.e ?? matrix.m41, 0),
      getMatrixNumber(matrix.f ?? matrix.m42, 0)
    ]
  }

  return [1, 0, 0, 1, 0, 0]
}

class PdfJsDomMatrixPolyfill {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number

  constructor(value?: unknown) {
    ;[this.a, this.b, this.c, this.d, this.e, this.f] = toMatrixTuple(value)
  }

  get m11(): number {
    return this.a
  }

  set m11(value: number) {
    this.a = value
  }

  get m12(): number {
    return this.b
  }

  set m12(value: number) {
    this.b = value
  }

  get m21(): number {
    return this.c
  }

  set m21(value: number) {
    this.c = value
  }

  get m22(): number {
    return this.d
  }

  set m22(value: number) {
    this.d = value
  }

  get m41(): number {
    return this.e
  }

  set m41(value: number) {
    this.e = value
  }

  get m42(): number {
    return this.f
  }

  set m42(value: number) {
    this.f = value
  }

  get is2D(): boolean {
    return true
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
  }

  multiplySelf(other: unknown): PdfJsDomMatrixPolyfill {
    const [a2, b2, c2, d2, e2, f2] = toMatrixTuple(other)
    const { a, b, c, d, e, f } = this

    this.a = a * a2 + c * b2
    this.b = b * a2 + d * b2
    this.c = a * c2 + c * d2
    this.d = b * c2 + d * d2
    this.e = a * e2 + c * f2 + e
    this.f = b * e2 + d * f2 + f

    return this
  }

  preMultiplySelf(other: unknown): PdfJsDomMatrixPolyfill {
    const [a2, b2, c2, d2, e2, f2] = toMatrixTuple(other)
    const { a, b, c, d, e, f } = this

    this.a = a2 * a + c2 * b
    this.b = b2 * a + d2 * b
    this.c = a2 * c + c2 * d
    this.d = b2 * c + d2 * d
    this.e = a2 * e + c2 * f + e2
    this.f = b2 * e + d2 * f + f2

    return this
  }

  translate(tx = 0, ty = 0): PdfJsDomMatrixPolyfill {
    return this.clone().translateSelf(tx, ty)
  }

  translateSelf(tx = 0, ty = 0): PdfJsDomMatrixPolyfill {
    return this.multiplySelf([1, 0, 0, 1, tx, ty])
  }

  scale(scaleX = 1, scaleY = scaleX, scaleZ = 1, originX = 0, originY = 0, originZ = 0): PdfJsDomMatrixPolyfill {
    return this.clone().scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _scaleZ and _originZ are for API compatibility
  scaleSelf(scaleX = 1, scaleY = scaleX, _scaleZ = 1, originX = 0, originY = 0, _originZ = 0): PdfJsDomMatrixPolyfill {
    if (originX !== 0 || originY !== 0) {
      this.translateSelf(originX, originY)
    }

    this.multiplySelf([scaleX, 0, 0, scaleY, 0, 0])

    if (originX !== 0 || originY !== 0) {
      this.translateSelf(-originX, -originY)
    }

    return this
  }

  invertSelf(): PdfJsDomMatrixPolyfill {
    const determinant = this.a * this.d - this.b * this.c

    if (!Number.isFinite(determinant) || determinant === 0) {
      this.a = Number.NaN
      this.b = Number.NaN
      this.c = Number.NaN
      this.d = Number.NaN
      this.e = Number.NaN
      this.f = Number.NaN
      return this
    }

    const { a, b, c, d, e, f } = this

    this.a = d / determinant
    this.b = -b / determinant
    this.c = -c / determinant
    this.d = a / determinant
    this.e = (c * f - d * e) / determinant
    this.f = (b * e - a * f) / determinant

    return this
  }

  clone(): PdfJsDomMatrixPolyfill {
    return new PdfJsDomMatrixPolyfill([this.a, this.b, this.c, this.d, this.e, this.f])
  }
}

function ensurePdfJsRuntimePolyfills(): void {
  const scope = globalThis as Record<string, unknown>

  if (typeof scope.DOMMatrix === 'undefined') {
    scope.DOMMatrix = PdfJsDomMatrixPolyfill
  }
}

function configurePdfJsWorker(pdfjs: {
  GlobalWorkerOptions: {
    workerSrc: string
  }
}): void {
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
}

function normalizeExtractedText(value: string): string | null {
  const normalized = value
    // eslint-disable-next-line no-control-regex -- Null bytes are valid in PDF text extraction
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized || null
}

function classifyBlockKind(text: string): ResumeDocumentBlock['kind'] {
  if (/@|linkedin\.com|github\.com/i.test(text)) {
    return 'contact'
  }

  if (text === text.toUpperCase() && text.length <= 48) {
    return 'heading'
  }

  if (/^(?:[-*•])/u.test(text)) {
    return 'list_item'
  }

  return 'paragraph'
}

function classifySectionHint(text: string): ResumeDocumentBlock['sectionHint'] {
  const normalized = text.toLowerCase()

  if (/(experience|employment)/.test(normalized)) return 'experience'
  if (/(education|university|degree)/.test(normalized)) return 'education'
  if (/(certification|certificate)/.test(normalized)) return 'certifications'
  if (/(skills|react|typescript|javascript|figma|python)/.test(normalized)) return 'skills'
  if (/(project|portfolio)/.test(normalized)) return 'projects'
  if (/(language|english|german|albanian)/.test(normalized)) return 'languages'
  if (/@|linkedin\.com|github\.com|phone|email/.test(normalized)) return 'contact'
  if (text.length >= 48) return 'summary'
  if (text.length <= 80) return 'identity'
  return 'other'
}

function buildBundleFromText(input: {
  bundleId: string
  runId: string
  sourceResumeId: string
  sourceFileKind: ResumeDocumentBundle['sourceFileKind']
  parserKind: ResumeDocumentBundle['primaryParserKind']
  text: string | null
  warnings?: string[]
}): ResumeDocumentBundle {
  const fullText = normalizeExtractedText(input.text ?? '')
  const paragraphs = (fullText ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  return ResumeDocumentBundleSchema.parse({
    id: input.bundleId,
    runId: input.runId,
    sourceResumeId: input.sourceResumeId,
    sourceFileKind: input.sourceFileKind,
    primaryParserKind: input.parserKind,
    parserKinds: [input.parserKind],
    createdAt: new Date().toISOString(),
    warnings: input.warnings ?? [],
    pages: [
      {
        pageNumber: 1,
        text: fullText,
        charCount: fullText?.length ?? 0,
        parserKinds: [input.parserKind],
        usedOcr: false
      }
    ],
    blocks: paragraphs.map((entry, index) => ({
      id: `block_${index + 1}`,
      pageNumber: 1,
      readingOrder: index,
      text: entry,
      kind: index === 0 ? 'heading' : classifyBlockKind(entry),
      sectionHint: index === 0 ? 'identity' : classifySectionHint(entry),
      bbox: null,
      sourceParserKinds: [input.parserKind],
      sourceConfidence: 1
    })),
    fullText
  })
}

async function extractPlainText(filePath: string): Promise<string | null> {
  return normalizeExtractedText(await readFile(filePath, 'utf8'))
}

type PdfTextItem = {
  str: string
  dir: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL: boolean
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    item !== null &&
    typeof item === 'object' &&
    'str' in item &&
    typeof (item as Record<string, unknown>).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as Record<string, unknown>).transform)
  )
}

function groupTextItemsIntoLines(items: PdfTextItem[]): string[] {
  const yTolerance = 3
  const lineMap = new Map<number, PdfTextItem[]>()

  for (const item of items) {
    const itemY = item.transform[5]
    if (typeof itemY !== 'number') continue

    let foundGroup = false

    for (const groupY of lineMap.keys()) {
      if (Math.abs(itemY - groupY) <= yTolerance) {
        lineMap.get(groupY)?.push(item)
        foundGroup = true
        break
      }
    }

    if (!foundGroup) {
      lineMap.set(itemY, [item])
    }
  }

  const sortedY = Array.from(lineMap.keys()).sort((a, b) => (b ?? 0) - (a ?? 0))

  return sortedY.map((lineY) => {
    const lineItems = lineMap.get(lineY) ?? []
    lineItems.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
    return lineItems.map((item) => item.str).join('')
  })
}

async function extractPdfText(filePath: string): Promise<string | null> {
  ensurePdfJsRuntimePolyfills()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  configurePdfJsWorker(pdfjs)
  const rawBytes = await readFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(rawBytes),
    useWorkerFetch: false,
    isEvalSupported: false
  })
  const document = await loadingTask.promise
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const textItems = textContent.items.filter(isPdfTextItem)
      const lines = groupTextItemsIntoLines(textItems)
      const pageText = lines.filter((line) => line.trim()).join('\n')

      if (pageText.trim()) {
        pageTexts.push(pageText)
      }
    }
  } finally {
    await document.destroy()
  }

  return normalizeExtractedText(pageTexts.join('\n\n'))
}

async function extractPdfDocumentBundleWithPdfJs(filePath: string, input: {
  bundleId: string
  runId: string
  sourceResumeId: string
}): Promise<ResumeDocumentBundle> {
  ensurePdfJsRuntimePolyfills()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  configurePdfJsWorker(pdfjs)
  const rawBytes = await readFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(rawBytes),
    useWorkerFetch: false,
    isEvalSupported: false
  })
  const document = await loadingTask.promise
  const pages: ResumeDocumentBundle['pages'] = []
  const blocks: ResumeDocumentBundle['blocks'] = []
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const textItems = textContent.items.filter(isPdfTextItem)
      const lines = groupTextItemsIntoLines(textItems).filter((line) => line.trim())
      const pageText = normalizeExtractedText(lines.join('\n'))

      pages.push({
        pageNumber,
        text: pageText,
        charCount: pageText?.length ?? 0,
        parserKinds: ['pdfjs_text'],
        usedOcr: false
      })

      if (pageText) {
        pageTexts.push(pageText)
      }

      lines.forEach((line, index) => {
        blocks.push({
          id: `page_${pageNumber}_block_${index + 1}`,
          pageNumber,
          readingOrder: index,
          text: line,
          kind: classifyBlockKind(line),
          sectionHint: classifySectionHint(line),
          bbox: null,
          sourceParserKinds: ['pdfjs_text'],
          sourceConfidence: 0.72
        })
      })
    }
  } finally {
    await document.destroy()
  }

  return ResumeDocumentBundleSchema.parse({
    id: input.bundleId,
    runId: input.runId,
    sourceResumeId: input.sourceResumeId,
    sourceFileKind: 'pdf',
    primaryParserKind: 'pdfjs_text',
    parserKinds: ['pdfjs_text'],
    createdAt: new Date().toISOString(),
    warnings: [],
    pages,
    blocks,
    fullText: normalizeExtractedText(pageTexts.join('\n\n'))
  })
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  ensurePdfJsRuntimePolyfills()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  configurePdfJsWorker(pdfjs)
  const rawBytes = await readFile(filePath)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(rawBytes),
    useWorkerFetch: false,
    isEvalSupported: false
  })
  const document = await loadingTask.promise

  try {
    return document.numPages
  } finally {
    await document.destroy()
  }
}

async function extractDocxText(filePath: string): Promise<string | null> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return normalizeExtractedText(result.value)
}

export async function extractResumeDocument(filePath: string, input: {
  bundleId: string
  runId: string
  sourceResumeId: string
}): Promise<{
  bundle: ResumeDocumentBundle
  textContent: string | null
  warnings: string[]
}> {
  const extension = path.extname(filePath).toLowerCase()

  if (['.txt', '.md', '.markdown'].includes(extension)) {
    const parserKind = extension === '.txt' ? 'plain_text' : 'plain_text'
    const sourceFileKind = extension === '.txt' ? 'plain_text' : 'markdown'
    const textContent = await extractPlainText(filePath)
    const bundle = buildBundleFromText({
      ...input,
      sourceFileKind,
      parserKind,
      text: textContent
    })

    return {
      bundle,
      textContent: bundle.fullText,
      warnings: bundle.warnings
    }
  }

  if (extension === '.pdf') {
    const bundle = process.platform === 'darwin'
      ? await extractPdfDocumentBundleWithMacOs(filePath, input)
      : await extractPdfDocumentBundleWithPdfJs(filePath, input)

    return {
      bundle,
      textContent: bundle.fullText,
      warnings: bundle.warnings
    }
  }

  if (extension === '.docx') {
    const textContent = process.platform === 'darwin'
      ? await extractDocxTextWithTextutil(filePath).catch(() => extractDocxText(filePath))
      : await extractDocxText(filePath)
    const parserKind = process.platform === 'darwin' ? 'textutil_docx' : 'mammoth'
    const bundle = buildBundleFromText({
      ...input,
      sourceFileKind: 'docx',
      parserKind,
      text: textContent
    })

    return {
      bundle,
      textContent: bundle.fullText,
      warnings: bundle.warnings
    }
  }

  const bundle = buildBundleFromText({
    ...input,
    sourceFileKind: 'unknown',
    parserKind: 'plain_text',
    text: null,
    warnings: ['This file type is stored locally, but automatic text extraction is not available yet.']
  })

  return {
    bundle,
    textContent: null,
    warnings: bundle.warnings
  }
}

export async function extractResumeText(filePath: string): Promise<{
  textContent: string | null
  warnings: string[]
}> {
  const extracted = await extractResumeDocument(filePath, {
    bundleId: `bundle_${Date.now()}`,
    runId: `run_${Date.now()}`,
    sourceResumeId: `resume_${Date.now()}`
  })

  return {
    textContent: extracted.textContent,
    warnings: extracted.warnings
  }
}
