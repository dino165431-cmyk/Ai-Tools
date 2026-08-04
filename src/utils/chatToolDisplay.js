export function isAgentRunToolResult(result) {
  return !!result && typeof result === 'object' && !Array.isArray(result) && result.kind === 'agent_run_result'
}

export function inferStructuredToolResultStatus(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''

  const status = String(result.status || '').trim().toLowerCase()
  if (['rejected', 'denied'].includes(status)) return 'rejected'
  if (['error', 'failed', 'failure'].includes(status)) return 'error'
  if (['aborted', 'stopped', 'cancelled', 'canceled'].includes(status)) return 'stopped'
  if (status === 'paused') return 'paused'
  if (status === 'running') return 'running'
  if (['success', 'succeeded', 'completed', 'complete', 'ok'].includes(status)) return 'success'

  if (result.rejected === true || result.denied === true) return 'rejected'
  if (result.timedOut === true || result.timeout === true) return 'error'
  if (result.ok === false || result.isError === true) return 'error'

  const exitCode = Number(result.exitCode ?? result.exit_code)
  if (Number.isFinite(exitCode) && exitCode !== 0) return 'error'
  if (result.error && result.ok !== true) return 'error'
  if (result.ok === true) return 'success'
  return ''
}

function normalizeSandboxExitCode(result) {
  const raw = result?.exitCode ?? result?.exit_code
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

function compactSandboxFailureText(value, maxChars = 480) {
  const text = String(value?.message || value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text
}

export function getSandboxToolResultPresentation(result, statusRaw = '') {
  const payload = result && typeof result === 'object' && !Array.isArray(result) ? result : {}
  const requestedStatus = String(statusRaw || '').trim().toLowerCase()
  const status = ['running', 'paused', 'stopped', 'success', 'error', 'rejected'].includes(requestedStatus)
    ? requestedStatus
    : inferStructuredToolResultStatus(payload) || 'success'
  const exitCode = normalizeSandboxExitCode(payload)
  const isFailure = status === 'error' || status === 'rejected' || status === 'stopped'
  const files = payload.changedFiles || payload.imported || payload.files
  const hasPartialResult = isFailure && (
    !!String(payload.stdout || '').trim() ||
    !!String(payload.stderr || '').trim() ||
    (Array.isArray(files) && files.length > 0)
  )

  let notice = ''
  if (status === 'rejected') {
    notice = compactSandboxFailureText(payload.error || payload.message) || '命令调用已被拒绝，未确认整体执行成功。'
  } else if (status === 'stopped') {
    notice = compactSandboxFailureText(payload.error || payload.message) || '命令执行已停止，未确认整体执行成功。'
  } else if (status === 'error') {
    if (payload.timedOut === true || payload.timeout === true) {
      notice = '命令执行超时。'
    } else {
      notice = compactSandboxFailureText(payload.error || payload.errorMessage || payload.message)
      if (!notice && exitCode !== null) notice = `命令以退出码 ${exitCode} 结束。`
      if (!notice) notice = compactSandboxFailureText(payload.stderr)
      if (!notice) notice = '命令未成功完成。'
    }
  }

  return {
    status,
    exitCode,
    isFailure,
    hasPartialResult,
    notice
  }
}

export function inferToolDisplayContentStatus(content) {
  const text = String(content || '').replace(/\r\n?/g, '\n').trim()
  if (!text) return ''
  if (/^TOOL_REJECTED(?:\s|$)/i.test(text)) return 'rejected'

  // Only inspect the display metadata before the first fenced payload. Tool output is
  // arbitrary user-controlled text and may legitimately contain words such as
  // "error", "failed", or "rejected".
  const metadata = text.split(/^\s*```/m, 1)[0]
  const statusMatch = metadata.match(/^\s*-\s*(?:状态|status)\s*[：:]\s*(.+?)\s*$/im)
  if (statusMatch) {
    const status = String(statusMatch[1] || '')
      .replace(/[*_`]/g, '')
      .trim()
      .toLowerCase()
    if (['已拒绝', '拒绝', 'rejected', 'denied'].includes(status)) return 'rejected'
    if (['失败', '错误', 'error', 'failed', 'failure'].includes(status)) return 'error'
    if (['已停止', '已中止', 'stopped', 'aborted', 'cancelled', 'canceled'].includes(status)) return 'stopped'
    if (['已暂停', 'paused'].includes(status)) return 'paused'
    if (['运行中', '正在执行', 'running'].includes(status)) return 'running'
    if (['已完成', '成功', 'success', 'succeeded', 'completed', 'complete', 'ok'].includes(status)) return 'success'
  }

  if (/^\s*-\s*(?:错误|error)\s*[：:]/im.test(metadata)) return 'error'
  if (/^(?:错误|error)\s*[：:]/i.test(metadata)) return 'error'
  return ''
}

