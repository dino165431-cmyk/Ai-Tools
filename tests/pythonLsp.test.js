import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

if (!globalThis.utools) {
  globalThis.utools = {
    getPath: () => path.join(process.cwd(), '.tmp-utools'),
    dbCryptoStorage: {
      getItem: () => null,
      setItem: () => null
    }
  }
}

const pythonLsp = require('../public/preload/utils/python-lsp.js')

test('resolveJediLanguageServerLaunch falls back to module launch for absolute python paths without a sibling executable', () => {
  const pythonPath = process.platform === 'win32'
    ? 'C:\\Portable\\Python312\\python.exe'
    : '/opt/python/bin/python'

  const launch = pythonLsp.__testing.resolveJediLanguageServerLaunch(pythonPath)

  assert.equal(launch.command, pythonPath)
  assert.deepEqual(launch.args, ['-m', 'jedi_language_server.cli'])
})

test('resolveWorkspacePath converts note-relative workspace paths into absolute storage paths', () => {
  const resolved = pythonLsp.__testing.resolveWorkspacePath('note/demo-notebook')

  assert.equal(resolved, path.join(process.cwd(), '.tmp-utools', 'note', 'demo-notebook'))
})
