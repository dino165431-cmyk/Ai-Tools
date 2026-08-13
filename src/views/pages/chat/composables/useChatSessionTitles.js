import { extractEditableUserTextFromContent } from '@/utils/chatUserMessageContent'
import { extractAssistantTextFromPayloads } from '@/utils/chatAssistantResponse'

export function getSessionTitleFromPath(filePath) {
  const path = String(filePath || '').trim()
  const name = path.split('/').filter(Boolean).pop() || ''
  if (!name) return ''
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -5) : name
}

export function buildDefaultSessionName(sessionLike) {
  const firstUser = (sessionLike?.messages || []).find((msg) => msg?.role === 'user')
  const prompt = extractEditableUserTextFromContent(firstUser?.content ?? '')
  return extractAutoSessionTitle(prompt) || '会话'
}

export function sanitizeAutoSessionTitle(text, maxLength = 42) {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|#%{}~&]/g, ' ')
    .replace(/\.+/g, '.')
    .trim()
  if (!compact) return ''
  return compact.slice(0, maxLength).trim() || ''
}

export function extractAutoSessionTitle(text, maxLength = 32) {
  const raw = String(text || '')
    .replace(/【附件内容】[\s\S]*$/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`*_>#\[\]{}()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''

  const cleaned = raw
    .replace(/^(请|麻烦|帮我|请帮我|能不能|可以的话|我想要|我希望)\s*/u, '')
    .trim()
  const segments = cleaned
    .split(/[。！？!?；;\n\r]+/)
    .map((item) => sanitizeAutoSessionTitle(item, maxLength))
    .filter(Boolean)
  const picked = segments.find((item) => item.length >= 6) || segments[0] || sanitizeAutoSessionTitle(cleaned, maxLength)
  return sanitizeAutoSessionTitle(picked, maxLength)
}

export function buildAutoSessionTitle(record, defaultTitle = '') {
  const firstUser = (record?.messages || []).find((msg) => msg?.role === 'user')
  const prompt = extractEditableUserTextFromContent(firstUser?.content ?? '')
  const title = extractAutoSessionTitle(prompt)
  return title || defaultTitle
}

export function normalizeGeneratedSessionTitle(text, fallback = '') {
  const raw = String(text || '')
    .replace(/^\s*(?:标题|会话标题|title)\s*[:：-]\s*/i, '')
    .replace(/^[`"'“”‘’《》〈〉「」『』【】（）()]+|[`"'“”‘’《》〈〉「」『』【】（）()]+$/g, '')
    .split(/\r?\n/)[0]
    .trim()
  const normalized = sanitizeAutoSessionTitle(raw, 32)
  if (normalized) return normalized
  return sanitizeAutoSessionTitle(fallback, 32)
}

export function extractFinalSessionTitleContent(result) {
  const content = String(
    result?.content ||
    (Array.isArray(result?.payloads) ? extractAssistantTextFromPayloads(result.payloads) : '')
  ).trim()
  const reasoning = String(result?.reasoning || result?.reasoning_content || '').trim()
  if (!content) return ''
  // Some OpenAI-compatible gateways echo the reasoning stream into content.
  // There is no reliable way to reconstruct the missing final answer from
  // reasoning, so let the caller use the deterministic user-text fallback.
  if (reasoning && content === reasoning) return ''
  return content
}

const SESSION_TITLE_META_PREFIX_RE = /^(?:我们需要|我们只需要|用户消息|用户说|根据用户|根据这条消息|让我|我先|现在|首先|思考|分析过程|以下是)/iu
const SESSION_TITLE_META_MARKER_RE = /(?:用户消息\s*[:：]|用户消息是|用户说\s*[:：]|user\s+message\s*[:：]|reasoning|assistant\s*[:：])/iu

export function isUsableGeneratedSessionTitle(text) {
  const value = normalizeGeneratedSessionTitle(text, '')
  if (!value) return false
  if (SESSION_TITLE_META_PREFIX_RE.test(value)) return false
  if (SESSION_TITLE_META_MARKER_RE.test(value)) return false
  return true
}

export function summarizeAttachmentNamesForSessionTitle(attachments = []) {
  const names = (Array.isArray(attachments) ? attachments : [])
    .map((item) => String(item?.name || item?.filename || item?.fileName || '').trim())
    .filter(Boolean)
    .slice(0, 4)
  if (!names.length) return ''
  return names.join('、')
}

export function buildSessionTitleGenerationPrompt({ text = '', attachments = [] } = {}) {
  const cleanText = String(text || '').trim()
  const attachmentSummary = summarizeAttachmentNamesForSessionTitle(attachments)
  return [
    '请根据下面的用户消息生成一个会话标题。',
    '要求：',
    '1. 只输出一行标题文字，不要输出解释、前后缀、序号、引号或 Markdown 标记。',
    '2. 标题必须是概括主题的名词性短语，不要使用问句，不要以“如何”“怎么”“请帮我”“帮我”等口语开头。',
    '3. 优先使用中文，控制在 4 到 18 个字以内。',
    '4. 不要包含路径、扩展名、时间戳或多余符号。',
    '示例：',
    '用户消息：帮我分析一下这个月的广告投放数据',
    '标题：本月广告投放数据分析',
    '用户消息：写一个 Vue 组件用来展示图片列表',
    '标题：Vue 图片列表组件',
    cleanText ? `用户消息：${cleanText}` : '用户消息：用户发送了附件，请根据附件名称概括主题。',
    attachmentSummary ? `附件信息：${attachmentSummary}` : ''
  ].filter(Boolean).join('\n')
}