function resolveAgentRunTraceText(trace, phases, fieldNames) {
  const phaseSet = phases instanceof Set ? phases : new Set(Array.isArray(phases) ? phases : [])
  const traceList = Array.isArray(trace) ? trace : []
  const keys = Array.isArray(fieldNames) && fieldNames.length ? fieldNames : ['content_text', 'content_excerpt']

  for (let i = traceList.length - 1; i >= 0; i -= 1) {
    const entry = traceList[i]
    if (!entry || typeof entry !== 'object') continue
    const phase = String(entry?.phase || '').trim()
    if (!phaseSet.has(phase)) continue
    for (const key of keys) {
      const text = String(entry?.[key] || '').trim()
      if (text) return text
    }
  }

  return ''
}

function resolveAgentRunFinalContent(payload, trace) {
  const explicitContent = String(payload?.final?.content || payload?.summary || payload?.content || '').trim()
  if (explicitContent) return explicitContent
  const status = String(payload?.status || '').trim()
  if (status === 'running' || status === 'paused') return ''
  return resolveAgentRunTraceText(trace, new Set(['run.finished', 'model.response']))
}

function resolveAgentRunFinalReasoning(payload, trace) {
  const explicitReasoning = String(payload?.final?.reasoning || payload?.reasoning || '').trim()
  if (explicitReasoning) return explicitReasoning
  const status = String(payload?.status || '').trim()
  if (status === 'running' || status === 'paused') return ''
  return resolveAgentRunTraceText(
    trace,
    new Set(['run.finished', 'model.response']),
    ['reasoning_text', 'reasoning_excerpt']
  )
}

