import {
  buildImageGenerationPendingText,
  buildImageGenerationResultText
} from './useChatMediaRequestPresentation.js'

export function useChatMediaGenerationDisplay({
  createDisplayMessage,
  createAssistantImageBubblePlaceholder,
  createAssistantVideoBubblePlaceholder,
  assistantVideoTaskStatusLabel
}) {
function createImageGenerationPlaceholderDisplay(userPrompt, placeholderMode = 'text', options = {}) {
  const requestInfo = String(options?.requestInfo || '').trim()
  const assistantDisplay = createDisplayMessage('assistant', placeholderMode === 'image' ? '' : buildImageGenerationPendingText(), {
    streaming: false,
    render: 'text',
    imagePrompt: userPrompt,
    imageRequestInfo: requestInfo,
    transientRequestPlaceholder: true
  })

  if (placeholderMode === 'image') {
    assistantDisplay.imageBubblePlaceholder = true
    assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(
      '图片生成中，结果就绪后会展示在这里。',
      requestInfo
    )
  }

  return assistantDisplay
}

function applyImageGenerationTaskToDisplay(assistantDisplay, imageTask, placeholderMode = 'text') {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.transientRequestPlaceholder = false

  if (placeholderMode === 'image') {
    const requestInfo = String(assistantDisplay.imageRequestInfo || '').trim()
    assistantDisplay.content = ''
    assistantDisplay.imageTask = imageTask
    assistantDisplay.imageBubblePlaceholder = true
    assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(
      imageTask?.note || '图片生成中，结果就绪后会展示在这里。',
      requestInfo
    )
    return
  }

  assistantDisplay.imageTask = null
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.content = buildImageGenerationPendingText(imageTask)
}

function applyImageGenerationTextToDisplay(assistantDisplay, textResult) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'md'
  assistantDisplay.content = String(textResult || '').trim()
  assistantDisplay.imageTask = null
  assistantDisplay.images = []
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.transientRequestPlaceholder = false
}

function applyImageGenerationImagesToDisplay(assistantDisplay, { images, userPrompt, revisedPrompts }) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = revisedPrompts.length ? 'md' : 'text'
  assistantDisplay.content = ''
  assistantDisplay.imageTask = null
  assistantDisplay.images = images
  assistantDisplay.imagePrompt = userPrompt
  assistantDisplay.imageBubblePlaceholder = false
  assistantDisplay.imageBubblePlaceholderImage = null
  assistantDisplay.transientRequestPlaceholder = false
  assistantDisplay.content = buildImageGenerationResultText({
    imageCount: images.length,
    revisedPrompts
  })
}

function buildVideoGenerationPendingText(videoTask = null) {
  const statusLabel = videoTask ? assistantVideoTaskStatusLabel({ videoTask }) : '生成中'
  const taskId = String(videoTask?.id || '').trim()
  return `视频生成${statusLabel}${taskId ? `（任务 ID：${taskId}）` : '……'}`
}

function createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode = 'text', options = {}) {
  const requestInfo = String(options?.requestInfo || '').trim()
  const assistantDisplay = createDisplayMessage('assistant', placeholderMode === 'video' ? '' : buildVideoGenerationPendingText(), {
    streaming: false,
    render: 'text',
    videoPrompt: userPrompt,
    videoRequestInfo: requestInfo,
    transientRequestPlaceholder: true
  })

  if (placeholderMode === 'video') {
    assistantDisplay.videoBubblePlaceholder = true
    assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(
      '视频生成中，结果就绪后会展示在这里。',
      requestInfo
    )
  }

  return assistantDisplay
}

function applyVideoGenerationTaskToDisplay(assistantDisplay, videoTask, placeholderMode = 'text') {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.transientRequestPlaceholder = false

  if (placeholderMode === 'video') {
    const requestInfo = String(assistantDisplay.videoRequestInfo || '').trim()
    assistantDisplay.content = ''
    assistantDisplay.videoTask = videoTask
    assistantDisplay.videoBubblePlaceholder = true
    assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(
      videoTask?.note || '视频生成中，结果就绪后会展示在这里。',
      requestInfo
    )
    return
  }

  assistantDisplay.videoTask = videoTask
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.content = ''
}

function applyVideoGenerationTextToDisplay(assistantDisplay, textResult) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'md'
  assistantDisplay.content = String(textResult || '').trim()
  assistantDisplay.videoTask = null
  assistantDisplay.videos = []
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.transientRequestPlaceholder = false
}

function buildVideoGenerationResultText({ videoCount }) {
  const count = Math.max(0, Number(videoCount) || 0)
  if (!count) return ''
  return count > 1 ? `已生成 ${count} 个视频` : '已生成 1 个视频'
}

function applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt }) {
  if (!assistantDisplay) return
  assistantDisplay.streaming = false
  assistantDisplay.render = 'text'
  assistantDisplay.content = ''
  assistantDisplay.videoTask = null
  assistantDisplay.videos = videos
  assistantDisplay.videoPrompt = userPrompt
  assistantDisplay.videoBubblePlaceholder = false
  assistantDisplay.videoBubblePlaceholderItem = null
  assistantDisplay.transientRequestPlaceholder = false
  assistantDisplay.content = buildVideoGenerationResultText({ videoCount: videos.length })
}

function buildVideoGenerationApiSummary({ videoCount }) {
  const count = Math.max(0, Number(videoCount) || 0)
  return `（已生成 ${count || 1} 个视频）`
}

  return {
    createImageGenerationPlaceholderDisplay,
    applyImageGenerationTaskToDisplay,
    applyImageGenerationTextToDisplay,
    applyImageGenerationImagesToDisplay,
    buildVideoGenerationPendingText,
    createVideoGenerationPlaceholderDisplay,
    applyVideoGenerationTaskToDisplay,
    applyVideoGenerationTextToDisplay,
    buildVideoGenerationResultText,
    applyVideoGenerationVideosToDisplay,
    buildVideoGenerationApiSummary
  }
}
