const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function resolveExternalUrl(rawHref) {
  const href = String(rawHref || '').trim()
  if (!href) return null

  try {
    return new URL(href)
  } catch {
    return null
  }
}

export function getSafeExternalUrl(rawHref) {
  const parsed = resolveExternalUrl(rawHref)
  if (!parsed) return null
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null
  return parsed
}

export function isSafeExternalUrl(rawHref) {
  return !!getSafeExternalUrl(rawHref)
}

export function safeOpenExternal(rawHref) {
  const parsed = getSafeExternalUrl(rawHref)
  if (!parsed) return false

  const href = parsed.toString()
  const shellOpenExternal = globalThis?.utools?.shellOpenExternal
  if (typeof shellOpenExternal === 'function') {
    try {
      shellOpenExternal(href)
      return true
    } catch {
      return false
    }
  }

  return false
}

export const SAFE_EXTERNAL_PROTOCOLS = Object.freeze(Array.from(ALLOWED_EXTERNAL_PROTOCOLS))
