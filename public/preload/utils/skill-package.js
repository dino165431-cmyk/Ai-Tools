const PACKAGE_KIND = 'ai-tools-skill-package'
const PACKAGE_SCHEMA_VERSION = 2
const LEGACY_PACKAGE_SCHEMA_VERSION = 1
const MAX_SKILL_PACKAGE_DOWNLOAD_BYTES = 48 * 1024 * 1024
const MAX_SKILL_PACKAGE_FILE_COUNT = 1024
const MAX_SKILL_PACKAGE_FILE_BYTES = 8 * 1024 * 1024
const MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES = 32 * 1024 * 1024
const MAX_SKILL_PACKAGE_INLINE_CONTENT_BYTES = 8 * 1024 * 1024
const MAX_SKILL_PACKAGE_PATH_BYTES = 1024
const MAX_SKILL_PACKAGE_PATH_SEGMENT_BYTES = 255
const WINDOWS_RESERVED_PATH_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

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

function assertUtf8Size(value, maxBytes, label) {
  const bytes = Buffer.byteLength(String(value || ''), 'utf8')
  if (bytes > maxBytes) {
    throw new Error(`${label} 不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MiB`)
  }
  return bytes
}

function isSensitiveEnvironmentPath(filePath) {
  const basename = String(filePath || '').split('/').pop().toLowerCase()
  return basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')
}

