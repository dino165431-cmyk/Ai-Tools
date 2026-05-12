import { createSnippetCompletion } from '@/utils/editorCompletion'

function stripWrappingQuotes(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (
    (raw.startsWith('"') && raw.endsWith('"'))
    || (raw.startsWith('\'') && raw.endsWith('\''))
  ) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

function buildRuntimeMagicOption(label, applyText, detail, info, contextModes = ['python']) {
  return {
    label,
    applyText,
    type: 'keyword',
    detail,
    info,
    contextModes: Array.isArray(contextModes) ? contextModes.slice() : ['python']
  }
}

function buildSqlMagicOption(label, applyText, detail, info) {
  const contextModes = String(label || '').trim() === '%%sql' ? ['python', 'sql'] : ['python']
  return buildRuntimeMagicOption(label, applyText, detail, info, contextModes)
}

export const NOTEBOOK_RUNTIME_MAGIC_OPTIONS = Object.freeze([
  buildRuntimeMagicOption(
    '%runtime help',
    '%runtime help',
    '查看超级笔记环境命令说明',
    '显示当前超级笔记支持的环境命令、默认行为和使用示例。'
  ),
  buildRuntimeMagicOption(
    '%runtime list',
    '%runtime list',
    '列出已创建的托管环境',
    '扫描当前 Notebook Runtime 配置里的虚拟环境存储目录，并列出可切换的环境名称。'
  ),
  buildRuntimeMagicOption(
    '%runtime info',
    '%runtime info',
    '查看当前笔记使用的环境信息',
    '显示当前笔记是否使用默认环境、当前解释器路径，以及托管环境目录。'
  ),
  buildRuntimeMagicOption(
    '%runtime create-venv myenv',
    '%runtime create-venv myenv',
    '创建托管虚拟环境',
    '在 Notebook Runtime 配置里的虚拟环境存储目录下创建 myenv，并自动安装 Notebook 运行依赖。'
  ),
  buildRuntimeMagicOption(
    '%runtime use myenv',
    '%runtime use myenv',
    '让当前笔记切换到指定环境',
    '只影响当前这篇超级笔记。切换后会重启 Kernel，后续 `%pip install` 也会安装到这个环境里。'
  ),
  buildRuntimeMagicOption(
    '%runtime reset',
    '%runtime reset',
    '恢复当前笔记到默认环境',
    '清除当前笔记的环境覆盖，恢复为设置页中的默认 Python 解释器。'
  ),
  buildRuntimeMagicOption(
    '%pip install pandas',
    '%pip install pandas',
    '在当前激活环境安装 Python 包',
    '始终使用当前激活解释器的 `python -m pip` 执行安装，适合在超级笔记里补依赖。'
  ),
  buildRuntimeMagicOption(
    '!pip install requests',
    '!pip install requests',
    '兼容 shell 风格的 pip 安装',
    '和 `%pip install ...` 类似，但保留 shell 风格写法。'
  ),
  buildRuntimeMagicOption(
    '!python -m venv myenv',
    '!python -m venv myenv',
    '兼容创建环境写法',
    '会被解释为托管环境创建命令，实际创建位置仍然是本机虚拟环境目录，不会在笔记目录下创建。'
  )
])

export const NOTEBOOK_SQL_MAGIC_OPTIONS = Object.freeze([
  buildSqlMagicOption(
    '%load_ext sql',
    '%load_ext sql',
    '加载 ipython-sql 扩展',
    '先在 Python Cell 里执行这一行，再运行 `%sql <connection_url>` 或 SQL Cell。'
  ),
  buildSqlMagicOption(
    '%reload_ext sql',
    '%reload_ext sql',
    '重新加载 ipython-sql 扩展',
    '当扩展已经加载或刚升级过依赖时，先在 Python Cell 里执行这一行，再继续运行 `%sql <connection_url>` 或 SQL Cell。'
  ),
  buildSqlMagicOption(
    '%sql postgresql://postgres:123456@localhost:5432/test',
    '%sql postgresql://postgres:123456@localhost:5432/test',
    '连接 PostgreSQL',
    'PostgreSQL 示例连接串。需要安装 `ipython-sql`、`sqlalchemy`，以及 `psycopg2-binary` 或 `psycopg`。'
  ),
  buildSqlMagicOption(
    '%sql mysql+pymysql://root:123456@localhost/test',
    '%sql mysql+pymysql://root:123456@localhost/test',
    '连接 MySQL',
    'MySQL 示例连接串。需要安装 `ipython-sql`、`sqlalchemy` 和 `pymysql`。'
  ),
  buildSqlMagicOption(
    '%sql sqlite:///test.db',
    '%sql sqlite:///test.db',
    '连接 SQLite',
    'SQLite 示例连接串。通常不需要额外驱动。'
  ),
  buildSqlMagicOption(
    '%%sql',
    '%%sql\nSELECT 1',
    '在 SQL Cell 里直接执行查询',
    '适合 SQL Cell 顶部直接写查询语句。后面可接任意 SQL，例如 `SELECT * FROM table_name;`。'
  )
])

export function buildNotebookMagicCompletionOptions(envNames = []) {
  const baseOptions = [...NOTEBOOK_RUNTIME_MAGIC_OPTIONS]
  const names = Array.isArray(envNames) ? envNames : []

  names
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      baseOptions.push(buildRuntimeMagicOption(
        `%runtime use ${name}`,
        `%runtime use ${name}`,
        '切换到已有环境',
        `切换当前笔记到托管环境“${name}”，并在下次执行前自动重启 Kernel。`
      ))
    })

  return baseOptions
}

