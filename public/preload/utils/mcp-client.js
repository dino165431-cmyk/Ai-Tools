const { spawn } = require('child_process');

const DEFAULT_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  // legacy / non-standard
  '0.1.0'
];

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((v) => {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeStringKeyedObject(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([key, value]) => {
    const nextKey = cleanString(key);
    if (!nextKey) return;
    out[nextKey] = String(value ?? '');
  });
  return out;
}

function normalizePositiveInteger(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function normalizeHttpMethod(method, fallback = 'POST') {
  const normalized = cleanString(method).toUpperCase();
  if (!normalized) return fallback;
  return normalized;
}

function resolveUrl(baseUrl, nextUrl) {
  const target = cleanString(nextUrl);
  if (!target) return '';
  try {
    return new URL(target, cleanString(baseUrl) || undefined).toString();
  } catch {
    return target;
  }
}

function resolveLegacySseEndpointPayload(rawData, baseUrl) {
  const raw = cleanString(rawData);
  if (!raw) return '';

  let candidate = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') candidate = parsed;
    else if (parsed && typeof parsed === 'object') {
      candidate = cleanString(parsed.endpoint || parsed.url || parsed.uri || parsed.href || '');
    }
  } catch {
    // treat as plain string
  }

  return resolveUrl(baseUrl, candidate);
}

function mergeHeaders(...headerSets) {
  const out = {};
  headerSets.forEach((headers) => {
    Object.entries(normalizeStringKeyedObject(headers)).forEach(([key, value]) => {
      out[key] = value;
    });
  });
  return out;
}

function getHeader(headers, name) {
  if (!headers?.get) return '';
  return String(
    headers.get(name) ||
      headers.get(String(name || '').toLowerCase()) ||
      headers.get(String(name || '').toUpperCase()) ||
      ''
  ).trim();
}

async function buildHttpErrorFromResponse(response) {
  const status = Number(response?.status) || 0;
  const bodyText = cleanString(await readResponseText(response).catch(() => ''));
  return new Error(bodyText ? `HTTP error ${status}: ${bodyText}` : `HTTP error ${status}`);
}

function createReadableStreamReader(response) {
  const body = response?.body;
  if (!body?.getReader) return null;
  return body.getReader();
}

async function readResponseText(response) {
  if (typeof response?.text === 'function') return response.text();

  const reader = createReadableStreamReader(response);
  if (!reader) return '';

  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function createEventStreamAccumulator(onEvent) {
  let buffer = '';
  let eventName = '';
  let eventId = '';
  let dataLines = [];

  const dispatch = () => {
    if (!eventName && !eventId && dataLines.length === 0) return;
    onEvent({
      event: eventName || 'message',
      id: eventId || '',
      data: dataLines.join('\n')
    });
    eventName = '';
    eventId = '';
    dataLines = [];
  };

  const handleLine = (line) => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return;

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        eventName = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        eventId = value;
        break;
      default:
        break;
    }
  };

  return {
    push(chunk, flush = false) {
      buffer += String(chunk || '').replace(/\r\n/g, '\n');

      let newlineIndex = -1;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }

      if (!flush) return;
      if (buffer) {
        handleLine(buffer);
        buffer = '';
      }
      dispatch();
    }
  };
}

