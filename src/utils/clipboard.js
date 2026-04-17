export async function copyTextToClipboard(text, options = {}) {
  const value = String(text || '')
  if (!value.trim()) return false

  const api = navigator?.clipboard
  if (!api?.writeText) {
    options.onUnsupported?.()
    return false
  }

  try {
    await api.writeText(value)
    options.onSuccess?.()
    return true
  } catch (err) {
    options.onError?.(err)
    return false
  }
}
