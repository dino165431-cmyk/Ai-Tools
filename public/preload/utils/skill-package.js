const PACKAGE_KIND = 'ai-tools-skill-package'
const PACKAGE_SCHEMA_VERSION = 1

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

function uniqueStringList(list) {
  const out = []
  const seen = new Set()

  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const value = cleanString(item)
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push(value)
  })

  return out
}

function normalizeTriggers(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const out = {}

  ;['tags', 'keywords', 'regex', 'intents'].forEach((key) => {
    const values = uniqueStringList(source[key])
    if (values.length) out[key] = values
  })

  return out
}

function slugify(value, fallback = 'skill') {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function normalizeSkillItem(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const name = cleanString(source.name)
  const id = cleanString(source._id) || `skill_${slugify(name || source.id || 'package')}`

  return {
    _id: id,
    name: name || id,
    description: cleanString(source.description),
    content: typeof source.content === 'string' ? source.content : cleanString(source.content),
    triggers: normalizeTriggers(source.triggers),
    mcp: uniqueStringList(source.mcp),
    packageInfo: isPlainObject(source.packageInfo) ? { ...source.packageInfo } : undefined
  }
}

function normalizeMcpServerItem(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const transportType = cleanString(source.transportType)
  const name = cleanString(source.name)
  const id = cleanString(source._id) || `mcp_${slugify(name || transportType || 'package')}`

  const item = {
    _id: id,
    name: name || id,
    transportType: transportType || 'stdio',
    disabled: !!source.disabled,
    keepAlive: source.keepAlive !== false,
    timeout: Number.isFinite(Number(source.timeout)) ? Math.max(1000, Math.floor(Number(source.timeout))) : 15000,
    allowTools: uniqueStringList(source.allowTools)
  }

  const optionalStringFields = ['command', 'cwd', 'url', 'method']
  optionalStringFields.forEach((field) => {
    const value = cleanString(source[field])
    if (value) item[field] = value
  })

  if (Array.isArray(source.args)) item.args = uniqueStringList(source.args)
  if (isPlainObject(source.env)) item.env = { ...source.env }
  if (isPlainObject(source.headers)) item.headers = { ...source.headers }
  if ('pingOnConnect' in source) item.pingOnConnect = !!source.pingOnConnect
  if ('stream' in source) item.stream = !!source.stream
  if (Number.isFinite(Number(source.maxTotalTimeout))) {
    item.maxTotalTimeout = Math.max(1000, Math.floor(Number(source.maxTotalTimeout)))
  }

  return item
}

function buildPackageMeta(rawMeta, wrapper, skill, sourceHint) {
  const meta = isPlainObject(rawMeta) ? rawMeta : {}
  const version = cleanString(meta.version || wrapper.version)
  const author = cleanString(meta.author)
  const homepage = cleanString(meta.homepage)
  const description = cleanString(meta.description || wrapper.description || skill.description)
  const source = cleanString(meta.source || sourceHint)

  return {
    name: cleanString(meta.name || wrapper.name || skill.name || skill._id) || skill._id,
    version,
    author,
    homepage,
    description,
    source
  }
}

function normalizeSkillPackage(raw, options = {}) {
  const sourceHint = cleanString(options.source)
  const wrapper = isPlainObject(raw) ? raw : {}

  const packageBody = wrapper.kind === PACKAGE_KIND || wrapper.skill || wrapper.mcpServers || wrapper.dependencies
    ? wrapper
    : { skill: wrapper }

  const skillSource = isPlainObject(packageBody.skill) ? packageBody.skill : wrapper
  const skill = normalizeSkillItem(skillSource)
  const dependencyBlock = isPlainObject(packageBody.dependencies) ? packageBody.dependencies : {}
  const mcpServerList = Array.isArray(packageBody.mcpServers)
    ? packageBody.mcpServers
    : (Array.isArray(dependencyBlock.mcpServers) ? dependencyBlock.mcpServers : [])

  const mcpServers = mcpServerList
    .map((item) => normalizeMcpServerItem(item))
    .filter((item) => item && item._id)

  return {
    kind: PACKAGE_KIND,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    meta: buildPackageMeta(packageBody.meta, packageBody, skill, sourceHint),
    skill,
    mcpServers
  }
}

function buildExportableSkillPackage({ skill, mcpServers = [], source = '' }) {
  const normalizedSkill = normalizeSkillItem(skill)
  const packageInfo = isPlainObject(skill?.packageInfo) ? skill.packageInfo : {}

  return {
    kind: PACKAGE_KIND,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    meta: buildPackageMeta(packageInfo, {}, normalizedSkill, source),
    skill: normalizedSkill,
    mcpServers: (Array.isArray(mcpServers) ? mcpServers : [])
      .map((item) => normalizeMcpServerItem(item))
      .filter((item) => item && item._id)
  }
}

module.exports = {
  PACKAGE_KIND,
  PACKAGE_SCHEMA_VERSION,
  buildExportableSkillPackage,
  normalizeSkillPackage,
  slugify
}
