import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

function manualChunks(id) {
  const normalizedId = String(id || '').replace(/\\/g, '/')
  if (!normalizedId.includes('node_modules')) return undefined

  if (normalizedId.includes('/@vicons/')) return 'vendor-icons'

  if (
    normalizedId.includes('/vue/') ||
    normalizedId.includes('/vue-router/') ||
    normalizedId.includes('/naive-ui/') ||
    normalizedId.includes('/css-render/') ||
    normalizedId.includes('/@css-render/') ||
    normalizedId.includes('/vooks/') ||
    normalizedId.includes('/treemate/') ||
    normalizedId.includes('/vfonts/')
  ) {
    return 'vendor-ui-core'
  }

  if (normalizedId.includes('/md-editor-v3/')) return 'vendor-md-editor'
  if (normalizedId.includes('/markdown-it/')) return 'vendor-markdown-it'
  if (normalizedId.includes('/highlight.js/')) return 'vendor-highlight'
  if (normalizedId.includes('/katex/')) return 'vendor-katex'
  if (normalizedId.includes('/@codemirror/') || normalizedId.includes('/codemirror/')) return 'vendor-codemirror'

  if (normalizedId.includes('/pdfjs-dist/')) return 'vendor-pdfjs'
  if (normalizedId.includes('/mammoth/')) return 'vendor-mammoth'
  if (normalizedId.includes('/xlsx/')) return 'vendor-xlsx'
  if (normalizedId.includes('/jszip/')) return 'vendor-jszip'

  return undefined
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    sourcemap: false, // 禁止生成source map
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
})
