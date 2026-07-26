import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ensureJobFinderUserDataDirectory } from './paths'

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
})
