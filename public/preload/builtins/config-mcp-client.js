const crypto = require('crypto')

const globalConfig = require('../utils/global-config')

function randomId(prefix) {
  const p = String(prefix || 'cfg').trim() || 'cfg'
  const uuid = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${p}_${uuid}`
}

function cleanString(val) {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim()
  return ''
}

function normalizeOptionalString(val) {
  const s = cleanString(val)
  return s ? s : null
}

function isPlainObject(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
}

function normalizeStringList(val) {
  const out = []
  const seen = new Set()
  ;(Array.isArray(val) ? val : []).forEach((x) => {
    const s = cleanString(x)
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  })
  return out
}

function normalizeStringKeyedObject(val) {
  if (!isPlainObject(val)) return {}
  const out = {}
  Object.entries(val).forEach(([k, v]) => {
    const key = cleanString(k)
    if (!key) return
    out[key] = v === null || v === undefined ? '' : String(v)
  })
  return out
}

function pad2(n) {
  return String(Number(n) || 0).padStart(2, '0')
}

function formatLocalDateTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatUtcOffsetFromTimezoneOffsetMinutes(tzOffsetMinutes) {
  // JS Date.getTimezoneOffset(): minutes between UTC and local time (UTC - local).
  // Convert it to "+HH:MM" / "-HH:MM" (local - UTC).
  const minutes = Number.isFinite(Number(tzOffsetMinutes)) ? Number(tzOffsetMinutes) : 0
  const total = -minutes
  const sign = total >= 0 ? '+' : '-'
  const abs = Math.abs(total)
  const hh = pad2(Math.floor(abs / 60))
  const mm = pad2(abs % 60)
  return `${sign}${hh}:${mm}`
}

function safeResolveIanaTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const s = cleanString(tz)
    return s ? s : null
  } catch {
    return null
  }
}

function redactString(val) {
  const s = cleanString(val)
  if (!s) return ''
  return '***'
}

function redactObjectValues(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  Object.keys(obj).forEach((k) => {
    const key = String(k || '').trim()
    if (!key) return
    out[key] = '***'
  })
  return out
}

function stripProviderSecrets(provider) {
  const p = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {}
  const apikey = cleanString(p.apikey)
  return {
    ...p,
    apikey: apikey ? '***' : '',
    hasApiKey: !!apikey
  }
}

function stripMcpServerSecrets(server) {
  const s = server && typeof server === 'object' && !Array.isArray(server) ? server : {}
  const env = s.env
  const headers = s.headers
  return {
    ...s,
    env: redactObjectValues(env),
    headers: redactObjectValues(headers)
  }
}

function listMapValues(obj) {
  return Object.values(obj || {})
}

function splitLooseList(val) {
  if (Array.isArray(val)) return val
  const s = cleanString(val)
  if (!s) return []
  return s.split(/[\s,，、/|]+/).filter(Boolean)
}

function normalizeHms(val) {
  const s = cleanString(val)
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  const ss = m[3] == null ? 0 : Number(m[3])
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null
  if (!Number.isFinite(ss) || ss < 0 || ss > 59) return null
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
}

function normalizeYmd(val) {
  const s = cleanString(val)
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || y < 1970 || y > 9999) return null
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null
  if (!Number.isFinite(d) || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${pad2(mo)}-${pad2(d)}`
}

function normalizeIntervalSeconds(val) {
  const n = Number(val)
  if (!Number.isFinite(n)) return null
  const int = Math.floor(n)
  if (int <= 0) return null
  return Math.min(86400, Math.max(1, int))
}

const WEEKDAY_ALIASES = new Map([
  ['1', 1],
  ['mon', 1],
  ['monday', 1],
  ['周一', 1],
  ['星期一', 1],
  ['2', 2],
  ['tue', 2],
  ['tues', 2],
  ['tuesday', 2],
  ['周二', 2],
  ['星期二', 2],
  ['3', 3],
  ['wed', 3],
  ['weds', 3],
  ['wednesday', 3],
  ['周三', 3],
  ['星期三', 3],
  ['4', 4],
  ['thu', 4],
  ['thur', 4],
  ['thurs', 4],
  ['thursday', 4],
  ['周四', 4],
  ['星期四', 4],
  ['5', 5],
  ['fri', 5],
  ['friday', 5],
  ['周五', 5],
  ['星期五', 5],
  ['6', 6],
  ['sat', 6],
  ['saturday', 6],
  ['周六', 6],
  ['星期六', 6],
  ['7', 7],
  ['sun', 7],
  ['sunday', 7],
  ['周日', 7],
  ['周天', 7],
  ['星期日', 7],
  ['星期天', 7]
])

function normalizeWeekdays(val) {
  const items = splitLooseList(val)
  const out = []
  const seen = new Set()

  items.forEach((x) => {
    let n = null

    if (typeof x === 'number') {
      n = Math.floor(x)
    } else {
      const raw = cleanString(x)
      if (!raw) return
      const lower = raw.toLowerCase()
      n = WEEKDAY_ALIASES.get(raw) || WEEKDAY_ALIASES.get(lower) || null
      if (n == null && /^[1-7]$/.test(lower)) n = Number(lower)
    }

    if (!Number.isFinite(n) || n < 1 || n > 7) return
    if (seen.has(n)) return
    seen.add(n)
    out.push(n)
  })

  return out.sort((a, b) => a - b)
}

function normalizeMonthDays(val) {
  const items = splitLooseList(val)
  const out = []
  const seen = new Set()

  items.forEach((x) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return
    const d = Math.floor(n)
    if (d < 1 || d > 31) return
    if (seen.has(d)) return
    seen.add(d)
    out.push(d)
  })

  return out.sort((a, b) => a - b)
}

