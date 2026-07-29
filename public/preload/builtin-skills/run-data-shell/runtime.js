const path = require('path')
const fsSync = require('fs')
const { spawn, spawnSync } = require('child_process')
const fs = fsSync.promises
const globalConfig = require('../../utils/global-config')

const {
  DEFAULT_WORKSPACE_ID,
  normalizeWorkspaceId,
  normalizeSandboxRelativePath,
  ensureWorkspace,
  getWorkspaceDataPath,
  resolveWorkspacePath,
  copyExternalFilesToWorkspace,
  snapshotWorkspace,
  collectChangedFiles,
  resetWorkspace
} = require('../../utils/sandbox-workspace')

const MAX_OUTPUT_CHARS = 20000
const MAX_OUTPUT_BYTES = MAX_OUTPUT_CHARS * 6
const MAX_STRUCTURED_FILE_BYTES = 5 * 1024 * 1024
const MAX_READ_FILE_BYTES = 1024 * 1024
const MAX_LISTED_ACTIVE_FILES = 500
const DEFAULT_TIMEOUT_MS = 30000
const MAX_TIMEOUT_MS = 120000
const SUPPORTED_SHELLS = new Set(['auto', 'powershell', 'bash'])
const RUNTIME_PATH_CACHE_MS = 30000

let cachedRuntimePath = ''
let cachedRuntimePathAt = 0

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function expandWindowsEnvironmentValue(value, env = process.env) {
  return String(value || '').replace(/%([^%]+)%/g, (match, name) => {
    const resolved = env?.[name] ?? env?.[String(name).toUpperCase()] ?? env?.[String(name).toLowerCase()]
    return resolved === undefined || resolved === null ? match : String(resolved)
  })
}

function readWindowsRegistryPath(key, env = process.env) {
  if (process.platform !== 'win32') return ''
  const systemRoot = cleanString(env.SystemRoot || env.WINDIR)
  if (!systemRoot) return ''
  const regExecutable = path.join(systemRoot, 'System32', 'reg.exe')
  if (!fsSync.existsSync(regExecutable)) return ''
  try {
    const result = spawnSync(regExecutable, ['query', key, '/v', 'Path'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    })
    if (result.error || result.status !== 0) return ''
    const line = String(result.stdout || '')
      .split(/\r?\n/)
      .find((item) => /\sPath\s+REG_(?:EXPAND_)?SZ\s+/i.test(item))
    if (!line) return ''
    return line.replace(/^.*?\sPath\s+REG_(?:EXPAND_)?SZ\s+/i, '').trim()
  } catch {
    return ''
  }
}

