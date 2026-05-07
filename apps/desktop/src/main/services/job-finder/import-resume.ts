import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  JobFinderWorkspaceSnapshotSchema,
  type ResumeSourceDocument,
} from '@unemployed/contracts'
import { detectResumeDocumentFileKind, extractResumeDocument } from '../../adapters/resume-document'
import { generateResumeVisionImages } from '../../adapters/resume-vision-images'
import { getJobFinderWorkspaceService } from './workspace-service'
import { getJobFinderDocumentsDirectory } from './paths'

export interface ImportResumeFromSourcePathOptions {
  useVision?: boolean
}

export async function importResumeFromSourcePath(
  sourcePath: string,
  options: ImportResumeFromSourcePathOptions = {},
) {
  const targetDirectory = getJobFinderDocumentsDirectory()
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()
  const useVision = options.useVision ?? true

  await mkdir(targetDirectory, { recursive: true })

  const timestamp = Date.now()
  const uploadedAt = new Date(timestamp).toISOString()
  const fileName = path.basename(sourcePath)
  const resumeId = `resume_${timestamp}`
  const targetPath = path.join(targetDirectory, `${timestamp}_${fileName}`)
  const seedRunId = `resume_import_seed_${timestamp}`
  const sourceFileKind = detectResumeDocumentFileKind(targetPath)

  await copyFile(sourcePath, targetPath)
  const extractionInput = {
    bundleId: `resume_bundle_${timestamp}`,
    runId: seedRunId,
    sourceResumeId: resumeId
  }
  const generatedVisionArtifactPromise = useVision
    ? generateResumeVisionImages({
        filePath: targetPath,
        fileKind: sourceFileKind,
        runId: seedRunId,
        sourceResumeId: resumeId,
        artifactId: `resume_vision_artifact_${timestamp}`,
      }).catch((error) => ({
        artifact: null,
        warnings: [
          error instanceof Error
            ? `Local resume image generation failed: ${error.message}`
            : 'Local resume image generation failed before the vision branch could start.',
        ],
      }))
    : Promise.resolve({ artifact: null, warnings: [] })

  const [extractedResume, generatedVisionArtifact] = await Promise.all([
    extractResumeDocument(targetPath, extractionInput),
    generatedVisionArtifactPromise,
  ])
  const visionWarnings = generatedVisionArtifact.warnings
  const extractionStatus = extractedResume.textContent ? 'not_started' : 'needs_text'
  const baseResume: ResumeSourceDocument = {
    id: resumeId,
    fileName,
    uploadedAt,
    storagePath: targetPath,
    textContent: extractedResume.textContent,
    textUpdatedAt: extractedResume.textContent ? uploadedAt : null,
    extractionStatus,
    lastAnalyzedAt: null,
    analysisProviderKind: null,
    analysisProviderLabel: null,
    analysisWarnings:
      extractedResume.warnings.length > 0 || visionWarnings.length > 0
        ? [...extractedResume.warnings, ...visionWarnings]
        : extractedResume.textContent
          ? []
          : ['Paste plain-text resume content below if you want the agent to extract profile details from this file.']
  }

  if (!extractedResume.textContent) {
    const currentSnapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()
    const snapshot = await jobFinderWorkspaceService.saveProfile({
      ...currentSnapshot.profile,
      baseResume: {
        ...baseResume,
        analysisWarnings: [
          ...baseResume.analysisWarnings,
          ...(generatedVisionArtifact.artifact?.pages.length
            ? ['Local resume page images were generated, but this import still needs readable text before profile extraction can run.']
            : []),
        ],
      }
    })

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  }

  const snapshot = await jobFinderWorkspaceService.runResumeImport({
    baseResume,
    documentBundle: extractedResume.bundle,
    importWarnings: [...extractedResume.warnings, ...visionWarnings],
    visionArtifact: generatedVisionArtifact.artifact,
  })

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
}
