function parseTimeMs(value) {
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

export function resolveChatSessionCreatedTimeMs(data) {
  return (
    parseTimeMs(data?.source?.startedAt) ||
    parseTimeMs(data?.source?.createdAt) ||
    parseTimeMs(data?.createdAt) ||
    0
  )
}

