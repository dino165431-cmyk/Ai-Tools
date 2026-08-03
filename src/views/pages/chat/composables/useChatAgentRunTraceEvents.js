import { isAgentRunToolResult } from '@/utils/chatToolDisplay'
import { mergeAgentRunTraceEntries } from '@/utils/chatAgentRun'

const BUILTIN_AGENTS_EVENT_FLUSH_INTERVAL_MS = 80
const MAX_PENDING_BUILTIN_AGENTS_EVENT_RETRIES = 100

export function mergeAgentRunLivePayload(base, incoming) {
  const merged = base && typeof base === 'object' ? { ...base } : {}
  const next = incoming && typeof incoming === 'object' ? incoming : {}
  if (next.reset === true) {
    merged.reset = true
    merged.status = Object.prototype.hasOwnProperty.call(next, 'status')
      ? next.status
      : 'running'
  } else if (Object.prototype.hasOwnProperty.call(next, 'status')) {
    merged.status = next.status
  }
  if (Object.prototype.hasOwnProperty.call(next, 'content')) merged.content = next.content
  if (Object.prototype.hasOwnProperty.call(next, 'reasoning')) merged.reasoning = next.reasoning
  if (Object.prototype.hasOwnProperty.call(next, 'round')) merged.round = next.round
  return merged
}

