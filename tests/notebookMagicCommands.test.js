import test from 'node:test'
import assert from 'node:assert/strict'

import { buildNotebookMagicCompletionOptions, buildNotebookRuntimeMagicExecutionPlan, buildNotebookSqlDependencyHintText, buildNotebookSqlDependencyPlan, buildNotebookSqlExecutionCode, buildNotebookSqlMagicCompletionOptions, buildNotebookSqlStatementCompletionOptions, parseNotebookDirectExecutionSpecs, parseNotebookRuntimeMagicCell, parseNotebookRuntimeMagicLine } from '../src/utils/notebookMagicCommands.js'

test('parseNotebookRuntimeMagicLine recognizes runtime commands and shell venv alias', () => {
  assert.deepEqual(
    parseNotebookRuntimeMagicLine('%runtime create-venv ds'),
    {
      kind: 'runtime',
      command: 'create-venv',
      argText: 'ds',
      raw: '%runtime create-venv ds',
      source: 'magic'
    }
  )

  assert.deepEqual(
    parseNotebookRuntimeMagicLine('!python -m venv ml-env'),
    {
      kind: 'runtime',
      command: 'create-venv',
      argText: 'ml-env',
      raw: '!python -m venv ml-env',
      source: 'shell-alias'
    }
  )
})

test('parseNotebookRuntimeMagicLine marks unknown runtime subcommands as invalid', () => {
  assert.deepEqual(
    parseNotebookRuntimeMagicLine('%runtime switch foo'),
    {
      kind: 'runtime',
      command: 'invalid',
      argText: 'foo',
      raw: '%runtime switch foo',
      source: 'magic'
    }
  )
})

test('parseNotebookRuntimeMagicCell accepts full runtime-only cells', () => {
  assert.deepEqual(
    parseNotebookRuntimeMagicCell('%runtime create-venv ds\n%runtime use ds'),
    [
      {
        kind: 'runtime',
        command: 'create-venv',
        argText: 'ds',
        raw: '%runtime create-venv ds',
        source: 'magic'
      },
      {
        kind: 'runtime',
        command: 'use',
        argText: 'ds',
        raw: '%runtime use ds',
        source: 'magic'
      }
    ]
  )

  assert.deepEqual(parseNotebookRuntimeMagicCell('%runtime use ds\nprint("x")'), [])
})

test('buildNotebookRuntimeMagicExecutionPlan extracts top runtime commands and keeps remaining code', () => {
  const plan = buildNotebookRuntimeMagicExecutionPlan('%runtime create-venv ds\n%runtime use ds\n\n%pip install pandas\nprint("ok")')

  assert.equal(plan.invalidCommand, null)
  assert.deepEqual(
    plan.commands.map((item) => item.command),
    ['create-venv', 'use']
  )
  assert.match(plan.code, /%pip install pandas/)
  assert.match(plan.code, /print\("ok"\)/)
})

test('buildNotebookRuntimeMagicExecutionPlan rejects runtime commands after normal code', () => {
  const plan = buildNotebookRuntimeMagicExecutionPlan('print("ok")\n%runtime use ds')

  assert.equal(plan.commands.length, 0)
  assert.ok(plan.invalidCommand)
  assert.match(plan.invalidReason, /Cell 顶部/)
})

test('parseNotebookDirectExecutionSpecs recognizes shell and pip-only notebook cells', () => {
  assert.deepEqual(
    parseNotebookDirectExecutionSpecs('%pip install pandas'),
    [
      {
        kind: 'pip',
        args: 'install pandas',
        raw: '%pip install pandas'
      }
    ]
  )

  assert.deepEqual(
    parseNotebookDirectExecutionSpecs('!echo hello'),
    [
      {
        kind: 'shell',
        command: 'echo hello',
        raw: '!echo hello'
      }
    ]
  )

  assert.deepEqual(parseNotebookDirectExecutionSpecs('print("x")\n!echo hello'), [])
})

test('buildNotebookMagicCompletionOptions includes managed env completions', () => {
  const options = buildNotebookMagicCompletionOptions(['torch', 'data-science'])
  const labels = options.map((item) => item.label)

  assert.ok(labels.includes('%runtime help'))
  assert.ok(labels.includes('%runtime use torch'))
  assert.ok(labels.includes('%runtime use data-science'))
})

test('buildNotebookSqlMagicCompletionOptions exposes common SQL connection snippets', () => {
  const options = buildNotebookSqlMagicCompletionOptions()
  const labels = options.map((item) => item.label)

  assert.ok(labels.includes('%load_ext sql'))
  assert.ok(labels.includes('%reload_ext sql'))
  assert.ok(labels.includes('%sql <connection_url>'))
  assert.ok(labels.includes('%sql $DATABASE_URL'))
  assert.ok(labels.includes('%sql postgresql://postgres:123456@localhost:5432/test'))
  assert.ok(labels.includes('%sql mysql+pymysql://root:123456@localhost/test'))
  assert.ok(labels.includes('%sql sqlite:///test.db'))
  assert.ok(labels.includes('%%sql'))
  assert.ok(labels.includes('%%sql <connection_url>'))
  assert.ok(!labels.some((label) => label.includes('ai_platform')))
  assert.ok(options.find((item) => item.label === '%%sql')?.contextModes.includes('sql'))
  assert.ok(options.find((item) => item.label === '%%sql <connection_url>')?.contextModes.includes('sql'))
  assert.ok(options.filter((item) => item.label !== '%%sql' && item.label !== '%%sql <connection_url>').every((item) => Array.isArray(item.contextModes) && !item.contextModes.includes('sql')))
})