async function readJsonRpcEventStreamResponse(response, request, options = {}) {
  const reader = createReadableStreamReader(response);
  if (!reader) {
    const fallbackText = await readResponseText(response);
    const fallbackResult = tryExtractJsonRpcResponseFromText(fallbackText, request?.id);
    if (fallbackResult !== null) return fallbackResult;
    if (options.allowMissingMatch) return null;
    throw new Error('Event stream response body is not readable');
  }

  const decoder = new TextDecoder();
  const rawChunks = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      try { reader.cancel?.(); } catch {}
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      try { reader.cancel?.(); } catch {}
      reject(error);
    };

    const accumulator = createEventStreamAccumulator((event) => {
      const payloadText = String(event?.data || '').trim();
      if (!payloadText) return;

      try {
        const payload = JSON.parse(payloadText);
        const isMatchingResponse = payload && typeof payload === 'object' && payload.id === request?.id;
        if (isMatchingResponse && payload?.error) {
          finishReject(createRpcError(payload.error));
          return;
        }

        if (payload && typeof payload === 'object' && payload.id === request?.id) {
          finishResolve(unwrapJsonRpcResponse(payload));
          return;
        }

        if (payload?.jsonrpc === '2.0' && payload.id === request?.id) {
          finishResolve(unwrapJsonRpcResponse(payload));
          return;
        }

        try {
          options.logger?.log?.('[MCP] Ignored event-stream event:', event?.event || 'message');
        } catch {
          // ignore
        }
      } catch (err) {
        try {
          options.logger?.warn?.('[MCP] Failed to parse event-stream payload:', err?.message || err);
        } catch {
          // ignore
        }
      }
    });

    const pump = () => {
      reader
        .read()
        .then(({ done, value }) => {
          if (settled) return;

          if (done) {
            accumulator.push('', true);
            const fallbackText = rawChunks.join('');
            const fallbackResult = tryExtractJsonRpcResponseFromText(fallbackText, request?.id);
            if (fallbackResult !== null) {
              finishResolve(fallbackResult);
              return;
            }
            if (options.allowMissingMatch) {
              finishResolve(null);
              return;
            }
            finishReject(new Error('Stream ended before receiving a matching JSON-RPC response'));
            return;
          }

          const chunkText = decoder.decode(value, { stream: true });
          rawChunks.push(chunkText);
          accumulator.push(chunkText);
          pump();
        })
        .catch(finishReject);
    };

    pump();
  });
}

async function readJsonRpcResponseBody(response, request, options = {}) {
  const contentType = cleanString(getHeader(response?.headers, 'content-type')).toLowerCase();
  if (contentType.startsWith('text/event-stream')) {
    return readJsonRpcEventStreamResponse(response, request, options);
  }

  const payloadText = await readResponseText(response);
  if (!cleanString(payloadText)) return null;

  const payload = tryExtractJsonRpcResponseFromText(payloadText, request?.id);
  if (payload !== null) return payload;
  return unwrapJsonRpcResponse(JSON.parse(payloadText));
}

function tryExtractJsonRpcResponseFromText(text, requestId) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [];
  candidates.push(raw);
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => candidates.push(line));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && parsed.id === requestId) {
        return unwrapJsonRpcResponse(parsed);
      }
      if (parsed && typeof parsed === 'object' && parsed.jsonrpc === '2.0' && parsed.id === requestId) {
        return unwrapJsonRpcResponse(parsed);
      }
    } catch {
      // keep trying
    }
  }

  return null;
}

function buildMcpHttpHeaders(config, options = {}) {
  const accept = cleanString(options.accept);
  const contentType = cleanString(options.contentType);
  const protocolVersion = cleanString(options.protocolVersion);
  const sessionId = cleanString(options.sessionId);

  const headers = mergeHeaders(config?.headers, options.extraHeaders);
  if (accept) headers.Accept = accept;
  if (contentType) headers['Content-Type'] = contentType;
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
  if (sessionId) headers['MCP-Session-Id'] = sessionId;
  return headers;
}

function createRpcError(error) {
  const message = (error && typeof error === 'object' && error.message)
    ? String(error.message)
    : 'RPC Error';
  const err = new Error(message);
  if (error && typeof error === 'object') {
    err.code = error.code;
    err.data = error.data;
    err.rpcError = error;
  }
  return err;
}

function extractListItems(response, key) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  const direct = response?.[key];
  if (Array.isArray(direct)) return direct;
  const nested = response?.result?.[key];
  if (Array.isArray(nested)) return nested;
  return [];
}

function normalizePromptArguments(args) {
  if (args === undefined || args === null) return undefined;
  if (args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0) return undefined;
  return args;
}

