function stripWrappingQuotes(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (
    (raw.startsWith('"') && raw.endsWith('"'))
    || (raw.startsWith('\'') && raw.endsWith('\''))
  ) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

function buildRuntimeMagicOption(label, applyText, detail, info) {
  return {
    label,
    applyText,
    type: 'keyword',
    detail,
    info
  }
}

export const NOTEBOOK_RUNTIME_MAGIC_OPTIONS = Object.freeze([
  buildRuntimeMagicOption(
    '%runtime help',
    '%runtime help',
    '查看超级笔记环境命令说明',
    '显示当前超级笔记支持的环境命令、默认行为和使用示例。'
  ),
  buildRuntimeMagicOption(
    '%runtime list',
    '%runtime list',
    '列出已创建的托管环境',
    '扫描当前 Notebook Runtime 配置里的虚拟环境存储目录，并列出可切换的环境名称。'
  ),
  buildRuntimeMagicOption(
    '%runtime info',
    '%runtime info',
    '查看当前笔记使用的环境信息',
    '显示当前笔记是否使用默认环境、当前解释器路径，以及托管环境目录。'
  ),
  buildRuntimeMagicOption(
    '%runtime create-venv myenv',
    '%runtime create-venv myenv',
    '创建托管虚拟环境',
    '在 Notebook Runtime 配置里的虚拟环境存储目录下创建 myenv，并自动安装 Notebook 运行依赖。'
  ),
  buildRuntimeMagicOption(
    '%runtime use myenv',
    '%runtime use myenv',
    '让当前笔记切换到指定环境',
    '只影响当前这篇超级笔记。切换后会重启 Kernel，后续 `%pip install` 也会安装到这个环境里。'
  ),
  buildRuntimeMagicOption(
    '%runtime reset',
    '%runtime reset',
    '恢复当前笔记到默认环境',
    '清除当前笔记的环境覆盖，恢复为设置页中的默认 Python 解释器。'
  ),
  buildRuntimeMagicOption(
    '%pip install pandas',
    '%pip install pandas',
    '在当前激活环境安装 Python 包',
    '始终使用当前激活解释器的 `python -m pip` 执行安装，适合在超级笔记里补依赖。'
  ),
  buildRuntimeMagicOption(
    '!pip install requests',
    '!pip install requests',
    '兼容 shell 风格的 pip 安装',
    '和 `%pip install ...` 类似，但保留 shell 风格写法。'
  ),
  buildRuntimeMagicOption(
    '!python -m venv myenv',
    '!python -m venv myenv',
    '兼容创建环境写法',
    '会被解释为托管环境创建命令，实际创建位置仍然是本机虚拟环境目录，不会在笔记目录下创建。'
  )
])

export function buildNotebookMagicCompletionOptions(envNames = []) {
  const baseOptions = [...NOTEBOOK_RUNTIME_MAGIC_OPTIONS]
  const names = Array.isArray(envNames) ? envNames : []

  names
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      baseOptions.push(buildRuntimeMagicOption(
        `%runtime use ${name}`,
        `%runtime use ${name}`,
        '切换到已有环境',
        `切换当前笔记到托管环境“${name}”，并在下次执行前自动重启 Kernel。`
      ))
    })

  return baseOptions
}

export function parseNotebookRuntimeMagicLine(line = '') {
  const rawLine = String(line || '')
  const trimmed = rawLine.trim()
  if (!trimmed) return null

  const shellVenvMatch = trimmed.match(/^!python\s+-m\s+venv(?:\s+(.+))?$/i)
  if (shellVenvMatch) {
    const envName = stripWrappingQuotes(shellVenvMatch[1] || '')
    return {
      kind: 'runtime',
      command: 'create-venv',
      argText: envName,
      raw: trimmed,
      source: 'shell-alias'
    }
  }

  if (!trimmed.startsWith('%runtime')) return null

  const remainder = trimmed.slice('%runtime'.length).trim()
  if (!remainder) {
    return {
      kind: 'runtime',
      command: 'help',
      argText: '',
      raw: trimmed,
      source: 'magic'
    }
  }

  const commandMatch = remainder.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?:\s+([\s\S]*))?$/)
  if (!commandMatch) return null

  const command = String(commandMatch[1] || '').trim().toLowerCase()
  const argText = stripWrappingQuotes(commandMatch[2] || '')
  const normalizedCommand = command === 'create' ? 'create-venv' : command

  return {
    kind: 'runtime',
    command: ['help', 'list', 'info', 'create-venv', 'use', 'reset'].includes(normalizedCommand) ? normalizedCommand : 'invalid',
    argText,
    raw: trimmed,
    source: 'magic'
  }
}

export function parseNotebookRuntimeMagicCell(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const commands = []

  for (const line of lines) {
    if (!String(line || '').trim()) continue
    const parsed = parseNotebookRuntimeMagicLine(line)
    if (!parsed) return []
    commands.push(parsed)
  }

  return commands
}

export function parseNotebookDirectExecutionSpec(line = '') {
  const trimmed = String(line || '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('!')) {
    const command = trimmed.slice(1).trim()
    if (!command) return null
    if (/^pip(?:\s|$)/i.test(command)) {
      return {
        kind: 'pip',
        args: command.replace(/^pip\b/i, '').trim(),
        raw: trimmed
      }
    }
    return {
      kind: 'shell',
      command,
      raw: trimmed
    }
  }

  if (/^%pip(?:\s|$)/i.test(trimmed)) {
    return {
      kind: 'pip',
      args: trimmed.replace(/^%pip\b/i, '').trim(),
      raw: trimmed
    }
  }

  return null
}

export function parseNotebookDirectExecutionSpecs(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const specs = []

  for (const line of lines) {
    if (!String(line || '').trim()) continue
    const parsed = parseNotebookDirectExecutionSpec(line)
    if (!parsed) return []
    specs.push(parsed)
  }

  return specs
}

export function buildNotebookRuntimeMagicExecutionPlan(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const commands = []
  const remainingLines = []
  const pendingBlankLines = []
  let codeStarted = false

  for (const line of lines) {
    const text = String(line || '')
    const trimmed = text.trim()

    if (!trimmed) {
      if (codeStarted) remainingLines.push(text)
      else pendingBlankLines.push(text)
      continue
    }

    const parsed = parseNotebookRuntimeMagicLine(text)

    if (!codeStarted && parsed) {
      commands.push(parsed)
      continue
    }

    if (codeStarted && parsed) {
      return {
        commands,
        code: remainingLines.join('\n'),
        invalidCommand: parsed,
        invalidReason: '环境命令必须放在 Cell 顶部，不能出现在普通代码后面。'
      }
    }

    codeStarted = true
    if (pendingBlankLines.length) {
      remainingLines.push(...pendingBlankLines)
      pendingBlankLines.length = 0
    }
    remainingLines.push(text)
  }

  return {
    commands,
    code: remainingLines.join('\n'),
    invalidCommand: null,
    invalidReason: ''
  }
}
