const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const fileOperations = require('./file-operations');

function clampNonNegativeInteger(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function pathToFileUri(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const pathname = resolved.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:');
  return encodeURI(`file://${pathname}`);
}

function resolveWorkspacePath(workspacePath = '') {
  const raw = String(workspacePath || '').trim();
  if (!raw) return process.cwd();
  if (path.isAbsolute(raw)) return path.resolve(raw);
  try {
    return fileOperations.resolvePath(raw);
  } catch {
    return path.resolve(raw);
  }
}

function offsetToPosition(text, offset) {
  const source = String(text || '');
  const target = clampNonNegativeInteger(offset, source.length);
  let line = 0;
  let character = 0;

  for (let index = 0; index < Math.min(target, source.length); index += 1) {
    const ch = source[index];
    if (ch === '\n') {
      line += 1;
      character = 0;
      continue;
    }
    character += 1;
  }

  return { line, character };
}

function positionToOffset(text, position = {}) {
  const source = String(text || '');
  const targetLine = clampNonNegativeInteger(position.line, 0);
  const targetCharacter = clampNonNegativeInteger(position.character, 0);
  let line = 0;
  let character = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (line === targetLine && character === targetCharacter) return index;
    if (source[index] === '\n') {
      if (line === targetLine) return index;
      line += 1;
      character = 0;
      continue;
    }
    character += 1;
  }

  return source.length;
}

function buildWorkspaceKey(options = {}) {
  const pythonPath = String(options.pythonPath || '').trim() || 'python';
  const workspacePath = resolveWorkspacePath(options.workspacePath);
  return `${pythonPath}::${workspacePath}`;
}

function buildDocumentUri(options = {}) {
  const notebookPath = String(options.notebookPath || '').trim();
  const workspacePath = resolveWorkspacePath(options.workspacePath);
  const notebookName = notebookPath ? path.basename(notebookPath, path.extname(notebookPath)) : 'notebook';
  const rawDocumentId = String(options.documentId || 'cell').trim() || 'cell';
  const safeDocumentId = rawDocumentId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const virtualPath = path.join(workspacePath, '.ai-tools-lsp', `${notebookName}__${safeDocumentId}.py`);
  return pathToFileUri(virtualPath);
}

function normalizeCompletionKind(kind) {
  const mapping = {
    2: 'method',
    3: 'function',
    4: 'class',
    5: 'variable',
    6: 'variable',
    7: 'class',
    8: 'module',
    9: 'property',
    10: 'enum',
    11: 'keyword',
    12: 'snippet',
    13: 'variable',
    14: 'keyword',
    17: 'file',
    18: 'module',
    21: 'constant',
    22: 'snippet'
  };
  return mapping[kind] || 'text';
}

function normalizeInsertText(text) {
  return String(text || '')
    .replace(/\$\{\d+:([^}]+)\}/g, '$1')
    .replace(/\$\d+/g, '');
}

function normalizeHoverContents(contents) {
  const items = Array.isArray(contents) ? contents : [contents];
  const parts = [];

  for (const item of items) {
    if (!item) continue;
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) parts.push(text);
      continue;
    }
    if (typeof item?.value === 'string') {
      const value = item.value.trim();
      if (value) parts.push(value);
      continue;
    }
    if (typeof item?.language === 'string' && typeof item?.value === 'string') {
      const value = item.value.trim();
      if (value) parts.push(`\`\`\`${item.language}\n${value}\n\`\`\``);
    }
  }

  return parts.join('\n\n').trim();
}

function normalizeMarkupContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (typeof content?.value === 'string') return content.value.trim();
  return '';
}

function normalizeDefinitionResult(text, result) {
  const items = Array.isArray(result) ? result : result ? [result] : [];
  const first = items.find(Boolean);
  if (!first) return null;

  const targetUri = String(first.targetUri || first.uri || '').trim();
  const range = first.targetSelectionRange || first.targetRange || first.range;
  const start = range?.start;
  const end = range?.end;
  if (!targetUri || !start || !end) return null;

  return {
    uri: targetUri,
    from: positionToOffset(text, start),
    to: positionToOffset(text, end)
  };
}

function normalizeSignatureHelpResult(result) {
  const signatures = Array.isArray(result?.signatures) ? result.signatures : [];
  const activeSignature = clampNonNegativeInteger(result?.activeSignature, 0);
  const activeParameter = clampNonNegativeInteger(result?.activeParameter, 0);
  const selected = signatures[activeSignature] || signatures[0];
  if (!selected) return null;

  const parameters = Array.isArray(selected.parameters) ? selected.parameters : [];
  return {
    label: String(selected.label || '').trim(),
    documentation: normalizeMarkupContent(selected.documentation),
    activeParameter,
    parameters: parameters.map((item) => ({
      label: typeof item?.label === 'string'
        ? item.label
        : Array.isArray(item?.label)
          ? String(selected.label || '').slice(item.label[0], item.label[1])
          : '',
      documentation: normalizeMarkupContent(item?.documentation)
    }))
  };
}

