import { deleteItem, exists, listDirectory, stat } from '@/utils/fileOperations'
import { listNoteAssetsDirectories } from '@/utils/noteImageUpload'
import {
  safeDecodeURIComponent,
  splitMarkdownLinkDestination,
  stripUrlHashAndQuery
} from '@/utils/notePathUtils'
import { NOTE_EXTENSIONS } from '@/utils/noteTypes'

function supportsNoteAttachments(noteFilePath) {
  const normalized = String(noteFilePath || '').trim().toLowerCase()
  return NOTE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

function extractReferencedAssetFileNames(markdown, assetsDirName) {
  const out = new Set()
  const dirName = String(assetsDirName || '').trim()
  if (!dirName) return out

  const prefix = `${dirName}/`
  const regex = /!?\[[^\]]*?\]\(([^)]+)\)/g
  let match
  while ((match = regex.exec(String(markdown || ''))) !== null) {
    const inside = String(match[1] || '').trim()
    if (!inside) continue

    const { urlRaw } = splitMarkdownLinkDestination(inside)
    if (!urlRaw) continue

    const urlNoHash = stripUrlHashAndQuery(urlRaw)
    const decoded = safeDecodeURIComponent(urlNoHash)
    const noDot = decoded.startsWith('./') ? decoded.slice(2) : decoded
    if (!noDot.startsWith(prefix)) continue

    const rest = noDot.slice(prefix.length)
    const fileName = rest.split('/').pop()
    if (fileName) out.add(fileName)
  }

  return out
}

function buildNotebookMarkdownText(notebookLike) {
  const cells = Array.isArray(notebookLike?.cells) ? notebookLike.cells : []
  return cells
    .filter((cell) => cell?.cell_type === 'markdown')
    .map((cell) => String(cell?.source || ''))
    .join('\n\n')
}

async function deleteUnreferencedFilesInDirectory(dirPath, referencedFileNames) {
  if (!(await exists(dirPath))) return

  let entries = []
  try {
    entries = await listDirectory(dirPath)
  } catch {
    entries = []
  }

  for (const entry of entries) {
    try {
      const entryStat = await stat(entry)
      if (entryStat.isDirectory()) continue
      const fileName = String(entry || '').split('/').pop()
      if (!fileName || referencedFileNames.has(fileName)) continue
      await deleteItem(entry)
    } catch (err) {
      console.warn('清理未引用附件失败:', entry, err)
    }
  }

  try {
    const after = await listDirectory(dirPath)
    if (!after || after.length === 0) {
      await deleteItem(dirPath).catch(() => {})
    }
  } catch {
    // ignore
  }
}

export async function cleanupUnusedNoteAttachments(noteFilePath, markdown) {
  const notePath = String(noteFilePath || '').replace(/\\/g, '/')
  if (!supportsNoteAttachments(notePath)) return

  const md = String(markdown || '')
  const assetsInfos = listNoteAssetsDirectories(notePath)
  for (const assetsInfo of assetsInfos) {
    if (!assetsInfo?.assetsDirRel) continue
    const referenced = extractReferencedAssetFileNames(md, assetsInfo.assetsDirName)
    await deleteUnreferencedFilesInDirectory(assetsInfo.assetsDirRel, referenced)
  }
}

export async function cleanupUnusedNotebookAttachments(noteFilePath, notebookLike) {
  return cleanupUnusedNoteAttachments(noteFilePath, buildNotebookMarkdownText(notebookLike))
}

export async function deleteNoteAttachmentDirectories(noteFilePath) {
  const notePath = String(noteFilePath || '').replace(/\\/g, '/')
  if (!supportsNoteAttachments(notePath)) return

  for (const assetsInfo of listNoteAssetsDirectories(notePath)) {
    if (!assetsInfo?.assetsDirRel) continue
    if (!(await exists(assetsInfo.assetsDirRel))) continue
    await deleteItem(assetsInfo.assetsDirRel).catch(() => {})
  }
}
