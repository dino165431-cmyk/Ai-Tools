let pendingNotePath = ''
const listeners = new Set()

function normalizeNotePath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function requestOpenNoteFile(filePath) {
  const path = normalizeNotePath(filePath)
  if (!path) return

  pendingNotePath = path
  listeners.forEach((listener) => {
    try {
      listener(path)
    } catch {
      // ignore listener errors
    }
  })
}

export function consumePendingNoteFile() {
  const path = pendingNotePath
  pendingNotePath = ''
  return path
}

export function onOpenNoteFile(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}
