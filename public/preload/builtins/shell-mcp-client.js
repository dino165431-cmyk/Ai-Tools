const path = require('path')
const fsSync = require('fs')
const { spawn } = require('child_process')

const globalConfig = require('../utils/global-config')

const MAX_OUTPUT_CHARS = 20000
const DEFAULT_TIMEOUT_MS = 30000
const MAX_TIMEOUT_MS = 120000

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function realpathExisting(targetPath) {
  const resolver = typeof fsSync.realpathSync.native === 'function' ? fsSync.realpathSync.native : fsSync.realpathSync
  return resolver(targetPath)
}

function assertDirectory(targetPath, label) {
  let stat = null
  try {
    stat = fsSync.statSync(targetPath)
  } catch {
    throw new Error(`${label}不存在或不可访问`)
  }
  if (!stat.isDirectory()) throw new Error(`${label}必须是目录`)
}

function isPathInside(root, target) {
  const relative = path.relative(root, target)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

function resolveDataRoot() {
  const configured = cleanString(globalConfig.getDataStorageRoot?.())
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('用户数据目录未配置，无法启动 Bash 工具箱')
  }
  const resolved = path.resolve(configured)
  assertDirectory(resolved, '用户数据目录')
  return realpathExisting(resolved)
}

function resolveWorkingDirectory(relativePath = '.') {
  const root = resolveDataRoot()
  const requested = cleanString(relativePath) || '.'
  if (path.isAbsolute(requested)) throw new Error('cwd 必须是用户数据目录内的相对路径')

  const resolved = path.resolve(root, requested)
  if (!isPathInside(root, resolved)) {
    throw new Error('cwd 不能离开用户选择的数据目录')
  }
  assertDirectory(resolved, 'cwd')
  const realCwd = realpathExisting(resolved)
  if (!isPathInside(root, realCwd)) {
    throw new Error('cwd 不能通过符号链接离开用户选择的数据目录')
  }
  const relative = path.relative(root, realCwd)
  return { root, cwd: realCwd, relative: relative || '.' }
}

function clampTimeout(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.floor(parsed)))
}

function validateCommandBoundary(command) {
  const text = cleanString(command)
  if (!text) throw new Error('command is required')
  const blocked = [
    { pattern: /(^|[\s"'=])\.\.(?:[\\/]|$)/, reason: '命令不能访问上级目录' },
    { pattern: /(^|[\s"'=])~(?:[\\/]|$)/, reason: '命令不能访问用户主目录' },
    { pattern: /(^|[\s"'=])[a-z]:[\\/]/i, reason: '命令不能使用绝对磁盘路径' },
    { pattern: /(^|[\s"'=])\/[a-z](?:[\\/]|$)/i, reason: '命令不能使用 MSYS 绝对磁盘路径' },
    { pattern: /(^|[\s"'=])\/(?=$|[\s;&|])/i, reason: '命令不能访问文件系统根目录' },
    { pattern: /(?:file):\/\//i, reason: '命令不能使用文件 URL 访问数据目录外的文件' },
    { pattern: /(^|[\s"'=])(?:\\\\|\/\/)[^/\\]/, reason: '命令不能使用网络或 UNC 路径' },
    { pattern: /(^|[\s"'=])\/(?:bin|boot|dev|etc|home|opt|proc|root|run|sys|tmp|usr|var)(?:[\\/]|$)/i, reason: '命令不能访问数据目录外的系统路径' },
    { pattern: /\$(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|OLDPWD)\b|\%(?:USERPROFILE|HOMEDRIVE|HOMEPATH|CD)\%/i, reason: '命令不能引用数据目录外的位置变量' },
    { pattern: /(^|[;&|]\s*)(?:cmd|powershell|pwsh|wsl)(?:\.exe)?\b/i, reason: '命令不能委托给可绕过目录边界的系统 Shell' }
  ]
  const hit = blocked.find((rule) => rule.pattern.test(text))
  if (hit) throw new Error(hit.reason)
  return text
}

function resolveBashExecutable() {
  if (process.platform !== 'win32') return 'bash'
  const pathCandidates = String(process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((entry) => [
      path.join(entry, 'bash.exe'),
      path.join(path.dirname(entry), 'bin', 'bash.exe')
    ])
  const gitBashCandidates = pathCandidates.filter((candidate) => /[\\/]git[\\/]/i.test(candidate))
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
    ...gitBashCandidates
  ].filter(Boolean)
  const resolved = candidates.find((candidate) => fsSync.existsSync(candidate))
  if (!resolved) throw new Error('未检测到 Git Bash，请先安装 Git for Windows')
  return resolved
}

function appendLimited(state, chunk) {
  const text = String(chunk || '')
  if (!text || state.text.length >= MAX_OUTPUT_CHARS) return
  state.text += text.slice(0, MAX_OUTPUT_CHARS - state.text.length)
  if (state.text.length >= MAX_OUTPUT_CHARS) state.truncated = true
}

function runBash(command, options = {}) {
  const safeCommand = validateCommandBoundary(command)
  const { root, cwd, relative } = resolveWorkingDirectory(options.cwd)
  const timeoutMs = clampTimeout(options.timeoutMs)
  const tempDirectory = path.join(root, '.ai-tools-settings', 'tmp', 'bash')
  fsSync.mkdirSync(tempDirectory, { recursive: true })

  return new Promise((resolve, reject) => {
    const stdout = { text: '', truncated: false }
    const stderr = { text: '', truncated: false }
    const child = spawn(resolveBashExecutable(), ['--noprofile', '--norc', '-c', safeCommand], {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        PATH: process.env.PATH || '',
        Path: process.env.Path || '',
        SystemRoot: process.env.SystemRoot || '',
        HOME: root,
        USERPROFILE: root,
        TEMP: tempDirectory,
        TMP: tempDirectory,
        XDG_CONFIG_HOME: path.join(root, '.ai-tools-settings', 'shell-config'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: path.join(root, '.ai-tools-settings', 'shell-config', 'gitconfig'),
        LANG: process.env.LANG || 'C.UTF-8',
        AI_TOOLS_DATA_ROOT: root
      }
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => appendLimited(stdout, chunk))
    child.stderr?.on('data', (chunk) => appendLimited(stderr, chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({
        ok: !timedOut && code === 0,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        timeoutMs,
        cwd: relative,
        stdout: stdout.text,
        stderr: stderr.text,
        truncated: stdout.truncated || stderr.truncated
      })
    })
  })
}

const TOOLS = Object.freeze([
  {
    name: 'bash_run',
    description: 'Run a Bash command inside the user-selected AI Tools data directory. This tool always requires explicit approval.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to execute.' },
        cwd: { type: 'string', description: 'Working directory relative to the user data directory. Default: .' },
        timeout_ms: { type: 'integer', minimum: 1000, maximum: MAX_TIMEOUT_MS }
      },
      required: ['command'],
      additionalProperties: false
    }
  }
])

class BuiltinShellMcpClient {
  async listTools() {
    return TOOLS
  }

  async callTool(toolName, args = {}) {
    if (cleanString(toolName) !== 'bash_run') throw new Error(`Unknown tool: ${toolName}`)
    const command = cleanString(args.command)
    if (!command) throw new Error('command is required')
    return runBash(command, {
      cwd: args.cwd,
      timeoutMs: args.timeout_ms
    })
  }

  async close() {}
}

module.exports = function createBuiltinShellMcpClient() {
  return new BuiltinShellMcpClient()
}

module.exports._test = {
  resolveWorkingDirectory,
  clampTimeout,
  validateCommandBoundary
}
