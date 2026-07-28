import { extractImageGenerationPromptFromContent } from './chatImageGeneration.js'
import { extractEditableUserTextFromContent } from './chatUserMessageContent.js'
import { truncateInlineText, truncateText } from './chatAttachmentUtils.js'

function extractRequestMessageTextContent(content) {
  return extractImageGenerationPromptFromContent(content)
}

function extractSummaryText(message) {
  return extractEditableUserTextFromContent(
    extractRequestMessageTextContent(message?.content)
  ).trim()
}

export function buildContextSummarySourceHash(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      if (!message || typeof message !== 'object') return ''
      const role = String(message.role || '').trim()
      const text = extractEditableUserTextFromContent(
        extractRequestMessageTextContent(message.content)
      ).slice(0, 1200)
      return role || text ? `${role}:${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 20000)
}

export function buildContextSummaryTurnSegments(apiMessages = [], options = {}) {
  const messages = Array.isArray(apiMessages) ? apiMessages : []
  const endExclusive = Number.isFinite(Number(options.endExclusive))
    ? Math.max(0, Math.floor(Number(options.endExclusive)))
    : messages.length
  const segments = []
  let currentTurn = null

  const flushCurrentTurn = () => {
    if (!currentTurn) return
    const turnText = currentTurn.parts.filter(Boolean).join('\n\n').trim()
    if (!turnText) return
    segments.push({
      userText: truncateInlineText(currentTurn.userText || '', 3000),
      assistantText: truncateInlineText(currentTurn.assistantText || '', 4000),
      toolText: truncateInlineText(currentTurn.toolText || '', 4000),
      messageCount: Math.max(0, Math.floor(Number(currentTurn.messageCount || 0))),
      summary: truncateInlineText(
        currentTurn.summary || currentTurn.userText || currentTurn.assistantText || turnText,
        200
      ),
      turnText: truncateText(turnText, 6000, '（更早的上下文已截断）')
    })
  }

  const ensureCurrentTurn = () => {
    if (!currentTurn) {
      currentTurn = {
        userText: '',
        assistantText: '',
        toolText: '',
        summary: '',
        messageCount: 0,
        parts: []
      }
    }
    return currentTurn
  }

  for (let index = 0; index < Math.min(endExclusive, messages.length); index += 1) {
    const message = messages[index]
    if (!message || typeof message !== 'object') continue

    if (message.role === 'user') {
      flushCurrentTurn()
      const text = extractSummaryText(message)
      currentTurn = {
        userText: text,
        assistantText: '',
        toolText: '',
        summary: text,
        messageCount: 1,
        parts: text ? [`用户:\n${text}`] : []
      }
      continue
    }

    const block = ensureCurrentTurn()
    block.messageCount = Math.max(0, Math.floor(Number(block.messageCount || 0))) + 1
    if (message.role === 'assistant') {
      const assistantText = extractSummaryText(message)
      if (assistantText) {
        block.assistantText = block.assistantText
          ? `${block.assistantText}\n\n${assistantText}`
          : assistantText
        block.parts.push(`助手:\n${assistantText}`)
      }

      const callLines = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
        .map((toolCall, toolIndex) => {
          const name = String(toolCall?.function?.name || '').trim() || `tool_${toolIndex + 1}`
          const args = truncateInlineText(String(toolCall?.function?.arguments || '').trim() || '{}', 300)
          return `${name}: ${args}`
        })
        .filter(Boolean)
      if (callLines.length) {
        block.parts.push(`工具调用:\n${callLines.map((line) => `- ${line}`).join('\n')}`)
      }
      continue
    }

    if (message.role === 'tool') {
      const callId = String(message.tool_call_id || message.call_id || '').trim()
      const toolText = extractSummaryText(message) || '（空结果）'
      block.toolText = block.toolText ? `${block.toolText}\n\n${toolText}` : toolText
      block.parts.push(
        `工具结果${callId ? `（${callId}）` : ''}:\n${truncateText(toolText, 4000, '（工具结果已截断）')}`
      )
      continue
    }

    const otherText = extractSummaryText(message)
    if (otherText) block.parts.push(`${String(message.role || '消息')}:\n${otherText}`)
  }

  flushCurrentTurn()
  return segments
}

export function buildContextSummaryPrelude(summaryText = '') {
  const text = String(summaryText || '').trim()
  if (!text) return ''
  return [
    '以下是当前会话较早历史的压缩摘要，请将其视为背景，不要逐字复述：',
    text
  ].join('\n\n')
}
