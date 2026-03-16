import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const contractsPath = path.resolve(currentDir, '../../packages/contracts/src/index.ts')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@unemployed/contracts': contractsPath
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@unemployed/contracts': contractsPath
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@unemployed/contracts': contractsPath,
        '@renderer': path.resolve(currentDir, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
