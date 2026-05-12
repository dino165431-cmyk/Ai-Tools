import { completeAnyWord, completeFromList } from '@codemirror/autocomplete'
import { localCompletionSource, scopeCompletionSource, snippets as javascriptSnippetDefinitions } from '@codemirror/lang-javascript'
import { keywordCompletionSource, schemaCompletionSource, StandardSQL } from '@codemirror/lang-sql'

import { buildNotebookSqlStatementCompletionOptions } from '@/utils/notebookMagicCommands'
import { createSnippetCompletion, mergeCompletionOptions } from '@/utils/editorCompletion'

const NODE_GLOBAL_SCOPE = {
  console: globalThis.console,
  Math: globalThis.Math,
  JSON: globalThis.JSON,
  Array: globalThis.Array,
  Object: globalThis.Object,
  String: globalThis.String,
  Number: globalThis.Number,
  Boolean: globalThis.Boolean,
  Date: globalThis.Date,
  RegExp: globalThis.RegExp,
  Promise: globalThis.Promise,
  Error: globalThis.Error,
  process: globalThis.process || {},
  Buffer: globalThis.Buffer || {},
  setTimeout: globalThis.setTimeout,
  setInterval: globalThis.setInterval,
  clearTimeout: globalThis.clearTimeout,
  clearInterval: globalThis.clearInterval,
  queueMicrotask: globalThis.queueMicrotask,
  __dirname: '',
  __filename: '',
  module: {},
  exports: {},
  require: {}
}

const NODE_SNIPPETS = [
  createSnippetCompletion('console.log()', 'console.log()', 'method', 'Node.js'),
  createSnippetCompletion('console.error()', 'console.error()', 'method', 'Node.js'),
  createSnippetCompletion('async function', 'async function main() {\n  \n}\n', 'keyword', 'Node.js'),
  createSnippetCompletion('import fs from "node:fs/promises"', 'import fs from "node:fs/promises"', 'keyword', 'Node.js'),
  createSnippetCompletion('require("node:path")', 'const path = require("node:path")', 'keyword', 'Node.js')
]

const NODE_JAVASCRIPT_SNIPPET_SOURCE = completeFromList([
  ...javascriptSnippetDefinitions,
  ...NODE_SNIPPETS
])

const SQL_SNIPPET_DEFINITIONS = buildNotebookSqlStatementCompletionOptions()
const SQL_KEYWORD_COMPLETION_SOURCE = keywordCompletionSource(StandardSQL, true)

function normalizeSqlIdentifier(identifier = '') {
  return String(identifier || '')
    .trim()
    .split('.')
    .map((segment) => {
      const value = String(segment || '').trim()
      if (!value) return ''
      const quote = value[0]
      if (quote === '"' || quote === '\'' || quote === '`') {
        const closeIndex = value.indexOf(quote, 1)
        return value.slice(1, closeIndex > 0 ? closeIndex : value.length).trim()
      }
      const match = value.match(/^[A-Za-z_][\w$]*/)
      return match?.[0] || value
    })
    .filter(Boolean)
    .join('.')
}

function splitSqlColumnDefinitions(bodyText = '') {
  const chunks = []
  let buffer = ''
  let depth = 0
  let quote = ''

  for (const ch of String(bodyText || '')) {
    if (quote) {
      buffer += ch
      if (ch === quote) quote = ''
      continue
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      buffer += ch
      continue
    }

    if (ch === '(') {
      depth += 1
      buffer += ch
      continue
    }

    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      buffer += ch
      continue
    }

    if (ch === ',' && depth === 0) {
      chunks.push(buffer.trim())
      buffer = ''
      continue
    }

    buffer += ch
  }

  if (buffer.trim()) chunks.push(buffer.trim())
  return chunks
}

function extractSqlIdentifierList(statementText = '') {
  return splitSqlColumnDefinitions(statementText)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => {
      const head = item.split(/\s+/)[0] || ''
      return normalizeSqlIdentifier(head)
    })
    .filter((item) => item && !/^(constraint|primary|foreign|unique|check|index|key)$/i.test(item))
}

