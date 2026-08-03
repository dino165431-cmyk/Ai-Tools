export function useChatMemorySessionRegistry({
  createId,
  defaultMemorySessionTitle,
  isChatSandboxWorkspaceId,
  buildChatSandboxWorkspaceId,
  normalizeMemoryCandidateQueue,
  deepCopyJson,
  normalizeToolApprovalMode,
  toolApprovalModeManual,
  toolApprovalModeSafe,
  memorySessions,
  activeMemorySessionId,
  session,
  autoApproveTools,
  activeSessionFilePath,
  activeSessionTitle
}) {
function createEmptyContextSummaryState() {
  return {
    summaryText: '',
    coveredMessageCount: 0,
    coveredTurnCount: 0,
    batchCount: 0,
    summaryLevel: 0,
    summaryChain: [],
    summarySourceLabel: '',
    sourceHash: '',
    updatedAt: 0
  }
}

function createEmptyContextTokenTelemetry() {
  return {
    inputTokens: 0,
    requestChars: 0,
    cachedTokens: 0,
    providerId: '',
    model: '',
    endpoint: '',
    updatedAt: 0
  }
}

function normalizeContextTokenTelemetry(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    inputTokens: Math.max(0, Math.floor(Number(source.inputTokens) || 0)),
    requestChars: Math.max(0, Math.floor(Number(source.requestChars) || 0)),
    cachedTokens: Math.max(0, Math.floor(Number(source.cachedTokens) || 0)),
    providerId: String(source.providerId || ''),
    model: String(source.model || ''),
    endpoint: String(source.endpoint || ''),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt) || 0))
  }
}

function createMemorySessionRecord(options = {}) {
  const now = Date.now()
  const id = String(options.id || '').trim() || `mem-${createId()}`
  const requestedSandboxWorkspaceId =
    String(options.sandboxWorkspaceId || options?.sandbox?.workspaceId || '').trim()
  const sandboxWorkspaceId = isChatSandboxWorkspaceId(requestedSandboxWorkspaceId)
    ? requestedSandboxWorkspaceId
    : buildChatSandboxWorkspaceId(id)
  return {
    id,
    sandboxWorkspaceId,
    title: String(options.title || '').trim() || defaultMemorySessionTitle,
    titleSource: String(options.titleSource || '').trim(),
    titleRetryCount: Number(options.titleRetryCount || 0) || 0,
    titlePostReplyRetryDone: options.titlePostReplyRetryDone === true,
    createdAt: Number(options.createdAt || 0) || now,
    titleReadyAt: Number(options.titleReadyAt || 0) || 0,
    updatedAt: Number(options.updatedAt || 0) || now,
    messages: Array.isArray(options.messages) ? options.messages : [],
    apiMessages: Array.isArray(options.apiMessages) ? options.apiMessages : [],
    input: String(options.input || ''),
    pendingAttachments: Array.isArray(options.pendingAttachments) ? options.pendingAttachments : [],
    memoryCandidates: normalizeMemoryCandidateQueue(options.memoryCandidates),
    memoryCandidateUpdatedAt: Number(options.memoryCandidateUpdatedAt || 0) || 0,
    memoryCandidateFlushTimer: null,
    memoryCandidateFlushInFlight: false,
    contextSummary: options.contextSummary && typeof options.contextSummary === 'object'
      ? deepCopyJson(options.contextSummary, {})
      : createEmptyContextSummaryState(),
    contextTokenTelemetry: normalizeContextTokenTelemetry(options.contextTokenTelemetry),
    toolApprovalMode: normalizeToolApprovalMode(
      options.toolApprovalMode,
      options.autoApproveTools === false ? toolApprovalModeManual : toolApprovalModeSafe
    ),
    autoApproveTools: normalizeToolApprovalMode(
      options.toolApprovalMode,
      options.autoApproveTools === false ? toolApprovalModeManual : toolApprovalModeSafe
    ) !== toolApprovalModeManual,
    activeSessionFilePath: String(options.activeSessionFilePath || '').trim(),
    activeSessionTitle: String(options.activeSessionTitle || '').trim(),
    state: options.state && typeof options.state === 'object' ? deepCopyJson(options.state, {}) : null,
    runningTaskCount: Number(options.runningTaskCount || 0) || 0,
    chatRunCount: Number(options.chatRunCount || 0) || 0,
    activeRequestAbortState: options.activeRequestAbortState || null,
    pendingApprovalRequests: [],
    approvalPromptActive: false,
    autoManaged: options.autoManaged === true
  }
}

function resolveMemorySessionSandboxWorkspaceId(record = null) {
  const target = record && typeof record === 'object' ? record : null
  const existing = String(target?.sandboxWorkspaceId || '').trim()
  if (isChatSandboxWorkspaceId(existing)) return existing
  const workspaceId = buildChatSandboxWorkspaceId(
    target?.id || activeMemorySessionId.value || 'default'
  )
  if (target) target.sandboxWorkspaceId = workspaceId
  return workspaceId
}

function getActiveMemorySession() {
  const id = String(activeMemorySessionId.value || '').trim()
  let record = memorySessions.value.find((item) => String(item?.id || '') === id)
  if (!record) {
    record = createMemorySessionRecord({
      messages: session.messages,
      apiMessages: session.apiMessages,
      autoApproveTools: autoApproveTools.value,
      activeSessionFilePath: activeSessionFilePath.value,
      activeSessionTitle: activeSessionTitle.value
    })
    memorySessions.value = [...memorySessions.value, record]
    activeMemorySessionId.value = record.id
  }
  return record
}

function getMemorySessionById(id) {
  const target = String(id || '').trim()
  return memorySessions.value.find((item) => String(item?.id || '') === target) || null
}

  return {
    createEmptyContextSummaryState,
    createEmptyContextTokenTelemetry,
    normalizeContextTokenTelemetry,
    createMemorySessionRecord,
    resolveMemorySessionSandboxWorkspaceId,
    getActiveMemorySession,
    getMemorySessionById
  }
}
