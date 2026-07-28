export const CHAT_RUN_INPUT_MODE_QUEUE = 'queue'
export const CHAT_RUN_INPUT_MODE_STEER = 'steer'

const VALID_MODES = new Set([
  CHAT_RUN_INPUT_MODE_QUEUE,
  CHAT_RUN_INPUT_MODE_STEER
])

function normalizeSessionId(value) {
  return String(value || '').trim()
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return VALID_MODES.has(mode) ? mode : CHAT_RUN_INPUT_MODE_QUEUE
}

function compareEntries(left, right) {
  const leftSequence = Number(left?.sequence || 0)
  const rightSequence = Number(right?.sequence || 0)
  if (leftSequence !== rightSequence) return leftSequence - rightSequence
  return String(left?.id || '').localeCompare(String(right?.id || ''))
}

export function createChatRunInputQueue({
  createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  now = () => Date.now()
} = {}) {
  const entriesBySessionId = new Map()
  let nextSequence = 0

  function getMutableEntries(sessionId, create = false) {
    const id = normalizeSessionId(sessionId)
    if (!id) return null
    let entries = entriesBySessionId.get(id)
    if (!entries && create) {
      entries = []
      entriesBySessionId.set(id, entries)
    }
    return entries || null
  }

  function enqueue(sessionId, payload = {}, mode = CHAT_RUN_INPUT_MODE_QUEUE) {
    const id = normalizeSessionId(sessionId)
    if (!id) throw new Error('sessionId is required')

    const text = String(payload?.text || '').trim()
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments.slice() : []
    if (!text && !attachments.length) return null

    nextSequence += 1
    const entry = {
      id: String(createId() || '').trim() || `queued-${nextSequence}`,
      sessionId: id,
      mode: normalizeMode(mode),
      text,
      attachments,
      createdAt: Number(now()) || Date.now(),
      sequence: nextSequence
    }
    getMutableEntries(id, true).push(entry)
    return entry
  }

  function list(sessionId) {
    return [...(getMutableEntries(sessionId) || [])].sort(compareEntries)
  }

  function count(sessionId, mode = '') {
    const normalizedMode = String(mode || '').trim() ? normalizeMode(mode) : ''
    return list(sessionId).filter((entry) => !normalizedMode || entry.mode === normalizedMode).length
  }

  function remove(sessionId, entryId) {
    const entries = getMutableEntries(sessionId)
    if (!entries?.length) return null
    const index = entries.findIndex((entry) => String(entry?.id || '') === String(entryId || ''))
    if (index < 0) return null
    const [removed] = entries.splice(index, 1)
    if (!entries.length) entriesBySessionId.delete(normalizeSessionId(sessionId))
    return removed || null
  }

  function takeSteering(sessionId) {
    const entries = list(sessionId).filter((entry) => entry.mode === CHAT_RUN_INPUT_MODE_STEER)
    entries.forEach((entry) => remove(sessionId, entry.id))
    return entries
  }

  function takeNext(sessionId) {
    const entries = list(sessionId)
    const next =
      entries.find((entry) => entry.mode === CHAT_RUN_INPUT_MODE_STEER) ||
      entries.find((entry) => entry.mode === CHAT_RUN_INPUT_MODE_QUEUE) ||
      null
    if (!next) return null
    remove(sessionId, next.id)
    return next
  }

  function restore(sessionId, entries) {
    const id = normalizeSessionId(sessionId)
    if (!id) return []
    const restored = []
    const target = getMutableEntries(id, true)
    const existingIds = new Set(target.map((entry) => String(entry?.id || '')))
    for (const rawEntry of Array.isArray(entries) ? entries : []) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entryId = String(rawEntry.id || '').trim()
      if (!entryId || existingIds.has(entryId)) continue
      const entry = {
        ...rawEntry,
        id: entryId,
        sessionId: id,
        mode: normalizeMode(rawEntry.mode),
        text: String(rawEntry.text || '').trim(),
        attachments: Array.isArray(rawEntry.attachments) ? rawEntry.attachments.slice() : [],
        createdAt: Number(rawEntry.createdAt) || Number(now()) || Date.now(),
        sequence: Math.max(1, Number(rawEntry.sequence) || ++nextSequence)
      }
      nextSequence = Math.max(nextSequence, entry.sequence)
      target.push(entry)
      existingIds.add(entryId)
      restored.push(entry)
    }
    target.sort(compareEntries)
    if (!target.length) entriesBySessionId.delete(id)
    return restored
  }

  function clear(sessionId) {
    const id = normalizeSessionId(sessionId)
    if (!id) return 0
    const countBeforeClear = getMutableEntries(id)?.length || 0
    entriesBySessionId.delete(id)
    return countBeforeClear
  }

  function clearAll() {
    entriesBySessionId.clear()
  }

  return {
    enqueue,
    list,
    count,
    remove,
    takeSteering,
    takeNext,
    restore,
    clear,
    clearAll
  }
}
