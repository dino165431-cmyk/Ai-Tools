function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeToolApprovalArgs(args, argsText = '') {
  if (args && typeof args === 'object' && !Array.isArray(args)) return args
  const raw = cleanText(argsText)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeShellApprovalCommand(args, argsText = '') {
  const normalizedArgs = normalizeToolApprovalArgs(args, argsText)
  return {
    command: cleanText(normalizedArgs.command).replace(/\r\n?/g, '\n'),
    cwd: (cleanText(normalizedArgs.cwd) || '.').replace(/\\/g, '/')
  }
}

function sortApprovalValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortApprovalValue(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortApprovalValue(value[key])])
  )
}

export function buildSessionToolApprovalKey({
  sessionId = 'chat',
  serverId = '',
  serverName = '',
  toolName = '',
  approvalKind = 'tool',
  args = null,
  argsText = ''
} = {}) {
  const normalizedKind =
    approvalKind === 'shell'
      ? 'shell'
      : approvalKind === 'execution'
        ? 'execution'
        : 'tool'
  const scope =
    normalizedKind === 'shell'
      ? ['exact-command', normalizeShellApprovalCommand(args, argsText)]
      : normalizedKind === 'execution'
        ? ['exact-execution', sortApprovalValue(normalizeToolApprovalArgs(args, argsText))]
        : ['tool']

  return JSON.stringify([
    cleanText(sessionId) || 'chat',
    cleanText(serverId) || cleanText(serverName) || 'unknown',
    cleanText(toolName) || 'unknown',
    normalizedKind,
    scope
  ])
}