function resolveJediLanguageServerLaunch(pythonPath) {
  const explicitPythonPath = String(pythonPath || '').trim();
  const isWindows = process.platform === 'win32';
  const commandName = isWindows ? 'jedi-language-server.exe' : 'jedi-language-server';

  if (path.isAbsolute(explicitPythonPath)) {
    const pythonDir = path.dirname(explicitPythonPath);
    const candidates = isWindows
      ? [
          path.join(pythonDir, 'Scripts', commandName),
          path.join(pythonDir, commandName)
        ]
      : [
          path.join(pythonDir, commandName),
          path.join(path.dirname(pythonDir), 'bin', commandName)
        ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return { command: candidate, args: [] };
        }
      } catch {
        // ignore
      }
    }

    return {
      command: explicitPythonPath,
      args: ['-m', 'jedi_language_server.cli']
    };
  }

  return { command: commandName, args: [] };
}

class JsonRpcProcess {
  constructor(options = {}) {
    this.pythonPath = String(options.pythonPath || '').trim() || 'python';
    this.workspacePath = resolveWorkspacePath(options.workspacePath);
    this.launch = resolveJediLanguageServerLaunch(this.pythonPath);
    this.proc = null;
    this.buffer = '';
    this.contentLength = null;
    this.pending = new Map();
    this.documents = new Map();
    this.stderrChunks = [];
    this.requestSeq = 0;
    this.readyPromise = null;
    this.closed = false;
  }

