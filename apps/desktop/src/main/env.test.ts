import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { getDefaultDesktopEnvPaths, loadDesktopEnvironment, parseDotEnvContent } from './env'

describe('desktop env loader', () => {
  test('parses dotenv content with quotes and comments', () => {
    expect(
      parseDotEnvContent([
        '# comment',
        'UNEMPLOYED_AI_API_KEY=abc123',
        'UNEMPLOYED_AI_MODEL="FelidaeAI-Pro-2.5"',
        "export UNEMPLOYED_AI_BASE_URL='https://ai.automatedpros.link/v1'"
      ].join('\n'))
    ).toEqual({
      UNEMPLOYED_AI_API_KEY: 'abc123',
      UNEMPLOYED_AI_MODEL: 'FelidaeAI-Pro-2.5',
      UNEMPLOYED_AI_BASE_URL: 'https://ai.automatedpros.link/v1'
    })
  })

  test('loads values without overriding existing environment', () => {
    const env: NodeJS.ProcessEnv = {
      UNEMPLOYED_AI_MODEL: 'existing-model'
    }

    loadDesktopEnvironment(env, ['virtual-a.env', 'virtual-b.env'].map((entry) => path.join('Z:/', entry)))

    expect(env.UNEMPLOYED_AI_MODEL).toBe('existing-model')
  })

  test('lists root and desktop env file locations', () => {
    const paths = getDefaultDesktopEnvPaths()

    expect(paths.some((entry) => entry.endsWith(path.join('.env')))).toBe(true)
    expect(paths.some((entry) => entry.endsWith(path.join('.env.local')))).toBe(true)
  })
})
