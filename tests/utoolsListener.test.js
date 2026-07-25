import test from 'node:test'
import assert from 'node:assert/strict'

import utoolsListener, {
  resetUtoolsListenerState,
  setUtoolsLifecycleHandlers,
  useUtoolsEnterData
} from '../src/utils/utoolsListener.js'

function createMockUtoolsHost() {
  let enterCallback = null
  let outCallback = null
  let enterRegistrations = 0
  let outRegistrations = 0

  return {
    host: {
      onPluginEnter(callback) {
        enterRegistrations += 1
        enterCallback = callback
      },
      onPluginOut(callback) {
        outRegistrations += 1
        outCallback = callback
      }
    },
    fireEnter(payload) {
      enterCallback?.(payload)
    },
    fireOut(processExit) {
      outCallback?.(processExit)
    },
    getCounts() {
      return {
        enterRegistrations,
        outRegistrations
      }
    }
  }
}

test('utoolsListener reset allows host listeners to bind again', () => {
  const originalWindow = globalThis.window
  const firstHost = createMockUtoolsHost()
  const secondHost = createMockUtoolsHost()
  const enterEvents = []
  const outEvents = []

  try {
    globalThis.window = { utools: firstHost.host }
    setUtoolsLifecycleHandlers({
      onEnter(data) {
        enterEvents.push(data)
      },
      onOut(data) {
        outEvents.push(data)
      }
    })

    utoolsListener.init()
    assert.deepEqual(firstHost.getCounts(), { enterRegistrations: 1, outRegistrations: 1 })

    firstHost.fireEnter({ code: 'first', payload: 'a' })
    firstHost.fireOut(true)
    assert.equal(enterEvents.length, 1)
    assert.equal(outEvents.length, 1)
    assert.equal(useUtoolsEnterData().value.code, '')

    resetUtoolsListenerState()

    globalThis.window = { utools: secondHost.host }
    setUtoolsLifecycleHandlers({
      onEnter(data) {
        enterEvents.push(data)
      },
      onOut(data) {
        outEvents.push(data)
      }
    })

    utoolsListener.init()
    assert.deepEqual(secondHost.getCounts(), { enterRegistrations: 1, outRegistrations: 1 })

    secondHost.fireEnter({ code: 'second', payload: 'b' })
    secondHost.fireOut(false)
    assert.equal(enterEvents.length, 2)
    assert.equal(outEvents.length, 2)
    assert.equal(enterEvents[1].code, 'second')
    assert.equal(outEvents[1].processExit, false)
  } finally {
    resetUtoolsListenerState()
    globalThis.window = originalWindow
  }
})