function unwrapJsonRpcResponse(maybeResponse) {
  if (!maybeResponse || typeof maybeResponse !== 'object') return maybeResponse;
  if (maybeResponse.jsonrpc !== '2.0') return maybeResponse;
  if ('error' in maybeResponse && maybeResponse.error) throw createRpcError(maybeResponse.error);
  if ('result' in maybeResponse) return maybeResponse.result;
  return maybeResponse;
}
function getEventSourceCtor() {
  if (typeof globalThis?.EventSource === 'function') return globalThis.EventSource;
  try {
    // Optional dependency for Node-only runtimes.
    const mod = require('eventsource');
    return mod?.EventSource || mod;
  } catch {
    return null;
  }
}

// 基础客户端类
class BaseMCPClient {
  constructor(config) {
    this.config = config;
    this.requestId = 1;
    this.serverInfo = null;
    this.protocolVersion = null;
    this._initPromise = null;
    this.initialized = false;          // 标记是否已完成初始化
    this.serverCapabilities = null;    // 存储服务器能力信息
    this.logger = config.logger || console; // 允许自定义日志
  }

  // 自动初始化（在第一次发送请求前调用）
  async ensureInitialized() {
    if (this.initialized) return;
    await this.initialize();
  }

  // 发送 initialize 请求
  async initialize() {
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const versions = uniqueStrings([
        this.config?.protocolVersion,
        ...DEFAULT_PROTOCOL_VERSIONS
      ]);

      const queue = [...versions];
      const tried = new Set();
      let lastErr = null;

      while (queue.length) {
        const version = String(queue.shift() || '').trim();
        if (!version || tried.has(version)) continue;
        tried.add(version);

        try {
          const response = await this.sendRequest('initialize', {
            protocolVersion: version,
            // 按 MCP 规范，这里应为 “client capabilities”。我们当前不声明任何特性，保持最小兼容集。
            capabilities: {},
            clientInfo: {
              name: 'mcp-client',
              version: '1.0.0'
            }
          });

          this.protocolVersion = (response && typeof response.protocolVersion === 'string')
            ? response.protocolVersion
            : version;
          this.serverCapabilities = response?.capabilities || null;
          this.serverInfo = response?.serverInfo || null;
          this.initialized = true;

          // MCP 规范要求：initialize 成功后，客户端必须发送 notifications/initialized
          try {
            await this.sendNotification('notifications/initialized', {});
          } catch (e) {
            try { this.logger.warn?.('[MCP] notifications/initialized failed:', e?.message || e); } catch {}
          }

          this.logger.log('[MCP] Initialized, protocol:', this.protocolVersion, 'server capabilities:', this.serverCapabilities);
          return;
        } catch (err) {
          lastErr = err;

          // 如果服务端按规范返回 supported versions，则优先尝试
          const supported = err?.data?.supported;
          if (Array.isArray(supported) && supported.length) {
            const supportedList = uniqueStrings(supported);
            for (let i = supportedList.length - 1; i >= 0; i--) {
              const v = supportedList[i];
              if (!tried.has(v)) queue.unshift(v);
            }
          }

          // 某些实现要求 initialize 必须是连接上的第一条消息；失败后重置连接再试更稳妥
          try { this.close(); } catch {}
          this.requestId = 1;
          this.initialized = false;
          this.serverCapabilities = null;
          this.serverInfo = null;
          this.protocolVersion = null;
        }
      }

      throw lastErr || new Error('MCP initialize failed');
    })();

    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async sendRequest(method, params) {
    // 除 initialize 外，其他请求需等待初始化完成
    if (method !== 'initialize' && !this.initialized) {
      await this.initialize();
    }
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {}
    };
    return this._send(request);
  }

  async sendNotification(method, params) {
    if (method !== 'notifications/initialized' && !this.initialized) {
      await this.initialize();
    }
    const notification = {
      jsonrpc: '2.0',
      method,
      params: params || {}
    };
    if (typeof this._sendNotification !== 'function') {
      throw new Error('Notification transport not implemented');
    }
    return this._sendNotification(notification);
  }

  async listTools() {
    const response = await this.sendRequest('tools/list');
    return extractListItems(response, 'tools');
  }

  async callTool(toolName, args) {
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    return response;
  }

  async listPrompts() {
    const response = await this.sendRequest('prompts/list');
    return extractListItems(response, 'prompts');
  }

  async getPrompt(promptName, args) {
    const params = { name: promptName };
    const normalizedArgs = normalizePromptArguments(args);
    if (normalizedArgs !== undefined) {
      params.arguments = normalizedArgs;
    }
    const response = await this.sendRequest('prompts/get', params);
    return response;
  }

  async listResources() {
    const response = await this.sendRequest('resources/list');
    return extractListItems(response, 'resources');
  }

  async readResource(uri) {
    const response = await this.sendRequest('resources/read', { uri });
    return response;
  }

  close() {}
}

