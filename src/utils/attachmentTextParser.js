let worker = null
let sequence = 0
const pendingMap = new Map()

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/attachmentTextParser.worker.js', import.meta.url), { type: 'module' })

  worker.addEventListener('message', (event) => {
    const payload = event?.data || {}
    const pending = pendingMap.get(payload.id)
    if (!pending) return
    pendingMap.delete(payload.id)
    if (payload.ok) pending.resolve(String(payload.text || ''))
    else pending.reject(new Error(payload.error || '附件解析失败'))
  })

  worker.addEventListener('error', (event) => {
    const error = event?.error || new Error(event?.message || '附件解析工作线程失败')
    for (const pending of pendingMap.values()) {
      pending.reject(error)
    }
    pendingMap.clear()
    try {
      worker?.terminate?.()
    } catch {
      // ignore
    }
    worker = null
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
    pendingMap.set(id, { resolve, reject })
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
  })
}

export async function parseAttachmentTextWithFallback(options = {}) {
  const ext = String(options.ext || '').trim().toLowerCase()
  const file = options.file
  if (!file) throw new Error('Attachment file is required')
  if (!ext) throw new Error('Attachment extension is required')

  try {
    return await parseAttachmentTextInWorker(options)
  } catch (workerError) {
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
  try {
    worker?.terminate?.()
  } catch {
    // ignore
  }
  worker = null
  pendingMap.clear()
}
