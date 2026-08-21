import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const workspacePackages = {
  '@securevault/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
  '@securevault/db': resolve(__dirname, '../../packages/db/src/index.ts'),
  '@securevault/core': resolve(__dirname, '../../packages/core/src/index.ts')
}

const nodeOnlyExternal = [
  'electron',
  '@prisma/client',
  '@prisma/adapter-mssql',
  'argon2',
  'keytar',
  'mssql'
]

function isNodeExternal(id: string): boolean {
  if (id.startsWith('@securevault/')) return false
  if (nodeOnlyExternal.includes(id)) return true
  if (id.startsWith('@prisma/')) return true
  return false
}

export default defineConfig({
  main: {
    resolve: {
      alias: workspacePackages
    },
    ssr: {
      noExternal: [/@securevault\/.*/]
    },
    build: {
      rollupOptions: {
        external: isNodeExternal
      }
    }
  },
  preload: {
    resolve: {
      alias: workspacePackages
    },
    ssr: {
      noExternal: [/@securevault\/.*/]
    },
    // Sandboxed preload cannot require() node_modules at runtime — bundle everything.
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...workspacePackages,
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
