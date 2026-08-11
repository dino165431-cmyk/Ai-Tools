import {
  buildSkillFileIndexLines,
  buildSkillScriptCatalogLines,
  getSkillDescription,
  getSkillScriptCatalog,
  isDirectorySkill
} from '@/utils/skillUtils'
import {
  AGENT_SKILL_LAZY_LOAD_GUIDANCE_LINES,
  INTERNAL_TOOL_SPECS
} from '@/utils/chatPromptTooling'

export const BUILTIN_SKILL_SOURCE_TYPE = 'builtin-directory'
export const DEFAULT_SKILL_ACTION_CACHE_TTL_MS = 30 * 60_000
export const DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE = 0.74
export const DEFAULT_SKILL_ROUTING_MIN_MARGIN = 0.12
export const SKILL_ROUTING_EMBEDDING_TIMEOUT_MS = 0

function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  const result = []
  const seen = new Set()
  value.forEach((item) => {
    const normalized = normalizeText(item)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

export function selectSkillsByIds(skillIds, availableSkills) {
  const skillById = new Map(
    (Array.isArray(availableSkills) ? availableSkills : [])
      .filter((skill) => skill && normalizeText(skill._id))
      .map((skill) => [normalizeText(skill._id), skill])
  )
  return normalizeStringList(skillIds).map((id) => skillById.get(id)).filter(Boolean)
}

function hasExactStringSet(values, expected) {
  if (values.length !== expected.length) return false
  const expectedSet = new Set(expected)
  return values.every((value) => expectedSet.has(value))
}

export function migrateLegacyDefaultAgentSkillState(state = {}, legacySkillIds = []) {
  const selectedSkillIds = normalizeStringList(state?.selectedSkillIds)
  const agentSkillIds = normalizeStringList(state?.agentSkillIds)
  const activatedSkillIds = normalizeStringList(state?.activatedSkillIds)
  const legacyIds = normalizeStringList(legacySkillIds)
  const matchesLegacyAgentProfile = legacyIds.length > 0 && (
    hasExactStringSet(agentSkillIds, legacyIds) ||
    (
      agentSkillIds.length === 0 &&
      activatedSkillIds.length === 0 &&
      hasExactStringSet(selectedSkillIds, legacyIds)
    )
  )

  if (!matchesLegacyAgentProfile) {
    return {
      selectedSkillIds,
      agentSkillIds,
      activatedSkillIds,
      migrated: false
    }
  }

  const legacySet = new Set(legacyIds)
  return {
    selectedSkillIds: selectedSkillIds.filter((id) => !legacySet.has(id)),
    agentSkillIds: agentSkillIds.filter((id) => !legacySet.has(id)),
    activatedSkillIds: activatedSkillIds.filter((id) => !legacySet.has(id)),
    migrated: true
  }
}

export function isBuiltinNativeSkill(skill) {
  return !!(
    skill?.builtin === true &&
    normalizeText(skill?.sourceType) === BUILTIN_SKILL_SOURCE_TYPE &&
    normalizeStringList(skill?.nativeActions).length
  )
}

export function listBuiltinNativeSkills(skills) {
  return (Array.isArray(skills) ? skills : []).filter(isBuiltinNativeSkill)
}

export function resolveSelectedSkillTarget(
  selectedSkills,
  { idCandidate = '', nameCandidate = '', nativeOnly = false } = {}
) {
  const available = (Array.isArray(selectedSkills) ? selectedSkills : [])
    .filter((skill) => !nativeOnly || isBuiltinNativeSkill(skill))
  const id = normalizeText(idCandidate)
  if (id) {
    const exact = available.find((skill) => normalizeText(skill?._id) === id)
    if (exact) return exact
  }

  const name = normalizeText(nameCandidate)
  if (!name) return null
  const normalizedName = name.toLowerCase()
  return (
    available.find((skill) => normalizeText(skill?.name).toLowerCase() === normalizedName) ||
    available.find((skill) => normalizeText(skill?._id).toLowerCase() === normalizedName) ||
    available.find((skill) => normalizeText(skill?.name).toLowerCase().includes(normalizedName)) ||
    null
  )
}

export function listSelectedSkillsBrief(selectedSkills, limit = 30) {
  return (Array.isArray(selectedSkills) ? selectedSkills : [])
    .map((skill) => ({
      id: normalizeText(skill?._id),
      name: normalizeText(skill?.name || skill?._id)
    }))
    .filter((skill) => skill.id)
    .slice(0, Math.max(1, Number(limit) || 30))
}

export function collectDerivedMcpIds(selectedSkills, options = {}) {
  const ids = new Set()
  const activeSkillIds = options.activeSkillIds instanceof Set
    ? options.activeSkillIds
    : Array.isArray(options.activeSkillIds)
      ? new Set(normalizeStringList(options.activeSkillIds))
      : null
  ;(Array.isArray(selectedSkills) ? selectedSkills : []).forEach((skill) => {
    const skillId = normalizeText(skill?._id)
    if (activeSkillIds && (!skillId || !activeSkillIds.has(skillId))) return
    normalizeStringList(skill?.mcp).forEach((id) => ids.add(id))
  })
  return Array.from(ids)
}

function createFunctionTool(name, spec) {
  return {
    type: 'function',
    function: {
      name,
      description: spec.description,
      parameters: spec.parameters
    }
  }
}

function createInternalMapping(internal, toolName = internal, extra = {}) {
  return {
    type: 'internal',
    internal,
    serverName: 'Skill',
    toolName,
    ...extra
  }
}

export function buildSkillToolsBundle({
  selectedSkills = [],
  availableSkills = selectedSkills,
  agentSkillIds = [],
  internalToolSpecs = INTERNAL_TOOL_SPECS,
  includeLifecycleTools = true,
  includeResourceTools = true
} = {}) {
  const skills = Array.isArray(selectedSkills) ? selectedSkills : []
  const available = Array.isArray(availableSkills) ? availableSkills : skills
  const hasDirectorySkills = available.some((skill) => isDirectorySkill(skill))
  const hasRunnableScripts = available.some(
    (skill) => isDirectorySkill(skill) && getSkillScriptCatalog(skill).length > 0
  )
  const hasActivatableSkills = available.some((skill) => normalizeText(skill?._id))
  const hasDiscoverableSkills = available.some((skill) => normalizeText(skill?._id))
  const hasNativeSkills = available.some(isBuiltinNativeSkill)
  const tools = []
  const map = new Map()

  const register = (name, specKey, mapping) => {
    const spec = internalToolSpecs?.[specKey]
    if (!spec) return
    map.set(name, {
      ...mapping,
      toolDescription: normalizeText(mapping?.toolDescription || spec.description)
    })
    tools.push(createFunctionTool(name, spec))
  }

  if (includeLifecycleTools && hasActivatableSkills) {
    register('use_skill', 'useSkill', createInternalMapping('use_skill'))
    register('use_skills', 'useSkills', createInternalMapping('use_skills'))
  }
  if (includeResourceTools && hasDirectorySkills) {
    register('read_skill_file', 'readSkillFile', createInternalMapping('read_skill_file'))
  }
  if (includeResourceTools && hasRunnableScripts) {
    register(
      'run_skill_script',
      'runSkillScript',
      createInternalMapping('run_skill_script', 'run_skill_script', { approvalKind: 'execution' })
    )
  }
  if (hasDiscoverableSkills) {
    register('skill_discover', 'skillDiscover', createInternalMapping('skill_discover'))
  }
  if (hasNativeSkills) {
    register('skill_call', 'skillCall', createInternalMapping('skill_call'))
  }

  return {
    tools,
    map,
    stats: {
      selectedSkillCount: skills.length,
      nativeSkillCount: listBuiltinNativeSkills(skills).length,
      registeredToolCount: tools.length
    }
  }
}

export function createBuiltinSkillActionCatalog(listActions, options = {}) {
  const ttlMs = Math.max(0, Number(options.ttlMs) || DEFAULT_SKILL_ACTION_CACHE_TTL_MS)
  const cache = new Map()
  const inFlight = new Map()

  const load = async (skillId, loadOptions = {}) => {
    const id = normalizeText(skillId)
    if (!id) throw new Error('skill_id 不能为空')
    if (typeof listActions !== 'function') {
      throw new Error('preload 未注入内置 Skill 动作 API')
    }

    const refresh = loadOptions.refresh === true
    const now = Date.now()
    const cached = cache.get(id)
    if (!refresh && cached && (!ttlMs || now - cached.updatedAt < ttlMs)) {
      return cached.actions
    }
    if (!refresh && inFlight.has(id)) return inFlight.get(id)

    const pending = Promise.resolve(listActions(id))
      .then((actions) => {
        const normalized = (Array.isArray(actions) ? actions : [])
          .map((action) => {
            const name = normalizeText(action?.name)
            if (!name) return null
            return {
              ...action,
              name,
              description: normalizeText(action?.description),
              inputSchema:
                action?.inputSchema && typeof action.inputSchema === 'object'
                  ? action.inputSchema
                  : { type: 'object', properties: {}, additionalProperties: false },
              approvalKind: normalizeText(action?.approvalKind || 'tool') || 'tool',
              forceApproval: action?.forceApproval === true
            }
          })
          .filter(Boolean)
        cache.set(id, { actions: normalized, updatedAt: Date.now() })
        return normalized
      })
      .finally(() => inFlight.delete(id))

    inFlight.set(id, pending)
    return pending
  }

  return Object.freeze({
    list: load,
    peek(skillId) {
      return cache.get(normalizeText(skillId))?.actions || null
    },
    clear(skillId = '') {
      const id = normalizeText(skillId)
      if (id) {
        cache.delete(id)
        inFlight.delete(id)
        return
      }
      cache.clear()
      inFlight.clear()
    }
  })
}

function compactAction(action, { withSchema = false } = {}) {
  return {
    name: action.name,
    description: action.description || '',
    approval: action.forceApproval === true ? action.approvalKind || 'tool' : 'automatic',
    ...(withSchema ? { inputSchema: action.inputSchema || null } : {})
  }
}

function skillSearchText(skill) {
  const triggers = skill?.triggers && typeof skill.triggers === 'object' ? skill.triggers : {}
  return [
    skill?._id,
    skill?.name,
    getSkillDescription(skill),
    skill?.content,
    ...normalizeStringList(skill?.nativeActions),
    ...normalizeStringList(skill?.mcp),
    ...normalizeStringList(triggers?.tags),
    ...normalizeStringList(triggers?.keywords),
    ...normalizeStringList(triggers?.intents),
    ...getSkillScriptCatalog(skill).flatMap((script) => [
      script?.name,
      script?.path,
      script?.description,
      script?.whenToUse
    ])
  ]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .join('\n')
}

function actionSearchText(action) {
  return [action?.name, action?.description]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .join('\n')
}

function scoreSearchText(query, haystack) {
  const normalizedQuery = normalizeText(query).toLowerCase()
  const normalizedHaystack = normalizeText(haystack).toLowerCase()
  if (!normalizedQuery) return 1
  if (!normalizedHaystack) return 0
  if (normalizedHaystack.includes(normalizedQuery)) return 100

  const queryTokens = Array.from(tokenizeRoutingText(normalizedQuery))
  const haystackTokens = tokenizeRoutingText(normalizedHaystack)
  const matches = queryTokens
    .filter((token) => haystackTokens.has(token))
    .sort((a, b) => b.length - a.length)
  const accepted = []
  for (const token of matches) {
    if (accepted.some((item) => item.includes(token) || token.includes(item))) continue
    accepted.push(token)
    if (accepted.length >= 8) break
  }
  return accepted.reduce(
    (score, token) => score + (/[\u3400-\u9fff]/.test(token) && token.length >= 3 ? 2 : 1),
    0
  )
}

function normalizeLocalSearchConfidence(score) {
  const numeric = Number(score) || 0
  if (numeric >= 100) return 1
  if (numeric >= 8) return 0.95
  if (numeric >= 6) return 0.88
  if (numeric >= 4) return 0.78
  if (numeric >= 3) return 0.68
  if (numeric >= 2) return 0.55
  if (numeric >= 1) return 0.28
  return 0
}

function compactSkillDiscoveryEntry(skill) {
  const id = normalizeText(skill?._id)
  const scripts = getSkillScriptCatalog(skill)
  return {
    id,
    name: normalizeText(skill?.name || id),
    description: getSkillDescription(skill),
    source_type: normalizeText(skill?.sourceType),
    kind: isBuiltinNativeSkill(skill) ? 'native' : isDirectorySkill(skill) ? 'directory' : 'metadata',
    entry_file: normalizeText(skill?.entryFile),
    script_count: scripts.length,
    scripts: scripts.slice(0, 20).map((script) => ({
      name: normalizeText(script?.name || script?.path),
      path: normalizeText(script?.path),
      description: normalizeText(script?.description || script?.whenToUse)
    })),
    mcp: normalizeStringList(skill?.mcp)
  }
}

function normalizeCapabilitySearchItems(result) {
  const items = Array.isArray(result?.items)
    ? result.items
    : Array.isArray(result?.results)
      ? result.results
      : []
  return items.filter((item) => String(item?.capabilityType || '').trim() === 'skill')
}

export async function discoverBuiltinSkillActions({
  selectedSkills = [],
  catalog,
  args = {},
  searchCapabilities = null
} = {}) {
  const availableSkills = (Array.isArray(selectedSkills) ? selectedSkills : [])
    .filter((skill) => normalizeText(skill?._id))
  const nativeSkills = listBuiltinNativeSkills(selectedSkills)
  const skillId = normalizeText(args?.skill_id ?? args?.skillId ?? args?.id)
  const skillName = normalizeText(args?.skill_name ?? args?.skillName ?? args?.name)
  const actionName = normalizeText(args?.action ?? args?.tool)
  const search = normalizeText(args?.search).toLowerCase()
  const withSchema = args?.with_schema === true
  const refresh = args?.refresh === true
  const rawLimit = Number(args?.limit)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 30
  const hasSkillSelector = !!skillId || !!skillName
  const targetSkill = hasSkillSelector
    ? resolveSelectedSkillTarget(availableSkills, {
        idCandidate: skillId,
        nameCandidate: skillName,
        nativeOnly: actionName.length > 0
      })
    : null

  if (hasSkillSelector && !targetSkill) {
    return {
      ok: false,
      error: actionName ? '未找到可调用动作的内置 Skill' : '未找到可用的 Skill',
      available_skills: listSelectedSkillsBrief(actionName ? nativeSkills : availableSkills)
    }
  }
  if (actionName && !targetSkill) {
    return {
      ok: false,
      error: '查询具体 action 时必须同时提供 skill_id，避免跨 Skill 歧义',
      available_skills: listSelectedSkillsBrief(nativeSkills)
    }
  }

  let capabilitySearchResult = null
  if (search && typeof searchCapabilities === 'function') {
    try {
      capabilitySearchResult = await searchCapabilities({
        query: search,
        limit: Math.max(limit, 30),
        capabilityType: 'skill',
        embeddingTimeoutMs: SKILL_ROUTING_EMBEDDING_TIMEOUT_MS
      })
    } catch {
      // Persistent hybrid retrieval is an enhancement; local matching remains available.
    }
  }
  const capabilityItems = normalizeCapabilitySearchItems(capabilitySearchResult)
  const capabilityConfidenceById = new Map(
    capabilityItems.map((item) => [
      normalizeText(item?.skillId || item?.capabilityId),
      normalizeRetrievalConfidence(item)
    ])
  )
  const targetSkills = targetSkill
    ? [targetSkill]
    : availableSkills
        .map((skill) => {
          const id = normalizeText(skill?._id)
          const localScore = search ? scoreSearchText(search, skillSearchText(skill)) : 1
          const localConfidence = search ? normalizeLocalSearchConfidence(localScore) : 1
          const retrievalConfidence = capabilityConfidenceById.get(id) || 0
          return {
            skill,
            confidence: fuseSkillRoutingConfidence(localConfidence, retrievalConfidence)
          }
        })
        .filter((item) => item.confidence >= (search ? 0.5 : 0))
        .sort((a, b) => b.confidence - a.confidence)
        .map((item) => item.skill)
  const skillEntries = []

  for (const skill of targetSkills) {
    const id = normalizeText(skill?._id)
    if (!isBuiltinNativeSkill(skill)) {
      skillEntries.push(compactSkillDiscoveryEntry(skill))
      if (skillEntries.length >= limit) break
      continue
    }
    if (!catalog || typeof catalog.list !== 'function') {
      skillEntries.push({
        ...compactSkillDiscoveryEntry(skill),
        action_count: normalizeStringList(skill?.nativeActions).length,
        returned: 0,
        actions: [],
        action_catalog_error: '内置 Skill 动作目录不可用'
      })
      if (skillEntries.length >= limit) break
      continue
    }
    const actions = await catalog.list(id, { refresh })
    if (actionName) {
      const exact =
        actions.find((action) => action.name === actionName) ||
        actions.find((action) => action.name.toLowerCase() === actionName.toLowerCase())
      if (!exact) {
        return {
          ok: false,
          error: `Skill 中不存在 action：${actionName}`,
          skill: { id, name: normalizeText(skill?.name || id) },
          available_actions: actions.map((action) => action.name)
        }
      }
      return {
        ok: true,
        skill: { id, name: normalizeText(skill?.name || id) },
        action: compactAction(exact, { withSchema: true })
      }
    }

    const matchedActions = actions
      .map((action) => ({
        action,
        score: search ? scoreSearchText(search, actionSearchText(action)) : 1
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.action)
    if (search && !matchedActions.length && scoreSearchText(search, skillSearchText(skill)) <= 0) continue
    skillEntries.push({
      ...compactSkillDiscoveryEntry(skill),
      action_count: actions.length,
      returned: matchedActions.length,
      actions: matchedActions.map((action) => compactAction(action, { withSchema }))
    })
    if (skillEntries.length >= limit) break
  }

  return {
    ok: true,
    total_skills: availableSkills.length,
    returned_skills: skillEntries.length,
    search_mode: capabilitySearchResult?.searchMode || (search ? 'keyword' : 'list'),
    semantic_used: capabilitySearchResult?.semanticUsed === true,
    skills: skillEntries
  }
}

export async function resolveBuiltinSkillCall({
  selectedSkills = [],
  catalog,
  args = {},
  isSkillLoaded = null
} = {}) {
  if (!catalog || typeof catalog.list !== 'function') {
    return { ok: false, error: '内置 Skill 动作目录不可用' }
  }

  const rawArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  const nestedCall = rawArgs.args && typeof rawArgs.args === 'object' && !Array.isArray(rawArgs.args)
    ? rawArgs.args
    : null
  const nestedCallLooksLikeWrapper = nestedCall && (
    Object.prototype.hasOwnProperty.call(nestedCall, 'action') ||
    Object.prototype.hasOwnProperty.call(nestedCall, 'tool') ||
    Object.prototype.hasOwnProperty.call(nestedCall, 'skill_id') ||
    Object.prototype.hasOwnProperty.call(nestedCall, 'skillId')
  )
  const normalizedArgs = nestedCallLooksLikeWrapper ? nestedCall : rawArgs
  const skillId = normalizeText(rawArgs?.skill_id ?? rawArgs?.skillId ?? rawArgs?.id ?? normalizedArgs?.skill_id ?? normalizedArgs?.skillId ?? normalizedArgs?.id)
  const skillName = normalizeText(rawArgs?.skill_name ?? rawArgs?.skillName ?? rawArgs?.name ?? normalizedArgs?.skill_name ?? normalizedArgs?.skillName ?? normalizedArgs?.name)
  const actionName = normalizeText(rawArgs?.action ?? rawArgs?.tool ?? normalizedArgs?.action ?? normalizedArgs?.tool)
  const hasArgs = Object.prototype.hasOwnProperty.call(normalizedArgs || {}, 'args') ||
    Object.prototype.hasOwnProperty.call(normalizedArgs || {}, 'arguments')
  const actionArgs = Object.prototype.hasOwnProperty.call(normalizedArgs || {}, 'args')
    ? normalizedArgs.args
    : Object.prototype.hasOwnProperty.call(normalizedArgs || {}, 'arguments')
      ? normalizedArgs.arguments
      : {}
  let skill = resolveSelectedSkillTarget(selectedSkills, {
    idCandidate: skillId,
    nameCandidate: skillName,
    nativeOnly: true
  })

  if (!skill && !skillId && !skillName && actionName) {
    const actionCandidates = []
    for (const candidate of listBuiltinNativeSkills(selectedSkills)) {
      const candidateId = normalizeText(candidate?._id)
      if (!candidateId) continue
      const candidateActions = await catalog.list(candidateId)
      const candidateAction = candidateActions.find((item) => item.name === actionName) ||
        candidateActions.find((item) => item.name.toLowerCase() === actionName.toLowerCase())
      if (candidateAction) actionCandidates.push({ skill: candidate, action: candidateAction })
      if (actionCandidates.length > 1) break
    }
    if (actionCandidates.length === 1) skill = actionCandidates[0].skill
  }

  if (!skill) {
    return {
      ok: false,
      error: '未找到要调用的内置 Skill；只能调用当前会话已选择的 Skill',
      available_skills: listSelectedSkillsBrief(listBuiltinNativeSkills(selectedSkills))
    }
  }
  if (!actionName) {
    return { ok: false, error: 'action 不能为空', skill }
  }
  if (!hasArgs) {
    return { ok: false, error: 'args 字段不能为空；无参数 Action 请传 {}', skill }
  }

  const id = normalizeText(skill?._id)
  if (typeof isSkillLoaded === 'function' && !isSkillLoaded(skill)) {
    return {
      ok: false,
      error: `Skill 尚未加载：${id}。请先调用 use_skill({"id":"${id}"})，再调用 skill_call。`,
      skill
    }
  }

  const actions = await catalog.list(id)
  const action =
    actions.find((item) => item.name === actionName) ||
    actions.find((item) => item.name.toLowerCase() === actionName.toLowerCase())
  if (!action) {
    return {
      ok: false,
      error: `Skill 中不存在 action：${actionName}`,
      skill,
      available_actions: actions.map((item) => item.name)
    }
  }

  return {
    ok: true,
    skill,
    action,
    args: actionArgs,
    mapping: {
      type: 'skill',
      gateway: true,
      skillId: id,
      serverId: id,
      serverName: normalizeText(skill?.name || id) || id,
      toolName: action.name,
      toolTitle: normalizeText(action?.title || action?.annotations?.title),
      toolDescription: normalizeText(action.description),
      forceApproval: action.forceApproval === true,
      hardApproval: action.hardApproval === true,
      approvalKind: normalizeText(action.approvalKind || 'tool') || 'tool',
      annotations: action.annotations || null,
      unwrapArgs(value) {
        return value
      }
    }
  }
}

export function buildSkillsPromptText({
  selectedSkills = [],
  availableSkills = selectedSkills,
  agentSkillIds = [],
  loadedSkillIds = [],
  mcpServers = [],
  getLoadedSkillContent = () => '',
  maxMetadataChars = 8000
} = {}) {
  const blocks = []
  const metadataLimit = Math.max(1000, Number(maxMetadataChars) || 8000)
  let metadataChars = 0
  let omittedMetadataCount = 0
  const agentSet = new Set(normalizeStringList(agentSkillIds))
  const loadedSet = loadedSkillIds instanceof Set
    ? loadedSkillIds
    : new Set(normalizeStringList(loadedSkillIds))
  const mcpList = Array.isArray(mcpServers) ? mcpServers : []
  const skills = Array.isArray(selectedSkills) ? selectedSkills : []
  const selectedIds = new Set(skills.map((skill) => normalizeText(skill?._id)).filter(Boolean))
  const catalogSkills = []
  const catalogSkillIds = new Set()
  ;(Array.isArray(availableSkills) ? availableSkills : skills).forEach((skill) => {
    const id = normalizeText(skill?._id)
    if (!id || catalogSkillIds.has(id)) return
    catalogSkillIds.add(id)
    catalogSkills.push(skill)
  })
  const hasLazyUnloaded = catalogSkills.some((skill) => {
    const id = normalizeText(skill?._id)
    if (!id) return false
    if (isDirectorySkill(skill)) return !loadedSet.has(id)
    return agentSet.has(id) && !loadedSet.has(id)
  })

  if (hasLazyUnloaded) {
    const guidance = AGENT_SKILL_LAZY_LOAD_GUIDANCE_LINES.join('\n')
    blocks.push(guidance)
    metadataChars += guidance.length
  }

  skills.forEach((skill) => {
    const id = normalizeText(skill?._id)
    const name = normalizeText(skill?.name || id || 'Skill')
    const isDirectory = isDirectorySkill(skill)
    const isAgentSkill = !!id && agentSet.has(id)
    const isLoaded = !!id && loadedSet.has(id)
    const description = getSkillDescription(skill)
    const rawContent = isDirectory ? '' : normalizeText(skill?.content)
    const content = id && isLoaded
      ? (isDirectory ? normalizeText(getLoadedSkillContent(id)) : rawContent)
      : ''
    const fileIndexLines = isDirectory ? buildSkillFileIndexLines(skill) : []
    const scriptCatalogLines = isDirectory ? buildSkillScriptCatalogLines(skill) : []
    const skillMcpIds = normalizeStringList(skill?.mcp)
    const skillMcpNames = skillMcpIds.map(
      (mcpId) => mcpList.find((server) => server?._id === mcpId)?.name || mcpId
    )
    const nativeActionCount = normalizeStringList(skill?.nativeActions).length

    if (
      !description &&
      !rawContent &&
      !skillMcpIds.length &&
      !nativeActionCount &&
      !fileIndexLines.length &&
      !scriptCatalogLines.length
    ) return

    const parts = [id ? `## Skill: ${name} (id: \`${id}\`)` : `## Skill: ${name}`]
    if (isAgentSkill || isDirectory) {
      parts.push(`Status: ${isLoaded ? (isDirectory ? '已加载 SKILL.md' : '已启用') : '尚未加载'}`)
    }
    if (skillMcpNames.length) {
      parts.push(`MCP: ${skillMcpNames.map((item) => `\`${item}\``).join(', ')}`)
    }
    if (nativeActionCount) {
      parts.push(`Native actions: ${nativeActionCount} available; schemas are deferred. Use \`skill_discover({"skill_id":"${id}"})\` when needed.`)
    }
    if (description) parts.push(`Description: ${description}`)
    if (fileIndexLines.length) {
      parts.push(['Files:', ...fileIndexLines.map((line) => `- ${line}`)].join('\n'))
    }
    if (scriptCatalogLines.length) {
      parts.push(['Scripts:', ...scriptCatalogLines.map((line) => `- ${line}`)].join('\n'))
    }
    if (!content && isDirectory) {
      parts.push(`Hint: load the skill first with use_skill({"id":"${id}"}) before calling its actions, reading files, or running scripts.`)
      if (scriptCatalogLines.length) {
        parts.push('标准技能通常通过 SKILL.md 和脚本头部注释说明脚本用法；manifest 仅作为可选兼容扩展。')
      }
    }
    if (content) parts.push(content)
    const block = parts.join('\n')
    if (!isLoaded && metadataChars + block.length > metadataLimit) {
      omittedMetadataCount += 1
      return
    }
    blocks.push(block)
    if (!isLoaded) metadataChars += block.length
  })

  const availableMetadataLines = []
  catalogSkills.forEach((skill) => {
    const id = normalizeText(skill?._id)
    if (!id || selectedIds.has(id)) return
    const name = normalizeText(skill?.name || id)
    const description = getSkillDescription(skill).slice(0, 512)
    const entryFile = normalizeText(skill?.entryFile)
    const explicitOnly = !allowsImplicitSkillInvocation(skill)
    const line = [
      `- \`${id}\` — ${name}`,
      description ? `: ${description}` : '',
      entryFile ? ` [entry: ${entryFile}]` : '',
      explicitOnly ? ' [explicit only]' : ''
    ].join('')
    if (metadataChars + line.length > metadataLimit) {
      omittedMetadataCount += 1
      return
    }
    availableMetadataLines.push(line)
    metadataChars += line.length
  })

  if (availableMetadataLines.length) {
    blocks.push([
      '## Available Skill catalog',
      'Only metadata is loaded. When one clearly matches the task, call `use_skill` with its exact id before using its instructions, files, scripts, MCP dependencies, or native actions.',
      ...availableMetadataLines
    ].join('\n'))
  }

  if (omittedMetadataCount > 0) {
    blocks.push(`## Skill catalog truncated\n${omittedMetadataCount} unloaded Skill metadata entries were omitted to keep the initial context bounded. Use \`skill_discover\` or the Skill selector to search the complete installed catalog.`)
  }
  return blocks.join('\n\n').trim()
}

function getSkillTriggers(skill) {
  const triggers = skill?.triggers && typeof skill.triggers === 'object' ? skill.triggers : {}
  return {
    keywords: normalizeStringList(triggers.keywords),
    regex: normalizeStringList(triggers.regex),
    intents: normalizeStringList(triggers.intents)
  }
}

function normalizeRegexPattern(raw) {
  const value = normalizeText(raw)
  if (!value) return null
  const match = value.match(/^\/(.+)\/([a-z]*)$/i)
  return match
    ? { source: match[1], flags: match[2] || 'i' }
    : { source: value, flags: 'i' }
}

const ROUTING_STOP_WORDS = new Set([
  '一个',
  '这个',
  '可以',
  '帮助',
  '使用',
  '用户',
  '任务',
  '功能',
  '进行',
  '处理',
  '工作',
  'when',
  'with',
  'from',
  'into',
  'that',
  'this',
  'the',
  'and',
  'for',
  'use',
  'using'
])
const MAX_ROUTING_REGEX_LENGTH = 256
const MAX_ROUTING_REGEX_INPUT_LENGTH = 4000
const MAX_ROUTING_REGEX_CACHE_SIZE = 256
const routingRegexCache = new Map()

function looksLikeUnsafeRoutingRegex(source) {
  const value = String(source || '')
  if (!value || value.length > MAX_ROUTING_REGEX_LENGTH) return true
  if (/\\[1-9]/.test(value)) return true
  if (/(\([^)]*[+*][^)]*\)|\[[^\]]+\][+*]|\.[+*])\s*(?:[+*]|\{\d*,?\d*\})/.test(value)) return true
  return /(?:\.\*){2,}|(?:\.\+){2,}/.test(value)
}

