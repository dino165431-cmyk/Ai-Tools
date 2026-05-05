import { readFile, writeFile } from './fileOperations'

function stripUtf8Bom(text) {
  const source = String(text ?? '')
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
}

function findFirstJsonValueRange(text) {
  const source = stripUtf8Bom(text)
  let start = 0
  while (start < source.length && /\s/.test(source[start])) start += 1
  if (start >= source.length) return null

  const first = source[start]
  if (first === '{' || first === '[') {
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }
      if (char === '{' || char === '[') {
        depth += 1
        continue
      }
      if (char === '}' || char === ']') {
        depth -= 1
        if (depth < 0) return null
        if (depth === 0) {
          return {
            start,
            end: index + 1,
            jsonText: source.slice(start, index + 1),
            trailingText: source.slice(index + 1)
          }
        }
      }
    }
    return null
  }

  const scalarMatch = source.slice(start).match(
    /^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:\\.|[^"\\])*")/
  )
  if (!scalarMatch) return null
  const jsonText = scalarMatch[0]
  const end = start + jsonText.length
  return {
    start,
    end,
    jsonText,
    trailingText: source.slice(end)
  }
}

export function parseSessionJsonText(text) {
  const source = stripUtf8Bom(text)
  try {
    return {
      ok: true,
      value: JSON.parse(source),
      recovered: false,
      normalizedText: source
    }
  } catch (error) {
    const range = findFirstJsonValueRange(source)
    if (!range || !/\S/.test(range.trailingText || '')) {
      return { ok: false, error }
    }

    try {
      return {
        ok: true,
        value: JSON.parse(range.jsonText),
        recovered: true,
        normalizedText: range.jsonText,
        trailingText: range.trailingText,
        error
      }
    } catch {
      return { ok: false, error }
    }
  }
}

export async function readSessionJsonFile(filePath, options = {}) {
  const content = await readFile(filePath, options.encoding || 'utf-8')
  const parsed = parseSessionJsonText(String(content || ''))
  if (!parsed.ok || !parsed.recovered || !options.repairIfRecovered) return parsed

  const spaces = Number.isFinite(options.spaces) ? Math.max(0, options.spaces) : 2
  const repairedText = JSON.stringify(parsed.value, null, spaces)
  try {
    await writeFile(filePath, repairedText)
    return {
      ...parsed,
      repaired: true,
      repairedText
    }
  } catch (repairError) {
    return {
      ...parsed,
      repaired: false,
      repairedText,
      repairError
    }
  }
}
