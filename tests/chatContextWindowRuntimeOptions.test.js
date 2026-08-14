import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateContextSummaryTriggerChars,
  buildChatContextWindowRuntimeOptions,
  hasChatContextWindowReduction,
  inspectChatContextWindow,
  normalizeChatContextWindowConfig,
  resolveChatContextWindowBudgetPlan,
  resolveContextSummaryLevel,
  resolveContextSummaryChain,
  resolveContextSummarySourceLabel,
  shouldSummarizeContextWindow
} from '../src/utils/chatContextWindow.js'

test('normalizeChatContextWindowConfig fills missing custom limits from the active preset defaults', () => {
  assert.deepEqual(normalizeChatContextWindowConfig({ preset: 'custom' }), {
    preset: 'custom',
    historyFocus: 'balanced',
    maxTurns: 1000,
    keepRecentTurnsFull: 256,
    maxMessages: 8000,
    maxTokens: 262144
  })
})

test('buildChatContextWindowRuntimeOptions preserves attachment recovery policy and provider-specific adjustments', () => {
  const options = buildChatContextWindowRuntimeOptions(
    {
      preset: 'custom',
      historyFocus: 'attachments',
      maxTurns: 12,
      keepRecentTurnsFull: 8,
      maxMessages: 64,
      maxCharsExpanded: 28000,
      maxCharsCompact: 36000
    },
    {
      providerKind: 'utools-ai',
      maxChars: 12345
    }
  )

  assert.equal(options.maxChars, 12345)
  assert.equal(options.maxMessages, 64)
  assert.equal(options.maxTurns, 12)
  assert.equal(options.keepRecentTurnsFull, 8)
  assert.ok(options.maxPinnedAttachmentTurns >= 4)
  assert.equal(options.toolPolicy, 'strip')
})

test('buildChatContextWindowRuntimeOptions defaults to full tool policy for standard providers', () => {
  const options = buildChatContextWindowRuntimeOptions(
    {
      preset: 'balanced',
      historyFocus: 'recent'
    },
    {
      providerKind: 'openai-compatible',
      maxChars: 6789
    }
  )

  assert.equal(options.maxChars, 6789)
  assert.equal(options.toolPolicy, 'full')
  assert.equal(options.maxPinnedAttachmentTurns, 0)
})

test('resolveChatContextWindowBudgetPlan keeps a single expanded budget (Codex style)', () => {
  const plan = resolveChatContextWindowBudgetPlan(
    {
      preset: 'balanced',
      historyFocus: 'balanced'
    },
    {
      reservedChars: 70000,
      sourceChars: 260000
    }
  )

  assert.equal(plan.expandedChars, Number.MAX_SAFE_INTEGER)
  assert.equal(plan.mode, 'expanded')
  assert.equal(plan.autoCompactActive, false)
  assert.equal(plan.autoCompactTriggerPercent, 85)
  assert.equal(plan.baseChars, 978576)
  assert.equal(plan.budgetUnit, 'char')
})

test('resolveChatContextWindowBudgetPlan keeps expanded budget below the trigger', () => {
  const plan = resolveChatContextWindowBudgetPlan(
    {
      preset: 'aggressive',
      historyFocus: 'recent'
    },
    {
      reservedChars: 12000,
      sourceChars: 70000
    }
  )

  assert.equal(plan.mode, 'expanded')
  assert.equal(plan.autoCompactActive, false)
  assert.equal(plan.baseChars, 512288)
})

test('resolveChatContextWindowBudgetPlan prefers reported input token calibration', () => {
  const plan = resolveChatContextWindowBudgetPlan(
    {
      preset: 'custom',
      maxTokensExpanded: 100000,
      maxTokensCompact: 80000,
      maxCharsExpanded: 400000,
      maxCharsCompact: 320000,
      autoCompactTriggerPercent: 80
    },
    {
      reservedChars: 20000,
      sourceChars: 180000,
      reportedInputTokens: 50000,
      reportedRequestChars: 100000
    }
  )

  assert.equal(plan.budgetUnit, 'token')
  assert.equal(plan.telemetryAvailable, true)
  assert.equal(plan.tokensPerChar, 0.5)
  assert.equal(plan.totalEstimatedTokens, 100000)
  assert.equal(plan.mode, 'expanded')
  assert.equal(plan.baseTokens, 100000)
  assert.equal(plan.historyTokensBudget, 90000)
  assert.equal(plan.historyCharsBudget, 180000)
})