function normalizeTimedTaskTrigger(triggerRaw) {
  const src = isPlainObject(triggerRaw) ? triggerRaw : {}
  const type = cleanString(src.type || src.triggerType)
  if (!type) throw new Error('trigger.type 必填（once/interval/daily/weekly/monthly）')

  const allowed = new Set(['once', 'interval', 'daily', 'weekly', 'monthly'])
  if (!allowed.has(type)) throw new Error(`trigger.type 不支持：${type}`)

  if (type === 'once') {
    const date = normalizeYmd(src.date || src.triggerDate)
    const time = normalizeHms(src.time || src.triggerTime)
    if (!date) throw new Error('once 触发器需要 date（YYYY-MM-DD）')
    if (!time) throw new Error('once 触发器需要 time（HH:mm 或 HH:mm:ss）')
    return { type, date, time }
  }

  const time = normalizeHms(src.time || src.triggerTime)
  if (!time) throw new Error(`${type} 触发器需要 time（HH:mm 或 HH:mm:ss）`)

  if (type === 'interval') {
    const intervalSeconds = normalizeIntervalSeconds(src.intervalSeconds)
    if (!intervalSeconds) throw new Error('interval 触发器需要 intervalSeconds（正整数，单位秒）')
    return { type, time, intervalSeconds }
  }

  if (type === 'daily') return { type, time }

  if (type === 'weekly') {
    const weekdays = normalizeWeekdays(src.weekdays)
    if (!weekdays.length) throw new Error('weekly 触发器需要 weekdays（1=周一 ... 7=周日）')
    return { type, time, weekdays }
  }

  if (type === 'monthly') {
    const monthDays = normalizeMonthDays(src.monthDays)
    if (!monthDays.length) throw new Error('monthly 触发器需要 monthDays（1-31）')
    return { type, time, monthDays }
  }

  throw new Error(`trigger.type 不支持：${type}`)
}

function assertOnceTriggerInFuture(trigger) {
  if (!trigger || trigger.type !== 'once') return
  const ymd = String(trigger.date || '')
  const hms = String(trigger.time || '')
  const mDate = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const mTime = hms.match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (!mDate || !mTime) return

  const y = Number(mDate[1])
  const mo = Number(mDate[2])
  const d = Number(mDate[3])
  const hh = Number(mTime[1])
  const mm = Number(mTime[2])
  const ss = Number(mTime[3])
  const atMs = new Date(y, mo - 1, d, hh, mm, ss, 0).getTime()
  if (!Number.isFinite(atMs)) return

  const now = Date.now()
  if (atMs <= now) {
    throw new Error(`once 触发时间必须在未来：${ymd} ${hms}（当前：${formatLocalDateTime(new Date(now))}）`)
  }
}

function normalizeAgentFields(item) {
  const src = isPlainObject(item) ? item : {}
  const out = { ...src }
  if ('name' in out) out.name = cleanString(out.name)
  if ('provider' in out) out.provider = normalizeOptionalString(out.provider)
  if ('model' in out) out.model = normalizeOptionalString(out.model)
  if ('prompt' in out) out.prompt = normalizeOptionalString(out.prompt)
  if ('skills' in out) out.skills = normalizeStringList(out.skills)
  if ('mcp' in out) out.mcp = normalizeStringList(out.mcp)
  return out
}

function normalizeMcpServerFields(item) {
  const src = isPlainObject(item) ? item : {}
  const out = { ...src }
  const tt = cleanString(out.transportType)
  if (tt) out.transportType = tt
  if ('name' in out) out.name = cleanString(out.name)
  if ('command' in out) out.command = cleanString(out.command)
  if ('cwd' in out) out.cwd = cleanString(out.cwd)
  if ('url' in out) out.url = cleanString(out.url)
  if ('method' in out) out.method = 'POST'
  if ('timeout' in out) out.timeout = Number.isFinite(Number(out.timeout)) ? Math.max(1000, Math.floor(Number(out.timeout))) : undefined
  if ('maxTotalTimeout' in out) {
    out.maxTotalTimeout = Number.isFinite(Number(out.maxTotalTimeout))
      ? Math.max(1000, Math.floor(Number(out.maxTotalTimeout)))
      : undefined
  }
  if ('pingOnConnect' in out) out.pingOnConnect = !!out.pingOnConnect
  if ('stream' in out) out.stream = !!out.stream
  if ('allowTools' in out) out.allowTools = normalizeStringList(out.allowTools)
  if ('args' in out) out.args = normalizeStringList(out.args)
  if ('env' in out) out.env = normalizeStringKeyedObject(out.env)
  if ('headers' in out) out.headers = normalizeStringKeyedObject(out.headers)
  return out
}

function normalizeProviderFields(item) {
  const src = isPlainObject(item) ? item : {}
  const out = { ...src }
  if ('name' in out) out.name = cleanString(out.name)
  if ('baseurl' in out) out.baseurl = cleanString(out.baseurl)
  if ('apikey' in out) out.apikey = cleanString(out.apikey)
  if ('selectModels' in out) out.selectModels = normalizeStringList(out.selectModels)
  return out
}

function sanitizePatchObject(patchRaw) {
  const patch = patchRaw && typeof patchRaw === 'object' && !Array.isArray(patchRaw) ? { ...patchRaw } : {}
  delete patch._id
  delete patch.builtin
  return patch
}

function assertAllowedCustomTransportType(transportType) {
  const tt = cleanString(transportType)
  if (!tt) throw new Error('transportType 必填')
  const allowed = new Set(['stdio', 'sse', 'streamableHttp', 'http'])
  if (!allowed.has(tt)) throw new Error(`transportType 不支持：${tt}`)
  return tt
}

