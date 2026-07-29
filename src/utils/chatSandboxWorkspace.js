const CHAT_SANDBOX_WORKSPACE_PREFIX = 'chat-'
const MAX_CHAT_SANDBOX_WORKSPACE_ID_LENGTH = 80
const MAX_SANDBOX_DESCRIPTOR_COUNT = 8

function cleanLineValue(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim()
}

function formatAttachmentSize(size) {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${Math.floor(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function buildChatSandboxWorkspaceId(sessionId = 'default') {
  const normalizedSessionId = cleanLineValue(sessionId) || 'default'
  const safeSessionId = normalizedSessionId.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `${CHAT_SANDBOX_WORKSPACE_PREFIX}${safeSessionId}`
    .slice(0, MAX_CHAT_SANDBOX_WORKSPACE_ID_LENGTH)
}

export function buildChatAttachmentReferenceBlock(attachment = {}, options = {}) {
  const fallbackWorkspaceId = buildChatSandboxWorkspaceId(options.sessionId)
  const workspaceId = cleanLineValue(attachment?.sandboxWorkspaceId) || fallbackWorkspaceId
  const sandboxPath = cleanLineValue(attachment?.sandboxPath)
  const name = cleanLineValue(attachment?.name) || 'attachment'
  const size = formatAttachmentSize(attachment?.size)
  const mime = cleanLineValue(attachment?.mime)

  const lines = [
    `Attachment: ${name}`,
    size ? `Size: ${size}` : '',
    mime ? `Type: ${mime}` : ''
  ].filter(Boolean)

  if (sandboxPath) {
    lines.push(
      'The full attachment is stored in the chat sandbox and is not embedded in this prompt.',
      'Use the sandbox file tools to read it when its contents are needed.',
      `sandbox_workspace_id: ${workspaceId}`,
      `sandbox_path: ${sandboxPath}`
    )
  } else {
    lines.push('The attachment is not available in the chat sandbox.')
  }

  return lines.join('\n')
}

export function extractChatSandboxDescriptors(value) {
  const lines = String(value || '').split(/\r?\n/)
  const descriptors = []
  const seen = new Set()
  let workspaceId = ''

  for (const line of lines) {
    const workspaceMatch = String(line).match(
      /^\s*(?:sandbox_workspace_id|沙盒工作区)\s*[:：]\s*(.+?)\s*$/i
    )
    if (workspaceMatch) {
      workspaceId = cleanLineValue(workspaceMatch[1])
      continue
    }

    const pathMatch = String(line).match(
      /^\s*(?:sandbox_path|沙盒文件)\s*[:：]\s*(.+?)\s*$/i
    )
    if (!pathMatch) continue

    const sandboxPath = cleanLineValue(pathMatch[1])
    if (!workspaceId || !sandboxPath) continue
    const key = `${workspaceId}\n${sandboxPath}`
    if (seen.has(key)) continue
    seen.add(key)
    descriptors.push(`sandbox_workspace_id: ${workspaceId}\nsandbox_path: ${sandboxPath}`)
    if (descriptors.length >= MAX_SANDBOX_DESCRIPTOR_COUNT) break
  }

  return descriptors.join('\n\n')
}

export function withDefaultChatSandboxWorkspaceId(args, sessionId, options = {}) {
  const nextArgs = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {}
  if (options.hasHostWorkspace === true) return nextArgs
  if (cleanLineValue(nextArgs.workspace_id)) return nextArgs
  nextArgs.workspace_id = buildChatSandboxWorkspaceId(sessionId)
  return nextArgs
}

