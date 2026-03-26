import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const browserRuntimePath = path.resolve(currentDir, '../../packages/browser-runtime/src/index.ts')
const contractsPath = path.resolve(currentDir, '../../packages/contracts/src/index.ts')
const dbPath = path.resolve(currentDir, '../../packages/db/src/index.ts')
const jobFinderPath = path.resolve(currentDir, '../../packages/job-finder/src/index.ts')

const workspaceAliases = {
  '@unemployed/browser-runtime': browserRuntimePath,
  '@unemployed/contracts': contractsPath,
  '@unemployed/db': dbPath,
  '@unemployed/job-finder': jobFinderPath
}

export default defineConfig({
  main: {
    resolve: {
      alias: workspaceAliases
    },
    build: {
      rollupOptions: {
        external: ['playwright', 'playwright-core', 'chromium-bidi']
      }
    }
  },
  preload: {
    resolve: {
      alias: workspaceAliases
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...workspaceAliases,
        '@renderer': path.resolve(currentDir, 'src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react()] as never
  }
})
