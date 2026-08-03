import { truncateInlineText } from '@/utils/chatAttachmentUtils'
import { assistantImageTaskStatusLabel } from '@/utils/chatMediaPresentation'

function deepCopyJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback ?? value
  }
}

export function buildImageGenerationResultText({ imageCount, revisedPrompts }) {
  const count = Math.max(0, Number(imageCount) || 0)
  if (!revisedPrompts.length) return ''
  const title = count > 1 ? `已生成 ${count} 张图片` : '已生成 1 张图片'
  return `### ${title}\n\n#### 修订提示词\n\n${revisedPrompts.join('\n\n')}`
}

export function buildImageGenerationApiSummary({ imageCount, revisedPrompts }) {
  const count = Math.max(0, Number(imageCount) || 0)
  const lines = [`（已生成 ${count || 1} 张图片）`]
  const firstRevisedPrompt = truncateInlineText(revisedPrompts?.[0] || '', 260)
  if (firstRevisedPrompt) lines.push(`修订提示词：${firstRevisedPrompt}`)
  return lines.join('\n')
}

export function buildImageGenerationPendingText(imageTask = null) {
  const statusLabel = imageTask ? assistantImageTaskStatusLabel({ imageTask }) : '生成中'
  const taskId = String(imageTask?.id || '').trim()
  return `图片生成${statusLabel}${taskId ? `（任务 ID：${taskId}）` : '……'}`
}

export function buildMediaRequestSnapshot(kind, {
  baseUrl = '',
  model = '',
  prompt = '',
  requestOptions = null,
  requestMeta = null,
  placeholderMode = 'text',
  startedAt = Date.now()
} = {}) {
  return {
    kind,
    baseUrl: String(baseUrl || '').trim(),
    model: String(model || '').trim(),
    prompt: String(prompt || '').trim(),
    requestOptions: requestOptions && typeof requestOptions === 'object' ? deepCopyJson(requestOptions, {}) : {},
    requestMeta: requestMeta && typeof requestMeta === 'object' ? deepCopyJson(requestMeta, {}) : null,
    placeholderMode: String(placeholderMode || 'text').trim() || 'text',
    startedAt: Number(startedAt) || Date.now()
  }
}

export function attachMediaRequestSnapshot(assistantDisplay, kind, patch = {}) {
  if (!assistantDisplay || typeof assistantDisplay !== 'object') return
  const previous = assistantDisplay.mediaRequest && typeof assistantDisplay.mediaRequest === 'object'
    ? assistantDisplay.mediaRequest
    : {}
  assistantDisplay.mediaRequest = {
    ...previous,
    ...patch,
    kind
  }
}
