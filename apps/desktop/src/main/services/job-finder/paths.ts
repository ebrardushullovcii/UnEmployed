import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveDesktopUserDataDirectory } from '../../setup/user-data-directory'

function getUserDataDirectory() {
  return resolveDesktopUserDataDirectory(app)
}

export function getJobFinderWorkspaceFilePath() {
  return path.join(getUserDataDirectory(), 'job-finder-workspace.sqlite')
}

export function getJobFinderDocumentsDirectory() {
  return path.join(getUserDataDirectory(), 'documents', 'resumes')
}

export function getGeneratedResumeDocumentsDirectory() {
  return path.join(getJobFinderDocumentsDirectory(), 'generated')
}

export function getCandidateAssetsDirectory() {
  return path.join(getUserDataDirectory(), 'documents', 'candidate-assets')
}

export function getApplicationDocumentsDirectory() {
  return path.join(getUserDataDirectory(), 'documents', 'application-documents')
}

export function getBrowserAgentProfileDirectory() {
  return path.join(getUserDataDirectory(), 'browser-agent', 'default')
}

export async function ensureJobFinderUserDataDirectory() {
  await mkdir(getUserDataDirectory(), { recursive: true })
}
