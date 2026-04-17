import { parseAttachmentText, truncateAttachmentText } from '../utils/attachmentTextParserCore'

self.addEventListener('message', async (event) => {
  const payload = event?.data || {}
  const id = payload.id
  try {
    const text = await parseAttachmentText(String(payload.ext || ''), payload.arrayBuffer)
    self.postMessage({ id, ok: true, text: truncateAttachmentText(text, Number(payload.maxChars) || 0) })
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) })
  }
})