function getRoutingRegex(pattern) {
  const cacheKey = normalizeText(pattern)
  if (!cacheKey) return null
  if (routingRegexCache.has(cacheKey)) return routingRegexCache.get(cacheKey)

  const normalized = normalizeRegexPattern(cacheKey)
  let regex = null
  if (normalized?.source && !looksLikeUnsafeRoutingRegex(normalized.source)) {
    try {
      regex = new RegExp(normalized.source, normalized.flags)
    } catch {
      regex = null
    }
  }

  routingRegexCache.set(cacheKey, regex)
  while (routingRegexCache.size > MAX_ROUTING_REGEX_CACHE_SIZE) {
    const oldestKey = routingRegexCache.keys().next().value
    if (oldestKey === undefined) break
    routingRegexCache.delete(oldestKey)
  }
  return regex
}

function tokenizeRoutingText(value) {
  const raw = String(value || '').toLowerCase()
  const tokens = new Set()
  const latin = raw.match(/[a-z0-9][a-z0-9_+.-]{2,}/g) || []
  latin.forEach((token) => {
    if (!ROUTING_STOP_WORDS.has(token)) tokens.add(token)
  })

  const cjkGroups = raw.match(/[\u3400-\u9fff]{2,}/g) || []
  cjkGroups.forEach((group) => {
    if (group.length <= 8 && !ROUTING_STOP_WORDS.has(group)) tokens.add(group)
    for (let size = 2; size <= Math.min(4, group.length); size += 1) {
      for (let index = 0; index <= group.length - size; index += 1) {
        const token = group.slice(index, index + size)
        if (!ROUTING_STOP_WORDS.has(token)) tokens.add(token)
      }
    }
  })
  return tokens
}

