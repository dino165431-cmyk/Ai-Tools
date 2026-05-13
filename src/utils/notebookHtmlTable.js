function normalizeNotebookHtmlTableText(value, preserveLineBreaks = false) {
  const text = String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const codePoint = Number.parseInt(decimal, 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
    })
    .replace(/\u00a0/g, ' ')

  if (preserveLineBreaks) {
    return text
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n[ \t\f\v]+/g, '\n')
      .replace(/[ \t\f\v]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  return text.replace(/\s+/g, ' ').trim()
}

function extractNotebookHtmlTableMatch(html) {
  return /<table\b[\s\S]*?<\/table>/i.exec(String(html || ''))
}

function extractNotebookHtmlTableRows(sectionHtml) {
  const rows = []
  String(sectionHtml || '').replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, rowHtml) => {
    rows.push(rowHtml)
    return ''
  })
  return rows
}

function extractNotebookHtmlTableCells(rowHtml) {
  const cells = []
  String(rowHtml || '').replace(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tagName, cellHtml) => {
    cells.push({
      tagName: String(tagName || '').toLowerCase(),
      html: cellHtml
    })
    return ''
  })
  return cells
}

function inferNotebookHtmlTableHeaderCells(tableHtml) {
  const theadMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(String(tableHtml || ''))
  if (theadMatch) {
    const headerRows = extractNotebookHtmlTableRows(theadMatch[1])
    const headerRowHtml = headerRows.length ? headerRows[headerRows.length - 1] : ''
    return extractNotebookHtmlTableCells(headerRowHtml)
  }

  const allRows = extractNotebookHtmlTableRows(tableHtml)
  const firstRowHtml = allRows.length ? allRows[0] : ''
  return extractNotebookHtmlTableCells(firstRowHtml)
}

function inferNotebookHtmlTableBodyRows(tableHtml) {
  const theadMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(String(tableHtml || ''))
  const tbodyMatch = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(String(tableHtml || ''))

  if (tbodyMatch) {
    return extractNotebookHtmlTableRows(tbodyMatch[1]).map((rowHtml) => extractNotebookHtmlTableCells(rowHtml))
  }

  const allRows = extractNotebookHtmlTableRows(tableHtml)
  if (theadMatch && allRows.length) {
    return allRows.slice(1).map((rowHtml) => extractNotebookHtmlTableCells(rowHtml))
  }

  return allRows.slice(1).map((rowHtml) => extractNotebookHtmlTableCells(rowHtml))
}

function estimateNotebookHtmlTableTextScore(text) {
  const normalized = String(text ?? '')
  let score = 0

  for (const char of normalized.slice(0, 120)) {
    if (/\s/.test(char)) {
      score += 0.35
      continue
    }

    const codePoint = char.codePointAt(0) || 0
    if (
      codePoint >= 0x2e80 ||
      (codePoint >= 0xff00 && codePoint <= 0xffef) ||
      (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af)
    ) {
      score += 1.8
      continue
    }

    if (/[A-Z]/.test(char)) {
      score += 1.15
      continue
    }

    if (/[0-9]/.test(char)) {
      score += 0.9
      continue
    }

    score += 1
  }

  return score
}

export function estimateNotebookHtmlTableColumnWidth(label, samples = []) {
  const values = [label, ...(Array.isArray(samples) ? samples : [])]
  const longestScore = values.reduce((max, text) => Math.max(max, estimateNotebookHtmlTableTextScore(normalizeNotebookHtmlTableText(text))), 0)
  return Math.max(96, Math.min(300, Math.round(longestScore * 10 + 48)))
}

export function hasStandaloneNotebookHtmlTable(html) {
  const source = String(html || '').trim()
  if (!source) return false

  const tableMatch = extractNotebookHtmlTableMatch(source)
  if (!tableMatch) return false

  const remainder = `${source.slice(0, tableMatch.index)}${source.slice((tableMatch.index || 0) + tableMatch[0].length)}`
  return normalizeNotebookHtmlTableText(remainder).length === 0
}

export function parseNotebookHtmlTable(html) {
  const source = String(html || '').trim()
  if (!source) return null

  const tableMatch = extractNotebookHtmlTableMatch(source)
  if (!tableMatch) return null

  const remainder = `${source.slice(0, tableMatch.index)}${source.slice((tableMatch.index || 0) + tableMatch[0].length)}`
  if (normalizeNotebookHtmlTableText(remainder).length) return null

  const tableHtml = tableMatch[0]
  const headerCells = inferNotebookHtmlTableHeaderCells(tableHtml)
  const bodyRows = inferNotebookHtmlTableBodyRows(tableHtml)

  if (!headerCells.length || !bodyRows.length) return null

  const firstHeaderText = normalizeNotebookHtmlTableText(headerCells[0]?.html)
  const hasRowIndexColumn = !firstHeaderText && bodyRows.every((rowCells) => rowCells[0]?.tagName === 'th')

  const columnLabels = headerCells.map((cell, index) => {
    const label = normalizeNotebookHtmlTableText(cell?.html)
    if (label) return label
    return index === 0 && hasRowIndexColumn ? '#' : `列 ${index + 1}`
  })

  const sampledBodyRows = bodyRows.slice(0, 24)
  const columns = columnLabels.map((label, index) => ({
    key: `col_${index}`,
    label,
    width: estimateNotebookHtmlTableColumnWidth(
      label,
      sampledBodyRows.map((rowCells) => normalizeNotebookHtmlTableText(rowCells[index]?.html))
    )
  }))

  const rows = bodyRows.map((rowCells, rowIndex) => {
    const row = {
      __rowKey: `row_${rowIndex}`,
      __rowIndex: rowIndex,
      __detailEntries: []
    }

    columns.forEach((column, columnIndex) => {
      const cell = rowCells[columnIndex]
      const value = normalizeNotebookHtmlTableText(cell?.html)
      row[column.key] = value
      row.__detailEntries.push({
        key: column.key,
        label: column.label,
        value
      })
    })

    return row
  })

  return {
    columns,
    rows,
    scrollX: columns.reduce((sum, column) => sum + (Number(column.width) || 0), 0)
  }
}
