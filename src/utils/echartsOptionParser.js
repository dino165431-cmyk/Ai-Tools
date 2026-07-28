const DEFAULT_MAX_SOURCE_LENGTH = 1_000_000
const DEFAULT_MAX_DEPTH = 100
const DEFAULT_MAX_NODES = 100_000
const BLOCKED_PROPERTY_NAMES = new Set(['__proto__', 'prototype', 'constructor'])

function createParseError(message, source, index) {
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, source.length))
  const prefix = source.slice(0, safeIndex)
  const line = prefix.split('\n').length
  const lastBreak = prefix.lastIndexOf('\n')
  const column = safeIndex - lastBreak
  return new SyntaxError(`${message}（第 ${line} 行，第 ${column} 列）`)
}

function unwrapOptionAssignment(source) {
  let text = String(source || '').replace(/^\uFEFF/, '').trim()
  const assignment = text.match(/^(?:(?:const|let|var)\s+)?option\s*=\s*/)
  if (assignment) text = text.slice(assignment[0].length).trim()
  if (/^return(?:\s|$)/.test(text)) text = text.replace(/^return(?:\s+|$)/, '').trim()
  return text
}

export function parseEchartsOptionSource(source, options = {}) {
  const text = unwrapOptionAssignment(source)
  const maxSourceLength = Math.max(1, Number(options.maxSourceLength) || DEFAULT_MAX_SOURCE_LENGTH)
  const maxDepth = Math.max(1, Number(options.maxDepth) || DEFAULT_MAX_DEPTH)
  const maxNodes = Math.max(1, Number(options.maxNodes) || DEFAULT_MAX_NODES)

  if (!text) throw new SyntaxError('ECharts 配置为空')
  if (text.length > maxSourceLength) {
    throw new SyntaxError(`ECharts 配置过大，最多允许 ${maxSourceLength} 个字符`)
  }

  let index = 0
  let nodeCount = 0

  function fail(message, at = index) {
    throw createParseError(message, text, at)
  }

  function countNode() {
    nodeCount += 1
    if (nodeCount > maxNodes) fail(`ECharts 配置节点过多，最多允许 ${maxNodes} 个节点`)
  }

  function skipWhitespaceAndComments() {
    while (index < text.length) {
      if (/\s/.test(text[index])) {
        index += 1
        continue
      }
      if (text[index] === '/' && text[index + 1] === '/') {
        index += 2
        while (index < text.length && text[index] !== '\n') index += 1
        continue
      }
      if (text[index] === '/' && text[index + 1] === '*') {
        const start = index
        index += 2
        while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
        if (index >= text.length) fail('块注释未闭合', start)
        index += 2
        continue
      }
      break
    }
  }

  function consume(expected) {
    skipWhitespaceAndComments()
    if (!text.startsWith(expected, index)) fail(`期望“${expected}”`)
    index += expected.length
  }

  function parseString() {
    const quote = text[index]
    const start = index
    index += 1
    let result = ''

    while (index < text.length) {
      const char = text[index]
      index += 1
      if (char === quote) return result
      if (char === '\n' || char === '\r') fail('字符串未闭合', start)
      if (char !== '\\') {
        result += char
        continue
      }

      if (index >= text.length) fail('字符串转义不完整', start)
      const escaped = text[index]
      index += 1
      const simpleEscapes = {
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
        0: '\0',
        '\\': '\\',
        '"': '"',
        "'": "'"
      }
      if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) {
        result += simpleEscapes[escaped]
        continue
      }
      if (escaped === '\n') continue
      if (escaped === '\r') {
        if (text[index] === '\n') index += 1
        continue
      }
      if (escaped === 'x') {
        const value = text.slice(index, index + 2)
        if (!/^[0-9a-fA-F]{2}$/.test(value)) fail('十六进制字符串转义无效', index - 2)
        result += String.fromCharCode(Number.parseInt(value, 16))
        index += 2
        continue
      }
      if (escaped === 'u') {
        const value = text.slice(index, index + 4)
        if (!/^[0-9a-fA-F]{4}$/.test(value)) fail('Unicode 字符串转义无效', index - 2)
        result += String.fromCharCode(Number.parseInt(value, 16))
        index += 4
        continue
      }
      result += escaped
    }

    fail('字符串未闭合', start)
  }

  function parseIdentifier() {
    const match = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(text.slice(index))
    if (!match) fail('标识符无效')
    index += match[0].length
    return match[0]
  }

  function parseNumber() {
    const match = /^[+-]?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(text.slice(index))
    if (!match) fail('数字无效')
    const raw = match[0]
    index += raw.length
    const value = Number(raw)
    if (!Number.isFinite(value)) fail('数字必须是有限值', index - raw.length)
    return value
  }

  function parseObject(depth) {
    consume('{')
    const result = {}
    skipWhitespaceAndComments()
    if (text[index] === '}') {
      index += 1
      return result
    }

    while (index < text.length) {
      skipWhitespaceAndComments()
      let key = ''
      if (text[index] === '"' || text[index] === "'") {
        key = parseString()
      } else if (/[A-Za-z_$]/.test(text[index] || '')) {
        key = parseIdentifier()
      } else if (/[+\-\d.]/.test(text[index] || '')) {
        key = String(parseNumber())
      } else {
        fail('对象属性名必须是字符串、数字或普通标识符')
      }

      if (BLOCKED_PROPERTY_NAMES.has(key)) {
        fail(`不允许使用危险属性名“${key}”`)
      }
      consume(':')
      result[key] = parseValue(depth + 1)
      skipWhitespaceAndComments()

      if (text[index] === '}') {
        index += 1
        return result
      }
      consume(',')
      skipWhitespaceAndComments()
      if (text[index] === '}') {
        index += 1
        return result
      }
    }

    fail('对象未闭合')
  }

  function parseArray(depth) {
    consume('[')
    const result = []
    skipWhitespaceAndComments()
    if (text[index] === ']') {
      index += 1
      return result
    }

    while (index < text.length) {
      result.push(parseValue(depth + 1))
      skipWhitespaceAndComments()
      if (text[index] === ']') {
        index += 1
        return result
      }
      consume(',')
      skipWhitespaceAndComments()
      if (text[index] === ']') {
        index += 1
        return result
      }
    }

    fail('数组未闭合')
  }

  function parseValue(depth = 0) {
    if (depth > maxDepth) fail(`ECharts 配置嵌套过深，最多允许 ${maxDepth} 层`)
    countNode()
    skipWhitespaceAndComments()
    const char = text[index]

    if (char === '{') return parseObject(depth)
    if (char === '[') return parseArray(depth)
    if (char === '"' || char === "'") return parseString()
    if (char === '(') {
      index += 1
      const value = parseValue(depth + 1)
      consume(')')
      return value
    }
    if (/[+\-\d.]/.test(char || '')) return parseNumber()
    if (/[A-Za-z_$]/.test(char || '')) {
      const start = index
      const identifier = parseIdentifier()
      if (identifier === 'true') return true
      if (identifier === 'false') return false
      if (identifier === 'null') return null
      fail(`不支持可执行表达式“${identifier}”；ECharts 配置只能包含静态数据`, start)
    }

    fail('无法识别的 ECharts 配置值')
  }

  const value = parseValue(0)
  skipWhitespaceAndComments()
  while (text[index] === ';') {
    index += 1
    skipWhitespaceAndComments()
  }
  if (index !== text.length) {
    fail('ECharts 配置后存在额外语句；仅允许一个静态对象')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyntaxError('ECharts option 需要是一个对象')
  }
  return value
}

