export function withTimeout(promise, timeoutMs, label, onTimeout = null) {
  const ms = Number(timeoutMs)
  if (!ms || ms <= 0) return promise

  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        // ignore
      }
      const err = new Error(`${label || 'Operation'} timed out (${ms}ms)`)
      err.name = 'TimeoutError'
      reject(err)
    }, ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) globalThis.clearTimeout(timer)
  })
}

function createLinkedAbortController(parentSignal = null) {
  const controller = new AbortController()
  let cleanup = () => {}
  const abort = () => {
    try {
      if (!controller.signal.aborted) controller.abort()
    } catch {
      // ignore
    }
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abort()
    } else {
      const onAbort = () => abort()
      parentSignal.addEventListener('abort', onAbort, { once: true })
      cleanup = () => parentSignal.removeEventListener('abort', onAbort)
    }
  }

  return { signal: controller.signal, abort, cleanup }
}

export function getRemainingTimeoutMs(startedAt, timeoutMs) {
  const total = Number(timeoutMs)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, total - Math.max(0, Date.now() - startedAt))
}

export async function withAbortableTimeout(task, timeoutMs, label, parentSignal = null) {
  const linked = createLinkedAbortController(parentSignal)
  try {
    return await withTimeout(
      Promise.resolve().then(() => task(linked.signal)),
      timeoutMs,
      label,
      linked.abort
    )
  } finally {
    linked.cleanup()
  }
}

export function createAbortError(message = 'Aborted') {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

export function isAbortError(err) {
  return err?.name === 'AbortError'
}

export function isTimeoutError(err) {
  return err?.name === 'TimeoutError'
}

export function throwIfAborted(abortState, message = 'Aborted') {
  if (abortState?.aborted) throw createAbortError(message)
}

export function waitForAbortable(promise, abortState, message = 'Aborted') {
  throwIfAborted(abortState, message)
  if (!abortState?.onAbort) return promise

  return new Promise((resolve, reject) => {
    let settled = false
    let unregisterAbort = null
    const finish = (fn) => {
      if (settled) return
      settled = true
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      fn()
    }

    unregisterAbort = abortState.onAbort(() => {
      finish(() => reject(createAbortError(message)))
    })

    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (err) => finish(() => reject(err))
    )
  })
}
