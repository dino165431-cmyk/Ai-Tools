import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseAttachmentTextInWorker,
  parseAttachmentTextWithFallback,
  resetAttachmentTextParserWorker,
  shouldAllowMainThreadAttachmentFallback
} from '../src/utils/attachmentTextParser.js'

test('binary document parsers never fall back to the UI thread', async (t) => {
  const OriginalWorker = globalThis.Worker
  delete globalThis.Worker
  t.after(() => {
    if (OriginalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = OriginalWorker
  })

  assert.equal(shouldAllowMainThreadAttachmentFallback('xlsx'), false)
  assert.equal(shouldAllowMainThreadAttachmentFallback('docx'), false)
  assert.equal(shouldAllowMainThreadAttachmentFallback('txt'), true)

  await assert.rejects(
    parseAttachmentTextWithFallback({
      ext: 'xlsx',
      file: {
        name: 'unsafe.xlsx',
        arrayBuffer: async () => new ArrayBuffer(8)
      }
    }),
    /仅允许在隔离工作线程中解析/
  )
})

test('a stuck attachment worker is terminated after the parse timeout', async (t) => {
  const OriginalWorker = globalThis.Worker
  let terminated = false

  class HangingWorker {
    addEventListener() {}
    postMessage() {}
    terminate() {
      terminated = true
    }
  }

  globalThis.Worker = HangingWorker
  t.after(() => {
    resetAttachmentTextParserWorker()
    if (OriginalWorker === undefined) delete globalThis.Worker
    else globalThis.Worker = OriginalWorker
  })

  await assert.rejects(
    parseAttachmentTextInWorker({
      ext: 'xlsx',
      timeoutMs: 1,
      file: {
        name: 'stuck.xlsx',
        arrayBuffer: async () => new ArrayBuffer(8)
      }
    }),
    /附件解析超时/
  )
  assert.equal(terminated, true)
})
