import {
  buildSnippetForDiagramItem,
  getBuiltinDiagramTemplateGroups,
  getDiagramTemplateRegistry
} from '@/utils/noteDiagramTemplates'

export const NOTE_TEMPLATE_KINDS = Object.freeze(['mermaid', 'echarts', 'formula'])

export const BUILTIN_NOTE_TEMPLATE_ROOT_IDS = Object.freeze({
  mermaid: 'builtin:root:mermaid',
  echarts: 'builtin:root:echarts',
  formula: 'builtin:root:formula'
})

const NOTE_TEMPLATE_KIND_META = Object.freeze({
  mermaid: Object.freeze({
    label: 'Mermaid',
    toolbarTitle: getDiagramTemplateRegistry('mermaid')?.toolbarTitle || 'Mermaid 图',
    description: 'Mermaid 图表与结构模板'
  }),
  echarts: Object.freeze({
    label: 'ECharts',
    toolbarTitle: getDiagramTemplateRegistry('echarts')?.toolbarTitle || 'ECharts 图',
    description: 'ECharts 图表与分析模板'
  }),
  formula: Object.freeze({
    label: '公式',
    toolbarTitle: '数学公式',
    description: '数学公式模板'
  })
})

const EDITABLE_MARKER_RE = /\[\[(.*?)\]\]/g

export function normalizeNoteTemplateKind(kind) {
  const key = String(kind || '').trim().toLowerCase()
  return NOTE_TEMPLATE_KINDS.includes(key) ? key : 'mermaid'
}

function cloneItem(item) {
  return {
    ...item,
    keywords: Array.isArray(item?.keywords) ? [...item.keywords] : []
  }
}

function compileEditableTemplate(source) {
  const raw = String(source || '')
  let clean = ''
  let cursor = 0
  let selectStart = -1
  let selectEnd = -1

  raw.replace(EDITABLE_MARKER_RE, (match, value, offset) => {
    clean += raw.slice(cursor, offset)
    if (selectStart < 0) {
      selectStart = clean.length
      selectEnd = selectStart + String(value || '').length
    }
    clean += String(value || '')
    cursor = offset + match.length
    return match
  })

  clean += raw.slice(cursor)
  return {
    text: clean,
    selectStart,
    selectEnd
  }
}

function buildMarkdownSnippet(source) {
  const compiled = compileEditableTemplate(source)
  const targetValue = compiled.text

  if (compiled.selectStart < 0 || compiled.selectEnd < 0) {
    return {
      targetValue,
      select: false,
      deviationStart: 0,
      deviationEnd: 0
    }
  }

  return {
    targetValue,
    select: true,
    deviationStart: compiled.selectStart,
    deviationEnd: compiled.selectEnd - targetValue.length
  }
}

function isBuiltinRootKind(rootId, kind) {
  const normalizedKind = normalizeNoteTemplateKind(kind)
  return String(rootId || '').trim() === BUILTIN_NOTE_TEMPLATE_ROOT_IDS[normalizedKind]
}

function containsFormulaDelimiter(source) {
  return String(source || '').includes('$')
}

function containsCodeFence(source) {
  return String(source || '').includes('```')
}

function buildFormulaSnippet(source, snippetMode = 'block') {
  const compiled = compileEditableTemplate(source)
  const mode = snippetMode === 'inline' ? 'inline' : 'block'
  const prefix = mode === 'inline' ? '$' : '$$\n'
  const suffix = mode === 'inline' ? '$' : '\n$$\n'
  const targetValue = `${prefix}${compiled.text.trim()}${suffix}`

  if (compiled.selectStart < 0 || compiled.selectEnd < 0) {
    return {
      targetValue,
      select: false,
      deviationStart: 0,
      deviationEnd: 0
    }
  }

  const absoluteStart = prefix.length + compiled.selectStart
  const absoluteEnd = prefix.length + compiled.selectEnd
  return {
    targetValue,
    select: true,
    deviationStart: absoluteStart,
    deviationEnd: absoluteEnd - targetValue.length
  }
}

function buildSnippetForCustomTemplateItem(item) {
  const targetKind = normalizeNoteTemplateKind(item?.kind)
  if (!isBuiltinRootKind(item?.rootId, targetKind)) {
    return buildMarkdownSnippet(item?.template)
  }

  if (targetKind === 'formula') {
    return containsFormulaDelimiter(item?.template)
      ? buildMarkdownSnippet(item?.template)
      : buildFormulaSnippet(item?.template)
  }

  return containsCodeFence(item?.template)
    ? buildMarkdownSnippet(item?.template)
    : buildSnippetForDiagramItem({
      ...item,
      type: 'template',
      kind: targetKind
    })
}
function createBuiltinCategory(rootId, kind, index, title, items) {
  const categoryId = `builtin:${kind}:category:${index}`
  return {
    id: categoryId,
    rootId,
    kind,
    label: String(title || '').trim() || `分类 ${index + 1}`,
    builtin: true,
    order: index,
    items: (Array.isArray(items) ? items : []).map((item, itemIndex) => ({
      ...cloneItem(item),
      rootId,
      categoryId,
      kind,
      builtin: true,
      order: itemIndex,
      persistable: item?.persistable !== false,
      categoryLabel: String(title || '').trim(),
      description:
        item?.type === 'action'
          ? '根据当前选中的 Markdown 表格或 JSON 数据生成图表配置'
          : String(item?.description || '').trim()
    }))
  }
}

