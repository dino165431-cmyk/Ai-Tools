import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const chatSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/Chat.vue'),
  'utf8'
)
const sessionManagerSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatSessionManager.js'),
  'utf8'
)
const requestRunnerSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/composables/useChatRequestRunner.js'),
  'utf8'
)
const chatMemorySource = fs.readFileSync(
  path.resolve('src/utils/chatMemory.js'),
  'utf8'
)

function getFunctionSource(source, name, nextDeclaration) {
  const asyncDeclaration = `async function ${name}`
  const syncDeclaration = `function ${name}`
  const start = source.indexOf(asyncDeclaration) >= 0
    ? source.indexOf(asyncDeclaration)
    : source.indexOf(syncDeclaration)
  const end = source.indexOf(nextDeclaration, start + 1)
  assert.notEqual(start, -1, `missing function ${name}`)
  assert.notEqual(end, -1, `missing function boundary ${nextDeclaration}`)
  return source.slice(start, end)
}

test('chat auxiliary model requests inherit the configured provider API mode', () => {
  const attachmentSummary = getFunctionSource(
    chatSource,
    'buildAttachmentVisionRecallSummary',
    'async function enrichImageAttachmentsForMemoryRecall'
  )
  const sessionTitle = getFunctionSource(
    sessionManagerSource,
    'requestSessionTitleFromModel',
    'async function moveAutoChatSessionAssetsForRename'
  )
  const contextSummary = getFunctionSource(
    requestRunnerSource,
    'requestContextWindowSummary',
    'function resolveContextSummaryCoverage'
  )
  const titleDispatcher = getFunctionSource(
    sessionManagerSource,
    'requestSessionTitleAsync',
    'async function autoPersistMemorySession'
  )
  const contextSummaryDispatcher = getFunctionSource(
    requestRunnerSource,
    'ensureContextWindowSummary',
    'function syncContextSummaryCacheForRecord'
  )

  assert.match(chatSource, /apiMode:\s*normalizeProviderApiMode\(provider\.apiMode\)/)
  assert.match(chatSource, /apiMode:\s*normalizeProviderApiMode\(chatRequestConfig\?\.apiMode\)/)
  assert.match(attachmentSummary, /const apiMode = normalizeProviderApiMode\(requestCfg\?\.apiMode\)/)
  assert.match(attachmentSummary, /\bapiMode,\s*\n\s*body:/)
  assert.match(sessionTitle, /apiMode\s*=\s*'auto'/)
  assert.match(sessionTitle, /\bapiMode,\s*\n\s*body:/)
  assert.match(contextSummary, /apiMode\s*=\s*'auto'/)
  assert.match(contextSummary, /\bapiMode,\s*\n\s*body:/)

  assert.match(
    titleDispatcher,
    /requestSessionTitleFromModel\(\{[\s\S]*?apiMode:\s*normalizeProviderApiMode\(cfg\?\.apiMode\)/
  )
  assert.match(
    contextSummaryDispatcher,
    /requestContextWindowSummary\(\{[\s\S]*?apiMode:\s*normalizeProviderApiMode\(cfg\.apiMode\)/
  )
})

test('inline context compaction reports only freshly generated summaries', () => {
  const inlineCompaction = getFunctionSource(
    requestRunnerSource,
    'maybeCompactContextInline',
    'function pushCompactResumeStep'
  )
  const contextSummaryDispatcher = getFunctionSource(
    requestRunnerSource,
    'ensureContextWindowSummary',
    'function syncContextSummaryCacheForRecord'
  )

  assert.match(inlineCompaction, /returnMeta:\s*true/)
  assert.match(inlineCompaction, /summaryResult\?\.generated\s*===\s*true/)
  assert.match(inlineCompaction, /const tailMessages = sourceMessages\.slice\(cachedCoveredCount\)/)
  assert.match(inlineCompaction, /compactionBudgetPlan = tailBudgetState\.budgetPlan/)
  assert.match(contextSummaryDispatcher, /returnMeta\s*=\s*false/)
  assert.match(contextSummaryDispatcher, /return finish\(cached\.summaryText, false\)/)
  assert.match(contextSummaryDispatcher, /if \(!normalizedSummaryText\) return finish\(\)/)
  assert.match(contextSummaryDispatcher, /return finish\(requestRecord\.contextSummary\.summaryText, true\)/)
})

test('chat auxiliary model requests do not force a sampling temperature', () => {
  const auxiliaryRequests = [
    getFunctionSource(
      chatSource,
      'buildAttachmentVisionRecallSummary',
      'async function enrichImageAttachmentsForMemoryRecall'
    ),
    getFunctionSource(
      sessionManagerSource,
      'requestSessionTitleFromModel',
      'async function moveAutoChatSessionAssetsForRename'
    ),
    getFunctionSource(
      requestRunnerSource,
      'requestContextWindowSummary',
      'function resolveContextSummaryCoverage'
    ),
    getFunctionSource(
      chatMemorySource,
      'requestMemoryExtraction',
      'function buildRecallText'
    )
  ]

  auxiliaryRequests.forEach((source) => {
    assert.doesNotMatch(source, /\btemperature\s*:/)
  })
})