function allowsImplicitSkillInvocation(skill) {
  const policy = skill?.policy && typeof skill.policy === 'object' ? skill.policy : {}
  if (policy.allowImplicitInvocation === false || policy.allow_implicit_invocation === false) {
    return false
  }
  return skill?.allowImplicitInvocation !== false
}

function scoreSkillDescription(skill, raw, matched) {
  const name = normalizeText(skill?.name)
  const description = getSkillDescription(skill)
  const haystack = `${name}\n${description}`.trim()
  if (!haystack) return 0

  const lower = String(raw || '').toLowerCase()
  let score = 0
  if (name && name.length >= 2 && lower.includes(name.toLowerCase())) {
    score += 3
    matched.push(`name:${name}`)
  }

  const queryTokens = tokenizeRoutingText(raw)
  const skillTokens = tokenizeRoutingText(haystack)
  const overlaps = Array.from(queryTokens)
    .filter((token) => skillTokens.has(token))
    .sort((a, b) => b.length - a.length)
  const accepted = []
  for (const token of overlaps) {
    if (accepted.some((item) => item.includes(token) || token.includes(item))) continue
    accepted.push(token)
    if (accepted.length >= 4) break
  }
  accepted.forEach((token) => {
    score += /[\u3400-\u9fff]/.test(token) && token.length >= 3 ? 2 : 1
    matched.push(`desc:${token}`)
  })
  return Math.min(score, 5)
}