export function buildNotebookSqlMagicCompletionOptions() {
  const sqlCellConnectionOption = buildSqlMagicOption(
    '%%sql <connection_url>',
    '%%sql postgresql://username:password@localhost:5432/dbname\nSELECT 1',
    'SQL Cell 内先连接再查询',
    buildNotebookSqlConnectionSupportText()
  )
  sqlCellConnectionOption.contextModes = ['python', 'sql']

  return [
    ...NOTEBOOK_SQL_MAGIC_OPTIONS,
    buildSqlMagicOption(
      '%sql <connection_url>',
      '%sql postgresql://username:password@localhost:5432/dbname',
      '先连接数据库再查询',
      buildNotebookSqlConnectionSupportText()
    ),
    buildSqlMagicOption(
      '%sql $DATABASE_URL',
      '%sql $DATABASE_URL',
      '使用环境变量连接数据库',
      '适合把连接串放到环境变量中。'
    ),
    sqlCellConnectionOption
  ]
}

function normalizeNotebookSqlModuleName(name = '') {
  return String(name || '').trim().toLowerCase().replace(/[-\s]+/g, '_')
}

function buildNotebookSqlModuleSet(availableModules = []) {
  return new Set(
    (Array.isArray(availableModules) ? availableModules : [])
      .map((item) => normalizeNotebookSqlModuleName(item))
      .filter(Boolean)
  )
}

function hasNotebookSqlModule(moduleSet, moduleNames = []) {
  const normalizedSet = moduleSet instanceof Set ? moduleSet : buildNotebookSqlModuleSet(moduleSet)
  return (Array.isArray(moduleNames) ? moduleNames : []).some((moduleName) => normalizedSet.has(normalizeNotebookSqlModuleName(moduleName)))
}