const CONFIG_LIST_FIRST_NOTE = '未知 _id 时先调用对应的 list 工具。'
const CONFIG_ADD_FULL_OBJECT_NOTE = '新增时字段直接放在顶层，使用完整对象；不要再包一层 patch。'
const CONFIG_UPDATE_PATCH_NOTE = '更新时顶层只能传 {id, patch}；真正要改的字段必须全部放在 patch 内，不要把 patch 字段平铺到顶层。'
const CONFIG_MASKED_VALUE_NOTE = 'list 接口返回的 "***" 只是脱敏占位，不要原样写回敏感字段。'
const MCP_TRANSPORT_SWITCH_NOTE = '若修改 transportType，请在同一次 patch 中补齐新传输的必填字段：stdio 需要 command，sse/http/streamableHttp 需要 url。'
const TIMED_TASK_TRIGGER_NOTE = 'trigger 推荐传完整对象；若改 trigger.type，要同时补齐该类型要求的 date/time/intervalSeconds/weekdays/monthDays。'

const STRING_ARRAY_SCHEMA = { type: 'array', items: { type: 'string' } }
const STRING_OBJECT_SCHEMA = { type: 'object', additionalProperties: { type: 'string' } }
const OPTIONAL_ID_SCHEMA = { type: 'string', description: '可选：自定义 _id。不填会自动生成。' }
const TARGET_ID_SCHEMA = { type: 'string', description: '目标条目的 _id。若不知道，先调用对应 list 工具。' }

const MCP_SERVER_FIELDS = {
  name: { type: 'string', description: '服务名称。建议可读且唯一。' },
  transportType: {
    type: 'string',
    enum: ['stdio', 'sse', 'streamableHttp', 'http'],
    description: '传输类型。新增时必填；更新若切换类型，要在同一次 patch 中补齐新类型必填字段。'
  },
  disabled: { type: 'boolean', description: '是否禁用。true 表示保留配置但不启用。' },
  keepAlive: { type: 'boolean', description: '是否复用连接。通常用于减少重复建连；不是 transportType 的替代字段。' },
  timeout: { type: 'integer', description: '请求超时（毫秒）。会被规范为 >= 1000 的整数。' },
  allowTools: {
    ...STRING_ARRAY_SCHEMA,
    description: '可选；工具白名单字符串数组。空数组表示不限制，等于全部工具。'
  },
  command: {
    type: 'string',
    description: '仅 stdio 使用。只填命令本身，例如 "npx" / "node" / "python"；不要把整条命令和参数拼在一起。'
  },
  args: {
    ...STRING_ARRAY_SCHEMA,
    description: '仅 stdio 使用。必须是字符串数组，例如 ["-y","@modelcontextprotocol/server-filesystem","E:/data"]；不要传单个字符串。'
  },
  env: {
    ...STRING_OBJECT_SCHEMA,
    description: '仅 stdio 使用。必须是对象，例如 {"API_KEY":"xxx"}；更新时空对象 {} 表示清空。' + CONFIG_MASKED_VALUE_NOTE
  },
  cwd: { type: 'string', description: '仅 stdio 使用。工作目录，可选。通常填 MCP 服务的运行目录。' },
  url: {
    type: 'string',
    description: '仅 sse/http/streamableHttp 使用。SSE 填订阅地址；streamableHttp/http 填 MCP endpoint。'
  },
  headers: {
    ...STRING_OBJECT_SCHEMA,
    description: '仅 HTTP 类 transport 使用。必须是对象，例如 {"Authorization":"Bearer ..."}；更新时空对象 {} 表示清空。' + CONFIG_MASKED_VALUE_NOTE
  },
  pingOnConnect: {
    type: 'boolean',
    description: '仅 SSE 使用。当服务端不会立即返回 endpoint/session 信息时，可开启额外连通性探测；不是通用 keepalive。'
  },
  maxTotalTimeout: { type: 'integer', description: '仅 SSE 使用。连接建立总超时（毫秒）。' },
  method: {
    type: 'string',
    enum: ['POST'],
    description: '仅 http / streamableHttp 使用。当前固定 POST；不要传 GET。'
  },
  stream: {
    type: 'boolean',
    description: '仅 streamableHttp 使用。兼容字段，表示期望流式响应。'
  }
}

const SKILL_TRIGGER_FIELDS = {
  tags: { ...STRING_ARRAY_SCHEMA, description: '可选；标签数组。' },
  keywords: { ...STRING_ARRAY_SCHEMA, description: '可选；关键词数组。' },
  regex: { ...STRING_ARRAY_SCHEMA, description: '可选；正则表达式字符串数组。' },
  intents: { ...STRING_ARRAY_SCHEMA, description: '可选；意图名称数组。' }
}

const SKILL_FIELDS = {
  name: { type: 'string', description: '技能名称。' },
  description: { type: 'string', description: '技能描述，可选。' },
  content: { type: 'string', description: '技能完整内容 / 规则，可选。' },
  triggers: {
    type: 'object',
    description: '可选；自动启用触发条件对象。字段值都必须是字符串数组，不要传单个字符串。',
    properties: SKILL_TRIGGER_FIELDS,
    additionalProperties: false
  },
  mcp: {
    ...STRING_ARRAY_SCHEMA,
    description: '可选；关联的 MCP 服务 _id 数组。'
  }
}