function normalizePackagedFilePath(value) {
  const raw = typeof value === 'string' ? value : ''
  if (!raw || raw !== raw.trim()) throw new Error('Skill 包文件 path 不能为空或包含首尾空白')
  if (raw.includes('\0')) throw new Error('Skill 包文件 path 包含非法字符')

  const normalized = raw.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new Error(`Skill 包文件 path 必须是相对路径：${raw}`)
  }
  if (Buffer.byteLength(normalized, 'utf8') > MAX_SKILL_PACKAGE_PATH_BYTES) {
    throw new Error(`Skill 包文件 path 过长：${raw}`)
  }

  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Skill 包文件 path 不能包含空目录、. 或 ..：${raw}`)
  }

  for (const part of parts) {
    if (Buffer.byteLength(part, 'utf8') > MAX_SKILL_PACKAGE_PATH_SEGMENT_BYTES) {
      throw new Error(`Skill 包文件 path 片段过长：${raw}`)
    }
    if (/[\u0000-\u001f<>:"|?*]/.test(part) || /[. ]$/.test(part) || WINDOWS_RESERVED_PATH_SEGMENT.test(part)) {
      throw new Error(`Skill 包文件 path 包含不兼容字符：${raw}`)
    }
    if (part.toLowerCase() === '.git' || part.toLowerCase() === 'node_modules') {
      throw new Error(`Skill 包不能包含 ${part} 目录`)
    }
  }

  if (isSensitiveEnvironmentPath(normalized)) {
    throw new Error(`Skill 包不能包含敏感环境文件：${normalized}`)
  }
  return normalized
}

function decodePackagedFileContent(source, filePath) {
  const encoding = cleanString(source.encoding || 'utf8').toLowerCase()
  const content = typeof source.content === 'string'
    ? source.content
    : (typeof source.data === 'string' ? source.data : null)
  if (content === null) throw new Error(`Skill 包文件缺少 content：${filePath}`)

  if (encoding === 'utf8' || encoding === 'utf-8') {
    assertUtf8Size(content, MAX_SKILL_PACKAGE_FILE_BYTES, `Skill 包单文件（${filePath}）`)
    return {
      encoding: 'utf8',
      content,
      buffer: Buffer.from(content, 'utf8')
    }
  }

  if (encoding !== 'base64') {
    throw new Error(`Skill 包文件 encoding 仅支持 utf8/base64：${filePath}`)
  }
  const maxEncodedLength = Math.ceil(MAX_SKILL_PACKAGE_FILE_BYTES / 3) * 4
  if (content.length > maxEncodedLength) {
    throw new Error(`Skill 包单文件（${filePath}）不能超过 ${Math.floor(MAX_SKILL_PACKAGE_FILE_BYTES / 1024 / 1024)}MiB`)
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 === 1) {
    throw new Error(`Skill 包文件 base64 无效：${filePath}`)
  }

  const buffer = Buffer.from(content, 'base64')
  const expected = content.replace(/=+$/, '')
  if (buffer.toString('base64').replace(/=+$/, '') !== expected) {
    throw new Error(`Skill 包文件 base64 无效：${filePath}`)
  }
  if (buffer.length > MAX_SKILL_PACKAGE_FILE_BYTES) {
    throw new Error(`Skill 包单文件（${filePath}）不能超过 ${Math.floor(MAX_SKILL_PACKAGE_FILE_BYTES / 1024 / 1024)}MiB`)
  }
  return { encoding: 'base64', content, buffer }
}

function normalizePackageFiles(rawFiles) {
  if (rawFiles === undefined || rawFiles === null) return []
  if (!Array.isArray(rawFiles)) throw new Error('Skill 包 files 必须是数组')
  if (rawFiles.length > MAX_SKILL_PACKAGE_FILE_COUNT) {
    throw new Error(`Skill 包文件数不能超过 ${MAX_SKILL_PACKAGE_FILE_COUNT}`)
  }

  const seen = new Set()
  let totalBytes = 0
  const files = rawFiles.map((rawFile, index) => {
    if (!isPlainObject(rawFile)) throw new Error(`Skill 包文件 ${index} 必须是对象`)
    const filePath = normalizePackagedFilePath(rawFile.path)
    const collisionKey = filePath.toLowerCase()
    if (seen.has(collisionKey)) throw new Error(`Skill 包包含重复文件路径：${filePath}`)
    seen.add(collisionKey)

    const decoded = decodePackagedFileContent(rawFile, filePath)
    totalBytes += decoded.buffer.length
    if (totalBytes > MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES) {
      throw new Error(`Skill 包展开后的文件总大小不能超过 ${Math.floor(MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES / 1024 / 1024)}MiB`)
    }
    if (Number.isFinite(Number(rawFile.size)) && Number(rawFile.size) !== decoded.buffer.length) {
      throw new Error(`Skill 包文件 size 与实际内容不一致：${filePath}`)
    }

    return {
      path: filePath,
      encoding: decoded.encoding,
      content: decoded.content,
      size: decoded.buffer.length
    }
  })

  if (files.length && !files.some((file) => file.path === 'SKILL.md')) {
    throw new Error('包含 files 的 Skill 包必须提供 SKILL.md')
  }
  return files
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

  const content = typeof source.content === 'string' ? source.content : cleanString(source.content)
  assertUtf8Size(content, MAX_SKILL_PACKAGE_INLINE_CONTENT_BYTES, 'Skill content')

  return {
    _id: id,
    name: name || id,
    description: cleanString(source.description),
    content,
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
  const declaredSchemaVersion = Number(packageBody.schemaVersion)
  if (
    packageBody.kind === PACKAGE_KIND
    && Object.prototype.hasOwnProperty.call(packageBody, 'schemaVersion')
    && (
      !Number.isInteger(declaredSchemaVersion)
      || (
        declaredSchemaVersion !== LEGACY_PACKAGE_SCHEMA_VERSION
        && declaredSchemaVersion !== PACKAGE_SCHEMA_VERSION
      )
    )
  ) {
    throw new Error(`不支持的 Skill 包 schemaVersion：${packageBody.schemaVersion}`)
  }

  const skillSource = isPlainObject(packageBody.skill) ? packageBody.skill : wrapper
  const skill = normalizeSkillItem(skillSource)
  const dependencyBlock = isPlainObject(packageBody.dependencies) ? packageBody.dependencies : {}
  const mcpServerList = Array.isArray(packageBody.mcpServers)
    ? packageBody.mcpServers
    : (Array.isArray(dependencyBlock.mcpServers) ? dependencyBlock.mcpServers : [])

  const mcpServers = mcpServerList
    .map((item) => normalizeMcpServerItem(item))
    .filter((item) => item && item._id)
  const files = normalizePackageFiles(packageBody.files)

  return {
    kind: PACKAGE_KIND,
    schemaVersion: files.length ? PACKAGE_SCHEMA_VERSION : (declaredSchemaVersion || LEGACY_PACKAGE_SCHEMA_VERSION),
    meta: buildPackageMeta(packageBody.meta, packageBody, skill, sourceHint),
    skill,
    mcpServers,
    files
  }
}

function buildExportableSkillPackage({ skill, mcpServers = [], files = [], source = '' }) {
  const normalizedSkill = normalizeSkillItem(skill)
  const packageInfo = isPlainObject(skill?.packageInfo) ? skill.packageInfo : {}
  const normalizedFiles = normalizePackageFiles(files)

  return {
    kind: PACKAGE_KIND,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    meta: buildPackageMeta(packageInfo, {}, normalizedSkill, source),
    skill: normalizedSkill,
    mcpServers: (Array.isArray(mcpServers) ? mcpServers : [])
      .map((item) => normalizeMcpServerItem(item))
      .filter((item) => item && item._id),
    files: normalizedFiles
  }
}

module.exports = {
  PACKAGE_KIND,
  PACKAGE_SCHEMA_VERSION,
  MAX_SKILL_PACKAGE_DOWNLOAD_BYTES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILE_COUNT,
  MAX_SKILL_PACKAGE_INLINE_CONTENT_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES,
  buildExportableSkillPackage,
  normalizeSkillPackage,
  slugify
}
