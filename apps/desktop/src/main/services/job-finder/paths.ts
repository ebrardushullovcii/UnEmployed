import { app } from 'electron'
import path from 'node:path'

function getUserDataDirectory() {
  return process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')
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

export function getBrowserAgentProfileDirectory() {
  return path.join(getUserDataDirectory(), 'browser-agent', 'default')
}