function buildLegacyRoot(kind, order) {
  const normalizedKind = normalizeNoteTemplateKind(kind)
  const meta = NOTE_TEMPLATE_KIND_META[normalizedKind]
  const rootId = BUILTIN_NOTE_TEMPLATE_ROOT_IDS[normalizedKind]
  const registry = getDiagramTemplateRegistry(normalizedKind)

  return {
    id: rootId,
    kind: normalizedKind,
    label: meta.label,
    description: meta.description,
    toolbarTitle: registry?.toolbarTitle || meta.toolbarTitle,
    builtin: true,
    order,
    categories: Object.freeze(
      getBuiltinDiagramTemplateGroups(normalizedKind).map((group, index) =>
        createBuiltinCategory(rootId, normalizedKind, index, group?.title, group?.items)
      )
    )
  }
}

function createFormulaTemplate(rootId, categoryId, index, item) {
  return {
    id: item.id,
    type: 'template',
    persistable: true,
    builtin: true,
    rootId,
    categoryId,
    kind: 'formula',
    order: index,
    label: item.label,
    syntax: item.syntax || '',
    keywords: Array.isArray(item.keywords) ? [...item.keywords] : [],
    template: item.template,
    snippetMode: item.snippetMode === 'inline' ? 'inline' : 'block',
    description: String(item.description || '').trim(),
    categoryLabel: item.categoryLabel
  }
}

function buildFormulaRoot(order) {
  const rootId = BUILTIN_NOTE_TEMPLATE_ROOT_IDS.formula
  const meta = NOTE_TEMPLATE_KIND_META.formula
  const rawGroups = [
    {
      label: '常用公式',
      items: [
        {
          id: 'formula:inline',
          label: '行内公式',
          syntax: 'inline',
          snippetMode: 'inline',
          keywords: ['inline', 'katex', '行内'],
          template: '[[a^2 + b^2 = c^2]]',
          description: '插入适合正文中的行内公式'
        },
        {
          id: 'formula:fraction',
          label: '分式',
          syntax: '\\frac',
          keywords: ['fraction', 'frac', '分式'],
          template: '\\frac{[[numerator]]}{denominator}'
        },
        {
          id: 'formula:sum',
          label: '求和',
          syntax: '\\sum',
          keywords: ['sum', '求和'],
          template: '\\sum_{i=1}^{[[n]]} x_i'
        },
        {
          id: 'formula:limit',
          label: '极限',
          syntax: '\\lim',
          keywords: ['limit', '极限'],
          template: '\\lim_{x \\to [[0]]} \\frac{\\sin x}{x}'
        }
      ]
    },
    {
      label: '微积分',
      items: [
        {
          id: 'formula:derivative',
          label: '导数',
          syntax: '\\frac{d}{dx}',
          keywords: ['derivative', '导数'],
          template: "\\frac{d}{dx} [[f(x)]] = f'(x)"
        },
        {
          id: 'formula:integral',
          label: '定积分',
          syntax: '\\int',
          keywords: ['integral', '积分'],
          template: '\\int_{a}^{b} [[f(x)]] \\, dx'
        },
        {
          id: 'formula:partial',
          label: '偏导',
          syntax: '\\partial',
          keywords: ['partial', '偏导'],
          template: '\\frac{\\partial [[f(x, y)]]}{\\partial x}'
        },
        {
          id: 'formula:piecewise',
          label: '分段函数',
          syntax: 'cases',
          keywords: ['cases', 'piecewise', '分段函数'],
          template: `f(x)=\\begin{cases}
+[[x^2]], & x \\ge 0 \\\\
+-x, & x < 0
+\\end{cases}`.replace(/^\+/gm, '')
        }
      ]
    },
    {
      label: '线性代数',
      items: [
        {
          id: 'formula:matrix',
          label: '矩阵',
          syntax: 'bmatrix',
          keywords: ['matrix', '矩阵'],
          template: `\\begin{bmatrix}
+[[a_{11}]] & a_{12} \\\\
+a_{21} & a_{22}
+\\end{bmatrix}`.replace(/^\+/gm, '')
        },
        {
          id: 'formula:vector',
          label: '列向量',
          syntax: 'pmatrix',
          keywords: ['vector', '向量'],
          template: `\\begin{pmatrix}
+[[x_1]] \\\\
+x_2 \\\\
+x_3
+\\end{pmatrix}`.replace(/^\+/gm, '')
        },
        {
          id: 'formula:determinant',
          label: '行列式',
          syntax: 'vmatrix',
          keywords: ['determinant', '行列式'],
          template: `\\begin{vmatrix}
+[[a]] & b \\\\
+c & d
+\\end{vmatrix}`.replace(/^\+/gm, '')
        },
        {
          id: 'formula:dot-product',
          label: '向量点积',
          syntax: '\\cdot',
          keywords: ['dot', '点积', 'vector'],
          template: '\\vec{[[a]]} \\cdot \\vec{b} = |\\vec{a}|\\,|\\vec{b}|\\cos\\theta'
        }
      ]
    },
    {
      label: '概率统计',
      items: [
        {
          id: 'formula:bayes',
          label: '贝叶斯公式',
          syntax: 'Bayes',
          keywords: ['bayes', '贝叶斯'],
          template: 'P([[A]]\\mid B)=\\frac{P(B\\mid A)P(A)}{P(B)}'
        },
        {
          id: 'formula:expectation',
          label: '期望',
          syntax: 'E(X)',
          keywords: ['expectation', '期望'],
          template: '\\mathbb{E}([[X]])=\\sum_i x_i p_i'
        },
        {
          id: 'formula:variance',
          label: '方差',
          syntax: 'Var(X)',
          keywords: ['variance', '方差'],
          template: '\\mathrm{Var}([[X]])=\\mathbb{E}\\left[(X-\\mu)^2\\right]'
        },
        {
          id: 'formula:normal',
          label: '正态分布',
          syntax: '\\mathcal{N}',
          keywords: ['normal', 'gaussian', '正态分布'],
          template: 'X \\sim \\mathcal{N}([[\\mu]], \\sigma^2)'
        }
      ]
    }
  ]

  return {
    id: rootId,
    kind: 'formula',
    label: meta.label,
    description: meta.description,
    toolbarTitle: meta.toolbarTitle,
    builtin: true,
    order,
    categories: Object.freeze(
      rawGroups.map((group, groupIndex) => {
        const categoryId = `builtin:formula:category:${groupIndex}`
        return {
          id: categoryId,
          rootId,
          kind: 'formula',
          label: group.label,
          builtin: true,
          order: groupIndex,
          items: group.items.map((item, itemIndex) =>
            createFormulaTemplate(rootId, categoryId, itemIndex, {
              ...item,
              categoryLabel: group.label
            })
          )
        }
      })
    )
  }
}