function clampConfidence(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric))
}

function combineConfidenceSignals(signals = []) {
  const remaining = signals
    .map(clampConfidence)
    .filter((value) => value > 0)
    .reduce((product, value) => product * (1 - value), 1)
  return clampConfidence(1 - remaining)
}

function computeLocalSkillConfidence(matched = []) {
  const matches = Array.isArray(matched) ? matched : []
  const descriptionCount = matches.filter((item) => String(item).startsWith('desc:')).length
  const keywordCount = matches.filter((item) => String(item).startsWith('kw:')).length
  const intentCount = matches.filter((item) => String(item).startsWith('intent:')).length
  const signals = []

  if (matches.some((item) => String(item).startsWith('name:'))) signals.push(0.98)
  if (matches.some((item) => String(item).startsWith('re:'))) signals.push(0.95)
  if (keywordCount > 0) signals.push(Math.min(0.94, 0.82 + ((keywordCount - 1) * 0.08)))
  if (intentCount > 0) signals.push(Math.min(0.72, 0.5 + ((intentCount - 1) * 0.1)))
  if (descriptionCount > 0) {
    signals.push([0, 0.42, 0.64, 0.78, 0.86][Math.min(descriptionCount, 4)])
  }

  return combineConfidenceSignals(signals)
}

