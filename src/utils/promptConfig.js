export const PROMPT_TYPE_SYSTEM = 'system'
export const PROMPT_TYPE_USER = 'user'

export const PROMPT_TYPE_OPTIONS = Object.freeze([
  {
    label: '系统提示词',
    value: PROMPT_TYPE_SYSTEM
  },
  {
    label: '用户提示词',
    value: PROMPT_TYPE_USER
  }
])

const PROMPT_VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g

export function normalizePromptType(type) {
  return String(type || '').trim().toLowerCase() === PROMPT_TYPE_USER
    ? PROMPT_TYPE_USER
    : PROMPT_TYPE_SYSTEM
}

export function isSystemPrompt(prompt) {
  return normalizePromptType(prompt?.type) === PROMPT_TYPE_SYSTEM
}

export function isUserPrompt(prompt) {
  return normalizePromptType(prompt?.type) === PROMPT_TYPE_USER
}

function parsePromptVariableToken(token) {
  const raw = String(token || '').trim()
  if (!raw) return null

  let left = raw
  let defaultValue
  const equalIndex = raw.indexOf('=')
  if (equalIndex >= 0) {
    left = raw.slice(0, equalIndex).trim()
    defaultValue = raw.slice(equalIndex + 1).trim()
  }

  let name = left
  let description = ''
  const pipeIndex = left.indexOf('|')
  if (pipeIndex >= 0) {
    name = left.slice(0, pipeIndex).trim()
    description = left.slice(pipeIndex + 1).trim()
  }

  if (!name) return null

  return {
    name,
    displayName: name,
    description,
    default: defaultValue,
    required: defaultValue === undefined
  }
}

export function extractPromptVariables(content) {
  const text = String(content || '')
  const variables = []
  const seen = new Set()

  let match
  while ((match = PROMPT_VARIABLE_PATTERN.exec(text))) {
    const parsed = parsePromptVariableToken(match[1])
    if (!parsed || seen.has(parsed.name)) continue
    seen.add(parsed.name)
    variables.push({
      ...parsed,
      type: 'string'
    })
  }

  PROMPT_VARIABLE_PATTERN.lastIndex = 0
  return variables
}

export function countPromptVariables(content) {
  return extractPromptVariables(content).length
}

export function resetPromptVariableFormData(params, formData) {
  if (!formData || typeof formData !== 'object') return
  Object.keys(formData).forEach((key) => delete formData[key])

  ;(Array.isArray(params) ? params : []).forEach((param) => {
    const name = String(param?.name || '').trim()
    if (!name) return
    formData[name] = param.default !== undefined ? String(param.default) : ''
  })
}

export function buildPromptVariableValues(params, formData) {
  const values = {}

  ;(Array.isArray(params) ? params : []).forEach((param) => {
    const name = String(param?.name || '').trim()
    if (!name) return

    const rawValue = formData?.[name]
    const textValue = rawValue === undefined || rawValue === null ? '' : String(rawValue)
    const trimmedValue = textValue.trim()
    if (param.required && !trimmedValue) {
      throw new Error(`请填写变量“${param.displayName || param.name || name}”`)
    }

    if (trimmedValue) values[name] = textValue
    else if (param.default !== undefined) values[name] = String(param.default)
    else values[name] = ''
  })

  return values
}

export function renderPromptTemplate(content, values = {}) {
  return String(content || '').replace(PROMPT_VARIABLE_PATTERN, (_, token) => {
    const parsed = parsePromptVariableToken(token)
    if (!parsed) return ''

    const value = values?.[parsed.name]
    if (value !== undefined && value !== null && String(value) !== '') return String(value)
    if (parsed.default !== undefined) return String(parsed.default)
    return ''
  })
}