  async start() {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      this.proc = spawn(this.launch.command, this.launch.args, {
        cwd: this.workspacePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.proc.stdout?.setEncoding?.('utf8');
      this.proc.stderr?.setEncoding?.('utf8');

      this.proc.stdout?.on('data', (chunk) => {
        this._handleStdout(String(chunk || ''));
      });

      this.proc.stderr?.on('data', (chunk) => {
        const text = String(chunk || '');
        if (!text) return;
        this.stderrChunks.push(text);
        const merged = this.stderrChunks.join('');
        if (merged.length > 12000) {
          this.stderrChunks = [merged.slice(-12000)];
        }
      });

      this.proc.on('error', (err) => {
        const normalized = this._normalizeProcessError(err);
        reject(normalized);
        this._abortPending(normalized);
      });

      this.proc.on('exit', (code, signal) => {
        const err = this._buildExitError(code, signal);
        reject(err);
        this._abortPending(err);
      });

      this._sendRequestInternal('initialize', {
        processId: process.pid,
        clientInfo: {
          name: 'ai-tools-notebook',
          version: '1.0.0'
        },
        rootUri: pathToFileUri(this.workspacePath),
        workspaceFolders: [
          {
            uri: pathToFileUri(this.workspacePath),
            name: path.basename(this.workspacePath) || 'workspace'
          }
        ],
        capabilities: {
          textDocument: {
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                labelDetailsSupport: true
              }
            },
            hover: {
              contentFormat: ['markdown', 'plaintext']
            },
            definition: {
              linkSupport: true
            },
            signatureHelp: {
              signatureInformation: {
                documentationFormat: ['markdown', 'plaintext'],
                parameterInformation: {
                  labelOffsetSupport: true
                }
              }
            }
          }
        },
        initializationOptions: {}
      }).then(() => {
        this.sendNotification('initialized', {});
        resolve({ ok: true });
      }).catch((err) => {
        reject(err);
        this._abortPending(err);
      });
    });

    this.readyPromise = this.readyPromise.catch((err) => {
      this.readyPromise = null;
      throw err;
    });

    return this.readyPromise;
  }

  _normalizeProcessError(err) {
    if (String(err?.message || '').includes('ENOENT')) {
      return new Error(`找不到 Jedi Language Server 启动命令：${this.launch.command}`);
    }
    return err instanceof Error ? err : new Error(String(err || 'Python 补全服务启动失败'));
  }

  _buildExitError(code, signal) {
    const stderr = this.stderrChunks.join('').trim();
    const detail = stderr ? `\n${stderr}` : '';
    if (
      stderr.includes("No module named 'jedi_language_server'")
      || stderr.includes('No module named jedi_language_server')
    ) {
      return new Error(`当前 Python 环境缺少 jedi-language-server：${this.pythonPath}${detail}`);
    }
    if (stderr.includes('cannot be directly executed') || stderr.includes('No module named jedi_language_server.__main__')) {
      return new Error(`当前 jedi-language-server 启动方式不正确。${detail}`);
    }
    if (signal) {
      return new Error(`Python 补全服务已退出（signal: ${signal}）。${detail}`);
    }
    return new Error(`Python 补全服务已退出（code: ${code}）。${detail}`);
  }

  _abortPending(err) {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach(({ reject }) => reject(err));
    this.pending.clear();
  }

  _handleStdout(chunk) {
    this.buffer += chunk;

    while (true) {
      if (this.contentLength == null) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = this.buffer.slice(0, headerEnd);
        this.buffer = this.buffer.slice(headerEnd + 4);
        const match = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!match) continue;
        this.contentLength = Number(match[1]);
      }

      if (this.buffer.length < this.contentLength) return;
      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = null;

      let message = null;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }

      if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(String(message.error?.message || 'Python 补全请求失败')));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  _writePayload(payload) {
    if (!this.proc?.stdin || this.proc.killed) {
      throw new Error('Python 补全服务不可用');
    }
    const body = JSON.stringify(payload);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    this.proc.stdin.write(header + body, 'utf8');
  }

  _normalizeProcessError(err) {
    if (String(err?.message || '').includes('ENOENT')) {
      return new Error(`找不到 Jedi Language Server 启动命令：${this.launch.command}`);
    }
    return err instanceof Error ? err : new Error(String(err || 'Python 补全服务启动失败'));
  }

  _buildExitError(code, signal) {
    const stderr = this.stderrChunks.join('').trim();
    const detail = stderr ? `\n${stderr}` : '';
    if (
      stderr.includes("No module named 'jedi_language_server'")
      || stderr.includes('No module named jedi_language_server')
    ) {
      return new Error(`当前 Python 环境缺少 jedi-language-server：${this.pythonPath}${detail}`);
    }
    if (
      stderr.includes('cannot be directly executed')
      || stderr.includes('No module named jedi_language_server.__main__')
      || stderr.includes('No module named jedi_language_server.cli')
    ) {
      return new Error(`当前 jedi-language-server 启动方式不正确。${detail}`);
    }
    if (signal) {
      return new Error(`Python 补全服务已退出（signal: ${signal}）。${detail}`);
    }
    return new Error(`Python 补全服务已退出（code: ${code}）。${detail}`);
  }

  _writePayload(payload) {
    if (!this.proc?.stdin || this.proc.killed) {
      throw new Error('Python 补全服务不可用');
    }
    const body = JSON.stringify(payload);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    this.proc.stdin.write(header + body, 'utf8');
  }

  _normalizeProcessError(err) {
    if (String(err?.message || '').includes('ENOENT')) {
      return new Error(`找不到 Jedi Language Server 启动命令：${this.launch.command}`);
    }
    return err instanceof Error ? err : new Error(String(err || 'Python 补全服务启动失败'));
  }

  _buildExitError(code, signal) {
    const stderr = this.stderrChunks.join('').trim();
    const detail = stderr ? `\n${stderr}` : '';
    if (
      stderr.includes("No module named 'jedi_language_server'")
      || stderr.includes('No module named jedi_language_server')
    ) {
      return new Error(`当前 Python 环境缺少 jedi-language-server：${this.pythonPath}${detail}`);
    }
    if (
      stderr.includes('cannot be directly executed')
      || stderr.includes('No module named jedi_language_server.__main__')
      || stderr.includes('No module named jedi_language_server.cli')
    ) {
      return new Error(`当前 jedi-language-server 启动方式不正确。${detail}`);
    }
    if (signal) {
      return new Error(`Python 补全服务已退出（signal: ${signal}）。${detail}`);
    }
    return new Error(`Python 补全服务已退出（code: ${code}）。${detail}`);
  }

  _writePayload(payload) {
    if (!this.proc?.stdin || this.proc.killed) {
      throw new Error('Python 补全服务不可用');
    }
    const body = JSON.stringify(payload);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
    this.proc.stdin.write(header + body, 'utf8');
  }

  _sendRequestInternal(method, params = {}) {
    const id = `${Date.now()}_${++this.requestSeq}`;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this._writePayload({
          jsonrpc: '2.0',
          id,
          method,
          params
        });
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async sendRequest(method, params = {}) {
    await this.start();
    return await this._sendRequestInternal(method, params);
  }

  sendNotification(method, params = {}) {
    this._writePayload({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  async syncDocument(options = {}) {
    await this.start();

    const uri = String(options.uri || '').trim();
    const text = String(options.text || '');
    const current = this.documents.get(uri);

    if (!current) {
      this.documents.set(uri, {
        version: 1,
        text
      });
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'python',
          version: 1,
          text
        }
      });
      return { version: 1, text };
    }

    if (current.text === text) return current;

    const next = {
      version: current.version + 1,
      text
    };
    this.documents.set(uri, next);
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version: next.version
      },
      contentChanges: [
        {
          text
        }
      ]
    });
    return next;
  }

  async complete(options = {}) {
    const uri = String(options.uri || '').trim();
    const text = String(options.text || '');
    const cursorOffset = clampNonNegativeInteger(options.cursorOffset, text.length);
    await this.syncDocument({ uri, text });

    const position = offsetToPosition(text, cursorOffset);
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
      context: {
        triggerKind: 1
      }
    });

    const items = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
    return {
      items: items.map((item) => {
        const startPosition = item?.textEdit?.range?.start;
        const endPosition = item?.textEdit?.range?.end;
        const replaceFromOffset = startPosition ? positionToOffset(text, startPosition) : cursorOffset;
        const replaceToOffset = endPosition ? positionToOffset(text, endPosition) : cursorOffset;
        const applyText = normalizeInsertText(
          item?.textEdit?.newText
          || item?.insertText
          || item?.labelDetails?.detail
          || item?.label
        );

        return {
          label: String(item?.label || applyText || ''),
          detail: String(item?.detail || item?.labelDetails?.detail || '').trim(),
          type: normalizeCompletionKind(item?.kind),
          applyText,
          replaceFromOffset,
          replaceToOffset,
          sortText: String(item?.sortText || ''),
          filterText: String(item?.filterText || ''),
          documentation: typeof item?.documentation === 'string'
            ? item.documentation
            : String(item?.documentation?.value || '').trim()
        };
      })
    };
  }

  async hover(options = {}) {
    const uri = String(options.uri || '').trim();
    const text = String(options.text || '');
    const cursorOffset = clampNonNegativeInteger(options.cursorOffset, text.length);
    await this.syncDocument({ uri, text });

    const position = offsetToPosition(text, cursorOffset);
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position
    });

    const contents = normalizeHoverContents(result?.contents);
    const startPosition = result?.range?.start;
    const endPosition = result?.range?.end;
    return {
      contents,
      range: startPosition && endPosition
        ? {
            from: positionToOffset(text, startPosition),
            to: positionToOffset(text, endPosition)
          }
        : null
    };
  }

  async definition(options = {}) {
    const uri = String(options.uri || '').trim();
    const text = String(options.text || '');
    const cursorOffset = clampNonNegativeInteger(options.cursorOffset, text.length);
    await this.syncDocument({ uri, text });

    const position = offsetToPosition(text, cursorOffset);
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position
    });

    return normalizeDefinitionResult(text, result);
  }

  async signatureHelp(options = {}) {
    const uri = String(options.uri || '').trim();
    const text = String(options.text || '');
    const cursorOffset = clampNonNegativeInteger(options.cursorOffset, text.length);
    await this.syncDocument({ uri, text });

    const position = offsetToPosition(text, cursorOffset);
    const result = await this.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position
    });

    return normalizeSignatureHelpResult(result);
  }

  async shutdown() {
    if (this.closed) return;
    this.closed = true;
    try {
      await this._sendRequestInternal('shutdown', {});
    } catch {
      // ignore
    }
    try {
      this.sendNotification('exit', {});
    } catch {
      // ignore
    }
    try {
      this.proc?.kill?.();
    } catch {
      // ignore
    }
  }
}