function normalizeRetrievalConfidence(item) {
  if (!item || typeof item !== 'object') return 0
  const mode = normalizeText(item?.searchMode || item?.mode).toLowerCase()
  const rawKeywordScore = Number(item?.keywordScore)
  const keywordScore = Number.isFinite(rawKeywordScore)
    ? rawKeywordScore
    : mode === 'keyword'
      ? Number(item?.score) || 0
      : 0
  const semanticSimilarity = Number(item?.semanticSimilarity)

  let keywordConfidence = 0
  if (keywordScore >= 160) keywordConfidence = 0.96
  else if (keywordScore >= 100) keywordConfidence = 0.9
  else if (keywordScore >= 70) keywordConfidence = 0.8
  else if (keywordScore >= 50) keywordConfidence = 0.7
  else if (keywordScore >= 35) keywordConfidence = 0.55

  let semanticConfidence = 0
  if (Number.isFinite(semanticSimilarity)) {
    if (semanticSimilarity >= 0.8) semanticConfidence = 0.96
    else if (semanticSimilarity >= 0.72) semanticConfidence = 0.9
    else if (semanticSimilarity >= 0.64) semanticConfidence = 0.8
    else if (semanticSimilarity >= 0.58) semanticConfidence = 0.68
    else if (semanticSimilarity >= 0.52) semanticConfidence = 0.5
  }

  return Math.max(keywordConfidence, semanticConfidence)
}