function listKnownRuntimeDirectories(env = process.env) {
  const directories = []
  const pushIfDirectory = (candidate) => {
    const value = cleanString(candidate)
    if (!value) return
    try {
      if (fsSync.statSync(value).isDirectory()) directories.push(value)
    } catch {
      // Optional tool directory is absent.
    }
  }

  const userProfile = cleanString(env.USERPROFILE)
  const localAppData = cleanString(env.LOCALAPPDATA)
  const systemRoot = cleanString(env.SystemRoot || env.WINDIR)
  pushIfDirectory(userProfile && path.join(userProfile, '.local', 'bin'))
  pushIfDirectory(localAppData && path.join(localAppData, 'Microsoft', 'WindowsApps'))
  pushIfDirectory(systemRoot)
  pushIfDirectory(systemRoot && path.join(systemRoot, 'System32'))
  pushIfDirectory(path.dirname(process.execPath))
  pushIfDirectory(env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'cmd'))
  pushIfDirectory(env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'bin'))
  pushIfDirectory(env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Git', 'cmd'))
  pushIfDirectory(env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Git', 'bin'))

  if (process.platform === 'win32' && systemRoot) {
    const pyLauncher = path.join(systemRoot, 'py.exe')
    if (fsSync.existsSync(pyLauncher)) {
      try {
        const detected = spawnSync(
          pyLauncher,
          ['-3', '-c', 'import sys; print(sys.executable)'],
          { encoding: 'utf8', windowsHide: true, timeout: 5000 }
        )
        const pythonExecutable = cleanString(detected.stdout)
          .split(/\r?\n/)
          .filter(Boolean)
          .pop()
        if (!detected.error && detected.status === 0 && pythonExecutable) {
          pushIfDirectory(path.dirname(pythonExecutable))
          pushIfDirectory(path.join(path.dirname(pythonExecutable), 'Scripts'))
        }
      } catch {
        // The launcher is optional.
      }
    }
  }

  const pythonRoot = localAppData && path.join(localAppData, 'Programs', 'Python')
  try {
    fsSync.readdirSync(pythonRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => {
        pushIfDirectory(path.join(pythonRoot, entry.name))
        pushIfDirectory(path.join(pythonRoot, entry.name, 'Scripts'))
      })
  } catch {
    // Python may be installed elsewhere.
  }

  if (typeof globalThis.utools !== 'undefined') {
    try {
      const configuredPython = cleanString(globalConfig.getNoteConfig?.()?.notebookRuntime?.pythonPath)
      if (configuredPython && path.isAbsolute(configuredPython)) {
        pushIfDirectory(path.dirname(configuredPython))
      }
    } catch {
      // Runtime PATH probing must not depend on Notebook configuration availability.
    }
  }
  return directories
}

function normalizeRuntimePathEntries(values, env = process.env) {
  const out = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : []).forEach((value) => {
    String(value || '')
      .split(path.delimiter)
      .map((entry) => expandWindowsEnvironmentValue(entry.trim().replace(/^"(.*)"$/, '$1'), env))
      .filter(Boolean)
      .forEach((entry) => {
        const key = process.platform === 'win32' ? entry.toLowerCase() : entry
        if (seen.has(key)) return
        seen.add(key)
        out.push(entry)
      })
  })
  return out
}

function buildRuntimePath(options = {}) {
  const env = options.env || process.env
  const now = Date.now()
  if (
    options.refresh !== true &&
    env === process.env &&
    cachedRuntimePath &&
    now - cachedRuntimePathAt < RUNTIME_PATH_CACHE_MS
  ) {
    return cachedRuntimePath
  }

  const registryPaths = Array.isArray(options.registryPaths)
    ? options.registryPaths
    : process.platform === 'win32'
      ? [
          readWindowsRegistryPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', env),
          readWindowsRegistryPath('HKCU\\Environment', env)
        ]
      : []
  const knownDirectories = Array.isArray(options.knownDirectories)
    ? options.knownDirectories
    : listKnownRuntimeDirectories(env)
  const entries = normalizeRuntimePathEntries([
    env.Path,
    env.PATH,
    ...registryPaths,
    ...knownDirectories
  ], env)
  const value = entries.join(path.delimiter)
  if (env === process.env) {
    cachedRuntimePath = value
    cachedRuntimePathAt = now
  }
  return value
}

