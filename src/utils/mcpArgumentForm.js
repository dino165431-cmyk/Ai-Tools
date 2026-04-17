export function normalizeMcpParamType(type) {
  const list = Array.isArray(type) ? type : [type]
  const picked = list.map((item) => String(item || '').trim()).find((item) => item && item !== 'null')
  if (picked === 'integer' || picked === 'number' || picked === 'boolean' || picked === 'object' || picked === 'array') return picked
  return 'string'
}

export function flattenMcpSchemaProperties(properties, required = [], prefix = '') {
  const params = []
  const requiredSet = new Set((Array.isArray(required) ? required : []).map((key) => String(key || '').trim()).filter(Boolean))

  Object.entries(properties && typeof properties === 'object' ? properties : {}).forEach(([key, schema]) => {
    const name = String(key || '').trim()
    if (!name) return
    const fullName = prefix ? `${prefix}.${name}` : name
    const def = schema && typeof schema === 'object' ? schema : {}
    const type = normalizeMcpParamType(def.type)

    if (type === 'object' && def.properties && typeof def.properties === 'object') {
      params.push(...flattenMcpSchemaProperties(def.properties, def.required || [], fullName))
      return
    }

    params.push({
      name: fullName,
      displayName: fullName,
      type,
      required: requiredSet.has(name),
      description: String(def.description || def.title || '').trim(),
      enum: Array.isArray(def.enum) ? def.enum : null,
      default: def.default
    })
  })

  return params
}

export function normalizeMcpPromptArgumentDefinitions(prompt) {
  const fromArray = Array.isArray(prompt?.arguments)
    ? prompt.arguments
    : Array.isArray(prompt?.args)
      ? prompt.args
      : null

  if (fromArray) {
    return fromArray
      .filter((arg) => arg && typeof arg === 'object' && String(arg.name || '').trim())
      .map((arg) => {
        const schema = arg.schema && typeof arg.schema === 'object' ? arg.schema : {}
        const type = normalizeMcpParamType(arg.type || schema.type)
        return {
          name: String(arg.name || '').trim(),
          displayName: String(arg.displayName || arg.name || '').trim(),
          type,
          required: !!arg.required,
          description: String(arg.description || schema.description || schema.title || '').trim(),
          enum: Array.isArray(arg.enum) ? arg.enum : Array.isArray(schema.enum) ? schema.enum : null,
          default: arg.default !== undefined ? arg.default : schema.default
        }
      })
  }

  const schema =
    prompt?.inputSchema && typeof prompt.inputSchema === 'object'
      ? prompt.inputSchema
      : prompt?.argumentsSchema && typeof prompt.argumentsSchema === 'object'
        ? prompt.argumentsSchema
        : prompt?.argumentSchema && typeof prompt.argumentSchema === 'object'
          ? prompt.argumentSchema
          : null
  const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : null
  if (!properties) return []
  return flattenMcpSchemaProperties(properties, schema?.required || [])
}

export function unflattenMcpArgObject(flatObj) {
  const out = {}
  Object.entries(flatObj && typeof flatObj === 'object' ? flatObj : {}).forEach(([key, value]) => {
    const parts = String(key || '').split('.').filter(Boolean)
    if (!parts.length) return
    let current = out
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i]
      if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {}
      current = current[part]
    }
    current[parts[parts.length - 1]] = value
  })
  return out
}

export function isEmptyMcpArgValue(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) {
    return value.every((item) => {
      if (item === undefined || item === null) return true
      if (typeof item === 'string') return !item.trim()
      if (item && typeof item === 'object') {
        const key = String(item.key ?? '').trim()
        if (key) return false
        const nested = item.value
        if (nested === undefined || nested === null) return true
        if (typeof nested === 'string') return !nested.trim()
        if (nested && typeof nested === 'object') return !Object.keys(nested).length
        return false
      }
      return false
    })
  }
  if (typeof value === 'object') return !Object.keys(value).length
  return false
}

function parseLooseJson(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return String(text ?? '')
  }
}

