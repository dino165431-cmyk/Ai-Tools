const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const fileOperations = require('./file-operations');
const globalConfig = require('./global-config');
const pythonLsp = require('./python-lsp');

const BUNDLED_HELPER_SCRIPT_PATH = path.join(__dirname, '..', 'helpers', 'notebook_runtime.py');
const PYTHON_DEPENDENCY_PACKAGES = ['jupyter_client', 'ipykernel', 'jedi-language-server'];
const NOTEBOOK_MAGIC_LINE_PREFIXES = ['%pip'];
const LOCAL_NOTEBOOK_RUNTIME_DIRNAME = '.ai-tools-local';
const MANAGED_NOTEBOOK_VENV_DIRNAME = 'venv';
const MANAGED_NOTEBOOK_VENV_PYTHON_RELATIVE_PATH = process.platform === 'win32'
  ? path.join('Scripts', 'python.exe')
  : path.join('bin', 'python');
const PYTHON_MODULE_CACHE_TTL_MS = 60000;
const PYTHON_LSP_HEALTH_CACHE_TTL_MS = 30000;
const PROCESS_PARTIAL_FLUSH_MS = 90;
const PYTHON_MODULE_DISCOVERY_SCRIPT = [
  'import json, pkgutil, sys',
  'modules = set()',
  'stdlib = getattr(sys, "stdlib_module_names", set()) or set()',
  'modules.update(str(item) for item in stdlib if isinstance(item, str))',
  'modules.update(module.name for module in pkgutil.iter_modules())',
  'print(json.dumps(sorted(modules), ensure_ascii=False))'
].join('; ');

let cachedDetectedPythonPath = '';
let cachedResolvedHelperScriptPath = '';

function buildRuntimeCacheKey(options = {}) {
  const pythonPath = String(options?.pythonPath || '').trim() || 'python';
  const workspacePath = String(options?.workspacePath || '').trim() || '';
  return `${pythonPath}::${workspacePath}`;
}

function randomId(prefix = 'nb') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeExecutionTimeoutMs(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded <= 0) return 0;
  return Math.min(600000, rounded);
}

function normalizeStartupTimeoutMs(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded <= 0) return 0;
  return Math.min(120000, Math.max(3000, rounded));
}

function buildInstallCommand(pythonPath) {
  const executable = String(pythonPath || 'python').trim() || 'python';
  return `"${executable}" -m pip install ${PYTHON_DEPENDENCY_PACKAGES.join(' ')}`;
}

function buildPythonChildEnv(extraEnv = {}) {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    NO_COLOR: '1',
    ...extraEnv
  };
}

function createProcessTextDecoder() {
  const utf8Decoder = new TextDecoder('utf-8');
  const gbDecoder = process.platform === 'win32' ? new TextDecoder('gb18030') : null;
  let preferred = 'utf-8';

  const decodeWith = (decoder, chunk, stream) => decoder.decode(chunk, { stream });

  return {
    decode(chunk, stream = true) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || '');
      if (!buffer.length) return '';

      if (preferred === 'gb18030' && gbDecoder) {
        return decodeWith(gbDecoder, buffer, stream);
      }

      const utf8Text = decodeWith(utf8Decoder, buffer, stream);
      if (!gbDecoder || !utf8Text.includes('\uFFFD')) return utf8Text;

      const fallbackText = decodeWith(gbDecoder, buffer, stream);
      const utf8LossCount = (utf8Text.match(/\uFFFD/g) || []).length;
      const fallbackLossCount = (fallbackText.match(/\uFFFD/g) || []).length;
      if (fallbackLossCount < utf8LossCount) {
        preferred = 'gb18030';
        return fallbackText;
      }
      return utf8Text;
    },
    end() {
      if (preferred === 'gb18030' && gbDecoder) {
        return decodeWith(gbDecoder, new Uint8Array(), false);
      }
      return decodeWith(utf8Decoder, new Uint8Array(), false);
    }
  };
}

function stripAnsi(text = '') {
  return String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function normalizeProcessOutputText(text = '') {
  return stripAnsi(String(text || '')).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function createUserAbortError(message = 'Notebook 命令已被用户停止。') {
  const err = new Error(String(message || 'Notebook 命令已被用户停止。'));
  err.code = 'USER_ABORT';
  err.userAborted = true;
  return err;
}

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32' && Number.isFinite(Number(proc.pid))) {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      return;
    }
  } catch {
    // ignore and fall back to kill()
  }

  try {
    proc.kill();
  } catch {
    // ignore
  }
}

function parseNotebookMagicSpec(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('!')) {
    const command = trimmed.slice(1).trim();
    if (!command) return null;
    if (/^pip(?:\s|$)/i.test(command)) {
      return {
        kind: 'pip',
        args: command.replace(/^pip\b/i, '').trim()
      };
    }
    return {
      kind: 'shell',
      command
    };
  }

  const matchedPrefix = NOTEBOOK_MAGIC_LINE_PREFIXES.find((prefix) => trimmed.toLowerCase().startsWith(prefix));
  if (!matchedPrefix) return null;
  return {
    kind: 'pip',
    args: trimmed.slice(matchedPrefix.length).trim()
  };
}

function parseNotebookMagicSpecs(code = '') {
  const lines = String(code || '').split(/\r?\n/);
  const specs = [];

  for (const line of lines) {
    if (!String(line || '').trim()) continue;
    const spec = parseNotebookMagicSpec(line);
    if (!spec) return [];
    specs.push(spec);
  }

  return specs;
}

