function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function truncateAttachmentText(text, maxChars) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (!maxChars || raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars)}\n\n(attachment content truncated, total ${raw.length} chars)`
}

export async function parsePdfToText(arrayBuffer) {
  const pdfjsMod = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdfjs = pdfjsMod?.default || pdfjsMod
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer),
    disableWorker: true,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: false
  })
  const pdf = await loadingTask.promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = (content.items || []).map((item) => item?.str || '').filter(Boolean).join(' ')
    if (pageText.trim()) pages.push(`[Page ${i}]\n${pageText}`)
  }
  const text = pages.join('\n\n').trim()
  if (text) return text
  return 'PDF contains no extractable text. It may be a scanned or image-only PDF, and OCR is not available.'
}

export async function parseDocxToText(arrayBuffer) {
  const mammothMod = await import('mammoth/mammoth.browser.js')
  const mammoth = mammothMod?.default || mammothMod
  const result = await mammoth.extractRawText({ arrayBuffer })
  return String(result?.value || '').trim()
}

export async function parseXlsxToText(arrayBuffer) {
  const xlsxMod = await import('xlsx')
  const XLSX = xlsxMod?.default || xlsxMod
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const blocks = []

  ;(workbook.SheetNames || []).forEach((name) => {
    const sheet = workbook.Sheets?.[name]
    if (!sheet) return
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    const trimmed = String(csv || '').trim()
    if (!trimmed) return
    blocks.push(`[Sheet: ${name}]\n${trimmed}`)
  })

  return blocks.join('\n\n').trim()
}

export async function parsePptxToText(arrayBuffer) {
  const jszipMod = await import('jszip')
  const JSZip = jszipMod?.default || jszipMod
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideNames = Object.keys(zip.files || {})
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number((a.match(/slide(\d+)\.xml$/) || [])[1] || 0)
      const nb = Number((b.match(/slide(\d+)\.xml$/) || [])[1] || 0)
      return na - nb
    })

  const blocks = []
  for (const name of slideNames) {
    const slideXml = await zip.file(name)?.async('string')
    if (!slideXml) continue
    const texts = []
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
    let match
    while ((match = regex.exec(slideXml)) !== null) {
      const value = decodeXmlEntities(match[1]).trim()
      if (value) texts.push(value)
    }
    const joined = texts.join(' ')
    const index = Number((name.match(/slide(\d+)\.xml$/) || [])[1] || 0)
    if (joined.trim()) blocks.push(`[Slide ${index || blocks.length + 1}]\n${joined}`)
  }

  return blocks.join('\n\n').trim()
}

export async function parseAttachmentText(ext, arrayBuffer) {
  if (ext === 'pdf') return await parsePdfToText(arrayBuffer)
  if (ext === 'docx') return await parseDocxToText(arrayBuffer)
  if (ext === 'xlsx' || ext === 'xls') return await parseXlsxToText(arrayBuffer)
  if (ext === 'pptx') return await parsePptxToText(arrayBuffer)
  throw new Error(`Unsupported attachment type: ${ext || 'unknown'}`)
}