test('resolveChatContextWindowBudgetPlan keeps character fallback when usage is unavailable', () => {
  const plan = resolveChatContextWindowBudgetPlan(
    { preset: 'balanced' },
    {
      reservedChars: 70000,
      sourceChars: 260000
    }
  )

  assert.equal(plan.budgetUnit, 'char')
  assert.equal(plan.telemetryAvailable, false)
  // 无遥测时使用保守换算（0.25 token/char）继续参与预算估算。
  assert.equal(plan.totalEstimatedTokens, 82500)
  assert.equal(plan.historyCharsBudget, 978576)
})

test('calculateContextSummaryTriggerChars uses history budget directly without re-subtracting reserved chars', () => {
  assert.equal(
    calculateContextSummaryTriggerChars({
      historyCharsBudget: 100000
    }),
    92000
  )

  assert.equal(
    calculateContextSummaryTriggerChars({
      historyCharsBudget: 8000
    }),
    8000
  )
})

test('shouldSummarizeContextWindow triggers on short but char-heavy chats', () => {
  assert.equal(
    shouldSummarizeContextWindow({
      sourceMessages: [{ role: 'user' }, { role: 'assistant' }],
      sourceChars: 13000,
      summaryTriggerChars: 12000
    }),
    true
  )

  assert.equal(
    shouldSummarizeContextWindow({
      sourceMessages: [{ role: 'user' }],
      sourceChars: 13000,
      summaryTriggerChars: 12000
    }),
    false
  )
})

test('hasChatContextWindowReduction detects dropped turns as reduction', () => {
  const longAttachmentText = 'continue with attachment\n\n銆愰檮浠跺唴瀹广€慭n闄勪欢锛歮anual.pdf\n' + 'A'.repeat(5000)
  const inspection = inspectChatContextWindow(
    [
      { role: 'user', content: longAttachmentText },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'latest user' },
      { role: 'assistant', content: 'latest answer' }
    ],
    {
      maxChars: 2600,
      maxMessages: 6,
      maxTurns: 2,
      keepRecentTurnsFull: 1,
      toolPolicy: 'full'
    }
  )

  assert.equal(inspection.messages.length, 2)
  assert.ok(inspection.inspection.entries.every((entry) => entry.mode === 'full'))
  assert.ok(inspection.inspection.omittedEntries.some((entry) => entry.kind === 'turn'))
  assert.equal(hasChatContextWindowReduction(inspection), true)
})

test('resolveContextSummaryLevel increments layered summaries while keeping the initial summary at level 1', () => {
  assert.equal(resolveContextSummaryLevel(null, false), 1)
  assert.equal(resolveContextSummaryLevel({}, false), 1)
  assert.equal(resolveContextSummaryLevel({ summaryLevel: 1 }, true), 2)
  assert.equal(resolveContextSummaryLevel({ summaryLevel: 3 }, true), 4)
})

test('resolveContextSummaryChain preserves layered summary ancestry', () => {
  assert.deepEqual(resolveContextSummaryChain(null, 1, false), [1])
  assert.deepEqual(resolveContextSummaryChain({ summaryLevel: 1 }, 2, true), [1, 2])
  assert.deepEqual(resolveContextSummaryChain({ summaryChain: [1, 2], summaryLevel: 2 }, 3, true), [1, 2, 3])
  assert.deepEqual(resolveContextSummaryChain({ summaryChain: [1, 1, 2] }, 1, true), [1, 2])
})

test('resolveContextSummarySourceLabel distinguishes fresh summaries from layered summaries', () => {
  assert.equal(resolveContextSummarySourceLabel(false), '全量前史')
  assert.equal(resolveContextSummarySourceLabel(true), '旧摘要 + 新增历史')
})