function parseSqlTableDefinitions(sourceText = '') {
  const text = String(sourceText || '')
  const tables = new Map()
  const pattern = /(^|\n)\s*create\s+(?:temp|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][\w$]*(?:\s*\.\s*[A-Za-z_][\w$]*)*)\s*\(/gi

  let match
  while ((match = pattern.exec(text))) {
    const tableName = normalizeSqlIdentifier(match[2] || '')
    if (!tableName) continue

    const openParenIndex = text.indexOf('(', pattern.lastIndex - 1)
    if (openParenIndex < 0) continue

    let depth = 0
    let quote = ''
    let closeParenIndex = -1
    for (let index = openParenIndex; index < text.length; index += 1) {
      const ch = text[index]
      if (quote) {
        if (ch === quote) quote = ''
        continue
      }
      if (ch === '\'' || ch === '"' || ch === '`') {
        quote = ch
        continue
      }
      if (ch === '(') {
        depth += 1
        continue
      }
      if (ch === ')') {
        depth -= 1
        if (depth === 0) {
          closeParenIndex = index
          break
        }
      }
    }

    if (closeParenIndex < 0) continue
    const bodyText = text.slice(openParenIndex + 1, closeParenIndex)
    const columns = extractSqlIdentifierList(bodyText)
    if (!tables.has(tableName)) {
      tables.set(tableName, new Set())
    }
    const existing = tables.get(tableName)
    columns.forEach((column) => existing.add(column))
  }

  return tables
}

function inferSqlSchemaFromText(sourceText = '') {
  const schema = {}
  const tables = parseSqlTableDefinitions(sourceText)

  tables.forEach((columns, tableName) => {
    schema[tableName] = Array.from(columns).sort((a, b) => a.localeCompare(b))
  })

  return schema
}

function getSqlDefaultTableName(sourceText = '', schema = {}) {
  const tables = Object.keys(schema || {})
  if (tables.length === 1) return tables[0]

  const text = String(sourceText || '')
  const matches = []
  const pattern = /\b(?:from|join|update|into)\s+([A-Za-z_][\w$]*(?:\s*\.\s*[A-Za-z_][\w$]*)*)/gi
  let match
  while ((match = pattern.exec(text))) {
    const tableName = normalizeSqlIdentifier(match[1] || '')
    if (tableName) matches.push(tableName)
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (schema[matches[index]]) return matches[index]
  }

  return ''
}

export function createNotebookJavaScriptCompletionSource() {
  const scopeSource = scopeCompletionSource(NODE_GLOBAL_SCOPE)

  return (context) => {
    const snippetResult = NODE_JAVASCRIPT_SNIPPET_SOURCE(context)
    const localResult = localCompletionSource(context)
    const scopeResult = scopeSource(context)
    const anyWordResult = completeAnyWord(context)
    const options = mergeCompletionOptions([
      snippetResult?.options || [],
      localResult?.options || [],
      scopeResult?.options || [],
      anyWordResult?.options || []
    ])

    if (!options.length) return null

    return {
      from: Math.min(
        snippetResult?.from ?? context.pos,
        localResult?.from ?? context.pos,
        scopeResult?.from ?? context.pos,
        anyWordResult?.from ?? context.pos
      ),
      options,
      validFor: /^[A-Za-z0-9_$.\[\]]*$/
    }
  }
}

export function createNotebookSqlCompletionSource(sourceText = '') {
  const schema = inferSqlSchemaFromText(sourceText)
  const defaultTable = getSqlDefaultTableName(sourceText, schema)
  const snippetSource = completeFromList(SQL_SNIPPET_DEFINITIONS)
  const schemaSource = schemaCompletionSource({
    dialect: StandardSQL,
    schema,
    defaultTable: defaultTable || undefined,
    upperCaseKeywords: true
  })

  return (context) => {
    const snippetResult = snippetSource(context)
    const keywordResult = SQL_KEYWORD_COMPLETION_SOURCE(context)
    const schemaResult = schemaSource(context)
    const anyWordResult = completeAnyWord(context)
    const options = mergeCompletionOptions([
      snippetResult?.options || [],
      keywordResult?.options || [],
      schemaResult?.options || [],
      anyWordResult?.options || []
    ])

    if (!options.length) return null

    return {
      from: Math.min(
        snippetResult?.from ?? context.pos,
        keywordResult?.from ?? context.pos,
        schemaResult?.from ?? context.pos,
        anyWordResult?.from ?? context.pos
      ),
      options,
      validFor: /^[A-Za-z0-9_$.]*$/
    }
  }
}

export function buildSqlSchemaSuggestionSource(sourceText = '') {
  return inferSqlSchemaFromText(sourceText)
}

export function buildNodeJsCompletionScope() {
  return NODE_GLOBAL_SCOPE
}
