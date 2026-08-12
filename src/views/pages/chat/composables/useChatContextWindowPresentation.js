import { computed } from 'vue'
import {
  CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS,
  CHAT_CONTEXT_WINDOW_PRESETS,
  estimateMessagesSize,
  resolveChatContextWindowBudgetPlan
} from '@/utils/chatContextWindow'
import { isUtoolsBuiltinProvider } from '@/utils/utoolsAiProvider'
import { resolveModelContextWindowTokens } from '@/utils/providerModelConfig'

export const contextWindowPresetOptions = [
  {
    label: '紧凑',
    value: 'aggressive',
    description: CHAT_CONTEXT_WINDOW_PRESETS.aggressive.description
  },
  {
    label: '平衡',
    value: 'balanced',
    description: CHAT_CONTEXT_WINDOW_PRESETS.balanced.description
  },
  {
    label: '宽松',
    value: 'wide',
    description: CHAT_CONTEXT_WINDOW_PRESETS.wide.description
  },
  {
    label: '最大',
    value: 'max',
    description: CHAT_CONTEXT_WINDOW_PRESETS.max.description
  },
  {
    label: '自定义',
    value: 'custom',
    description: '手动控制轮次、消息数量和字符预算。'
  }
]

export const contextWindowHistoryFocusOptions = [
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.recent.label,
    value: 'recent',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.recent.description
  },
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.balanced.label,
    value: 'balanced',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.balanced.description
  },
  {
    label: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.attachments.label,
    value: 'attachments',
    description: CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_PRESETS.attachments.description
  }
]

