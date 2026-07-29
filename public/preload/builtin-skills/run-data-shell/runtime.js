const path = require('path')
const fsSync = require('fs')
const { spawn } = require('child_process')

const {
  DEFAULT_WORKSPACE_ID,
  normalizeWorkspaceId,
  normalizeSandboxRelativePath,
  ensureWorkspace,
  resolveWorkspacePath,
  copyExternalFilesToWorkspace,
  walkWorkspaceFiles,
  snapshotWorkspace,
  collectChangedFiles,
  resetWorkspace
} = require('../../utils/sandbox-workspace')

const MAX_OUTPUT_CHARS = 20000
const MAX_OUTPUT_BYTES = MAX_OUTPUT_CHARS * 6
const DEFAULT_TIMEOUT_MS = 30000
const MAX_TIMEOUT_MS = 120000
const SUPPORTED_SHELLS = new Set(['auto', 'powershell', 'bash'])

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
    stat = fsSync.lstatSync(targetPath)
  } catch {
    throw new Error(`${label}不存在或不可访问`)
  }
  if (stat.isSymbolicLink()) throw new Error(`${label}不能是符号链接`)
  if (!stat.isDirectory()) throw new Error(`${label}必须是目录`)
}

function isPathInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeHostWorkspacePath(value) {
  const raw = cleanString(value)
  if (!raw) return ''
  if (raw.includes('\0') || !path.isAbsolute(raw)) {
    throw new Error('本机工作区必须是用户选择的绝对目录')
  }
  assertDirectory(raw, '本机工作区')
  const realRoot = realpathExisting(raw)
  assertDirectory(realRoot, '本机工作区')
  return realRoot
}

async function resolveWorkingDirectory(
  relativePath = '.',
  workspaceId = DEFAULT_WORKSPACE_ID,
  hostWorkspacePath = ''
) {
  const workspace = await ensureWorkspace(workspaceId)
  const requested = cleanString(relativePath) || '.'
  const safeRelativePath = requested === '.'
    ? ''
    : normalizeSandboxRelativePath(requested, { allowEmpty: true })
  const hostRoot = normalizeHostWorkspacePath(hostWorkspacePath)
  const workspaceRoot = hostRoot || workspace.workspaceRoot
  const resolved = hostRoot
    ? path.resolve(hostRoot, safeRelativePath)
    : resolveWorkspacePath(workspace.workspaceId, safeRelativePath)
  if (!isPathInside(workspaceRoot, resolved)) {
    throw new Error('cwd 不能离开当前工作区')
  }
  assertDirectory(resolved, 'cwd')
  const realCwd = realpathExisting(resolved)
  const realRoot = realpathExisting(workspaceRoot)
  if (!isPathInside(realRoot, realCwd)) {
    throw new Error('cwd 不能通过符号链接离开当前工作区')
  }
  const relative = path.relative(realRoot, realCwd).replace(/\\/g, '/')
  return {
    workspaceId: workspace.workspaceId,
    root: realRoot,
    runtimeRoot: realpathExisting(workspace.workspaceRoot),
    cwd: realCwd,
    relative: relative || '.',
    workspaceKind: hostRoot ? 'host' : 'sandbox',
    workspacePath: hostRoot || ''
  }
}

function clampTimeout(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS
  return Math.max(1000, Math.min(MAX_TIMEOUT_MS, Math.floor(parsed)))
}