function findRuntimeExecutable(command, runtimePath, options = {}) {
  const name = cleanString(command)
  if (!name) return ''
  const platform = options.platform || process.platform
  const extensions = platform === 'win32'
    ? ['', '.exe', '.cmd', '.bat', '.com']
    : ['']
  const entries = String(runtimePath || '').split(path.delimiter).filter(Boolean)
  for (const entry of entries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`)
      try {
        if (fsSync.statSync(candidate).isFile()) return candidate
      } catch {
        // Continue probing.
      }
    }
  }
  return ''
}

function probeRuntimeToolchains(runtimePath) {
  const names = ['uv', 'python', 'py', 'node', 'npm', 'git', 'bash']
  return Object.fromEntries(names.map((name) => {
    const executable = findRuntimeExecutable(name, runtimePath)
    return [name, {
      available: !!executable,
      executable: executable || ''
    }]
  }))
}

function buildChildEnvironment(runtimeRoot, workspaceId, workspaceKind, shell) {
  const runtimePath = buildRuntimePath()
  const tempDirectory = path.join(runtimeRoot, '.runtime', 'tmp')
  const env = {
    SystemRoot: process.env.SystemRoot || process.env.WINDIR || '',
    WINDIR: process.env.WINDIR || process.env.SystemRoot || '',
    COMSPEC: process.env.COMSPEC || '',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
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
    AI_TOOLS_SANDBOX: workspaceKind === 'sandbox' ? 'workspace-guard' : 'host-workspace',
    AI_TOOLS_SANDBOX_WORKSPACE: workspaceId,
    AI_TOOLS_SANDBOX_SHELL: shell,
    AI_TOOLS_WORKSPACE_KIND: workspaceKind
  }
  if (process.platform === 'win32') env.Path = runtimePath
  else env.PATH = runtimePath
  return env
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
    '$OutputEncoding = $__aiToolsUtf8',
    "$ProgressPreference = 'SilentlyContinue'"
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

function getWorkspaceIsolationMetadata(workspaceKind) {
  const isHost = workspaceKind === 'host'
  return {
    isolationLevel: isHost ? 'host-workspace' : 'workspace-guard',
    sandboxEnforced: false,
    networkRestricted: false,
    warning: isHost
      ? '命令在用户选择的本机工作区中运行；当前没有操作系统级进程沙盒。'
      : '命令使用独立工作目录和路径守卫，但当前没有操作系统级进程沙盒。'
  }
}

async function resolveWorkspaceTarget(
  relativePath,
  workspaceId = DEFAULT_WORKSPACE_ID,
  hostWorkspacePath = '',
  options = {}
) {
  const workspace = await resolveWorkingDirectory('.', workspaceId, hostWorkspacePath)
  const safeRelativePath = normalizeSandboxRelativePath(relativePath, {
    allowEmpty: options.allowEmpty === true
  })
  const resolved = path.resolve(workspace.root, safeRelativePath)
  if (!isPathInside(workspace.root, resolved)) {
    throw new Error('目标路径不能离开当前工作区')
  }

  let existingAncestor = resolved
  while (!fsSync.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor)
    if (parent === existingAncestor) break
    existingAncestor = parent
  }
  if (!isPathInside(workspace.root, existingAncestor)) {
    throw new Error('目标路径不能离开当前工作区')
  }
  if (fsSync.existsSync(existingAncestor)) {
    const ancestorStat = fsSync.lstatSync(existingAncestor)
    if (ancestorStat.isSymbolicLink()) throw new Error('目标路径不能经过符号链接')
    const realAncestor = realpathExisting(existingAncestor)
    if (!isPathInside(workspace.root, realAncestor)) {
      throw new Error('目标路径不能通过符号链接离开当前工作区')
    }
  }

  if (fsSync.existsSync(resolved)) {
    const targetStat = fsSync.lstatSync(resolved)
    if (targetStat.isSymbolicLink()) throw new Error('不允许访问符号链接')
    const realTarget = realpathExisting(resolved)
    if (!isPathInside(workspace.root, realTarget)) {
      throw new Error('目标路径不能通过符号链接离开当前工作区')
    }
  } else if (options.mustExist) {
    throw new Error('目标文件或目录不存在')
  }

  return {
    ...workspace,
    absolutePath: resolved,
    relativePath: safeRelativePath
  }
}

function buildWorkspaceFileEntry(workspace, relativePath, stat, extra = {}) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/')
  const base = {
    name: path.posix.basename(normalizedPath),
    path: normalizedPath,
    size: Number(stat?.size) || 0,
    modifiedAt: Number(stat?.mtimeMs) || 0,
    ...extra
  }
  if (workspace.workspaceKind !== 'sandbox') return base
  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return {
    ...base,
    dataPath: getWorkspaceDataPath(workspace.workspaceId, normalizedPath),
    downloadHref: `sandbox-file://${workspace.workspaceId}/${encodedPath}`
  }
}

