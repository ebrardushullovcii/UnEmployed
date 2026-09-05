import { app } from 'electron'
import path from 'node:path'

function getUserDataDirectory() {
  return process.env.UNEMPLOYED_USER_DATA_DIR ?? app.getPath('userData')
}

export function getInterviewHelperWorkspaceFilePath() {
  return path.join(getUserDataDirectory(), 'interview-helper-workspace.json')
}

export function getInterviewHelperTemporaryScreenshotDirectory() {
  return path.join(getUserDataDirectory(), 'interview-helper-screenshots', 'temporary')
}
