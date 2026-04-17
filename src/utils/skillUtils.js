const SKILL_SCRIPT_MANIFEST_PATH = 'scripts/manifest.json'
const RUNNABLE_SKILL_SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.py', '.ps1', '.sh', '.bash'])

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []

  const out = []
  const seen = new Set()

  value.forEach((item) => {
    const text = String(item || '').trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push(text)
  })

  return out
}

function joinIndexedPaths(list) {
  return list
    .slice(0, 8)
    .map((item) => `\`${item}\``)
    .join(', ')
}

function normalizeSkillPath(filePath) {
  return String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeCatalogText(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('\n')
  }
  if (value && typeof value === 'object') {
    const description = typeof value.description === 'string' ? value.description.trim() : ''
    if (description) return description
  }
  return ''
}

function normalizeSkillScriptOutputType(value) {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && typeof value.type === 'string'
      ? value.type
      : ''
  return String(raw || '').trim().toLowerCase() === 'json' ? 'json' : 'text'
}

function normalizeSkillScriptRuntime(value, scriptPath = '') {
  const raw = String(value || '').trim().toLowerCase()
  if (raw) return raw
  const match = normalizeSkillPath(scriptPath).match(/\.([^.\/]+)$/)
  return match ? match[1].toLowerCase() : ''
}

function buildFallbackSkillScriptCatalog(skill) {
  return getSkillFileIndex(skill).scripts
    .filter((scriptPath) => isRunnableSkillScriptPath(scriptPath))
    .map((scriptPath) => ({
      path: scriptPath,
      name: scriptPath.split('/').pop()?.replace(/\.[^.]+$/, '') || scriptPath,
      description: '',
      whenToUse: '',
      argsHelp: '',
      inputHelp: '',
      outputType: 'text',
      outputTypeDeclared: false,
      outputTypeSource: 'default',
      cwd: '',
      timeoutMs: null,
      runtime: normalizeSkillScriptRuntime('', scriptPath)
    }))
}

function normalizeSkillScriptCatalogEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null

  const scriptPath = normalizeSkillPath(entry.path || entry.script || entry.file)
  if (!isRunnableSkillScriptPath(scriptPath)) return null

  return {
    path: scriptPath,
    name: String(entry.name || scriptPath.split('/').pop()?.replace(/\.[^.]+$/, '') || scriptPath).trim() || scriptPath,
    description: normalizeCatalogText(entry.description || entry.desc),
    whenToUse: normalizeCatalogText(entry.whenToUse ?? entry.when_to_use ?? entry.useWhen ?? entry.use_when),
    argsHelp: normalizeCatalogText(entry.argsHelp ?? entry.args_help ?? entry.args),
    inputHelp: normalizeCatalogText(entry.inputHelp ?? entry.input_help ?? entry.input),
    outputType: normalizeSkillScriptOutputType(entry.outputType ?? entry.output_type ?? entry.output),
    outputTypeDeclared: !!(entry.outputTypeDeclared ?? entry.output_type_declared),
    outputTypeSource: String(entry.outputTypeSource || entry.output_type_source || '').trim() || 'default',
    cwd: normalizeSkillPath(entry.cwd),
    timeoutMs: Number.isFinite(Number(entry.timeoutMs ?? entry.timeout_ms))
      ? Math.max(1, Math.floor(Number(entry.timeoutMs ?? entry.timeout_ms)))
      : null,
    runtime: normalizeSkillScriptRuntime(entry.runtime, scriptPath),
    isLikelyEntrypoint: !!(entry.isLikelyEntrypoint ?? entry.is_likely_entrypoint)
  }
}

export function isDirectorySkill(skill) {
  return String(skill?.sourceType || '').trim() === 'directory' && !!String(skill?.sourcePath || '').trim()
}

export function getSkillSummary(skill) {
  return String(skill?.cache?.summary || '').trim()
}

export function getSkillDescription(skill) {
  return String(skill?.description || getSkillSummary(skill)).trim()
}

export function getSkillFileIndex(skill) {
  const src = skill?.cache?.fileIndex && typeof skill.cache.fileIndex === 'object' ? skill.cache.fileIndex : {}

  return {
    skill: String(src.skill || skill?.entryFile || 'SKILL.md'),
    references: normalizeStringList(src.references),
    scripts: normalizeStringList(src.scripts),
    assets: normalizeStringList(src.assets),
    agents: normalizeStringList(src.agents),
    extra: normalizeStringList(src.extra)
  }
}

export function isRunnableSkillScriptPath(filePath) {
  const normalized = normalizeSkillPath(filePath)
  if (!normalized.startsWith('scripts/')) return false
  if (normalized.toLowerCase() === SKILL_SCRIPT_MANIFEST_PATH) return false
  return RUNNABLE_SKILL_SCRIPT_EXTENSIONS.has((normalized.match(/\.[^.]+$/)?.[0] || '').toLowerCase())
}

export function getSkillScriptCatalog(skill) {
  const rawCatalog = Array.isArray(skill?.cache?.scriptCatalog) ? skill.cache.scriptCatalog : []
  const normalizedCatalog = rawCatalog
    .map((entry) => normalizeSkillScriptCatalogEntry(entry))
    .filter(Boolean)

  if (normalizedCatalog.length) {
    const fallbackByPath = new Map(buildFallbackSkillScriptCatalog(skill).map((entry) => [entry.path, entry]))
    normalizedCatalog.forEach((entry) => {
      fallbackByPath.set(entry.path, {
        ...(fallbackByPath.get(entry.path) || {}),
        ...entry
      })
    })
    return Array.from(fallbackByPath.values())
  }

  return buildFallbackSkillScriptCatalog(skill)
}

export function buildSkillFileIndexLines(skill) {
  const index = getSkillFileIndex(skill)
  const lines = []

  if (index.references.length) lines.push(`references: ${joinIndexedPaths(index.references)}`)
  if (index.scripts.length) lines.push(`scripts: ${joinIndexedPaths(index.scripts)}`)
  if (index.assets.length) lines.push(`assets: ${joinIndexedPaths(index.assets)}`)
  if (index.agents.length) lines.push(`agents: ${joinIndexedPaths(index.agents)}`)
  if (index.extra.length) lines.push(`extra: ${joinIndexedPaths(index.extra)}`)

  return lines
}

export function buildSkillScriptCatalogLines(skill) {
  return getSkillScriptCatalog(skill).map((entry) => {
    const parts = [entry.path]
    if (entry.isLikelyEntrypoint) parts.push('entry')
    if (entry.runtime) parts.push(`runtime: ${entry.runtime}`)
    if (entry.description) parts.push(entry.description)
    if (entry.whenToUse) parts.push(`when: ${entry.whenToUse}`)
    if (entry.argsHelp) parts.push(`args: ${entry.argsHelp}`)
    if (entry.inputHelp) parts.push(`input: ${entry.inputHelp}`)
    if (entry.outputType === 'json') parts.push('output: json')
    return parts.join(' | ')
  })
}

export function buildSkillFileIndexSummary(skill) {
  const index = getSkillFileIndex(skill)
  const parts = []

  if (index.references.length) parts.push(`references ${index.references.length}`)
  if (index.scripts.length) parts.push(`scripts ${index.scripts.length}`)
  if (index.assets.length) parts.push(`assets ${index.assets.length}`)
  if (index.agents.length) parts.push(`agents ${index.agents.length}`)
  if (index.extra.length) parts.push(`extra ${index.extra.length}`)

  return parts.join(' / ')
}