const SKILL_IMPORT_FIELDS = {
  path: {
    type: 'string',
    description: '必填；绝对路径。可传 skill 目录，或直接传 SKILL.md 文件路径。'
  },
  overwrite: {
    type: 'boolean',
    description: '可选；若同一个 skill _id 已存在，是否允许覆盖。默认 false。'
  },
  triggers: {
    type: 'object',
    description: '可选；导入后要绑定的触发条件对象。字段值都必须是字符串数组。',
    properties: SKILL_TRIGGER_FIELDS,
    additionalProperties: false
  },
  mcp: {
    ...STRING_ARRAY_SCHEMA,
    description: '可选；导入后绑定的 MCP 服务 _id 数组。'
  }
}

const PROMPT_FIELDS = {
  name: { type: 'string', description: '提示词名称。' },
  description: { type: 'string', description: '提示词描述，可选。' },
  content: { type: 'string', description: '提示词内容。新增时必填。' }
}

const AGENT_FIELDS = {
  name: { type: 'string', description: '智能体名称。' },
  provider: { type: 'string', description: '可选；Provider 的 _id。空字符串表示取消绑定。' },
  model: { type: 'string', description: '可选；默认模型名。空字符串表示取消指定。' },
  skills: { ...STRING_ARRAY_SCHEMA, description: '可选；Skill 的 _id 数组。' },
  mcp: { ...STRING_ARRAY_SCHEMA, description: '可选；MCP 的 _id 数组。' },
  prompt: { type: 'string', description: '可选；Prompt 的 _id。空字符串表示取消绑定。' }
}

const PROVIDER_FIELDS = {
  name: { type: 'string', description: '服务商名称。' },
  baseurl: { type: 'string', description: '接口基地址，例如 https://api.openai.com/v1。' },
  apikey: { type: 'string', description: 'API Key。敏感字段；更新时不要把 "***" 原样传回。' },
  selectModels: { ...STRING_ARRAY_SCHEMA, description: '可选；启用的模型名数组。' }
}

const TIMED_TASK_TRIGGER_FIELDS = {
  type: {
    type: 'string',
    enum: ['once', 'interval', 'daily', 'weekly', 'monthly'],
    description: '触发类型。'
  },
  date: { type: 'string', description: '仅 once 使用；格式 YYYY-MM-DD。' },
  time: { type: 'string', description: '用于 once/interval/daily/weekly/monthly；格式 HH:mm 或 HH:mm:ss。' },
  intervalSeconds: { type: 'integer', description: '仅 interval 使用；正整数秒。' },
  weekdays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 7 },
    description: '仅 weekly 使用；1=周一 ... 7=周日。'
  },
  monthDays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 31 },
    description: '仅 monthly 使用；每月第几天，范围 1-31。'
  }
}

const TIMED_TASK_FIELDS = {
  name: { type: 'string', description: '任务名称。' },
  description: { type: 'string', description: '任务描述，可选。' },
  enabled: { type: 'boolean', description: '是否启用。若启用 once 任务，执行时间必须晚于当前系统时间。' },
  agentId: { type: 'string', description: '必填；Agent 的 _id。新增或启用任务前，先确保该 Agent 存在。' },
  content: { type: 'string', description: '必填；交给 Agent 执行的内容。' },
  trigger: {
    type: 'object',
    description: '推荐使用的完整触发器对象。' + TIMED_TASK_TRIGGER_NOTE,
    properties: TIMED_TASK_TRIGGER_FIELDS,
    additionalProperties: false
  },
  triggerType: {
    type: 'string',
    enum: ['once', 'interval', 'daily', 'weekly', 'monthly'],
    description: 'trigger 的兼容简写字段；若使用简写，请同时提供对应的 triggerDate/triggerTime/intervalSeconds/weekdays/monthDays。'
  },
  triggerDate: { type: 'string', description: 'trigger 的兼容简写字段。仅 once 使用；格式 YYYY-MM-DD。' },
  triggerTime: { type: 'string', description: 'trigger 的兼容简写字段；格式 HH:mm 或 HH:mm:ss。' },
  intervalSeconds: { type: 'integer', description: 'trigger 的兼容简写字段。仅 interval 使用；正整数秒。' },
  weekdays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 7 },
    description: 'trigger 的兼容简写字段。仅 weekly 使用；1=周一 ... 7=周日。'
  },
  monthDays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 31 },
    description: 'trigger 的兼容简写字段。仅 monthly 使用；范围 1-31。'
  },
  mcpIds: { ...STRING_ARRAY_SCHEMA, description: '可选；任务运行时额外挂载的 MCP _id 数组。' },
  skillIds: { ...STRING_ARRAY_SCHEMA, description: '可选；任务运行时额外挂载的 Skill _id 数组。' },
  options: {
    type: 'object',
    description: '可选；任务选项对象。',
    properties: {
      autoSaveSession: { type: 'boolean', description: '是否自动保存会话；默认 true。' }
    },
    additionalProperties: false
  }
}

