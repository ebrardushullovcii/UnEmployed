import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  JobFinderWorkspaceSnapshotSchema,
  type ResumeSourceDocument,
} from '@unemployed/contracts'
import { extractResumeDocument } from '../../adapters/resume-document'
import { getJobFinderWorkspaceService } from './workspace-service'
import { getJobFinderDocumentsDirectory } from './paths'

export async function importResumeFromSourcePath(sourcePath: string) {
  const targetDirectory = getJobFinderDocumentsDirectory()
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  await mkdir(targetDirectory, { recursive: true })

  const timestamp = Date.now()
  const uploadedAt = new Date(timestamp).toISOString()
  const fileName = path.basename(sourcePath)
  const resumeId = `resume_${timestamp}`
  const targetPath = path.join(targetDirectory, `${timestamp}_${fileName}`)

  await copyFile(sourcePath, targetPath)
  const extractedResume = await extractResumeDocument(targetPath, {
    bundleId: `resume_bundle_${timestamp}`,
    runId: `resume_import_seed_${timestamp}`,
    sourceResumeId: resumeId
  })
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
      extractedResume.warnings.length > 0
        ? extractedResume.warnings
        : extractedResume.textContent
          ? []
          : ['Paste plain-text resume content below if you want the agent to extract profile details from this file.']
  }

  if (!extractedResume.textContent) {
    const currentSnapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()
    const snapshot = await jobFinderWorkspaceService.saveProfile({
      ...currentSnapshot.profile,
      baseResume
    })

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
  }

  const snapshot = await jobFinderWorkspaceService.runResumeImport({
    baseResume,
    documentBundle: extractedResume.bundle,
    importWarnings: extractedResume.warnings
  })

  return JobFinderWorkspaceSnapshotSchema.parse(snapshot)
}
