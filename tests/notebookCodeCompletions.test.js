import test from 'node:test'
import assert from 'node:assert/strict'

import { buildNodeJsCompletionScope, buildSqlSchemaSuggestionSource } from '../src/utils/notebookCodeCompletions.js'

test('buildSqlSchemaSuggestionSource infers tables and columns from CREATE TABLE statements', () => {
  const schema = buildSqlSchemaSuggestionSource(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      PRIMARY KEY (id)
    );

    CREATE TABLE public.orders (
      order_id INTEGER,
      user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  assert.deepEqual(schema.users, ['email', 'id', 'name'])
  assert.deepEqual(schema['public.orders'], ['created_at', 'order_id', 'user_id'])
})

test('buildNodeJsCompletionScope exposes common Node.js globals for completion', () => {
  const scope = buildNodeJsCompletionScope()

  assert.equal(scope.console, globalThis.console)
  assert.equal(scope.Math, globalThis.Math)
  assert.equal(scope.JSON, globalThis.JSON)
  assert.equal(scope.Buffer, globalThis.Buffer)
  assert.ok(Object.prototype.hasOwnProperty.call(scope, 'process'))
  assert.ok(Object.prototype.hasOwnProperty.call(scope, 'require'))
})
