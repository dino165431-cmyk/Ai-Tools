const http = require('http')
const https = require('https')
const tls = require('tls')
const zlib = require('zlib')
const { URL } = require('url')
const globalConfig = require('./global-config')

const DEFAULT_TIMEOUT_MS = 15000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 AiTools/1.0'

function cleanString(value) {
  return String(value || '').trim()
}

function decodeHtmlEntities(text) {
  const raw = String(text || '')
  if (!raw) return ''
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (m, entity) => {
    const key = String(entity || '').trim()
    if (!key) return m
    if (key[0] === '#') {
      const isHex = key[1]?.toLowerCase() === 'x'
      const numText = isHex ? key.slice(2) : key.slice(1)
      const code = Number.parseInt(numText, isHex ? 16 : 10)
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return m
        }
      }
      return m
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : m
  })
}

function normalizeWhitespace(text) {
  return decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getHeaderValue(headers, name) {
  if (!headers || typeof headers !== 'object') return ''
  const lowerName = String(name || '').toLowerCase()
  return cleanString(headers[lowerName] || headers[name] || '')
}

function normalizeTextEncoding(encoding) {
  const raw = cleanString(encoding).toLowerCase()
  if (!raw) return 'utf-8'
  if (raw === 'gbk' || raw === 'gb2312' || raw === 'gb18030') return 'gb18030'
  if (raw === 'big5' || raw === 'big5-hkscs') return 'big5'
  if (raw === 'utf8') return 'utf-8'
  return raw
}

function detectCharsetFromContentType(contentType) {
  const match = cleanString(contentType).match(/\bcharset\s*=\s*["']?([^;"'\s]+)/i)
  return match ? normalizeTextEncoding(match[1]) : ''
}

function detectCharsetFromHtml(buffer) {
  const sample = Buffer.isBuffer(buffer)
    ? buffer.slice(0, Math.min(buffer.length, 8192)).toString('latin1')
    : ''
  const metaMatch =
    sample.match(/<meta\b[^>]*charset=["']?\s*([^"'\s/>]+)/i) ||
    sample.match(/<meta\b[^>]*http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([^"'\s;]+)/i)
  return metaMatch ? normalizeTextEncoding(metaMatch[1]) : ''
}

function decodeTextWithEncoding(buffer, encoding) {
  const normalized = normalizeTextEncoding(encoding)
  try {
    return new TextDecoder(normalized, { fatal: false }).decode(buffer)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }
}

function decompressResponseBody(buffer, headers = {}) {
  const contentEncoding = getHeaderValue(headers, 'content-encoding').toLowerCase()
  if (!contentEncoding || contentEncoding === 'identity') return buffer
  try {
    if (/\bbr\b/.test(contentEncoding) && typeof zlib.brotliDecompressSync === 'function') {
      return zlib.brotliDecompressSync(buffer)
    }
    if (/\bgzip\b|\bx-gzip\b/.test(contentEncoding)) return zlib.gunzipSync(buffer)
    if (/\bdeflate\b/.test(contentEncoding)) {
      try {
        return zlib.inflateSync(buffer)
      } catch {
        return zlib.inflateRawSync(buffer)
      }
    }
  } catch {
    return buffer
  }
  return buffer
}

function decodeResponseText(buffer, headers = {}) {
  const body = decompressResponseBody(buffer, headers)
  const declaredCharset = detectCharsetFromContentType(getHeaderValue(headers, 'content-type'))
  const sniffedCharset = declaredCharset || detectCharsetFromHtml(body)
  const primary = decodeTextWithEncoding(body, sniffedCharset || 'utf-8')

  if (!sniffedCharset && (primary.match(/\uFFFD/g) || []).length >= 3) {
    const gbText = decodeTextWithEncoding(body, 'gb18030')
    if ((gbText.match(/\uFFFD/g) || []).length < (primary.match(/\uFFFD/g) || []).length) return gbText
  }

  return primary
}

function stripTags(html) {
  return normalizeWhitespace(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

function extractTagContent(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = String(html || '').match(re)
  return match ? stripTags(match[1]) : ''
}

function extractMetaContent(html, name) {
  const source = String(html || '')
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escapedName}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapedName}["'][^>]*>`, 'i')
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match) return normalizeWhitespace(match[1])
  }
  return ''
}

function resolveUrl(href, baseUrl) {
  const raw = cleanString(href)
  if (!raw) return ''
  try {
    const url = new URL(raw, baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function getConfiguredProxyUrl(explicitProxyUrl = '') {
  const explicit = cleanString(explicitProxyUrl)
  if (explicit) return explicit
  try {
    return cleanString(globalConfig.getWebSearchConfig?.().proxyUrl)
  } catch {
    return ''
  }
}

function getConfiguredWebSearchConfig() {
  try {
    const config = globalConfig.getWebSearchConfig?.()
    return config && typeof config === 'object' ? config : {}
  } catch {
    return {}
  }
}

function normalizeProxyUrl(proxyUrl) {
  const raw = cleanString(proxyUrl)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed
  } catch {
    return null
  }
}

function getProxyAuthHeader(proxy) {
  const username = decodeURIComponent(proxy.username || '')
  const password = decodeURIComponent(proxy.password || '')
  if (!username && !password) return ''
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function createHttpsTunnelSocket(target, proxy, timeoutMs, insecureTls = false) {
  const proxyClient = proxy.protocol === 'https:' ? https : http
  const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80)
  const targetPort = Number(target.port) || 443
  const auth = getProxyAuthHeader(proxy)

  return new Promise((resolve, reject) => {
    const req = proxyClient.request({
      host: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: `${target.hostname}:${targetPort}`,
      headers: {
        Host: `${target.hostname}:${targetPort}`,
        ...(auth ? { 'Proxy-Authorization': auth } : {})
      },
      timeout: timeoutMs,
      ...(proxy.protocol === 'https:' && insecureTls ? { rejectUnauthorized: false } : {})
    })

    req.once('connect', (res, socket) => {
      const status = Number(res.statusCode) || 0
      if (status < 200 || status >= 300) {
        socket.destroy()
        reject(new Error(`Proxy CONNECT failed: HTTP ${status}`))
        return
      }
      resolve(socket)
    })
    req.once('timeout', () => req.destroy(new Error(`Proxy CONNECT timeout after ${timeoutMs}ms`)))
    req.once('error', reject)
    req.end()
  })
}

function buildHttpRequestText(target, headers, method = 'GET', bodyBuffer = Buffer.alloc(0)) {
  const path = `${target.pathname || '/'}${target.search || ''}`
  const mergedHeaders = {
    ...headers,
    Host: target.host,
    Connection: 'close',
    ...(bodyBuffer.length ? { 'Content-Length': bodyBuffer.length } : {})
  }
  const lines = [`${method} ${path} HTTP/1.1`]
  for (const [name, value] of Object.entries(mergedHeaders)) {
    if (value === undefined || value === null || value === '') continue
    lines.push(`${name}: ${String(value).replace(/[\r\n]+/g, ' ')}`)
  }
  lines.push('', '')
  return Buffer.concat([Buffer.from(lines.join('\r\n'), 'utf8'), bodyBuffer])
}

function decodeChunkedBody(buffer) {
  const chunks = []
  let offset = 0
  while (offset < buffer.length) {
    const sizeEnd = buffer.indexOf('\r\n', offset, 'utf8')
    if (sizeEnd < 0) break
    const sizeLine = buffer.slice(offset, sizeEnd).toString('ascii').split(';')[0].trim()
    const size = Number.parseInt(sizeLine, 16)
    if (!Number.isFinite(size)) break
    offset = sizeEnd + 2
    if (size === 0) return Buffer.concat(chunks)
    if (offset + size > buffer.length) break
    chunks.push(buffer.slice(offset, offset + size))
    offset += size + 2
  }
  return buffer
}

function parseRawHttpResponse(buffer) {
  if (!buffer || buffer.length === 0) throw new Error('Invalid HTTP response: empty response')

  let offset = 0
  let status = 0
  let headers = {}
  let bodyOffset = 0

  while (offset < buffer.length) {
    const crlfEnd = buffer.indexOf('\r\n\r\n', offset)
    const lfEnd = buffer.indexOf('\n\n', offset)
    let headerEnd = crlfEnd
    let separatorLength = 4

    if (headerEnd < 0 || (lfEnd >= 0 && lfEnd < headerEnd)) {
      headerEnd = lfEnd
      separatorLength = 2
    }

    if (headerEnd < 0) {
      if (offset === 0 && buffer.length === 0) throw new Error('Invalid HTTP response: empty response')
      throw new Error('Invalid HTTP response: missing headers')
    }

    const headerText = buffer.slice(offset, headerEnd).toString('latin1')
    const lines = headerText.split(/\r?\n/)
    const statusLine = lines.shift() || ''
    const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/i)
    if (!statusMatch) throw new Error(`Invalid HTTP response: unexpected status line ${statusLine || '<empty>'}`)

    status = Number(statusMatch[1]) || 0
    headers = {}
    for (const line of lines) {
      const index = line.indexOf(':')
      if (index <= 0) continue
      const name = line.slice(0, index).trim().toLowerCase()
      const value = line.slice(index + 1).trim()
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value
    }

    bodyOffset = headerEnd + separatorLength
    if (status < 100 || status >= 200 || status === 101) break
    offset = bodyOffset
  }

  const rawBody = buffer.slice(bodyOffset)
  const body = /\bchunked\b/i.test(headers['transfer-encoding'] || '') ? decodeChunkedBody(rawBody) : rawBody
  return { status, headers, body }
}

function isEmptyHttpResponseError(err) {
  return /Invalid HTTP response:\s*empty response/i.test(err?.message || String(err || ''))
}

function isTlsCertificateError(err) {
  const code = cleanString(err?.code)
  const message = err?.message || String(err || '')
  return /CERT|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID/i.test(code) ||
    /unable to get local issuer certificate|self[- ]signed certificate|certificate has expired|Hostname\/IP does not match certificate/i.test(message)
}

function shouldRetryWithInsecureTls(err, target, options = {}, allowInsecureTlsFallback = false) {
  return target?.protocol === 'https:' &&
    allowInsecureTlsFallback &&
    !options.insecureTls &&
    isTlsCertificateError(err)
}

function requestTextViaHttpsProxy(target, proxy, { timeoutMs, maxBytes, redirects, headers, options, method = 'GET', bodyBuffer = Buffer.alloc(0), proxyTunnelRetries = 1, insecureTls = false }) {
  return new Promise((resolve, reject) => {
    let settled = false
    let tlsSocket = null
    const fail = (err) => {
      if (settled) return
      settled = true
      if (tlsSocket) tlsSocket.destroy()
      reject(err)
    }
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    createHttpsTunnelSocket(target, proxy, timeoutMs, insecureTls)
      .then((socket) => {
        tlsSocket = tls.connect({
          socket,
          servername: target.hostname,
          ALPNProtocols: ['http/1.1'],
          rejectUnauthorized: !insecureTls
        }, () => {
          tlsSocket.write(buildHttpRequestText(target, headers, method, bodyBuffer))
        })

        const chunks = []
        let total = 0
        tlsSocket.setTimeout(timeoutMs, () => fail(new Error(`Request timeout after ${timeoutMs}ms`)))
        tlsSocket.on('data', (chunk) => {
          total += chunk.length
          if (total > maxBytes) {
            fail(new Error(`Response too large: > ${maxBytes} bytes`))
            return
          }
          chunks.push(chunk)
        })
        tlsSocket.on('end', () => {
          try {
            const parsed = parseRawHttpResponse(Buffer.concat(chunks))
            const location = cleanString(parsed.headers.location)
            if ([301, 302, 303, 307, 308].includes(parsed.status) && location && redirects > 0) {
              const nextUrl = resolveUrl(location, target.toString())
              if (!nextUrl) {
                fail(new Error(`Invalid redirect location: ${location}`))
                return
              }
              requestText(nextUrl, { ...options, method: parsed.status === 303 ? 'GET' : method, body: parsed.status === 303 ? undefined : options.body, redirects: redirects - 1 }).then(done, fail)
              return
            }

            const text = decodeResponseText(parsed.body, parsed.headers)
            if (parsed.status < 200 || parsed.status >= 300) {
              fail(new Error(`HTTP ${parsed.status}: ${text.slice(0, 300)}`))
              return
            }
            done({
              url: target.toString(),
              finalUrl: target.toString(),
              status: parsed.status,
              contentType: cleanString(parsed.headers['content-type']),
              text
            })
          } catch (err) {
            if (isEmptyHttpResponseError(err) && proxyTunnelRetries > 0) {
              requestTextViaHttpsProxy(target, proxy, {
                timeoutMs,
                maxBytes,
                redirects,
                headers,
                options,
                method,
                bodyBuffer,
                insecureTls,
                proxyTunnelRetries: proxyTunnelRetries - 1
              }).then(done, fail)
              return
            }
            if (isEmptyHttpResponseError(err)) {
              fail(new Error(`HTTPS proxy tunnel returned an empty response for ${target.toString()}. The target site or proxy closed the connection before sending HTTP headers.`))
              return
            }
            fail(err)
          }
        })
        tlsSocket.on('error', fail)
      })
      .catch(fail)
  })
}

function normalizeDuckDuckGoResultUrl(href) {
  const url = cleanString(href)
  if (!url) return ''
  try {
    const parsed = new URL(url, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return resolveUrl(uddg, 'https://duckduckgo.com')
    return resolveUrl(parsed.toString(), 'https://duckduckgo.com')
  } catch {
    return ''
  }
}

function decodeBase64UrlText(value) {
  const raw = cleanString(value)
  if (!raw) return ''
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=')
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function normalizeBingResultUrl(href, baseUrl = 'https://www.bing.com') {
  const resolved = resolveUrl(href, baseUrl)
  if (!resolved) return ''
  try {
    const parsed = new URL(resolved)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    if (host !== 'bing.com' && host !== 'cn.bing.com') return resolved

    const redirectParam = parsed.searchParams.get('u') || parsed.searchParams.get('url') || parsed.searchParams.get('r')
    if (redirectParam) {
      const direct = resolveUrl(redirectParam, baseUrl)
      if (direct && !/\/\/(?:www\.)?(?:cn\.)?bing\.com\//i.test(direct)) return direct

      const encoded = redirectParam.replace(/^a\d/i, '')
      const decoded = decodeBase64UrlText(encoded)
      const decodedUrl = resolveUrl(decoded, baseUrl)
      if (decodedUrl && !/\/\/(?:www\.)?(?:cn\.)?bing\.com\//i.test(decodedUrl)) return decodedUrl
    }

    return resolved
  } catch {
    return resolved
  }
}

function normalizeSearchResultUrl(href, baseUrl) {
  const raw = cleanString(href)
  if (!raw) return ''
  const resolved = resolveUrl(raw, baseUrl)
  if (!resolved) return ''
  try {
    const parsed = new URL(resolved)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'duckduckgo.com') return normalizeDuckDuckGoResultUrl(resolved)
    if (host === 'bing.com' || host === 'cn.bing.com') return normalizeBingResultUrl(resolved, baseUrl)
  } catch {
    return resolved
  }
  return resolved
}

function shouldSkipSearchResultUrl(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'duckduckgo.com' && /^\/y\.js$/i.test(parsed.pathname)) return true
    if (host === 'duckduckgo.com' && /^\/(settings|feedback|spread|duckduckgo-help-pages)\b/i.test(parsed.pathname)) return true
    if ((host === 'bing.com' || host === 'cn.bing.com') && /^\/(search|images|videos|maps|news|translator|copilot|account|profile)\b/i.test(parsed.pathname)) return true
    if ((host === 'bing.com' || host === 'cn.bing.com') && /^\/$/i.test(parsed.pathname)) return true
    return false
  } catch {
    return true
  }
}

function isDuckDuckGoChallengePage(html) {
  return /Unfortunately,\s*bots\s+use\s+DuckDuckGo\s+too/i.test(String(html || '')) ||
    /Please\s+complete\s+the\s+following\s+challenge/i.test(String(html || ''))
}

function isBingChallengePage(html) {
  return /请解决以下难题以继续/i.test(String(html || '')) ||
    /solve\s+the\s+following\s+challenge\s+to\s+continue/i.test(String(html || ''))
}

function parseDuckDuckGoHtml(html) {
  const results = []
  const seen = new Set()
  const source = String(html || '')
  const itemRe = /<div\b[^>]*class=["'][^"']*(?:result|web-result)[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*(?:result|web-result)[^"']*["']|<\/body>|$)/gi
  let itemMatch = null

  while ((itemMatch = itemRe.exec(source)) && results.length < 12) {
    const block = itemMatch[1] || ''
    const linkMatch =
      block.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue

    const url = normalizeSearchResultUrl(linkMatch[1], 'https://duckduckgo.com')
    if (!url || seen.has(url) || shouldSkipSearchResultUrl(url)) continue
    const title = stripTags(linkMatch[2])
    if (!title) continue

    const snippetMatch =
      block.match(/<a\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<div\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : ''

    seen.add(url)
    results.push({ title, url, snippet })
  }

  return results
}

function parseGenericLinks(html, baseUrl) {
  const results = []
  const seen = new Set()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match = null
  while ((match = re.exec(String(html || ''))) && results.length < 12) {
    const url = normalizeSearchResultUrl(match[1], baseUrl)
    if (!url || seen.has(url) || shouldSkipSearchResultUrl(url)) continue
    const title = stripTags(match[2])
    if (!title || title.length < 3) continue
    if (/^(next|previous|privacy|terms|settings)$/i.test(title)) continue
    seen.add(url)
    results.push({ title, url, snippet: '' })
  }
  return results
}

function parseBingHtml(html) {
  const results = []
  const seen = new Set()
  const source = String(html || '')
  const itemRe = /<li\b[^>]*class=["'][^"']*b_algo[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  let itemMatch = null

  while ((itemMatch = itemRe.exec(source)) && results.length < 12) {
    const block = itemMatch[1] || ''
    const linkMatch =
      block.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i) ||
      block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue
    const url = normalizeSearchResultUrl(linkMatch[1], 'https://www.bing.com')
    if (!url || seen.has(url)) continue
    const title = stripTags(linkMatch[2])
    if (!title) continue
    const snippetMatch = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : ''
    seen.add(url)
    results.push({ title, url, snippet })
  }

  return results
}

function parseBingSearchHtml(html, finalUrl) {
  if (isBingChallengePage(html)) return []
  const parsed = parseBingHtml(html)
  return parsed.length ? parsed : parseGenericLinks(html, finalUrl)
}

function buildWebSearchAttempts(query, timeoutMs) {
  const duckDuckGoTimeoutMs = Math.min(Math.max(timeoutMs, 8000), 12000)
  const encodedQuery = encodeURIComponent(query)
  const parseDuckDuckGoSearchHtml = (html, finalUrl) => {
    if (isDuckDuckGoChallengePage(html)) return []
    const parsed = parseDuckDuckGoHtml(html)
    return parsed.length ? parsed : parseGenericLinks(html, finalUrl)
  }
  return [
    {
      engine: 'duckduckgo_html_primary',
      url: `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
      timeoutMs: duckDuckGoTimeoutMs,
      parse: parseDuckDuckGoSearchHtml
    },
    {
      engine: 'duckduckgo_html_legacy',
      url: `https://duckduckgo.com/html/?q=${encodedQuery}`,
      timeoutMs: duckDuckGoTimeoutMs,
      parse: parseDuckDuckGoSearchHtml
    },
    {
      engine: 'duckduckgo_lite',
      url: `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`,
      timeoutMs: duckDuckGoTimeoutMs,
      parse: parseDuckDuckGoSearchHtml
    },
    {
      engine: 'bing_html',
      url: `https://www.bing.com/search?q=${encodedQuery}&mkt=zh-CN&setlang=zh-Hans`,
      parse: parseBingSearchHtml
    },
    {
      engine: 'bing_cn_html',
      url: `https://cn.bing.com/search?q=${encodedQuery}&mkt=zh-CN&setlang=zh-Hans`,
      parse: parseBingSearchHtml
    }
  ]
}

function normalizeResultKey(url) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm'].forEach((key) => {
      parsed.searchParams.delete(key)
    })
    return parsed.toString()
  } catch {
    return cleanString(url)
  }
}

function mergeSearchResults(attemptLog, limit) {
  const merged = []
  const seen = new Set()
  ;(Array.isArray(attemptLog) ? attemptLog : []).forEach((attempt) => {
    if (!attempt?.ok || !Array.isArray(attempt.results)) return
    attempt.results.forEach((item) => {
      const url = cleanString(item?.url)
      const title = cleanString(item?.title)
      if (!url || !title) return
      const key = normalizeResultKey(url)
      if (seen.has(key)) return
      seen.add(key)
      merged.push({
        title,
        url,
        snippet: cleanString(item?.snippet),
        sourceEngine: attempt.engine
      })
    })
  })
  return merged.slice(0, limit)
}

function parseJsonSearchResponse(text, engine) {
  try {
    return JSON.parse(String(text || '{}'))
  } catch {
    throw new Error(`${engine} returned invalid JSON`)
  }
}

function collectDuckDuckGoInstantAnswerTopics(items, results, seen) {
  ;(Array.isArray(items) ? items : []).forEach((item) => {
    if (Array.isArray(item?.Topics)) {
      collectDuckDuckGoInstantAnswerTopics(item.Topics, results, seen)
      return
    }
    const url = resolveUrl(item?.FirstURL, 'https://duckduckgo.com')
    const title = cleanString(item?.Text || item?.Result)
    if (!url || !title || seen.has(url)) return
    seen.add(url)
    results.push({
      title,
      url,
      snippet: cleanString(item?.Text)
    })
  })
}

function parseDuckDuckGoInstantAnswerApiResponse(text) {
  const payload = parseJsonSearchResponse(text, 'duckduckgo_instant_answer_api')
  const results = []
  const seen = new Set()
  const abstractUrl = resolveUrl(payload.AbstractURL, 'https://duckduckgo.com')
  const abstractTitle = cleanString(payload.Heading || payload.AbstractSource || payload.AbstractText)
  if (abstractUrl && abstractTitle) {
    seen.add(abstractUrl)
    results.push({
      title: abstractTitle,
      url: abstractUrl,
      snippet: cleanString(payload.AbstractText)
    })
  }
  collectDuckDuckGoInstantAnswerTopics(payload.Results, results, seen)
  collectDuckDuckGoInstantAnswerTopics(payload.RelatedTopics, results, seen)
  return results
}

function parseBraveSearchApiResponse(text) {
  const payload = parseJsonSearchResponse(text, 'brave_search_api')
  return (Array.isArray(payload?.web?.results) ? payload.web.results : [])
    .map((item) => ({
      title: cleanString(item?.title),
      url: resolveUrl(item?.url, 'https://search.brave.com'),
      snippet: cleanString(item?.description || item?.snippet)
    }))
    .filter((item) => item.title && item.url && !shouldSkipSearchResultUrl(item.url))
}

function parseBochaSearchApiResponse(text) {
  const payload = parseJsonSearchResponse(text, 'bocha_search_api')
  return (Array.isArray(payload?.data?.webPages?.value) ? payload.data.webPages.value : [])
    .map((item) => ({
      title: cleanString(item?.name || item?.title),
      url: resolveUrl(item?.url, 'https://bochaai.com'),
      snippet: cleanString(item?.snippet || item?.summary)
    }))
    .filter((item) => item.title && item.url && !shouldSkipSearchResultUrl(item.url))
}

function inferSearchLanguage(market) {
  const text = cleanString(market || 'zh-CN').toLowerCase()
  const match = text.match(/^[a-z]{2}/)
  return match ? match[0] : 'zh'
}

function inferSearchCountry(market) {
  const text = cleanString(market || 'zh-CN').toLowerCase()
  const match = text.match(/-([a-z]{2})$/)
  return match ? match[1] : 'cn'
}

function buildWebSearchApiAttempts(query, timeoutMs, config = {}, limit = 5) {
  const provider = cleanString(config.searchApiProvider || 'none')
  const attempts = []
  const encodedQuery = encodeURIComponent(query)
  const hasConfiguredProxy = !!cleanString(config.proxyUrl)

  if (provider === 'duckduckgo_instant_answer') {
    attempts.push({
      engine: 'duckduckgo_instant_answer_api',
      url: `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1&no_redirect=1`,
      timeoutMs: Math.min(Math.max(timeoutMs, 5000), 8000),
      accept: 'application/json,text/plain;q=0.8,*/*;q=0.5',
      parse: parseDuckDuckGoInstantAnswerApiResponse
    })
  }

  if (provider === 'bocha_search') {
    const key = cleanString(config.searchApiKey)
    if (key) {
      const endpoint = resolveUrl(config.searchApiEndpoint, 'https://api.bochaai.com/v1/web-search') ||
        'https://api.bochaai.com/v1/web-search'
      const attempt = {
        engine: 'bocha_search_api',
        url: endpoint,
        method: 'POST',
        body: {
          query,
          freshness: 'noLimit',
          summary: false,
          count: Math.min(Math.max(1, Number(limit) || 5), 10)
        },
        timeoutMs: Math.min(Math.max(timeoutMs, 5000), 10000),
        accept: 'application/json,text/plain;q=0.8,*/*;q=0.5',
        headers: {
          Authorization: `Bearer ${key}`
        },
        useProxy: false,
        parse: parseBochaSearchApiResponse
      }
      attempts.push(attempt)
      if (hasConfiguredProxy) {
        attempts.push({
          ...attempt,
          engine: 'bocha_search_api_proxy',
          useProxy: true
        })
      }
    }
  }

  if (provider === 'brave_search') {
    const key = cleanString(config.searchApiKey)
    if (key) {
      const endpoint = resolveUrl(config.searchApiEndpoint, 'https://api.search.brave.com/res/v1/web/search') ||
        'https://api.search.brave.com/res/v1/web/search'
      const url = new URL(endpoint)
      url.searchParams.set('q', query)
      url.searchParams.set('count', String(Math.min(Math.max(1, Number(limit) || 5), 10)))
      url.searchParams.set('country', inferSearchCountry(config.searchApiMarket))
      url.searchParams.set('search_lang', inferSearchLanguage(config.searchApiMarket))
      attempts.push({
        engine: 'brave_search_api',
        url: url.toString(),
        timeoutMs: Math.min(Math.max(timeoutMs, 5000), 10000),
        accept: 'application/json,text/plain;q=0.8,*/*;q=0.5',
        headers: {
          'X-Subscription-Token': key
        },
        parse: parseBraveSearchApiResponse
      })
    }
  }

  return attempts
}

function buildWebReadAttempts(config = {}) {
  const attempts = [
    {
      engine: 'web_read_direct',
      useProxy: false
    }
  ]
  if (cleanString(config.proxyUrl)) {
    attempts.push({
      engine: 'web_read_proxy',
      useProxy: true
    })
  }
  return attempts
}

function requestText(url, options = {}) {
  const target = new URL(url)
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS)
  const maxBytes = Math.max(64 * 1024, Number(options.maxBytes) || MAX_RESPONSE_BYTES)
  const redirects = Math.max(0, Number(options.redirects ?? 4))
  const method = cleanString(options.method || 'GET').toUpperCase()
  const bodyBuffer = options.body === undefined || options.body === null
    ? Buffer.alloc(0)
    : Buffer.isBuffer(options.body)
      ? options.body
      : Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body), 'utf8')
  const webSearchConfig = getConfiguredWebSearchConfig()
  const proxy = options.useProxy === false ? null : normalizeProxyUrl(getConfiguredProxyUrl(options.proxyUrl))
  const client = target.protocol === 'http:' ? http : https
  let requestClient = client
  const allowInsecureTlsFallback = options.allowInsecureTlsFallback !== undefined
    ? options.allowInsecureTlsFallback !== false
    : webSearchConfig.allowInsecureTlsFallback !== false
  const headers = {
    Accept: options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
    'Accept-Language': options.language || 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': options.acceptEncoding || 'gzip, deflate, br',
    'User-Agent': DEFAULT_USER_AGENT,
    ...(bodyBuffer.length && !options.headers?.['Content-Type'] && !options.headers?.['content-type'] ? { 'Content-Type': 'application/json' } : {}),
    ...(bodyBuffer.length ? { 'Content-Length': bodyBuffer.length } : {}),
    ...(options.headers && typeof options.headers === 'object' ? options.headers : {})
  }

  const requestOptions = {
    method,
    headers,
    timeout: timeoutMs
  }
  if (target.protocol === 'https:' && options.insecureTls) {
    requestOptions.rejectUnauthorized = false
  }

  let requestUrl = target
  if (proxy && target.protocol === 'http:') {
    requestUrl = proxy
    requestClient = proxy.protocol === 'https:' ? https : http
    const proxyAuth = getProxyAuthHeader(proxy)
    requestOptions.path = target.toString()
    requestOptions.headers = {
      ...headers,
      Host: target.host,
      ...(proxyAuth ? { 'Proxy-Authorization': proxyAuth } : {})
    }
  }

  if (proxy && target.protocol === 'https:') {
    return requestTextViaHttpsProxy(target, proxy, {
      timeoutMs,
      maxBytes,
      redirects,
      headers,
      options,
      method,
      bodyBuffer,
      insecureTls: !!options.insecureTls,
      proxyTunnelRetries: Number.isFinite(Number(options.proxyTunnelRetries))
        ? Math.max(0, Math.floor(Number(options.proxyTunnelRetries)))
        : 1
    }).catch((err) => {
      if (shouldRetryWithInsecureTls(err, target, options, allowInsecureTlsFallback)) {
        return requestText(url, { ...options, insecureTls: true })
      }
      throw err
    })
  }

  return new Promise((resolve, reject) => {
    const makeRequest = () => {
      const req = requestClient.request(
        requestUrl,
        requestOptions,
        (res) => {
          const status = Number(res.statusCode) || 0
          const location = cleanString(res.headers.location)
          if ([301, 302, 303, 307, 308].includes(status) && location && redirects > 0) {
            res.resume()
            const nextUrl = resolveUrl(location, target.toString())
            if (!nextUrl) {
              reject(new Error(`Invalid redirect location: ${location}`))
              return
            }
            requestText(nextUrl, {
              ...options,
              method: status === 303 ? 'GET' : method,
              body: status === 303 ? undefined : options.body,
              redirects: redirects - 1
            }).then(resolve, reject)
            return
          }

          const chunks = []
          let total = 0
          res.on('data', (chunk) => {
            total += chunk.length
            if (total > maxBytes) {
              req.destroy(new Error(`Response too large: > ${maxBytes} bytes`))
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => {
            const buffer = Buffer.concat(chunks)
            const text = decodeResponseText(buffer, res.headers)
            if (status < 200 || status >= 300) {
              reject(new Error(`HTTP ${status}: ${text.slice(0, 300)}`))
              return
            }
            resolve({
              url: target.toString(),
              finalUrl: res.responseUrl || target.toString(),
              status,
              contentType: cleanString(res.headers['content-type']),
              text
            })
          })
        }
      )

      req.on('timeout', () => {
        req.destroy(new Error(`Request timeout after ${timeoutMs}ms`))
      })
      req.on('error', (err) => {
        if (shouldRetryWithInsecureTls(err, target, options, allowInsecureTlsFallback)) {
          requestText(url, { ...options, insecureTls: true }).then(resolve, reject)
          return
        }
        reject(err)
      })
      if (bodyBuffer.length) req.write(bodyBuffer)
      req.end()
      return req
    }

    makeRequest()
  })
}

function isRetryableRequestError(err) {
  const message = err?.message || String(err || '')
  return /empty response|ECONNRESET|EAI_AGAIN|ETIMEDOUT|socket hang up|TLS connection|Request timeout/i.test(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestTextWithRetries(url, options = {}) {
  const retries = Math.max(0, Math.floor(Number(options.retries) || 0))
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestText(url, options)
    } catch (err) {
      lastError = err
      if (attempt >= retries || !isRetryableRequestError(err)) break
      await sleep(Math.min(1000, 180 * (attempt + 1)))
    }
  }
  throw lastError
}

async function requestTextWithAttempts(url, attempts, options = {}) {
  const list = Array.isArray(attempts) && attempts.length
    ? attempts
    : [{ engine: 'request_direct', useProxy: false }]
  const attemptLog = []
  let lastError = null

  for (const attempt of list) {
    try {
      const response = await requestTextWithRetries(url, {
        ...options,
        useProxy: attempt.useProxy
      })
      attemptLog.push({
        engine: attempt.engine,
        ok: true
      })
      return { response, attemptLog }
    } catch (err) {
      const error = err?.message || String(err)
      lastError = err
      attemptLog.push({
        engine: attempt.engine,
        ok: false,
        error
      })
    }
  }

  const message = attemptLog
    .map((attempt) => `${attempt.engine}: ${attempt.error || (attempt.ok ? 'ok' : 'failed')}`)
    .join('; ')
  const wrapped = new Error(message || (lastError?.message || 'Request failed'))
  if (lastError?.code) wrapped.code = lastError.code
  wrapped.cause = lastError
  wrapped.attempts = attemptLog
  throw wrapped
}

async function runSearchAttempt(attempt, { limit, timeoutMs }) {
  try {
    const response = await requestTextWithRetries(attempt.url, {
      timeoutMs: attempt.timeoutMs || timeoutMs,
      maxBytes: MAX_RESPONSE_BYTES,
      method: attempt.method,
      body: attempt.body,
      accept: attempt.accept,
      headers: attempt.headers,
      retries: attempt.retries ?? 1,
      useProxy: attempt.useProxy
    })
    const results = attempt.parse(response.text, response.finalUrl).slice(0, limit)
    return {
      engine: attempt.engine,
      ok: results.length > 0,
      resultCount: results.length,
      results,
      error: results.length ? '' : 'no results parsed'
    }
  } catch (err) {
    const error = err?.message || String(err)
    return {
      engine: attempt.engine,
      ok: false,
      error
    }
  }
}

async function runSearchAttempts(attempts, { limit, timeoutMs, sequential = false }) {
  const list = Array.isArray(attempts) ? attempts : []
  if (!sequential) {
    return Promise.all(list.map((attempt) => runSearchAttempt(attempt, { limit, timeoutMs })))
  }

  const attemptLog = []
  for (const attempt of list) {
    const result = await runSearchAttempt(attempt, { limit, timeoutMs })
    attemptLog.push(result)
    if (result.ok && Array.isArray(result.results) && result.results.length) break
  }
  return attemptLog
}

function buildSearchResponse({ query, results, attemptLog, apiAttemptLog = [], htmlAttemptLog = [] }) {
  const success = attemptLog.find((attempt) => attempt.ok && Array.isArray(attempt.results) && attempt.results.length)
  const errors = attemptLog
    .filter((attempt) => !attempt.ok)
    .map((attempt) => `${attempt.engine}: ${attempt.error || 'no results parsed'}`)

  if (results.length) {
    return {
      ok: true,
      query,
      engine: success?.engine || 'mixed',
      results,
      attempts: attemptLog.map(({ results, ...attempt }) => attempt),
      apiAttempts: apiAttemptLog.map(({ results, ...attempt }) => attempt),
      htmlAttempts: htmlAttemptLog.map(({ results, ...attempt }) => attempt),
      warnings: errors
    }
  }

  return {
    ok: false,
    query,
    engine: 'none',
    results,
    attempts: attemptLog.map(({ results, ...attempt }) => attempt),
    apiAttempts: apiAttemptLog.map(({ results, ...attempt }) => attempt),
    htmlAttempts: htmlAttemptLog.map(({ results, ...attempt }) => attempt),
    error: errors.join('; ')
  }
}

async function webSearch(params = {}) {
  const query = cleanString(params.query || params.q)
  if (!query) throw new Error('query is required')
  const limit = Math.min(Math.max(1, Math.floor(Number(params.limit) || 5)), 10)
  const timeoutMs = Math.min(Math.max(3000, Number(params.timeoutMs) || 10000), 12000)
  const webSearchConfig = {
    ...getConfiguredWebSearchConfig(),
    ...(params.webSearchConfig && typeof params.webSearchConfig === 'object' ? params.webSearchConfig : {})
  }

  const apiAttempts = buildWebSearchApiAttempts(query, timeoutMs, webSearchConfig, limit)
  const apiAttemptLog = await runSearchAttempts(apiAttempts, { limit, timeoutMs, sequential: true })
  const apiResults = mergeSearchResults(apiAttemptLog, limit)
  if (apiResults.length) {
    return buildSearchResponse({
      query,
      results: apiResults,
      attemptLog: apiAttemptLog,
      apiAttemptLog
    })
  }

  const htmlAttempts = buildWebSearchAttempts(query, timeoutMs)
  const htmlAttemptLog = await runSearchAttempts(htmlAttempts, { limit, timeoutMs })
  const attemptLog = [...apiAttemptLog, ...htmlAttemptLog]
  const results = mergeSearchResults(attemptLog, limit)

  return buildSearchResponse({
    query,
    results,
    attemptLog,
    apiAttemptLog,
    htmlAttemptLog
  })
}

async function webRead(params = {}) {
  const url = resolveUrl(params.url, 'https://example.com')
  if (!url) throw new Error('url is required')
  const maxChars = Math.min(Math.max(1000, Math.floor(Number(params.maxChars) || 12000)), 40000)
  const webSearchConfig = {
    ...getConfiguredWebSearchConfig(),
    ...(params.webSearchConfig && typeof params.webSearchConfig === 'object' ? params.webSearchConfig : {})
  }
  const { response, attemptLog } = await requestTextWithAttempts(url, buildWebReadAttempts(webSearchConfig), {
    timeoutMs: params.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBytes: MAX_RESPONSE_BYTES,
    retries: params.retries ?? 1
  })
  const html = response.text || ''
  const title = extractMetaContent(html, 'og:title') || extractTagContent(html, 'title')
  const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description')
  const mainMatch =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    null
  const text = stripTags(mainMatch ? mainMatch[1] : html)
  const truncated = text.length > maxChars
  return {
    ok: true,
    url,
    finalUrl: response.finalUrl || url,
    status: response.status,
    contentType: response.contentType,
    title,
    description,
    text: truncated ? text.slice(0, maxChars) : text,
    truncated,
    totalChars: text.length,
    attempts: attemptLog
  }
}

module.exports = {
  webSearch,
  webRead,
  _test: {
    parseRawHttpResponse,
    buildWebReadAttempts,
    buildWebSearchApiAttempts,
    buildWebSearchAttempts,
    decodeResponseText,
    isTlsCertificateError,
    mergeSearchResults,
    normalizeBingResultUrl,
    parseBochaSearchApiResponse,
    parseBraveSearchApiResponse,
    parseDuckDuckGoInstantAnswerApiResponse
  }
}
