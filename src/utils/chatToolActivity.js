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

export function getToolActivityLabel(message, statusRaw = '') {
  const toolName = String(message?.toolName || '').trim()
  const status = String(statusRaw || message?.toolStatus || '').trim()
  const failed = status === 'error' || status === 'rejected' || status === 'stopped'
  const running = status === 'running' || status === 'paused' || message?.role === 'tool_call'
  const known = TOOL_LABELS[toolName]
  const serverName = String(message?.toolServerName || '').trim()
  const base = known
    ? known[running ? 0 : 1]
    : running
      ? `正在${serverName ? `使用 ${serverName}` : `处理 ${friendlyToolName(toolName)}`}`
      : `已完成${serverName ? ` ${serverName}` : ` ${friendlyToolName(toolName)}`}`
  if (!failed) return base
  const action = known?.[0]?.replace(/^正在/, '') || serverName || friendlyToolName(toolName)
  return status === 'rejected' || status === 'stopped'
    ? `已停止${action}`
    : `${action}失败`
}

export function getToolActivityMeta(message) {
  const args = safeParseObject(message?.toolArgsText || message?.toolArgs)
  const payload = message?.toolResultPayload && typeof message.toolResultPayload === 'object'
    ? message.toolResultPayload
    : {}
  const command = args.command
  if (command) return compactText(command, 100)

  const query = args.query || args.keyword || payload.query
  if (query) return compactText(query, 80)

  const targetPath = args.path || args.file_path || args.relative_path || payload.path
  if (targetPath) return compactText(targetPath, 88)

  const url = args.url || payload.finalUrl || payload.url
  if (url) return compactText(url, 88)

  const files = payload.changedFiles || payload.imported || payload.files
  if (Array.isArray(files) && files.length) {
    const firstName = String(files[0]?.name || files[0]?.path || '').trim()
    return compactText(files.length === 1 ? firstName : `${firstName} 等 ${files.length} 个文件`, 88)
  }

  return compactText(message?.toolSubMeta || '', 88)
}
