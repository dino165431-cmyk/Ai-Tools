const SKILL_DISCOVER_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'skill_discover',
    description:
      'Discover actions exposed by the built-in Skills selected for this Agent. Pass skill_id and action to fetch one full inputSchema. Action schemas are deferred and are not registered as separate tools.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Built-in Skill id. Required when action is provided.' },
        action: { type: 'string', description: 'Exact action name. Returns its full inputSchema.' },
        search: { type: 'string', description: 'Search Skill names, descriptions, action names, and action descriptions.' },
        with_schema: { type: 'boolean', description: 'Include schemas in list mode. Default false.' },
        limit: { type: 'integer', description: 'Maximum actions returned per Skill. Default 30, maximum 100.' }
      },
      additionalProperties: false
    }
  }
})

const SKILL_CALL_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'skill_call',
    description:
      'Call an action from a built-in Skill selected for this Agent. Use skill_discover when the action name or input schema is unclear. Pass exact skill_id, action, and args; pass args:{} for actions without parameters.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', minLength: 1, description: 'Built-in Skill id.' },
        action: { type: 'string', minLength: 1, description: 'Exact action name.' },
        args: { description: 'Action arguments matching the discovered inputSchema.' }
      },
      required: ['skill_id', 'action', 'args'],
      additionalProperties: false
    }
  }
})

function cleanString(value) {
  return String(value || '').trim()
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(cleanString).filter(Boolean)))
}

function getNativeSkillEntries(profile) {
  const allowedIds = new Set(normalizeStringList(profile?.activeBuiltinSkillIds))
  return (Array.isArray(profile?.skillObjects) ? profile.skillObjects : [])
    .filter((skill) => allowedIds.has(cleanString(skill?._id)))
}

function resolveNativeSkill(profile, skillId) {
  const id = cleanString(skillId)
  if (!id) return null
  return getNativeSkillEntries(profile).find((skill) => cleanString(skill?._id) === id) || null
}

function compactAction(action, withSchema) {
  return {
    name: cleanString(action?.name),
    description: cleanString(action?.description),
    approval: action?.forceApproval === true ? cleanString(action?.approvalKind) || 'tool' : 'automatic',
    ...(withSchema ? { inputSchema: action?.inputSchema || null } : {})
  }
}

function searchableText(...values) {
  return values
    .flat()
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean)
    .join('\n')
}

function buildBuiltinSkillGatewayBundle(profile) {
  if (!getNativeSkillEntries(profile).length) return { tools: [], map: new Map() }
  return {
    tools: [SKILL_DISCOVER_TOOL, SKILL_CALL_TOOL],
    map: new Map([
      ['skill_discover', {
        type: 'skill_gateway',
        operation: 'discover',
        serverName: 'Skill',
        toolName: 'skill_discover',
        profile
      }],
      ['skill_call', {
        type: 'skill_gateway',
        operation: 'call',
        serverName: 'Skill',
        toolName: 'skill_call',
        profile
      }]
    ])
  }
}

async function discoverBuiltinSkillActions({ profile, registry, args = {} }) {
  const skillId = cleanString(args?.skill_id ?? args?.skillId ?? args?.id)
  const actionName = cleanString(args?.action ?? args?.tool)
  const search = cleanString(args?.search).toLowerCase()
  const withSchema = args?.with_schema === true
  const rawLimit = Number(args?.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 30
  const skills = getNativeSkillEntries(profile)
  const selected = skillId ? resolveNativeSkill(profile, skillId) : null

  if (skillId && !selected) {
    return {
      ok: false,
      error: `Built-in Skill is not selected for this Agent: ${skillId}`,
      available_skills: skills.map((skill) => ({
        id: cleanString(skill?._id),
        name: cleanString(skill?.name || skill?._id)
      }))
    }
  }
  if (actionName && !selected) {
    return { ok: false, error: 'skill_id is required when action is provided' }
  }

  const targetSkills = selected ? [selected] : skills
  const entries = []
  for (const skill of targetSkills) {
    const id = cleanString(skill?._id)
    const actions = await registry.listBuiltinSkillActions(id)
    if (actionName) {
      const action =
        actions.find((item) => cleanString(item?.name) === actionName) ||
        actions.find((item) => cleanString(item?.name).toLowerCase() === actionName.toLowerCase())
      if (!action) {
        return {
          ok: false,
          error: `Action is not registered for Skill ${id}: ${actionName}`,
          available_actions: actions.map((item) => cleanString(item?.name)).filter(Boolean)
        }
      }
      return {
        ok: true,
        skill: { id, name: cleanString(skill?.name || id) },
        action: compactAction(action, true)
      }
    }

    const skillMatches = !search || searchableText(
      id,
      skill?.name,
      skill?.description,
      skill?.nativeActions
    ).includes(search)
    const matchedActions = actions
      .filter((action) => !search || searchableText(action?.name, action?.description).includes(search))
      .slice(0, limit)
    if (search && !skillMatches && !matchedActions.length) continue
    entries.push({
      id,
      name: cleanString(skill?.name || id),
      description: cleanString(skill?.description),
      action_count: actions.length,
      returned: matchedActions.length,
      actions: matchedActions.map((action) => compactAction(action, withSchema))
    })
  }

  return {
    ok: true,
    total_skills: skills.length,
    returned_skills: entries.length,
    skills: entries
  }
}

async function resolveBuiltinSkillCall({ profile, registry, args = {} }) {
  const skillId = cleanString(args?.skill_id ?? args?.skillId ?? args?.id)
  const actionName = cleanString(args?.action ?? args?.tool)
  const hasArgs = Object.prototype.hasOwnProperty.call(args || {}, 'args') ||
    Object.prototype.hasOwnProperty.call(args || {}, 'arguments')
  const actionArgs = Object.prototype.hasOwnProperty.call(args || {}, 'args')
    ? args.args
    : Object.prototype.hasOwnProperty.call(args || {}, 'arguments')
      ? args.arguments
      : {}
  const skill = resolveNativeSkill(profile, skillId)

  if (!skill) {
    return { ok: false, error: `Built-in Skill is not selected for this Agent: ${skillId || '(empty)'}` }
  }
  if (!actionName) return { ok: false, error: 'action is required' }
  if (!hasArgs) return { ok: false, error: 'args is required; pass {} for an action without parameters' }

  const actions = await registry.listBuiltinSkillActions(skillId)
  const action =
    actions.find((item) => cleanString(item?.name) === actionName) ||
    actions.find((item) => cleanString(item?.name).toLowerCase() === actionName.toLowerCase())
  if (!action) {
    return {
      ok: false,
      error: `Action is not registered for Skill ${skillId}: ${actionName}`,
      available_actions: actions.map((item) => cleanString(item?.name)).filter(Boolean)
    }
  }

  return {
    ok: true,
    args: actionArgs,
    mapping: {
      type: 'skill',
      skillId,
      serverId: skillId,
      serverName: cleanString(skill?.name || skillId) || skillId,
      toolName: cleanString(action?.name),
      forceApproval: action?.forceApproval === true,
      hardApproval: action?.hardApproval === true,
      approvalKind: cleanString(action?.approvalKind) || 'tool',
      annotations: action?.annotations && typeof action.annotations === 'object'
        ? action.annotations
        : null,
      unwrapArgs(value) {
        return value
      }
    }
  }
}

module.exports = {
  buildBuiltinSkillGatewayBundle,
  discoverBuiltinSkillActions,
  resolveBuiltinSkillCall
}
