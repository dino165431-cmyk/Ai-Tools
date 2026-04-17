import {
  buildDiagramContainerStyle,
  parseDiagramFenceInfo
} from './diagramFenceMeta'
import { EditorView, highlightActiveLineGutter, lineNumbers, tooltips } from '@codemirror/view'

let configureMdEditorPromise = null
let previewRuntimePromise = null
let editorRuntimePromise = null
let previewConfigured = false
let editorConfigured = false
const MD_EDITOR_PREFIX = 'md-editor'

function withNotebookMarkdownExtensions(extensions = []) {
  const hasLineNumbers = extensions.some((item) => item?.type === 'ai-tools-line-numbers')
  const hasGutterTheme = extensions.some((item) => item?.type === 'ai-tools-gutter-theme')
  const hasTooltipPosition = extensions.some((item) => item?.type === 'ai-tools-tooltip-position')
  const nextExtensions = [...extensions]

  if (!hasLineNumbers) {
    nextExtensions.unshift({
      type: 'ai-tools-line-numbers',
      extension: [lineNumbers(), highlightActiveLineGutter()]
    })
  }

  if (!hasGutterTheme) {
    nextExtensions.push({
      type: 'ai-tools-gutter-theme',
      extension: EditorView.theme({
        '.cm-lineNumbers .cm-gutterElement': {
          minWidth: '24px'
        }
      })
    })
  }

  if (!hasTooltipPosition) {
    nextExtensions.push({
      type: 'ai-tools-tooltip-position',
      extension: tooltips({ position: 'absolute' })
    })
  }

  return nextExtensions
}

function buildLightEchartsTheme() {
  return {
    color: ['#2563eb', '#0f766e', '#ea580c', '#7c3aed', '#dc2626', '#0891b2'],
    backgroundColor: 'transparent',
    textStyle: {
      color: '#0f172a'
    },
    title: {
      textStyle: {
        color: '#0f172a',
        fontWeight: 600
      },
      subtextStyle: {
        color: '#475569'
      }
    },
    legend: {
      textStyle: {
        color: '#334155'
      }
    },
    categoryAxis: {
      axisLine: {
        lineStyle: {
          color: '#cbd5e1'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#cbd5e1'
        }
      },
      axisLabel: {
        color: '#475569'
      },
      splitLine: {
        lineStyle: {
          color: '#e2e8f0'
        }
      }
    },
    valueAxis: {
      axisLine: {
        lineStyle: {
          color: '#cbd5e1'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#cbd5e1'
        }
      },
      axisLabel: {
        color: '#475569'
      },
      splitLine: {
        lineStyle: {
          color: '#e2e8f0'
        }
      }
    },
    line: {
      symbolSize: 8
    },
    gauge: {
      axisLine: {
        lineStyle: {
          color: [
            [0.4, '#38bdf8'],
            [0.7, '#2563eb'],
            [1, '#0f172a']
          ]
        }
      }
    }
  }
}

function buildDarkEchartsTheme() {
  return {
    color: ['#38bdf8', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee'],
    backgroundColor: 'transparent',
    textStyle: {
      color: '#e2e8f0'
    },
    title: {
      textStyle: {
        color: '#f8fafc',
        fontWeight: 600
      },
      subtextStyle: {
        color: '#94a3b8'
      }
    },
    legend: {
      textStyle: {
        color: '#cbd5e1'
      }
    },
    categoryAxis: {
      axisLine: {
        lineStyle: {
          color: '#475569'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#475569'
        }
      },
      axisLabel: {
        color: '#cbd5e1'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.16)'
        }
      }
    },
    valueAxis: {
      axisLine: {
        lineStyle: {
          color: '#475569'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#475569'
        }
      },
      axisLabel: {
        color: '#cbd5e1'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.16)'
        }
      }
    },
    line: {
      symbolSize: 8
    },
    gauge: {
      axisLine: {
        lineStyle: {
          color: [
            [0.4, '#22d3ee'],
            [0.7, '#4ade80'],
            [1, '#f8fafc']
          ]
        }
      }
    }
  }
}

function registerEchartsThemes(instance) {
  if (!instance || typeof instance.registerTheme !== 'function') return
  instance.registerTheme('light', buildLightEchartsTheme())
  instance.registerTheme('dark', buildDarkEchartsTheme())
}

function normalizeMermaidSource(source) {
  const text = String(source || '')
  if (!text.trim()) return text

  const replacements = [
    [/^(\s*)xychart(\s|$)/, '$1xychart-beta$2'],
    [/^(\s*)sankey(\s|$)/, '$1sankey-beta$2'],
    [/^(\s*)radar(\s|$)/, '$1radar-beta$2'],
    [/^(\s*)block(\s|$)/, '$1block-beta$2']
  ]

  let next = text
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement)
      break
    }
  }

  return next
}

