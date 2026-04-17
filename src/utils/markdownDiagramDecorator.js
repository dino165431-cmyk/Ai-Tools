import { copyTextToClipboard } from '@/utils/clipboard'
import { ensureMarkdownPreviewRuntime } from '@/utils/mdEditorRuntime'
import {
  buildDiagramFenceMetaMap,
  getDiagramFenceMetaForLine,
  normalizeDiagramSizeMeta
} from '@/utils/diagramFenceMeta'
import '@/styles/markdownDiagramDecorator.css'

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildExportFileName(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isPixelDimension(value) {
  return /^\d+(?:\.\d+)?px$/i.test(String(value || '').trim())
}

function parsePixelDimensionValue(value) {
  if (!isPixelDimension(value)) return 0
  const parsed = Number.parseFloat(String(value || '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error('\u65e0\u6cd5\u521b\u5efa\u753b\u5e03\u4e0a\u4e0b\u6587'))
      return
    }

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG \u751f\u6210\u5931\u8d25'))
          return
        }
        resolve(blob)
      }, 'image/png')
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function copyBlobToClipboard(blob) {
  if (!blob) throw new Error('\u56fe\u7247\u6570\u636e\u4e3a\u7a7a')
  if (!navigator?.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5199\u5165\u56fe\u7247\u5230\u526a\u8d34\u677f')
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob
    })
  ])
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function parseSvgViewBoxSize(svg) {
  const viewBox = String(svg?.getAttribute?.('viewBox') || '').trim()
  if (!viewBox) return { width: 0, height: 0 }

  const parts = viewBox
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))

  if (parts.length !== 4) return { width: 0, height: 0 }

  return {
    width: Math.max(0, parts[2]),
    height: Math.max(0, parts[3])
  }
}

function resolveSvgRasterSize(svg) {
  const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 }
  if (rect.width > 0 && rect.height > 0) {
    return {
      width: Math.max(1, Math.ceil(rect.width)),
      height: Math.max(1, Math.ceil(rect.height))
    }
  }

  const viewBoxSize = parseSvgViewBoxSize(svg)
  if (viewBoxSize.width > 0 && viewBoxSize.height > 0) {
    return {
      width: Math.max(1, Math.ceil(viewBoxSize.width)),
      height: Math.max(1, Math.ceil(viewBoxSize.height))
    }
  }

  const width = Number.parseFloat(String(svg?.getAttribute?.('width') || '0'))
  const height = Number.parseFloat(String(svg?.getAttribute?.('height') || '0'))
  return {
    width: Math.max(1, Math.ceil(Number.isFinite(width) && width > 0 ? width : 800)),
    height: Math.max(1, Math.ceil(Number.isFinite(height) && height > 0 ? height : 600))
  }
}

function parseSvgInput(svgInput) {
  if (typeof svgInput === 'string') {
    const doc = new DOMParser().parseFromString(svgInput, 'image/svg+xml')
    const svg = doc.documentElement
    if (!svg || String(svg.nodeName || '').toLowerCase() !== 'svg') {
      throw new Error('SVG \u89e3\u6790\u5931\u8d25')
    }
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }
    return svg
  }

  if (!svgInput) {
    throw new Error('SVG \u4e0d\u5b58\u5728')
  }

  return svgInput
}

function createOffscreenRenderHost({ width = 1200, height = 800 } = {}) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '-20000px'
  host.style.top = '0'
  host.style.width = `${Math.max(1, Math.ceil(width))}px`
  host.style.height = `${Math.max(1, Math.ceil(height))}px`
  host.style.pointerEvents = 'none'
  host.style.opacity = '0'
  host.style.overflow = 'hidden'
  host.style.zIndex = '-1'
  document.body.appendChild(host)
  return host
}

function cloneMermaidConfig(config) {
  if (!config || typeof config !== 'object') return null
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(config)
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(JSON.stringify(config))
  } catch {
    return null
  }
}

function normalizeMermaidExportSource(source) {
  const text = String(source || '')
  if (!text.trim()) return text

  const replacements = [
    [/^(\s*)xychart(\s|$)/, '$1xychart-beta$2'],
    [/^(\s*)sankey(\s|$)/, '$1sankey-beta$2'],
    [/^(\s*)radar(\s|$)/, '$1radar-beta$2'],
    [/^(\s*)block(\s|$)/, '$1block-beta$2']
  ]

  let next = text
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement)
      break
    }
  }

  return next
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('\u8bfb\u53d6\u56fe\u8868\u8d44\u6e90\u5931\u8d25'))
    reader.readAsDataURL(blob)
  })
}

function sanitizeSvgCssText(cssText) {
  return String(cssText || '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\(([^)]+)\)/gi, (match, rawValue) => {
      const value = String(rawValue || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')

      if (!value) return 'none'
      if (value.startsWith('#') || value.startsWith('data:')) return match
      return 'none'
    })
}

function isExternalSvgReference(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.startsWith('#') || text.startsWith('data:')) return false
  return true
}

