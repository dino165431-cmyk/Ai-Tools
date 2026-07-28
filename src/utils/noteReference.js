import path from 'path-browserify'
import { buildNoteHrefFromPath } from './notePathUtils.js'

function escapeMarkdownLabel(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .trim()
}

export function extractTrailingNoteReferenceTrigger(markdown) {
  const source = String(markdown || '')
  const match = source.match(/(?:^|[\s(])\[\[([^\]\n]{1,120})$/)
  if (!match) return null
  const token = `[[${match[1]}`
  const start = source.length - token.length
  return {
    query: String(match[1] || '').trim(),
    start,
    end: source.length,
    token
  }
}

export function buildNoteReference(item) {
  const relativePath = String(item?.path || '').replace(/^note[\\/]/i, '').replace(/\\/g, '/')
  if (!relativePath) return null
  const absoluteNotePath = `note/${relativePath}`
  const href = buildNoteHrefFromPath(absoluteNotePath)
  if (!href) return null
  const fallbackName = path.basename(relativePath, path.extname(relativePath))
  const label = escapeMarkdownLabel(item?.title || item?.name || fallbackName || '笔记')
  return {
    label,
    href,
    markdown: `[${label}](${href})`,
    absoluteNotePath
  }
}

export function replaceNoteReferenceTrigger(markdown, trigger, item) {
  const source = String(markdown || '')
  const reference = buildNoteReference(item)
  if (!reference) return null
  const start = Number(trigger?.start)
  const end = Number(trigger?.end)
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > source.length ||
    !source.slice(start, end).startsWith('[[')
  ) {
    return null
  }
  return {
    ...reference,
    content: `${source.slice(0, start)}${reference.markdown}${source.slice(end)}`
  }
}