function createMermaidNormalizePlugin() {
  return (md) => {
    md.core.ruler.push('normalize-mermaid-source', (state) => {
      state.tokens.forEach((token) => {
        if (token.type !== 'fence') return
        const parsed = parseDiagramFenceInfo(token.info, 'mermaid')
        if (!parsed) return
        token.info = 'mermaid'
        token.content = normalizeMermaidSource(token.content)
        applyDiagramSizeAttrs(token, parsed.size)
      })
    })
  }
}

function applyDiagramFenceAttrs(token, env) {
  if (!token?.map || token.level !== 0) return
  const endLine = token.map[1] - 1
  const endLineText = String(env?.srcLines?.[endLine] || '').trim()
  const closed = endLineText.startsWith('```') || endLineText.startsWith('~~~')
  token.attrSet('data-closed', `${closed}`)
  token.attrSet('data-line', String(token.map[0]))
}

function applyDiagramSizeAttrs(token, size) {
  if (size?.width) token.attrSet('data-ai-tools-diagram-width', size.width)
  if (size?.height) token.attrSet('data-ai-tools-diagram-height', size.height)
}

function createDiagramFencePlugin(kind, { themeAttr } = {}) {
  return (md, options = {}) => {
    const fallbackFence = md.renderer.rules.fence?.bind(md.renderer.rules)

    md.renderer.rules.fence = (tokens, index, opts, env, self) => {
      const token = tokens[index]
      const parsed = parseDiagramFenceInfo(token?.info, kind)
      if (!parsed) {
        return typeof fallbackFence === 'function'
          ? fallbackFence(tokens, index, opts, env, self)
          : self.renderToken(tokens, index, opts)
      }

      const content = String(token.content || '').trim()
      token.info = kind
      token.attrSet('class', `${MD_EDITOR_PREFIX}-${kind}`)
      if (themeAttr && options?.themeRef?.value) {
        token.attrSet(themeAttr, options.themeRef.value)
      }
      applyDiagramFenceAttrs(token, env)
      applyDiagramSizeAttrs(token, parsed.size)

      return `<div ${self.renderAttrs(token)} style="${buildDiagramContainerStyle(kind, parsed.size)}">${md.utils.escapeHtml(content)}</div>`
    }
  }
}

function enhanceDiagramPlugins(plugins) {
  return plugins.map((plugin) => {
    if (plugin?.type === 'echarts') {
      return {
        ...plugin,
        plugin: createDiagramFencePlugin('echarts', { themeAttr: 'data-echarts-theme' })
      }
    }

    return plugin
  })
}

async function getConfigureMdEditor() {
  if (!configureMdEditorPromise) {
    configureMdEditorPromise = import('md-editor-v3').then((mod) => mod.config)
  }
  return configureMdEditorPromise
}

function resolveModuleDefault(mod) {
  return mod?.default || mod
}

export async function ensureMarkdownPreviewRuntime() {
  if (!previewRuntimePromise) {
    previewRuntimePromise = (async () => {
      const configureMdEditor = await getConfigureMdEditor()
      const [katexMod, mermaidMod, echartsMod] = await Promise.all([
        import('katex'),
        import('mermaid'),
        import('echarts'),
        import('md-editor-v3/lib/style.css'),
        import('katex/dist/katex.min.css')
      ])
      const echarts = resolveModuleDefault(echartsMod)

      registerEchartsThemes(echarts)

      if (!previewConfigured) {
        configureMdEditor({
          editorExtensions: {
            katex: {
              instance: resolveModuleDefault(katexMod)
            },
            mermaid: {
              instance: resolveModuleDefault(mermaidMod)
            },
            echarts: {
              instance: echarts
            }
          },
          markdownItPlugins: (plugins) => [
            ...enhanceDiagramPlugins(plugins),
            {
              type: 'mermaid-normalize',
              plugin: createMermaidNormalizePlugin(),
              options: {}
            }
          ],
          codeMirrorExtensions: (extensions) => withNotebookMarkdownExtensions(extensions)
        })
        previewConfigured = true
      }
    })()
  }
  return previewRuntimePromise
}

export async function ensureMarkdownEditorRuntime() {
  await ensureMarkdownPreviewRuntime()
  if (!editorRuntimePromise) {
    editorRuntimePromise = (async () => {
      const configureMdEditor = await getConfigureMdEditor()
      const [cropperMod] = await Promise.all([
        import('cropperjs'),
        import('cropperjs/dist/cropper.css')
      ])

      if (!editorConfigured) {
        configureMdEditor({
          editorExtensions: {
            cropper: {
              instance: resolveModuleDefault(cropperMod)
            }
          }
        })
        editorConfigured = true
      }
    })()
  }
  return editorRuntimePromise
}
