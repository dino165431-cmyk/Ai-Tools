import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8')
}

test('chat remembers the selected approval mode and exposes complete trust', () => {
  const source = readSource('src/views/pages/chat/Chat.vue')
  const configSource = readSource('public/preload/utils/global-config.js')

  assert.match(source, /完全信任（任何工具都直接批准）/)
  assert.match(source, /key:\s*TOOL_APPROVAL_MODE_TRUSTED/)
  assert.match(source, /updateChatConfig\(\{\s*toolApprovalMode:\s*nextMode\s*}\)/)
  assert.match(
    source,
    /toolApprovalMode:\s*normalizeToolApprovalMode\(chatConfig\.value\?\.toolApprovalMode\)/
  )
  assert.match(configSource, /toolApprovalMode:\s*'safe'/)
  assert.match(configSource, /\['manual', 'safe', 'full', 'trusted', 'deny']/)
})

test('chat high-risk mode distinguishes ordinary and destructive command execution', () => {
  const source = readSource('src/views/pages/chat/Chat.vue')
  const catalogSource = readSource('public/preload/builtin-skills/index.js')

  assert.match(source, /isDangerousShellApprovalCommand\(argsObj,\s*argsText\)/)
  assert.match(source, /普通写入、常规命令和一般代码/)
  assert.match(source, /直接批准所有工具调用，包括命令、主机代码执行、删除及其他破坏性操作/)
  assert.match(catalogSource, /name === 'notebook_execute_cell'/)
  assert.match(catalogSource, /name === 'notebook_execute_all'/)
  assert.doesNotMatch(
    catalogSource,
    /hardApproval:\s*[\s\S]{0,100}\|\|\s*isShell\s*\|\|/
  )
})
