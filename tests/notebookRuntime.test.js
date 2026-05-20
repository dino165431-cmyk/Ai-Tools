import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

const notebookRuntime = require('../public/preload/utils/notebook-runtime.js')
const testing = notebookRuntime.__testing

test('parseNotebookMagicSpecs recognizes !pip and %pip cells', () => {
  assert.deepEqual(testing.parseNotebookMagicSpecs('!pip install fastapi'), [
    { kind: 'pip', args: 'install fastapi' }
  ])

  assert.deepEqual(testing.parseNotebookMagicSpecs('%pip install pandas'), [
    { kind: 'pip', args: 'install pandas' }
  ])
})

test('parseNotebookMagicSpecs leaves mixed python and magic cells untouched', () => {
  assert.deepEqual(testing.parseNotebookMagicSpecs('import os\n!pip install fastapi'), [])
  assert.deepEqual(testing.parseNotebookMagicSpecs('print("hello")'), [])
})

test('buildNotebookMagicWrapper wraps shell-like notebook commands', () => {
  const pipWrapper = testing.buildNotebookMagicWrapper('!pip install fastapi')
  assert.notEqual(pipWrapper, '!pip install fastapi')
  assert.match(pipWrapper, /__ai_nb_specs = \[\{"kind":"pip","args":"install fastapi"\}\]/)
  assert.match(pipWrapper, /__ai_nb_sys\.executable/)
  assert.match(pipWrapper, /-m', 'pip'/)

  const shellWrapper = testing.buildNotebookMagicWrapper('!echo hello')
  assert.match(shellWrapper, /"kind":"shell"/)
  assert.match(shellWrapper, /shell=True/)
})

test('normalizeProcessOutputText strips ansi sequences and normalizes carriage returns', () => {
  const raw = '\u001b[32mCollecting fastapi\u001b[0m\rInstalling\r\nDone'
  assert.equal(testing.normalizeProcessOutputText(raw), 'Collecting fastapi\nInstalling\nDone')
})

test('buildPythonChildEnv forces utf-8 subprocess output', () => {
  const env = testing.buildPythonChildEnv({ CUSTOM_FLAG: '1' })
  assert.equal(env.PYTHONIOENCODING, 'utf-8')
  assert.equal(env.PYTHONUTF8, '1')
  assert.equal(env.PIP_DISABLE_PIP_VERSION_CHECK, '1')
  assert.equal(env.CUSTOM_FLAG, '1')
})

test('managed notebook venv helpers resolve to data root venv directory', () => {
  const rootPath = testing.getManagedVenvRootPath()
  const envPath = testing.getManagedVenvPathByName('demo-env')
  const pythonPath = testing.getManagedVenvPythonPathByName('demo-env')

  assert.equal(envPath, path.join(rootPath, 'demo-env'))
  assert.equal(pythonPath, path.join(envPath, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])))
})

test('managed notebook venv helpers honor configured venv root directory', () => {
  const runtimeConfigPath = path.join(process.cwd(), '.tmp-utools', '.ai-tools-local', 'notebook-runtime.json')
  const configuredRoot = process.platform === 'win32'
    ? 'E:\\Portable\\AiToolsVenvs'
    : '/tmp/ai-tools-venvs'
  const previousContent = fs.existsSync(runtimeConfigPath) ? fs.readFileSync(runtimeConfigPath, 'utf-8') : null

  fs.mkdirSync(path.dirname(runtimeConfigPath), { recursive: true })
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({
    pythonPath: 'python',
    venvRoot: configuredRoot,
    noteEnvBindings: {},
    kernelName: '',
    startupTimeoutMs: 0,
    executeTimeoutMs: 0
  }, null, 2), 'utf-8')

  try {
    assert.equal(testing.getManagedVenvRootPath(), path.resolve(configuredRoot))
  } finally {
    if (previousContent === null) fs.rmSync(runtimeConfigPath, { force: true })
    else fs.writeFileSync(runtimeConfigPath, previousContent, 'utf-8')
  }
})

test('runtime path helpers resolve note-relative workspace and cwd into absolute paths', () => {
  const resolvedCwd = testing.resolveRuntimeFsPath('note/demo-notebook')
  const resolvedWorkspace = testing.resolveWorkspacePath({ workspacePath: 'note/demo-notebook' })

  assert.equal(resolvedCwd, path.join(process.cwd(), '.tmp-utools', 'note', 'demo-notebook'))
  assert.equal(resolvedWorkspace, path.join(process.cwd(), '.tmp-utools', 'note', 'demo-notebook'))
})

test('normalizeManagedVenvName rejects separators and dot names', () => {
  assert.equal(testing.normalizeManagedVenvName('ml-env'), 'ml-env')
  assert.throws(() => testing.normalizeManagedVenvName('nested/env'))
  assert.throws(() => testing.normalizeManagedVenvName('.'))
})

test('notebook timeout normalization supports unlimited startup and execute timeouts', () => {
  assert.equal(testing.normalizeStartupTimeoutMs(0, 15000), 0)
  assert.equal(testing.normalizeStartupTimeoutMs(-1, 15000), 0)
  assert.equal(testing.normalizeStartupTimeoutMs(1000, 15000), 3000)
  assert.equal(testing.normalizeExecutionTimeoutMs(0, 60000), 0)
  assert.equal(testing.normalizeExecutionTimeoutMs(-1, 60000), 0)
  assert.equal(testing.normalizeExecutionTimeoutMs(700000, 60000), 600000)
})

test('executeNotebookJavaScriptCell runs an isolated Node script', async () => {
  const result = await notebookRuntime.executeJavaScriptCell({
    code: 'console.log("hello from javascript cell")',
    timeoutMs: 10000,
    workspacePath: process.cwd()
  })

  assert.equal(result.ok, true)
  assert.match(String(result.stdout || ''), /hello from javascript cell/)
  assert.ok(Array.isArray(result.outputs))
  assert.match(String(JSON.stringify(result.outputs)), /hello from javascript cell/)
})