class PythonLspManager {
  constructor() {
    this.instances = new Map();
  }

  _getInstance(options = {}) {
    const key = buildWorkspaceKey(options);
    let instance = this.instances.get(key);
    if (!instance || instance.closed) {
      instance = new JsonRpcProcess(options);
      this.instances.set(key, instance);
    }
    return instance;
  }

  async getCompletions(options = {}) {
    const workspacePath = resolveWorkspacePath(options.workspacePath);
    const instance = this._getInstance({
      pythonPath: options.pythonPath,
      workspacePath
    });
    const uri = buildDocumentUri({
      workspacePath,
      notebookPath: options.notebookPath,
      documentId: options.documentId
    });

    return await instance.complete({
      uri,
      text: options.text,
      cursorOffset: options.cursorOffset
    });
  }

  async getHover(options = {}) {
    const workspacePath = resolveWorkspacePath(options.workspacePath);
    const instance = this._getInstance({
      pythonPath: options.pythonPath,
      workspacePath
    });
    const uri = buildDocumentUri({
      workspacePath,
      notebookPath: options.notebookPath,
      documentId: options.documentId
    });

    return await instance.hover({
      uri,
      text: options.text,
      cursorOffset: options.cursorOffset
    });
  }

  async getDefinition(options = {}) {
    const workspacePath = resolveWorkspacePath(options.workspacePath);
    const instance = this._getInstance({
      pythonPath: options.pythonPath,
      workspacePath
    });
    const uri = buildDocumentUri({
      workspacePath,
      notebookPath: options.notebookPath,
      documentId: options.documentId
    });

    return await instance.definition({
      uri,
      text: options.text,
      cursorOffset: options.cursorOffset
    });
  }

