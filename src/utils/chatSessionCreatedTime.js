function parseTimeMs(value) {
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

export function resolveChatSessionCreatedTimeMs(data) {
  const createdAtMs = parseTimeMs(data?.createdAt)
  if (createdAtMs > 0) return createdAtMs

  const sourceCreatedAtMs = parseTimeMs(data?.source?.createdAt)
  if (sourceCreatedAtMs > 0) return sourceCreatedAtMs

  const titleReadyAtMs = parseTimeMs(data?.source?.titleReadyAt) || parseTimeMs(data?.titleReadyAt)
  if (titleReadyAtMs > 0) return titleReadyAtMs

  return 0
}
