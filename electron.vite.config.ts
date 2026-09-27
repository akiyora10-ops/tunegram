import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('electron/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('electron/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src',
    build: {
      outDir: resolve('out/renderer'),
      // electron-vite leaves the renderer unminified by default; a local app
      // gains nothing from the extra ~500 kB of source in the asar.
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: { index: resolve('src/index.html') }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
