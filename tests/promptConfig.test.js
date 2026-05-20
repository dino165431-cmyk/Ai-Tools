import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROMPT_TYPE_SYSTEM,
  PROMPT_TYPE_USER,
  normalizePromptType,
  isSystemPrompt,
  isUserPrompt,
  extractPromptVariables,
  countPromptVariables,
  buildPromptVariableValues,
  renderPromptTemplate
} from '@/utils/promptConfig'

test('normalizePromptType keeps backward compatibility for missing or unknown types', () => {
  assert.equal(normalizePromptType(), PROMPT_TYPE_SYSTEM)
  assert.equal(normalizePromptType(''), PROMPT_TYPE_SYSTEM)
  assert.equal(normalizePromptType('SYSTEM'), PROMPT_TYPE_SYSTEM)
  assert.equal(normalizePromptType('user'), PROMPT_TYPE_USER)
  assert.equal(normalizePromptType('other'), PROMPT_TYPE_SYSTEM)
})

test('prompt type helpers distinguish system and user prompts', () => {
  assert.equal(isSystemPrompt({ type: 'system' }), true)
  assert.equal(isSystemPrompt({}), true)
  assert.equal(isUserPrompt({ type: 'user' }), true)
  assert.equal(isUserPrompt({ type: 'system' }), false)
})

test('extractPromptVariables parses names descriptions defaults and deduplicates by name', () => {
  const vars = extractPromptVariables('你好 {{name|姓名}}，主题 {{topic=默认主题}}，再次 {{name}}')
  assert.deepEqual(vars, [
    {
      name: 'name',
      displayName: 'name',
      description: '姓名',
      default: undefined,
      required: true,
      type: 'string'
    },
    {
      name: 'topic',
      displayName: 'topic',
      description: '',
      default: '默认主题',
      required: false,
      type: 'string'
    }
  ])
  assert.equal(countPromptVariables('A {{x}} B {{x=1}} C {{y}}'), 2)
})

test('buildPromptVariableValues enforces required variables and fills defaults', () => {
  const params = extractPromptVariables('{{name}} {{topic=默认主题}}')
  assert.throws(() => buildPromptVariableValues(params, { name: '   ' }), /请填写变量/)
  assert.deepEqual(buildPromptVariableValues(params, { name: '小明' }), {
    name: '小明',
    topic: '默认主题'
  })
  assert.deepEqual(buildPromptVariableValues(params, { name: '小明', topic: '   ' }), {
    name: '小明',
    topic: '默认主题'
  })
})

test('renderPromptTemplate substitutes values and falls back to defaults', () => {
  const rendered = renderPromptTemplate(
    '你好，{{name}}。主题：{{topic=默认主题}}。说明：{{note|备注}}。',
    { name: '小明', note: '需要简洁回答' }
  )
  assert.equal(rendered, '你好，小明。主题：默认主题。说明：需要简洁回答。')
})
