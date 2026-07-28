let worker = null
let sequence = 0
const pendingMap = new Map()
const DEFAULT_ATTACHMENT_PARSE_TIMEOUT_MS = 30_000
const ISOLATED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xls', 'xlsx', 'pptx'])

function normalizeAttachmentParseTimeoutMs(value) {
  const timeoutMs = Number(value)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_ATTACHMENT_PARSE_TIMEOUT_MS
  return Math.min(120_000, Math.max(1_000, Math.round(timeoutMs)))
}

function rejectPendingRequests(error) {
  for (const pending of pendingMap.values()) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  pendingMap.clear()
}

function terminateWorker(error = null) {
  try {
    worker?.terminate?.()
  } catch {
    // ignore
  }
  worker = null
  if (error) rejectPendingRequests(error)
}

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/attachmentTextParser.worker.js', import.meta.url), { type: 'module' })

  worker.addEventListener('message', (event) => {
    const payload = event?.data || {}
    const pending = pendingMap.get(payload.id)
    if (!pending) return
    pendingMap.delete(payload.id)
    clearTimeout(pending.timer)
    if (payload.ok) pending.resolve(String(payload.text || ''))
    else pending.reject(new Error(payload.error || '附件解析失败'))
  })

  worker.addEventListener('error', (event) => {
    const error = event?.error || new Error(event?.message || '附件解析工作线程失败')
    terminateWorker(error)
  })

  return worker
}

export async function parseAttachmentTextInWorker(options = {}) {
  const ext = String(options.ext || '').trim().toLowerCase()
  const file = options.file
  if (!file) throw new Error('Attachment file is required')
  if (!ext) throw new Error('Attachment extension is required')

  const id = `attachment_${Date.now()}_${sequence++}`
  const parserWorker = ensureWorker()
  const arrayBuffer = await file.arrayBuffer()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      terminateWorker(new Error(`附件解析超时（${normalizeAttachmentParseTimeoutMs(options.timeoutMs)}ms）`))
    }, normalizeAttachmentParseTimeoutMs(options.timeoutMs))

    pendingMap.set(id, { resolve, reject, timer })
    try {
      parserWorker.postMessage(
        {
          id,
          ext,
          fileName: String(options.fileName || file.name || ''),
          maxChars: Number(options.maxChars) || 0,
          arrayBuffer
        },
        [arrayBuffer]
      )
    } catch (error) {
      clearTimeout(timer)
      pendingMap.delete(id)
      reject(error)
    }
  })
}

export function shouldAllowMainThreadAttachmentFallback(ext) {
  return !ISOLATED_ATTACHMENT_EXTENSIONS.has(String(ext || '').trim().toLowerCase())
}

export async function parseAttachmentTextWithFallback(options = {}) {
  const ext = String(options.ext || '').trim().toLowerCase()
  const file = options.file
  if (!file) throw new Error('Attachment file is required')
  if (!ext) throw new Error('Attachment extension is required')

  try {
    return await parseAttachmentTextInWorker(options)
  } catch (workerError) {
    if (!shouldAllowMainThreadAttachmentFallback(ext)) {
      throw new Error(`附件解析失败。为避免阻塞主界面，${ext.toUpperCase()} 仅允许在隔离工作线程中解析：${workerError?.message || String(workerError)}`)
    }

    const arrayBuffer = await file.arrayBuffer()
    try {
      const { parseAttachmentText, truncateAttachmentText } = await import('./attachmentTextParserCore')
      const text = await parseAttachmentText(ext, arrayBuffer)
      return truncateAttachmentText(text, Number(options.maxChars) || 0)
    } catch (fallbackError) {
      const workerMessage = workerError?.message || String(workerError)
      const fallbackMessage = fallbackError?.message || String(fallbackError)
      throw new Error(`附件解析失败。工作线程：${workerMessage}；降级方案：${fallbackMessage}`)
    }
  }
}

export function resetAttachmentTextParserWorker() {
  terminateWorker(new Error('附件解析已取消'))
}
