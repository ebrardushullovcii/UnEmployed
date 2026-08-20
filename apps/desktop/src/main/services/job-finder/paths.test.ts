import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ensureJobFinderUserDataDirectory,
  getApplicationDocumentsDirectory,
  getBrowserAgentProfileDirectory,
  getCandidateAssetsDirectory,
  getGeneratedResumeDocumentsDirectory,
  getJobFinderDocumentsDirectory,
  getJobFinderWorkspaceFilePath,
} from './paths'

const originalUserDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR

afterEach(() => {
  if (originalUserDataDirectory === undefined) {
    delete process.env.UNEMPLOYED_USER_DATA_DIR
  } else {
    process.env.UNEMPLOYED_USER_DATA_DIR = originalUserDataDirectory
  }
})

describe('ensureJobFinderUserDataDirectory', () => {
  test('creates a brand-new nested user-data directory before SQLite opens', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'unemployed-fresh-user-'))
    const userDataDirectory = path.join(temporaryRoot, 'new-profile', 'data')
    process.env.UNEMPLOYED_USER_DATA_DIR = userDataDirectory

    try {
      await ensureJobFinderUserDataDirectory()
      expect((await stat(userDataDirectory)).isDirectory()).toBe(true)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test('uses one resolved root for every Job Finder persistence path', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'unemployed-canonical-user-'))
    const userDataDirectory = path.join(temporaryRoot, 'new-profile', 'data')
    const relativeOverride = path.relative(process.cwd(), userDataDirectory)
    process.env.UNEMPLOYED_USER_DATA_DIR = `  ${relativeOverride}  `

    try {
      const resolvedUserDataDirectory = path.resolve(userDataDirectory)

      expect(getJobFinderWorkspaceFilePath()).toBe(
        path.join(resolvedUserDataDirectory, 'job-finder-workspace.sqlite'),
      )
      expect(getJobFinderDocumentsDirectory()).toBe(
        path.join(resolvedUserDataDirectory, 'documents', 'resumes'),
      )
      expect(getGeneratedResumeDocumentsDirectory()).toBe(
        path.join(resolvedUserDataDirectory, 'documents', 'resumes', 'generated'),
      )
      expect(getCandidateAssetsDirectory()).toBe(
        path.join(resolvedUserDataDirectory, 'documents', 'candidate-assets'),
      )
      expect(getApplicationDocumentsDirectory()).toBe(
        path.join(resolvedUserDataDirectory, 'documents', 'application-documents'),
      )
      expect(getBrowserAgentProfileDirectory()).toBe(
        path.join(resolvedUserDataDirectory, 'browser-agent', 'default'),
      )

      await ensureJobFinderUserDataDirectory()
      expect((await stat(resolvedUserDataDirectory)).isDirectory()).toBe(true)
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