export function formatAgentRunTraceEntry(entry, options = {}) {
  const truncateInlineText =
    typeof options.truncateInlineText === 'function'
      ? options.truncateInlineText
      : (text, maxChars = 160) => String(text || '').slice(0, maxChars)

  const item = entry && typeof entry === 'object' ? entry : {}
  const timeText = String(item.at || '').trim()
  const time = timeText ? new Date(timeText) : null
  const hhmmss =
    time && Number.isFinite(time.getTime())
      ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`
      : ''

  const title = String(item.title || item.phase || '步骤').trim()
  const extras = []
  const providerName = String(item.provider_name || item.provider_id || '').trim()
  const model = String(item.model || '').trim()
  const serverName = String(item.server_name || item.server_id || '').trim()
  const toolName = String(item.tool_name || '').trim()
  const round = Number(item.round)
  const toolCount = Number(item.tool_count)
  const toolCallCount = Number(item.tool_call_count)
  const skillCount = Number(item.skill_count)
  const mcpCount = Number(item.mcp_count)
  const durationMs = Number(item.duration_ms)
  const error = String(item.error || '').trim()
  const excerpt = String(
    item.content_excerpt || item.result_excerpt || item.args_excerpt || item.reasoning_excerpt || item.task_excerpt || ''
  ).trim()

  if (providerName) extras.push(providerName)
  if (model) extras.push(`模型=${model}`)
  if (serverName && !toolName) extras.push(`服务=${serverName}`)
  if (toolName) extras.push(`工具=${toolName}`)
  if (Number.isFinite(round) && round > 0) extras.push(`轮次=${round}`)
  if (Number.isFinite(toolCount) && toolCount > 0) extras.push(`工具=${toolCount}`)
  if (Number.isFinite(toolCallCount) && toolCallCount > 0) extras.push(`工具调用=${toolCallCount}`)
  if (Number.isFinite(skillCount) && skillCount > 0) extras.push(`技能=${skillCount}`)
  if (Number.isFinite(mcpCount) && mcpCount > 0) extras.push(`MCP=${mcpCount}`)
  if (Number.isFinite(durationMs) && durationMs > 0) extras.push(`${durationMs}ms`)
  if (error) extras.push(`错误=${truncateInlineText(error, 120)}`)
  if (!error && excerpt) extras.push(truncateInlineText(excerpt, 120))

  const lead = hhmmss ? `[${hhmmss}] ` : ''
  return `- ${lead}${title}${extras.length ? ` | ${extras.join(' | ')}` : ''}`
}

export function formatAgentRunToolResultForDisplay(result, options = {}) {
  const payload = result && typeof result === 'object' ? result : {}
  const serverName = String(options.serverName || '').trim() || 'MCP'
  const toolName = String(options.toolName || '').trim() || 'agent_run'
  const imageHint = String(options.imageHint || '').trim()
  const statusRaw = String(payload.status || '').trim()
  const statusText =
    statusRaw === 'completed'
      ? '已完成'
      : statusRaw === 'paused'
        ? '已暂停'
      : statusRaw === 'aborted'
        ? '已中止'
        : statusRaw === 'error'
          ? '失败'
          : statusRaw || '未知'
  const agentName = String(payload?.agent?.name || payload?.agent?.id || '').trim() || '未知智能体'
  const providerName = String(payload?.runtime?.provider_name || payload?.runtime?.provider_id || '').trim()
  const model = String(payload?.runtime?.model || '').trim()
  const durationMs = Number(payload?.metrics?.duration_ms)
  const rounds = Number(payload?.metrics?.rounds)
  const toolCalls = Number(payload?.metrics?.tool_calls)
  const errorText = String(payload?.error || '').trim()
  const trace = Array.isArray(payload?.trace) ? payload.trace : []
  const summary = resolveAgentRunFinalContent(payload, trace)
  const reasoning = resolveAgentRunFinalReasoning(payload, trace)

  const lines = [
    '### 子智能体执行结果',
    `- 服务：**${serverName}**`,
    `- 工具：\`${toolName}\``,
    `- 智能体：**${agentName}**`,
    `- 状态：**${statusText}**`
  ]

  if (providerName || model) lines.push(`- 运行时：${[providerName, model].filter(Boolean).join(' / ')}`)
  if (Number.isFinite(durationMs) && durationMs > 0) lines.push(`- 耗时：**${durationMs} ms**`)
  if (Number.isFinite(rounds) && rounds > 0) lines.push(`- 轮次：**${rounds}**`)
  if (Number.isFinite(toolCalls) && toolCalls > 0) lines.push(`- 工具调用：**${toolCalls}**`)
  if (trace.length) lines.push(`- 轨迹：**${trace.length}** 步`)
  if (imageHint) lines.push(imageHint)

  if (summary) lines.push('', '#### 最终输出', '', summary)
  if (reasoning) lines.push('', '#### 推理摘要', '', reasoning)
  if (errorText) lines.push('', '#### 错误', '', errorText)
  if (trace.length) {
    lines.push('', '#### 执行过程', '')
    trace.forEach((item) => {
      lines.push(formatAgentRunTraceEntry(item, options))
    })
  }

  return lines.join('\n').trim()
}

export function formatToolResultDisplayContent(result, options = {}) {
  const heading = String(options.heading || '### 工具结果').trim() || '### 工具结果'
  const serverName = String(options.serverName || '').trim() || '未知'
  const toolName = String(options.toolName || '').trim() || ''
  const imageHint = String(options.imageHint || '')
  const resultText = String(options.resultText || '').trim()

  if (isAgentRunToolResult(result)) {
    return formatAgentRunToolResultForDisplay(result, options)
  }

  return `${heading}\n- 服务：**${serverName}**\n- 工具：\`${toolName}\`\n${imageHint}\n\`\`\`json\n${resultText}\n\`\`\``
}

export function stripToolIdentityFromDisplayContent(content) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let strippingIdentityBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#{2,4}\s+.*工具(?:调用|结果)(?:失败)?\s*$/i.test(trimmed)) {
      strippingIdentityBlock = true
      continue
    }
    if (
      strippingIdentityBlock &&
      /^-\s*(?:服务|工具|状态|自动批准|自动审批)\s*[：:]/.test(trimmed)
    ) {
      continue
    }
    if (strippingIdentityBlock && !trimmed) continue
    strippingIdentityBlock = false
    output.push(line)
  }

  return output
    .join('\n')
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