async function walkActiveWorkspaceFiles(workspace, options = {}) {
  const start = await resolveWorkspaceTarget(
    options.path || '',
    workspace.workspaceId,
    workspace.workspaceKind === 'host' ? workspace.workspacePath : '',
    { allowEmpty: true, mustExist: false }
  )
  const entries = []
  const limit = Math.max(1, Math.min(MAX_LISTED_ACTIVE_FILES, Number(options.limit) || MAX_LISTED_ACTIVE_FILES))

  async function walkDirectory(absoluteDirectory, relativeDirectory) {
    if (entries.length >= limit) return
    const directoryEntries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
    directoryEntries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of directoryEntries) {
      if (entries.length >= limit) return
      if (entry.isSymbolicLink()) continue
      const relative = path.posix.join(relativeDirectory, entry.name)
      if (relative === '.runtime' || relative.startsWith('.runtime/')) continue
      const absolute = path.join(absoluteDirectory, entry.name)
      if (entry.isDirectory()) {
        if (options.recursive !== false) await walkDirectory(absolute, relative)
        continue
      }
      if (!entry.isFile()) continue
      const stat = await fs.stat(absolute)
      entries.push(buildWorkspaceFileEntry(workspace, relative, stat))
    }
  }

  let stat = null
  try {
    stat = await fs.lstat(start.absolutePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  if (stat.isSymbolicLink()) throw new Error('不允许列出符号链接')
  if (stat.isFile()) {
    return [buildWorkspaceFileEntry(workspace, start.relativePath, stat)]
  }
  if (stat.isDirectory()) await walkDirectory(start.absolutePath, start.relativePath)
  return entries
}

function createHostWorkspaceWatcher(workspace) {
  if (workspace?.workspaceKind !== 'host') return null
  const changed = new Set()
  let watcher = null
  try {
    watcher = fsSync.watch(workspace.root, { recursive: true }, (_eventType, filename) => {
      const raw = String(filename || '').replace(/\\/g, '/')
      if (!raw) return
      try {
        const relative = normalizeSandboxRelativePath(raw)
        if (relative === '.runtime' || relative.startsWith('.runtime/')) return
        changed.add(relative)
      } catch {
        // Ignore watcher events that cannot be resolved within the workspace.
      }
    })
  } catch {
    return null
  }

  return {
    close() {
      try {
        watcher?.close()
      } catch {
        // Ignore watcher shutdown failures.
      }
    },
    async collect() {
      const entries = []
      for (const relative of Array.from(changed).slice(0, MAX_LISTED_ACTIVE_FILES)) {
        const absolute = path.resolve(workspace.root, relative)
        if (!isPathInside(workspace.root, absolute)) continue
        try {
          const stat = await fs.lstat(absolute)
          if (stat.isSymbolicLink() || !stat.isFile()) continue
          entries.push(buildWorkspaceFileEntry(workspace, relative, stat, { changeType: 'changed' }))
        } catch (error) {
          if (error?.code === 'ENOENT') {
            entries.push({ name: path.posix.basename(relative), path: relative, changeType: 'deleted' })
          }
        }
      }
      return entries
    }
  }
}

async function readWorkspaceFile(args = {}) {
  const workspaceId = normalizeWorkspaceId(args.workspace_id)
  const target = await resolveWorkspaceTarget(
    args.path,
    workspaceId,
    args.__host_workspace_path,
    { mustExist: true }
  )
  const stat = await fs.lstat(target.absolutePath)
  if (!stat.isFile()) throw new Error('path 必须指向普通文件')
  if (stat.size > MAX_READ_FILE_BYTES) {
    throw new Error('文件超过 1MB 的结构化读取上限，请使用命令进行有界读取')
  }
  const encoding = cleanString(args.encoding).toLowerCase() === 'base64' ? 'base64' : 'utf8'
  const bytes = await fs.readFile(target.absolutePath)
  return {
    kind: 'sandbox_read_file_result',
    ok: true,
    workspaceId: target.workspaceId,
    workspaceKind: target.workspaceKind,
    workspacePath: target.workspacePath,
    ...getWorkspaceIsolationMetadata(target.workspaceKind),
    path: target.relativePath,
    encoding,
    size: bytes.byteLength,
    content: bytes.toString(encoding)
  }
}

async function writeWorkspaceFile(args = {}) {
  const workspaceId = normalizeWorkspaceId(args.workspace_id)
  const target = await resolveWorkspaceTarget(
    args.path,
    workspaceId,
    args.__host_workspace_path
  )
  const mode = cleanString(args.mode).toLowerCase() || 'create'
  if (!['create', 'overwrite', 'append'].includes(mode)) {
    throw new Error('mode 仅支持 create、overwrite 或 append')
  }
  const encoding = cleanString(args.encoding).toLowerCase() === 'base64' ? 'base64' : 'utf8'
  const content = typeof args.content === 'string' ? args.content : ''
  const bytes = Buffer.from(content, encoding)
  if (bytes.byteLength > MAX_STRUCTURED_FILE_BYTES) {
    throw new Error('单次结构化写入不能超过 5MB')
  }

  const existed = fsSync.existsSync(target.absolutePath)
  if (existed) {
    const existingStat = fsSync.lstatSync(target.absolutePath)
    if (existingStat.isSymbolicLink() || !existingStat.isFile()) {
      throw new Error('path 必须指向普通文件，且不能是符号链接')
    }
  }
  if (mode === 'create' && existed) {
    throw new Error('目标文件已存在；如需替换请明确使用 mode=overwrite')
  }

  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true })
  const verified = await resolveWorkspaceTarget(
    target.relativePath,
    workspaceId,
    args.__host_workspace_path
  )
  if (mode === 'append') await fs.appendFile(verified.absolutePath, bytes)
  else await fs.writeFile(verified.absolutePath, bytes)
  const stat = await fs.stat(verified.absolutePath)
  const file = buildWorkspaceFileEntry(verified, verified.relativePath, stat, {
    changeType: existed ? 'modified' : 'created'
  })
  return {
    kind: 'sandbox_write_file_result',
    ok: true,
    workspaceId: verified.workspaceId,
    workspaceKind: verified.workspaceKind,
    workspacePath: verified.workspacePath,
    tracksChanges: true,
    changeTracking: 'structured',
    ...getWorkspaceIsolationMetadata(verified.workspaceKind),
    file,
    changedFiles: [file]
  }
}

