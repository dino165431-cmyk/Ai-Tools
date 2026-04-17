function normalizeCellText(value) {
  return String(value ?? '').trim()
}

function coerceDataValue(raw) {
  const text = normalizeCellText(raw)
  if (!text) return ''
  const normalized = text.replace(/,/g, '')
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized)
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true'
  return text
}

function splitMarkdownTableRow(line) {
  const text = String(line ?? '').trim()
  if (!text.includes('|')) return null

  let body = text
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|')) body = body.slice(0, -1)

  const cells = body.split('|').map((cell) => cell.trim())
  return cells.length ? cells : null
}

function isMarkdownTableSeparator(cells) {
  return Array.isArray(cells) && cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(String(cell || '').replace(/\s+/g, '')))
}

function normalizeDataset(dataset) {
  const categories = Array.isArray(dataset?.categories)
    ? dataset.categories.map((item) => normalizeCellText(item))
    : []
  const series = (Array.isArray(dataset?.series) ? dataset.series : [])
    .map((item) => ({
      name: normalizeCellText(item?.name) || '系列',
      data: Array.isArray(item?.data) ? item.data.slice(0, categories.length) : []
    }))
    .filter((item) => item.data.length)

  return {
    categories,
    series
  }
}

function buildDatasetFromHeaderRows(headers, rows) {
  if (!Array.isArray(headers) || headers.length < 2) return null
  const normalizedHeaders = headers.map((cell) => normalizeCellText(cell))
  const categoryName = normalizedHeaders[0] || '类别'
  const seriesNames = normalizedHeaders.slice(1).map((cell, index) => cell || `系列 ${index + 1}`)
  const bodyRows = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && row.length >= 2) : []
  if (!bodyRows.length) return null

  const categories = bodyRows.map((row) => normalizeCellText(row[0]) || `${categoryName} ${bodyRows.indexOf(row) + 1}`)
  const series = seriesNames.map((name, index) => ({
    name,
    data: bodyRows.map((row) => coerceDataValue(row[index + 1]))
  }))

  return normalizeDataset({
    categories,
    series
  })
}

function inferCategoryKey(records) {
  const keys = Object.keys(records[0] || {})
  if (!keys.length) return ''

  const candidate = keys.find((key) =>
    records.some((item) => {
      const value = item?.[key]
      return typeof value === 'string' && value.trim()
    })
  )

  return candidate || keys[0]
}

function buildDatasetFromRecordArray(records) {
  if (!Array.isArray(records) || !records.length) return null
  if (!records.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return null

  const categoryKey = inferCategoryKey(records)
  if (!categoryKey) return null

  const seriesKeys = Object.keys(records[0]).filter((key) => key !== categoryKey)
  if (!seriesKeys.length) return null

  const categories = records.map((item, index) => normalizeCellText(item?.[categoryKey]) || `类别 ${index + 1}`)
  const series = seriesKeys
    .map((key) => ({
      name: normalizeCellText(key) || '系列',
      data: records.map((item) => coerceDataValue(item?.[key]))
    }))
    .filter((item) => item.data.some((value) => typeof value === 'number'))

  if (!series.length) return null

  return normalizeDataset({
    categories,
    series
  })
}

function buildDatasetFromPlainObject(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null

  if (Array.isArray(source.categories) && Array.isArray(source.series)) {
    return normalizeDataset(source)
  }

  if (Array.isArray(source.categories) && Array.isArray(source.values)) {
    return normalizeDataset({
      categories: source.categories,
      series: [
        {
          name: normalizeCellText(source.seriesName) || '数值',
          data: source.values
        }
      ]
    })
  }

  const entries = Object.entries(source)
  if (!entries.length) return null
  if (!entries.every(([, value]) => typeof coerceDataValue(value) === 'number')) return null

  return normalizeDataset({
    categories: entries.map(([key]) => key),
    series: [
      {
        name: '数值',
        data: entries.map(([, value]) => coerceDataValue(value))
      }
    ]
  })
}

export function parseMarkdownTableToDataset(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 3) return null

  const header = splitMarkdownTableRow(lines[0])
  const separator = splitMarkdownTableRow(lines[1])
  if (!header || !separator || header.length < 2 || header.length !== separator.length) return null
  if (!isMarkdownTableSeparator(separator)) return null

  const rows = lines
    .slice(2)
    .map((line) => splitMarkdownTableRow(line))
    .filter((row) => Array.isArray(row) && row.length >= 2)

  return buildDatasetFromHeaderRows(header, rows)
}

export function parseJsonToDataset(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (Array.isArray(parsed)) {
    if (parsed.every((item) => Array.isArray(item))) {
      return buildDatasetFromHeaderRows(parsed[0], parsed.slice(1))
    }
    return buildDatasetFromRecordArray(parsed)
  }

  return buildDatasetFromPlainObject(parsed)
}

export function parseSelectionToEchartsDataset(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  return parseMarkdownTableToDataset(raw) || parseJsonToDataset(raw)
}

function stringifyValue(value) {
  return JSON.stringify(value, null, 2)
}

function buildSeriesSnippet(series, chartType) {
  return series
    .map((item, index) => {
      const extra = chartType === 'line'
        ? ['      smooth: true,']
        : series.length === 1
          ? ["      barWidth: '44%',"]
          : []
      return [
        '    {',
        `      name: ${JSON.stringify(item.name)},`,
        `      type: ${JSON.stringify(chartType)},`,
        ...extra,
        `      data: ${stringifyValue(item.data).replace(/\n/g, '\n      ')}`,
        index === series.length - 1 ? '    }' : '    },'
      ].join('\n')
    })
    .join('\n')
}

export function buildEchartsOptionSnippetFromDataset(dataset, options = {}) {
  const normalized = normalizeDataset(dataset)
  if (!normalized.categories.length || !normalized.series.length) return ''

  const chartType = options.chartType === 'line' ? 'line' : 'bar'
  const xAxisName = normalizeCellText(options.xAxisName) || 'X 轴'
  const yAxisName = normalizeCellText(options.yAxisName) || '数值'
  const hasMultipleSeries = normalized.series.length > 1

  return [
    '{',
    '  title: {',
    "    text: '[[图表标题]]'",
    '  },',
    '  tooltip: {',
    "    trigger: 'axis'",
    '  },',
    hasMultipleSeries ? '  legend: {},' : '',
    '  xAxis: {',
    "    type: 'category',",
    `    name: ${JSON.stringify(xAxisName)},`,
    `    data: ${stringifyValue(normalized.categories).replace(/\n/g, '\n    ')}`,
    '  },',
    '  yAxis: {',
    "    type: 'value',",
    `    name: ${JSON.stringify(yAxisName)}`,
    '  },',
    '  series: [',
    buildSeriesSnippet(normalized.series, chartType),
    '  ]',
    '}'
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildEchartsOptionSnippetFromSelection(text, options = {}) {
  const dataset = parseSelectionToEchartsDataset(text)
  if (!dataset) return ''
  return buildEchartsOptionSnippetFromDataset(dataset, options)
}
