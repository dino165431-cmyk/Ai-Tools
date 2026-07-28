function getContentSearchApi() {
  return globalThis?.aiToolsApi?.contentSearch
}

export function hasContentSearchApi() {
  return typeof getContentSearchApi()?.searchNotes === 'function'
}

export function searchNotes(options = {}) {
  const api = getContentSearchApi()
  if (typeof api?.searchNotes !== 'function') {
    return Promise.reject(new Error('aiToolsApi.contentSearch.searchNotes 未注入'))
  }

  try {
    return Promise.resolve(api.searchNotes(options))
  } catch (error) {
    return Promise.reject(error)
  }
}
