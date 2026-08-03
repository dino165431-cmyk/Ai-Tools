import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

const chatSource = fs.readFileSync(path.resolve('src/views/pages/chat/Chat.vue'), 'utf8')
const scriptOpen = '<script setup>'
const scriptStart = chatSource.indexOf(scriptOpen)
const scriptEnd = chatSource.indexOf('</script>', scriptStart)

assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, 'Chat.vue must contain a script setup block')

const scriptContentStart = scriptStart + scriptOpen.length
const scriptContent = chatSource.slice(scriptContentStart, scriptEnd)
const scriptLineOffset = chatSource.slice(0, scriptContentStart).split(/\r?\n/).length - 1
const scriptAst = parse(scriptContent, { sourceType: 'module' })

function collectPatternBindings(pattern, readyAt, declarationLine, bindings) {
  if (!pattern) return
  if (pattern.type === 'Identifier') {
    bindings.set(pattern.name, { readyAt, declarationLine })
    return
  }
  if (pattern.type === 'RestElement') {
    collectPatternBindings(pattern.argument, readyAt, declarationLine, bindings)
    return
  }
  if (pattern.type === 'AssignmentPattern') {
    collectPatternBindings(pattern.left, readyAt, declarationLine, bindings)
    return
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      collectPatternBindings(
        property.type === 'RestElement' ? property.argument : property.value,
        readyAt,
        declarationLine,
        bindings
      )
    }
    return
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      collectPatternBindings(element, readyAt, declarationLine, bindings)
    }
  }
}

function hasImmediateWatchOption(call) {
  const options = call.arguments[2]
  if (options?.type !== 'ObjectExpression') return false
  return options.properties.some((property) => {
    if (property.type !== 'ObjectProperty' || property.computed) return false
    const key = property.key.type === 'Identifier' ? property.key.name : property.key.value
    return key === 'immediate' && property.value.type === 'BooleanLiteral' && property.value.value
  })
}

