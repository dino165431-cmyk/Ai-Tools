import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const chatSource = fs.readFileSync(
  path.resolve('src/views/pages/chat/Chat.vue'),
  'utf8'
)

function getFunctionSource(name, nextDeclaration) {
  const asyncDeclaration = `async function ${name}`
  const syncDeclaration = `function ${name}`
  const start = chatSource.indexOf(asyncDeclaration) >= 0
    ? chatSource.indexOf(asyncDeclaration)
    : chatSource.indexOf(syncDeclaration)
  const end = chatSource.indexOf(`\n${nextDeclaration}`, start + 1)
  assert.notEqual(start, -1, `missing function ${name}`)
  assert.notEqual(end, -1, `missing function boundary ${nextDeclaration}`)
  return chatSource.slice(start, end)
}

test('chat auxiliary model requests inherit the configured provider API mode', () => {
  const attachmentSummary = getFunctionSource(
    'buildAttachmentVisionRecallSummary',
    'async function enrichImageAttachmentsForMemoryRecall'
  )
  const sessionTitle = getFunctionSource(
    'requestSessionTitleFromModel',
    'async function moveAutoChatSessionAssetsForRename'
  )
  const contextSummary = getFunctionSource(
    'requestContextWindowSummary',
    'function resolveContextSummaryCoverage'
  )
  const titleDispatcher = getFunctionSource(
    'requestSessionTitleAsync',
    'async function autoPersistMemorySession'
  )
  const contextSummaryDispatcher = getFunctionSource(
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
