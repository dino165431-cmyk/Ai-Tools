import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildBuiltinSkillGatewayBundle,
  discoverBuiltinSkillActions,
  resolveBuiltinSkillCall
} = require('../public/preload/builtin-skills/action-gateway.js')
const {
  BUILTIN_SKILL_IDS,
  listBuiltinSkillActions
} = require('../public/preload/builtin-skills/index.js')

const skill = {
  _id: 'builtin_skill_notes',
  name: '超级笔记管理与执行（内置）',
  description: 'Manage notes.',
  nativeActions: ['notes_read']
}
const profile = {
  activeBuiltinSkillIds: [skill._id],
  skillObjects: [skill]
}
const registry = {
  async listBuiltinSkillActions() {
    return [
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
        hardApproval: true,
        approvalKind: 'tool'
      }
    ]
  }
}

test('nested Agent registers only the built-in Skill gateway tools', () => {
  const bundle = buildBuiltinSkillGatewayBundle(profile)
  assert.deepEqual(bundle.tools.map((tool) => tool.function.name), ['skill_discover', 'skill_call'])
  assert.equal(bundle.map.get('skill_call')?.type, 'skill_gateway')
})

test('nested Agent gateway discovers and resolves selected Skill actions', async () => {
  const discovered = await discoverBuiltinSkillActions({
    profile,
    registry,
    args: { skill_id: skill._id, action: 'notes_read' }
  })
  assert.equal(discovered.ok, true)
  assert.deepEqual(discovered.action.inputSchema.required, ['path'])

  const resolved = await resolveBuiltinSkillCall({
    profile,
    registry,
    args: {
      skill_id: skill._id,
      action: 'notes_read',
      args: { path: 'demo.md' }
    }
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.mapping.type, 'skill')
  assert.equal(resolved.mapping.toolName, 'notes_read')
  assert.equal(resolved.mapping.hardApproval, true)
  assert.deepEqual(resolved.args, { path: 'demo.md' })
})

test('built-in Skill actions separate read, write and destructive risk levels', async () => {
  const notes = await listBuiltinSkillActions(BUILTIN_SKILL_IDS.notes)
  const config = await listBuiltinSkillActions(BUILTIN_SKILL_IDS.config)
  const shell = await listBuiltinSkillActions(BUILTIN_SKILL_IDS.shell)
  const noteAction = (name) => notes.find((action) => action.name === name)
  const configAction = (name) => config.find((action) => action.name === name)
  const shellAction = (name) => shell.find((action) => action.name === name)

  assert.equal(noteAction('notes_read')?.forceApproval, false)
  assert.equal(noteAction('notes_write')?.forceApproval, true)
  assert.equal(noteAction('notes_write')?.hardApproval, false)
  assert.equal(noteAction('notes_delete')?.hardApproval, true)
  assert.equal(noteAction('notebook_execute_cell')?.forceApproval, true)
  assert.equal(noteAction('notebook_execute_cell')?.hardApproval, false)
  assert.equal(configAction('config_update_provider')?.hardApproval, false)
  assert.equal(configAction('config_delete_provider')?.hardApproval, true)
  assert.equal(shellAction('sandbox_run')?.forceApproval, true)
  assert.equal(shellAction('sandbox_run')?.hardApproval, false)
  assert.equal(shellAction('sandbox_reset')?.hardApproval, true)
})
