export function isAgentRunToolResult(result) {
  return !!result && typeof result === 'object' && !Array.isArray(result) && result.kind === 'agent_run_result'
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
  const summary = String(payload?.summary || payload?.final?.content || '').trim()
  const reasoning = String(payload?.final?.reasoning || '').trim()
  const errorText = String(payload?.error || '').trim()
  const trace = Array.isArray(payload?.trace) ? payload.trace : []

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
