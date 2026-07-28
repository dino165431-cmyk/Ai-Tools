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

async function resolveWorkingDirectory(relativePath = '.', workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspace = await ensureWorkspace(workspaceId)
  const requested = cleanString(relativePath) || '.'
  const safeRelativePath = requested === '.'
    ? ''
    : normalizeSandboxRelativePath(requested, { allowEmpty: true })
  const resolved = resolveWorkspacePath(workspace.workspaceId, safeRelativePath)
  assertDirectory(resolved, 'cwd')
  const realCwd = realpathExisting(resolved)
  const realRoot = realpathExisting(workspace.workspaceRoot)
  if (!isPathInside(realRoot, realCwd)) {
    throw new Error('cwd 不能通过符号链接离开命令沙盒')
  }
  const relative = path.relative(realRoot, realCwd).replace(/\\/g, '/')
  return {
    workspaceId: workspace.workspaceId,
    root: realRoot,
    cwd: realCwd,
    relative: relative || '.'
  }
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

function appendLimited(state, chunk) {
  const text = String(chunk || '')
  if (!text || state.text.length >= MAX_OUTPUT_CHARS) return
  state.text += text.slice(0, MAX_OUTPUT_CHARS - state.text.length)
  if (state.text.length >= MAX_OUTPUT_CHARS) state.truncated = true
}

async function runBash(command, options = {}) {
  const safeCommand = validateCommandBoundary(command)
  const workspaceId = normalizeWorkspaceId(options.workspaceId)
  const {
    root,
    cwd,
    relative
  } = await resolveWorkingDirectory(options.cwd, workspaceId)
  const timeoutMs = clampTimeout(options.timeoutMs)
  const tempDirectory = path.join(root, '.runtime', 'tmp')
  fsSync.mkdirSync(tempDirectory, { recursive: true })
  const beforeFiles = await snapshotWorkspace(workspaceId)

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
        XDG_CONFIG_HOME: path.join(root, '.runtime', 'config'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: path.join(root, '.runtime', 'config', 'gitconfig'),
        LANG: process.env.LANG || 'C.UTF-8',
        AI_TOOLS_SANDBOX: '1',
        AI_TOOLS_SANDBOX_WORKSPACE: workspaceId
      }
    })

    let settled = false
    let timedOut = false
    const finish = async (result) => {
      if (settled) return
      settled = true
      try {
        const afterFiles = await snapshotWorkspace(workspaceId)
        resolve({
          kind: 'sandbox_shell_result',
          workspaceId,
          ...result,
          changedFiles: collectChangedFiles(beforeFiles, afterFiles)
        })
      } catch (error) {
        reject(error)
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => appendLimited(stdout, chunk))
    child.stderr?.on('data', (chunk) => appendLimited(stderr, chunk))
    child.once('error', (error) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      void finish({
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

const ACTIONS = Object.freeze([
  {
    name: 'bash_run',
    description: 'Run a Bash command inside an isolated AI Tools workspace. Files outside the workspace are unavailable unless explicitly imported.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to execute inside the workspace.' },
        workspace_id: { type: 'string', description: 'Workspace id returned with imported attachments. Default: default.' },
        cwd: { type: 'string', description: 'Working directory relative to the sandbox workspace. Default: .' },
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
  validateCommandBoundary
}