export function parseMcpArgValue(param, rawValue) {
  const type = normalizeMcpParamType(param?.type)
  if (type === 'object') {
    if (rawValue === undefined || rawValue === null) return undefined
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) return undefined
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object')
      return Object.keys(parsed).length ? parsed : undefined
    }
    if (Array.isArray(rawValue)) {
      const obj = {}
      rawValue.forEach((pair) => {
        const key = String(pair?.key ?? '').trim()
        if (!key) return
        const value = typeof pair?.value === 'string' ? parseLooseJson(pair.value) : pair?.value
        obj[key] = value === undefined ? '' : value
      })
      return Object.keys(obj).length ? obj : undefined
    }
    if (rawValue && typeof rawValue === 'object') return Object.keys(rawValue).length ? rawValue : undefined
    return rawValue
  }

  if (type === 'array') {
    if (rawValue === undefined || rawValue === null) return undefined
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) return undefined
      const parsed = JSON.parse(trimmed)
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array')
      return parsed.length ? parsed : undefined
    }
    if (Array.isArray(rawValue)) {
      const arr = rawValue.map((item) => (typeof item === 'string' ? parseLooseJson(item) : item)).filter((item) => item !== undefined)
      return arr.length ? arr : undefined
    }
    return rawValue
  }

  if (typeof rawValue === 'string') return rawValue
  return rawValue
}

export function buildMcpArgsFromForm(params, formData) {
  const flat = {}
  ;(Array.isArray(params) ? params : []).forEach((param) => {
    const name = String(param?.name || '').trim()
    if (!name) return
    const rawValue = formData?.[name]
    if (param.required && isEmptyMcpArgValue(rawValue)) {
      throw new Error(`Please fill parameter "${param.displayName || param.name}"`)
    }
    const parsed = parseMcpArgValue(param, rawValue)
    if (parsed === undefined) return
    flat[name] = parsed
  })
  if (!Object.keys(flat).length) return undefined
  return unflattenMcpArgObject(flat)
}

export function parseMcpPromptJsonArgs(raw) {
  const text = String(raw || '').trim()
  if (!text) return undefined
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) {
    if (!parsed.length) return undefined
    throw new Error('Prompt arguments must be a JSON object, not an array')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Prompt arguments must be a JSON object')
  }
  return Object.keys(parsed).length ? parsed : undefined
}

export function resetMcpArgFormData(params, formData) {
  if (!formData || typeof formData !== 'object') return
  Object.keys(formData).forEach((key) => delete formData[key])
  ;(Array.isArray(params) ? params : []).forEach((param) => {
    const name = String(param?.name || '').trim()
    if (!name) return
    if (param.default !== undefined) {
      if (param.type === 'object') {
        if (param.default && typeof param.default === 'object' && !Array.isArray(param.default)) {
          formData[name] = Object.entries(param.default).map(([key, value]) => ({
            key: String(key),
            value: typeof value === 'string' ? value : JSON.stringify(value)
          }))
        } else if (typeof param.default === 'string') {
          try {
            const parsed = JSON.parse(param.default)
            formData[name] = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? Object.entries(parsed).map(([key, value]) => ({ key: String(key), value: typeof value === 'string' ? value : JSON.stringify(value) }))
              : []
          } catch {
            formData[name] = []
          }
        } else {
          formData[name] = []
        }
        return
      }
      if (param.type === 'array') {
        if (Array.isArray(param.default)) formData[name] = JSON.parse(JSON.stringify(param.default))
        else if (typeof param.default === 'string') {
          try {
            const parsed = JSON.parse(param.default)
            formData[name] = Array.isArray(parsed) ? parsed : []
          } catch {
            formData[name] = []
          }
        } else {
          formData[name] = []
        }
        return
      }
      formData[name] = param.default
      return
    }

    if (param.type === 'boolean') formData[name] = false
    else if (param.type === 'number' || param.type === 'integer') formData[name] = null
    else if (param.type === 'string' && Array.isArray(param.enum) && param.enum.length) formData[name] = null
    else if (param.type === 'object' || param.type === 'array') formData[name] = []
    else formData[name] = ''
  })
}
