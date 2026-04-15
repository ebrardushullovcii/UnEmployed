import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': path.resolve(currentDir, 'apps/desktop/src/renderer/src'),
      '@unemployed/browser-runtime': path.resolve(currentDir, 'packages/browser-runtime/src/index.ts'),
      '@unemployed/contracts': path.resolve(currentDir, 'packages/contracts/src/index.ts'),
      '@unemployed/db': path.resolve(currentDir, 'packages/db/src/index.ts'),
      '@unemployed/job-finder': path.resolve(currentDir, 'packages/job-finder/src/index.ts'),
      '@unemployed/knowledge-base': path.resolve(currentDir, 'packages/knowledge-base/src/index.ts'),
    },
  },
  test: {
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})