// -------------------- Stdio 客户端 --------------------
class StdioClient extends BaseMCPClient {
  constructor(config) {
    super(config);
    this.proc = null;
    this.pending = new Map(); // id -> { resolve, reject, timeout }
    this.buffer = '';
    this.timeoutMs = config.timeout || 30000; // 默认30秒超时
  }

  async _ensureProcess() {
    if (this.proc) return;
    const { command, args = [], env = {}, cwd } = this.config;

    const envVars = { ...process.env, ...env };

    this.proc = spawn(command, args, {
      env: envVars,
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this._processBuffer();
    });

    this.proc.stderr.on('data', (data) => {
      this.logger.error('[MCP Stdio]', data.toString());
    });

    this.proc.on('error', (err) => {
      this._rejectAll(err);
      this.proc = null;
    });

    this.proc.on('exit', (code) => {
      if (code !== 0 && this.pending.size > 0) {
        this._rejectAll(new Error(`Process exited with code ${code}`));
      }
      this.proc = null;
    });
  }

  _processBuffer() {
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const response = JSON.parse(line);
          this._handleResponse(response);
        } catch (e) {
          this.logger.error('Failed to parse JSON:', line);
        }
      }
    }
  }

  _handleResponse(response) {
    const { id, result, error } = response;
    if (id === undefined) return;
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      if (error) {
        pending.reject(createRpcError(error));
      } else {
        pending.resolve(result);
      }
    }
  }

  _rejectAll(error) {
    for (const [id, { reject, timeout }] of this.pending.entries()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pending.clear();
  }

  async _send(request) {
    await this._ensureProcess();

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.pending.has(request.id)) {
          this.pending.delete(request.id);
          reject(new Error(`Request timeout (${this.timeoutMs}ms)`));
        }
      }, this.timeoutMs);

      this.pending.set(request.id, { resolve, reject, timeout });
      this.proc.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async _sendNotification(notification) {
    await this._ensureProcess();
    this.proc.stdin.write(JSON.stringify(notification) + '\n');
  }

  close() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this._rejectAll(new Error('Client closed'));
  }
}

// -------------------- HTTP 客户端基类（处理超时与通用逻辑）--------------------
class BaseHTTPClient extends BaseMCPClient {
  constructor(config) {
    super(config);
    this.timeoutMs = normalizePositiveInteger(config.timeout, 30000);
    this.sessionId = cleanString(config.sessionId);
    this._warnedUnexpectedMethod = false;
  }

  // 抽象方法：子类需实现具体的发送逻辑
  async _performRequest(request) {
    throw new Error('_performRequest must be implemented');
  }

  _getRequestMethod() {
    const configured = normalizeHttpMethod(this.config?.method, 'POST');
    if (configured !== 'POST' && !this._warnedUnexpectedMethod) {
      this._warnedUnexpectedMethod = true;
      try {
        this.logger.warn?.(`[MCP] ${this.config?.transportType || 'http'} currently sends JSON-RPC requests with POST. Ignoring configured method: ${configured}`);
      } catch {
        // ignore
      }
    }
    return 'POST';
  }

  _buildHeaders(options = {}) {
    return buildMcpHttpHeaders(this.config, {
      ...options,
      protocolVersion: options.includeProtocolVersion === false ? '' : this.protocolVersion,
      sessionId: options.includeSessionId === false ? '' : this.sessionId
    });
  }

  _applyResponseMetadata(response) {
    const sessionId = getHeader(response?.headers, 'mcp-session-id');
    if (sessionId) this.sessionId = sessionId;
  }

  async _buildHttpError(response) {
    return buildHttpErrorFromResponse(response);
  }

