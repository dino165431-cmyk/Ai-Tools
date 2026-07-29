import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSkillsPromptText,
  buildAutoSkillActivationPlan,
  buildSkillToolsBundle,
  collectDerivedMcpIds,
  createBuiltinSkillActionCatalog,
  discoverBuiltinSkillActions,
  pickSkillsByTriggers,
  resolveBuiltinSkillCall
} from '../src/utils/chatSkillTooling.js'

function makeBuiltinSkill(overrides = {}) {
  return {
    _id: 'builtin_skill_notes',
    name: '超级笔记管理与执行（内置）',
    description: '管理笔记与超级笔记',
    builtin: true,
    sourceType: 'builtin-directory',
    sourcePath: 'C:/builtin-skills/manage-notes',
    entryFile: 'SKILL.md',
    nativeActions: ['notes_read', 'notebook_execute_cell'],
    cache: {
      fileIndex: {
        skill: 'SKILL.md',
        references: ['references/actions.md'],
        scripts: [],
        assets: [],
        agents: []
      },
      fileDetails: [
        { path: 'SKILL.md', category: 'skill', size: 100 },
        { path: 'references/actions.md', category: 'references', size: 100 }
      ],
      scriptCatalog: []
    },
    triggers: { keywords: ['笔记', 'notebook'] },
    mcp: [],
    ...overrides
  }
}

const ACTIONS = [
  {
    name: 'notes_read',
    description: 'Read one note.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false
    },
    forceApproval: false,
    approvalKind: 'tool'
  },
  {
    name: 'notebook_execute_cell',
    description: 'Execute one notebook cell.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        cellIndex: { type: 'integer' }
      },
      required: ['path', 'cellIndex'],
      additionalProperties: false
    },
    forceApproval: true,
    approvalKind: 'execution'
  }
]

test('built-in Skill actions use two gateway tools instead of one schema per action', () => {
  const skill = makeBuiltinSkill()
  const bundle = buildSkillToolsBundle({
    selectedSkills: [skill],
    agentSkillIds: [skill._id]
  })
  const names = bundle.tools.map((tool) => tool.function.name)

  assert.deepEqual(names, [
    'use_skill',
    'use_skills',
    'read_skill_file',
    'skill_discover',
    'skill_call'
  ])
  assert.equal(names.some((name) => name === 'notes_read'), false)
  assert.equal(names.some((name) => name.startsWith('skill__')), false)
  assert.equal(bundle.stats.nativeSkillCount, 1)
})

test('action catalog caches local runtime metadata and discovery returns schema only on demand', async () => {
  let calls = 0
  const catalog = createBuiltinSkillActionCatalog(async () => {
    calls += 1
    return ACTIONS
  })
  const skill = makeBuiltinSkill()

  const listResult = await discoverBuiltinSkillActions({
    selectedSkills: [skill],
    catalog,
    args: { skill_id: skill._id }
  })
  assert.equal(listResult.ok, true)
  assert.equal(listResult.skills[0].actions[0].inputSchema, undefined)

  const detailResult = await discoverBuiltinSkillActions({
    selectedSkills: [skill],
    catalog,
    args: { skill_id: skill._id, action: 'notes_read' }
  })
  assert.equal(detailResult.action.inputSchema.required[0], 'path')
  assert.equal(calls, 1)
})

test('skill_call resolves the real approval policy and requires Skill content to be loaded', async () => {
  const skill = makeBuiltinSkill()
  const catalog = createBuiltinSkillActionCatalog(async () => ACTIONS)
  const args = {
    skill_id: skill._id,
    action: 'notebook_execute_cell',
    args: { path: 'demo.ipynb', cellIndex: 0 }
  }

  const blocked = await resolveBuiltinSkillCall({
    selectedSkills: [skill],
    catalog,
    args,
    isSkillLoaded: () => false
  })
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /use_skill/)

  const resolved = await resolveBuiltinSkillCall({
    selectedSkills: [skill],
    catalog,
    args,
    isSkillLoaded: () => true
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.mapping.toolName, 'notebook_execute_cell')
  assert.equal(resolved.mapping.forceApproval, true)
  assert.equal(resolved.mapping.approvalKind, 'execution')
  assert.deepEqual(resolved.args, { path: 'demo.ipynb', cellIndex: 0 })
})

