export function isComposerCompositionKeydownEvent(e) {
  return !!e && (e.isComposing === true || e.keyCode === 229)
}

export function shouldSubmitComposerKeydownEvent(e) {
  if (isComposerCompositionKeydownEvent(e)) return false
  return !!e && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
}

export function buildUtoolsEnterEventKey(val) {
  if (!val || typeof val !== 'object') return ''
  if (val.code !== 'Ai' || val.type !== 'over') return ''
  const payload = typeof val.payload === 'string' ? val.payload : ''
  if (!payload) return ''
  return `${val.code}|${val.type}|${payload}`
}