export function useChatAgentRunTraceEvents({
  getActiveMessages,
  getMemorySessions,
  isToolMessage,
  normalizeToolMessageStatus,
  getToolMessageStatus,
  buildToolExecutionMessageContent,
  extractServerNameFromToolMeta,
  scheduleRefreshUserAnchorMeta,
  maybeScheduleStreamingScroll
}) {
  const activeAgentRunToolMessageByStreamId = new Map()
  const pendingBuiltinAgentsEventsByStreamId = new Map()
  let pendingBuiltinAgentsEventsFlushTimer = null

  function resolveActiveAgentRunToolMessage(streamId) {
    const id = String(streamId || '').trim()
    if (!id) return null
    const direct = activeAgentRunToolMessageByStreamId.get(id)
    if (direct) return direct
    const activeHit = (getActiveMessages() || []).find(
      (msg) => String(msg?.toolTraceStreamId || '').trim() === id
    )
    if (activeHit) return activeHit
    for (const record of Array.isArray(getMemorySessions()) ? getMemorySessions() : []) {
      const recordHit = (record?.messages || []).find(
        (msg) => String(msg?.toolTraceStreamId || '').trim() === id
      )
      if (recordHit) return recordHit
    }
    return null
  }

  function updateAgentRunToolMessageTraceBatch(streamId, entries) {
    const id = String(streamId || '').trim()
    const nextEntries = (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry && typeof entry === 'object')
    if (!id || !nextEntries.length) return

    const messageRef = resolveActiveAgentRunToolMessage(id)
    if (!messageRef || !isToolMessage(messageRef)) return

    const current = Array.isArray(messageRef.toolLiveTrace) ? messageRef.toolLiveTrace : []
    const mergedTrace = mergeAgentRunTraceEntries(current, nextEntries)
    if (mergedTrace.length === current.length) {
      const latest = nextEntries[nextEntries.length - 1]
      const latestAgentName = String(latest?.agent_name || '').trim()
      if (latestAgentName && !messageRef.toolAgentName) {
        messageRef.toolAgentName = latestAgentName
      }
      return
    }

    messageRef.toolLiveTrace = mergedTrace
    const latestEntry = nextEntries[nextEntries.length - 1]
    const agentName = String(
      latestEntry?.agent_name || messageRef.toolAgentName || ''
    ).trim()
    if (agentName) messageRef.toolAgentName = agentName
    const isAgentRun = String(messageRef.toolName || '').trim() === 'agent_run'
    const isExpanded = messageRef.toolExpanded === true
    const subMeta = [
      messageRef.toolAgentName ? `智能体：${messageRef.toolAgentName}` : '',
      (!isAgentRun || isExpanded) && mergedTrace.length
        ? `${mergedTrace.length} 个轨迹步骤`
        : ''
    ].filter(Boolean).join(' · ')
    messageRef.toolSubMeta = subMeta
    const traceItemsForDisplay = isAgentRun && !isExpanded ? [] : mergedTrace
    const currentStatus = normalizeToolMessageStatus(getToolMessageStatus(messageRef)) || 'running'
    messageRef.content = buildToolExecutionMessageContent({
      serverName: messageRef.toolServerName || extractServerNameFromToolMeta(messageRef.toolMeta),
      toolName: messageRef.toolName,
      argsText: messageRef.toolArgsText || '{}',
      autoApproved: messageRef.toolAutoApproved,
      status: currentStatus,
      traceItems: traceItemsForDisplay
    })
    if (isExpanded) scheduleRefreshUserAnchorMeta()
    maybeScheduleStreamingScroll()
  }

  function updateAgentRunToolMessageLiveUpdate(streamId, live) {
    const id = String(streamId || '').trim()
    if (!id || !live || typeof live !== 'object') return

    const messageRef = resolveActiveAgentRunToolMessage(id)
    if (!messageRef || !isToolMessage(messageRef)) return

    if (live.reset === true) {
      messageRef.toolLiveFinalContent = ''
      messageRef.toolLiveFinalReasoning = ''
    }

    if (Object.prototype.hasOwnProperty.call(live, 'content')) {
      messageRef.toolLiveFinalContent = String(live.content || '')
    }
    if (Object.prototype.hasOwnProperty.call(live, 'reasoning')) {
      messageRef.toolLiveFinalReasoning = String(live.reasoning || '')
    }
    if (Object.prototype.hasOwnProperty.call(live, 'round')) {
      messageRef.toolLiveRound = Number(live.round) || 0
    }

    const nextPayload = isAgentRunToolResult(messageRef.toolResultPayload)
      ? { ...messageRef.toolResultPayload }
      : { kind: 'agent_run_result', status: 'running', trace: [] }
    const liveStatus = normalizeToolMessageStatus(live.status)
    const payloadStatus = normalizeToolMessageStatus(nextPayload.status)
    const nextStatus = liveStatus || (live.reset === true ? 'running' : payloadStatus || 'running')
    nextPayload.status = nextStatus
    nextPayload.final = {
      content: String(messageRef.toolLiveFinalContent || ''),
      reasoning: String(messageRef.toolLiveFinalReasoning || '')
    }
    nextPayload.summary = nextPayload.final.content
    nextPayload.trace = Array.isArray(messageRef.toolLiveTrace) ? messageRef.toolLiveTrace : []
    messageRef.toolResultPayload = nextPayload
    messageRef.toolStatus = nextStatus

    if (messageRef.toolExpanded === true) scheduleRefreshUserAnchorMeta()
    maybeScheduleStreamingScroll()
  }

  function applyPendingBuiltinAgentsEventBucket(streamId, bucket) {
    const id = String(streamId || '').trim()
    if (!id || !bucket) return false

    const messageRef = resolveActiveAgentRunToolMessage(id)
    if (!messageRef || !isToolMessage(messageRef)) return false

    if (Array.isArray(bucket.entries) && bucket.entries.length) {
      updateAgentRunToolMessageTraceBatch(id, bucket.entries)
    }
    if (bucket.live && typeof bucket.live === 'object') {
      updateAgentRunToolMessageLiveUpdate(id, bucket.live)
    }
    if (bucket.done === true) activeAgentRunToolMessageByStreamId.delete(id)
    return true
  }

  function flushPendingBuiltinAgentsEvents() {
    pendingBuiltinAgentsEventsFlushTimer = null
    if (!pendingBuiltinAgentsEventsByStreamId.size) return

    const pending = Array.from(pendingBuiltinAgentsEventsByStreamId.entries())
    pendingBuiltinAgentsEventsByStreamId.clear()
    pending.forEach(([streamId, bucket]) => {
      if (!streamId || !bucket) return
      if (!applyPendingBuiltinAgentsEventBucket(streamId, bucket)) {
        const retries = Number(bucket?.retries) || 0
        if (retries < MAX_PENDING_BUILTIN_AGENTS_EVENT_RETRIES) {
          pendingBuiltinAgentsEventsByStreamId.set(streamId, {
            entries: Array.isArray(bucket.entries) ? bucket.entries.slice() : [],
            live: bucket.live && typeof bucket.live === 'object' ? { ...bucket.live } : null,
            done: bucket.done === true,
            retries: retries + 1
          })
        }
      }
    })
    if (pendingBuiltinAgentsEventsByStreamId.size) {
      schedulePendingBuiltinAgentsEventsFlush()
    }
  }

  function schedulePendingBuiltinAgentsEventsFlush() {
    if (pendingBuiltinAgentsEventsFlushTimer) return
    pendingBuiltinAgentsEventsFlushTimer = window.setTimeout(
      flushPendingBuiltinAgentsEvents,
      BUILTIN_AGENTS_EVENT_FLUSH_INTERVAL_MS
    )
  }

  function handleBuiltinAgentsTraceEvent(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
    const streamId = String(detail.streamId || '').trim()
    const entry = detail.entry && typeof detail.entry === 'object' ? detail.entry : null
    const live = detail.live && typeof detail.live === 'object' ? detail.live : null
    if (!streamId) return
    const prev = pendingBuiltinAgentsEventsByStreamId.get(streamId) || {
      entries: [],
      live: null,
      done: false,
      retries: 0
    }
    const next = {
      entries: Array.isArray(prev.entries) ? prev.entries.slice() : [],
      live: prev.live && typeof prev.live === 'object' ? { ...prev.live } : null,
      done: prev.done === true,
      retries: Number(prev.retries) || 0
    }
    if (entry) next.entries.push(entry)
    if (live) next.live = mergeAgentRunLivePayload(next.live, live)
    if (detail.done === true) next.done = true
    pendingBuiltinAgentsEventsByStreamId.set(streamId, next)
    if (applyPendingBuiltinAgentsEventBucket(streamId, next)) {
      pendingBuiltinAgentsEventsByStreamId.delete(streamId)
      return
    }
    schedulePendingBuiltinAgentsEventsFlush()
  }

  function hasPendingBuiltinAgentsEvents(streamId) {
    const id = String(streamId || '').trim()
    return !!id && pendingBuiltinAgentsEventsByStreamId.has(id)
  }

  function cleanupPendingBuiltinAgentsEvents() {
    try {
      if (pendingBuiltinAgentsEventsFlushTimer) {
        window.clearTimeout(pendingBuiltinAgentsEventsFlushTimer)
        pendingBuiltinAgentsEventsFlushTimer = null
      }
    } catch {
      // ignore
    }
    pendingBuiltinAgentsEventsByStreamId.clear()
  }

  return {
    activeAgentRunToolMessageByStreamId,
    resolveActiveAgentRunToolMessage,
    updateAgentRunToolMessageTraceBatch,
    updateAgentRunToolMessageLiveUpdate,
    flushPendingBuiltinAgentsEvents,
    handleBuiltinAgentsTraceEvent,
    hasPendingBuiltinAgentsEvents,
    cleanupPendingBuiltinAgentsEvents
  }
}