test('buildNotebookSqlStatementCompletionOptions exposes SQL statement snippets', () => {
  const options = buildNotebookSqlStatementCompletionOptions()
  const labels = options.map((item) => item.label)

  assert.ok(labels.includes('SELECT'))
  assert.ok(labels.includes('SELECT * FROM table_name'))
  assert.ok(labels.includes('CREATE TABLE users (...)'))
  assert.ok(labels.includes('INSERT INTO table_name (...) VALUES (...)'))
  assert.ok(labels.includes('INTEGER'))
  assert.ok(labels.includes('VARCHAR(255)'))
  assert.ok(labels.includes('DEFAULT CURRENT_TIMESTAMP'))
})

test('buildNotebookSqlDependencyPlan detects missing SQL runtime packages by connection type', () => {
  const postgresPlan = buildNotebookSqlDependencyPlan('%sql postgresql://postgres:123456@localhost:5432/test', [])
  assert.ok(postgresPlan.active)
  assert.deepEqual(postgresPlan.installPackages, ['ipython-sql', 'sqlalchemy', 'psycopg2-binary'])

  const mysqlPlan = buildNotebookSqlDependencyPlan('%sql mysql+pymysql://root:123456@localhost/test', ['sql', 'sqlalchemy'])
  assert.ok(mysqlPlan.active)
  assert.deepEqual(mysqlPlan.installPackages, ['pymysql'])

  const sqlitePlan = buildNotebookSqlDependencyPlan('%sql sqlite:///test.db', ['sql', 'sqlalchemy'])
  assert.ok(sqlitePlan.active)
  assert.deepEqual(sqlitePlan.installPackages, [])

  const plainSqlPlan = buildNotebookSqlDependencyPlan('SELECT 1', ['sql', 'sqlalchemy'], { treatAsSqlCell: true })
  assert.equal(plainSqlPlan.active, false)
  assert.deepEqual(plainSqlPlan.installPackages, [])
})

test('buildNotebookSqlDependencyHintText surfaces install suggestions', () => {
  const hint = buildNotebookSqlDependencyHintText('%sql postgresql://postgres:123456@localhost:5432/test', "ModuleNotFoundError: No module named 'sql'", [])
  assert.match(hint, /SQL 执行提示/)
  assert.match(hint, /pip install/)
  assert.match(hint, /ipython-sql/)
})

test('buildNotebookSqlDependencyHintText explains how to reconnect when DATABASE_URL is missing', () => {
  const hint = buildNotebookSqlDependencyHintText('SELECT * FROM users', 'sql.connection.ConnectionError: Environment variable $DATABASE_URL not set, and no connect string given.', [])

  assert.match(hint, /当前还没有可用连接/)
  assert.match(hint, /PostgreSQL/)
  assert.match(hint, /MySQL/)
  assert.match(hint, /SQLite/)
  assert.ok(!hint.includes('pip install ipython-sql'))
})

test('buildNotebookRuntimeMagicExecutionPlan preserves SQL magics for Python kernel execution', () => {
  const plan = buildNotebookRuntimeMagicExecutionPlan('%load_ext sql\n%sql postgresql://postgres:123456@localhost:5432/test\nSELECT 1')

  assert.equal(plan.invalidCommand, null)
  assert.deepEqual(plan.commands, [])
  assert.match(plan.code, /%load_ext sql/)
  assert.match(plan.code, /%sql postgresql:\/\/postgres:123456@localhost:5432\/test/)
  assert.match(plan.code, /SELECT 1/)
})

test('buildNotebookSqlExecutionCode wraps SQL in python cell magic and patches prettytable compatibility', () => {
  const wrapped = buildNotebookSqlExecutionCode('SELECT 1')

  assert.match(wrapped, /import prettytable as __ai_nb_prettytable/)
  assert.match(wrapped, /from prettytable import TableStyle as __ai_nb_table_style/)
  assert.match(wrapped, /__ai_nb_default_style = getattr\(__ai_nb_table_style, "MARKDOWN", None\)/)
  assert.match(wrapped, /__ai_nb_ip\.run_line_magic\('load_ext', 'sql'\)/)
  assert.match(wrapped, /run_cell_magic\('sql', '', "SELECT 1"\)/)
  assert.match(wrapped, /from IPython\.display import HTML, display/)
  assert.match(wrapped, /display\(HTML\(__ai_nb_html\)\)/)
  assert.ok(!wrapped.includes("hasattr(__ai_nb_table_style"))

  const wrappedFromMagic = buildNotebookSqlExecutionCode('%%sql\nSELECT 2')
  assert.match(wrappedFromMagic, /run_cell_magic\('sql', '', "SELECT 2"\)/)
  assert.ok(!wrappedFromMagic.includes('%%sql'))

  const wrappedFromConnectionMagic = buildNotebookSqlExecutionCode('%sql sqlite:///test.db\nSELECT 3')
  assert.match(wrappedFromConnectionMagic, /__ai_nb_connection = "sqlite:\/\/\/test\.db"/)
  assert.match(wrappedFromConnectionMagic, /run_line_magic\('sql', __ai_nb_connection\)/)
  assert.match(wrappedFromConnectionMagic, /run_cell_magic\('sql', '', "SELECT 3"\)/)

  const wrappedFromCellConnection = buildNotebookSqlExecutionCode('%%sql postgresql://postgres:123456@localhost:5432/test\nSELECT 4')
  assert.match(wrappedFromCellConnection, /__ai_nb_connection = "postgresql:\/\/postgres:123456@localhost:5432\/test"/)
  assert.match(wrappedFromCellConnection, /run_line_magic\('sql', __ai_nb_connection\)/)
  assert.match(wrappedFromCellConnection, /run_cell_magic\('sql', '', "SELECT 4"\)/)
})