function sanitizeSvgTree(svgInput, { aggressive = false } = {}) {
  const svg = parseSvgInput(svgInput)

  svg.querySelectorAll('script').forEach((node) => node.remove())
  if (aggressive) {
    svg.querySelectorAll('foreignObject').forEach((node) => node.remove())
  }

  Array.from(svg.querySelectorAll('*')).forEach((node) => {
    const tagName = String(node.nodeName || '').toLowerCase()

    if (tagName === 'style') {
      node.textContent = sanitizeSvgCssText(node.textContent || '')
      return
    }

    if (node.hasAttribute('style')) {
      node.setAttribute('style', sanitizeSvgCssText(node.getAttribute('style')))
    }

    const href = String(
      node.getAttribute('href') ||
        node.getAttribute('xlink:href') ||
        node.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ||
        ''
    ).trim()

    if (tagName !== 'image' && isExternalSvgReference(href)) {
      node.removeAttribute('href')
      node.removeAttribute('xlink:href')
      node.removeAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
    }

    ;['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start', 'marker-mid', 'marker-end'].forEach(
      (attrName) => {
        const value = String(node.getAttribute(attrName) || '').trim()
        if (!/url\(/i.test(value)) return
        if (/url\(\s*['"]?(#|data:)/i.test(value)) return
        node.removeAttribute(attrName)
      }
    )
  })

  return svg
}

async function inlineSvgExternalAssets(svgInput, options = {}) {
  const stripOnFailure = options.stripOnFailure === true
  const svg = parseSvgInput(svgInput)
  const imageNodes = Array.from(svg.querySelectorAll('image'))
  if (!imageNodes.length) return svg

  const assetCache = new Map()
  await Promise.all(
    imageNodes.map(async (node) => {
      const href = String(
        node.getAttribute('href') ||
          node.getAttribute('xlink:href') ||
          node.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ||
          ''
      ).trim()

      if (!href || href.startsWith('data:')) return

      if (!assetCache.has(href)) {
        assetCache.set(
          href,
          fetch(href)
            .then((response) => {
              if (!response.ok) {
                throw new Error(`\u8d44\u6e90\u8bf7\u6c42\u5931\u8d25 (${response.status})`)
              }
              return response.blob()
            })
            .then((blob) => readBlobAsDataUrl(blob))
            .catch((err) => {
              if (stripOnFailure) {
                return null
              }
              throw new Error(`\u56fe\u8868\u5f15\u7528\u7684\u8d44\u6e90\u65e0\u6cd5\u5bfc\u51fa\uff1a${href}${err?.message ? `\uff0c${err.message}` : ''}`)
            })
        )
      }

      const dataUrl = await assetCache.get(href)
      if (!dataUrl) {
        if (stripOnFailure) {
          node.remove()
          return
        }
        return
      }
      node.setAttribute('href', dataUrl)
      node.setAttribute('xlink:href', dataUrl)
    })
  )

  return svg
}

async function renderMermaidSvgForExport(source, theme, size = null) {
  const normalizedSource = normalizeMermaidExportSource(source).trim()
  if (!normalizedSource) {
    throw new Error('Mermaid \u6e90\u7801\u4e3a\u7a7a')
  }

  const mermaidMod = await import('mermaid')
  const mermaid = mermaidMod?.default || mermaidMod
  if (!mermaid?.render || !mermaid?.initialize) {
    throw new Error('Mermaid \u9884\u89c8\u751f\u6210\u5931\u8d25')
  }

  const renderHost = createOffscreenRenderHost()
  const previousConfig = cloneMermaidConfig(mermaid?.mermaidAPI?.getConfig?.())

  try {
    mermaid.initialize({
      ...(previousConfig || {}),
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: {
        ...(previousConfig?.flowchart || {}),
        htmlLabels: false
      }
    })

    const { svg } = await mermaid.render(`diagram-preview-export-${Date.now()}`, normalizedSource, renderHost)
    if (!svg) throw new Error('\u672a\u751f\u6210 Mermaid SVG')

    if (!size) return svg

    const svgNode = parseSvgInput(svg)
    const normalizedSize = normalizeDiagramSize(size)
    svgNode.setAttribute('width', String(normalizedSize.width))
    svgNode.setAttribute('height', String(normalizedSize.height))
    return new XMLSerializer().serializeToString(svgNode)
  } finally {
    renderHost.remove()
    if (previousConfig) {
      mermaid.initialize(previousConfig)
    }
  }
}

function waitForNextFrame(count = 1) {
  let remaining = Math.max(1, Number(count) || 1)
  return new Promise((resolve) => {
    const step = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function normalizeDiagramSize(size = {}) {
  const width = Number(size?.width || 0)
  const height = Number(size?.height || 0)
  return {
    width: Math.max(240, Math.ceil(Number.isFinite(width) && width > 0 ? width : 960)),
    height: Math.max(180, Math.ceil(Number.isFinite(height) && height > 0 ? height : 540))
  }
}

function measureDiagramRenderSize(node) {
  const svg = node.querySelector?.('svg') || null
  if (svg) {
    return resolveSvgRasterSize(svg)
  }

  const canvas = node.querySelector?.('canvas') || null
  if (canvas) {
    const rect = canvas.getBoundingClientRect?.() || { width: 0, height: 0 }
    if (rect.width > 0 && rect.height > 0) {
      return rect
    }
    return {
      width: canvas.width || 960,
      height: canvas.height || 540
    }
  }

  const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 }
  return rect
}

function resolveDiagramRenderSize(node, kind = 'default') {
  if (!node) return normalizeDiagramSize()

  const measuredSize = measureDiagramRenderSize(node)
  const explicitWidth = parsePixelDimensionValue(node?.dataset?.aiToolsDiagramWidth)
  const explicitHeight = parsePixelDimensionValue(node?.dataset?.aiToolsDiagramHeight)

  if (!explicitWidth && !explicitHeight) {
    return normalizeDiagramSize(measuredSize)
  }

  const nextSize = {
    width: explicitWidth || Number(measuredSize?.width || 0),
    height: explicitHeight || Number(measuredSize?.height || 0)
  }

  const measuredWidth = Number(measuredSize?.width || 0)
  const measuredHeight = Number(measuredSize?.height || 0)
  const hasMeasuredSize = measuredWidth > 0 && measuredHeight > 0

  if (explicitWidth && !explicitHeight && hasMeasuredSize) {
    nextSize.height = measuredHeight * (explicitWidth / measuredWidth)
  } else if (explicitHeight && !explicitWidth && hasMeasuredSize) {
    nextSize.width = measuredWidth * (explicitHeight / measuredHeight)
  }

  return normalizeDiagramSize(nextSize)
}

function parseEchartsOption(source) {
  const text = String(source || '').trim()
  if (!text) {
    throw new Error('ECharts \u914d\u7f6e\u4e3a\u7a7a')
  }

  const candidates = [
    `"use strict"; return (${text})`,
    `"use strict"; return ${text}`,
    `"use strict"; ${text}; return typeof option !== 'undefined' ? option : undefined`
  ]

  let lastError = null
  for (const body of candidates) {
    try {
      const value = new Function(body)()
      if (value && typeof value === 'object') {
        return value
      }
      if (value !== undefined) {
        return value
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('ECharts \u914d\u7f6e\u89e3\u6790\u5931\u8d25')
}

function cloneSerializableFallback(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)

  if (Array.isArray(value)) {
    const arrayClone = []
    seen.set(value, arrayClone)
    value.forEach((item) => {
      if (typeof item === 'function' || typeof item === 'symbol') {
        return
      }
      arrayClone.push(cloneSerializableFallback(item, seen))
    })
    return arrayClone
  }

  const objectClone = {}
  seen.set(value, objectClone)
  Object.keys(value).forEach((key) => {
    const nextValue = value[key]
    if (typeof nextValue === 'function' || typeof nextValue === 'symbol') {
      return
    }
    objectClone[key] = cloneSerializableFallback(nextValue, seen)
  })
  return objectClone
}

function cloneSerializableValue(value) {
  if (value == null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // fall through
    }
  }
  return cloneSerializableFallback(value)
}

function serializeEchartsOption(option) {
  try {
    return JSON.stringify(option, null, 2)
  } catch {
    return ''
  }
}

function normalizeEchartsOptionForExport(optionInput, theme) {
  const option = typeof optionInput === 'string' ? parseEchartsOption(optionInput) : cloneSerializableValue(optionInput)
  if (!option || typeof option !== 'object') {
    throw new Error('ECharts option \u9700\u8981\u8fd4\u56de\u4e00\u4e2a\u5bf9\u8c61')
  }

  const backgroundColor = String(option.backgroundColor || '').trim().toLowerCase()
  if (!backgroundColor || backgroundColor === 'transparent') {
    option.backgroundColor = theme === 'dark' ? '#0f172a' : '#ffffff'
  }

  return option
}

async function loadEchartsModule() {
  await ensureMarkdownPreviewRuntime()
  const echartsMod = await import('echarts')
  return echartsMod?.default || echartsMod
}

function waitForEchartsFinished(chart) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      chart?.off?.('finished', handleFinished)
      clearTimeout(timer)
      resolve()
    }
    const handleFinished = () => finish()
    chart?.on?.('finished', handleFinished)
    const timer = window.setTimeout(finish, 260)
    requestAnimationFrame(() => requestAnimationFrame(finish))
  })
}

function findEchartsInstanceForNode(echarts, node) {
  if (!echarts?.getInstanceByDom || !node) return null

  const directInstance = echarts.getInstanceByDom(node)
  if (directInstance) return directInstance

  const descendants = node.querySelectorAll?.('*') || []
  for (const child of descendants) {
    const instance = echarts.getInstanceByDom(child)
    if (instance) return instance
  }

  return null
}

async function resolveEchartsPayloadFromNode(node) {
  const cachedSource = String(node?.dataset?.aiToolsDiagramSource || '').trim()
  let lastError = null

  if (cachedSource) {
    try {
      return {
        option: parseEchartsOption(cachedSource),
        source: cachedSource
      }
    } catch (err) {
      lastError = err
    }
  }

  const echarts = await loadEchartsModule()
  const chart = findEchartsInstanceForNode(echarts, node)
  const runtimeOption = chart?.getOption?.()
  if (runtimeOption && typeof runtimeOption === 'object') {
    const normalizedOption = cloneSerializableValue(runtimeOption)
    const serializedSource = serializeEchartsOption(normalizedOption)
    if (serializedSource && node?.dataset) {
      node.dataset.aiToolsDiagramSource = serializedSource
    }
    return {
      option: normalizedOption,
      source: serializedSource
    }
  }

  throw lastError instanceof Error ? lastError : new Error('\u672a\u627e\u5230\u53ef\u7528\u7684 ECharts \u914d\u7f6e')
}

async function renderEchartsSvgForExport(optionInput, theme, size = {}) {
  const option = normalizeEchartsOptionForExport(optionInput, theme)
  const { width, height } = normalizeDiagramSize(size)
  const renderHost = createOffscreenRenderHost({ width, height })
  const echarts = await loadEchartsModule()
  const chart = echarts.init(renderHost, theme === 'dark' ? 'dark' : 'light', {
    renderer: 'svg',
    width,
    height
  })

  try {
    chart.resize({ width, height })
    chart.setOption(option, true)
    chart.resize({ width, height })
    chart.getZr?.().refreshImmediately?.()
    await waitForEchartsFinished(chart)
    await waitForNextFrame(1)

    const svg = renderHost.querySelector('svg')
    if (!svg) {
      throw new Error('\u672a\u751f\u6210 ECharts SVG')
    }
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }

    return {
      svgMarkup: svg.outerHTML,
      size: normalizeDiagramSize(resolveSvgRasterSize(svg))
    }
  } finally {
    chart.dispose()
    renderHost.remove()
  }
}

function isCanvasTaintedError(error) {
  const text = String(error?.message || error || '')
  return /tainted canvases/i.test(text) || /security/i.test(text)
}

async function rasterizeSvgToBlobInternal(svgInput, theme, { aggressive = false } = {}) {
  const sourceSvg = parseSvgInput(svgInput)
  const svg = sourceSvg.cloneNode(true)
  const { width, height } = resolveSvgRasterSize(svg)
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1))
  const backgroundColor = theme === 'dark' ? '#0f172a' : '#ffffff'

  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  sanitizeSvgTree(svg, { aggressive })
  await inlineSvgExternalAssets(svg, { stripOnFailure: aggressive })
  sanitizeSvgTree(svg, { aggressive })

  const serialized = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('SVG \u8f6c\u56fe\u7247\u5931\u8d25'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('\u65e0\u6cd5\u521b\u5efa\u753b\u5e03\u4e0a\u4e0b\u6587')
    ctx.scale(scale, scale)
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    ctx.getImageData(0, 0, 1, 1)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function rasterizeSvgToBlob(svgInput, theme) {
  let firstError = null

  try {
    return await rasterizeSvgToBlobInternal(svgInput, theme)
  } catch (err) {
    firstError = err
  }

  try {
    return await rasterizeSvgToBlobInternal(svgInput, theme, { aggressive: true })
  } catch (retryError) {
    if (isCanvasTaintedError(firstError)) {
      throw firstError
    }
    throw retryError instanceof Error ? retryError : firstError
  }
}

async function exportCanvasWithBackground(canvas, theme) {
  if (!canvas) {
    throw new Error('\u672a\u627e\u5230\u53ef\u5bfc\u51fa\u7684\u753b\u5e03')
  }

  const rect = canvas.getBoundingClientRect?.() || { width: 0, height: 0 }
  const width = Math.max(1, Math.ceil(canvas.width || rect.width || 1))
  const height = Math.max(1, Math.ceil(canvas.height || rect.height || 1))
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = width
  outputCanvas.height = height

  const ctx = outputCanvas.getContext('2d')
  if (!ctx) throw new Error('\u65e0\u6cd5\u521b\u5efa\u753b\u5e03\u4e0a\u4e0b\u6587')
  ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(canvas, 0, 0, width, height)

  return canvasToBlob(outputCanvas)
}

function readDiagramNodeText(node) {
  return String(node?.innerText || node?.textContent || '').trim()
}

function cacheDiagramSource(node, source) {
  const text = String(source || '').trim()
  if (node?.dataset && text) {
    node.dataset.aiToolsDiagramSource = text
  }
  return text
}

function buildSourceFromNode(node, kind) {
  if (!node) return ''
  if (node.dataset.aiToolsDiagramSource) return node.dataset.aiToolsDiagramSource

  let source = ''
  if (kind === 'mermaid') {
    source = String(node.dataset.content || '').trim()
  } else if (!node.hasAttribute('data-processed')) {
    source = readDiagramNodeText(node)
  }

  return cacheDiagramSource(node, source)
}

const DIAGRAM_ACTION_ICON_PATHS = {
  source: [
    'M9 8.25 5.25 12 9 15.75',
    'M15 8.25 18.75 12 15 15.75',
    'M13.5 4.5 10.5 19.5'
  ],
  copy: [
    'M15.75 17.25h-6A2.25 2.25 0 0 1 7.5 15v-6a2.25 2.25 0 0 1 2.25-2.25h6A2.25 2.25 0 0 1 18 9v6a2.25 2.25 0 0 1-2.25 2.25Z',
    'M15 6V5.25A2.25 2.25 0 0 0 12.75 3h-6A2.25 2.25 0 0 0 4.5 5.25v6a2.25 2.25 0 0 0 2.25 2.25h.75'
  ],
  download: [
    'M12 3.75v10.5',
    'm7.5 3-7.5 7.5-7.5-7.5',
    'M4.5 19.5h15'
  ],
  zoomOut: [
    'M6.75 12h7.5',
    'M10.5 18.75a8.25 8.25 0 1 1 0-16.5 8.25 8.25 0 0 1 0 16.5Z',
    'M16.5 16.5 21 21'
  ],
  zoomReset: [
    'M4.5 12a7.5 7.5 0 1 0 2.196-5.304',
    'M4.5 4.5v4.5H9',
    'M9 12h3l1.5-2.25L15 12h3'
  ],
  zoomIn: [
    'M10.5 8.25v4.5',
    'M8.25 10.5h4.5',
    'M10.5 18.75a8.25 8.25 0 1 1 0-16.5 8.25 8.25 0 0 1 0 16.5Z',
    'M16.5 16.5 21 21'
  ]
}

function createDiagramActionIcon(iconName) {
  const paths = DIAGRAM_ACTION_ICON_PATHS[iconName] || []
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('note-preview-diagram-action__icon')

  paths.forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  })

  return svg
}

