import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSessionToolApprovalKey,
  normalizeShellApprovalCommand,
  normalizeToolApprovalArgs
} from '../src/utils/toolApprovalPolicy.js'

test('tool approval args accept objects and valid JSON only', () => {
  assert.deepEqual(normalizeToolApprovalArgs({ command: 'pwd' }), { command: 'pwd' })
  assert.deepEqual(normalizeToolApprovalArgs(null, '{"command":"pwd"}'), { command: 'pwd' })
  assert.deepEqual(normalizeToolApprovalArgs(null, '{bad json'), {})
})

test('shell approval scope is exact for command and working directory', () => {
  const base = buildSessionToolApprovalKey({
    sessionId: 'session-1',
    serverId: 'builtin-shell',
    toolName: 'bash_run',
    approvalKind: 'shell',
    args: { command: 'find note -type f', cwd: 'note' }
  })
  const same = buildSessionToolApprovalKey({
    sessionId: 'session-1',
    serverId: 'builtin-shell',
    toolName: 'bash_run',
    approvalKind: 'shell',
    argsText: '{"cwd":"note","command":"find note -type f"}'
  })
  const differentCommand = buildSessionToolApprovalKey({
    sessionId: 'session-1',
    serverId: 'builtin-shell',
    toolName: 'bash_run',
    approvalKind: 'shell',
    args: { command: 'find note -type f -delete', cwd: 'note' }
  })
  const differentDirectory = buildSessionToolApprovalKey({
    sessionId: 'session-1',
    serverId: 'builtin-shell',
    toolName: 'bash_run',
    approvalKind: 'shell',
    args: { command: 'find note -type f', cwd: '.' }
  })

  assert.equal(base, same)
  assert.notEqual(base, differentCommand)
  assert.notEqual(base, differentDirectory)
})

test('shell approval display normalizes line endings and cwd separators', () => {
  assert.deepEqual(
    normalizeShellApprovalCommand({ command: 'printf a\r\nprintf b', cwd: 'note\\daily' }),
    { command: 'printf a\nprintf b', cwd: 'note/daily' }
  )
})

test('execution approval scope matches only the exact script invocation', () => {
  const base = {
    sessionId: 'session-1',
    serverName: 'Skill',
    toolName: 'run_skill_script',
    approvalKind: 'execution'
  }
  const first = buildSessionToolApprovalKey({
    ...base,
    args: {
      id: 'skill-demo',
      path: 'scripts/run.js',
      args: ['--mode', 'safe']
    }
  })
  const sameDifferentOrder = buildSessionToolApprovalKey({
    ...base,
    args: {
      args: ['--mode', 'safe'],
      path: 'scripts/run.js',
      id: 'skill-demo'
    }
  })
  const changed = buildSessionToolApprovalKey({
    ...base,
    args: {
      id: 'skill-demo',
      path: 'scripts/run.js',
      args: ['--mode', 'write']
    }
  })

  assert.equal(first, sameDifferentOrder)
  assert.notEqual(first, changed)
})