const TOOLS = [
  // MCP servers
  {
    name: 'config_list_mcp_servers',
    description: '列出 MCP 服务配置。返回结果里的 env/headers 值会被脱敏为 "***"；这些占位值只能用于识别“已有敏感字段”，不能原样写回。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_mcp_server',
    description: '新增 MCP 服务配置（不允许覆盖内置）。' + CONFIG_ADD_FULL_OBJECT_NOTE + ' transportType 决定需要哪些字段：stdio 需要 command；sse/http/streamableHttp 需要 url。',
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...MCP_SERVER_FIELDS
      },
      required: ['name', 'transportType'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_mcp_server',
    description: '修改 MCP 服务配置（不允许修改内置）。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE + CONFIG_MASKED_VALUE_NOTE + MCP_TRANSPORT_SWITCH_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。只把要修改的字段放进 patch；例如 {"id":"mcp_xxx","patch":{"url":"https://example.com/mcp","headers":{"Authorization":"Bearer ..."}}}。',
          properties: MCP_SERVER_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_mcp_server',
    description: '删除 MCP 服务配置（不允许删除内置）。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Skills
  {
    name: 'config_list_skills',
    description: '列出技能配置摘要。返回 _id、name、description、sourceType、sourcePath、entryFile、triggers、mcp 等基础信息，可用于区分标准目录 Skill 与旧版内联 Skill，并为后续 update/delete 定位目标。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_skill',
    description: '新增旧版内联技能（不允许覆盖内置）。' + CONFIG_ADD_FULL_OBJECT_NOTE + ' triggers 必须是对象，mcp 必须是 Skill 依赖的 MCP _id 数组。若用户提供的是本地 skill 目录或 SKILL.md，请改用 config_import_skill_directory / config_import_skill_file。',
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...SKILL_FIELDS
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'config_import_skill_directory',
    description: '从本地现有 skill 目录导入技能登记（不复制文件）。path 必须是绝对路径，且目录内必须存在 SKILL.md。可选传 overwrite、triggers、mcp 作为导入后的绑定信息。',
    inputSchema: {
      type: 'object',
      properties: SKILL_IMPORT_FIELDS,
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'config_import_skill_file',
    description: '从本地 SKILL.md 文件导入技能登记（不复制文件）。path 必须是绝对路径，且文件名必须是 SKILL.md。可选传 overwrite、triggers、mcp 作为导入后的绑定信息。',
    inputSchema: {
      type: 'object',
      properties: SKILL_IMPORT_FIELDS,
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_skill',
    description: '修改技能登记（不允许修改内置）。旧版内联 Skill 通常修改 content；标准目录 Skill 通常只改 triggers/mcp，或重新导入来源目录。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。示例：{"id":"skill_xxx","patch":{"content":"...","mcp":["mcp_pg"]}}。',
          properties: SKILL_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_skill',
    description: '删除技能（不允许删除内置）。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Prompts
  {
    name: 'config_list_prompts',
    description: '列出提示词配置摘要。返回 _id、name、description，可用于后续 update/delete。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_prompt',
    description: '新增提示词（不允许覆盖内置）。' + CONFIG_ADD_FULL_OBJECT_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...PROMPT_FIELDS
      },
      required: ['name', 'content'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_prompt',
    description: '修改提示词（不允许修改内置）。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。示例：{"id":"prompt_xxx","patch":{"content":"..."}}。',
          properties: PROMPT_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_prompt',
    description: '删除提示词（不允许删除内置）。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Agents
  {
    name: 'config_list_agents',
    description: '列出智能体配置摘要。返回 _id、provider、model、skills、mcp、prompt 等，可用于后续 update/delete。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_agent',
    description: '新增智能体（不允许覆盖内置）。' + CONFIG_ADD_FULL_OBJECT_NOTE + ' skills / mcp 必须是 _id 数组。',
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...AGENT_FIELDS
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_agent',
    description: '修改智能体。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE + ' 内置智能体仅允许修改 provider/model/mcp；自定义智能体可按 patch 更新其他字段。',
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。示例：{"id":"agent_xxx","patch":{"provider":"provider_openai","model":"gpt-5.4","skills":["skill_sql"]}}。',
          properties: AGENT_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_agent',
    description: '删除智能体（不允许删除内置）。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Providers
  {
    name: 'config_list_providers',
    description: '列出服务商配置。apikey 不返回真实值，只会显示为 "***" 或空字符串；更新时不要把 "***" 原样传回。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_provider',
    description: '新增服务商（不允许覆盖内置）。' + CONFIG_ADD_FULL_OBJECT_NOTE + ' apikey 属于敏感字段，不要在回复中回显。',
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...PROVIDER_FIELDS
      },
      required: ['name', 'baseurl', 'apikey'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_provider',
    description: '修改服务商。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE + CONFIG_MASKED_VALUE_NOTE + ' 若更新 apikey，请传真实新值，不要传 "***"。',
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。示例：{"id":"provider_xxx","patch":{"baseurl":"https://api.openai.com/v1","apikey":"sk-..."}}。',
          properties: PROVIDER_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_provider',
    description: '删除服务商。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Timed tasks
  {
    name: 'config_list_timed_tasks',
    description: '列出定时任务配置摘要。不会返回 content 正文；可先用它定位 _id、trigger、agentId、skillIds、mcpIds。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'config_add_timed_task',
    description: '新增定时任务（任务仅在插件运行期间触发）。' + CONFIG_ADD_FULL_OBJECT_NOTE + TIMED_TASK_TRIGGER_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: OPTIONAL_ID_SCHEMA,
        ...TIMED_TASK_FIELDS
      },
      required: ['name', 'agentId', 'content'],
      additionalProperties: false
    }
  },
  {
    name: 'config_update_timed_task',
    description: '修改定时任务。' + CONFIG_LIST_FIRST_NOTE + CONFIG_UPDATE_PATCH_NOTE + TIMED_TASK_TRIGGER_NOTE,
    inputSchema: {
      type: 'object',
      properties: {
        id: TARGET_ID_SCHEMA,
        patch: {
          type: 'object',
          description: '部分更新对象。示例：{"id":"task_xxx","patch":{"enabled":true,"trigger":{"type":"daily","time":"09:00:00"}}}。',
          properties: TIMED_TASK_FIELDS,
          additionalProperties: false
        }
      },
      required: ['id', 'patch'],
      additionalProperties: false
    }
  },
  {
    name: 'config_delete_timed_task',
    description: '删除定时任务。' + CONFIG_LIST_FIRST_NOTE + ' 删除只传 {id}。',
    inputSchema: {
      type: 'object',
      properties: { id: TARGET_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false
    }
  },

  // Time
  {
    name: 'config_get_system_time',
    description: '获取当前系统时间，返回本机本地时间、UTC 时间、时区与偏移。涉及“今天/明天/本周/下周/距离现在多久”等推算时优先先调用它。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]

class BuiltinConfigMcpClient {
  async listTools() {
    return TOOLS
  }

  async callTool(toolName, args) {
    const name = cleanString(toolName)
    const params = args && typeof args === 'object' && !Array.isArray(args) ? args : {}

    // MCP servers
    if (name === 'config_list_mcp_servers') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.mcpServers).map(stripMcpServerSecrets)
      return { ok: true, items: list }
    }
    if (name === 'config_add_mcp_server') {
      const transportType = assertAllowedCustomTransportType(params.transportType)
      if (params.env !== undefined && params.env !== null && !isPlainObject(params.env)) {
        throw new Error('env 必须是对象')
      }
      if (params.headers !== undefined && params.headers !== null && !isPlainObject(params.headers)) {
        throw new Error('headers 必须是对象')
      }
      const id = cleanString(params.id) || randomId('mcp')
      const item = normalizeMcpServerFields({
        _id: id,
        name: cleanString(params.name) || id,
        transportType,
        disabled: !!params.disabled,
        keepAlive: !!params.keepAlive,
        timeout: Number.isFinite(Number(params.timeout)) ? Math.max(1000, Math.floor(Number(params.timeout))) : 15000,
        allowTools: normalizeStringList(params.allowTools),
        command: params.command,
        args: normalizeStringList(params.args),
        env: normalizeStringKeyedObject(params.env),
        cwd: params.cwd,
        url: params.url,
        headers: normalizeStringKeyedObject(params.headers),
        pingOnConnect: !!params.pingOnConnect,
        maxTotalTimeout: params.maxTotalTimeout,
        method: params.method,
        stream: !!params.stream
      })
      if (transportType === 'stdio') {
        if (!cleanString(item.command)) throw new Error('command 必填（stdio）')
      } else {
        if (!cleanString(item.url)) throw new Error('url 必填（http/sse/streamableHttp）')
      }
      globalConfig.addMcpServer(item)
      return { ok: true, id }
    }
    if (name === 'config_update_mcp_server') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      const patchSrc = sanitizePatchObject(params.patch)
      if ('transportType' in patchSrc) {
        patchSrc.transportType = assertAllowedCustomTransportType(patchSrc.transportType)
      }

      if ('env' in patchSrc && patchSrc.env !== undefined && patchSrc.env !== null && !isPlainObject(patchSrc.env)) {
        throw new Error('patch.env 必须是对象')
      }
      if ('headers' in patchSrc && patchSrc.headers !== undefined && patchSrc.headers !== null && !isPlainObject(patchSrc.headers)) {
        throw new Error('patch.headers 必须是对象')
      }

      const current = globalConfig.getMcpServer(id)
      const patch = normalizeMcpServerFields(patchSrc)

      // 对 env/headers 做“局部合并”，并忽略脱敏占位值 "***"，避免覆盖真实密钥
      if ('env' in patchSrc) {
        const raw = patchSrc.env
        if (isPlainObject(raw) && Object.keys(raw).length === 0) {
          patch.env = {}
        } else if (isPlainObject(raw)) {
          const incoming = normalizeStringKeyedObject(raw)
          const filtered = Object.fromEntries(Object.entries(incoming).filter(([_, v]) => String(v).trim() !== '***'))
          if (Object.keys(filtered).length) {
            const base = isPlainObject(current?.env) ? current.env : {}
            patch.env = { ...base, ...filtered }
          } else {
            delete patch.env
          }
        }
      }

      if ('headers' in patchSrc) {
        const raw = patchSrc.headers
        if (isPlainObject(raw) && Object.keys(raw).length === 0) {
          patch.headers = {}
        } else if (isPlainObject(raw)) {
          const incoming = normalizeStringKeyedObject(raw)
          const filtered = Object.fromEntries(Object.entries(incoming).filter(([_, v]) => String(v).trim() !== '***'))
          if (Object.keys(filtered).length) {
            const base = isPlainObject(current?.headers) ? current.headers : {}
            patch.headers = { ...base, ...filtered }
          } else {
            delete patch.headers
          }
        }
      }

      const final = { ...(current || {}), ...patch }
      const finalTransportType = cleanString(final.transportType)
      if (finalTransportType === 'stdio') {
        if (!cleanString(final.command)) throw new Error('command 必填（stdio）')
      } else {
        if (!cleanString(final.url)) throw new Error('url 必填（http/sse/streamableHttp）')
      }
      globalConfig.updateMcpServer(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_mcp_server') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deleteMcpServer(id)
      return { ok: true, id }
    }

    // Skills
    if (name === 'config_list_skills') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.skills).map((s) => ({
        _id: s?._id,
        name: s?.name,
        description: s?.description,
        sourceType: s?.sourceType || 'inline',
        sourcePath: s?.sourcePath || null,
        entryFile: s?.entryFile || null,
        builtin: !!s?.builtin,
        triggers: s?.triggers || {},
        mcp: Array.isArray(s?.mcp) ? s.mcp : []
      }))
      return { ok: true, items: list }
    }
    if (name === 'config_add_skill') {
      const id = cleanString(params.id) || randomId('skill')
      const item = {
        _id: id,
        name: cleanString(params.name) || id,
        description: cleanString(params.description),
        content: typeof params.content === 'string' ? params.content : '',
        triggers: isPlainObject(params.triggers) ? params.triggers : {},
        mcp: normalizeStringList(params.mcp)
      }
      globalConfig.addSkill(item)
      return { ok: true, id }
    }
    if (name === 'config_import_skill_directory') {
      const sourcePath = cleanString(params.path)
      if (!sourcePath) throw new Error('path 必填')
      const imported = globalConfig.importSkillDirectory(sourcePath, {
        overwrite: !!params.overwrite,
        triggers: isPlainObject(params.triggers) ? params.triggers : {},
        mcp: normalizeStringList(params.mcp)
      })
      return {
        ok: true,
        id: imported?._id,
        item: {
          _id: imported?._id,
          name: imported?.name,
          description: imported?.description,
          sourceType: imported?.sourceType,
          sourcePath: imported?.sourcePath,
          entryFile: imported?.entryFile
        }
      }
    }
    if (name === 'config_import_skill_file') {
      const filePath = cleanString(params.path)
      if (!filePath) throw new Error('path 必填')
      const imported = globalConfig.importSkillFile(filePath, {
        overwrite: !!params.overwrite,
        triggers: isPlainObject(params.triggers) ? params.triggers : {},
        mcp: normalizeStringList(params.mcp)
      })
      return {
        ok: true,
        id: imported?._id,
        item: {
          _id: imported?._id,
          name: imported?.name,
          description: imported?.description,
          sourceType: imported?.sourceType,
          sourcePath: imported?.sourcePath,
          entryFile: imported?.entryFile
        }
      }
    }
    if (name === 'config_update_skill') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      const patch = sanitizePatchObject(params.patch)
      globalConfig.updateSkill(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_skill') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deleteSkill(id)
      return { ok: true, id }
    }

    // Prompts
    if (name === 'config_list_prompts') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.prompts).map((p) => ({
        _id: p?._id,
        name: p?.name,
        description: p?.description,
        builtin: !!p?.builtin
      }))
      return { ok: true, items: list }
    }
    if (name === 'config_add_prompt') {
      const id = cleanString(params.id) || randomId('prompt')
      const item = {
        _id: id,
        name: cleanString(params.name) || id,
        description: cleanString(params.description),
        content: typeof params.content === 'string' ? params.content : ''
      }
      globalConfig.addPrompt(item)
      return { ok: true, id }
    }
    if (name === 'config_update_prompt') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      const patch = sanitizePatchObject(params.patch)
      globalConfig.updatePrompt(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_prompt') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deletePrompt(id)
      return { ok: true, id }
    }

    // Agents
    if (name === 'config_list_agents') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.agents).map((a) => ({
        _id: a?._id,
        name: a?.name,
        provider: a?.provider || null,
        model: a?.model || null,
        skills: Array.isArray(a?.skills) ? a.skills : [],
        mcp: Array.isArray(a?.mcp) ? a.mcp : [],
        prompt: a?.prompt || null,
        builtin: !!a?.builtin
      }))
      return { ok: true, items: list }
    }
    if (name === 'config_add_agent') {
      const id = cleanString(params.id) || randomId('agent')
      const item = normalizeAgentFields({
        _id: id,
        name: cleanString(params.name) || id,
        provider: params.provider,
        model: params.model,
        skills: params.skills,
        mcp: params.mcp,
        prompt: params.prompt
      })
      globalConfig.addAgent(item)
      return { ok: true, id }
    }
    if (name === 'config_update_agent') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      const patch = normalizeAgentFields(sanitizePatchObject(params.patch))
      globalConfig.updateAgent(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_agent') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deleteAgent(id)
      return { ok: true, id }
    }

    // Providers
    if (name === 'config_list_providers') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.providers).map(stripProviderSecrets)
      return { ok: true, items: list }
    }
    if (name === 'config_add_provider') {
      const id = cleanString(params.id) || randomId('provider')
      const item = normalizeProviderFields({
        _id: id,
        name: cleanString(params.name) || id,
        baseurl: params.baseurl,
        apikey: params.apikey,
        selectModels: params.selectModels
      })
      if (!item.baseurl) throw new Error('baseurl 必填')
      if (!item.apikey) throw new Error('apikey 必填')
      globalConfig.addProvider(item)
      return { ok: true, id }
    }
    if (name === 'config_update_provider') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      const patch = normalizeProviderFields(sanitizePatchObject(params.patch))
      if ('apikey' in patch && patch.apikey === '***') delete patch.apikey
      if ('baseurl' in patch && !patch.baseurl) throw new Error('baseurl 不能为空')
      if ('apikey' in patch && !patch.apikey) throw new Error('apikey 不能为空（注意不要传 "***"）')
      globalConfig.updateProvider(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_provider') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deleteProvider(id)
      return { ok: true, id }
    }

    // Timed tasks
    if (name === 'config_list_timed_tasks') {
      const cfg = globalConfig.getConfig()
      const list = listMapValues(cfg.timedTask).map((t) => ({
        _id: t?._id,
        name: t?.name,
        description: t?.description,
        enabled: !!t?.enabled,
        trigger: t?.trigger || {},
        agentId: t?.agentId || null,
        mcpIds: Array.isArray(t?.mcpIds) ? t.mcpIds : [],
        skillIds: Array.isArray(t?.skillIds) ? t.skillIds : [],
        options: t?.options || {}
      }))
      return { ok: true, items: list }
    }
    if (name === 'config_add_timed_task') {
      const id = cleanString(params.id) || randomId('task')
      const agentId = normalizeOptionalString(params.agentId)
      if (!agentId) throw new Error('agentId 必填（Agent 的 _id）')

      const content = typeof params.content === 'string' ? params.content : String(params.content || '')
      if (!String(content || '').trim()) throw new Error('content 必填（需要让 Agent 执行的内容）')

      let trigger = null
      if (isPlainObject(params.trigger)) {
        trigger = normalizeTimedTaskTrigger(params.trigger)
      } else {
        const hasConvenience = [
          params.triggerType,
          params.triggerDate,
          params.triggerTime,
          params.intervalSeconds,
          params.weekdays,
          params.monthDays
        ].some((v) => v !== undefined)
        if (hasConvenience) {
          trigger = normalizeTimedTaskTrigger({
            type: params.triggerType,
            date: params.triggerDate,
            time: params.triggerTime,
            intervalSeconds: params.intervalSeconds,
            weekdays: params.weekdays,
            monthDays: params.monthDays
          })
        }
      }
      if (!trigger) {
        throw new Error('trigger 必填：请提供 trigger 对象，或提供 triggerType/triggerTime 等简化字段')
      }

      const optionsRaw = isPlainObject(params.options) ? params.options : {}
      const options = { ...optionsRaw }
      if ('autoSaveSession' in options) options.autoSaveSession = !!options.autoSaveSession

      const item = {
        _id: id,
        name: cleanString(params.name) || id,
        description: cleanString(params.description),
        enabled: params.enabled !== false,
        trigger,
        agentId,
        content,
        mcpIds: normalizeStringList(params.mcpIds),
        skillIds: normalizeStringList(params.skillIds),
        options
      }

      if (item.enabled) {
        if (item.trigger?.type === 'once') assertOnceTriggerInFuture(item.trigger)
      }
      globalConfig.addTimedTask(item)
      return { ok: true, id }
    }
    if (name === 'config_update_timed_task') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')

      const patchRaw = sanitizePatchObject(params.patch)
      const patch = { ...patchRaw }

      if ('name' in patch) {
        const nextName = cleanString(patch.name)
        if (!nextName) throw new Error('patch.name 不能为空')
        patch.name = nextName
      }
      if ('description' in patch) {
        patch.description = cleanString(patch.description)
      }
      if ('enabled' in patch) {
        patch.enabled = !!patch.enabled
      }
      if ('agentId' in patch) {
        patch.agentId = normalizeOptionalString(patch.agentId)
      }
      if ('content' in patch) {
        patch.content = typeof patch.content === 'string' ? patch.content : String(patch.content || '')
      }
      if ('mcpIds' in patch) {
        patch.mcpIds = normalizeStringList(patch.mcpIds)
      }
      if ('skillIds' in patch) {
        patch.skillIds = normalizeStringList(patch.skillIds)
      }
      if ('options' in patch) {
        const options = isPlainObject(patch.options) ? { ...patch.options } : {}
        if ('autoSaveSession' in options) options.autoSaveSession = !!options.autoSaveSession
        patch.options = options
      }

      // 支持：patch.trigger 或 patch.triggerType/triggerTime 等简化字段
      const hasTriggerConvenience = [
        'triggerType',
        'triggerDate',
        'triggerTime',
        'intervalSeconds',
        'weekdays',
        'monthDays'
      ].some((k) => k in patch)

      if ('trigger' in patch && patch.trigger !== undefined) {
        patch.trigger = normalizeTimedTaskTrigger(patch.trigger)
      } else if (hasTriggerConvenience) {
        patch.trigger = normalizeTimedTaskTrigger({
          type: patch.triggerType,
          date: patch.triggerDate,
          time: patch.triggerTime,
          intervalSeconds: patch.intervalSeconds,
          weekdays: patch.weekdays,
          monthDays: patch.monthDays
        })
      }

      delete patch.triggerType
      delete patch.triggerDate
      delete patch.triggerTime
      delete patch.intervalSeconds
      delete patch.weekdays
      delete patch.monthDays

      // 如果最终是 enabled=true，则做一次整体可运行性校验（避免“创建成功但永远不触发/一运行就报错”）
      try {
        const current = globalConfig.getTimedTask(id)
        const next = { ...(current || {}), ...patch }
        const enabled = next.enabled !== false
        if (enabled) {
          const agentId = normalizeOptionalString(next.agentId)
          if (!agentId) throw new Error('agentId 必填（Agent 的 _id）')
          const content = String(next.content || '').trim()
          if (!content) throw new Error('content 必填（需要让 Agent 执行的内容）')
          const trigger = normalizeTimedTaskTrigger(next.trigger)
          if (trigger?.type === 'once') assertOnceTriggerInFuture(trigger)
        }
      } catch (e) {
        throw e
      }

      globalConfig.updateTimedTask(id, patch)
      return { ok: true, id }
    }
    if (name === 'config_delete_timed_task') {
      const id = cleanString(params.id)
      if (!id) throw new Error('id 必填')
      globalConfig.deleteTimedTask(id)
      return { ok: true, id }
    }

    // Time
    if (name === 'config_get_system_time') {
      const now = new Date()
      const tzOffsetMinutes = now.getTimezoneOffset()
      return {
        ok: true,
        epochMs: now.getTime(),
        isoUtc: now.toISOString(),
        local: formatLocalDateTime(now),
        timeZone: safeResolveIanaTimeZone(),
        utcOffsetMinutes: tzOffsetMinutes,
        utcOffset: formatUtcOffsetFromTimezoneOffsetMinutes(tzOffsetMinutes)
      }
    }

    throw new Error(`Unknown tool: ${name}`)
  }

  async listPrompts() {
    return []
  }

  async listResources() {
    return []
  }

  close() {}
}

module.exports = function createBuiltinConfigMcpClient() {
  return new BuiltinConfigMcpClient()
}
