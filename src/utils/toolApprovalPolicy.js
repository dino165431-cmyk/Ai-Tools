function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

const READ_ONLY_TOOL_VERBS = new Set([
  'browse',
  'check',
  'count',
  'describe',
  'discover',
  'fetch',
  'find',
  'get',
  'inspect',
  'list',
  'lookup',
  'preview',
  'query',
  'read',
  'retrieve',
  'search',
  'status',
  'view'
])

const MUTATING_TOOL_VERBS = new Set([
  'add',
  'approve',
  'archive',
  'book',
  'cancel',
  'comment',
  'connect',
  'copy',
  'create',
  'delete',
  'disable',
  'disconnect',
  'edit',
  'enable',
  'execute',
  'follow',
  'import',
  'install',
  'invite',
  'like',
  'login',
  'logout',
  'move',
  'order',
  'patch',
  'pay',
  'publish',
  'purchase',
  'reject',
  'remove',
  'rename',
  'reply',
  'run',
  'save',
  'schedule',
  'send',
  'set',
  'share',
  'start',
  'stop',
  'submit',
  'subscribe',
  'uninstall',
  'update',
  'upload',
  'write'
])

const HARD_APPROVAL_TOOL_VERBS = new Set([
  'cancel',
  'delete',
  'disable',
  'disconnect',
  'invite',
  'order',
  'pay',
  'publish',
  'purchase',
  'remove',
  'reset',
  'send',
  'share',
  'submit',
  'uninstall'
])

