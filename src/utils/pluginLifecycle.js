import { ref } from 'vue'

const lifecycleState = ref({
  active: false,
  sessionId: 0,
  enterCount: 0,
  lastEnterAt: '',
  lastOutAt: '',
  lastReason: '',
  lastProcessExit: false,
  lastEnterData: null
})

let nextCleanupId = 1
let operationQueue = Promise.resolve()
const cleanupTasks = new Map()

function enqueueOperation(task) {
  const next = operationQueue.then(() => task())
  operationQueue = next.catch(() => {})
  return next
}

function normalizeEnterData(data) {
  const safe = data && typeof data === 'object' ? data : {}
  const {
    code = '',
    type = '',
    payload = '',
    from = '',
    option = ''
  } = safe
  return { code, type, payload, from, option }
}

export function usePluginLifecycleState() {
  return lifecycleState
}

export function isPluginSessionActive() {
  return lifecycleState.value.active === true
}

export function registerCleanup(task, label = '') {
  if (typeof task !== 'function') return () => {}

  const id = nextCleanupId++
  cleanupTasks.set(id, {
    label: String(label || '').trim(),
    task
  })

  return () => {
    cleanupTasks.delete(id)
  }
}

async function runCleanupTasks(context = {}) {
  const tasks = Array.from(cleanupTasks.entries()).reverse()
  cleanupTasks.clear()

  for (const [, entry] of tasks) {
    try {
      await entry.task(context)
    } catch (err) {
      const suffix = entry.label ? ` (${entry.label})` : ''
      console.warn(`[lifecycle] cleanup failed${suffix}:`, err)
    }
  }
}

export function beginPluginSession(enterData = null) {
  return enqueueOperation(async () => {
    const normalizedEnterData = normalizeEnterData(enterData)
    const now = new Date().toISOString()

    if (!lifecycleState.value.active) {
      lifecycleState.value = {
        ...lifecycleState.value,
        active: true,
        sessionId: lifecycleState.value.sessionId + 1,
        enterCount: lifecycleState.value.enterCount + 1,
        lastEnterAt: now,
        lastOutAt: '',
        lastReason: '',
        lastProcessExit: false,
        lastEnterData: normalizedEnterData
      }
      return lifecycleState.value.sessionId
    }

    lifecycleState.value = {
      ...lifecycleState.value,
      active: true,
      lastEnterAt: now,
      lastEnterData: normalizedEnterData
    }
    return lifecycleState.value.sessionId
  })
}

export function disposePluginSession(context = {}) {
  return enqueueOperation(async () => {
    const now = new Date().toISOString()
    const reason = String(context?.reason || 'plugin_out').trim() || 'plugin_out'
    const sessionId = lifecycleState.value.sessionId

    lifecycleState.value = {
      ...lifecycleState.value,
      active: false,
      lastOutAt: now,
      lastReason: reason,
      lastProcessExit: !!context?.processExit,
      lastEnterData: null
    }

    await runCleanupTasks({
      ...context,
      reason,
      sessionId,
      outAt: now
    })
  })
}

export function resetPluginLifecycleState() {
  cleanupTasks.clear()
  operationQueue = Promise.resolve()
  lifecycleState.value = {
    active: false,
    sessionId: 0,
    enterCount: 0,
    lastEnterAt: '',
    lastOutAt: '',
    lastReason: '',
    lastProcessExit: false,
    lastEnterData: null
  }
}

export default {
  beginPluginSession,
  disposePluginSession,
  isPluginSessionActive,
  registerCleanup,
  resetPluginLifecycleState,
  usePluginLifecycleState
}
