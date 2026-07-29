import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSessionToolApprovalKey,
  evaluateToolApproval,
  getToolApprovalModeLabel,
  isDangerousShellApprovalCommand,
  normalizeShellApprovalCommand,
  normalizeSkillScriptApprovalArgs,
  normalizeToolApprovalMode,
  normalizeUnattendedToolApprovalMode,
  normalizeToolApprovalArgs,
  resolveMcpToolApprovalPolicy
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

test('tool approval modes preserve legacy values and expose clear labels', () => {
  assert.equal(normalizeToolApprovalMode(true), 'safe')
  assert.equal(normalizeToolApprovalMode(false), 'manual')
  assert.equal(normalizeToolApprovalMode('auto'), 'safe')
  assert.equal(normalizeToolApprovalMode('readonly'), 'safe')
  assert.equal(normalizeToolApprovalMode('full'), 'full')
  assert.equal(normalizeToolApprovalMode('trusted'), 'trusted')
  assert.equal(getToolApprovalModeLabel('safe'), '低风险自动')
  assert.equal(getToolApprovalModeLabel('full'), '高风险自动（危险操作确认）')
  assert.equal(getToolApprovalModeLabel('trusted'), '完全信任（全部直接批准）')
})

test('unattended mode never leaves a task waiting for manual confirmation', () => {
  assert.equal(normalizeUnattendedToolApprovalMode('safe'), 'safe')
  assert.equal(normalizeUnattendedToolApprovalMode('full'), 'full')
  assert.equal(normalizeUnattendedToolApprovalMode('trusted'), 'trusted')
  assert.equal(normalizeUnattendedToolApprovalMode('deny'), 'deny')
  assert.equal(normalizeUnattendedToolApprovalMode('manual'), 'safe')
  assert.equal(normalizeUnattendedToolApprovalMode('unknown'), 'safe')
})

test('interactive approval policy distinguishes manual, safe and full modes', () => {
  assert.equal(evaluateToolApproval({ mode: 'manual' }).action, 'prompt')
  assert.equal(evaluateToolApproval({ mode: 'safe', forceApproval: false }).action, 'allow')
  assert.equal(evaluateToolApproval({ mode: 'safe', forceApproval: true }).action, 'prompt')
  assert.equal(evaluateToolApproval({ mode: 'full', forceApproval: true }).action, 'allow')
  assert.equal(evaluateToolApproval({ mode: 'full', hardApproval: true }).action, 'prompt')
  assert.equal(evaluateToolApproval({ mode: 'trusted', hardApproval: true }).action, 'allow')
  assert.equal(evaluateToolApproval({ mode: 'deny' }).action, 'deny')
})

test('dangerous shell detection keeps ordinary commands automatic in high-risk mode', () => {
  assert.equal(isDangerousShellApprovalCommand({ command: 'npm test' }), false)
  assert.equal(isDangerousShellApprovalCommand({ command: 'npm run format' }), false)
  assert.equal(isDangerousShellApprovalCommand({ command: 'uv run python scripts/check.py' }), false)
  assert.equal(isDangerousShellApprovalCommand({ command: 'git status --short' }), false)
  assert.equal(isDangerousShellApprovalCommand({ command: 'Remove-Item output -Recurse -Force' }), true)
  assert.equal(isDangerousShellApprovalCommand({ command: 'git reset --hard HEAD~1' }), true)
  assert.equal(isDangerousShellApprovalCommand({ command: 'find output -type f -delete' }), true)
  assert.equal(
    isDangerousShellApprovalCommand({ command: 'node -e "fs.rmSync(\'output\', { recursive: true })"' }),
    true
  )
})

test('unattended approval policy blocks calls that would require confirmation', () => {
  assert.equal(
    evaluateToolApproval({ mode: 'safe', forceApproval: true, interactive: false }).action,
    'deny'
  )
  assert.equal(
    evaluateToolApproval({ mode: 'manual', forceApproval: false, interactive: false }).action,
    'deny'
  )
  assert.equal(
    evaluateToolApproval({ mode: 'full', forceApproval: true, interactive: false }).action,
    'allow'
  )
  assert.equal(
    evaluateToolApproval({ mode: 'full', hardApproval: true, interactive: false }).action,
    'deny'
  )
})

test('safe mode auto-approves declared or conventionally named read-only MCP tools', () => {
  const unknown = resolveMcpToolApprovalPolicy({})
  assert.equal(unknown.forceApproval, true)
  assert.equal(unknown.hardApproval, false)
  assert.equal(unknown.explicitlyReadOnly, false)
  assert.equal(unknown.inferredReadOnly, false)
  assert.match(unknown.approvalReason, /无法可靠判定/)

  const inferredRead = resolveMcpToolApprovalPolicy({ name: 'get_my_accounts' })
  assert.equal(inferredRead.forceApproval, false)
  assert.equal(inferredRead.explicitlyReadOnly, false)
  assert.equal(inferredRead.inferredReadOnly, true)
  assert.match(inferredRead.approvalReason, /工具名称判定为只读/)

  const misleadingRead = resolveMcpToolApprovalPolicy({ name: 'get_and_delete_account' })
  assert.equal(misleadingRead.forceApproval, true)
  assert.match(misleadingRead.approvalReason, /写入或改变外部状态/)

  assert.equal(
    resolveMcpToolApprovalPolicy({
      name: 'get_my_accounts',
      annotations: { readOnlyHint: false }
    }).forceApproval,
    true
  )
  assert.equal(
    resolveMcpToolApprovalPolicy({
      annotations: { readOnlyHint: true, destructiveHint: true }
    }).forceApproval,
    true
  )
  assert.equal(
    resolveMcpToolApprovalPolicy({
      name: 'delete_account',
      annotations: { readOnlyHint: false }
    }).hardApproval,
    true
  )
  const declaredRead = resolveMcpToolApprovalPolicy({
    name: 'custom_operation',
    annotations: { readOnlyHint: true, destructiveHint: false }
  })
  assert.equal(declaredRead.forceApproval, false)
  assert.equal(declaredRead.approvalKind, 'tool')
  assert.equal(declaredRead.explicitlyReadOnly, true)
  assert.equal(declaredRead.inferredReadOnly, false)
})

test('skill script approval normalizes aliases to the resolved execution identity', () => {
  const resolveSkill = ({ idCandidate, nameCandidate }) => (
    idCandidate === 'skill-1' || nameCandidate === 'Demo'
      ? { _id: 'skill-1' }
      : null
  )
  const resolveScript = (_skill, pathCandidate) => ({
    ok: true,
    path: pathCandidate === 'run.js' ? 'scripts/run.js' : pathCandidate
  })

  const first = normalizeSkillScriptApprovalArgs(
    {
      name: 'Demo',
      script: 'run.js',
      args: ['--mode', 'safe']
    },
    { resolveSkill, resolveScript }
  )
  const second = normalizeSkillScriptApprovalArgs(
    {
      skill_id: 'skill-1',
      path: 'scripts/run.js',
      args: ['--mode', 'safe']
    },
    { resolveSkill, resolveScript }
  )

  assert.deepEqual(first, second)
  assert.deepEqual(first, {
    skillId: 'skill-1',
    path: 'scripts/run.js',
    args: ['--mode', 'safe']
  })
})
