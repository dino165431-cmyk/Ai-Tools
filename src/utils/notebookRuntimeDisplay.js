export function buildRuntimeMagicPreludeOutputs(lines = []) {
  return Array.isArray(lines) && lines.length
    ? [{ output_type: 'stream', name: 'stdout', text: `${lines.join('\n')}\n` }]
    : []
}

export function mergeNotebookStreamOutputs(outputs = []) {
  const baseOutputs = Array.isArray(outputs) ? outputs : []
  const mergedOutputs = []

  baseOutputs.forEach((output) => {
    const current = output && typeof output === 'object' ? { ...output } : output
    const previous = mergedOutputs[mergedOutputs.length - 1]
    const currentType = String(current?.output_type || '').trim()
    const previousType = String(previous?.output_type || '').trim()
    const currentName = String(current?.name || 'stdout').trim() || 'stdout'
    const previousName = String(previous?.name || 'stdout').trim() || 'stdout'

    if (
      previous &&
      previousType === 'stream' &&
      currentType === 'stream' &&
      previousName === currentName
    ) {
      previous.text = `${String(previous.text || '')}${String(current.text || '')}`
      return
    }

    mergedOutputs.push(current)
  })

  return mergedOutputs
}

export function isScrollPositionNearBottom(scrollState = {}, threshold = 24) {
  const scrollTop = Math.max(0, Number(scrollState?.scrollTop) || 0)
  const clientHeight = Math.max(0, Number(scrollState?.clientHeight) || 0)
  const scrollHeight = Math.max(0, Number(scrollState?.scrollHeight) || 0)
  const margin = Math.max(0, Number(threshold) || 0)
  return scrollTop + clientHeight >= Math.max(0, scrollHeight - margin)
}

export function mergeRuntimeInputEchoOutputs(outputs = [], echoEntries = []) {
  const baseOutputs = Array.isArray(outputs) ? outputs : []
  const entries = Array.isArray(echoEntries) ? echoEntries.filter((item) => item?.output) : []
  if (!entries.length) return baseOutputs

  const sortedEntries = entries
    .map((item, index) => ({
      afterOutputCount: Math.max(0, Number(item?.afterOutputCount) || 0),
      output: item.output,
      index
    }))
    .sort((left, right) => left.afterOutputCount - right.afterOutputCount || left.index - right.index)

  const mergedOutputs = []
  let entryIndex = 0

  while (entryIndex < sortedEntries.length && sortedEntries[entryIndex].afterOutputCount <= 0) {
    mergedOutputs.push(sortedEntries[entryIndex].output)
    entryIndex += 1
  }

  baseOutputs.forEach((output, index) => {
    mergedOutputs.push(output)
    const outputCount = index + 1
    while (entryIndex < sortedEntries.length && sortedEntries[entryIndex].afterOutputCount <= outputCount) {
      mergedOutputs.push(sortedEntries[entryIndex].output)
      entryIndex += 1
    }
  })

  while (entryIndex < sortedEntries.length) {
    mergedOutputs.push(sortedEntries[entryIndex].output)
    entryIndex += 1
  }

  return mergedOutputs
}

export function buildRuntimeDisplayOutputs(lines = [], outputs = [], echoEntries = []) {
  return [
    ...buildRuntimeMagicPreludeOutputs(lines),
    ...mergeRuntimeInputEchoOutputs(outputs, echoEntries)
  ]
}
