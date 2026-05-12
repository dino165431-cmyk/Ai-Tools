import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import zlib from 'node:zlib'

import {
  getSafeExternalUrl,
  isSafeExternalUrl,
  safeOpenExternal,
  SAFE_EXTERNAL_PROTOCOLS
} from '../src/utils/safeOpenExternal.js'

const require = createRequire(import.meta.url)
const webOperations = require('../public/preload/utils/web-operations.js')
const {
  buildWebSearchApiAttempts,
  buildWebSearchAttempts,
  buildWebReadAttempts,
  decodeResponseText,
  isTlsCertificateError,
  mergeSearchResults,
  normalizeBingResultUrl,
  parseBochaSearchApiResponse,
  parseBraveSearchApiResponse,
  parseDuckDuckGoInstantAnswerApiResponse,
  parseRawHttpResponse
} = webOperations._test

test('parseRawHttpResponse parses normal HTTP response headers and body', () => {
  const parsed = parseRawHttpResponse(Buffer.from(
    'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nhello',
    'utf8'
  ))

  assert.equal(parsed.status, 200)
  assert.equal(parsed.headers['content-type'], 'text/plain')
  assert.equal(parsed.body.toString('utf8'), 'hello')
})

test('parseRawHttpResponse accepts LF-only header separators from permissive proxies', () => {
  const parsed = parseRawHttpResponse(Buffer.from(
    'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello',
    'utf8'
  ))

  assert.equal(parsed.status, 200)
  assert.equal(parsed.headers['content-type'], 'text/plain')
  assert.equal(parsed.body.toString('utf8'), 'hello')
})

test('parseRawHttpResponse skips informational 1xx responses', () => {
  const parsed = parseRawHttpResponse(Buffer.from(
    'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nready',
    'utf8'
  ))

  assert.equal(parsed.status, 200)
  assert.equal(parsed.headers['content-type'], 'text/plain')
  assert.equal(parsed.body.toString('utf8'), 'ready')
})

test('parseRawHttpResponse reports empty proxy tunnel responses clearly', () => {
  assert.throws(
    () => parseRawHttpResponse(Buffer.alloc(0)),
    /Invalid HTTP response: empty response/
  )
})

test('buildWebSearchAttempts includes alternate engines for fallback search', () => {
  const attempts = buildWebSearchAttempts('vLLM multi model serving', 10000)
  assert.deepEqual(
    attempts.map((attempt) => attempt.engine),
    [
      'duckduckgo_html_primary',
      'duckduckgo_html_legacy',
      'duckduckgo_lite',
      'bing_html',
      'bing_cn_html'
    ]
  )
  assert.ok(attempts.every((attempt) => typeof attempt.parse === 'function'))
  assert.ok(attempts.some((attempt) => attempt.url.startsWith('https://cn.bing.com/search?')))
})

test('buildWebSearchApiAttempts supports configured official search APIs', () => {
  const ddgAttempts = buildWebSearchApiAttempts('vLLM multi model serving', 10000, {
    searchApiProvider: 'duckduckgo_instant_answer'
  }, 5)
  assert.deepEqual(ddgAttempts.map((attempt) => attempt.engine), ['duckduckgo_instant_answer_api'])

  const bochaAttempts = buildWebSearchApiAttempts('vLLM multi model serving', 10000, {
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    searchApiMarket: 'zh-CN'
  }, 4)
  assert.equal(bochaAttempts[0].engine, 'bocha_search_api')
  assert.equal(bochaAttempts[0].method, 'POST')
  assert.equal(bochaAttempts[0].headers.Authorization, 'Bearer secret')
  assert.equal(bochaAttempts[0].body.count, 4)
  assert.equal(bochaAttempts[0].useProxy, false)

  const bochaAttemptsWithProxy = buildWebSearchApiAttempts('vLLM multi model serving', 10000, {
    searchApiProvider: 'bocha_search',
    searchApiKey: 'secret',
    searchApiEndpoint: 'https://api.bochaai.com/v1/web-search',
    proxyUrl: 'http://127.0.0.1:7890'
  }, 4)
  assert.deepEqual(bochaAttemptsWithProxy.map((attempt) => attempt.engine), [
    'bocha_search_api',
    'bocha_search_api_proxy'
  ])
  assert.equal(bochaAttemptsWithProxy[0].useProxy, false)
  assert.equal(bochaAttemptsWithProxy[1].useProxy, true)

  const braveAttempts = buildWebSearchApiAttempts('vLLM multi model serving', 10000, {
    searchApiProvider: 'brave_search',
    searchApiKey: 'secret',
    searchApiEndpoint: 'https://api.search.brave.com/res/v1/web/search',
    searchApiMarket: 'zh-CN'
  }, 3)
  assert.equal(braveAttempts[0].engine, 'brave_search_api')
  assert.equal(braveAttempts[0].headers['X-Subscription-Token'], 'secret')
  assert.match(braveAttempts[0].url, /count=3/)
})