function buildNotebookMagicWrapper(code = '') {
  const specs = parseNotebookMagicSpecs(code);
  if (!specs.length) return String(code || '');

  return [
    'import locale as __ai_nb_locale',
    'import os as __ai_nb_os',
    'import shlex as __ai_nb_shlex',
    'import subprocess as __ai_nb_subprocess',
    'import sys as __ai_nb_sys',
    `__ai_nb_specs = ${JSON.stringify(specs)}`,
    'def __ai_nb_decode(__ai_nb_chunk):',
    '    if isinstance(__ai_nb_chunk, str):',
    '        return __ai_nb_chunk',
    "    __ai_nb_candidates = ['utf-8', __ai_nb_locale.getpreferredencoding(False) or '', 'gb18030', 'gbk']",
    '    __ai_nb_seen = set()',
    '    for __ai_nb_encoding in __ai_nb_candidates:',
    '        if not __ai_nb_encoding or __ai_nb_encoding in __ai_nb_seen:',
    '            continue',
    '        __ai_nb_seen.add(__ai_nb_encoding)',
    '        try:',
    '            return __ai_nb_chunk.decode(__ai_nb_encoding)',
    '        except UnicodeDecodeError:',
    '            continue',
    "    return __ai_nb_chunk.decode('utf-8', errors='replace')",
    'def __ai_nb_normalize(__ai_nb_text):',
    "    return str(__ai_nb_text).replace('\\r\\n', '\\n').replace('\\r', '\\n')",
    'def __ai_nb_run(__ai_nb_spec):',
    '    __ai_nb_env = dict(__ai_nb_os.environ)',
    "    __ai_nb_env['PYTHONIOENCODING'] = 'utf-8'",
    "    __ai_nb_env['PYTHONUTF8'] = '1'",
    "    __ai_nb_env.setdefault('PIP_DISABLE_PIP_VERSION_CHECK', '1')",
    "    __ai_nb_env.setdefault('NO_COLOR', '1')",
    "    if __ai_nb_spec.get('kind') == 'pip':",
    "        __ai_nb_command = [__ai_nb_sys.executable, '-m', 'pip'] + __ai_nb_shlex.split(__ai_nb_spec.get('args', ''), posix=__ai_nb_os.name != 'nt')",
    '        __ai_nb_proc = __ai_nb_subprocess.Popen(__ai_nb_command, stdout=__ai_nb_subprocess.PIPE, stderr=__ai_nb_subprocess.STDOUT, env=__ai_nb_env)',
    '    else:',
    "        __ai_nb_proc = __ai_nb_subprocess.Popen(__ai_nb_spec.get('command', ''), shell=True, stdout=__ai_nb_subprocess.PIPE, stderr=__ai_nb_subprocess.STDOUT, env=__ai_nb_env)",
    '    while True:',
    '        __ai_nb_chunk = __ai_nb_proc.stdout.read(4096)',
    '        if not __ai_nb_chunk:',
    '            break',
    '        __ai_nb_sys.stdout.write(__ai_nb_normalize(__ai_nb_decode(__ai_nb_chunk)))',
    '        __ai_nb_sys.stdout.flush()',
    '    __ai_nb_proc.wait()',
    'for __ai_nb_spec in __ai_nb_specs:',
    '    __ai_nb_run(__ai_nb_spec)',
    'del __ai_nb_run',
    'del __ai_nb_decode',
    'del __ai_nb_normalize',
    'del __ai_nb_specs'
  ].join('\n');
}

function safeInvoke(callback, payload) {
  if (typeof callback !== 'function') return;
  try {
    callback(payload);
  } catch {
    // ignore renderer callback failures
  }
}

function normalizeProgressMessage(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('collecting ')) return `正在下载依赖: ${raw}`;
  if (lower.includes('installing collected packages')) return '正在安装依赖包...';
  if (lower.includes('successfully installed')) return '依赖安装完成。';
  if (lower.includes('requirement already satisfied')) return `依赖已存在: ${raw}`;
  if (lower.includes('looking in indexes')) return '正在解析安装源...';
  return raw;
}

function resolveRuntimeFsPath(targetPath, fallback = '') {
  const raw = String(targetPath || '').trim();
  if (!raw) return fallback;
  if (path.isAbsolute(raw)) return path.resolve(raw);
  try {
    return fileOperations.resolvePath(raw);
  } catch {
    return path.resolve(raw);
  }
}

