import assert from 'node:assert/strict'
import test from 'node:test'

import { stripToolIdentityFromDisplayContent } from '../src/utils/chatToolDisplay.js'

test('expanded tool display removes duplicated identity blocks but keeps parameters and results', () => {
  const content = [
    '### 工具调用',
    '- 服务：**facebook-marketing-api**',
    '- 工具：`get_my_accounts`',
    '- 状态：**已完成**',
    '- 自动批准：**是**',
    '',
    '#### 参数',
    '',
    '```json',
    '{}',
    '```',
    '',
    '### 工具结果',
    '- 服务：**facebook-marketing-api**',
    '- 工具：`get_my_accounts`',
    '',
    '```json',
    '{"accounts":[]}',
    '```'
  ].join('\n')

  const display = stripToolIdentityFromDisplayContent(content)
  assert.doesNotMatch(display, /facebook-marketing-api/)
  assert.doesNotMatch(display, /自动批准/)
  assert.match(display, /#### 参数/)
  assert.match(display, /\{"accounts":\[\]\}/)
})

test('expanded tool display preserves unrelated markdown sections', () => {
  const content = '### 执行摘要\n\n没有发现异常。'
  assert.equal(stripToolIdentityFromDisplayContent(content), content)
})