test('Skill prompt keeps metadata but defers action names and full content', () => {
  const skill = makeBuiltinSkill()
  const unloaded = buildSkillsPromptText({
    selectedSkills: [skill],
    agentSkillIds: [skill._id],
    loadedSkillIds: [],
    getLoadedSkillContent: () => '# full body'
  })
  assert.match(unloaded, /schemas are deferred/)
  assert.match(unloaded, /skill_discover/)
  assert.doesNotMatch(unloaded, /notes_read.*notebook_execute_cell/)
  assert.doesNotMatch(unloaded, /# full body/)

  const loaded = buildSkillsPromptText({
    selectedSkills: [skill],
    agentSkillIds: [skill._id],
    loadedSkillIds: new Set([skill._id]),
    getLoadedSkillContent: () => '# full body'
  })
  assert.match(loaded, /# full body/)
})

test('trigger routing activates only the highest-scoring relevant Skills', () => {
  const notes = makeBuiltinSkill()
  const shell = makeBuiltinSkill({
    _id: 'builtin_skill_shell',
    name: '数据目录命令执行',
    nativeActions: ['bash_run'],
    triggers: { keywords: ['shell', '命令'] }
  })
  const picked = pickSkillsByTriggers([notes, shell], '请帮我执行 notebook 的一个 cell', {
    minimumScore: 2,
    limit: 2
  })
  assert.deepEqual(picked.map((item) => item.id), [notes._id])
})

test('implicit routing can match a standard Skill description without custom triggers', () => {
  const spreadsheet = makeBuiltinSkill({
    _id: 'skill-spreadsheet',
    name: '工作簿助手',
    description: '分析电子表格、生成 Excel 工作簿并检查公式',
    triggers: undefined,
    policy: { allowImplicitInvocation: true }
  })
  const unrelated = makeBuiltinSkill({
    _id: 'skill-audio',
    name: '音频处理',
    description: '剪辑音频并生成字幕',
    triggers: undefined
  })

  const picked = pickSkillsByTriggers(
    [spreadsheet, unrelated],
    '请帮我生成一份电子表格并检查里面的公式',
    { minimumScore: 2, limit: 2 }
  )
  assert.deepEqual(picked.map((item) => item.id), [spreadsheet._id])
  assert.ok(picked[0].matched.some((item) => item.startsWith('desc:')))
})

test('implicit routing respects a Skill opt-out policy', () => {
  const skill = makeBuiltinSkill({
    triggers: undefined,
    description: '生成电子表格',
    policy: { allowImplicitInvocation: false }
  })
  assert.deepEqual(
    pickSkillsByTriggers([skill], '生成电子表格', { minimumScore: 1 }),
    []
  )
})

test('derived MCP dependencies mount only for active Skills', () => {
  const first = makeBuiltinSkill({ _id: 'skill-first', mcp: ['mcp-a'] })
  const second = makeBuiltinSkill({ _id: 'skill-second', mcp: ['mcp-b'] })
  assert.deepEqual(
    collectDerivedMcpIds([first, second], { activeSkillIds: new Set(['skill-second']) }),
    ['mcp-b']
  )
})

test('unloaded Skill metadata is bounded while loaded content remains available', () => {
  const skills = Array.from({ length: 10 }, (_, index) => makeBuiltinSkill({
    _id: `skill-${index}`,
    name: `Skill ${index}`,
    description: `能力 ${index} ${'说明'.repeat(100)}`,
    triggers: undefined
  }))
  const prompt = buildSkillsPromptText({
    selectedSkills: skills,
    agentSkillIds: skills.map((skill) => skill._id),
    loadedSkillIds: new Set([skills[9]._id]),
    getLoadedSkillContent: (id) => id === skills[9]._id ? '# LOADED-CONTENT' : '',
    maxMetadataChars: 1200
  })
  assert.match(prompt, /catalog truncated/)
  assert.match(prompt, /LOADED-CONTENT/)
})

test('auto activation can transiently mount an implicit installed Skill outside the Agent profile', () => {
  const installed = makeBuiltinSkill({
    _id: 'skill-installed',
    name: '电子表格助手',
    description: '生成电子表格并检查公式',
    triggers: undefined
  })
  const plan = buildAutoSkillActivationPlan({
    skills: [installed],
    text: '生成电子表格并检查公式',
    selectedSkillIds: [],
    agentSkillIds: [],
    activatedSkillIds: [],
    loadedSkillIds: new Set()
  })

  assert.deepEqual(plan.picked.map((item) => item.id), [installed._id])
  assert.deepEqual(plan.selectedSkillIds, [installed._id])
  assert.deepEqual(plan.agentSkillIds, [installed._id])
  assert.deepEqual(plan.activatedSkillIds, [installed._id])
  assert.deepEqual(plan.addedSelectedSkillIds, [installed._id])
  assert.deepEqual(plan.addedAgentSkillIds, [installed._id])
})
