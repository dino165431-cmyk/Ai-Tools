export function buildRuntimeMagicPreludeOutputs(lines = []) {
  return Array.isArray(lines) && lines.length
    ? [{ output_type: 'stream', name: 'stdout', text: `${lines.join('\n')}\n` }]
    : []
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
