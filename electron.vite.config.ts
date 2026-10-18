import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    resolve: {
      alias: { '@shared': resolve(root, 'src/shared') }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': resolve(root, 'src/shared') }
    },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rolldownOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
        '@renderer': resolve(root, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
