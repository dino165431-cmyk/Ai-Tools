export function useChatStreamingTextBuffer({
  isDisplayMessageInActiveSession,
  scheduleScrollToBottom,
  maybeScheduleScrollToBottomForRun
}) {
const TYPEWRITER_INTERVAL_MS = 16
const DEFERRED_TEXT_APPEND_INTERVAL_MS = 32
const typewriterStates = new Map()
const deferredMessageFieldStates = new Map()

function takeUnicodeChunk(text, count = 1) {
  if (!text) return { chunk: '', rest: '' }
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1
  let end = 0
  let taken = 0
  while (taken < safeCount && end < text.length) {
    const cp = text.codePointAt(end)
    end += cp && cp > 0xffff ? 2 : 1
    taken += 1
  }
  return { chunk: text.slice(0, end), rest: text.slice(end) }
}

function getTypewriterChunkSize(text) {
  const length = String(text || '').length
  if (length > 6000) return 96
  if (length > 2400) return 56
  if (length > 1200) return 32
  if (length > 480) return 16
  if (length > 180) return 8
  if (length > 80) return 4
  if (length > 24) return 2
  return 1
}

function ensureTypewriterState(messageId) {
  let state = typewriterStates.get(messageId)
  if (state) return state
  state = { buffer: '', running: false, timer: null, idleResolvers: [], message: null }
  typewriterStates.set(messageId, state)
  return state
}

function typewriterEnqueue(message, text) {
  const chunk = String(text || '')
  if (!chunk) return
  if (!isDisplayMessageInActiveSession(message)) {
    message.content += chunk
    return
  }
  const state = ensureTypewriterState(message.id)
  state.message = message
  state.buffer += chunk

  if (state.running) return
  state.running = true

  const tick = () => {
    if (!state.buffer) {
      state.running = false
      state.timer = null
      const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
      resolvers.forEach((r) => r())
      return
    }

    if (!isDisplayMessageInActiveSession(message)) {
      message.content += state.buffer
      state.buffer = ''
      state.running = false
      state.timer = null
      const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
      resolvers.forEach((r) => r())
      return
    }

    const { chunk: nextChunk, rest } = takeUnicodeChunk(state.buffer, getTypewriterChunkSize(state.buffer))
    state.buffer = rest
    message.content += nextChunk
    scheduleScrollToBottom()

    state.timer = window.setTimeout(tick, TYPEWRITER_INTERVAL_MS)
  }

  tick()
}

function typewriterWaitIdle(messageId) {
  const state = typewriterStates.get(messageId)
  if (!state) return Promise.resolve()
  if (!state.running && !state.buffer) return Promise.resolve()
  return new Promise((resolve) => state.idleResolvers.push(resolve))
}

function deferredMessageFieldKey(messageId, field) {
  return `${String(messageId || '').trim()}:${String(field || '').trim()}`
}

function ensureDeferredMessageFieldState(messageId, field) {
  const key = deferredMessageFieldKey(messageId, field)
  let state = deferredMessageFieldStates.get(key)
  if (state) return state
  state = { key, field, buffer: '', timer: null, idleResolvers: [], message: null }
  deferredMessageFieldStates.set(key, state)
  return state
}

function deferredAppendMessageField(message, field, text, options = {}) {
  const chunk = String(text || '')
  if (!chunk || !message || typeof message !== 'object') return
  const targetField = String(field || '').trim()
  if (!targetField) return
  const intervalMs = Math.max(16, Number(options.intervalMs) || DEFERRED_TEXT_APPEND_INTERVAL_MS)
  const scheduleScroll = options.scheduleScroll === true

  if (!isDisplayMessageInActiveSession(message)) {
    message[targetField] = String(message[targetField] || '') + chunk
    return
  }

  const state = ensureDeferredMessageFieldState(message.id, targetField)
  state.message = message
  state.buffer += chunk

  if (state.timer) return
  state.timer = window.setTimeout(() => {
    state.timer = null
    if (state.message && state.buffer) {
      state.message[targetField] = String(state.message[targetField] || '') + state.buffer
      state.buffer = ''
      if (scheduleScroll && isDisplayMessageInActiveSession(state.message)) {
        maybeScheduleScrollToBottomForRun()
      }
    }
    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
  }, intervalMs)
}

function deferredMessageFieldWaitIdle(messageId, field) {
  const state = deferredMessageFieldStates.get(deferredMessageFieldKey(messageId, field))
  if (!state) return Promise.resolve()
  if (!state.timer && !state.buffer) return Promise.resolve()
  return new Promise((resolve) => state.idleResolvers.push(resolve))
}

function flushDeferredMessageFieldsForMessage(messageId) {
  const targetId = String(messageId || '').trim()
  if (!targetId) return
  for (const [key, state] of deferredMessageFieldStates.entries()) {
    if (!key.startsWith(`${targetId}:`)) continue
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null
    if (state.message && state.buffer) {
      state.message[state.field] = String(state.message[state.field] || '') + state.buffer
      state.buffer = ''
    }
    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
    deferredMessageFieldStates.delete(key)
  }
}

function deferredMessageFieldFlushAll() {
  for (const [key, state] of deferredMessageFieldStates.entries()) {
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null

    if (state.message && state.buffer) {
      state.message[state.field] = String(state.message[state.field] || '') + state.buffer
      state.buffer = ''
    }

    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((resolve) => resolve())
    deferredMessageFieldStates.delete(key)
  }
}

function typewriterFlushAll() {
  for (const [id, state] of typewriterStates.entries()) {
    if (state.timer) window.clearTimeout(state.timer)
    state.timer = null
    state.running = false

    if (state.message && state.buffer) {
      state.message.content += state.buffer
      state.buffer = ''
    }

    const resolvers = state.idleResolvers.splice(0, state.idleResolvers.length)
    resolvers.forEach((r) => r())

    typewriterStates.delete(id)
  }
  deferredMessageFieldFlushAll()
}

  return {
    typewriterStates,
    typewriterEnqueue,
    typewriterWaitIdle,
    deferredAppendMessageField,
    deferredMessageFieldWaitIdle,
    flushDeferredMessageFieldsForMessage,
    deferredMessageFieldFlushAll,
    typewriterFlushAll
  }
}
