export function normalizeClipboardMediaMime(mime, fallbackMime, kindPrefix) {
  const normalized = String(mime || '').trim().toLowerCase()
  if (normalized && normalized !== 'application/octet-stream' && (!kindPrefix || normalized.startsWith(kindPrefix))) {
    return normalized
  }
  return String(fallbackMime || '').trim().toLowerCase()
}

export function canWriteClipboardMime(mime, clipboardItemCtor = globalThis?.ClipboardItem) {
  const normalized = String(mime || '').trim().toLowerCase()
  if (!normalized || !clipboardItemCtor) return false
  if (typeof clipboardItemCtor.supports === 'function') {
    return !!clipboardItemCtor.supports(normalized)
  }
  return true
}
