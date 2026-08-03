import { resolveChatSessionCreatedTimeMs } from '@/utils/chatSessionCreatedTime.js'

export function parseIsoTimeMs(value, fallback = 0) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) && ms > 0 ? ms : fallback
}

export function resolvePersistedSessionCreatedAtMs({
  record = null,
  payload = null,
  previousPayload = null
} = {}) {
  const candidates = []
  const recordCreatedAtMs = Number(record?.createdAt || 0)
  if (Number.isFinite(recordCreatedAtMs) && recordCreatedAtMs > 0) {
    candidates.push(recordCreatedAtMs)
  }

  const payloadCreatedAtMs = parseIsoTimeMs(payload?.createdAt)
  if (payloadCreatedAtMs > 0) candidates.push(payloadCreatedAtMs)

  const previousCreatedAtMs = resolveChatSessionCreatedTimeMs(previousPayload)
  if (previousCreatedAtMs > 0) candidates.push(previousCreatedAtMs)

  const previousSavedAtMs = parseIsoTimeMs(previousPayload?.savedAt)
  if (previousSavedAtMs > 0) candidates.push(previousSavedAtMs)

  if (!candidates.length) return 0
  return Math.min(...candidates)
}