function fuseSkillRoutingConfidence(localConfidence, retrievalConfidence) {
  const local = clampConfidence(localConfidence)
  const retrieval = clampConfidence(retrievalConfidence)
  if (!local) return clampConfidence(retrieval * 0.92)
  if (!retrieval) return local
  return combineConfidenceSignals([local, retrieval * 0.55])
}

function legacyMinimumScoreToConfidence(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) return DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE
  if (score <= 1) return 0.42
  if (score <= 2) return 0.64
  if (score <= 3) return 0.74
  if (score <= 4) return 0.82
  return 0.88
}

function hasDecisiveRoutingSignal(result) {
  const matches = Array.isArray(result?.matched) ? result.matched : []
  return matches.some((item) => {
    const value = String(item || '')
    return value.startsWith('name:') || value.startsWith('re:')
  })
}

export function scoreSkillByTriggers(skill, text) {
  const id = normalizeText(skill?._id)
  const name = normalizeText(skill?.name || id || 'Skill')
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  const triggers = getSkillTriggers(skill)
  if (!allowsImplicitSkillInvocation(skill)) {
    return { ok: false, id, name, score: 0, confidence: 0, matched: [] }
  }

  const matched = []
  let score = scoreSkillDescription(skill, raw, matched)
  triggers.keywords.forEach((keyword) => {
    if (lower.includes(keyword.toLowerCase())) {
      score += 2
      matched.push(`kw:${keyword}`)
    }
  })
  triggers.intents.forEach((intent) => {
    if (lower.includes(intent.toLowerCase())) {
      score += 1
      matched.push(`intent:${intent}`)
    }
  })
  triggers.regex.forEach((pattern) => {
    const regex = getRoutingRegex(pattern)
    if (!regex) return
    regex.lastIndex = 0
    if (regex.test(raw.slice(0, MAX_ROUTING_REGEX_INPUT_LENGTH))) {
      score += 3
      matched.push(`re:${pattern}`)
    }
  })
  return {
    ok: score > 0,
    id,
    name,
    score,
    confidence: computeLocalSkillConfidence(matched),
    matched
  }
}