function runProcessWithProgress(command, args = [], options = {}) {
  const executable = String(command || '').trim();
  if (!executable) {
    return Promise.reject(new Error('缺少可执行命令'));
  }

  const spawnArgs = Array.isArray(args) ? args.map((item) => String(item ?? '')) : [];
  const cwd = resolveRuntimeFsPath(options?.cwd, undefined);
  if (cwd && !fs.existsSync(cwd)) {
    return Promise.reject(new Error(`找不到工作目录：${cwd}`));
  }
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const displayCommand = String(options?.displayCommand || [executable, ...spawnArgs].join(' ')).trim();
  const startMessage = String(options?.startMessage || '').trim();
  const successMessage = String(options?.successMessage || '').trim();
  const errorMessage = String(options?.errorMessage || '').trim();
  const registerProcess = typeof options?.registerProcess === 'function' ? options.registerProcess : null;
  const shell = !!options?.shell;
  const commandLine = String(options?.commandLine || executable).trim() || executable;
  const partialFlushMs = clampInteger(options?.partialFlushMs, PROCESS_PARTIAL_FLUSH_MS, 0, 1000);
  const isCancelled = typeof options?.isCancelled === 'function' ? options.isCancelled : () => false;
  const registerAbort = typeof options?.registerAbort === 'function' ? options.registerAbort : null;
  const progressMessage = typeof options?.progressMessage === 'function'
    ? options.progressMessage
    : (text) => normalizeProgressMessage(text);

  return new Promise((resolve, reject) => {
    const proc = shell
      ? spawn(commandLine, {
          cwd,
          env: buildPythonChildEnv(options?.env),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        })
      : spawn(executable, spawnArgs, {
          cwd,
          env: buildPythonChildEnv(options?.env),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutPartialTimer = null;
    let stderrPartialTimer = null;
    const stdoutDecoder = createProcessTextDecoder();
    const stderrDecoder = createProcessTextDecoder();
    let settled = false;
    safeInvoke(registerProcess, proc);

    const clearPartialTimer = (phase) => {
      if (phase === 'stdout' && stdoutPartialTimer) {
        clearTimeout(stdoutPartialTimer);
        stdoutPartialTimer = null;
      }
      if (phase === 'stderr' && stderrPartialTimer) {
        clearTimeout(stderrPartialTimer);
        stderrPartialTimer = null;
      }
    };

    const clearAllPartialTimers = () => {
      clearPartialTimer('stdout');
      clearPartialTimer('stderr');
    };

    const rejectOnce = (err) => {
      if (settled) return false;
      settled = true;
      clearAllPartialTimers();
      reject(err);
      return true;
    };

    const resolveOnce = (payload) => {
      if (settled) return false;
      settled = true;
      clearAllPartialTimers();
      resolve(payload);
      return true;
    };

    if (startMessage) {
      safeInvoke(onProgress, {
        phase: 'start',
        command: displayCommand,
        message: startMessage
      });
    }

    const flushBufferedLines = (buffer, phase) => {
      const normalized = String(buffer || '').replace(/\r\n/g, '\n');
      const segments = normalized.split('\n');
      const pending = segments.pop() || '';
      segments.forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed) return;
        safeInvoke(onProgress, {
          phase,
          command: displayCommand,
          text: line,
          message: progressMessage(trimmed)
        });
      });
      return pending;
    };

    const flushPartialBuffer = (phase) => {
      clearPartialTimer(phase);
      const current = phase === 'stderr' ? stderrBuffer : stdoutBuffer;
      const trimmed = String(current || '').trim();
      if (!trimmed) return;
      safeInvoke(onProgress, {
        phase,
        command: displayCommand,
        text: current,
        message: progressMessage(trimmed),
        partial: true
      });
      if (phase === 'stderr') stderrBuffer = '';
      else stdoutBuffer = '';
    };

    const schedulePartialFlush = (phase) => {
      if (!partialFlushMs) return;
      clearPartialTimer(phase);
      const timer = setTimeout(() => flushPartialBuffer(phase), partialFlushMs);
      if (phase === 'stderr') stderrPartialTimer = timer;
      else stdoutPartialTimer = timer;
    };

    if (registerAbort) {
      safeInvoke(registerAbort, () => {
        killProcessTree(proc);
        try {
          proc.stdout?.destroy?.();
          proc.stderr?.destroy?.();
        } catch {
          // ignore
        }
        rejectOnce(createUserAbortError());
      });
    }

    proc.stdout?.on('data', (chunk) => {
      if (settled) return;
      const text = normalizeProcessOutputText(stdoutDecoder.decode(chunk));
      stdout += text;
      stdoutBuffer += text;
      stdoutBuffer = flushBufferedLines(stdoutBuffer, 'stdout');
      schedulePartialFlush('stdout');
    });
    proc.stderr?.on('data', (chunk) => {
      if (settled) return;
      const text = normalizeProcessOutputText(stderrDecoder.decode(chunk));
      stderr += text;
      stderrBuffer += text;
      stderrBuffer = flushBufferedLines(stderrBuffer, 'stderr');
      schedulePartialFlush('stderr');
    });

    proc.on('error', (err) => {
      if (settled) return;
      clearAllPartialTimers();
      if (isCancelled()) {
        rejectOnce(createUserAbortError());
        return;
      }
      const messageText = String(err?.message || err || errorMessage || '命令执行失败').trim();
      safeInvoke(onProgress, {
        phase: 'error',
        command: displayCommand,
        message: messageText
      });
      if (messageText.includes('ENOENT')) {
        rejectOnce(new Error(`找不到命令：${executable}`));
        return;
      }
      rejectOnce(err);
    });

    proc.on('exit', (code) => {
      if (settled) return;
      clearAllPartialTimers();
      const stdoutTail = normalizeProcessOutputText(stdoutDecoder.end());
      const stderrTail = normalizeProcessOutputText(stderrDecoder.end());
      if (stdoutTail) {
        stdout += stdoutTail;
        stdoutBuffer += stdoutTail;
      }
      if (stderrTail) {
        stderr += stderrTail;
        stderrBuffer += stderrTail;
      }

      const flushRemainder = (remainder, phase) => {
        const trimmed = String(remainder || '').trim();
        if (!trimmed) return;
        safeInvoke(onProgress, {
          phase,
          command: displayCommand,
          text: remainder,
          message: progressMessage(trimmed)
        });
      };

      flushRemainder(stdoutBuffer, 'stdout');
      flushRemainder(stderrBuffer, 'stderr');

      if (isCancelled()) {
        rejectOnce(createUserAbortError());
        return;
      }

      if (code === 0) {
        if (successMessage) {
          safeInvoke(onProgress, {
            phase: 'success',
            command: displayCommand,
            message: successMessage
          });
        }
        resolveOnce({
          ok: true,
          command: displayCommand,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
        return;
      }

      const failureText = (stderr || stdout || errorMessage || `命令执行失败，退出码：${code}`).trim();
      safeInvoke(onProgress, {
        phase: 'error',
        command: displayCommand,
        message: failureText
      });
      rejectOnce(new Error(failureText));
    });
  });
}

function runPythonJsonScript(pythonPath, script, timeout = 15000) {
  const result = spawnSync(pythonPath, ['-c', script], {
    encoding: 'utf-8',
    windowsHide: true,
    env: buildPythonChildEnv(),
    timeout
  });

  if (result.error) {
    if (String(result.error?.message || '').includes('ENOENT')) {
      throw new Error(`找不到 Python：${pythonPath}`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(stderr || stdout || `Python 命令执行失败（退出码：${result.status}）`);
  }

  const text = String(result.stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function probePythonExecutable(command, baseArgs = []) {
  try {
    const result = spawnSync(command, [...baseArgs, '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf-8',
      windowsHide: true,
      env: buildPythonChildEnv(),
      timeout: 10000
    });
    if (result.error || result.status !== 0) return '';
    const output = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
    return output ? String(output).trim() : String(command || '').trim();
  } catch {
    return '';
  }
}

function detectPythonPath() {
  if (cachedDetectedPythonPath) return cachedDetectedPythonPath;

  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] }
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] }
      ];

  for (const candidate of candidates) {
    const detected = probePythonExecutable(candidate.command, candidate.args);
    if (detected) {
      cachedDetectedPythonPath = detected;
      return detected;
    }
  }

  return '';
}

function pickPythonPath(preferred) {
  const explicit = String(preferred || '').trim();
  if (explicit && explicit.toLowerCase() !== 'python') return explicit;
  const detected = detectPythonPath();
  if (detected) return detected;
  return explicit || 'python';
}

