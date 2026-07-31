import { formatAttachmentSize, formatMediaElapsed } from './chatMediaMetadata.js'
import { isImageAttachmentLike, truncateInlineText } from './chatAttachmentUtils.js'

export function isImageAttachment(attachment) {
  return isImageAttachmentLike({
    mime: String(attachment?.mime || ''),
    ext: String(attachment?.ext || ''),
    kind: attachment?.kind
  })
}

export function shouldShowAttachmentTag(attachment) {
  if (!attachment) return false
  if (!isImageAttachment(attachment)) return true
  const status = String(attachment?.status || '')
  return Boolean(status && status !== 'ready')
}

export function listDisplayAttachments(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments.filter(shouldShowAttachmentTag)
}

export function countImageAttachments(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  const attachmentCount = attachments.reduce(
    (count, attachment) => count + (isImageAttachment(attachment) ? 1 : 0),
    0
  )
  const imageCount = Array.isArray(message?.images) ? message.images.length : 0
  return Math.max(attachmentCount, imageCount)
}

export function countFileAttachments(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments.reduce(
    (count, attachment) => count + (isImageAttachment(attachment) ? 0 : 1),
    0
  )
}

export function attachmentStatusText(attachment) {
  const status = String(attachment?.status || '')
  if (status === 'processing') return '解析中'
  if (status === 'error') return `解析失败：${attachment?.error || '未知错误'}`
  if (status === 'ready' && attachment?.previewError) return '本地预览不可用，将作为沙盒文件发送'
  return ''
}

function attachmentStatusLabel(attachment) {
  const status = String(attachment?.status || '')
  if (status === 'processing') return '解析中'
  if (status === 'error') return '解析失败'
  if (status === 'ready' && attachment?.previewError) return '沙盒文件'
  if (status === 'ready' && attachment?.sandboxOnly) return '沙盒文件'
  return ''
}

function attachmentTypeLabel(attachment) {
  const extension = String(attachment?.ext || '').trim().toLowerCase()
  if (extension) return extension === 'jpg' ? 'JPEG' : extension.toUpperCase()

  const mime = String(attachment?.mime || '').trim().toLowerCase()
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('text/')) return 'TEXT'
  return 'FILE'
}

export function attachmentMetaSummary(attachment) {
  if (!attachment || typeof attachment !== 'object') return ''
  return [
    attachmentTypeLabel(attachment),
    formatAttachmentSize(attachment?.size),
    attachmentStatusLabel(attachment)
  ].filter(Boolean).join(' · ')
}

export function attachmentCardTitle(attachment) {
  const name = String(attachment?.name || '').trim()
  const detail = String(attachment?.error || attachment?.previewError || '').trim()
  return detail ? `${name}\n${detail}` : name
}

export function imageInsightLabel(item) {
  const text = truncateInlineText(item?.svgTextPreview || '', 140)
  return text ? `SVG 文本：${text}` : ''
}

export function assistantImageTitle(message) {
  const count = Array.isArray(message?.images) ? message.images.length : 0
  return count > 1 ? `已生成 ${count} 张图片` : '已生成 1 张图片'
}

export function assistantImagePromptLabel(message) {
  const prompt = truncateInlineText(message?.imagePrompt || '', 220)
  return prompt ? `提示词：${prompt}` : ''
}

export function assistantImageTaskStatusLabel(message) {
  const status = String(message?.imageTask?.stage || message?.imageTask?.status || '').trim().toLowerCase()
  if (status === 'submitting') return '提交中'
  if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return '已提交'
  if (['processing', 'running', 'in_progress'].includes(status)) return '生成中'
  if (['completed', 'succeeded', 'success'].includes(status)) return '已完成'
  if (['failed', 'error', 'cancelled'].includes(status)) return '失败'
  return status || '处理中'
}

export function assistantImageTaskTagType(message) {
  const status = String(message?.imageTask?.stage || message?.imageTask?.status || '').trim().toLowerCase()
  if (['failed', 'error', 'cancelled'].includes(status)) return 'error'
  if (['completed', 'succeeded', 'success'].includes(status)) return 'success'
  if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return 'warning'
  return 'info'
}

export function assistantImageTaskTitle(message) {
  const label = assistantImageTaskStatusLabel(message)
  return `图片任务${label === '处理中' ? '' : ` · ${label}`}`.trim()
}

export function assistantImageTaskMetaLabel(message) {
  const taskId = String(message?.imageTask?.id || '').trim()
  const endpoint = String(message?.imageTask?.endpointKind || '').trim()
  const parts = []
  if (taskId) parts.push(`任务 ID：${taskId}`)
  if (endpoint) parts.push(`接口：${endpoint}`)
  const progress = mediaTaskProgressLabel(message, 'image')
  if (progress) parts.push(progress)
  return parts.join(' · ')
}

export function assistantImageTaskNote(message) {
  return String(message?.imageTask?.note || '').trim()
}

export function mediaTaskStageLabel(task, kind = 'image') {
  const status = String(task?.stage || task?.status || '').trim().toLowerCase()
  if (status === 'submitting') return '提交中'
  if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return '排队中'
  if (['processing', 'running', 'in_progress', 'polling'].includes(status)) return kind === 'video' ? '生成中' : '处理中'
  if (status === 'fetching_result') return '拉取结果中'
  if (['completed', 'succeeded', 'success'].includes(status)) return '已完成'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return '失败'
  return status || ''
}

function isTerminalMediaTaskStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  return ['completed', 'succeeded', 'success', 'failed', 'error', 'cancelled', 'canceled'].includes(normalized)
}

export function mediaTaskProgressLabel(message, kind = 'image') {
  const task = kind === 'video' ? message?.videoTask : message?.imageTask
  if (!task) return ''

  const parts = []
  const stage = mediaTaskStageLabel(task, kind)
  if (stage) parts.push(`阶段：${stage}`)

  const startedAt = Number(task.startedAt || message?.mediaRequest?.startedAt || 0)
  if (startedAt > 0 && !isTerminalMediaTaskStatus(task.status)) {
    parts.push(`已等待：${formatMediaElapsed(Date.now() - startedAt)}`)
  }
  return parts.join(' · ')
}