  async _send(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const result = await this._performRequest(request, controller.signal);
      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout (${this.timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _sendNotification(notification) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { url } = this.config;
      const response = await fetch(url, {
        method: this._getRequestMethod(),
        headers: this._buildHeaders({
          accept: 'application/json, text/event-stream',
          contentType: 'application/json'
        }),
        body: JSON.stringify(notification),
        signal: controller.signal
      });
      this._applyResponseMetadata(response);

      // 对于通知，服务端通常返回 202 Accepted（也可能是 200/204）
      if (!response.ok && response.status !== 202 && response.status !== 204) {
        throw await this._buildHttpError(response);
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`Request timeout (${this.timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  close() {
    const url = cleanString(this.config?.url);
    const sessionId = cleanString(this.sessionId);
    if (!url || !sessionId || cleanString(this.config?.transportType) !== 'streamableHttp') return;

    fetch(url, {
      method: 'DELETE',
      headers: this._buildHeaders({
        accept: 'application/json',
        includeSessionId: true,
        includeProtocolVersion: true
      })
    }).catch(() => {
      // ignore close failures
    });
  }
}

// -------------------- 简单 HTTP 客户端（适用于标准 JSON-RPC over HTTP）--------------------
class SimpleHTTPClient extends BaseHTTPClient {
  async _performRequest(request, signal) {
    const { url } = this.config;
    const response = await fetch(url, {
      method: this._getRequestMethod(),
      headers: this._buildHeaders({
        accept: 'application/json, text/event-stream',
        contentType: 'application/json',
        includeProtocolVersion: request?.method === 'initialize' ? false : true,
        includeSessionId: request?.method === 'initialize' ? false : true
      }),
      body: JSON.stringify(request),
      signal
    });
    this._applyResponseMetadata(response);

    if (!response.ok) {
      throw await this._buildHttpError(response);
    }

    const payloadText = await readResponseText(response);
    const payload = tryExtractJsonRpcResponseFromText(payloadText, request?.id);
    if (payload !== null) return payload;
    return unwrapJsonRpcResponse(JSON.parse(payloadText));
  }
}

// -------------------- SSE 客户端（基于 EventSource）--------------------
class SSEClient extends BaseMCPClient {
  constructor(config) {
    super(config);
    this.sseUrl = cleanString(config.url);          // SSE 连接地址
    this.postUrl = resolveUrl(config.url, config.postUrl);      // 发送请求的 HTTP 地址（通常由 SSE 事件提供）
    this.eventSource = null;
    this.pending = new Map();
    this.connected = false;
    this.timeoutMs = normalizePositiveInteger(config.timeout, 30000);
    this.connectTimeoutMs = normalizePositiveInteger(config.maxTotalTimeout, this.timeoutMs);
    this._connectPromise = null;
    this.sessionId = cleanString(config.sessionId);
  }

  _buildHeaders(options = {}) {
    return buildMcpHttpHeaders(this.config, {
      ...options,
      protocolVersion: options.includeProtocolVersion === false ? '' : this.protocolVersion,
      sessionId: options.includeSessionId === false ? '' : this.sessionId
    });
  }

  _applyResponseMetadata(response) {
    const sessionId = getHeader(response?.headers, 'mcp-session-id');
    if (sessionId) this.sessionId = sessionId;
  }

  _resolvePending(id, result) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    clearTimeout(pending.timeout);
    pending.resolve(result);
    return true;
  }

  _rejectPending(id, error) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    clearTimeout(pending.timeout);
    try {
      pending.abortController?.abort?.();
    } catch {
      // ignore
    }
    pending.reject(error);
    return true;
  }

  async _ensureConnection() {
    if (this.eventSource && this.connected && this.postUrl) return;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = new Promise((resolve, reject) => {
      const EventSourceCtor = getEventSourceCtor();
      if (!EventSourceCtor) {
        reject(new Error('SSE transport requires EventSource. Use streamableHttp/http or install \"eventsource\".'));
        return;
      }

      let settled = false;
      let timeoutId = null;
      const finishResolve = () => {
        if (settled || !this.postUrl) return;
        settled = true;
        this.connected = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      };
      const tryApplyEndpoint = (data) => {
        const nextPostUrl = resolveLegacySseEndpointPayload(data, this.sseUrl);
        if (!nextPostUrl) return false;
        this.postUrl = nextPostUrl;
        finishResolve();
        return true;
      };

      const extraHeaders = normalizeStringKeyedObject(this.config?.headers);
      const eventSourceFetch = (url, init = {}) => {
        return fetch(url, {
          ...init,
          headers: mergeHeaders(
            this._buildHeaders({
              accept: 'text/event-stream',
              contentType: '',
              includeProtocolVersion: true,
              includeSessionId: true
            }),
            init.headers,
            extraHeaders
          )
        });
      };

      this.eventSource = new EventSourceCtor(this.sseUrl, { fetch: eventSourceFetch });

      if (this.connectTimeoutMs > 0) {
        timeoutId = setTimeout(() => {
          finishReject(new Error(`SSE connection timeout (${this.connectTimeoutMs}ms)`));
          this.close();
        }, this.connectTimeoutMs);
      }

      this.eventSource.addEventListener('open', () => {
        if (!this.postUrl && this.config?.pingOnConnect) {
          this.postUrl = this.sseUrl;
        }
        if (this.postUrl) finishResolve();
      });

      // 监听 session 建立事件（MCP 通常通过 'endpoint' 或 'session' 事件告知 POST URL）
      this.eventSource.addEventListener('endpoint', (event) => {
        tryApplyEndpoint(event?.data);
      });
      this.eventSource.addEventListener('session', (event) => {
        tryApplyEndpoint(event?.data);
      });

      // 处理普通消息（可能是响应或通知）
      this.eventSource.onmessage = (event) => {
        try {
          if (!this.postUrl && tryApplyEndpoint(event?.data)) return;
          const response = JSON.parse(event.data);
          this._handleResponse(response);
        } catch (e) {
          this.logger.error('Failed to parse SSE message:', event.data);
        }
      };

      this.eventSource.onerror = (err) => {
        this.logger.error('SSE error:', err);
        this._rejectAll(new Error('SSE connection failed'));
        this.close();
        finishReject(err instanceof Error ? err : new Error('SSE connection failed'));
      };
    });

    try {
      await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  _handleResponse(response) {
    const { id, result, error } = response;
    if (id === undefined) {
      // 通知消息，可以交给用户处理
      this.logger.log('Received notification:', response);
      return;
    }
    if (error) {
      this._rejectPending(id, createRpcError(error));
      return;
    }
    this._resolvePending(id, result);
  }

  _rejectAll(error) {
    for (const [id, { reject, timeout }] of this.pending.entries()) {
      clearTimeout(timeout);
      try {
        this.pending.get(id)?.abortController?.abort?.();
      } catch {
        // ignore
      }
      reject(error);
    }
    this.pending.clear();
  }

  async _send(request) {
    await this._ensureConnection();

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        this._rejectPending(request.id, new Error(`Request timeout (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      this.pending.set(request.id, { resolve, reject, timeout, abortController });

      // 通过 HTTP POST 发送请求到指定的 endpoint
      fetch(this.postUrl, {
        method: 'POST',
        headers: this._buildHeaders({
          accept: 'application/json, text/event-stream',
          contentType: 'application/json',
          includeProtocolVersion: request?.method === 'initialize' ? false : true,
          includeSessionId: request?.method === 'initialize' ? false : true
        }),
        body: JSON.stringify(request),
        signal: abortController.signal
      })
        .then(async (response) => {
          this._applyResponseMetadata(response);

          if (!response.ok && response.status !== 202 && response.status !== 204) {
            this._rejectPending(request.id, await buildHttpErrorFromResponse(response));
            return;
          }

          const immediateResult = await readJsonRpcResponseBody(response, request, {
            logger: this.logger,
            allowMissingMatch: true
          }).catch((err) => {
            this._rejectPending(request.id, err);
            return undefined;
          });

          if (immediateResult === undefined || immediateResult === null) return;
          this._resolvePending(request.id, immediateResult);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          this._rejectPending(request.id, err);
        });
    });
  }

  async _sendNotification(notification) {
    await this._ensureConnection();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.postUrl, {
        method: 'POST',
        headers: this._buildHeaders({
          accept: 'application/json, text/event-stream',
          contentType: 'application/json',
          includeProtocolVersion: notification?.method === 'notifications/initialized' ? true : true,
          includeSessionId: notification?.method === 'notifications/initialized' ? true : true
        }),
        body: JSON.stringify(notification),
        signal: controller.signal
      });
      this._applyResponseMetadata(response);

      if (!response.ok && response.status !== 202 && response.status !== 204) {
        throw await buildHttpErrorFromResponse(response);
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`Request timeout (${this.timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._rejectAll(new Error('Client closed'));
    this.connected = false;
  }
}

// -------------------- Streamable HTTP 客户端（基于 Fetch 流式响应）--------------------
class StreamableHTTPClient extends BaseHTTPClient {
  async _readEventStreamResponse(response, request) {
    return readJsonRpcEventStreamResponse(response, request, { logger: this.logger });
  }

  async _performRequest(request, signal) {
    const { url } = this.config;
    const response = await fetch(url, {
      method: this._getRequestMethod(),
      headers: this._buildHeaders({
        accept: 'application/json, text/event-stream',
        contentType: 'application/json',
        includeProtocolVersion: request?.method === 'initialize' ? false : true,
        includeSessionId: request?.method === 'initialize' ? false : true
      }),
      body: JSON.stringify(request),
      signal
    });
    this._applyResponseMetadata(response);

    if (!response.ok) {
      throw await this._buildHttpError(response);
    }

    const contentType = cleanString(getHeader(response?.headers, 'content-type')).toLowerCase();
    if (contentType.startsWith('text/event-stream')) {
      return this._readEventStreamResponse(response, request);
    }

    const payloadText = await readResponseText(response);
    const payload = tryExtractJsonRpcResponseFromText(payloadText, request?.id);
    if (payload !== null) return payload;
    return unwrapJsonRpcResponse(JSON.parse(payloadText));
  }
}

// 工厂函数：根据传输类型创建对应客户端
function createMCPClient(serverConfig) {
  const transportType = cleanString(serverConfig?.transportType);
  switch (transportType) {
    case 'builtinNotes': {
      // Lazy require to avoid breaking non-uTools environments.
      const createBuiltinNotesMcpClient = require('../builtins/notes-mcp-client')
      return createBuiltinNotesMcpClient(serverConfig)
    }
    case 'builtinSessions': {
      // Lazy require to avoid breaking non-uTools environments.
      const createBuiltinSessionsMcpClient = require('../builtins/sessions-mcp-client')
      return createBuiltinSessionsMcpClient(serverConfig)
    }
    case 'builtinConfig': {
      // Lazy require to avoid breaking non-uTools environments.
      const createBuiltinConfigMcpClient = require('../builtins/config-mcp-client')
      return createBuiltinConfigMcpClient(serverConfig)
    }
    case 'builtinAgents': {
      // Lazy require to avoid breaking non-uTools environments.
      const createBuiltinAgentsMcpClient = require('../builtins/agents-mcp-client')
      return createBuiltinAgentsMcpClient(serverConfig)
    }
    case 'stdio':
      return new StdioClient(serverConfig);
    case 'sse':
      return new SSEClient(serverConfig);
    case 'streamableHttp':
      return new StreamableHTTPClient(serverConfig);
    case 'http': // 简单的 HTTP 调用（非流式）
      return new SimpleHTTPClient(serverConfig);
    default:
      throw new Error(`Unsupported transport type: ${transportType}`);
  }
}

module.exports = createMCPClient;
module.exports._test = {
  BaseHTTPClient,
  SimpleHTTPClient,
  SSEClient,
  StdioClient,
  StreamableHTTPClient,
  buildMcpHttpHeaders,
  createEventStreamAccumulator,
  readJsonRpcEventStreamResponse,
  readJsonRpcResponseBody,
  resolveLegacySseEndpointPayload,
  tryExtractJsonRpcResponseFromText
};