function findEagerTopLevelTdzReferences(ast) {
  const bindings = new Map()
  const functions = new Map()
  const computedGetters = new Map()

  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        bindings.set(specifier.local.name, {
          readyAt: -1,
          declarationLine: specifier.loc.start.line + scriptLineOffset
        })
      }
      continue
    }
    if (statement.type === 'FunctionDeclaration' && statement.id) {
      bindings.set(statement.id.name, {
        readyAt: -1,
        declarationLine: statement.loc.start.line + scriptLineOffset
      })
      functions.set(statement.id.name, statement)
      continue
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        collectPatternBindings(
          declaration.id,
          statement.kind === 'var' ? -1 : declaration.end,
          declaration.loc.start.line + scriptLineOffset,
          bindings
        )
        if (
          declaration.id.type === 'Identifier' &&
          declaration.init?.type === 'CallExpression' &&
          declaration.init.callee.type === 'Identifier' &&
          declaration.init.callee.name === 'computed' &&
          ['ArrowFunctionExpression', 'FunctionExpression'].includes(declaration.init.arguments[0]?.type)
        ) {
          computedGetters.set(declaration.id.name, declaration.init.arguments[0])
        }
      }
      continue
    }
    if (statement.type === 'ClassDeclaration' && statement.id) {
      bindings.set(statement.id.name, {
        readyAt: statement.end,
        declarationLine: statement.loc.start.line + scriptLineOffset
      })
    }
  }

  const violations = []
  const skippedFunctionNodes = new Set([
    'FunctionExpression',
    'ArrowFunctionExpression',
    'FunctionDeclaration',
    'ClassMethod',
    'ObjectMethod'
  ])

  function isNonReferenceIdentifier(node, parent, key) {
    return (
      ((parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression') &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed && !parent.shorthand) ||
      (parent?.type === 'LabeledStatement' && key === 'label') ||
      ((parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') && key === 'label')
    )
  }

  function walkEager(node, parent, key, state) {
    if (!node || typeof node !== 'object') return
    if (skippedFunctionNodes.has(node.type)) return

    if (node.type === 'Identifier') {
      if (isNonReferenceIdentifier(node, parent, key)) return
      const binding = bindings.get(node.name)
      if (binding && binding.readyAt >= 0 && state.executionAt < binding.readyAt) {
        violations.push({
          name: node.name,
          useLine: node.loc.start.line + scriptLineOffset,
          declarationLine: binding.declarationLine,
          context: state.context
        })
      }
      return
    }

    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      functions.has(node.callee.name) &&
      !state.seenFunctions.has(node.callee.name)
    ) {
      const seenFunctions = new Set(state.seenFunctions)
      seenFunctions.add(node.callee.name)
      const calledFunction = functions.get(node.callee.name)
      walkEager(calledFunction.body, calledFunction, 'body', {
        ...state,
        seenFunctions,
        context: `${state.context} -> ${node.callee.name}()`
      })
    }

    if (
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      !node.computed &&
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'value' &&
      computedGetters.has(node.object.name) &&
      !state.seenComputed.has(node.object.name)
    ) {
      const seenComputed = new Set(state.seenComputed)
      seenComputed.add(node.object.name)
      const getter = computedGetters.get(node.object.name)
      walkEager(getter.body, getter, 'body', {
        ...state,
        seenComputed,
        context: `${state.context} -> ${node.object.name}.value`
      })
    }

    for (const [childKey, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra'].includes(childKey)) continue
      if (Array.isArray(value)) {
        for (const child of value) walkEager(child, node, childKey, state)
      } else if (value && typeof value === 'object' && value.type) {
        walkEager(value, node, childKey, state)
      }
    }
  }

  function createState(executionAt, context) {
    return {
      executionAt,
      context,
      seenFunctions: new Set(),
      seenComputed: new Set()
    }
  }

  function walkWatchSource(source, call, state) {
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(source?.type)) {
      walkEager(source.body, source, 'body', state)
      return
    }
    if (source?.type === 'ArrayExpression') {
      for (const element of source.elements) walkWatchSource(element, call, state)
      return
    }
    walkEager(source, call, 'source', state)
    if (source?.type === 'Identifier' && computedGetters.has(source.name)) {
      const getter = computedGetters.get(source.name)
      walkEager(getter.body, getter, 'body', {
        ...state,
        context: `${state.context} -> ${source.name}.value`
      })
    }
  }

  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (!declaration.init) continue
        walkEager(
          declaration.init,
          declaration,
          'init',
          createState(
            declaration.init.start,
            `initializer at line ${declaration.loc.start.line + scriptLineOffset}`
          )
        )
      }
      continue
    }

    if (statement.type !== 'ExpressionStatement') continue
    const expression = statement.expression
    const expressionLine = statement.loc.start.line + scriptLineOffset

    if (
      expression.type === 'CallExpression' &&
      expression.callee.type === 'Identifier' &&
      expression.callee.name === 'watch'
    ) {
      const state = createState(expression.start, `watch at line ${expressionLine}`)
      walkWatchSource(expression.arguments[0], expression, state)
      if (
        hasImmediateWatchOption(expression) &&
        ['ArrowFunctionExpression', 'FunctionExpression'].includes(expression.arguments[1]?.type)
      ) {
        const callback = expression.arguments[1]
        walkEager(callback.body, callback, 'body', {
          ...state,
          context: `immediate watch callback at line ${expressionLine}`
        })
      }
      continue
    }

    if (
      expression.type === 'CallExpression' &&
      expression.callee.type === 'Identifier' &&
      expression.callee.name === 'watchEffect' &&
      ['ArrowFunctionExpression', 'FunctionExpression'].includes(expression.arguments[0]?.type)
    ) {
      const callback = expression.arguments[0]
      walkEager(
        callback.body,
        callback,
        'body',
        createState(expression.start, `watchEffect at line ${expressionLine}`)
      )
      continue
    }

    walkEager(
      expression,
      statement,
      'expression',
      createState(expression.start, `expression at line ${expressionLine}`)
    )
  }

  return [...new Map(
    violations.map((violation) => [
      `${violation.name}:${violation.useLine}:${violation.context}`,
      violation
    ])
  ).values()]
}

test('chat setup never eagerly reads a lexical binding before initialization', () => {
  const violations = findEagerTopLevelTdzReferences(scriptAst)
  assert.equal(
    violations.length,
    0,
    `Chat setup has eager TDZ references:\n${JSON.stringify(violations, null, 2)}`
  )
})
