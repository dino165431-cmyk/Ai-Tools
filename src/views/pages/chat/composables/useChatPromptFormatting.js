import { stableStringify } from '@/utils/chatProviderStreaming'
import { normalizeMcpPromptArgumentDefinitions } from '@/utils/mcpArgumentForm'
import { renderPromptTemplate } from '@/utils/promptConfig'

export function normalizeMcpPromptList(server, list) {
  const serverId = String(server?._id || '').trim()
  const serverName = String(server?.name || serverId).trim()
  return (Array.isArray(list) ? list : [])
    .map((prompt) => {
      const name = String(prompt?.name || '').trim()
      if (!name) return null
      const description = String(prompt?.description || '').trim()
      return {
        serverId,
        serverName,
        name,
        label: `${serverName} / ${name}`,
        description,
        arguments: normalizeMcpPromptArgumentDefinitions(prompt),
        disabled: !!server?.disabled
      }
    })
    .filter(Boolean)
}

export function stringifyPromptContentBlock(content) {
  if (content === undefined || content === null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(stringifyPromptContentBlock).filter(Boolean).join('\n\n')
  if (typeof content !== 'object') return String(content)

  const type = String(content.type || '').trim()
  if (type === 'text') return String(content.text || '').trim()
  if (type === 'image') return `[图片${content.mimeType ? `：${content.mimeType}` : ''}]`
  if (type === 'audio') return `[音频${content.mimeType ? `：${content.mimeType}` : ''}]`
  if (type === 'resource') {
    const resource = content.resource && typeof content.resource === 'object' ? content.resource : {}
    if (typeof resource.text === 'string') return resource.text
    if (resource.uri) return `[资源：${resource.uri}]`
  }
  if (content.uri) return `[资源：${content.uri}]`
  return stableStringify(content)
}

export function formatMcpPromptResultForComposer(result, item) {
  const messages = Array.isArray(result?.messages) ? result.messages : []
  const serverName = String(item?.serverName || item?.serverId || '').trim()
  const promptName = String(item?.name || '').trim()
  const header = `MCP Prompt: ${[serverName, promptName].filter(Boolean).join(' / ')}`

  if (!messages.length) {
    const fallback = stringifyPromptContentBlock(result?.content ?? result?.text ?? result)
    return fallback ? `${header}\n\n${fallback}` : header
  }

  const blocks = messages
    .map((messageItem) => {
      const role = String(messageItem?.role || 'user').trim()
      const content = stringifyPromptContentBlock(messageItem?.content).trim()
      if (!content) return ''
      const roleLabel = role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role === 'system' ? 'System' : role
      return `${roleLabel}:\n${content}`
    })
    .filter(Boolean)

  return [header, ...blocks].filter(Boolean).join('\n\n').trim()
}

export function formatLocalUserPromptForComposer(prompt, values) {
  const content = renderPromptTemplate(prompt?.content, values).trim()
  return content
}
