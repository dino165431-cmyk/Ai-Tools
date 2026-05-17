function parseTimeMs(value) {
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function collectCandidateTimeMs(target, bucket) {
  if (!target || typeof target !== 'object') return

  const directKeys = ['time', 'createdAt', 'savedAt', 'updatedAt', 'timestamp']
  directKeys.forEach((key) => {
    const ms = parseTimeMs(target?.[key])
    if (ms > 0) bucket.push(ms)
  })

  if (Array.isArray(target?.parts)) {
    target.parts.forEach((part) => collectCandidateTimeMs(part, bucket))
  }
}

function inferCreatedTimeMsFromMessages(data) {
  const candidates = []
  const displayMessages = Array.isArray(data?.session?.messages)
    ? data.session.messages
    : Array.isArray(data?.messages)
      ? data.messages
      : []
  const apiMessages = Array.isArray(data?.session?.apiMessages)
    ? data.session.apiMessages
    : Array.isArray(data?.apiMessages)
      ? data.apiMessages
      : []

  displayMessages.forEach((item) => collectCandidateTimeMs(item, candidates))
  apiMessages.forEach((item) => collectCandidateTimeMs(item, candidates))

  if (!candidates.length) return 0
  return Math.min(...candidates)
}

function collectMetadataCandidateTimeMs(data) {
  const candidates = [
    parseTimeMs(data?.source?.startedAt),
    parseTimeMs(data?.source?.createdAt),
    parseTimeMs(data?.session?.createdAt),
    parseTimeMs(data?.createdAt)
  ].filter((ms) => Number.isFinite(ms) && ms > 0)
  return candidates
}

export function resolveChatSessionCreatedTimeMs(data) {
  const candidates = collectMetadataCandidateTimeMs(data)
  const inferredTimeMs = inferCreatedTimeMsFromMessages(data)
  if (inferredTimeMs > 0) candidates.push(inferredTimeMs)
  return candidates.length ? Math.min(...candidates) : 0
}

