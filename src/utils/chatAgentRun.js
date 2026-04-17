import { isAgentRunToolResult } from '@/utils/chatToolDisplay'

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function parseToolArgsObject(argsText) {
  const parsed = safeJsonParse(String(argsText || '').trim() || '{}', {})
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function formatAgentRunStepTime(timeText) {
  const raw = String(timeText || '').trim()
  if (!raw) return ''
  const d = new Date(raw)
  if (!Number.isFinite(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function joinAgentRunMeta(parts) {
  return (Array.isArray(parts) ? parts : []).map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
}

export function mergeAgentRunTraceEntries(...inputs) {
  const out = []
  const seen = new Set()
  inputs.flat().forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const key = `${Number(entry?.idx) || ''}|${String(entry?.phase || '').trim()}|${String(entry?.at || '').trim()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(entry)
  })
  out.sort((a, b) => {
    const ai = Number(a?.idx)
    const bi = Number(b?.idx)
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi
    return String(a?.at || '').localeCompare(String(b?.at || ''))
  })
  return out
}

function findLatestOpenAgentRunStep(items, predicate) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!item || item.completed) continue
    if (typeof predicate === 'function' && predicate(item)) return item
  }
  return null
}

function createAgentRunToolStep(entry, index) {
  const serverName = String(entry?.server_name || entry?.server_id || '').trim()
  const toolName = String(entry?.tool_name || '').trim()
  return {
    id: `tool-${Number(entry?.idx) || index}`,
    kind: 'tool',
    status: 'running',
    completed: false,
    timeLabel: formatAgentRunStepTime(entry?.at),
    title: [serverName, toolName].filter(Boolean).join(' / ') || String(entry?.title || 'Tool Call').trim(),
    metaText: '',
    serverName,
    toolName,
    argsText: '',
    resultText: '',
    contentText: '',
    reasoningText: '',
    errorText: '',
    approvalStatus: '',
    round: 0
  }
}

export function isAgentRunToolName(toolName) {
  return String(toolName || '').trim() === 'agent_run'
}

export function isAgentRunToolMessage(msg) {
  const role = String(msg?.role || '').trim()
  return (role === 'tool' || role === 'tool_call') && isAgentRunToolName(msg?.toolName)
}

export function getAgentRunResultPayload(msg) {
  return isAgentRunToolResult(msg?.toolResultPayload) ? msg.toolResultPayload : null
}

export function getAgentRunArgsObject(msg) {
  return parseToolArgsObject(msg?.toolArgsText)
}

export function getAgentRunAgentName(msg) {
  const payload = getAgentRunResultPayload(msg)
  const argsObj = getAgentRunArgsObject(msg)
  return String(payload?.agent?.name || payload?.agent?.id || msg?.toolAgentName || argsObj?.agent_name || argsObj?.agent_id || '').trim()
}

export function getAgentRunTraceEntries(msg) {
  const payloadTrace = Array.isArray(getAgentRunResultPayload(msg)?.trace) ? getAgentRunResultPayload(msg).trace : []
  const liveTrace = Array.isArray(msg?.toolLiveTrace) ? msg.toolLiveTrace : []
  return mergeAgentRunTraceEntries(payloadTrace, liveTrace)
}

export function getAgentRunTaskText(msg) {
  const trace = getAgentRunTraceEntries(msg)
  const started = trace.find((entry) => String(entry?.phase || '').trim() === 'run.started')
  const fromTrace = String(started?.task_text || started?.task_excerpt || '').trim()
  if (fromTrace) return fromTrace
  return String(getAgentRunArgsObject(msg)?.task || '').trim()
}

export function getAgentRunFinalContent(msg) {
  const payload = getAgentRunResultPayload(msg)
  return String(payload?.final?.content || msg?.toolLiveFinalContent || payload?.summary || '').trim()
}

export function getAgentRunFinalReasoning(msg) {
  const payload = getAgentRunResultPayload(msg)
  return String(payload?.final?.reasoning || msg?.toolLiveFinalReasoning || '').trim()
}

export function buildAgentRunTimelineItems(msg) {
  const trace = getAgentRunTraceEntries(msg)
  const items = []
  const liveContent = String(msg?.toolLiveFinalContent || '').trim()
  const liveReasoning = String(msg?.toolLiveFinalReasoning || '').trim()

  trace.forEach((entry, index) => {
    const phase = String(entry?.phase || '').trim()
    if (!phase) return

    const timeLabel = formatAgentRunStepTime(entry?.at)
    const serverName = String(entry?.server_name || entry?.server_id || '').trim()
    const toolName = String(entry?.tool_name || '').trim()
    const providerName = String(entry?.provider_name || entry?.provider_id || '').trim()
    const model = String(entry?.model || '').trim()
    const round = Number(entry?.round)
    const durationMs = Number(entry?.duration_ms)

    if (phase === 'run.started') {
      items.push({
        id: `run-start-${Number(entry?.idx) || index}`,
        kind: 'task',
        status: 'success',
        completed: true,
        timeLabel,
        title: '任务',
        metaText: joinAgentRunMeta([
          entry?.agent_name ? `智能体 ${entry.agent_name}` : '',
          providerName,
          model
        ]),
        contentText: String(entry?.task_text || entry?.task_excerpt || '').trim(),
        reasoningText: '',
        argsText: '',
        resultText: '',
        errorText: ''
      })
      return
    }

    if (phase === 'profile.ready') {
      items.push({
        id: `profile-${Number(entry?.idx) || index}`,
        kind: 'system',
        status: 'success',
        completed: true,
        timeLabel,
        title: '运行环境已就绪',
        metaText: joinAgentRunMeta([
          providerName,
          model,
          Number(entry?.skill_count) > 0 ? `技能 ${entry.skill_count}` : '',
          Number(entry?.mcp_count) > 0 ? `MCP ${entry.mcp_count}` : ''
        ]),
        contentText: '',
        reasoningText: '',
        argsText: '',
        resultText: '',
        errorText: ''
      })
      return
    }

    if (phase === 'model.request') {
      items.push({
        id: `model-request-${Number(entry?.idx) || index}`,
        kind: 'assistant',
        status: 'running',
        completed: false,
        timeLabel,
        title: Number.isFinite(round) && round > 0 ? `模型请求 #${round}` : '模型请求',
        metaText: joinAgentRunMeta([
          providerName,
          model,
          Number(entry?.tool_count) > 0 ? `工具 ${entry.tool_count}` : ''
        ]),
        contentText: '',
        reasoningText: '',
        argsText: '',
        resultText: '',
        errorText: '',
        round
      })
      return
    }

    if (phase === 'model.response') {
      const current =
        findLatestOpenAgentRunStep(items, (item) => item.kind === 'assistant' && item.round === round) ||
        findLatestOpenAgentRunStep(items, (item) => item.kind === 'assistant')

      const next = current || {
        id: `model-response-${Number(entry?.idx) || index}`,
        kind: 'assistant',
        status: 'success',
        completed: true,
        timeLabel,
        title: Number.isFinite(round) && round > 0 ? `模型响应 #${round}` : '模型响应',
        metaText: '',
        contentText: '',
        reasoningText: '',
        argsText: '',
        resultText: '',
        errorText: '',
        round
      }

      next.status = 'success'
      next.completed = true
      next.timeLabel = timeLabel || next.timeLabel
      next.title = Number(entry?.tool_call_count) > 0 ? `模型选择了 ${entry.tool_call_count} 次工具调用` : next.title
      next.metaText = joinAgentRunMeta([
        providerName,
        model,
        Number(entry?.tool_call_count) > 0 ? `工具调用 ${entry.tool_call_count}` : ''
      ])
      next.contentText = String(entry?.content_text || entry?.content_excerpt || '').trim()
      next.reasoningText = String(entry?.reasoning_text || entry?.reasoning_excerpt || '').trim()
      next.round = round
      if (!current) items.push(next)
      return
    }

    if (phase.startsWith('tool.')) {
      const current =
        findLatestOpenAgentRunStep(
          items,
          (item) => item.kind === 'tool' && item.serverName === serverName && item.toolName === toolName
        ) || createAgentRunToolStep(entry, index)

      current.timeLabel = timeLabel || current.timeLabel
      current.title = [serverName, toolName].filter(Boolean).join(' / ') || current.title

      if (phase === 'tool.approval_required') {
        current.status = 'pending'
        current.approvalStatus = 'pending'
        current.argsText = String(entry?.args_text || entry?.args_excerpt || current.argsText || '').trim()
        current.reasoningText = String(entry?.reasoning_text || entry?.reasoning_excerpt || current.reasoningText || '').trim()
      } else if (phase === 'tool.approval_resolved') {
        const approvalStatus = String(entry?.approval_status || '').trim()
        current.approvalStatus = approvalStatus
        if (approvalStatus === 'approved') current.status = 'running'
        else {
          current.status = approvalStatus === 'aborted' ? 'error' : 'rejected'
          current.completed = true
          current.errorText = String(entry?.error || current.errorText || '').trim()
        }
      } else if (phase === 'tool.started') {
        current.status = 'running'
        current.approvalStatus = current.approvalStatus || 'approved'
        current.argsText = String(entry?.args_text || entry?.args_excerpt || current.argsText || '').trim()
      } else if (phase === 'tool.finished') {
        current.status = 'success'
        current.completed = true
        current.resultText = String(entry?.result_text || entry?.result_excerpt || '').trim()
      } else if (phase === 'tool.failed') {
        current.status = 'error'
        current.completed = true
        current.errorText = String(entry?.error || '').trim()
      } else if (phase === 'tool.blocked') {
        current.status = 'rejected'
        current.completed = true
        current.errorText = String(entry?.error || '').trim()
      } else if (phase === 'tool.aborted') {
        current.status = 'error'
        current.completed = true
        current.errorText = String(entry?.error || '已中止').trim()
      }

      current.metaText = joinAgentRunMeta([
        current.approvalStatus === 'pending' ? '等待批准' : '',
        current.approvalStatus === 'approved' ? '已批准' : '',
        current.status === 'running' ? '运行中' : ''
      ])

      if (!items.includes(current)) items.push(current)
      return
    }

    if (phase === 'run.finished') return

    items.push({
      id: `trace-${Number(entry?.idx) || index}`,
      kind: 'system',
      status: phase === 'run.failed' ? 'error' : phase === 'run.aborted' ? 'rejected' : 'success',
      completed: true,
      timeLabel,
      title:
        phase === 'run.finished'
          ? '已完成'
          : phase === 'run.failed'
            ? '失败'
            : phase === 'run.aborted'
              ? '已中止'
              : String(entry?.title || phase).trim(),
      metaText: joinAgentRunMeta([Number.isFinite(durationMs) && durationMs > 0 ? `${durationMs} ms` : '']),
      contentText: String(entry?.content_text || entry?.content_excerpt || entry?.task_text || entry?.task_excerpt || '').trim(),
      reasoningText: '',
      argsText: '',
      resultText: '',
      errorText: String(entry?.error || '').trim()
    })
  })

  if (liveContent || liveReasoning) {
    const currentAssistant =
      findLatestOpenAgentRunStep(items, (item) => item.kind === 'assistant') ||
      [...items].reverse().find((item) => item?.kind === 'assistant')
    if (currentAssistant) {
      if (liveReasoning) currentAssistant.reasoningText = liveReasoning
      const hasReasoning = !!String(currentAssistant.reasoningText || '').trim()
      if (liveContent && (currentAssistant.completed || hasReasoning)) {
        currentAssistant.contentText = liveContent
      }
    }
  }

  return items
}