function splitToolIdentifier(value) {
  return cleanText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function hasMutatingToolName(tool) {
  const tokens = splitToolIdentifier(tool?.name || tool?.toolName)
  return tokens.some((token) => MUTATING_TOOL_VERBS.has(token))
}

function hasConventionalReadOnlyName(tool) {
  const tokens = splitToolIdentifier(tool?.name || tool?.toolName)
  if (!tokens.length || !READ_ONLY_TOOL_VERBS.has(tokens[0])) return false
  return !hasMutatingToolName(tool)
}

export const TOOL_APPROVAL_MODE_MANUAL = 'manual'
export const TOOL_APPROVAL_MODE_SAFE = 'safe'
export const TOOL_APPROVAL_MODE_FULL = 'full'
export const TOOL_APPROVAL_MODE_DENY = 'deny'

export const TOOL_APPROVAL_MODES = Object.freeze([
  TOOL_APPROVAL_MODE_MANUAL,
  TOOL_APPROVAL_MODE_SAFE,
  TOOL_APPROVAL_MODE_FULL,
  TOOL_APPROVAL_MODE_DENY
])

export function normalizeToolApprovalMode(value, fallback = TOOL_APPROVAL_MODE_SAFE) {
  if (value === true) return TOOL_APPROVAL_MODE_SAFE
  if (value === false) return TOOL_APPROVAL_MODE_MANUAL

  const normalized = cleanText(value).toLowerCase()
  if (TOOL_APPROVAL_MODES.includes(normalized)) return normalized

  // Compatibility with the previous sub-agent modes.
  if (normalized === 'auto' || normalized === 'readonly') return TOOL_APPROVAL_MODE_SAFE

  const normalizedFallback = cleanText(fallback).toLowerCase()
  return TOOL_APPROVAL_MODES.includes(normalizedFallback)
    ? normalizedFallback
    : TOOL_APPROVAL_MODE_SAFE
}

export function normalizeUnattendedToolApprovalMode(value, fallback = TOOL_APPROVAL_MODE_SAFE) {
  const normalized = normalizeToolApprovalMode(value, fallback)
  if (
    normalized === TOOL_APPROVAL_MODE_FULL ||
    normalized === TOOL_APPROVAL_MODE_DENY ||
    normalized === TOOL_APPROVAL_MODE_SAFE
  ) {
    return normalized
  }
  return TOOL_APPROVAL_MODE_SAFE
}

export function getToolApprovalModeLabel(value) {
  const mode = normalizeToolApprovalMode(value)
  if (mode === TOOL_APPROVAL_MODE_MANUAL) return '每次确认'
  if (mode === TOOL_APPROVAL_MODE_FULL) return '高风险自动（强制确认除外）'
  if (mode === TOOL_APPROVAL_MODE_DENY) return '禁止调用'
  return '低风险自动'
}

export function evaluateToolApproval({
  mode = TOOL_APPROVAL_MODE_SAFE,
  forceApproval = false,
  hardApproval = false,
  interactive = true
} = {}) {
  const normalizedMode = normalizeToolApprovalMode(mode)

  if (normalizedMode === TOOL_APPROVAL_MODE_DENY) {
    return {
      action: 'deny',
      mode: normalizedMode,
      reason: 'tool_calls_disabled'
    }
  }

  if (hardApproval === true) {
    return {
      action: interactive ? 'prompt' : 'deny',
      mode: normalizedMode,
      reason: interactive ? 'hard_confirmation_required' : 'unattended_hard_confirmation_unavailable'
    }
  }

  if (normalizedMode === TOOL_APPROVAL_MODE_FULL) {
    return {
      action: 'allow',
      mode: normalizedMode,
      reason: 'full_auto'
    }
  }

  const requiresPrompt =
    normalizedMode === TOOL_APPROVAL_MODE_MANUAL ||
    forceApproval === true

  if (requiresPrompt) {
    return {
      action: interactive ? 'prompt' : 'deny',
      mode: normalizedMode,
      reason: interactive ? 'confirmation_required' : 'unattended_confirmation_unavailable'
    }
  }

  return {
    action: 'allow',
    mode: normalizedMode,
    reason: 'safe_auto'
  }
}

export function resolveMcpToolApprovalPolicy(tool) {
  const annotations =
    tool?.annotations && typeof tool.annotations === 'object' && !Array.isArray(tool.annotations)
      ? tool.annotations
      : {}
  const explicitlyReadOnly =
    annotations.readOnlyHint === true &&
    annotations.destructiveHint !== true
  const explicitlyMutating =
    annotations.readOnlyHint === false ||
    annotations.destructiveHint === true
  const inferredReadOnly =
    !explicitlyMutating &&
    !explicitlyReadOnly &&
    hasConventionalReadOnlyName(tool)
  const mutatingName = hasMutatingToolName(tool)
  const hardApprovalName = splitToolIdentifier(tool?.name || tool?.toolName)
    .some((token) => HARD_APPROVAL_TOOL_VERBS.has(token))
  const approvalReason =
    annotations.destructiveHint === true
      ? '服务声明此工具可能产生破坏性修改'
      : annotations.readOnlyHint === false
        ? '服务声明此工具并非只读操作'
        : mutatingName
          ? '工具名称表明它可能写入或改变外部状态'
          : explicitlyReadOnly
            ? '服务已声明此工具为只读操作'
            : inferredReadOnly
              ? '根据工具名称判定为只读查询'
              : '工具未声明只读，且无法可靠判定为查询操作'

  return {
    forceApproval: !(explicitlyReadOnly || inferredReadOnly),
    hardApproval: annotations.destructiveHint === true || hardApprovalName,
    approvalKind: 'tool',
    explicitlyReadOnly,
    inferredReadOnly,
    approvalReason
  }
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

export function normalizeSkillScriptApprovalArgs(
  args,
  {
    resolveSkill,
    resolveScript
  } = {}
) {
  const source = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  if (typeof resolveSkill !== 'function' || typeof resolveScript !== 'function') return source

  const idCandidate = cleanText(source.id ?? source._id ?? source.skillId ?? source.skill_id)
  const nameCandidate = cleanText(source.name ?? source.skillName ?? source.skill_name ?? source.skill)
  const pathCandidate = cleanText(source.path ?? source.script ?? source.scriptPath)
  const skill = resolveSkill({ idCandidate, nameCandidate })
  const script = skill ? resolveScript(skill, pathCandidate) : null
  if (!skill?._id || !script?.ok) return source

  const normalized = {
    skillId: String(skill._id),
    path: String(script.path),
    args: Array.isArray(source.args) ? source.args : []
  }
  if (Object.prototype.hasOwnProperty.call(source, 'input')) {
    normalized.input = source.input
  }
  const timeoutMs = Number(source.timeout_ms)
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    normalized.timeout_ms = timeoutMs
  }
  return normalized
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
