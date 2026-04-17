import { completeAnyWord, completeFromList, insertCompletionText, pickedCompletion } from '@codemirror/autocomplete'

const IDENTIFIER_CHAR_PATTERN = /[a-zA-Z0-9_.]/
const IDENTIFIER_SEGMENT_CHAR_PATTERN = /[a-zA-Z0-9_]/

function normalizeComparableCompletionText(text = '') {
  return String(text || '')
    .trim()
    .replace(/\([^)]*$/, '')
    .replace(/\[[^\]]*$/, '')
    .replace(/\s+$/, '')
    .toLowerCase()
}

function scoreCompletionRangeCandidate(prefixText = '', fullText = '', insertText = '') {
  const normalizedInsert = normalizeComparableCompletionText(insertText)
  const normalizedPrefix = normalizeComparableCompletionText(prefixText)
  const normalizedFull = normalizeComparableCompletionText(fullText)
  if (!normalizedInsert) return -1

  if (normalizedPrefix && normalizedInsert.startsWith(normalizedPrefix)) {
    return normalizedPrefix.length * 4 + (normalizedFull === normalizedPrefix ? 1 : 0)
  }

  if (!normalizedPrefix && normalizedFull && normalizedInsert.startsWith(normalizedFull)) {
    return normalizedFull.length * 3
  }

  return -1
}

export function resolveCompletionRange(docText, from, to, insertText = '') {
  const text = String(docText || '')
  const safeFrom = Number.isFinite(Number(from)) ? Math.max(0, Math.min(text.length, Number(from))) : text.length
  const safeTo = Number.isFinite(Number(to)) ? Math.max(safeFrom, Math.min(text.length, Number(to))) : safeFrom
  if (safeFrom !== safeTo) return { from: safeFrom, to: safeTo }

  let tokenStart = safeFrom
  while (tokenStart > 0 && IDENTIFIER_CHAR_PATTERN.test(text[tokenStart - 1])) tokenStart -= 1

  let tokenEnd = safeTo
  while (tokenEnd < text.length && IDENTIFIER_CHAR_PATTERN.test(text[tokenEnd])) tokenEnd += 1

  let segmentStart = safeFrom
  while (segmentStart > 0 && IDENTIFIER_SEGMENT_CHAR_PATTERN.test(text[segmentStart - 1])) segmentStart -= 1

  let segmentEnd = safeTo
  while (segmentEnd < text.length && IDENTIFIER_SEGMENT_CHAR_PATTERN.test(text[segmentEnd])) segmentEnd += 1

  const candidates = [
    {
      from: segmentStart,
      to: segmentEnd,
      prefixText: text.slice(segmentStart, safeTo),
      fullText: text.slice(segmentStart, segmentEnd)
    },
    {
      from: tokenStart,
      to: tokenEnd,
      prefixText: text.slice(tokenStart, safeTo),
      fullText: text.slice(tokenStart, tokenEnd)
    }
  ]

  let best = null
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreCompletionRangeCandidate(candidate.prefixText, candidate.fullText, insertText)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  if (best && bestScore >= 0) {
    return { from: best.from, to: best.to }
  }

  return { from: safeFrom, to: safeTo }
}

export function resolveSymbolRangeAt(docText, pos) {
  const text = String(docText || '')
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Number(pos))) : text.length

  let segmentStart = safePos
  while (segmentStart > 0 && IDENTIFIER_SEGMENT_CHAR_PATTERN.test(text[segmentStart - 1])) segmentStart -= 1

  let segmentEnd = safePos
  while (segmentEnd < text.length && IDENTIFIER_SEGMENT_CHAR_PATTERN.test(text[segmentEnd])) segmentEnd += 1

  if (segmentStart < segmentEnd) {
    return { from: segmentStart, to: segmentEnd }
  }

  let tokenStart = safePos
  while (tokenStart > 0 && IDENTIFIER_CHAR_PATTERN.test(text[tokenStart - 1])) tokenStart -= 1

  let tokenEnd = safePos
  while (tokenEnd < text.length && IDENTIFIER_CHAR_PATTERN.test(text[tokenEnd])) tokenEnd += 1

  return { from: tokenStart, to: tokenEnd }
}

