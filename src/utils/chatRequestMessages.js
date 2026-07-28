import { sanitizeRequestToolMessages } from './chatRequestCompat.js'
import {
  buildVisionFallbackTextFromContent,
  messageContentHasImageUrl
} from './toolVisionContext.js'
import { stableStringify } from './chatProviderStreaming.js'
import { truncateText } from './chatAttachmentUtils.js'

function formatToolCallFallbackLine(toolCall) {
  const name = String(toolCall?.function?.name || '').trim() || 'unknown_tool'
  const args = truncateText(
    String(toolCall?.function?.arguments || '').trim() || '{}',
    1200,
    '（工具参数已截断）'
  )
  return `- ${name}: ${args}`
}

export function coerceToolStateMessageToPlainText(message) {
  if (!message || typeof message !== 'object') return null
  if (message.role === 'tool') {
    const callId = String(message.tool_call_id || message.call_id || '').trim()
    const content = truncateText(message.content || '', 24000, '（工具结果已截断）')
    return {
      role: 'assistant',
      content: [`工具结果${callId ? `（${callId}）` : ''}：`, content || '（空结果）'].join('\n')
    }
  }
  if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
    const content = String(message.content || '').trim()
    const calls = message.tool_calls.map(formatToolCallFallbackLine).filter(Boolean).join('\n')
    return {
      role: 'assistant',
      content: [content, calls ? `已调用工具：\n${calls}` : '已调用工具。']
        .filter(Boolean)
        .join('\n\n')
    }
  }
  return null
}

export function buildChatRequestMessages({
  systemContent = '',
  sourceMessages = [],
  needsReasoningContent = false,
  compatToolCallIdAsFc = false,
  visionFallbackText = '',
  fallbackAllVisionMessages = false,
  plainTextToolFallback = false
} = {}) {
  const messages = []
  if (systemContent) messages.push({ role: 'system', content: systemContent })

  const source = Array.isArray(sourceMessages) ? sourceMessages : []
  let latestVisionUserIndex = -1
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const candidate = source[index]
    if (candidate?.role === 'user' && messageContentHasImageUrl(candidate.content)) {
      latestVisionUserIndex = index
      break
    }
  }

  for (let index = 0; index < source.length; index += 1) {
    const message = source[index]
    if (!message || typeof message !== 'object') continue
    const toolFallback = plainTextToolFallback
      ? coerceToolStateMessageToPlainText(message)
      : null
    const cloned = toolFallback ? { ...toolFallback } : { ...message }

    if (messageContentHasImageUrl(cloned.content) && fallbackAllVisionMessages) {
      cloned.content = String(
        cloned.vision_fallback_text ||
          (index === latestVisionUserIndex ? visionFallbackText : '') ||
          buildVisionFallbackTextFromContent(cloned.content, {
            reason: '当前接口不支持 image_url'
          }) ||
          '（图片已省略）'
      ).trim()
    }

    if (!toolFallback && compatToolCallIdAsFc) {
      if (cloned.role === 'assistant' && Array.isArray(cloned.tool_calls)) {
        cloned.tool_calls = cloned.tool_calls.map((toolCall) => {
          if (!toolCall || typeof toolCall !== 'object') return toolCall
          const id = typeof toolCall.id === 'string' ? toolCall.id : ''
          if (!id.startsWith('call_')) return toolCall
          const callId = typeof toolCall.call_id === 'string' && toolCall.call_id
            ? toolCall.call_id
            : id
          return {
            ...toolCall,
            id: `fc_${id.slice('call_'.length)}`,
            call_id: callId
          }
        })
      }
      if (
        cloned.role === 'tool' &&
        typeof cloned.tool_call_id === 'string' &&
        cloned.tool_call_id.startsWith('call_')
      ) {
        cloned.call_id = cloned.tool_call_id
        cloned.tool_call_id = `fc_${cloned.tool_call_id.slice('call_'.length)}`
      }
    }

    if (cloned.role === 'assistant' && needsReasoningContent) {
      const reasoning =
        cloned.reasoning_content ??
        cloned.reasoning ??
        cloned.thinking ??
        cloned.thought ??
        ''
      cloned.reasoning_content = typeof reasoning === 'string'
        ? reasoning
        : stableStringify(reasoning)
    } else {
      delete cloned.reasoning_content
      delete cloned.reasoning
      delete cloned.thinking
      delete cloned.thought
    }

    delete cloned.vision_fallback_text
    delete cloned.synthetic_tool_vision
    messages.push(cloned)
  }

  return sanitizeRequestToolMessages(messages, { compatToolCallIdAsFc })
}