export function getAgentRunOverviewChips(msg) {
  const payload = getAgentRunResultPayload(msg)
  const agentName = getAgentRunAgentName(msg)
  const traceCount = getAgentRunTraceEntries(msg).length
  const rounds = Number(payload?.metrics?.rounds)
  const toolCalls = Number(payload?.metrics?.tool_calls)
  const durationMs = Number(payload?.metrics?.duration_ms)
  const runtimeLabel = [payload?.runtime?.provider_name || payload?.runtime?.provider_id || '', payload?.runtime?.model || '']
    .filter(Boolean)
    .join(' / ')

  return [
    agentName ? `智能体：${agentName}` : '',
    runtimeLabel ? `运行时：${runtimeLabel}` : '',
    Number.isFinite(rounds) && rounds > 0 ? `轮次：${rounds}` : '',
    Number.isFinite(toolCalls) && toolCalls > 0 ? `工具：${toolCalls}` : '',
    traceCount > 0 ? `步骤：${traceCount}` : '',
    Number.isFinite(durationMs) && durationMs > 0 ? `${durationMs} ms` : ''
  ].filter(Boolean)
}

export function agentRunStepStatusLabel(step) {
  const status = String(step?.status || '').trim()
  if (status === 'pending') return '等待批准'
  if (status === 'running') return '运行中'
  if (status === 'error') return '失败'
  if (status === 'rejected') return '已拒绝'
  return '已完成'
}