export function pickSkillsByTriggers(skills, text, options = {}) {
  const minimumConfidence = options.minimumConfidence !== undefined
    ? clampConfidence(options.minimumConfidence)
    : options.minimumScore !== undefined
      ? legacyMinimumScoreToConfidence(options.minimumScore)
      : DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE
  const minimumMargin = options.minimumMargin !== undefined
    ? clampConfidence(options.minimumMargin)
    : DEFAULT_SKILL_ROUTING_MIN_MARGIN
  const limit = Math.max(1, Number(options.limit) || 2)
  const retrievalItems = Array.isArray(options.retrievalMatches) ? options.retrievalMatches : []
  const retrievalCapabilityType = normalizeText(options.retrievalCapabilityType || 'skill')
  const retrievalById = new Map(
    retrievalItems
      .filter((item) => !item?.capabilityType || item.capabilityType === retrievalCapabilityType)
      .map((item) => [
        normalizeText(item?.skillId || item?.capabilityId || item?._id || item?.id),
        item
      ])
      .filter(([id]) => id)
  )
  const ranked = (Array.isArray(skills) ? skills : [])
    .map((skill) => {
      const result = scoreSkillByTriggers(skill, text)
      const retrieval = retrievalById.get(result.id)
      if (!retrieval || !allowsImplicitSkillInvocation(skill)) return result
      const retrievalConfidence = normalizeRetrievalConfidence(retrieval)
      return {
        ...result,
        ok: result.ok || retrievalConfidence > 0,
        confidence: fuseSkillRoutingConfidence(result.confidence, retrievalConfidence),
        retrievalConfidence,
        matched: [
          ...result.matched,
          ...(retrievalConfidence > 0
            ? [`index:${normalizeText(retrieval?.searchMode || retrieval?.mode || 'hybrid')}`]
            : [])
        ]
      }
    })
    .filter((result) => result.ok && result.id && result.confidence >= minimumConfidence)
    .sort((a, b) => (
      Number(b.confidence || 0) - Number(a.confidence || 0) ||
      Number(b.score || 0) - Number(a.score || 0) ||
      b.matched.length - a.matched.length
    ))

  if (!ranked.length) return []
  if (
    ranked.length > 1 &&
    Number(ranked[0].confidence || 0) - Number(ranked[1].confidence || 0) < minimumMargin &&
    !hasDecisiveRoutingSignal(ranked[0])
  ) {
    return []
  }

  const picked = [ranked[0]]
  const additionalMinimum = Math.max(0.88, minimumConfidence + 0.1)
  for (const candidate of ranked.slice(1)) {
    if (picked.length >= limit) break
    if (candidate.confidence < additionalMinimum || !hasDecisiveRoutingSignal(candidate)) continue
    picked.push(candidate)
  }
  return picked
}

