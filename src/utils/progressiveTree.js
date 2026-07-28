export function splitIntoBatches(items, batchSize = 24) {
  const list = Array.isArray(items) ? items : []
  const size = Number.isFinite(Number(batchSize))
    ? Math.max(1, Math.floor(Number(batchSize)))
    : 24
  const batches = []

  for (let index = 0; index < list.length; index += size) {
    batches.push(list.slice(index, index + size))
  }

  return batches
}

export function mergeProgressiveTreeChildren(currentChildren, scannedChildren, options = {}) {
  const complete = options.complete === true
  const compare = typeof options.compare === 'function' ? options.compare : null
  const merged = new Map()

  if (!complete) {
    for (const node of Array.isArray(currentChildren) ? currentChildren : []) {
      const key = String(node?.key || '').trim()
      if (key) merged.set(key, node)
    }
  }

  for (const node of Array.isArray(scannedChildren) ? scannedChildren : []) {
    const key = String(node?.key || '').trim()
    if (key) merged.set(key, node)
  }

  const result = [...merged.values()]
  if (compare) result.sort(compare)
  return result
}