export function shouldRenderAgentRunStructuredView(msg) {
  return isAgentRunToolMessage(msg) && (
    buildAgentRunTimelineItems(msg).length > 0 ||
    !!getAgentRunTaskText(msg) ||
    !!getAgentRunFinalContent(msg)
  )
}

export function getAgentRunExpandedStepIdSet(msg) {
  const list = Array.isArray(msg?.agentRunExpandedStepIds) ? msg.agentRunExpandedStepIds : []
  return new Set(list.map((item) => String(item || '').trim()).filter(Boolean))
}

export function isAgentRunStepExpanded(msg, step) {
  const stepId = String(step?.id || '').trim()
  if (!stepId) return false
  return getAgentRunExpandedStepIdSet(msg).has(stepId)
}

export function toggleAgentRunStepExpanded(msg, step) {
  if (!msg || !step) return false
  const stepId = String(step.id || '').trim()
  if (!stepId) return false
  const expanded = getAgentRunExpandedStepIdSet(msg)
  if (expanded.has(stepId)) expanded.delete(stepId)
  else expanded.add(stepId)
  msg.agentRunExpandedStepIds = Array.from(expanded)
  return expanded.has(stepId)
}

export function agentRunStepSummary(step, truncateText) {
  const summary = String(step?.metaText || '').trim()
  if (summary) return summary
  const limit = typeof truncateText === 'function' ? truncateText : (text, maxChars = 80) => {
    const raw = String(text || '')
    return raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw
  }
  const parts = [step?.reasoningText, step?.contentText, step?.argsText, step?.resultText, step?.errorText]
    .map((item) => limit(String(item || '').trim(), 80))
    .filter(Boolean)
  return parts[0] || ''
}
