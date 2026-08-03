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