export function formatApproxChars(value) {
  const num = Math.max(0, Math.floor(Number(value) || 0))
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`
  return String(num)
}

export function buildContextWindowBudgetItem({ key, label, used, max, formatter = null, hint = '' } = {}) {
  const normalize = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? Math.max(0, num) : 0
  }
  const formatValue = typeof formatter === 'function' ? formatter : (value) => String(Math.round(normalize(value)))
  const safeUsed = normalize(used)
  const safeMax = normalize(max)
  const ratio = safeMax > 0 ? safeUsed / safeMax : 0
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)))
  let tone = 'safe'
  if (ratio >= 0.95) tone = 'critical'
  else if (ratio >= 0.8) tone = 'warning'

  return {
    key,
    label,
    used: safeUsed,
    max: safeMax,
    usedLabel: formatValue(safeUsed),
    maxLabel: formatValue(safeMax),
    ratio,
    percent,
    tone,
    hint
  }
}

export function hasContextWindowHardBudgetReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : []
  return list.some((reason) => reason === 'turn_limit' || reason === 'message_limit' || reason === 'char_limit')
}

export function hasContextWindowSoftBudgetReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : []
  return list.some((reason) => reason === 'prelude_budget_exhausted') || hasContextWindowHardBudgetReason(list)
}

export function matchesContextWindowOmittedFilter(entry, filterKey = 'all') {
  const key = String(filterKey || 'all')
  const reasons = Array.isArray(entry?.reasons) ? entry.reasons : []
  if (key === 'budget') return hasContextWindowSoftBudgetReason(reasons)
  if (key === 'attachments') {
    return !!entry?.hasAttachment || reasons.some((reason) => reason === 'attachment_policy_disabled' || reason === 'attachment_displacement')
  }
  if (key === 'prelude') return entry?.kind === 'prelude'
  return true
}

export function contextWindowPreviewModeLabel(entry) {
  const mode = String(entry?.mode || '')
  if (mode === 'prelude') return '前导'
  if (mode === 'full') return '完整'
  if (mode === 'compact') return '压缩'
  if (mode === 'attachment_summary') return '附件摘要'
  if (mode === 'pinned_attachment_summary') return '回补附件'
  return '保留'
}

export function contextWindowPreviewModeType(entry) {
  const mode = String(entry?.mode || '')
  if (mode === 'full') return 'success'
  if (mode === 'compact' || mode === 'attachment_summary') return 'warning'
  if (mode === 'pinned_attachment_summary') return 'info'
  return 'default'
}

export function contextWindowPreviewEntryLabel(entry, index) {
  if (entry?.kind === 'prelude') return '系统前导消息'
  if (entry?.kind === 'pinned_attachment_summary') {
    const turnNumber = Number(entry?.index)
    return Number.isFinite(turnNumber) ? `附件回补 | 第 ${turnNumber + 1} 轮` : `附件回补 | 第 ${index + 1} 项`
  }
  const turnNumber = Number(entry?.index)
  return Number.isFinite(turnNumber) ? `第 ${turnNumber + 1} 轮` : `片段 ${index + 1}`
}

export function contextWindowPreviewEntryNote(entry) {
  if (entry?.omitted) {
    const reasons = Array.isArray(entry?.reasons) ? entry.reasons : []
    if (entry?.kind === 'prelude') return '前导消息只保留预算内还能放下的最新部分。'
    if (reasons.includes('attachment_displacement')) {
      return entry?.hasAttachment ? '这条附件轮次被更高优先级的上下文挤出。' : '为了保留附件历史，这条普通轮次被挤出。'
    }
    if (reasons.includes('attachment_policy_disabled')) return '这条历史里包含较早的附件，但当前策略不会回补它们。'
    if (reasons.includes('turn_limit') || reasons.includes('message_limit') || reasons.includes('char_limit')) {
      return '当前上下文预算已满，这段历史不会发送给模型。'
    }
    return '这段历史未被纳入当前请求上下文。'
  }
  if (entry?.kind === 'prelude') return '它会插入到历史消息之前，只保留预算允许的最新部分。'
  if (entry?.kind === 'pinned_attachment_summary') return '这条附件来自更早历史，当前以摘要锚点的形式回补。'
  if (entry?.mode === 'attachment_summary') return '原始轮次已压缩为附件摘要。'
  if (entry?.mode === 'compact') return entry?.hasAttachment ? '该轮次已压缩，并优先保留了附件内容。' : '该轮次已压缩，较长文本或工具内容被裁剪。'
  if (entry?.mustKeep) return '这是最新轮次，默认按最高优先级保留。'
  if (entry?.hasAttachment) return '该轮次包含附件上下文，当前按完整轮次保留。'
  return ''
}

export function contextWindowPreviewOmittedReasonLabel(reason) {
  const key = String(reason || '')
  if (key === 'turn_limit') return '超过轮次预算'
  if (key === 'message_limit') return '超过消息预算'
  if (key === 'char_limit') return '超过字符预算'
  if (key === 'attachment_policy_disabled') return '附件回补已关闭'
  if (key === 'prelude_budget_exhausted') return '前导预算不足'
  if (key === 'attachment_displacement') return '被附件优先级挤出'
  return '未纳入'
}

export function contextWindowPreviewOmittedReasonType(reason) {
  const key = String(reason || '')
  if (key === 'attachment_policy_disabled') return 'info'
  if (key === 'prelude_budget_exhausted') return 'default'
  return 'warning'
}

export function contextWindowPreviewModeLabelV2(entry) {
  const mode = String(entry?.mode || '')
  const variant = String(entry?.variant || mode || '')
  if (mode === 'compact') {
    if (variant === 'compact_text') return '强压缩'
    if (variant === 'compact_tight') return '极强压缩'
    if (variant === 'compact_adaptive') return '自适应压缩'
  }
  return contextWindowPreviewModeLabel(entry)
}

export function contextWindowPreviewEntryNoteV2(entry) {
  if (entry?.mode === 'compact' && !entry?.omitted && !entry?.hasAttachment) {
    const variant = String(entry?.variant || 'compact')
    if (variant === 'compact_text') return '该轮次已进入强压缩，较长文本会截短，并尽量保留前后关键内容。'
    if (variant === 'compact_tight') return '该轮次已进入更强压缩，为了保住更多历史，只保留了更精简的上下文。'
    if (variant === 'compact_adaptive') return '该轮次已按剩余预算自适应压缩，尽量在不超预算的前提下保留更多历史。'
  }
  return contextWindowPreviewEntryNote(entry)
}

export function useChatContextWindowPresentation({
  contextWindowStats,
  contextWindowBudgetPlan,
  contextWindowPreviewState,
  showContextWindowModal,
  contextWindowPreviewConfig,
  contextWindowPresetLabel,
  contextWindowHistoryFocusLabel,
  contextWindowHistoryFocusBehaviorText,
  effectiveToolMode,
  selectedProvider,
  selectedModel,
  lastBuiltRequestToolsStats,
  systemContent,
  session,
  getCurrentToolsKey,
  getContextTokenTelemetry,
  getMemorySessionById,
  activeMemorySessionId,
  contextWindowPreviewOmittedFilter
}) {
  const contextWindowSummaryTag = computed(() => {
    const stats = contextWindowStats.value
    if (stats.telemetryAvailable) {
      return `上下文 ${formatApproxChars(stats.totalEstimatedTokens)} / ${formatApproxChars(stats.baseTokens)} Token`
    }
    return `上下文 ${formatApproxChars(stats.totalEstimatedChars)} / ${formatApproxChars(stats.baseChars)} 字符`
  })

  const contextWindowSummaryText = computed(() => {
    const stats = contextWindowStats.value
    const modeText = effectiveToolMode.value === 'compact' ? '精简工具模式' : '展开工具模式'
    const budgetText = stats.telemetryAvailable
      ? `上下文预算以最近一次真实输入 ${formatApproxChars(stats.reportedInputTokens)} Token 校准；当前预计 ${formatApproxChars(stats.totalEstimatedTokens)}/${formatApproxChars(stats.baseTokens)} Token。`
      : `当前端点尚未返回可用的输入 Token，暂按 ${formatApproxChars(stats.totalEstimatedChars)}/${formatApproxChars(stats.baseChars)} 字符预算估算。`
    const toolBudgetText = stats.toolEstimateFresh
      ? `工具定义预留：约 ${formatApproxChars(stats.toolSchemaChars)}，共 ${stats.toolCount} 个工具。`
      : '工具定义预留会在首次构建请求工具后显示。'
    const attachmentText = stats.rawAttachmentCount
      ? `附件轮次保留：${stats.requestAttachmentCount}/${stats.rawAttachmentCount}，其中摘要 ${stats.attachmentSummaryCount} 条。`
      : '当前历史里没有附件轮次。'
    return `${contextWindowPresetLabel.value} / ${contextWindowHistoryFocusLabel.value}；本次预计发送 ${stats.requestTurns}/${stats.rawTurns || 0} 轮、${stats.requestCount}/${stats.rawCount || 0} 条消息（${modeText}）。${budgetText} 系统提示词约占 ${formatApproxChars(stats.systemChars)} 字符。${attachmentText}${toolBudgetText}`
  })

  const contextWindowProviderHint = computed(() => {
    const stats = contextWindowStats.value
    const toolEstimateHint = stats.toolEstimateFresh
      ? `最近一次工具定义大小约为 ${formatApproxChars(stats.toolSchemaChars)}。`
      : '工具定义大小会在首次请求构建工具后显示。'
    const attachmentHint = stats.rawAttachmentCount
      ? stats.attachmentSummaryCount
        ? `附件轮次保留 ${stats.requestAttachmentCount}/${stats.rawAttachmentCount}；其中 ${stats.attachmentSummaryCount} 条较早内容会压缩成摘要。`
        : `附件轮次保留 ${stats.requestAttachmentCount}/${stats.rawAttachmentCount}；当前仍全部按完整轮次保留。`
      : ''
    if (isUtoolsBuiltinProvider(selectedProvider.value)) {
      return `${contextWindowHistoryFocusBehaviorText.value}uTools AI 路径会自动去掉历史 tool/tool_calls，只保留纯文本的用户与助手记录。${attachmentHint}${toolEstimateHint}`
    }
    return `${contextWindowHistoryFocusBehaviorText.value}OpenAI 兼容路径会保留最近工具链，较老的工具轮次会自动压缩，避免无效上下文挤占窗口。${attachmentHint}${toolEstimateHint}`
  })

  const contextWindowPreviewInspection = computed(() => (
    showContextWindowModal.value
      ? contextWindowPreviewState.value
      : { messages: [], inspection: { entries: [], omittedEntries: [], messageCount: 0, turnCount: 0, preludeCount: 0 } }
  ))

  const contextWindowPreviewEntries = computed(() => (
    Array.isArray(contextWindowPreviewInspection.value?.inspection?.entries)
      ? contextWindowPreviewInspection.value.inspection.entries
      : []
  ))

  const contextWindowPreviewOmittedEntries = computed(() => (
    Array.isArray(contextWindowPreviewInspection.value?.inspection?.omittedEntries)
      ? contextWindowPreviewInspection.value.inspection.omittedEntries
      : []
  ))

  const contextWindowPreviewBudgetStats = computed(() => {
    const inspection = contextWindowPreviewInspection.value?.inspection
    const entries = contextWindowPreviewEntries.value
    const previewConfig = contextWindowPreviewConfig.value
    const providerKind = isUtoolsBuiltinProvider(selectedProvider.value) ? 'utools-ai' : 'openai-compatible'
    const currentToolsKey = getCurrentToolsKey()
    const toolEstimateFresh =
      !!lastBuiltRequestToolsStats.updatedAt && String(lastBuiltRequestToolsStats.key || '') === currentToolsKey
    const toolSchemaChars = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.chars || 0) : 0
    const toolCount = toolEstimateFresh ? Number(lastBuiltRequestToolsStats.count || 0) : 0
    const systemChars = String(systemContent.value || '').length
    const reservedChars = systemChars + toolSchemaChars
    const rawMessages = Array.isArray(session.apiMessages) ? session.apiMessages : []
    const tokenTelemetry = getContextTokenTelemetry()
    const budgetPlan = resolveChatContextWindowBudgetPlan(previewConfig, {
      reservedChars,
      sourceChars: estimateMessagesSize(rawMessages),
      reportedInputTokens: tokenTelemetry.inputTokens,
      reportedRequestChars: tokenTelemetry.requestChars,
      modelContextTokens: resolveModelContextWindowTokens(selectedProvider.value, selectedModel.value)
    })
    const historyCharsUsed = entries.reduce((total, entry) => total + Number(entry?.chars || 0), 0)
    const requestEstimatedTokens = budgetPlan.telemetryAvailable
      ? Math.max(0, Math.ceil((historyCharsUsed + reservedChars) * budgetPlan.tokensPerChar))
      : 0

    return {
      turnBudget: providerKind === 'utools-ai' ? Math.min(32, previewConfig.maxTurns + 2) : previewConfig.maxTurns,
      turnUsed: entries.filter((entry) => entry?.kind === 'turn').length,
      messageBudget: previewConfig.maxMessages,
      messageUsed: Number(inspection?.messageCount || 0),
      historyCharsBudget: budgetPlan.historyCharsBudget,
      historyCharsUsed,
      baseChars: budgetPlan.baseChars,
      baseTokens: budgetPlan.baseTokens,
      requestEstimatedTokens,
      telemetryAvailable: budgetPlan.telemetryAvailable,
      reservedChars,
      systemChars,
      toolSchemaChars,
      toolCount,
      toolEstimateFresh
    }
  })

  const contextWindowPreviewBudgetItems = computed(() => {
    const stats = contextWindowPreviewBudgetStats.value
    const primaryBudgetItem = stats.telemetryAvailable
      ? buildContextWindowBudgetItem({
          key: 'input_tokens',
          label: '上下文 Token',
          used: stats.requestEstimatedTokens,
          max: stats.baseTokens,
          formatter: formatApproxChars,
          hint: '依据最近一次接口返回的输入 Token 与请求体大小校准，展示本次预计输入。'
        })
      : buildContextWindowBudgetItem({
          key: 'history_chars',
          label: '历史字符',
          used: stats.historyCharsUsed,
          max: stats.historyCharsBudget,
          formatter: formatApproxChars,
          hint: '端点尚未返回输入 Token，当前使用字符预算兜底。'
        })
    return [
      buildContextWindowBudgetItem({
        key: 'turns',
        label: '轮次预算',
        used: stats.turnUsed,
        max: stats.turnBudget,
        hint: '这里只统计真实用户轮次；附件回补摘要不占用轮次预算。'
      }),
      buildContextWindowBudgetItem({
        key: 'messages',
        label: '消息预算',
        used: stats.messageUsed,
        max: stats.messageBudget,
        hint: '消息数直接受 maxMessages 限制，压缩后通常会下降。'
      }),
      primaryBudgetItem,
      buildContextWindowBudgetItem({
        key: 'reserved_chars',
        label: '预留开销',
        used: stats.reservedChars,
        max: stats.baseChars,
        formatter: formatApproxChars,
        hint: stats.toolEstimateFresh
          ? `系统提示词约占 ${formatApproxChars(stats.systemChars)}；工具定义约占 ${formatApproxChars(stats.toolSchemaChars)}。`
          : `系统提示词约占 ${formatApproxChars(stats.systemChars)}；工具定义大小会在构建后计入。`
      })
    ]
  })

  const contextWindowPreviewBudgetSummaryText = computed(() => {
    const stats = contextWindowPreviewBudgetStats.value
    if (stats.telemetryAvailable) {
      const usageText = `${formatApproxChars(stats.requestEstimatedTokens)} / ${formatApproxChars(stats.baseTokens)} Token`
      if (!stats.messageUsed) return `当前还没有可发送的历史；预计输入 ${usageText}。`
      return `本次预计输入 ${usageText}；预算已按最近一次真实 usage 校准。`
    }
    const historyUsageText = `${formatApproxChars(stats.historyCharsUsed)} / ${formatApproxChars(stats.historyCharsBudget)}`
    const reservedText = `${formatApproxChars(stats.reservedChars)} / ${formatApproxChars(stats.baseChars)}`
    if (!stats.messageUsed) return `当前还没有可发送的历史；已预留预算 ${reservedText}。`
    return `历史字符 ${historyUsageText}；已预留预算 ${reservedText}。`
  })

  const contextWindowBudgetStatus = computed(() => {
    const items = contextWindowPreviewBudgetItems.value
    const omittedEntries = contextWindowPreviewOmittedEntries.value
    const hardBudgetTrim = omittedEntries.some((entry) => hasContextWindowHardBudgetReason(entry?.reasons))
    const softBudgetTrim = omittedEntries.some((entry) => hasContextWindowSoftBudgetReason(entry?.reasons))
    const pressureItems = items.filter((item) => item.ratio >= 0.8)
    const strongestRatio = items.reduce((max, item) => Math.max(max, Number(item?.ratio || 0)), 0)
    const driverText = pressureItems
      .slice(0, 2)
      .map((item) => `${item.label} ${item.usedLabel}/${item.maxLabel}`)
      .join(', ')

    if (hardBudgetTrim || strongestRatio >= 0.98) {
      const lead = driverText ? `预算已满：${driverText}。` : '预算已满。'
      return {
        level: 'critical',
        tagType: 'error',
        tagSuffix: '预算已满',
        text: `${lead}继续增加内容会直接裁掉更早的历史。`,
        tooltip: hardBudgetTrim
          ? `${lead}由于轮次、消息数或字符预算限制，已有部分历史被裁掉。`
          : `${lead}当前上下文窗口几乎没有剩余空间。`
      }
    }

    if (softBudgetTrim || strongestRatio >= 0.8) {
      const lead = driverText ? `预算偏紧：${driverText}。` : '预算偏紧。'
      return {
        level: 'warning',
        tagType: 'warning',
        tagSuffix: '预算紧张',
        text: `${lead}继续增加内容可能会压缩或裁掉更早的历史。`,
        tooltip: softBudgetTrim
          ? `${lead}由于预算压力，部分较早的前导消息或历史已经被排除。`
          : `${lead}如果继续增加内容，最早的轮次会优先被压缩。`
      }
    }

    return {
      level: 'safe',
      tagType: 'default',
      tagSuffix: '',
      text: '',
      tooltip: '当前上下文窗口仍有可用预算。'
    }
  })

  const contextWindowSummaryPercent = computed(() => {
    const pressure = Number(contextWindowBudgetPlan.value?.effectivePressure || 0)
    return Math.max(0, Math.min(100, Math.round(pressure * 100)))
  })

  const contextWindowSummaryLevel = computed(() => {
    const pressure = Number(contextWindowBudgetPlan.value?.effectivePressure || 0)
    if (pressure >= 0.95) return 'critical'
    if (pressure >= 0.8) return 'warning'
    if (pressure >= 0.6) return 'info'
    return 'safe'
  })

  const contextWindowSummaryTagType = computed(() => {
    const level = contextWindowSummaryLevel.value
    if (level === 'critical') return 'error'
    if (level === 'warning') return 'warning'
    if (level === 'info') return 'info'
    return 'success'
  })

  const contextWindowSummaryTooltipText = computed(() => {
    const budgetTooltip = String(contextWindowBudgetStatus.value?.tooltip || '').trim()
    if (!budgetTooltip) return contextWindowSummaryText.value
    return `${contextWindowSummaryText.value} ${budgetTooltip}`.trim()
  })

  const activeMemorySessionContextSummary = computed(() => {
    const activeRecord = getMemorySessionById(activeMemorySessionId.value)
    return activeRecord && typeof activeRecord.contextSummary === 'object' ? activeRecord.contextSummary : null
  })

  const contextWindowCompressedSummaryText = computed(() => String(activeMemorySessionContextSummary.value?.summaryText || '').trim())
  const contextWindowCompressedSummaryMetaText = computed(() => {
    const summary = activeMemorySessionContextSummary.value
    const turnCount = Math.max(0, Math.floor(Number(summary?.coveredTurnCount || 0)))
    const messageCount = Math.max(0, Math.floor(Number(summary?.coveredMessageCount || 0)))
    const summaryLevel = Math.max(0, Math.floor(Number(summary?.summaryLevel || 0)))
    const resolvedSummaryLevel = summaryLevel > 0 && Number.isFinite(summaryLevel)
      ? summaryLevel
      : (contextWindowCompressedSummaryText.value ? 1 : 0)
    if (!contextWindowCompressedSummaryText.value) return ''
    const parts = []
    if (resolvedSummaryLevel > 0) parts.push(`第 ${resolvedSummaryLevel} 代摘要`)
    if (turnCount > 0) parts.push(`${turnCount} 轮`)
    if (messageCount > 0) parts.push(`${messageCount} 条消息`)
    return parts.join(' · ')
  })

  const contextWindowCompressedSummaryChainText = computed(() => {
    const summaryChain = Array.isArray(activeMemorySessionContextSummary.value?.summaryChain)
      ? activeMemorySessionContextSummary.value.summaryChain
      : []
    const chainLevels = summaryChain
      .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
      .filter((value) => value > 0)
    if (chainLevels.length <= 1) return ''
    return `摘要链：${chainLevels.map((level) => `第 ${level} 代`).join(' → ')}`
  })

  const contextWindowCompressedSummarySourceText = computed(() => {
    const sourceLabel = String(activeMemorySessionContextSummary.value?.summarySourceLabel || '').trim()
    if (!contextWindowCompressedSummaryText.value) return ''
    return sourceLabel ? `来源：${sourceLabel}` : ''
  })

  const contextWindowPreviewSummaryText = computed(() => {
    const inspection = contextWindowPreviewInspection.value?.inspection
    const omittedCount = Array.isArray(inspection?.omittedEntries) ? inspection.omittedEntries.length : 0
    if (!inspection?.messageCount) {
      return omittedCount ? `当前没有可发送的历史；已有 ${omittedCount} 段历史被省略。` : '当前没有可发送的历史。'
    }
    return omittedCount
      ? `当前展示 ${contextWindowPreviewEntries.value.length} 段已纳入上下文的片段，共 ${inspection.messageCount} 条消息；另有 ${omittedCount} 段被省略。`
      : `当前展示 ${contextWindowPreviewEntries.value.length} 段已纳入上下文的片段，共 ${inspection.messageCount} 条消息。`
  })

  const contextWindowPreviewOmittedFilterOptions = computed(() => {
    const entries = contextWindowPreviewOmittedEntries.value
    const options = [
      { value: 'all', label: '全部', count: entries.length },
      { value: 'budget', label: '预算', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'budget')).length },
      { value: 'attachments', label: '附件', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'attachments')).length },
      { value: 'prelude', label: '前导', count: entries.filter((entry) => matchesContextWindowOmittedFilter(entry, 'prelude')).length }
    ]
    return options.filter((option) => option.value === 'all' || option.count > 0)
  })

  const contextWindowPreviewResolvedOmittedFilter = computed(() => {
    const active = String(contextWindowPreviewOmittedFilter.value || 'all')
    return contextWindowPreviewOmittedFilterOptions.value.some((option) => option.value === active) ? active : 'all'
  })

  const contextWindowPreviewFilteredOmittedEntries = computed(() => (
    contextWindowPreviewOmittedEntries.value.filter((entry) => (
      matchesContextWindowOmittedFilter(entry, contextWindowPreviewResolvedOmittedFilter.value)
    ))
  ))

  const contextWindowPreviewOmittedSummaryText = computed(() => {
    const omittedEntries = contextWindowPreviewOmittedEntries.value
    if (!omittedEntries.length) return ''
    const filteredCount = contextWindowPreviewFilteredOmittedEntries.value.length
    if (filteredCount === omittedEntries.length) {
      return `当前展示 ${omittedEntries.length} 段被省略的历史及其主要原因。`
    }
    return `当前筛选下展示 ${filteredCount}/${omittedEntries.length} 段被省略的历史。`
  })

  const contextWindowPreviewHelpers = {
    modeType: contextWindowPreviewModeType,
    modeLabel: contextWindowPreviewModeLabelV2,
    entryLabel: contextWindowPreviewEntryLabel,
    entryNote: contextWindowPreviewEntryNoteV2,
    omittedReasonType: contextWindowPreviewOmittedReasonType,
    omittedReasonLabel: contextWindowPreviewOmittedReasonLabel,
    formatApproxChars
  }

  return {
    contextWindowSummaryTag,
    contextWindowSummaryText,
    contextWindowProviderHint,
    contextWindowPreviewEntries,
    contextWindowPreviewOmittedEntries,
    contextWindowPreviewBudgetItems,
    contextWindowPreviewBudgetSummaryText,
    contextWindowBudgetStatus,
    contextWindowSummaryPercent,
    contextWindowSummaryLevel,
    contextWindowSummaryTagType,
    contextWindowSummaryTooltipText,
    contextWindowCompressedSummaryText,
    contextWindowCompressedSummaryMetaText,
    contextWindowCompressedSummaryChainText,
    contextWindowCompressedSummarySourceText,
    contextWindowPreviewSummaryText,
    contextWindowPreviewOmittedSummaryText,
    contextWindowPreviewOmittedFilterOptions,
    contextWindowPreviewResolvedOmittedFilter,
    contextWindowPreviewFilteredOmittedEntries,
    contextWindowPreviewHelpers
  }
}