const BUILTIN_NOTE_TEMPLATE_ROOTS = Object.freeze([
  buildLegacyRoot('mermaid', 0),
  buildLegacyRoot('echarts', 1),
  buildFormulaRoot(2)
])

export function getNoteTemplateKindMeta(kind) {
  return NOTE_TEMPLATE_KIND_META[normalizeNoteTemplateKind(kind)]
}

export function getBuiltinNoteTemplateRoots() {
  return BUILTIN_NOTE_TEMPLATE_ROOTS
}

export function getBuiltinNoteTemplateRootById(rootId) {
  const targetId = String(rootId || '').trim()
  return BUILTIN_NOTE_TEMPLATE_ROOTS.find((root) => root.id === targetId) || null
}

export function getBuiltinNoteTemplateCategories(rootId) {
  if (!rootId) {
    return BUILTIN_NOTE_TEMPLATE_ROOTS.flatMap((root) => root.categories)
  }
  return getBuiltinNoteTemplateRootById(rootId)?.categories || []
}

export function flattenNoteTemplateCategories(categories) {
  return (Array.isArray(categories) ? categories : []).flatMap((category) =>
    (Array.isArray(category?.items) ? category.items : []).map((item) => ({
      ...cloneItem(item),
      rootId: String(item?.rootId || category?.rootId || '').trim(),
      categoryId: String(item?.categoryId || category?.id || '').trim(),
      categoryLabel: String(item?.categoryLabel || category?.label || '').trim()
    }))
  )
}

export function getBuiltinNoteTemplateItems(rootId) {
  return flattenNoteTemplateCategories(getBuiltinNoteTemplateCategories(rootId))
}

export function findBuiltinNoteTemplateCategoryByLabel(rootId, label) {
  const normalizedLabel = String(label || '').trim()
  if (!normalizedLabel) return null
  return (
    getBuiltinNoteTemplateCategories(rootId).find(
      (category) => String(category?.label || '').trim() === normalizedLabel
    ) || null
  )
}

export function buildSnippetForNoteTemplateItem(item, options = {}) {
  if (!item || typeof item !== 'object') return null

  if (item.type === 'action') {
    return buildSnippetForDiagramItem(item, options)
  }

  if (!item.builtin) {
    return buildSnippetForCustomTemplateItem(item)
  }

  if (normalizeNoteTemplateKind(item.kind) === 'formula') {
    return buildFormulaSnippet(item.template, item.snippetMode)
  }
  return buildSnippetForDiagramItem(item, options)
}
