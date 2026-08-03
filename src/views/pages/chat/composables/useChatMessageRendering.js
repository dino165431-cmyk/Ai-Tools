import {
  analyzeUserMessageFolding,
  buildUserMessagePreview
} from '@/utils/chatDisplayFolding.js'

export function isLikelyMarkdownContent(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim()
  if (!text) return false
  if (/^#{1,6}\s+\S/m.test(text)) return true
  if (/^>\s+\S/m.test(text)) return true
  if (/^```[\w-]*\s*$/m.test(text) || /^~~~[\w-]*\s*$/m.test(text)) return true
  if (/(^|\n)\s*(?:[-*+]\s+\S|\d+\.\s+\S)/.test(text)) return true
  if (/!\[[^\]]*]\([^)]+\)|\[[^\]]+\]\([^)]+\)/.test(text)) return true
  if (/`[^`\n]+`/.test(text)) return true
  if (/\*\*[^*]+\*\*|__[^_]+__/.test(text)) return true
  if (/^\|.+\|\s*$/m.test(text) && /^\|?[\s:-]+\|[\s|:-]*$/m.test(text)) return true
  return false
}

export function hasHtmlLikeTagLine(content) {
  const text = String(content || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return false
  return text
    .split('\n')
    .some((line) => /^\s*<\/?[A-Za-z][\w:-]*(?:\s+[^<>]*)?\/?>\s*$/.test(String(line || '').trim()))
}

export function inferUserDisplayMessageRender(content) {
  return hasHtmlLikeTagLine(content) ? 'text' : 'md'
}

export function shouldRenderUserMessageAsPlainText(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (String(msg.render || '').trim().toLowerCase() === 'text') return true
  return inferUserDisplayMessageRender(msg.content) === 'text'
}

const userMessageFoldInfoCache = new WeakMap()

export function getUserMessageFoldInfo(msg) {
  if (!msg || typeof msg !== 'object') {
    return { charCount: 0, lineCount: 0, foldable: false, preview: '' }
  }
  const content = String(msg.content || '')
  const cached = userMessageFoldInfoCache.get(msg)
  if (cached?.content === content) return cached.value
  const analysis = analyzeUserMessageFolding(content)
  const value = {
    ...analysis,
    preview: analysis.foldable ? buildUserMessagePreview(content) : content
  }
  userMessageFoldInfoCache.set(msg, { content, value })
  return value
}

export function isUserMessageFoldable(msg) {
  return String(msg?.role || '').trim() === 'user' && getUserMessageFoldInfo(msg).foldable
}

export function isUserMessageCollapsed(msg) {
  if (msg?.editing) return false
  return isUserMessageFoldable(msg) && msg?.userMessageExpanded !== true
}

export function userMessagePreview(msg) {
  return getUserMessageFoldInfo(msg).preview
}

export function userMessageFoldSummary(msg) {
  const info = getUserMessageFoldInfo(msg)
  return `${info.charCount.toLocaleString()} 字${info.lineCount > 1 ? ` · ${info.lineCount.toLocaleString()} 行` : ''}`
}

export function shouldKeepLoadedAssistantTextRender(raw, content) {
  const text = String(content || '').trim()
  if (!text) return false
  if (raw?.transientRequestPlaceholder === true) return true
  if (raw?.imageTask || raw?.videoTask) return true
  if (raw?.imageBubblePlaceholder || raw?.videoBubblePlaceholder) return true
  if (/^(图片|视频)生成(?:生成中|处理中|排队中|等待中|进行中|失败|已取消|已受理|已完成)/.test(text)) return true
  if (!isLikelyMarkdownContent(text) && text.includes('\n') && (/\t/.test(text) || / {2,}/.test(text))) return true
  return false
}

export function inferLoadedDisplayMessageRender(raw, content) {
  const role = String(raw?.role || '').trim()
  if (role === 'assistant' || role === 'thinking') {
    return shouldKeepLoadedAssistantTextRender(raw, content) ? 'text' : 'md'
  }
  if (role === 'user') return inferUserDisplayMessageRender(content)
  return 'md'
}
