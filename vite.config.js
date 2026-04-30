import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

function manualChunks(id) {
  const normalizedId = String(id || '').replace(/\\/g, '/')
  if (normalizedId.includes('vite/preload-helper')) return 'vendor-vite-runtime'
  if (!normalizedId.includes('node_modules')) return undefined

  if (normalizedId.includes('/@vicons/')) return 'vendor-icons'

  if (
    normalizedId.includes('/vue/') ||
    normalizedId.includes('/vue-router/')
  ) {
    return 'vendor-vue'
  }

  if (
    normalizedId.includes('/css-render/') ||
    normalizedId.includes('/@css-render/') ||
    normalizedId.includes('/vooks/') ||
    normalizedId.includes('/treemate/') ||
    normalizedId.includes('/vdirs/') ||
    normalizedId.includes('/evtd/') ||
    normalizedId.includes('/seemly/') ||
    normalizedId.includes('/vfonts/')
  ) {
    return 'vendor-naive-support'
  }

  if (normalizedId.includes('/date-fns/')) return 'vendor-date'
  if (normalizedId.includes('/lodash-es/')) return 'vendor-lodash'

  if (normalizedId.includes('/md-editor-v3/')) return 'vendor-md-editor'
  if (
    normalizedId.includes('/markdown-it/') ||
    normalizedId.includes('/markdown-it-image-figures/') ||
    normalizedId.includes('/markdown-it-sub/') ||
    normalizedId.includes('/markdown-it-sup/') ||
    normalizedId.includes('/linkify-it/') ||
    normalizedId.includes('/mdurl/') ||
    normalizedId.includes('/uc.micro/')
  ) {
    return 'vendor-markdown-it'
  }
  if (normalizedId.includes('/highlight.js/lib/languages/')) {
    const languageName = normalizedId.split('/highlight.js/lib/languages/')[1] || ''
    const first = languageName.charAt(0).toLowerCase()
    if (first >= 'a' && first <= 'f') return 'vendor-highlight-languages-a-f'
    if (first >= 'g' && first <= 'm') return 'vendor-highlight-languages-g-m'
    if (first >= 'n' && first <= 's') return 'vendor-highlight-languages-n-s'
    return 'vendor-highlight-languages-t-z'
  }
  if (normalizedId.includes('/highlight.js/')) return 'vendor-highlight-core'
  if (normalizedId.includes('/katex/')) return 'vendor-katex'
  if (
    normalizedId.includes('/@codemirror/state/') ||
    normalizedId.includes('/@codemirror/view/') ||
    normalizedId.includes('/style-mod/') ||
    normalizedId.includes('/w3c-keyname/') ||
    normalizedId.includes('/crelt/')
  ) {
    return 'vendor-codemirror-core'
  }
  if (
    normalizedId.includes('/@codemirror/autocomplete/') ||
    normalizedId.includes('/@codemirror/commands/') ||
    normalizedId.includes('/@codemirror/search/') ||
    normalizedId.includes('/@codemirror/lint/')
  ) {
    return 'vendor-codemirror-tools'
  }
  if (
    normalizedId.includes('/@codemirror/language-data/')
  ) {
    return 'vendor-codemirror-language-data'
  }
  if (normalizedId.includes('/@codemirror/legacy-modes/mode/')) {
    const modeName = normalizedId.split('/@codemirror/legacy-modes/mode/')[1] || ''
    const first = modeName.charAt(0).toLowerCase()
    if (first >= 'a' && first <= 'f') return 'vendor-codemirror-legacy-a-f'
    if (first >= 'g' && first <= 'm') return 'vendor-codemirror-legacy-g-m'
    if (first >= 'n' && first <= 's') return 'vendor-codemirror-legacy-n-s'
    return 'vendor-codemirror-legacy-t-z'
  }
  if (normalizedId.includes('/@codemirror/legacy-modes/')) return 'vendor-codemirror-legacy-core'
  if (
    normalizedId.includes('/@codemirror/lang-html/') ||
    normalizedId.includes('/@codemirror/lang-css/') ||
    normalizedId.includes('/@codemirror/lang-javascript/') ||
    normalizedId.includes('/@codemirror/lang-json/') ||
    normalizedId.includes('/@codemirror/lang-xml/') ||
    normalizedId.includes('/@codemirror/lang-vue/') ||
    normalizedId.includes('/@codemirror/lang-angular/') ||
    normalizedId.includes('/@lezer/html/') ||
    normalizedId.includes('/@lezer/css/') ||
    normalizedId.includes('/@lezer/javascript/') ||
    normalizedId.includes('/@lezer/json/') ||
    normalizedId.includes('/@lezer/xml/')
  ) {
    return 'vendor-codemirror-lang-web'
  }
  if (
    normalizedId.includes('/@codemirror/lang-markdown/') ||
    normalizedId.includes('/@codemirror/lang-python/') ||
    normalizedId.includes('/@codemirror/lang-sql/') ||
    normalizedId.includes('/@codemirror/lang-yaml/') ||
    normalizedId.includes('/@lezer/markdown/') ||
    normalizedId.includes('/@lezer/python/') ||
    normalizedId.includes('/@lezer/yaml/')
  ) {
    return 'vendor-codemirror-lang-common'
  }
  if (
    normalizedId.includes('/@codemirror/language/') ||
    normalizedId.includes('/@lezer/common/') ||
    normalizedId.includes('/@lezer/highlight/') ||
    normalizedId.includes('/@lezer/lr/')
  ) {
    return 'vendor-codemirror-language'
  }
  if (
    normalizedId.includes('/@codemirror/lang-') ||
    normalizedId.includes('/@codemirror/language-data/') ||
    normalizedId.includes('/@codemirror/legacy-modes/') ||
    normalizedId.includes('/@lezer/')
  ) {
    return 'vendor-codemirror-lang-extra'
  }
  if (normalizedId.includes('/@codemirror/') || normalizedId.includes('/codemirror/')) return 'vendor-codemirror-misc'

  if (normalizedId.includes('/zrender/')) return 'vendor-echarts-zrender'
  if (normalizedId.includes('/echarts/')) return 'vendor-echarts'

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