export function applyResolvedCompletionText(view, completion, from, to, insertText = '') {
  const replacement = resolveCompletionRange(view.state.doc.toString(), from, to, insertText)
  view.dispatch({
    ...insertCompletionText(view.state, String(insertText || ''), replacement.from, replacement.to),
    annotations: pickedCompletion.of(completion)
  })
}

export function createSnippetCompletion(label, apply, type = 'text', detail = '') {
  const applyText = String(apply || '')
  return {
    label,
    type,
    detail,
    applyText,
    apply: (view, completion, from, to) => {
      applyResolvedCompletionText(view, completion, from, to, applyText)
    }
  }
}

export const markdownSnippetDefinitions = [
  createSnippetCompletion('# 标题', '# 标题', 'keyword', 'heading'),
  createSnippetCompletion('## 二级标题', '## 二级标题', 'keyword', 'heading'),
  createSnippetCompletion('### 三级标题', '### 三级标题', 'keyword', 'heading'),
  createSnippetCompletion('- [ ] 任务列表', '- [ ] 待办事项', 'keyword', 'checklist'),
  createSnippetCompletion('引用', '> 引用内容', 'snippet', 'blockquote'),
  createSnippetCompletion('加粗', '**重点内容**', 'snippet', 'format'),
  createSnippetCompletion('斜体', '_强调内容_', 'snippet', 'format'),
  createSnippetCompletion('行内代码', '`code`', 'snippet', 'format'),
  createSnippetCompletion('代码块 Python', '```python\nprint("hello")\n```', 'snippet', 'code fence'),
  createSnippetCompletion('代码块 JSON', '```json\n{\n  "key": "value"\n}\n```', 'snippet', 'code fence'),
  createSnippetCompletion('图片', '![图片描述](https://example.com/image.png)', 'snippet', 'media'),
  createSnippetCompletion('本地图片', '![图片描述](./image.png)', 'snippet', 'media'),
  createSnippetCompletion('链接', '[链接标题](https://example.com)', 'snippet', 'link'),
  createSnippetCompletion('表格', '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |', 'snippet', 'table'),
  createSnippetCompletion('Mermaid 流程图', '```mermaid\nflowchart TD\n  A[开始] --> B[处理]\n  B --> C[结束]\n```', 'snippet', 'diagram'),
  createSnippetCompletion('Mermaid 时序图', '```mermaid\nsequenceDiagram\n  participant U as User\n  participant S as Server\n  U->>S: Request\n  S-->>U: Response\n```', 'snippet', 'diagram'),
  createSnippetCompletion('ECharts 图表', '```echarts\n{\n  "xAxis": {\n    "type": "category",\n    "data": ["Mon", "Tue", "Wed"]\n  },\n  "yAxis": {\n    "type": "value"\n  },\n  "series": [\n    {\n      "type": "line",\n      "data": [120, 200, 150]\n    }\n  ]\n}\n```', 'snippet', 'diagram'),
  createSnippetCompletion('KaTeX 公式块', '$$\nE = mc^2\n$$', 'snippet', 'math'),
  createSnippetCompletion('折叠块', '<details>\n<summary>展开查看</summary>\n\n内容\n\n</details>', 'snippet', 'html')
]

export function mergeCompletionOptions(optionGroups = []) {
  const seen = new Set()
  const merged = []

  optionGroups.flat().forEach((option) => {
    if (!option?.label) return
    const key = `${option.label}::${option.detail || ''}`
    if (seen.has(key)) return
    seen.add(key)
    merged.push(option)
  })

  return merged
}

export function createMarkdownCompletionSource() {
  const snippetSource = completeFromList(markdownSnippetDefinitions)

  return (context) => {
    const baseResult = snippetSource(context)
    const anyWordResult = completeAnyWord(context)
    const options = mergeCompletionOptions([
      baseResult?.options || [],
      anyWordResult?.options || []
    ])

    if (!options.length) return null

    return {
      from: Math.min(baseResult?.from ?? context.pos, anyWordResult?.from ?? context.pos),
      options,
      validFor: /^[\w!#[\]()*`>|<./:-]*$/
    }
  }
}