function getUserDataRoot() {
  try {
    const raw = String(globalThis?.utools?.getPath?.('userData') || '').trim();
    if (raw) return path.resolve(raw);
  } catch {
    // ignore
  }
  return process.cwd();
}

function stripWrappingQuotes(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (
    (raw.startsWith('"') && raw.endsWith('"'))
    || (raw.startsWith('\'') && raw.endsWith('\''))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function normalizeManagedVenvName(name = '') {
  const normalized = stripWrappingQuotes(name);
  if (!normalized) {
    throw new Error('环境名称不能为空。');
  }
  if (normalized === '.' || normalized === '..') {
    throw new Error('环境名称不能是 . 或 .. 。');
  }
  if (normalized.includes('\0')) {
    throw new Error('环境名称包含非法字符。');
  }
  if (/[\\/]/.test(normalized)) {
    throw new Error('环境名称不能包含路径分隔符，请只填写环境名。');
  }
  return normalized;
}

function getManagedVenvRootPath() {
  const runtime = getDefaultRuntimeConfig();
  const configuredRoot = String(runtime?.venvRoot || '').trim();
  if (configuredRoot) {
    if (!path.isAbsolute(configuredRoot)) {
      throw new Error('Notebook 虚拟环境目录必须是绝对路径。');
    }
    return path.resolve(configuredRoot);
  }
  return path.join(getUserDataRoot(), LOCAL_NOTEBOOK_RUNTIME_DIRNAME, MANAGED_NOTEBOOK_VENV_DIRNAME);
}

function getManagedVenvPathByName(name = '') {
  return path.join(getManagedVenvRootPath(), normalizeManagedVenvName(name));
}

function getManagedVenvPythonPathByName(name = '') {
  return path.join(getManagedVenvPathByName(name), MANAGED_NOTEBOOK_VENV_PYTHON_RELATIVE_PATH);
}

function buildManagedVenvRecord(name = '') {
  const normalizedName = normalizeManagedVenvName(name);
  const envPath = getManagedVenvPathByName(normalizedName);
  const pythonPath = getManagedVenvPythonPathByName(normalizedName);
  return {
    name: normalizedName,
    envPath,
    pythonPath,
    exists: fs.existsSync(pythonPath)
  };
}

function listManagedVenvRecords() {
  const rootPath = getManagedVenvRootPath();
  if (!fs.existsSync(rootPath)) {
    return {
      rootPath,
      envs: []
    };
  }

  const envs = fs.readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry?.isDirectory?.())
    .map((entry) => {
      try {
        return buildManagedVenvRecord(entry.name);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  return {
    rootPath,
    envs
  };
}

function getBundledHelperScriptCandidates() {
  const direct = BUNDLED_HELPER_SCRIPT_PATH;
  const unpacked = direct.replace(/\.asar([\\/])/, '.asar.unpacked$1');
  return Array.from(new Set([direct, unpacked]));
}

function readBundledHelperScriptSource() {
  let lastError = null;

  for (const candidate of getBundledHelperScriptCandidates()) {
    try {
      return {
        sourcePath: candidate,
        content: fs.readFileSync(candidate, 'utf-8')
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('找不到 Notebook Runtime helper 脚本');
}

function ensureExternalHelperScriptPath() {
  if (cachedResolvedHelperScriptPath && fs.existsSync(cachedResolvedHelperScriptPath)) {
    return cachedResolvedHelperScriptPath;
  }

  const { content } = readBundledHelperScriptSource();
  const helperDir = path.join(getUserDataRoot(), '.ai-tools-runtime', 'helpers');
  const targetPath = path.join(helperDir, 'notebook_runtime.py');

  fs.mkdirSync(helperDir, { recursive: true });

  let shouldWrite = true;
  try {
    if (fs.existsSync(targetPath) && fs.readFileSync(targetPath, 'utf-8') === content) {
      shouldWrite = false;
    }
  } catch {
    shouldWrite = true;
  }

  if (shouldWrite) {
    fs.writeFileSync(targetPath, content, 'utf-8');
  }

  cachedResolvedHelperScriptPath = targetPath;
  return targetPath;
}

function formatStartupError(options, payload = {}, stderrText = '') {
  const errorCode = String(payload.error_code || '').trim();
  const pythonPath = String(payload.python_path || options?.pythonPath || 'python').trim() || 'python';
  const installCommand = String(payload.install_command || buildInstallCommand(pythonPath)).trim();
  const baseError = String(payload.error || stderrText || 'Notebook runtime startup failed').trim();
  const mergedText = `${baseError}\n${stderrText}`.trim();
  const lowerMergedText = mergedText.toLowerCase();

  if (
    errorCode === 'MISSING_JUPYTER_CLIENT' ||
    mergedText.includes("No module named 'jupyter_client'") ||
    mergedText.includes('Failed to import jupyter_client')
  ) {
    return [
      '当前超级笔记使用的 Python 环境缺少 jupyter_client，暂时无法启动 Notebook 内核。',
      `Python: ${pythonPath}`,
      `请先执行：${installCommand}`
    ].join('\n');
  }

  if (mergedText.includes("No module named 'ipykernel'")) {
    return [
      '当前超级笔记使用的 Python 环境缺少 ipykernel，暂时无法启动 Python Notebook 内核。',
      `Python: ${pythonPath}`,
      `请先执行：${installCommand}`
    ].join('\n');
  }

  if (
    errorCode === 'KERNEL_STARTUP_TIMEOUT' ||
    (
      normalizeStartupTimeoutMs(payload.startup_timeout_ms, normalizeStartupTimeoutMs(options?.startupTimeoutMs, 0)) > 0 &&
      (
        lowerMergedText.includes('timed out') ||
        lowerMergedText.includes("didn't respond") ||
        lowerMergedText.includes('did not respond')
      )
    )
  ) {
    const timeoutMs = normalizeStartupTimeoutMs(
      payload.startup_timeout_ms,
      normalizeStartupTimeoutMs(options?.startupTimeoutMs, 0)
    );
    const timeoutLabel = timeoutMs > 0 ? `${timeoutMs}ms` : '无限等待';
    return [
      '当前超级笔记的 Kernel 启动超时，超时发生在“内核启动”阶段，不是 Cell 执行阶段。',
      `Python: ${pythonPath}`,
      `启动超时设置: ${timeoutLabel}`,
      '如果环境首次启动较慢，可以把启动超时设为 0（永不超时）。'
    ].join('\n');
  }

  return baseError || 'Notebook 运行时启动失败';
}

function formatProcessExitError(options, code, signal, stderrText = '') {
  const pythonPath = String(options?.pythonPath || 'python').trim() || 'python';
  const mergedText = String(stderrText || '').trim();

  if (
    mergedText.includes("No module named 'jupyter_client'") ||
    mergedText.includes('Failed to import jupyter_client')
  ) {
    return formatStartupError(options, {
      error_code: 'MISSING_JUPYTER_CLIENT',
      python_path: pythonPath,
      error: mergedText
    }, mergedText);
  }

  if (mergedText.includes("No module named 'ipykernel'")) {
    return formatStartupError(options, {
      python_path: pythonPath,
      error: mergedText
    }, mergedText);
  }

  const detail = mergedText ? `\n${mergedText}` : '';
  return signal
    ? `Notebook 运行时已退出（signal: ${signal}）${detail}`
    : `Notebook 运行时已退出（code: ${code}）${detail}`;
}

function getDefaultRuntimeConfig() {
  const noteConfig = globalConfig.getNoteConfig?.() || {};
  const notebookRuntime = noteConfig?.notebookRuntime || {};
  const configuredPythonPath = String(notebookRuntime.pythonPath || '').trim();
  return {
    pythonPath: pickPythonPath(configuredPythonPath),
    venvRoot: String(notebookRuntime.venvRoot || '').trim(),
    kernelName: String(notebookRuntime.kernelName || '').trim(),
    startupTimeoutMs: normalizeStartupTimeoutMs(notebookRuntime.startupTimeoutMs, 0),
    executeTimeoutMs: normalizeExecutionTimeoutMs(notebookRuntime.executeTimeoutMs, 0)
  };
}

function resolveWorkspacePath(options = {}) {
  const notebookPath = String(options?.notebookPath || '').trim();
  if (notebookPath) {
    const resolvedNotebookPath = resolveRuntimeFsPath(notebookPath, fileOperations.resolvePath('note'));
    return path.dirname(resolvedNotebookPath);
  }

  const workspacePath = String(options?.workspacePath || '').trim();
  if (workspacePath) return resolveRuntimeFsPath(workspacePath, fileOperations.resolvePath('note'));
  return fileOperations.resolvePath('note');
}

function normalizeSessionOptions(options = {}) {
  const src = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const defaults = getDefaultRuntimeConfig();
  const notebookPath = String(src.notebookPath || '').trim();
  let cwd = '';

  if (notebookPath) {
    const resolved = fileOperations.resolvePath(notebookPath);
    cwd = path.dirname(resolved);
  } else {
    cwd = fileOperations.resolvePath('note');
  }

  return {
    notebookPath,
    cwd,
    pythonPath: pickPythonPath(src.pythonPath || defaults.pythonPath),
    kernelName: String(src.kernelName || defaults.kernelName).trim(),
    startupTimeoutMs: normalizeStartupTimeoutMs(src.startupTimeoutMs, defaults.startupTimeoutMs),
    executeTimeoutMs: normalizeExecutionTimeoutMs(src.executeTimeoutMs, defaults.executeTimeoutMs)
  };
}

class NotebookSession {
  constructor(sessionId, options) {
    this.sessionId = sessionId;
    this.options = normalizeSessionOptions(options);
    this.proc = null;
    this.stdoutRl = null;
    this.pending = new Map();
    this.readyPromise = null;
    this._resolveReady = null;
    this._rejectReady = null;
    this.stderrChunks = [];
    this.closed = false;
  }

  async start() {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });

    let helperScriptPath = '';
    try {
      helperScriptPath = ensureExternalHelperScriptPath();
    } catch (err) {
      this._abortAllPending(new Error(`无法准备 Notebook 运行时脚本：${err?.message || String(err)}`));
      return this.readyPromise;
    }

    const args = [helperScriptPath, '--startup-timeout-ms', String(this.options.startupTimeoutMs)];
    if (this.options.kernelName) args.push('--kernel-name', this.options.kernelName);
    if (this.options.cwd) args.push('--cwd', this.options.cwd);

    this.proc = spawn(this.options.pythonPath, args, {
      cwd: this.options.cwd || undefined,
      env: buildPythonChildEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const stderrDecoder = createProcessTextDecoder();

    this.stdoutRl = readline.createInterface({ input: this.proc.stdout });
    this.stdoutRl.on('line', (line) => {
      this._handleStdoutLine(line);
    });

    this.proc.stderr.on('data', (chunk) => {
      const text = normalizeProcessOutputText(stderrDecoder.decode(chunk));
      if (!text) return;
      this.stderrChunks.push(text);
      const joined = this.stderrChunks.join('');
      if (joined.length > 8000) {
        this.stderrChunks = [joined.slice(-8000)];
      }
    });

    this.proc.on('error', (err) => {
      if (String(err?.message || '').includes('ENOENT')) {
        this._abortAllPending(
          new Error(`找不到 Notebook 运行时使用的 Python：${this.options.pythonPath}\n请到设置里检查 Python 路径是否正确。`)
        );
        return;
      }
      this._abortAllPending(err);
    });

    this.proc.on('exit', (code, signal) => {
      const stderrTail = normalizeProcessOutputText(stderrDecoder.end());
      if (stderrTail) this.stderrChunks.push(stderrTail);
      const stderrText = this.stderrChunks.join('').trim();
      const reason = formatProcessExitError(this.options, code, signal, stderrText);
      this._abortAllPending(new Error(reason));
    });

    return this.readyPromise;
  }

  _handleStdoutLine(line) {
    const text = String(line || '').trim();
    if (!text) return;

    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      this._abortAllPending(new Error(`Notebook 运行时返回了无法解析的响应：${text}`));
      return;
    }

    if (payload.event === 'ready') {
      this._resolveReady?.({
        sessionId: this.sessionId,
        kernelName: payload.kernel_name || this.options.kernelName || ''
      });
      this._resolveReady = null;
      this._rejectReady = null;
      return;
    }

    if (payload.event === 'startup_error') {
      this._abortAllPending(new Error(formatStartupError(this.options, payload, this.stderrChunks.join('').trim())));
      return;
    }

    if (payload.event === 'progress') {
      const progressRequestId = String(payload.request_id || '').trim();
      if (!progressRequestId) return;
      const progressPending = this.pending.get(progressRequestId);
      if (!progressPending?.onProgress) return;
      try {
        progressPending.onProgress(payload.result);
      } catch {
        // ignore progress callback failures from the renderer
      }
      return;
    }

    const requestId = String(payload.request_id || '').trim();
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);

    if (payload.ok === false) {
      pending.reject(new Error(String(payload.error || 'Notebook 执行失败')));
      return;
    }

    pending.resolve(payload.result);
  }

  _abortAllPending(err) {
    if (this.closed) return;
    this.closed = true;
    this._rejectReady?.(err);
    this._resolveReady = null;
    this._rejectReady = null;
    this.pending.forEach(({ reject }) => reject(err));
    this.pending.clear();
    try {
      this.stdoutRl?.close?.();
    } catch {
      // ignore
    }
  }

  async sendCommand(command, payload = {}, hooks = {}) {
    await this.start();
    if (!this.proc?.stdin || this.proc.killed) {
      throw new Error('Notebook 运行时未启动');
    }

    const requestId = randomId('req');
    const message = { request_id: requestId, command, payload };
    const onProgress = typeof hooks?.onProgress === 'function' ? hooks.onProgress : null;

    return await new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      try {
        this.proc.stdin.write(`${JSON.stringify(message)}\n`, 'utf-8', (err) => {
          if (!err) return;
          this.pending.delete(requestId);
          reject(err);
        });
      } catch (err) {
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  async executeCell(options = {}) {
    const payload = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    return await this.sendCommand(
      'execute',
      {
        code: buildNotebookMagicWrapper(String(payload.code || '')),
        timeout_ms: normalizeExecutionTimeoutMs(
          payload.timeoutMs ?? payload.timeout_ms,
          this.options.executeTimeoutMs
        )
      },
      {
        onProgress: payload.onProgress
      }
    );
  }

  async provideInputReply(options = {}) {
    const payload = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    return await this.sendCommand('input_reply', {
      input_request_id: String(payload.inputRequestId ?? payload.input_request_id ?? '').trim(),
      value: String(payload.value ?? '')
    });
  }

  async interrupt() {
    return await this.sendCommand('interrupt');
  }

  async restart() {
    return await this.sendCommand('restart', {
      startup_timeout_ms: this.options.startupTimeoutMs
    });
  }

  _destroyProcess() {
    try {
      this.stdoutRl?.close?.();
    } catch {
      // ignore
    }
    this.stdoutRl = null;

    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill();
      } catch {
        // ignore
      }
    }
    this.proc = null;
  }

  async forceShutdown(reason = 'Notebook 会话已被强制终止') {
    if (this.closed) return { ok: true };
    this._abortAllPending(new Error(String(reason || 'Notebook 会话已被强制终止')));
    this._destroyProcess();
    return { ok: true };
  }

  async shutdown() {
    if (this.closed) return { ok: true };
    try {
      await this.sendCommand('shutdown');
    } catch {
      // ignore shutdown errors and continue cleanup
    }

    this.closed = true;
    this._destroyProcess();
    return { ok: true };
  }
}

class NotebookRuntime {
  constructor() {
    this.sessions = new Map();
    this.magicExecutions = new Map();
    this.pythonModuleCache = new Map();
    this.pythonLspHealthCache = new Map();
  }

  detectPython() {
    const pythonPath = detectPythonPath();
    return {
      pythonPath,
      detected: !!pythonPath,
      installCommand: buildInstallCommand(pythonPath || 'python')
    };
  }

  listPythonModules(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);
    const cacheKey = buildRuntimeCacheKey({ pythonPath, workspacePath });
    const cached = this.pythonModuleCache.get(cacheKey);
    if (cached?.result && Date.now() - Number(cached.at || 0) <= PYTHON_MODULE_CACHE_TTL_MS) {
      return cached.result;
    }

    const modules = runPythonJsonScript(pythonPath, PYTHON_MODULE_DISCOVERY_SCRIPT, 20000);
    const result = {
      pythonPath,
      modules: Array.isArray(modules) ? modules : []
    };
    this.pythonModuleCache.set(cacheKey, {
      at: Date.now(),
      result
    });
    return result;
  }

  checkPythonLsp(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);
    const cacheKey = buildRuntimeCacheKey({ pythonPath, workspacePath });
    const cached = this.pythonLspHealthCache.get(cacheKey);
    if (cached?.result && Date.now() - Number(cached.at || 0) <= PYTHON_LSP_HEALTH_CACHE_TTL_MS) {
      return cached.result;
    }

    const result = pythonLsp.checkHealth({
      pythonPath,
      workspacePath
    });
    return Promise.resolve(result).then((resolved) => {
      this.pythonLspHealthCache.set(cacheKey, {
        at: Date.now(),
        result: resolved
      });
      return resolved;
    });
  }

  invalidateCaches(options = {}) {
    const pythonPath = String(options?.pythonPath || '').trim();
    const workspacePath = String(options?.workspacePath || '').trim();
    const matchesScope = (cacheKey = '') => {
      const [cachedPythonPath = '', cachedWorkspacePath = ''] = String(cacheKey || '').split('::');
      if (pythonPath && cachedPythonPath !== pythonPath) return false;
      if (workspacePath && cachedWorkspacePath !== workspacePath) return false;
      return true;
    };

    if (!pythonPath && !workspacePath) {
      this.pythonModuleCache.clear();
      this.pythonLspHealthCache.clear();
      return { ok: true, cleared: 'all' };
    }

    Array.from(this.pythonModuleCache.keys()).forEach((cacheKey) => {
      if (matchesScope(cacheKey)) this.pythonModuleCache.delete(cacheKey);
    });
    Array.from(this.pythonLspHealthCache.keys()).forEach((cacheKey) => {
      if (matchesScope(cacheKey)) this.pythonLspHealthCache.delete(cacheKey);
    });
    return {
      ok: true,
      pythonPath,
      workspacePath
    };
  }

  async getPythonCompletions(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);

    return await pythonLsp.getCompletions({
      pythonPath,
      workspacePath,
      notebookPath: String(options?.notebookPath || '').trim(),
      documentId: String(options?.documentId || '').trim(),
      text: String(options?.text || ''),
      cursorOffset: clampInteger(options?.cursorOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    });
  }

  async getPythonHover(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);

    return await pythonLsp.getHover({
      pythonPath,
      workspacePath,
      notebookPath: String(options?.notebookPath || '').trim(),
      documentId: String(options?.documentId || '').trim(),
      text: String(options?.text || ''),
      cursorOffset: clampInteger(options?.cursorOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    });
  }

  async getPythonDefinition(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);

    return await pythonLsp.getDefinition({
      pythonPath,
      workspacePath,
      notebookPath: String(options?.notebookPath || '').trim(),
      documentId: String(options?.documentId || '').trim(),
      text: String(options?.text || ''),
      cursorOffset: clampInteger(options?.cursorOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    });
  }

  async getPythonSignatureHelp(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const workspacePath = resolveWorkspacePath(options);

    return await pythonLsp.getSignatureHelp({
      pythonPath,
      workspacePath,
      notebookPath: String(options?.notebookPath || '').trim(),
      documentId: String(options?.documentId || '').trim(),
      text: String(options?.text || ''),
      cursorOffset: clampInteger(options?.cursorOffset, 0, 0, Number.MAX_SAFE_INTEGER)
    });
  }

  listManagedVenvs() {
    return listManagedVenvRecords();
  }

  async createManagedVenv(options = {}) {
    const name = normalizeManagedVenvName(options?.name || '');
    const rootPath = getManagedVenvRootPath();
    const envPath = getManagedVenvPathByName(name);
    const pythonPath = getManagedVenvPythonPathByName(name);
    const sourcePythonPath = pickPythonPath(options?.pythonPath || getDefaultRuntimeConfig().pythonPath);
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const executionId = String(options?.executionId || '').trim();
    const executionState = executionId
      ? { id: executionId, proc: null, cancelled: false, abort: null }
      : null;
    const scopedProgress = (payload = {}) => {
      safeInvoke(onProgress, executionId ? { executionId, ...payload } : payload);
    };

    if (executionState) {
      this.magicExecutions.set(executionId, executionState);
    }

    try {
      if (fs.existsSync(pythonPath)) {
        scopedProgress({
          phase: 'warning',
          command: `"${sourcePythonPath}" -m venv "${envPath}"`,
          message: `环境已存在，跳过创建：${name}`
        });
        return {
          ok: true,
          existed: true,
          executionId,
          name,
          rootPath,
          envPath,
          pythonPath,
          sourcePythonPath
        };
      }

      if (fs.existsSync(envPath)) {
        throw new Error(`环境目录已存在但缺少解释器，请检查后重试：${envPath}`);
      }

      fs.mkdirSync(rootPath, { recursive: true });

      const createCommand = `"${sourcePythonPath}" -m venv "${envPath}"`;
      await runProcessWithProgress(sourcePythonPath, ['-m', 'venv', envPath], {
        onProgress: scopedProgress,
        registerProcess: (proc) => {
          if (executionState) executionState.proc = proc;
        },
        registerAbort: (abort) => {
          if (executionState) executionState.abort = abort;
        },
        isCancelled: () => !!executionState?.cancelled,
        displayCommand: createCommand,
        startMessage: `开始创建环境：${name}`,
        successMessage: `环境目录已创建：${envPath}`,
        errorMessage: `创建环境失败：${name}`
      });

      const installCommand = buildInstallCommand(pythonPath);
      await runProcessWithProgress(pythonPath, ['-m', 'pip', 'install', ...PYTHON_DEPENDENCY_PACKAGES], {
        onProgress: scopedProgress,
        registerProcess: (proc) => {
          if (executionState) executionState.proc = proc;
        },
        registerAbort: (abort) => {
          if (executionState) executionState.abort = abort;
        },
        isCancelled: () => !!executionState?.cancelled,
        displayCommand: installCommand,
        startMessage: `正在为环境安装 Notebook 依赖：${name}`,
        successMessage: `环境 ${name} 已就绪。`,
        errorMessage: `环境依赖安装失败：${name}`,
        progressMessage: (text) => normalizeProgressMessage(text)
      });

      this.invalidateCaches({ pythonPath });

      return {
        ok: true,
        executionId,
        name,
        rootPath,
        envPath,
        pythonPath,
        sourcePythonPath
      };
    } finally {
      if (executionState) {
        this.magicExecutions.delete(executionId);
      }
    }
  }

  installDependencies(options = {}) {
    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const args = ['-m', 'pip', 'install', ...PYTHON_DEPENDENCY_PACKAGES];
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const installCommand = buildInstallCommand(pythonPath);
    const executionId = String(options?.executionId || '').trim();
    const executionState = executionId
      ? { id: executionId, proc: null, cancelled: false, abort: null }
      : null;
    const scopedProgress = (payload = {}) => {
      safeInvoke(onProgress, executionId ? { executionId, ...payload } : payload);
    };

    if (executionState) {
      this.magicExecutions.set(executionId, executionState);
    }

    return runProcessWithProgress(pythonPath, args, {
      onProgress: scopedProgress,
      registerProcess: (proc) => {
        if (executionState) executionState.proc = proc;
      },
      registerAbort: (abort) => {
        if (executionState) executionState.abort = abort;
      },
      isCancelled: () => !!executionState?.cancelled,
      displayCommand: installCommand,
      startMessage: '开始安装 Notebook 依赖...',
      successMessage: 'Notebook 依赖安装完成。',
      errorMessage: '依赖安装失败。',
      progressMessage: (text) => normalizeProgressMessage(text)
    }).then((result) => {
      this.invalidateCaches({ pythonPath });
      return {
        ok: true,
        executionId,
        pythonPath,
        stdout: String(result?.stdout || '').trim(),
        stderr: String(result?.stderr || '').trim()
      };
    }).finally(() => {
      if (executionState) {
        this.magicExecutions.delete(executionId);
      }
    });
  }

  async executeMagicSpecs(options = {}) {
    const specs = Array.isArray(options?.specs) ? options.specs.filter(Boolean) : [];
    if (!specs.length) {
      throw new Error('缺少可执行的 Notebook 命令。');
    }

    const pythonPath = pickPythonPath(options?.pythonPath || '');
    const cwd = resolveRuntimeFsPath(options?.cwd, undefined);
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const executionId = randomId('magic');
    const executionState = {
      id: executionId,
      proc: null,
      cancelled: false,
      abort: null
    };
    this.magicExecutions.set(executionId, executionState);

    const scopedProgress = (payload = {}) => {
      safeInvoke(onProgress, {
        executionId,
        ...payload
      });
    };

    try {
      for (const rawSpec of specs) {
        const spec = rawSpec && typeof rawSpec === 'object' ? rawSpec : {};
        if (spec.kind === 'pip') {
          const pipArgs = String(spec.args || '').trim();
          const pipCommand = `"${pythonPath}" -m pip ${pipArgs}`.trim();
          const pipArgList = ['-m', 'pip', ...pipArgs.split(/\s+/).filter(Boolean)];
          await runProcessWithProgress(pythonPath, pipArgList, {
            cwd,
            onProgress: scopedProgress,
            registerProcess: (proc) => {
              executionState.proc = proc;
            },
            registerAbort: (abort) => {
              executionState.abort = abort;
            },
            isCancelled: () => executionState.cancelled,
            partialFlushMs: PROCESS_PARTIAL_FLUSH_MS,
            displayCommand: pipCommand,
            startMessage: `开始执行：%pip ${pipArgs}`.trim(),
            successMessage: '命令执行完成。',
            errorMessage: '命令执行失败。'
          });
          executionState.proc = null;
          continue;
        }

        if (spec.kind === 'shell') {
          const command = String(spec.command || '').trim();
          if (!command) continue;
          await runProcessWithProgress(command, [], {
            cwd,
            shell: true,
            commandLine: command,
            onProgress: scopedProgress,
            registerProcess: (proc) => {
              executionState.proc = proc;
            },
            registerAbort: (abort) => {
              executionState.abort = abort;
            },
            isCancelled: () => executionState.cancelled,
            partialFlushMs: PROCESS_PARTIAL_FLUSH_MS,
            displayCommand: command,
            startMessage: `开始执行：!${command}`,
            successMessage: '命令执行完成。',
            errorMessage: '命令执行失败。'
          });
          executionState.proc = null;
          continue;
        }

        throw new Error(`不支持的 Notebook 命令类型：${String(spec.kind || '')}`);
      }

      this.invalidateCaches({ pythonPath, workspacePath: cwd || '' });
      return {
        ok: true,
        executionId,
        pythonPath
      };
    } finally {
      this.magicExecutions.delete(executionId);
    }
  }

  interruptMagicExecution(executionId) {
    const id = String(executionId || '').trim();
    if (!id) throw new Error('executionId 不能为空');
    const executionState = this.magicExecutions.get(id);
    if (!executionState) return { ok: true, interrupted: false };
    executionState.cancelled = true;
    try {
      executionState.abort?.();
    } catch {
      killProcessTree(executionState.proc);
    }
    executionState.proc = null;
    executionState.abort = null;
    return {
      ok: true,
      interrupted: true,
      executionId: id
    };
  }

  async createSession(options = {}) {
    const sessionId = randomId('session');
    const session = new NotebookSession(sessionId, options);
    this.sessions.set(sessionId, session);
    try {
      const ready = await session.start();
      return { sessionId, ...ready };
    } catch (err) {
      this.sessions.delete(sessionId);
      throw err;
    }
  }

  _getSession(sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) throw new Error('sessionId 不能为空');
    const session = this.sessions.get(id);
    if (!session) throw new Error(`未找到 Notebook 会话：${id}`);
    return session;
  }

  async executeCell(sessionId, options = {}) {
    const session = this._getSession(sessionId);
    return await session.executeCell(options);
  }

  async provideInputReply(sessionId, options = {}) {
    const session = this._getSession(sessionId);
    return await session.provideInputReply(options);
  }

  async interruptSession(sessionId) {
    const session = this._getSession(sessionId);
    return await session.interrupt();
  }

  async restartSession(sessionId) {
    const session = this._getSession(sessionId);
    return await session.restart();
  }

  async forceRestartSession(sessionId, options = {}) {
    const id = String(sessionId || '').trim();
    if (!id) throw new Error('sessionId 不能为空');

    const session = this._getSession(id);
    const nextOptions = { ...session.options };
    const reason = String(options?.reason || 'Notebook 执行已被用户终止（强制重启 Kernel）').trim();

    this.sessions.delete(id);
    await session.forceShutdown(reason);

    const nextSession = new NotebookSession(id, nextOptions);
    this.sessions.set(id, nextSession);
    try {
      const ready = await nextSession.start();
      return {
        sessionId: id,
        forced: true,
        ...ready
      };
    } catch (err) {
      this.sessions.delete(id);
      throw err;
    }
  }

  async shutdownSession(sessionId) {
    const id = String(sessionId || '').trim();
    const session = this._getSession(id);
    this.sessions.delete(id);
    return await session.shutdown();
  }
}

module.exports = Object.assign(new NotebookRuntime(), {
  __testing: {
    buildPythonChildEnv,
    buildNotebookMagicWrapper,
    buildManagedVenvRecord,
    getManagedVenvPathByName,
    getManagedVenvPythonPathByName,
    getManagedVenvRootPath,
    listManagedVenvRecords,
    normalizeExecutionTimeoutMs,
    normalizeStartupTimeoutMs,
    normalizeProcessOutputText,
    normalizeManagedVenvName,
    parseNotebookMagicSpec,
    parseNotebookMagicSpecs,
    resolveRuntimeFsPath,
    resolveWorkspacePath
  }
});
