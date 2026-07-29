const TOOL_LABELS = {
  sandbox_run: ['正在沙盒中执行命令', '已在沙盒中执行命令'],
  bash_run: ['正在沙盒中执行 Bash 命令', '已在沙盒中执行 Bash 命令'],
  sandbox_import: ['正在把文件复制到沙盒', '已把文件复制到沙盒'],
  sandbox_list: ['正在查看沙盒文件', '已查看沙盒文件'],
  sandbox_reset: ['正在清理沙盒工作区', '已清理沙盒工作区'],
  web_search: ['正在搜索资料', '已搜索资料'],
  web_read: ['正在阅读网页', '已阅读网页'],
  notes_search: ['正在搜索笔记', '已搜索笔记'],
  notes_read: ['正在读取笔记', '已读取笔记'],
  notes_write: ['正在更新笔记', '已更新笔记'],
  notes_create: ['正在创建笔记', '已创建笔记'],
  sessions_search: ['正在搜索会话记录', '已搜索会话记录'],
  sessions_read: ['正在读取会话记录', '已读取会话记录'],
  agents_list: ['正在查找可用智能体', '已查找可用智能体'],
  agent_run: ['正在推进子任务', '已完成子任务'],
  skill_discover: ['正在查看可用能力', '已查看可用能力'],
  skill_call: ['正在处理任务', '已完成处理']
}

const TOOL_ACTION_VERBS = {
  add: '添加',
  browse: '浏览',
  check: '检查',
  count: '统计',
  create: '创建',
  delete: '删除',
  describe: '查看',
  discover: '查找',
  download: '下载',
  edit: '编辑',
  execute: '执行',
  fetch: '获取',
  find: '查找',
  generate: '生成',
  get: '获取',
  inspect: '检查',
  list: '列出',
  lookup: '查找',
  open: '打开',
  publish: '发布',
  query: '查询',
  read: '读取',
  remove: '删除',
  run: '执行',
  save: '保存',
  search: '搜索',
  send: '发送',
  update: '更新',
  upload: '上传',
  view: '查看',
  write: '写入'
}

const TOOL_ACTION_NOUNS = {
  account: '账户',
  accounts: '账户',
  ad: '广告',
  ads: '广告',
  campaign: '广告系列',
  campaigns: '广告系列',
  calendar: '日历',
  calendars: '日历',
  data: '数据',
  document: '文档',
  documents: '文档',
  email: '邮件',
  emails: '邮件',
  event: '事件',
  events: '事件',
  file: '文件',
  files: '文件',
  folder: '文件夹',
  folders: '文件夹',
  item: '项目',
  items: '项目',
  message: '消息',
  messages: '消息',
  my: '我的',
  note: '笔记',
  notes: '笔记',
  page: '页面',
  pages: '页面',
  post: '帖子',
  posts: '帖子',
  profile: '资料',
  profiles: '资料',
  record: '记录',
  records: '记录',
  report: '报告',
  reports: '报告',
  status: '状态',
  user: '用户',
  users: '用户'
}

function safeParseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const text = String(value || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function compactText(value, max = 88) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}

function friendlyToolName(value) {
  const raw = String(value || '').trim()
  if (!raw) return '任务'
  return raw
    .replace(/^mcp__[^_]+__/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function splitToolName(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function humanizeToolAction(toolName, title = '') {
  const explicitTitle = compactText(title, 64)
  if (explicitTitle) return `调用 ${explicitTitle}`

  const tokens = splitToolName(toolName)
  const verb = TOOL_ACTION_VERBS[tokens[0]]
  if (!verb) return `调用 ${friendlyToolName(toolName)}`
  const objectTokens = tokens.slice(1)
  if (!objectTokens.length) return verb
  const translated = objectTokens.map((token) => TOOL_ACTION_NOUNS[token] || token)
  const allTranslated = objectTokens.every((token) => !!TOOL_ACTION_NOUNS[token])
  return allTranslated
    ? `${verb}${translated.join('')}`
    : `${verb} ${translated.join(' ')}`
}

export function getToolActivityLabel(message, statusRaw = '') {
  const toolName = String(message?.toolName || '').trim()
  const status = String(statusRaw || message?.toolStatus || '').trim()
  const failed = status === 'error' || status === 'rejected' || status === 'stopped'
  const running = status === 'running' || status === 'paused' || message?.role === 'tool_call'
  const known = TOOL_LABELS[toolName]
  const action = known?.[0]?.replace(/^正在/, '') || humanizeToolAction(toolName, message?.toolTitle)
  const base = known
    ? known[running ? 0 : 1]
    : running
      ? `正在${action}`
      : `已${action}`
  if (!failed) return base
  return status === 'rejected' || status === 'stopped'
    ? `已停止${action}`
    : `${action}失败`
}

export function getToolActivityToolName(message) {
  return compactText(message?.toolName, 64)
}

export function getToolActivitySource(message) {
  const source = compactText(message?.toolServerName, 64)
  const toolName = getToolActivityToolName(message)
  return source && source.toLowerCase() !== toolName.toLowerCase() ? source : ''
}

export function getToolActivityMeta(message) {
  const args = safeParseObject(message?.toolArgsText || message?.toolArgs)
  const payload = message?.toolResultPayload && typeof message.toolResultPayload === 'object'
    ? message.toolResultPayload
    : {}
  const files = payload.changedFiles || payload.imported || payload.files
  if (message?.role === 'tool' && Array.isArray(files) && files.length) {
    const firstName = String(files[0]?.name || files[0]?.path || '').trim()
    return compactText(files.length === 1 ? firstName : `${firstName} 等 ${files.length} 个文件`, 88)
  }

  const command = args.command
  if (command) return compactText(command, 100)

  const query = args.query || args.keyword || payload.query
  if (query) return compactText(query, 80)

  const targetPath = args.path || args.file_path || args.relative_path || payload.path
  if (targetPath) return compactText(targetPath, 88)

  const url = args.url || payload.finalUrl || payload.url
  if (url) return compactText(url, 88)

  if (Array.isArray(files) && files.length) {
    const firstName = String(files[0]?.name || files[0]?.path || '').trim()
    return compactText(files.length === 1 ? firstName : `${firstName} 等 ${files.length} 个文件`, 88)
  }

  const description = compactText(message?.toolDescription, 100)
  if (description) return description

  const subMeta = compactText(message?.toolSubMeta, 88)
  const identity = [message?.toolServerName, message?.toolName].filter(Boolean).join(' / ').toLowerCase()
  return subMeta.toLowerCase() === identity ? '' : subMeta
}
