const MCP_CATALOG_MAX_OPTIONAL_KEYS_PER_TOOL = 12

function deepCopyJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback ?? value
  }
}

export function normalizeOneLine(text, maxLen = 120) {
  const s = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return ''
  if (!maxLen || s.length <= maxLen) return s
  return s.slice(0, Math.max(0, maxLen - 3)) + '...'
}

export function buildToolArgsHint(tool) {
  const schema = tool?.inputSchema
  if (!schema || typeof schema !== 'object') return null

  if (!isObjectLikeToolInputSchema(schema)) {
    const rawType = Array.isArray(schema?.type) ? schema.type.filter(Boolean).join('|') : String(schema?.type || '').trim()
    return rawType ? { input_type: rawType } : { input_type: 'any' }
  }

  const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {}
  const propKeys = Object.keys(props || {}).map((k) => String(k || '').trim()).filter(Boolean)

  const requiredRaw = Array.isArray(schema?.required) ? schema.required : []
  const required = requiredRaw.map((k) => String(k || '').trim()).filter(Boolean)
  const requiredSet = new Set(required)

  const optionalAll = propKeys.filter((k) => !requiredSet.has(k))
  const optional = optionalAll.slice(0, MCP_CATALOG_MAX_OPTIONAL_KEYS_PER_TOOL)
  const optionalTruncated = Math.max(0, optionalAll.length - optional.length)

  const out = {}
  if (required.length) out.required = required
  if (optional.length) out.optional = optional
  if (optionalTruncated > 0) out.optional_truncated = optionalTruncated

  return Object.keys(out).length ? out : null
}

export function buildMcpToolHint(tool) {
  const name = String(tool?.name || '').trim()
  if (!name) return null
  const hint = { name }
  const d = normalizeOneLine(tool?.description || '', 90)
  if (d) hint.description = d
  const argsHint = buildToolArgsHint(tool)
  if (argsHint) Object.assign(hint, argsHint)
  return hint
}

export function makeToolFunctionName(serverId, toolName) {
  const raw = `mcp__${serverId}__${toolName}`
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (safe.length <= 64) return safe
  let hash = 0
  for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0
  return `${safe.slice(0, 55)}_${hash.toString(16).slice(0, 8)}`
}

export function sanitizeToolInputSchemaForProvider(schemaRaw) {
  const schema = deepCopyJson(schemaRaw, null)
  const out = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {}

  // OpenAI/兼容接口限制：顶层 schema 必须是 object，且不允许 anyOf/oneOf/allOf/enum/not 等关键字
  out.type = 'object'
  if (!out.properties || typeof out.properties !== 'object' || Array.isArray(out.properties)) out.properties = {}
  if (!('additionalProperties' in out)) out.additionalProperties = false
  if (!Array.isArray(out.required)) delete out.required

  delete out.oneOf
  delete out.anyOf
  delete out.allOf
  delete out.enum
  delete out.not

  return out
}

export function isObjectLikeToolInputSchema(schemaRaw) {
  if (!schemaRaw || typeof schemaRaw !== 'object' || Array.isArray(schemaRaw)) return false
  const type = schemaRaw.type
  if (typeof type === 'string') return type === 'object'
  if (Array.isArray(type)) return type.includes('object')
  return !!(schemaRaw.properties && typeof schemaRaw.properties === 'object' && !Array.isArray(schemaRaw.properties))
}

export function buildProviderToolDefinition(inputSchemaRaw) {
  const fallback = { type: 'object', properties: {}, additionalProperties: false }
  if (!inputSchemaRaw || typeof inputSchemaRaw !== 'object' || Array.isArray(inputSchemaRaw)) {
    return {
      parameters: fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  if (isObjectLikeToolInputSchema(inputSchemaRaw)) {
    return {
      parameters: sanitizeToolInputSchemaForProvider(inputSchemaRaw) || fallback,
      wrapped: false,
      unwrapArgs(argsObj) {
        return argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? argsObj : {}
      }
    }
  }

  const nested = deepCopyJson(inputSchemaRaw, null)
  return {
    parameters: {
      type: 'object',
      properties: {
        input: nested
      },
      required: ['input'],
      additionalProperties: false
    },
    wrapped: true,
    unwrapArgs(argsObj) {
      if (!argsObj || typeof argsObj !== 'object' || Array.isArray(argsObj)) return undefined
      return argsObj.input
    }
  }
}

export function buildProviderToolDescription(server, tool, definition) {
  const base = tool?.description ? `[${server.name || server._id}] ${tool.description}` : `[${server.name || server._id}] ${tool?.name || ''}`
  if (!definition?.wrapped) return base
  return `${base} (the original inputSchema top level is not an object; call it with {"input": ...})`
}
