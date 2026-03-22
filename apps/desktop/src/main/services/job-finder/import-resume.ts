import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { JobFinderWorkspaceSnapshotSchema } from '@unemployed/contracts'
import { extractResumeText } from '../../adapters/resume-document'
import { getJobFinderWorkspaceService } from './workspace-service'
import { getJobFinderDocumentsDirectory } from './paths'

export async function importResumeFromSourcePath(sourcePath: string) {
  const targetDirectory = getJobFinderDocumentsDirectory()
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  await mkdir(targetDirectory, { recursive: true })

  const extractedResume = await extractResumeText(sourcePath)
  const timestamp = Date.now()
  const fileName = path.basename(sourcePath)
  const targetPath = path.join(targetDirectory, `${timestamp}_${fileName}`)

  await copyFile(sourcePath, targetPath)

  const currentSnapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot()
  const savedSnapshot = await jobFinderWorkspaceService.saveProfile({
    ...currentSnapshot.profile,
    baseResume: {
      id: `resume_${timestamp}`,
      fileName,
      uploadedAt: new Date(timestamp).toISOString(),
      storagePath: targetPath,
      textContent: extractedResume.textContent,
      textUpdatedAt: extractedResume.textContent ? new Date(timestamp).toISOString() : null,
      extractionStatus: extractedResume.textContent ? 'not_started' : 'needs_text',
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
  })

  if (!extractedResume.textContent) {
    return JobFinderWorkspaceSnapshotSchema.parse(savedSnapshot)
  }

  const analyzedSnapshot = await jobFinderWorkspaceService.analyzeProfileFromResume()
  return JobFinderWorkspaceSnapshotSchema.parse(analyzedSnapshot)
}
