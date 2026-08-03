import { truncateInlineText } from '@/utils/chatAttachmentUtils'
import { imageMetaLabel, videoMetaLabel } from '@/utils/chatMediaMetadata.js'
import {
  assistantImagePromptLabel,
  assistantImageTaskMetaLabel,
  assistantImageTaskNote,
  assistantImageTaskStatusLabel,
  assistantImageTaskTagType,
  assistantImageTaskTitle,
  assistantImageTitle,
  imageInsightLabel,
  mediaTaskProgressLabel
} from '@/utils/chatMediaPresentation'

export function useChatAssistantMediaPresentation({
  createId,
  canRegenerateMedia,
  canResumeMediaTask,
  isMediaTaskResuming
}) {
  function createAssistantImageBubblePlaceholder(
    note = '图片生成中，结果就绪后会展示在这里。',
    metaLine = ''
  ) {
    return {
      id: `assistant-image-placeholder-${createId()}`,
      name: '图片生成中',
      src: '',
      mime: '',
      note: String(note || '').trim() || '图片生成中，结果就绪后会展示在这里。',
      metaLine: String(metaLine || '').trim()
    }
  }

  function createAssistantVideoBubblePlaceholder(
    note = '视频生成中，结果就绪后会展示在这里。',
    metaLine = ''
  ) {
    return {
      id: `assistant-video-placeholder-${createId()}`,
      name: '视频生成中',
      src: '',
      mime: '',
      note: String(note || '').trim() || '视频生成中，结果就绪后会展示在这里。',
      metaLine: String(metaLine || '').trim()
    }
  }

  function assistantVisibleImages(msg) {
    if (Array.isArray(msg?.images) && msg.images.length) return msg.images
    if (msg?.imageBubblePlaceholder) {
      return [msg.imageBubblePlaceholderImage || createAssistantImageBubblePlaceholder()]
    }
    return []
  }

  function assistantVisibleImageCount(msg) {
    return Array.isArray(msg?.images)
      ? msg.images.filter((img) => String(img?.src || '').trim()).length
      : 0
  }

  function assistantImageBlockEyebrow(msg) {
    return assistantVisibleImageCount(msg) ? '图片结果' : '图片占位'
  }

  function assistantImageDisplayTitle(msg) {
    if (assistantVisibleImageCount(msg)) return assistantImageTitle(msg)
    return assistantImageTaskTitle(msg) || '图片生成中'
  }

  function assistantImagePlaceholderText(msg, img) {
    const note = String(img?.note || '').trim()
    if (note) return note
    return assistantImageTaskNote(msg) || '图片生成中，结果就绪后会展示在这里。'
  }

  function assistantImageInsightLabel(msg, img) {
    return imageInsightLabel(img) || assistantImageTaskMetaLabel(msg) || ''
  }

  function assistantVisibleVideos(msg) {
    if (Array.isArray(msg?.videos) && msg.videos.length) return msg.videos
    if (msg?.videoBubblePlaceholder) {
      return [msg.videoBubblePlaceholderItem || createAssistantVideoBubblePlaceholder()]
    }
    return []
  }

  function assistantVisibleVideoCount(msg) {
    return Array.isArray(msg?.videos)
      ? msg.videos.filter((video) => String(video?.src || '').trim()).length
      : 0
  }

  function clearAssistantMediaBubblePlaceholders(msg) {
    if (!msg || typeof msg !== 'object') return
    msg.imageBubblePlaceholder = false
    msg.imageBubblePlaceholderImage = null
    msg.videoBubblePlaceholder = false
    msg.videoBubblePlaceholderItem = null
  }

  function applyAssistantRequestPlaceholderMode(msg, placeholderMode = 'text') {
    if (!msg || typeof msg !== 'object') return
    clearAssistantMediaBubblePlaceholders(msg)
    const mode = String(placeholderMode || 'text').trim().toLowerCase()
    if (mode === 'image') {
      msg.imageBubblePlaceholder = true
      msg.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder()
      return
    }
    if (mode === 'video') {
      msg.videoBubblePlaceholder = true
      msg.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder()
    }
  }

  function prepareAssistantDisplayForTextResponse(msg) {
    if (!msg || typeof msg !== 'object') return
    clearAssistantMediaBubblePlaceholders(msg)
    msg.transientRequestPlaceholder = false
  }

  function assistantVideoBlockEyebrow(msg) {
    return assistantVisibleVideoCount(msg) ? '视频结果' : '视频占位'
  }

  function assistantVideoDisplayTitle(msg) {
    if (assistantVisibleVideoCount(msg)) {
      const count = assistantVisibleVideoCount(msg)
      return count > 1 ? `已生成 ${count} 个视频` : '已生成 1 个视频'
    }
    return assistantVideoTaskTitle(msg) || '视频生成中'
  }

  function assistantVideoPlaceholderText(msg, video) {
    const note = String(video?.note || '').trim()
    if (note) return note
    return assistantVideoTaskNote(msg) || '视频生成中，结果就绪后会展示在这里。'
  }

  function videoInsightLabel(video) {
    return String(video?.note || '').trim()
  }

  function assistantVideoInsightLabel(msg, video) {
    return videoInsightLabel(video) || assistantVideoTaskMetaLabel(msg) || ''
  }

  function assistantVideoPromptLabel(msg) {
    const prompt = truncateInlineText(msg?.videoPrompt || '', 220)
    if (!prompt) return ''
    return `提示词：${prompt}`
  }

  function assistantVideoTaskStatusLabel(messageLike) {
    const status = String(
      messageLike?.videoTask?.stage || messageLike?.videoTask?.status || ''
    ).trim().toLowerCase()
    if (status === 'submitting') return '提交中'
    if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return '排队中'
    if (['processing', 'running', 'in_progress', 'polling'].includes(status)) return '生成中'
    if (status === 'fetching_result') return '拉取结果中'
    if (['completed', 'succeeded', 'success'].includes(status)) return '已完成'
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return '失败'
    return status ? status : '处理中'
  }

  function assistantVideoTaskTagType(messageLike) {
    const status = String(
      messageLike?.videoTask?.stage || messageLike?.videoTask?.status || ''
    ).trim().toLowerCase()
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'error'
    if (['completed', 'succeeded', 'success'].includes(status)) return 'success'
    if (['queued', 'submitted', 'pending', 'accepted'].includes(status)) return 'warning'
    return 'info'
  }

  function assistantVideoTaskTitle(messageLike) {
    return `视频任务${assistantVideoTaskStatusLabel(messageLike) === '处理中' ? '' : ` · ${assistantVideoTaskStatusLabel(messageLike)}`}`.trim()
  }

  function assistantVideoTaskMetaLabel(messageLike) {
    const task = messageLike?.videoTask
    if (!task) return ''
    const parts = []
    if (task.id) parts.push(`任务 ID：${task.id}`)
    if (task.endpointKind) parts.push(`接口：${task.endpointKind}`)
    const progress = mediaTaskProgressLabel(messageLike, 'video')
    if (progress) parts.push(progress)
    return parts.join(' · ')
  }

  function assistantVideoTaskNote(messageLike) {
    return String(messageLike?.videoTask?.note || '').trim()
  }

  const assistantMediaHelpers = {
    assistantImageTaskTitle,
    assistantImageTaskTagType,
    assistantImageTaskStatusLabel,
    assistantImagePromptLabel,
    assistantImageTaskMetaLabel,
    assistantImageTaskNote,
    assistantVisibleImages,
    assistantVisibleImageCount,
    assistantImageBlockEyebrow,
    assistantImageDisplayTitle,
    assistantImagePlaceholderText,
    assistantImageInsightLabel,
    assistantVisibleVideos,
    assistantVisibleVideoCount,
    assistantVideoBlockEyebrow,
    assistantVideoDisplayTitle,
    assistantVideoTaskTitle,
    assistantVideoTaskTagType,
    assistantVideoTaskStatusLabel,
    assistantVideoTaskMetaLabel,
    assistantVideoTaskNote,
    assistantVideoPromptLabel,
    assistantVideoPlaceholderText,
    assistantVideoInsightLabel,
    canRegenerateMedia,
    canResumeMediaTask,
    isMediaTaskResuming,
    imageMetaLabel,
    videoMetaLabel
  }

  return {
    assistantMediaHelpers,
    createAssistantImageBubblePlaceholder,
    createAssistantVideoBubblePlaceholder,
    clearAssistantMediaBubblePlaceholders,
    applyAssistantRequestPlaceholderMode,
    prepareAssistantDisplayForTextResponse
  }
}
