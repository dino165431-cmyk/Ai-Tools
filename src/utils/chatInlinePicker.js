export const INLINE_COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({
    kind: 'prompt',
    label: '提示词',
    token: '/prompt',
    aliases: Object.freeze(['p']),
    description: '选择提示词'
  }),
  Object.freeze({
    kind: 'skill',
    label: '技能',
    token: '/skill',
    aliases: Object.freeze(['s']),
    description: '选择技能'
  }),
  Object.freeze({
    kind: 'mcp',
    label: 'MCP',
    token: '/mcp',
    aliases: Object.freeze(['m']),
    description: '选择 MCP'
  })
])

export const INLINE_COMMAND_KIND_LABELS = Object.freeze(
  Object.fromEntries(INLINE_COMMAND_DEFINITIONS.map((item) => [item.kind, item.label]))
)

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase()
}

function splitSearchTerms(query) {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean)
}

function getCandidateTexts(candidates) {
  return (Array.isArray(candidates) ? candidates : [candidates]).map(normalizeSearchText).filter(Boolean)
}

function hasWordPrefix(text, query) {
  return text.split(/[\s/_-]+/).some((part) => part && part.startsWith(query))
}

function findPreviousTriggerIndex(text, trigger, currentIndex) {
  if (currentIndex <= 0) return -1
  return text.lastIndexOf(trigger, currentIndex - 1)
}

function findInlineCommandDefinition(token) {
  const normalizedToken = normalizeSearchText(token)
  if (!normalizedToken) return null
  return (
    INLINE_COMMAND_DEFINITIONS.find((item) => item.kind === normalizedToken || item.aliases.includes(normalizedToken)) ||
    null
  )
}

function hasInlineCommandPrefix(token) {
  const normalizedToken = normalizeSearchText(token)
  if (!normalizedToken) return true
  return INLINE_COMMAND_DEFINITIONS.some(
    (item) => item.kind.startsWith(normalizedToken) || item.aliases.some((alias) => alias.startsWith(normalizedToken))
  )
}

export function getInlinePickerMatchScore(candidates, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return Number.POSITIVE_INFINITY

  const texts = getCandidateTexts(candidates)
  if (!texts.length) return Number.POSITIVE_INFINITY

  if (texts.some((text) => text === normalizedQuery)) return 0
  if (texts.some((text) => text.startsWith(normalizedQuery))) return 1
  if (texts.some((text) => hasWordPrefix(text, normalizedQuery))) return 2
  if (texts.some((text) => text.includes(normalizedQuery))) return 3

  const terms = splitSearchTerms(normalizedQuery)
  if (terms.length <= 1) return Number.POSITIVE_INFINITY

  let totalScore = 0
  for (const term of terms) {
    let best = Number.POSITIVE_INFINITY
    texts.forEach((text) => {
      if (text === term) best = Math.min(best, 0)
      else if (text.startsWith(term)) best = Math.min(best, 1)
      else if (hasWordPrefix(text, term)) best = Math.min(best, 2)
      else if (text.includes(term)) best = Math.min(best, 3)
    })
    if (!Number.isFinite(best)) return Number.POSITIVE_INFINITY
    totalScore += best
  }

  return totalScore + 3
}

export function extractInlineAgentContext(text, caret) {
  const raw = String(text || '')
  const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(raw.length, caret)) : raw.length
  const beforeCaret = raw.slice(0, safeCaret)
  const atIndex = beforeCaret.lastIndexOf('@')
  if (atIndex < 0) return null

  const prevChar = atIndex === 0 ? '' : raw[atIndex - 1]
  if (prevChar && !/[\s\n]/.test(prevChar)) return null

  const queryBeforeCaret = raw.slice(atIndex + 1, safeCaret)
  if (/[\s\n]/.test(queryBeforeCaret)) return null

  const queryAfterCaretMatch = raw.slice(safeCaret).match(/^[^\s\n]*/)
  const queryAfterCaret = queryAfterCaretMatch ? queryAfterCaretMatch[0] : ''

  return {
    query: `${queryBeforeCaret}${queryAfterCaret}`,
    start: atIndex,
    end: safeCaret + queryAfterCaret.length
  }
}

export function extractInlineCommandContext(text, caret) {
  const raw = String(text || '')
  const safeCaret = Number.isFinite(caret) ? Math.max(0, Math.min(raw.length, caret)) : raw.length
  const beforeCaret = raw.slice(0, safeCaret)
  let slashIndex = beforeCaret.lastIndexOf('/')

  while (slashIndex >= 0) {
    const prevChar = slashIndex === 0 ? '' : raw[slashIndex - 1]
    if (prevChar && !/[\s\n]/.test(prevChar)) {
      slashIndex = findPreviousTriggerIndex(beforeCaret, '/', slashIndex)
      continue
    }

    const commandTokenMatch = raw.slice(slashIndex + 1).match(/^[^\s\n]*/)
    const commandToken = commandTokenMatch ? commandTokenMatch[0] : ''
    const commandEnd = slashIndex + 1 + commandToken.length
    const command = findInlineCommandDefinition(commandToken)
    const nextChar = raw[commandEnd] || ''

    if (command && (!nextChar || /[\s\n]/.test(nextChar))) {
      let queryStart = commandEnd
      let queryEnd = commandEnd
      const trailing = raw.slice(commandEnd)

      if (/^[ \t]+/.test(trailing)) {
        const spaces = trailing.match(/^[ \t]+/)?.[0] || ''
        queryStart = commandEnd + spaces.length
        queryEnd = queryStart + (raw.slice(queryStart).match(/^[^\s\n]*/)?.[0].length || 0)
      }

      if (safeCaret >= slashIndex && safeCaret <= queryEnd) {
        return {
          mode: 'item',
          type: command.kind,
          query: raw.slice(queryStart, queryEnd).trim(),
          start: slashIndex,
          end: queryEnd
        }
      }
    }

    if (safeCaret >= slashIndex && safeCaret <= commandEnd && hasInlineCommandPrefix(commandToken)) {
      return {
        mode: 'kind',
        type: '',
        query: normalizeSearchText(commandToken),
        start: slashIndex,
        end: commandEnd
      }
    }

    slashIndex = findPreviousTriggerIndex(beforeCaret, '/', slashIndex)
  }

  return null
}