function normalizeShell(value = 'auto') {
  const requested = cleanString(value).toLowerCase() || 'auto'
  if (!SUPPORTED_SHELLS.has(requested)) {
    throw new Error('shell 仅支持 auto、powershell 或 bash')
  }
  if (requested === 'auto') return process.platform === 'win32' ? 'powershell' : 'bash'
  if (requested === 'powershell' && process.platform !== 'win32') {
    throw new Error('powershell 仅在 Windows 沙盒中可用')
  }
  return requested
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
    { pattern: /(?:file):\/\//i, reason: '命令不能使用文件 URL 访问沙盒外部文件' },
    { pattern: /(^|[\s"'=])(?:\\\\|\/\/)[^/\\]/, reason: '命令不能使用网络或 UNC 路径' },
    { pattern: /(^|[\s"'=])\/(?:bin|boot|dev|etc|home|opt|proc|root|run|sys|tmp|usr|var)(?:[\\/]|$)/i, reason: '命令不能访问沙盒外的系统路径' },
    { pattern: /\$(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|OLDPWD)\b|\%(?:USERPROFILE|HOMEDRIVE|HOMEPATH|CD)\%/i, reason: '命令不能引用沙盒外的位置变量' },
    { pattern: /(^|[;&|]\s*)(?:cmd|powershell|pwsh|wsl)(?:\.exe)?\b/i, reason: '命令不能委托给可绕过沙盒边界的系统 Shell' }
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

function resolvePowerShellExecutable() {
  if (process.platform !== 'win32') throw new Error('PowerShell 仅在 Windows 上可用')
  const candidates = [
    process.env.SystemRoot && path.join(
      process.env.SystemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    ),
    process.env.WINDIR && path.join(
      process.env.WINDIR,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  ].filter(Boolean)
  const resolved = candidates.find((candidate) => fsSync.existsSync(candidate))
  if (!resolved) throw new Error('未检测到 Windows PowerShell')
  return resolved
}

function buildPowerShellEncodedCommand(command) {
  const utf8Setup = [
    '$__aiToolsUtf8 = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::InputEncoding = $__aiToolsUtf8',
    '[Console]::OutputEncoding = $__aiToolsUtf8',
    '$OutputEncoding = $__aiToolsUtf8'
  ].join('; ')
  return Buffer.from(`${utf8Setup}; ${command}`, 'utf16le').toString('base64')
}

function resolveShellLaunch(shellRaw, command) {
  const shell = normalizeShell(shellRaw)
  if (shell === 'powershell') {
    return {
      shell,
      executable: resolvePowerShellExecutable(),
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        buildPowerShellEncodedCommand(command)
      ]
    }
  }
  return {
    shell,
    executable: resolveBashExecutable(),
    args: ['--noprofile', '--norc', '-c', command]
  }
}

function createOutputCollector() {
  return {
    chunks: [],
    byteLength: 0,
    truncated: false
  }
}

function appendOutputChunk(state, chunk) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || '')
  if (!bytes.length || state.byteLength >= MAX_OUTPUT_BYTES) {
    if (bytes.length) state.truncated = true
    return
  }
  const remaining = MAX_OUTPUT_BYTES - state.byteLength
  const accepted = bytes.length > remaining ? bytes.subarray(0, remaining) : bytes
  state.chunks.push(accepted)
  state.byteLength += accepted.length
  if (accepted.length < bytes.length) state.truncated = true
}

function looksLikeUtf16Le(bytes) {
  if (!bytes?.length || bytes.length < 4) return false
  let oddNulls = 0
  let pairs = 0
  for (let index = 1; index < bytes.length; index += 2) {
    pairs += 1
    if (bytes[index] === 0) oddNulls += 1
  }
  return pairs > 0 && oddNulls / pairs >= 0.35
}

function decodeCommandOutput(bytes, options = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
  if (!buffer.length) return ''
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }
  if (looksLikeUtf16Le(buffer)) return buffer.toString('utf16le')

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    if ((options.platform || process.platform) === 'win32') {
      try {
        return new TextDecoder('gb18030', { fatal: false }).decode(buffer)
      } catch {
        // Fall through to Node's best-effort UTF-8 decoding.
      }
    }
    return buffer.toString('utf8')
  }
}

function finishOutputCollector(state, options = {}) {
  const decoded = decodeCommandOutput(Buffer.concat(state.chunks, state.byteLength), options)
  if (decoded.length <= MAX_OUTPUT_CHARS) {
    return { text: decoded, truncated: state.truncated }
  }
  return {
    text: decoded.slice(0, MAX_OUTPUT_CHARS),
    truncated: true
  }
}

async function runSandboxCommand(command, options = {}) {
  const safeCommand = validateCommandBoundary(command)
  const launch = resolveShellLaunch(options.shell, safeCommand)
  const workspaceId = normalizeWorkspaceId(options.workspaceId)
  const {
    runtimeRoot,
    cwd,
    relative,
    workspaceKind,
    workspacePath
  } = await resolveWorkingDirectory(options.cwd, workspaceId, options.hostWorkspacePath)
  const timeoutMs = clampTimeout(options.timeoutMs)
  const tempDirectory = path.join(runtimeRoot, '.runtime', 'tmp')
  fsSync.mkdirSync(tempDirectory, { recursive: true })
  const tracksChanges = workspaceKind === 'sandbox'
  const beforeFiles = tracksChanges ? await snapshotWorkspace(workspaceId) : null

  return new Promise((resolve, reject) => {
    const stdout = createOutputCollector()
    const stderr = createOutputCollector()
    const child = spawn(launch.executable, launch.args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        PATH: process.env.PATH || '',
        Path: process.env.Path || '',
        SystemRoot: process.env.SystemRoot || '',
        HOME: runtimeRoot,
        USERPROFILE: runtimeRoot,
        TEMP: tempDirectory,
        TMP: tempDirectory,
        XDG_CONFIG_HOME: path.join(runtimeRoot, '.runtime', 'config'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: path.join(runtimeRoot, '.runtime', 'config', 'gitconfig'),
        LANG: process.env.LANG || 'C.UTF-8',
        LC_ALL: process.env.LC_ALL || 'C.UTF-8',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        AI_TOOLS_SANDBOX: '1',
        AI_TOOLS_SANDBOX_WORKSPACE: workspaceId,
        AI_TOOLS_SANDBOX_SHELL: launch.shell,
        AI_TOOLS_WORKSPACE_KIND: workspaceKind
      }
    })

    let settled = false
    let timedOut = false
    const finish = async (result) => {
      if (settled) return
      settled = true
      try {
        const afterFiles = tracksChanges ? await snapshotWorkspace(workspaceId) : null
        resolve({
          kind: 'sandbox_shell_result',
          workspaceId,
          workspaceKind,
          workspacePath,
          tracksChanges,
          shell: launch.shell,
          ...result,
          changedFiles: tracksChanges ? collectChangedFiles(beforeFiles, afterFiles) : []
        })
      } catch (error) {
        reject(error)
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => appendOutputChunk(stdout, chunk))
    child.stderr?.on('data', (chunk) => appendOutputChunk(stderr, chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      const stdoutResult = finishOutputCollector(stdout)
      const stderrResult = finishOutputCollector(stderr)
      void finish({
        ok: !timedOut && code === 0,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        timeoutMs,
        cwd: relative,
        stdout: stdoutResult.text,
        stderr: stderrResult.text,
        truncated: stdoutResult.truncated || stderrResult.truncated
      })
    })
  })
}

async function runBash(command, options = {}) {
  return runSandboxCommand(command, { ...options, shell: 'bash' })
}

const ACTIONS = Object.freeze([
  {
    name: 'sandbox_run',
    description: 'Run a command in the active AI Tools command workspace. The default is isolated; a user-selected host workspace may be injected by the chat UI. On Windows, auto uses PowerShell.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute inside the workspace.' },
        shell: {
          type: 'string',
          enum: ['auto', 'powershell', 'bash'],
          description: 'Command shell. Default auto uses PowerShell on Windows and Bash elsewhere.'
        },
        workspace_id: { type: 'string', description: 'Workspace id returned with imported attachments. Default: default.' },
        cwd: { type: 'string', description: 'Working directory relative to the active workspace. Default: workspace root.' },
        timeout_ms: { type: 'integer', minimum: 1000, maximum: MAX_TIMEOUT_MS }
      },
      required: ['command'],
      additionalProperties: false
    }
  },
  {
    name: 'bash_run',
    description: 'Compatibility action that runs Bash inside an isolated AI Tools workspace. Prefer sandbox_run unless Bash syntax is specifically required.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to execute inside the workspace.' },
        workspace_id: { type: 'string', description: 'Workspace id returned with imported attachments. Default: default.' },
        cwd: { type: 'string', description: 'Working directory relative to the active workspace. Default: workspace root.' },
        timeout_ms: { type: 'integer', minimum: 1000, maximum: MAX_TIMEOUT_MS }
      },
      required: ['command'],
      additionalProperties: false
    }
  },
  {
    name: 'sandbox_import',
    description: 'Copy explicitly named external files into the sandbox inbox. This action never moves or modifies the source files.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Sandbox workspace id. Default: default.' },
        source_paths: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: { type: 'string' },
          description: 'Absolute paths of regular files the user explicitly asked to import.'
        }
      },
      required: ['source_paths'],
      additionalProperties: false
    }
  },
  {
    name: 'sandbox_list',
    description: 'List regular files currently available in a sandbox workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Sandbox workspace id. Default: default.' },
        path: { type: 'string', description: 'Optional path relative to the workspace.' },
        recursive: { type: 'boolean', description: 'List nested files. Default: true.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sandbox_reset',
    description: 'Delete all files in one sandbox workspace and recreate an empty inbox/output structure.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Sandbox workspace id. Default: default.' }
      },
      additionalProperties: false
    }
  }
])