  async getSignatureHelp(options = {}) {
    const workspacePath = resolveWorkspacePath(options.workspacePath);
    const instance = this._getInstance({
      pythonPath: options.pythonPath,
      workspacePath
    });
    const uri = buildDocumentUri({
      workspacePath,
      notebookPath: options.notebookPath,
      documentId: options.documentId
    });

    return await instance.signatureHelp({
      uri,
      text: options.text,
      cursorOffset: options.cursorOffset
    });
  }

  async checkHealth(options = {}) {
    const workspacePath = resolveWorkspacePath(options.workspacePath);
    const probe = new JsonRpcProcess({
      pythonPath: options.pythonPath,
      workspacePath
    });

    try {
      await probe.start();
      return {
        ok: true,
        pythonPath: String(options.pythonPath || '').trim() || 'python',
        error: ''
      };
    } catch (err) {
      return {
        ok: false,
        pythonPath: String(options.pythonPath || '').trim() || 'python',
        error: String(err?.message || err || '').trim()
      };
    } finally {
      await probe.shutdown().catch(() => {});
    }
  }

  async shutdownAll() {
    await Promise.allSettled(Array.from(this.instances.values()).map((instance) => instance.shutdown()));
    this.instances.clear();
  }
}

JsonRpcProcess.prototype._normalizeProcessError = function _normalizeProcessError(err) {
  if (String(err?.message || '').includes('ENOENT')) {
    return new Error(`找不到 Jedi Language Server 启动命令：${this.launch.command}`);
  }
  return err instanceof Error ? err : new Error(String(err || 'Python 补全服务启动失败'));
};

JsonRpcProcess.prototype._buildExitError = function _buildExitError(code, signal) {
  const stderr = this.stderrChunks.join('').trim();
  const detail = stderr ? `\n${stderr}` : '';
  if (
    stderr.includes("No module named 'jedi_language_server'")
    || stderr.includes('No module named jedi_language_server')
  ) {
    return new Error(`当前 Python 环境缺少 jedi-language-server：${this.pythonPath}${detail}`);
  }
  if (
    stderr.includes('cannot be directly executed')
    || stderr.includes('No module named jedi_language_server.__main__')
    || stderr.includes('No module named jedi_language_server.cli')
  ) {
    return new Error(`当前 jedi-language-server 启动方式不正确。${detail}`);
  }
  if (signal) {
    return new Error(`Python 补全服务已退出（signal: ${signal}）。${detail}`);
  }
  return new Error(`Python 补全服务已退出（code: ${code}）。${detail}`);
};

JsonRpcProcess.prototype._handleStdout = function _handleStdout(chunk) {
  this.buffer += chunk;

  while (true) {
    if (this.contentLength == null) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const headerText = this.buffer.slice(0, headerEnd);
      this.buffer = this.buffer.slice(headerEnd + 4);
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) continue;
      this.contentLength = Number(match[1]);
    }

    if (this.buffer.length < this.contentLength) return;
    const body = this.buffer.slice(0, this.contentLength);
    this.buffer = this.buffer.slice(this.contentLength);
    this.contentLength = null;

    let message = null;
    try {
      message = JSON.parse(body);
    } catch {
      continue;
    }

    if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(String(message.error?.message || 'Python 补全请求失败')));
      } else {
        pending.resolve(message.result);
      }
    }
  }
};

JsonRpcProcess.prototype._writePayload = function _writePayload(payload) {
  if (!this.proc?.stdin || this.proc.killed) {
    throw new Error('Python 补全服务不可用');
  }
  const body = JSON.stringify(payload);
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
  this.proc.stdin.write(header + body, 'utf8');
};

const manager = new PythonLspManager();

process.on('exit', () => {
  manager.shutdownAll().catch(() => {});
});

manager.__testing = {
  resolveJediLanguageServerLaunch,
  resolveWorkspacePath
};

module.exports = manager;
