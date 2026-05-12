export function shouldPersistMarkdownDraftOnPathChange({
  oldPath,
  currentContent,
  lastSavedFilePath,
  lastSavedContent
} = {}) {
  const snapshotPath = String(oldPath || '').trim()
  if (!snapshotPath) return false

  const currentPath = String(lastSavedFilePath || '').trim()
  if (currentPath !== snapshotPath) return false

  return String(lastSavedContent ?? '') !== String(currentContent ?? '')
}
