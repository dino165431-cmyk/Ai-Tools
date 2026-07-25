import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

function loadWebOperationsModule() {
  const filePath = path.resolve('public/preload/utils/web-operations.js')
  const source = fs.readFileSync(filePath, 'utf8')
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  const mockGlobalConfig = {
    getWebSearchConfig() {
      return {}
    }
  }
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === './global-config') return mockGlobalConfig
      return require(specifier)
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    Buffer,
    URL,
    TextDecoder,
    setTimeout,
    clearTimeout
  })
  const wrapped = `(function (exports, require, module, __filename, __dirname) {${source}\n})`
  const script = new vm.Script(wrapped, { filename: filePath })
  const fn = script.runInContext(context)
  fn(module.exports, context.require, module, filePath, path.dirname(filePath))
  return module.exports
}

const webOperations = loadWebOperationsModule()
const { _test } = webOperations

test('insecure TLS fallback is disabled by default unless explicitly enabled', () => {
  assert.equal(_test.isInsecureTlsFallbackEnabled({}, {}), false)
  assert.equal(_test.isInsecureTlsFallbackEnabled({}, { allowInsecureTlsFallback: true }), true)
  assert.equal(_test.isInsecureTlsFallbackEnabled({}, { allowInsecureTlsFallback: false }), false)
  assert.equal(_test.isInsecureTlsFallbackEnabled({ allowInsecureTlsFallback: true }, { allowInsecureTlsFallback: false }), true)
  assert.equal(_test.isInsecureTlsFallbackEnabled({ allowInsecureTlsFallback: false }, { allowInsecureTlsFallback: true }), false)
})

test('retry with insecure TLS only occurs for certificate failures when explicitly enabled', () => {
  const certError = Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })
  const target = new URL('https://example.com')

  assert.equal(_test.shouldRetryWithInsecureTls(certError, target, {}, false), false)
  assert.equal(_test.shouldRetryWithInsecureTls(certError, target, {}, true), true)
  assert.equal(_test.shouldRetryWithInsecureTls(certError, target, { insecureTls: true }, true), false)
  assert.equal(_test.shouldRetryWithInsecureTls(new Error('socket hang up'), target, {}, true), false)
})

test('warning message clearly states the risk of skipping certificate validation', () => {
  const certError = Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })
  const warning = _test.buildInsecureTlsFallbackWarning(new URL('https://example.com'), certError, true)

  assert.match(warning, /显式配置/)
  assert.match(warning, /跳过 TLS 证书校验/)
  assert.match(warning, /中间人攻击/)
  assert.match(warning, /example\.com/)
  assert.match(warning, /DEPTH_ZERO_SELF_SIGNED_CERT/)
})
