import DOMPurify from 'dompurify'

const FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed', 'frame', 'frameset']

const SANITIZE_HTML_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: FORBIDDEN_TAGS
}

function resolvePurifyInstance() {
  if (typeof DOMPurify.sanitize === 'function') {
    return DOMPurify
  }

  if (typeof window !== 'undefined') {
    const factoryResult = DOMPurify(window)
    if (factoryResult && typeof factoryResult.sanitize === 'function') {
      return factoryResult
    }
  }

  return null
}

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return ''
  }

  const purify = resolvePurifyInstance()
  if (!purify) {
    return ''
  }

  return purify.sanitize(html, SANITIZE_HTML_CONFIG)
}

export { SANITIZE_HTML_CONFIG, FORBIDDEN_TAGS }