test('buildWebReadAttempts tries direct access before configured proxy', () => {
  assert.deepEqual(buildWebReadAttempts({}).map((attempt) => attempt.engine), [
    'web_read_direct'
  ])

  const attempts = buildWebReadAttempts({
    proxyUrl: 'http://127.0.0.1:7890'
  })
  assert.deepEqual(attempts.map((attempt) => attempt.engine), [
    'web_read_direct',
    'web_read_proxy'
  ])
  assert.equal(attempts[0].useProxy, false)
  assert.equal(attempts[1].useProxy, true)
})

test('official search API parsers normalize result payloads', () => {
  const bochaResults = parseBochaSearchApiResponse(JSON.stringify({
    data: {
      webPages: {
        value: [
          { name: 'Bocha result', url: 'https://example.com/bocha', snippet: 'bocha snippet' }
        ]
      }
    }
  }))
  assert.deepEqual(bochaResults, [
    { title: 'Bocha result', url: 'https://example.com/bocha', snippet: 'bocha snippet' }
  ])

  const braveResults = parseBraveSearchApiResponse(JSON.stringify({
    web: {
      results: [
        { title: 'Brave result', url: 'https://example.com/brave', description: 'brave snippet' }
      ]
    }
  }))
  assert.deepEqual(braveResults, [
    { title: 'Brave result', url: 'https://example.com/brave', snippet: 'brave snippet' }
  ])

  const duckResults = parseDuckDuckGoInstantAnswerApiResponse(JSON.stringify({
    Heading: 'Duck result',
    AbstractURL: 'https://example.com/duck',
    AbstractText: 'duck snippet',
    RelatedTopics: [
      { Text: 'Related result', FirstURL: 'https://example.com/related' }
    ]
  }))
  assert.deepEqual(duckResults.map((item) => item.url), [
    'https://example.com/duck',
    'https://example.com/related'
  ])
})

test('decodeResponseText handles compressed response bodies', () => {
  const encoded = zlib.gzipSync(Buffer.from('compressed hello', 'utf8'))
  const decoded = decodeResponseText(encoded, {
    'content-encoding': 'gzip',
    'content-type': 'text/plain; charset=utf-8'
  })

  assert.equal(decoded, 'compressed hello')
})

test('isTlsCertificateError detects local certificate chain failures', () => {
  const err = new Error('unable to get local issuer certificate')
  err.code = 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'

  assert.equal(isTlsCertificateError(err), true)
  assert.equal(isTlsCertificateError(new Error('socket hang up')), false)
})

test('normalizeBingResultUrl unwraps bing redirect links', () => {
  const target = 'https://example.com/page?q=1'
  const encoded = Buffer.from(target, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  const normalized = normalizeBingResultUrl(`https://www.bing.com/ck/a?u=a1${encoded}`)

  assert.equal(normalized, target)
})

test('mergeSearchResults combines successful engines and deduplicates URLs', () => {
  const merged = mergeSearchResults([
    {
      engine: 'one',
      ok: true,
      results: [
        { title: 'A', url: 'https://example.com/a?utm_source=x', snippet: 'first' },
        { title: 'B', url: 'https://example.com/b', snippet: '' }
      ]
    },
    {
      engine: 'two',
      ok: true,
      results: [
        { title: 'A again', url: 'https://example.com/a', snippet: 'duplicate' },
        { title: 'C', url: 'https://example.com/c', snippet: 'third' }
      ]
    }
  ], 10)

  assert.deepEqual(merged.map((item) => item.url), [
    'https://example.com/a?utm_source=x',
    'https://example.com/b',
    'https://example.com/c'
  ])
  assert.deepEqual(merged.map((item) => item.sourceEngine), ['one', 'one', 'two'])
})

test('safe external urls allow http, https, and mailto only', () => {
  assert.deepEqual(SAFE_EXTERNAL_PROTOCOLS, ['http:', 'https:', 'mailto:'])

  assert.equal(getSafeExternalUrl('http://example.com')?.protocol, 'http:')
  assert.equal(getSafeExternalUrl('https://example.com')?.protocol, 'https:')
  assert.equal(getSafeExternalUrl('mailto:test@example.com')?.protocol, 'mailto:')

  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false)
  assert.equal(getSafeExternalUrl('javascript:alert(1)'), null)
})

test('safeOpenExternal forwards allowed urls to utools shellOpenExternal', () => {
  const originalUtools = globalThis.utools
  const opened = []

  globalThis.utools = {
    shellOpenExternal: (href) => {
      opened.push(href)
    }
  }

  try {
    assert.equal(safeOpenExternal('http://example.com/path?q=1'), true)
    assert.equal(safeOpenExternal('https://example.com/secure'), true)
    assert.equal(safeOpenExternal('mailto:test@example.com'), true)
    assert.equal(safeOpenExternal('javascript:alert(1)'), false)
  } finally {
    globalThis.utools = originalUtools
  }

  assert.deepEqual(opened, [
    'http://example.com/path?q=1',
    'https://example.com/secure',
    'mailto:test@example.com'
  ])
})