export function createMarkdownDiagramDecorator(options = {}) {
  const message = options.message || null
  const getTheme = typeof options.getTheme === 'function' ? options.getTheme : () => 'light'
  const getMarkdownSource = typeof options.getMarkdownSource === 'function' ? options.getMarkdownSource : () => ''
  let overlayRoot = null
  let overlayTitle = null
  let overlayViewport = null
  let overlaySurface = null
  let overlayCanvas = null
  let overlayZoomValue = null
  let overlayKeydownHandler = null
  let overlayObjectUrl = null
  let overlayDragState = null
  let overlayDragFrame = 0
  let overlayPendingDragPoint = null
  let overlayZoom = 1
  let overlayBaseWidth = 0
  let overlayBaseHeight = 0
  let overlayRenderToken = 0
  let diagramMetaCacheMarkdown = null
  let diagramMetaCache = new Map()

  function getDiagramMetaMap() {
    const markdown = String(getMarkdownSource() || '')
    if (markdown === diagramMetaCacheMarkdown) {
      return diagramMetaCache
    }

    diagramMetaCacheMarkdown = markdown
    diagramMetaCache = buildDiagramFenceMetaMap(markdown)
    return diagramMetaCache
  }

  function resolveDiagramMetaForNode(node, kind) {
    const line = Number(node?.dataset?.line)
    if (Number.isFinite(line)) {
      return getDiagramFenceMetaForLine(getDiagramMetaMap(), kind, line)
    }

    const directSize = normalizeDiagramSizeMeta({
      width: node?.dataset?.aiToolsDiagramWidth,
      height: node?.dataset?.aiToolsDiagramHeight
    })
    return directSize.width || directSize.height ? directSize : null
  }

  function resetDiagramSize(node, kind) {
    if (!node) return
    node.style.removeProperty('width')
    node.style.removeProperty('max-width')
    node.style.removeProperty('height')
    node.style.removeProperty('min-height')
    node.style.removeProperty('aspect-ratio')
    node.style.removeProperty('margin-inline')
    delete node.dataset.aiToolsDiagramSized
    delete node.dataset.aiToolsDiagramWidth
    delete node.dataset.aiToolsDiagramHeight

    if (kind !== 'mermaid') return

    const svg = node.querySelector?.('svg')
    if (!svg) return
    svg.style.removeProperty('width')
    svg.style.removeProperty('height')
    svg.style.removeProperty('max-width')
    svg.style.removeProperty('max-height')
  }

  function applyDiagramSize(node, kind) {
    if (!node) return null

    const meta = resolveDiagramMetaForNode(node, kind)
    const size = normalizeDiagramSizeMeta(meta || {})
    if (!size.width && !size.height) {
      if (node.dataset.aiToolsDiagramSized === 'true') {
        resetDiagramSize(node, kind)
      }
      return null
    }

    node.dataset.aiToolsDiagramSized = 'true'
    node.dataset.aiToolsDiagramWidth = size.width || ''
    node.dataset.aiToolsDiagramHeight = size.height || ''
    node.style.marginInline = 'auto'

    if (size.width) {
      if (isPixelDimension(size.width)) {
        node.style.width = '100%'
        node.style.maxWidth = size.width
      } else {
        node.style.width = size.width
        node.style.maxWidth = '100%'
      }
    } else if (kind === 'echarts') {
      node.style.width = '100%'
      node.style.removeProperty('max-width')
    } else {
      node.style.removeProperty('width')
      node.style.removeProperty('max-width')
    }

    if (size.height) {
      node.style.height = size.height
      node.style.minHeight = size.height
      node.style.aspectRatio = 'auto'
    } else {
      node.style.removeProperty('height')
      node.style.removeProperty('min-height')
      if (kind === 'echarts') {
        node.style.aspectRatio = '4 / 3'
      } else {
        node.style.removeProperty('aspect-ratio')
      }
    }

    if (kind !== 'mermaid') return size

    const svg = node.querySelector?.('svg')
    if (!svg) return size
    svg.style.maxWidth = '100%'
    svg.style.maxHeight = '100%'
    svg.style.width = size.width ? '100%' : 'auto'
    svg.style.height = size.height ? '100%' : 'auto'
    if (!size.height) {
      svg.removeAttribute('height')
    }
    svg.removeAttribute('width')
    return size
  }

  function notifySuccess(text) {
    message?.success?.(text)
  }

  function notifyError(text) {
    message?.error?.(text)
  }

  function releaseOverlayObjectUrl() {
    if (!overlayObjectUrl) return
    URL.revokeObjectURL(overlayObjectUrl)
    overlayObjectUrl = null
  }

  function detachOverlayKeydownHandler() {
    if (!overlayKeydownHandler) return
    window.removeEventListener('keydown', overlayKeydownHandler)
    overlayKeydownHandler = null
  }

  function cancelOverlayDragFrame() {
    if (!overlayDragFrame) return
    cancelAnimationFrame(overlayDragFrame)
    overlayDragFrame = 0
  }

  function updateOverlayZoomLabel() {
    if (!overlayZoomValue) return
    overlayZoomValue.textContent = `${Math.round(overlayZoom * 100)}%`
  }

  function updateOverlayPannableState() {
    if (!overlayViewport || !overlayCanvas) return
    const canPan =
      overlayCanvas.offsetWidth > overlayViewport.clientWidth + 1 ||
      overlayCanvas.offsetHeight > overlayViewport.clientHeight + 1
    overlayViewport.classList.toggle('is-pannable', canPan)
    if (!canPan) {
      overlayViewport.classList.remove('is-dragging')
      overlayDragState = null
    }
  }

  function applyOverlayZoom() {
    if (!overlayCanvas) return

    if (!overlayBaseWidth || !overlayBaseHeight) {
      overlayCanvas.style.width = ''
      overlayCanvas.style.height = ''
      if (overlaySurface) {
        overlaySurface.style.width = ''
        overlaySurface.style.height = ''
      }
      updateOverlayPannableState()
      updateOverlayZoomLabel()
      return
    }

    const scaledWidth = Math.round(overlayBaseWidth * overlayZoom)
    const scaledHeight = Math.round(overlayBaseHeight * overlayZoom)
    overlayCanvas.style.width = `${scaledWidth}px`
    overlayCanvas.style.height = `${scaledHeight}px`
    if (overlaySurface && overlayViewport) {
      const paddedWidth = scaledWidth + 32
      const paddedHeight = scaledHeight + 32
      overlaySurface.style.width = `${Math.max(paddedWidth, overlayViewport.clientWidth)}px`
      overlaySurface.style.height = `${Math.max(paddedHeight, overlayViewport.clientHeight)}px`
    }
    updateOverlayPannableState()
    updateOverlayZoomLabel()
  }

  function setOverlayMessage(text, type = 'info') {
    if (!overlayCanvas) return
    releaseOverlayObjectUrl()
    overlayCanvas.innerHTML = text
      ? `<div class="markdown-diagram-lightbox__status${type === 'error' ? ' is-error' : ''}">${escapeHtml(text)}</div>`
      : ''
    overlayBaseWidth = 0
    overlayBaseHeight = 0
    overlayZoom = 1
    applyOverlayZoom()
  }

  function mountOverlayRenderable(rendered) {
    if (!overlayCanvas || !overlayViewport) return
    const normalizedSize = normalizeDiagramSize(rendered?.size)
    releaseOverlayObjectUrl()
    overlayCanvas.innerHTML = ''
    if (rendered?.objectUrl) {
      overlayObjectUrl = rendered.objectUrl
    }
    overlayCanvas.appendChild(rendered.element)
    overlayBaseWidth = normalizedSize.width
    overlayBaseHeight = normalizedSize.height
    overlayZoom = 1
    applyOverlayZoom()
    requestAnimationFrame(() => {
      if (!overlayViewport) return
      overlayViewport.scrollLeft = Math.max(0, (overlayViewport.scrollWidth - overlayViewport.clientWidth) / 2)
      overlayViewport.scrollTop = Math.max(0, (overlayViewport.scrollHeight - overlayViewport.clientHeight) / 2)
    })
  }

  function updateOverlayZoom(nextScale, anchor = null) {
    if (!overlayViewport || !overlayBaseWidth || !overlayBaseHeight) return

    const clampedScale = clamp(nextScale, 0.5, 4)
    if (Math.abs(clampedScale - overlayZoom) < 0.001) return

    const previousWidth = overlayBaseWidth * overlayZoom
    const previousHeight = overlayBaseHeight * overlayZoom
    const rect = overlayViewport.getBoundingClientRect()
    const anchorOffsetX = anchor?.clientX != null ? anchor.clientX - rect.left : overlayViewport.clientWidth / 2
    const anchorOffsetY = anchor?.clientY != null ? anchor.clientY - rect.top : overlayViewport.clientHeight / 2
    const ratioX = previousWidth > 0 ? (overlayViewport.scrollLeft + anchorOffsetX) / previousWidth : 0.5
    const ratioY = previousHeight > 0 ? (overlayViewport.scrollTop + anchorOffsetY) / previousHeight : 0.5

    overlayZoom = clampedScale
    applyOverlayZoom()

    const nextWidth = overlayBaseWidth * overlayZoom
    const nextHeight = overlayBaseHeight * overlayZoom
    requestAnimationFrame(() => {
      if (!overlayViewport) return
      overlayViewport.scrollLeft = Math.max(0, nextWidth * ratioX - anchorOffsetX)
      overlayViewport.scrollTop = Math.max(0, nextHeight * ratioY - anchorOffsetY)
    })
  }

  function closePreviewOverlay() {
    overlayRenderToken += 1
    overlayDragState = null
    overlayPendingDragPoint = null
    cancelOverlayDragFrame()
    if (!overlayRoot) return
    overlayRoot.classList.remove('is-open', 'is-dark')
    overlayRoot.classList.add('is-hidden')
    overlayViewport?.classList.remove('is-dragging', 'is-pannable')
    setOverlayMessage('')
    if (overlayTitle) overlayTitle.textContent = ''
    detachOverlayKeydownHandler()
  }

  function resolveOverlayZoomAnchor(event) {
    if (!overlayCanvas || !(event?.target instanceof Element)) return null
    if (!event.target.closest('.markdown-diagram-lightbox__canvas')) return null
    return event
  }

  function resolveOverlayPreviewRenderSize(size, kind = 'default') {
    const normalizedSize = normalizeDiagramSize(size)
    if (!overlayViewport || kind !== 'echarts') return normalizedSize

    const availableWidth = Math.max(240, overlayViewport.clientWidth - 40)
    const availableHeight = Math.max(180, overlayViewport.clientHeight - 40)
    const fitScale = Math.min(availableWidth / normalizedSize.width, availableHeight / normalizedSize.height)

    if (!Number.isFinite(fitScale) || fitScale <= 0 || Math.abs(fitScale - 1) < 0.08) {
      return normalizedSize
    }

    return normalizeDiagramSize({
      width: normalizedSize.width * clamp(fitScale, 0.72, 2.2),
      height: normalizedSize.height * clamp(fitScale, 0.72, 2.2)
    })
  }

  function ensurePreviewOverlay() {
    if (overlayRoot) return overlayRoot

    const root = document.createElement('div')
    root.className = 'markdown-diagram-lightbox is-hidden'
    root.innerHTML = `
      <div class="markdown-diagram-lightbox__backdrop"></div>
      <div class="markdown-diagram-lightbox__dialog" role="dialog" aria-modal="true">
        <div class="markdown-diagram-lightbox__header">
          <div class="markdown-diagram-lightbox__title"></div>
          <div class="markdown-diagram-lightbox__header-actions">
            <span class="markdown-diagram-lightbox__hint">\u53ef\u5c40\u90e8\u653e\u5927\uff0c\u652f\u6301 Ctrl + \u6eda\u8f6e</span>
            <div class="markdown-diagram-lightbox__action-group" role="toolbar" aria-label="\u9884\u89c8\u7f29\u653e">
              <button type="button" class="markdown-diagram-lightbox__icon-button" data-action="zoom-out" aria-label="\u7f29\u5c0f"></button>
              <button type="button" class="markdown-diagram-lightbox__icon-button markdown-diagram-lightbox__zoom-button" data-action="zoom-reset" aria-label="\u91cd\u7f6e\u7f29\u653e">
                <span class="markdown-diagram-lightbox__zoom-value">100%</span>
              </button>
              <button type="button" class="markdown-diagram-lightbox__icon-button" data-action="zoom-in" aria-label="\u653e\u5927"></button>
            </div>
            <button type="button" class="markdown-diagram-lightbox__close">\u5173\u95ed</button>
          </div>
        </div>
        <div class="markdown-diagram-lightbox__content">
          <div class="markdown-diagram-lightbox__viewport">
            <div class="markdown-diagram-lightbox__surface">
              <div class="markdown-diagram-lightbox__canvas"></div>
            </div>
          </div>
        </div>
      </div>
    `

    root.querySelector('.markdown-diagram-lightbox__backdrop')?.addEventListener('click', closePreviewOverlay)
    root.querySelector('.markdown-diagram-lightbox__close')?.addEventListener('click', closePreviewOverlay)
    root.querySelector('.markdown-diagram-lightbox__dialog')?.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    root.querySelector('[data-action="zoom-out"]')?.appendChild(createDiagramActionIcon('zoomOut'))
    root.querySelector('[data-action="zoom-reset"]')?.prepend(createDiagramActionIcon('zoomReset'))
    root.querySelector('[data-action="zoom-in"]')?.appendChild(createDiagramActionIcon('zoomIn'))

    root.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => {
      updateOverlayZoom(overlayZoom - 0.2)
    })
    root.querySelector('[data-action="zoom-reset"]')?.addEventListener('click', () => {
      updateOverlayZoom(1)
    })
    root.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => {
      updateOverlayZoom(overlayZoom + 0.2)
    })

    const viewport = root.querySelector('.markdown-diagram-lightbox__viewport')
    viewport?.addEventListener(
      'wheel',
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) return
        event.preventDefault()
        updateOverlayZoom(overlayZoom + (event.deltaY < 0 ? 0.16 : -0.16), resolveOverlayZoomAnchor(event))
      },
      { passive: false }
    )

    const clearOverlayDragState = () => {
      overlayDragState = null
      overlayPendingDragPoint = null
      cancelOverlayDragFrame()
      overlayViewport?.classList.remove('is-dragging')
    }

    const queueOverlayDragUpdate = (clientX, clientY) => {
      if (
        overlayPendingDragPoint &&
        Math.abs(overlayPendingDragPoint.clientX - clientX) < 1 &&
        Math.abs(overlayPendingDragPoint.clientY - clientY) < 1
      ) {
        return
      }
      overlayPendingDragPoint = { clientX, clientY }
      if (overlayDragFrame) return

      overlayDragFrame = requestAnimationFrame(() => {
        overlayDragFrame = 0
        if (!overlayDragState || !overlayViewport || !overlayPendingDragPoint) return

        const { clientX: nextX, clientY: nextY } = overlayPendingDragPoint
        overlayPendingDragPoint = null
        overlayViewport.scrollLeft = overlayDragState.scrollLeft - (nextX - overlayDragState.startX)
        overlayViewport.scrollTop = overlayDragState.scrollTop - (nextY - overlayDragState.startY)
      })
    }

    viewport?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !overlayViewport || !overlayCanvas) return
      if (!(event.target instanceof Element) || !event.target.closest('.markdown-diagram-lightbox__canvas')) return
      if (!overlayViewport.classList.contains('is-pannable')) return

      overlayDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: overlayViewport.scrollLeft,
        scrollTop: overlayViewport.scrollTop
      }
      overlayViewport.classList.add('is-dragging')
      overlayViewport.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    })

    viewport?.addEventListener('pointermove', (event) => {
      if (!overlayDragState || !overlayViewport) return
      if (overlayDragState.pointerId !== event.pointerId) return

      queueOverlayDragUpdate(event.clientX, event.clientY)
      event.preventDefault()
    })

    viewport?.addEventListener('pointerup', clearOverlayDragState)
    viewport?.addEventListener('pointercancel', clearOverlayDragState)
    viewport?.addEventListener('lostpointercapture', clearOverlayDragState)

    document.body.appendChild(root)
    overlayRoot = root
    overlayTitle = root.querySelector('.markdown-diagram-lightbox__title')
    overlayViewport = viewport
    overlaySurface = root.querySelector('.markdown-diagram-lightbox__surface')
    overlayCanvas = root.querySelector('.markdown-diagram-lightbox__canvas')
    overlayZoomValue = root.querySelector('.markdown-diagram-lightbox__zoom-value')
    updateOverlayZoomLabel()
    return root
  }

  function showPreviewOverlay(kind) {
    const root = ensurePreviewOverlay()
    const theme = getTheme()

    detachOverlayKeydownHandler()
    if (overlayTitle) {
      overlayTitle.textContent = kind === 'echarts' ? 'ECharts \u9884\u89c8' : 'Mermaid \u9884\u89c8'
    }

    root.classList.remove('is-hidden')
    root.classList.toggle('is-dark', theme === 'dark')
    requestAnimationFrame(() => {
      root.classList.add('is-open')
    })

    overlayKeydownHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePreviewOverlay()
      }
    }
    window.addEventListener('keydown', overlayKeydownHandler)

    return theme
  }

  async function buildOverlayMermaidRenderable(node, theme) {
    const source = buildSourceFromNode(node, 'mermaid')
    const explicitSize = node?.dataset?.aiToolsDiagramSized === 'true'
      ? resolveDiagramRenderSize(node, 'mermaid')
      : null
    let svgMarkup = ''

    if (source) {
      try {
        svgMarkup = await renderMermaidSvgForExport(source, theme, explicitSize)
      } catch (err) {
        console.warn('Mermaid \u9884\u89c8\u91cd\u65b0\u6e32\u67d3\u5931\u8d25\uff0c\u56de\u9000\u5230\u5f53\u524d SVG:', err)
      }
    }

    if (!svgMarkup) {
      const svg = node?.querySelector?.('svg')
      if (!svg) {
        throw new Error('\u672a\u627e\u5230\u53ef\u9884\u89c8\u7684 Mermaid SVG')
      }
      svgMarkup = svg.outerHTML
    }

    const svg = parseSvgInput(svgMarkup)
    if (!svg) {
      throw new Error('Mermaid \u9884\u89c8\u751f\u6210\u5931\u8d25')
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const serialized = new XMLSerializer().serializeToString(svg)
    const objectUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
    const image = document.createElement('img')
    image.className = 'markdown-diagram-lightbox__rendered'
    image.alt = 'Mermaid \u9884\u89c8'
    image.draggable = false
    image.src = objectUrl

    return {
      element: image,
      objectUrl,
      size: explicitSize || resolveSvgRasterSize(svg)
    }
  }

  async function buildOverlayEchartsRenderable(node, theme) {
    const payload = await resolveEchartsPayloadFromNode(node)
    const rendered = await renderEchartsSvgForExport(
      payload.option,
      theme,
      resolveOverlayPreviewRenderSize(resolveDiagramRenderSize(node, 'echarts'), 'echarts')
    )
    const svg = parseSvgInput(rendered.svgMarkup)
    if (!svg) {
      throw new Error('ECharts \u9884\u89c8\u751f\u6210\u5931\u8d25')
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const serialized = new XMLSerializer().serializeToString(svg)
    const objectUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
    const image = document.createElement('img')
    image.className = 'markdown-diagram-lightbox__rendered'
    image.alt = 'ECharts \u9884\u89c8'
    image.draggable = false
    image.src = objectUrl

    return {
      element: image,
      objectUrl,
      size: rendered.size || resolveSvgRasterSize(svg)
    }
  }

  async function openPreviewOverlay(kind, node) {
    const theme = showPreviewOverlay(kind)
    const renderToken = ++overlayRenderToken
    setOverlayMessage('\u6b63\u5728\u751f\u6210\u9884\u89c8...')

    try {
      const rendered = kind === 'echarts'
        ? await buildOverlayEchartsRenderable(node, theme)
        : await buildOverlayMermaidRenderable(node, theme)

      if (renderToken !== overlayRenderToken || !overlayCanvas) {
        if (rendered?.objectUrl) {
          URL.revokeObjectURL(rendered.objectUrl)
        }
        return
      }
      mountOverlayRenderable(rendered)
    } catch (err) {
      if (renderToken !== overlayRenderToken) return
      setOverlayMessage(`\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\uff1a${err?.message || String(err)}`, 'error')
    }
  }

  async function exportEchartsNode(node, mode) {
    let blob = null
    let lastError = null

    try {
      const payload = await resolveEchartsPayloadFromNode(node)
      const rendered = await renderEchartsSvgForExport(payload.option, getTheme(), resolveDiagramRenderSize(node, 'echarts'))
      blob = await rasterizeSvgToBlob(rendered.svgMarkup, getTheme())
    } catch (err) {
      lastError = err
      console.warn('ECharts PNG \u91cd\u65b0\u6e32\u67d3\u5931\u8d25\uff0c\u56de\u9000\u5230\u5f53\u524d\u753b\u5e03:', err)
    }

    if (!blob) {
      const canvas = node?.querySelector?.('canvas')
      if (!canvas) {
        throw lastError || new Error('\u672a\u627e\u5230\u53ef\u5bfc\u51fa\u7684 ECharts \u753b\u5e03')
      }
      try {
        blob = await exportCanvasWithBackground(canvas, getTheme())
      } catch (err) {
        throw lastError || err
      }
    }

    if (mode === 'copy') {
      await copyBlobToClipboard(blob)
      notifySuccess('\u5df2\u590d\u5236\u4e3a PNG')
      return
    }

    downloadBlob(blob, buildExportFileName('echarts'))
    notifySuccess('\u5df2\u5bfc\u51fa PNG')
  }

  async function exportMermaidNode(node, mode) {
    const svg = node?.querySelector?.('svg')
    if (!svg) throw new Error('\u672a\u627e\u5230\u53ef\u5bfc\u51fa\u7684 Mermaid SVG')

    const source = buildSourceFromNode(node, 'mermaid')
    let blob = null
    let lastError = null

    if (source) {
      try {
        const exportSvgMarkup = await renderMermaidSvgForExport(
          source,
          getTheme(),
          node?.dataset?.aiToolsDiagramSized === 'true' ? resolveDiagramRenderSize(node, 'mermaid') : null
        )
        blob = await rasterizeSvgToBlob(exportSvgMarkup, getTheme())
      } catch (err) {
        lastError = err
        console.warn('Mermaid PNG \u91cd\u65b0\u6e32\u67d3\u5931\u8d25\uff0c\u56de\u9000\u5230\u5f53\u524d SVG:', err)
      }
    }

    if (!blob) {
      try {
        blob = await rasterizeSvgToBlob(svg, getTheme())
      } catch (err) {
        throw lastError || err
      }
    }

    if (mode === 'copy') {
      await copyBlobToClipboard(blob)
      notifySuccess('\u5df2\u590d\u5236\u4e3a PNG')
      return
    }

    downloadBlob(blob, buildExportFileName('mermaid'))
    notifySuccess('\u5df2\u5bfc\u51fa PNG')
  }

  async function runDiagramExport(kind, node, mode) {
    try {
      if (kind === 'echarts') {
        await exportEchartsNode(node, mode)
      } else {
        await exportMermaidNode(node, mode)
      }
    } catch (err) {
      const prefix = mode === 'copy' ? '\u590d\u5236 PNG \u5931\u8d25\uff1a' : '\u5bfc\u51fa PNG \u5931\u8d25\uff1a'
      notifyError(prefix + (err?.message || String(err)))
    }
  }

  async function copyDiagramSource(kind, node) {
    let source = ''
    if (kind === 'echarts') {
      try {
        source = (await resolveEchartsPayloadFromNode(node)).source || ''
      } catch {
        source = buildSourceFromNode(node, kind)
      }
    } else {
      source = buildSourceFromNode(node, kind)
    }

    if (!source.trim()) {
      notifyError('\u672a\u627e\u5230\u53ef\u590d\u5236\u7684\u6e90\u7801')
      return
    }

    const copied = await copyTextToClipboard(source)
    if (!copied) {
      notifyError('\u590d\u5236\u6e90\u7801\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u526a\u8d34\u677f\u6743\u9650')
      return
    }

    notifySuccess('\u5df2\u590d\u5236\u6e90\u7801')
  }

  function renderEchartsErrorState(node, error) {
    if (!node) return
    const source = buildSourceFromNode(node, 'echarts')
    const line = Number(node.dataset.line || 0)
    node.dataset.processed = ''
    node.dataset.aiToolsDiagramError = 'true'
    node.classList.add('note-preview-echarts-error-host')
    node.innerHTML = `
      <div class="note-preview-diagram-error">
        <div class="note-preview-diagram-error__title">\u0045Charts \u914d\u7f6e\u6709\u8bef</div>
        <div class="note-preview-diagram-error__message">${escapeHtml(error?.message || '\u6e32\u67d3\u5931\u8d25')}</div>
        <div class="note-preview-diagram-error__meta">${line > 0 ? `\u4ee3\u7801\u5757\u8d77\u59cb\u884c\uff1a${line}` : '\u8bf7\u68c0\u67e5\u5f53\u524d echarts \u4ee3\u7801\u5757'}</div>
        <details class="note-preview-diagram-error__details">
          <summary>\u67e5\u770b\u5f53\u524d option</summary>
          <pre><code>${escapeHtml(source)}</code></pre>
        </details>
      </div>
    `
    applyDiagramSize(node, 'echarts')
  }

  function ensureDiagramActionBar(node, kind) {
    if (!node || node.dataset.aiToolsDiagramError === 'true') return
    if (node.dataset.aiToolsDiagramEnhanced === 'true') return

    if (kind === 'mermaid') {
      node.querySelector('.md-editor-mermaid-action')?.remove()
    }

    node.classList.add('note-preview-diagram', 'note-preview-diagram--clickable')
    node.classList.toggle('note-preview-diagram--mermaid', kind === 'mermaid')
    node.classList.toggle('note-preview-diagram--echarts', kind === 'echarts')
    if (getComputedStyle(node).position === 'static') {
      node.style.position = 'relative'
    }

    const bar = document.createElement('div')
    bar.className = 'note-preview-diagram-actions'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', `${kind === 'echarts' ? 'ECharts' : 'Mermaid'} \u56fe\u8868\u64cd\u4f5c`)

    const actions = [
      {
        label: '\u590d\u5236\u6e90\u7801',
        icon: 'source',
        handler: () => {
          void copyDiagramSource(kind, node)
        }
      },
      {
        label: '\u590d\u5236 PNG',
        icon: 'copy',
        handler: () => {
          void runDiagramExport(kind, node, 'copy')
        }
      },
      {
        label: '\u5bfc\u51fa PNG',
        icon: 'download',
        handler: () => {
          void runDiagramExport(kind, node, 'download')
        }
      }
    ]

    actions.forEach((action) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'note-preview-diagram-action'
      button.title = action.label
      button.setAttribute('aria-label', action.label)
      button.appendChild(createDiagramActionIcon(action.icon))
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        action.handler()
      })
      bar.appendChild(button)
    })

    node.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.note-preview-diagram-actions')) return
      if (window.getSelection?.()?.toString()) return
      void openPreviewOverlay(kind, node)
    })

    node.appendChild(bar)
    node.dataset.aiToolsDiagramEnhanced = 'true'
  }

  function decorate(root) {
    if (!root) return

    root.querySelectorAll('div.md-editor-echarts:not([data-processed])').forEach((node) => {
      if (node.dataset.closed === 'false') return
      try {
        const source = cacheDiagramSource(node, readDiagramNodeText(node))
        const parsed = parseEchartsOption(source)
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('ECharts option \u9700\u8981\u8fd4\u56de\u4e00\u4e2a\u5bf9\u8c61')
        }
      } catch (err) {
        renderEchartsErrorState(node, err)
      }
    })

    root.querySelectorAll('div.md-editor-echarts[data-processed]').forEach((node) => {
      applyDiagramSize(node, 'echarts')
      ensureDiagramActionBar(node, 'echarts')
    })

    root.querySelectorAll('div.md-editor-mermaid[data-processed], p.md-editor-mermaid[data-processed]').forEach((node) => {
      buildSourceFromNode(node, 'mermaid')
      applyDiagramSize(node, 'mermaid')
      ensureDiagramActionBar(node, 'mermaid')
    })
  }

  function dispose() {
    overlayRenderToken += 1
    closePreviewOverlay()
    overlayRoot?.remove()
    overlayRoot = null
    overlayTitle = null
    overlayViewport = null
    overlaySurface = null
    overlayCanvas = null
    overlayZoomValue = null
    releaseOverlayObjectUrl()
    overlayPendingDragPoint = null
    cancelOverlayDragFrame()
    detachOverlayKeydownHandler()
  }

  return {
    decorate,
    dispose,
    closePreviewOverlay
  }
}