class BuiltinShellSkillRuntime {
  async listActions() {
    return ACTIONS
  }

  async runAction(toolName, args = {}) {
    const action = cleanString(toolName)
    const workspaceId = normalizeWorkspaceId(args.workspace_id)

    if (action === 'bash_run') {
      const command = cleanString(args.command)
      if (!command) throw new Error('command is required')
      return runBash(command, {
        workspaceId,
        cwd: args.cwd,
        hostWorkspacePath: args.__host_workspace_path,
        timeoutMs: args.timeout_ms
      })
    }
    if (action === 'sandbox_run') {
      const command = cleanString(args.command)
      if (!command) throw new Error('command is required')
      return runSandboxCommand(command, {
        shell: args.shell,
        workspaceId,
        cwd: args.cwd,
        hostWorkspacePath: args.__host_workspace_path,
        timeoutMs: args.timeout_ms
      })
    }
    if (action === 'sandbox_import') {
      return copyExternalFilesToWorkspace(workspaceId, args.source_paths)
    }
    if (action === 'sandbox_list') {
      const files = await walkWorkspaceFiles(workspaceId, {
        path: args.path,
        recursive: args.recursive !== false
      })
      return {
        kind: 'sandbox_list_result',
        workspaceId,
        files
      }
    }
    if (action === 'sandbox_reset') {
      return resetWorkspace(workspaceId)
    }
    throw new Error(`Unknown action: ${toolName}`)
  }

  async close() {}
}

module.exports = function createBuiltinShellSkillRuntime() {
  return new BuiltinShellSkillRuntime()
}

module.exports.ACTIONS = ACTIONS

module.exports._test = {
  resolveWorkingDirectory,
  clampTimeout,
  validateCommandBoundary,
  normalizeShell,
  resolveShellLaunch,
  buildPowerShellEncodedCommand,
  decodeCommandOutput,
  createOutputCollector,
  appendOutputChunk,
  finishOutputCollector
}