export function buildAutoSkillActivationPlan({
  skills = [],
  text = '',
  selectedSkillIds = [],
  agentSkillIds = [],
  activatedSkillIds = [],
  loadedSkillIds = [],
  retrievalMatches = [],
  retrievalCapabilityType = 'skill',
  minimumScore,
  minimumConfidence = DEFAULT_SKILL_ROUTING_MIN_CONFIDENCE,
  minimumMargin = DEFAULT_SKILL_ROUTING_MIN_MARGIN,
  limit = 1
} = {}) {
  const selected = new Set(normalizeStringList(selectedSkillIds))
  const agent = new Set(normalizeStringList(agentSkillIds))
  const activated = new Set(normalizeStringList(activatedSkillIds))
  const loaded = loadedSkillIds instanceof Set
    ? loadedSkillIds
    : new Set(normalizeStringList(loadedSkillIds))
  const candidates = (Array.isArray(skills) ? skills : []).filter((skill) => {
    const id = normalizeText(skill?._id)
    return !!id && !activated.has(id) && !loaded.has(id)
  })
  const picked = pickSkillsByTriggers(candidates, text, {
    minimumScore,
    minimumConfidence: minimumScore === undefined ? minimumConfidence : undefined,
    minimumMargin,
    limit,
    retrievalMatches,
    retrievalCapabilityType
  })
  const addedSelectedSkillIds = []
  const addedAgentSkillIds = []

  picked.forEach(({ id }) => {
    if (!selected.has(id)) {
      selected.add(id)
      addedSelectedSkillIds.push(id)
    }
    if (!agent.has(id)) {
      agent.add(id)
      addedAgentSkillIds.push(id)
    }
    activated.add(id)
  })

  return {
    picked,
    candidates,
    selectedSkillIds: Array.from(selected),
    agentSkillIds: Array.from(agent),
    activatedSkillIds: Array.from(activated),
    addedSelectedSkillIds,
    addedAgentSkillIds
  }
}