function extractNotebookSqlConnectionUrl(source = '') {
  const match = String(source || '').match(/^\s*%sql\s+([^\s]+)\s*$/im)
  return String(match?.[1] || '').trim().replace(/^['"]|['"]$/g, '')
}

function detectNotebookSqlConnectionKind(connectionUrl = '') {
  const normalized = String(connectionUrl || '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized.startsWith('sqlite://')) return 'SQLite'
  if (normalized.startsWith('postgresql://') || normalized.startsWith('postgres://') || normalized.includes('postgresql+') || normalized.includes('postgres+')) return 'PostgreSQL'
  if (normalized.startsWith('mysql://') || normalized.startsWith('mariadb://') || normalized.includes('mysql+') || normalized.includes('mariadb+')) return 'MySQL'
  return ''
}

function isNotebookSqlConnectionReference(value = '') {
  const normalized = stripWrappingQuotes(value).trim()
  return !!normalized && (normalized.includes('://') || normalized.startsWith('$'))
}

function parseNotebookSqlCellSource(sourceText = '') {
  const text = String(sourceText || '').trimStart()
  if (!text) {
    return {
      hasMagic: false,
      magicType: '',
      connectionUrl: '',
      queryText: ''
    }
  }

  const lines = text.split(/\r?\n/)
  const firstLine = String(lines[0] || '').trim()
  const magicMatch = firstLine.match(/^%{1,2}sql\b(.*)$/i)

  if (!magicMatch) {
    return {
      hasMagic: false,
      magicType: '',
      connectionUrl: '',
      queryText: text
    }
  }

  const magicType = firstLine.startsWith('%%sql') ? '%%sql' : '%sql'
  const remainder = String(magicMatch[1] || '').trim()
  const remainingText = lines.slice(1).join('\n').replace(/^\s*\n/, '')
  const remainderParts = remainder.split(/\s+/).filter(Boolean)
  const connectionToken = String(remainderParts[0] || '').trim()

  if (isNotebookSqlConnectionReference(connectionToken)) {
    return {
      hasMagic: true,
      magicType,
      connectionUrl: stripWrappingQuotes(connectionToken),
      queryText: [remainderParts.slice(1).join(' '), remainingText].filter(Boolean).join('\n').trimStart()
    }
  }

  if (magicType === '%sql') {
    return {
      hasMagic: true,
      magicType,
      connectionUrl: '',
      queryText: [remainder, ...lines.slice(1)].join('\n').trimStart()
    }
  }

  return {
    hasMagic: true,
    magicType,
    connectionUrl: '',
    queryText: [remainder, ...lines.slice(1)].join('\n').trimStart()
  }
}

function buildNotebookSqlConnectionSupportText() {
  return [
    '支持的 SQL 连接类型：',
    '- PostgreSQL: `postgresql://...` / `postgres://...`',
    '- MySQL: `mysql+pymysql://...` / `mysql://...` / `mariadb://...`',
    '- SQLite: `sqlite:///...`',
    '常用环境变量写法：`%sql $DATABASE_URL`'
  ].join('\n')
}

function buildNotebookSqlDependencyPackages(connectionKind = '', moduleSet = new Set()) {
  const packages = []
  if (!hasNotebookSqlModule(moduleSet, ['sql'])) {
    packages.push('ipython-sql')
  }
  if (!hasNotebookSqlModule(moduleSet, ['sqlalchemy'])) {
    packages.push('sqlalchemy')
  }
  if (connectionKind === 'PostgreSQL' && !hasNotebookSqlModule(moduleSet, ['psycopg2', 'psycopg'])) {
    packages.push('psycopg2-binary')
  }
  if (connectionKind === 'MySQL' && !hasNotebookSqlModule(moduleSet, ['pymysql'])) {
    packages.push('pymysql')
  }
  return Array.from(new Set(packages))
}

export function buildNotebookSqlDependencyInstallPackages(sourceText = '', errorText = '', availableModules = []) {
  const source = String(sourceText || '')
  const text = String(errorText || '').toLowerCase()
  const moduleSet = buildNotebookSqlModuleSet(availableModules)
  const parsed = parseNotebookSqlCellSource(source)
  const packages = new Set()
  const connectionKind = detectNotebookSqlConnectionKind(parsed.connectionUrl)
  const hasConcreteConnection = !!connectionKind || String(parsed.connectionUrl || '').includes('://')

  if (hasConcreteConnection) {
    buildNotebookSqlDependencyPackages(connectionKind, moduleSet).forEach((item) => packages.add(item))
  }

  const missingSqlMagic = text.includes('cell magic %%sql not found') || text.includes('line magic function %sql not found') || text.includes('magic function %sql not found')
  const missingCoreDeps = text.includes("no module named 'sql'") || text.includes('no module named sql') || text.includes('ipython-sql') || text.includes('sqlalchemy')

  if (missingSqlMagic || missingCoreDeps) {
    buildNotebookSqlDependencyPackages(connectionKind, moduleSet).forEach((item) => packages.add(item))
    if (!packages.size) {
      packages.add('ipython-sql')
      packages.add('sqlalchemy')
    }
  }

  if (/postgres|psycopg/.test(text) || connectionKind === 'PostgreSQL') {
    if (!hasNotebookSqlModule(moduleSet, ['psycopg2', 'psycopg'])) {
      packages.add('psycopg2-binary')
    }
  }

  if (/pymysql|mysqlclient/.test(text) || connectionKind === 'MySQL') {
    if (!hasNotebookSqlModule(moduleSet, ['pymysql'])) {
      packages.add('pymysql')
    }
  }

  return Array.from(packages)
}

export function buildNotebookSqlConnectionSupportSummaryText() {
  return buildNotebookSqlConnectionSupportText()
}

export function buildNotebookSqlDependencyPlan(sourceText = '', availableModules = [], options = {}) {
  const source = String(sourceText || '')
  const moduleSet = buildNotebookSqlModuleSet(availableModules)
  const parsed = parseNotebookSqlCellSource(source)
  const usesSqlMagic = parsed.hasMagic || /(?:^|\n)\s*%load_ext\s+sql\b/i.test(source) || /(?:^|\n)\s*%reload_ext\s+sql\b/i.test(source)
  const treatAsSqlCell = !!options?.treatAsSqlCell
  const requireConnection = options?.requireConnection !== false
  const active = !!parsed.connectionUrl || (!requireConnection && (treatAsSqlCell || usesSqlMagic))

  if (!active) {
    return {
      active: false,
      usesSqlMagic: false,
      connectionUrl: '',
      connectionKind: '',
      installPackages: []
    }
  }

  const connectionUrl = parsed.connectionUrl || extractNotebookSqlConnectionUrl(source)
  const connectionKind = detectNotebookSqlConnectionKind(connectionUrl)
  const hasConcreteConnection = !!connectionKind || String(connectionUrl || '').includes('://')
  const installPackages = buildNotebookSqlDependencyPackages(connectionKind, moduleSet)

  return {
    active: hasConcreteConnection,
    usesSqlMagic,
    connectionUrl,
    connectionKind,
    installPackages
  }
}

export function buildNotebookSqlDependencyHintText(sourceText = '', errorText = '', availableModules = []) {
  const text = String(errorText || '').toLowerCase()
  const plan = buildNotebookSqlDependencyPlan(sourceText, availableModules, { treatAsSqlCell: true })
  const installPackages = buildNotebookSqlDependencyInstallPackages(sourceText, errorText, availableModules)
  const hints = []

  const missingSqlMagic = text.includes('cell magic %%sql not found') || text.includes('line magic function %sql not found') || text.includes('magic function %sql not found')
  if (missingSqlMagic) {
    hints.push('请先在 Python Cell 中执行 `%load_ext sql`，然后再运行 `%sql <connection_url>`、`%sql $DATABASE_URL` 或 SQL Cell。')
  }

  const missingConnection = text.includes('database_url not set') || text.includes('no connect string given') || text.includes('connection info needed in sqlalchemy format') || text.includes('no connection string')
  if (missingConnection) {
    hints.push('当前还没有可用连接，请先在 Python Cell 中执行 `%sql <connection_url>` 或 `%sql $DATABASE_URL` 建立连接。')
    hints.push(buildNotebookSqlConnectionSupportText())
  }

  if (installPackages.length) {
    hints.push(`SQL 依赖缺失时可安装：\`pip install ${installPackages.join(' ')}\`。`)
  }

  if (plan.connectionKind === 'PostgreSQL' && !installPackages.includes('psycopg2-binary') && !installPackages.includes('psycopg')) {
    hints.push('PostgreSQL 驱动可安装：`pip install psycopg2-binary` 或 `pip install psycopg`。')
  }

  if (plan.connectionKind === 'MySQL' && !installPackages.includes('pymysql')) {
    hints.push('MySQL 驱动可安装：`pip install pymysql`。')
  }

  if (!hints.length && /no module named|ipython-sql|sqlalchemy/.test(text)) {
    hints.push('SQL 扩展可先安装 `ipython-sql` 和 `sqlalchemy`。')
  }

  if (!hints.length) return ''
  return [
    'SQL 执行提示：',
    ...Array.from(new Set(hints.map((line) => String(line || '').trim()).filter(Boolean)))
  ].join('\n')
}

export const NOTEBOOK_SQL_STATEMENT_OPTIONS = Object.freeze([
  createSnippetCompletion('SELECT', 'SELECT ', 'keyword', 'SQL 关键字'),
  createSnippetCompletion('SELECT * FROM table_name', 'SELECT * FROM table_name', 'snippet', 'SQL 查询'),
  createSnippetCompletion('SELECT column1, column2 FROM table_name', 'SELECT column1, column2 FROM table_name', 'snippet', 'SQL 查询'),
  createSnippetCompletion('INSERT INTO table_name (...) VALUES (...)', 'INSERT INTO table_name (...) VALUES (...)', 'snippet', 'SQL 插入'),
  createSnippetCompletion('UPDATE table_name SET ... WHERE ...', 'UPDATE table_name SET ... WHERE ...', 'snippet', 'SQL 更新'),
  createSnippetCompletion('DELETE FROM table_name WHERE ...', 'DELETE FROM table_name WHERE ...', 'snippet', 'SQL 删除'),
  createSnippetCompletion('CREATE TABLE table_name (...)', 'CREATE TABLE table_name (...)', 'snippet', 'SQL 建表'),
  createSnippetCompletion('CREATE TABLE users (...)', 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  age INTEGER,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);', 'snippet', 'SQL 建表示例'),
  createSnippetCompletion('ALTER TABLE table_name ...', 'ALTER TABLE table_name ...', 'snippet', 'SQL 改表'),
  createSnippetCompletion('DROP TABLE table_name', 'DROP TABLE table_name', 'snippet', 'SQL 删表'),
  createSnippetCompletion('CREATE INDEX index_name ON table_name (column_name)', 'CREATE INDEX index_name ON table_name (column_name)', 'snippet', 'SQL 索引'),
  createSnippetCompletion('CREATE VIEW view_name AS SELECT ...', 'CREATE VIEW view_name AS SELECT ...', 'snippet', 'SQL 视图'),
  createSnippetCompletion('WHERE', 'WHERE ', 'keyword', 'SQL 条件'),
  createSnippetCompletion('JOIN', 'JOIN ', 'keyword', 'SQL 连接'),
  createSnippetCompletion('LEFT JOIN', 'LEFT JOIN ', 'keyword', 'SQL 左连接'),
  createSnippetCompletion('GROUP BY', 'GROUP BY ', 'keyword', 'SQL 分组'),
  createSnippetCompletion('ORDER BY', 'ORDER BY ', 'keyword', 'SQL 排序'),
  createSnippetCompletion('LIMIT', 'LIMIT ', 'keyword', 'SQL 限制'),
  createSnippetCompletion('VALUES', 'VALUES ', 'keyword', 'SQL 值列表'),
  createSnippetCompletion('PRIMARY KEY', 'PRIMARY KEY', 'keyword', 'SQL 约束'),
  createSnippetCompletion('AUTOINCREMENT', 'AUTOINCREMENT', 'keyword', 'SQLite 自增'),
  createSnippetCompletion('NOT NULL', 'NOT NULL', 'keyword', 'SQL 约束'),
  createSnippetCompletion('UNIQUE', 'UNIQUE', 'keyword', 'SQL 约束'),
  createSnippetCompletion('DEFAULT CURRENT_TIMESTAMP', 'DEFAULT CURRENT_TIMESTAMP', 'keyword', 'SQL 默认值'),
  createSnippetCompletion('FOREIGN KEY (...) REFERENCES ...(...)', 'FOREIGN KEY (...) REFERENCES ...(...)', 'snippet', 'SQL 外键'),
  createSnippetCompletion('INTEGER', 'INTEGER', 'type', 'SQL 类型'),
  createSnippetCompletion('BIGINT', 'BIGINT', 'type', 'SQL 类型'),
  createSnippetCompletion('REAL', 'REAL', 'type', 'SQL 类型'),
  createSnippetCompletion('NUMERIC', 'NUMERIC', 'type', 'SQL 类型'),
  createSnippetCompletion('TEXT', 'TEXT', 'type', 'SQL 类型'),
  createSnippetCompletion('BLOB', 'BLOB', 'type', 'SQL 类型'),
  createSnippetCompletion('BOOLEAN', 'BOOLEAN', 'type', 'SQL 类型'),
  createSnippetCompletion('DATE', 'DATE', 'type', 'SQL 类型'),
  createSnippetCompletion('DATETIME', 'DATETIME', 'type', 'SQL 类型'),
  createSnippetCompletion('TIMESTAMP', 'TIMESTAMP', 'type', 'SQL 类型'),
  createSnippetCompletion('VARCHAR(255)', 'VARCHAR(255)', 'type', 'SQL 类型'),
  createSnippetCompletion('DECIMAL(10, 2)', 'DECIMAL(10, 2)', 'type', 'SQL 类型')
])

export function buildNotebookSqlStatementCompletionOptions() {
  return [...NOTEBOOK_SQL_STATEMENT_OPTIONS]
}

function normalizeNotebookSqlCellSource(source = '') {
  const text = String(source || '')
  const trimmed = text.trimStart()
  if (!trimmed) return ''

  const lines = trimmed.split(/\r?\n/)
  const firstLine = String(lines[0] || '').trim()

  if (/^%%sql\b/i.test(firstLine)) {
    return lines.slice(1).join('\n').replace(/^\s*\n/, '')
  }

  if (/^%sql\b/i.test(firstLine)) {
    const inlineSql = firstLine.replace(/^%sql\b/i, '').trimStart()
    if (inlineSql && /:\/\//.test(inlineSql)) {
      return lines.slice(1).join('\n').replace(/^\s*\n/, '')
    }
    return [inlineSql, ...lines.slice(1)].join('\n').replace(/^\s*\n/, '')
  }

  return text
}

export function buildNotebookSqlExecutionCode(source = '') {
  const parsed = parseNotebookSqlCellSource(source)
  const sqlText = String(parsed.queryText || '').trim()
  const connectionUrl = String(parsed.connectionUrl || '').trim()
  if (!sqlText && !connectionUrl) {
    return 'pass'
  }
  const sqlLiteral = JSON.stringify(sqlText)
  const connectionLiteral = connectionUrl ? JSON.stringify(connectionUrl) : ''
  const queryLines = []

  queryLines.push('try:')
  queryLines.push('    import prettytable as __ai_nb_prettytable')
  queryLines.push('    from prettytable import TableStyle as __ai_nb_table_style')
  queryLines.push('    __ai_nb_default_style = getattr(__ai_nb_table_style, "MARKDOWN", None)')
  queryLines.push('    if __ai_nb_default_style is None:')
  queryLines.push('        __ai_nb_default_style = getattr(__ai_nb_table_style, "PLAIN_COLUMNS", None)')
  queryLines.push('    if __ai_nb_default_style is not None and "DEFAULT" not in __ai_nb_prettytable.__dict__:')
  queryLines.push('        __ai_nb_prettytable.__dict__["DEFAULT"] = __ai_nb_default_style')
  queryLines.push('except Exception:')
  queryLines.push('    pass')
  queryLines.push('__ai_nb_ip = get_ipython()')
  queryLines.push('__ai_nb_loaded_extensions = getattr(getattr(__ai_nb_ip, "extension_manager", None), "loaded", {})')
  queryLines.push("if 'sql' not in __ai_nb_loaded_extensions:")
  queryLines.push("    __ai_nb_ip.run_line_magic('load_ext', 'sql')")
  if (connectionLiteral) {
    queryLines.push(`__ai_nb_connection = ${connectionLiteral}`)
    queryLines.push("if __ai_nb_connection:")
    queryLines.push("    __ai_nb_ip.run_line_magic('sql', __ai_nb_connection)")
  }
  if (sqlText) {
    queryLines.push(`__ai_nb_result = __ai_nb_ip.run_cell_magic('sql', '', ${sqlLiteral})`)
    queryLines.push('try:')
    queryLines.push('    __ai_nb_row_count = len(__ai_nb_result) if __ai_nb_result is not None else 0')
    queryLines.push('except Exception:')
    queryLines.push('    __ai_nb_row_count = 0')
    queryLines.push('if __ai_nb_result is not None and __ai_nb_row_count > 0:')
    queryLines.push('    try:')
    queryLines.push('        __ai_nb_html_func = getattr(__ai_nb_result, "_repr_html_", None)')
    queryLines.push('        __ai_nb_html = __ai_nb_html_func() if callable(__ai_nb_html_func) else ""')
    queryLines.push('    except Exception:')
    queryLines.push('        __ai_nb_html = ""')
    queryLines.push('    if __ai_nb_html:')
    queryLines.push('        from IPython.display import HTML, display')
    queryLines.push('        display(HTML(__ai_nb_html))')
    queryLines.push('    else:')
    queryLines.push('        print(__ai_nb_result)')
  }

  return queryLines.join('\n')
}

export function parseNotebookRuntimeMagicLine(line = '') {
  const rawLine = String(line || '')
  const trimmed = rawLine.trim()
  if (!trimmed) return null

  const shellVenvMatch = trimmed.match(/^!python\s+-m\s+venv(?:\s+(.+))?$/i)
  if (shellVenvMatch) {
    const envName = stripWrappingQuotes(shellVenvMatch[1] || '')
    return {
      kind: 'runtime',
      command: 'create-venv',
      argText: envName,
      raw: trimmed,
      source: 'shell-alias'
    }
  }

  if (!trimmed.startsWith('%runtime')) return null

  const remainder = trimmed.slice('%runtime'.length).trim()
  if (!remainder) {
    return {
      kind: 'runtime',
      command: 'help',
      argText: '',
      raw: trimmed,
      source: 'magic'
    }
  }

  const commandMatch = remainder.match(/^([a-zA-Z][a-zA-Z0-9-]*)(?:\s+([\s\S]*))?$/)
  if (!commandMatch) return null

  const command = String(commandMatch[1] || '').trim().toLowerCase()
  const argText = stripWrappingQuotes(commandMatch[2] || '')
  const normalizedCommand = command === 'create' ? 'create-venv' : command

  return {
    kind: 'runtime',
    command: ['help', 'list', 'info', 'create-venv', 'use', 'reset'].includes(normalizedCommand) ? normalizedCommand : 'invalid',
    argText,
    raw: trimmed,
    source: 'magic'
  }
}

export function parseNotebookRuntimeMagicCell(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const commands = []

  for (const line of lines) {
    if (!String(line || '').trim()) continue
    const parsed = parseNotebookRuntimeMagicLine(line)
    if (!parsed) return []
    commands.push(parsed)
  }

  return commands
}

export function parseNotebookDirectExecutionSpec(line = '') {
  const trimmed = String(line || '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('!')) {
    const command = trimmed.slice(1).trim()
    if (!command) return null
    if (/^pip(?:\s|$)/i.test(command)) {
      return {
        kind: 'pip',
        args: command.replace(/^pip\b/i, '').trim(),
        raw: trimmed
      }
    }
    return {
      kind: 'shell',
      command,
      raw: trimmed
    }
  }

  if (/^%pip(?:\s|$)/i.test(trimmed)) {
    return {
      kind: 'pip',
      args: trimmed.replace(/^%pip\b/i, '').trim(),
      raw: trimmed
    }
  }

  return null
}

export function parseNotebookDirectExecutionSpecs(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const specs = []

  for (const line of lines) {
    if (!String(line || '').trim()) continue
    const parsed = parseNotebookDirectExecutionSpec(line)
    if (!parsed) return []
    specs.push(parsed)
  }

  return specs
}

export function buildNotebookRuntimeMagicExecutionPlan(code = '') {
  const lines = String(code || '').split(/\r?\n/)
  const commands = []
  const remainingLines = []
  const pendingBlankLines = []
  let codeStarted = false

  for (const line of lines) {
    const text = String(line || '')
    const trimmed = text.trim()

    if (!trimmed) {
      if (codeStarted) remainingLines.push(text)
      else pendingBlankLines.push(text)
      continue
    }

    const parsed = parseNotebookRuntimeMagicLine(text)

    if (!codeStarted && parsed) {
      commands.push(parsed)
      continue
    }

    if (codeStarted && parsed) {
      return {
        commands,
        code: remainingLines.join('\n'),
        invalidCommand: parsed,
        invalidReason: '环境命令必须放在 Cell 顶部，不能出现在普通代码后面。'
      }
    }

    codeStarted = true
    if (pendingBlankLines.length) {
      remainingLines.push(...pendingBlankLines)
      pendingBlankLines.length = 0
    }
    remainingLines.push(text)
  }

  return {
    commands,
    code: remainingLines.join('\n'),
    invalidCommand: null,
    invalidReason: ''
  }
}
