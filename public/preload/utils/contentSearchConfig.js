const DEFAULT_CONTENT_SEARCH_CONFIG = Object.freeze({
  searchMode: 'keyword',
  embedding: Object.freeze({
    providerId: '',
    model: ''
  })
})

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeEmbedding(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    providerId: normalizeString(src.providerId),
    model: normalizeString(src.model)
  }
}

function normalizeContentSearchConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const searchMode = normalizeString(src.searchMode).toLowerCase() === 'hybrid' ? 'hybrid' : 'keyword'

  return {
    searchMode,
    embedding: normalizeEmbedding(src.embedding)
  }
}

function isContentSearchHybrid(raw) {
  return normalizeContentSearchConfig(raw).searchMode === 'hybrid'
}

module.exports = {
  DEFAULT_CONTENT_SEARCH_CONFIG,
  normalizeContentSearchConfig,
  isContentSearchHybrid
}