async function getSandboxStatus(args = {}) {
  const workspaceId = normalizeWorkspaceId(args.workspace_id)
  const workspace = await resolveWorkingDirectory(
    args.cwd,
    workspaceId,
    args.__host_workspace_path
  )
  const runtimePath = buildRuntimePath({ refresh: args.refresh_path === true })
  return {
    kind: 'sandbox_status_result',
    ok: true,
    workspaceId: workspace.workspaceId,
    workspaceKind: workspace.workspaceKind,
    workspacePath: workspace.workspacePath,
    cwd: workspace.relative,
    ...getWorkspaceIsolationMetadata(workspace.workspaceKind),
    commandBoundary: 'relative-path preflight and workspace cwd',
    toolchains: probeRuntimeToolchains(runtimePath)
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
  const usesSnapshotTracking = workspaceKind === 'sandbox'
  const beforeFiles = usesSnapshotTracking ? await snapshotWorkspace(workspaceId) : null
  const workspace = {
    workspaceId,
    workspaceKind,
    workspacePath,
    root: workspaceKind === 'host' ? workspacePath : runtimeRoot
  }
  const hostWatcher = createHostWorkspaceWatcher(workspace)
  const tracksChanges = usesSnapshotTracking || !!hostWatcher

  return new Promise((resolve, reject) => {
    const stdout = createOutputCollector()
    const stderr = createOutputCollector()
    const child = spawn(launch.executable, launch.args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: buildChildEnvironment(runtimeRoot, workspaceId, workspaceKind, launch.shell)
    })

    let settled = false
    let timedOut = false
    const finish = async (result) => {
      if (settled) return
      settled = true
      try {
        hostWatcher?.close()
        const afterFiles = usesSnapshotTracking ? await snapshotWorkspace(workspaceId) : null
        const changedFiles = usesSnapshotTracking
          ? collectChangedFiles(beforeFiles, afterFiles)
          : hostWatcher
            ? await hostWatcher.collect()
            : []
        resolve({
          kind: 'sandbox_shell_result',
          workspaceId,
          workspaceKind,
          workspacePath,
          tracksChanges,
          changeTracking: usesSnapshotTracking ? 'snapshot' : hostWatcher ? 'watcher' : 'none',
          ...getWorkspaceIsolationMetadata(workspaceKind),
          shell: launch.shell,
          ...result,
          changedFiles
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
      hostWatcher?.close()
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
    name: 'sandbox_status',
    description: 'Inspect the active command workspace, the actual isolation level, and available toolchains. This does not execute a user command.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id. Default: default.' },
        cwd: { type: 'string', description: 'Optional relative working directory.' },
        refresh_path: { type: 'boolean', description: 'Refresh user and machine PATH before probing tools.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sandbox_run',
    description: 'Run a command in the active AI Tools command workspace. This uses a workspace path guard, not an OS-level process sandbox. A user-selected host workspace may be injected by the chat UI. On Windows, auto uses PowerShell.',
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
    description: 'Compatibility action that runs Bash inside the active guarded workspace. Prefer sandbox_run unless Bash syntax is specifically required.',
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
    name: 'sandbox_read_file',
    description: 'Read one workspace-relative regular file without invoking a shell. Supports UTF-8 or base64 and enforces workspace/symlink boundaries.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id. Default: default.' },
        path: { type: 'string', description: 'Required path relative to the active workspace.' },
        encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Default: utf8.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'sandbox_write_file',
    description: 'Write one workspace-relative file without embedding content in a shell command. This is the preferred action for source code, README files, and text containing slashes or absolute-path examples.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace id. Default: default.' },
        path: { type: 'string', description: 'Required path relative to the active workspace.' },
        content: { type: 'string', description: 'File content encoded according to encoding.' },
        encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Default: utf8.' },
        mode: {
          type: 'string',
          enum: ['create', 'overwrite', 'append'],
          description: 'Default create refuses to replace an existing file.'
        }
      },
      required: ['path', 'content'],
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
    description: 'List regular non-symlink files in the active workspace, including a user-selected host workspace.',
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

    if (action === 'sandbox_status') {
      return getSandboxStatus(args)
    }
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
    if (action === 'sandbox_read_file') {
      return readWorkspaceFile(args)
    }
    if (action === 'sandbox_write_file') {
      return writeWorkspaceFile(args)
    }
    if (action === 'sandbox_import') {
      return copyExternalFilesToWorkspace(workspaceId, args.source_paths)
    }
    if (action === 'sandbox_list') {
      const workspace = await resolveWorkingDirectory(
        '.',
        workspaceId,
        args.__host_workspace_path
      )
      const files = await walkActiveWorkspaceFiles(workspace, {
        path: args.path,
        recursive: args.recursive !== false
      })
      return {
        kind: 'sandbox_list_result',
        ok: true,
        workspaceId: workspace.workspaceId,
        workspaceKind: workspace.workspaceKind,
        workspacePath: workspace.workspacePath,
        ...getWorkspaceIsolationMetadata(workspace.workspaceKind),
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
  finishOutputCollector,
  buildRuntimePath,
  findRuntimeExecutable,
  probeRuntimeToolchains,
  buildChildEnvironment,
  getWorkspaceIsolationMetadata,
  resolveWorkspaceTarget,
  readWorkspaceFile,
  writeWorkspaceFile,
  getSandboxStatus
}
