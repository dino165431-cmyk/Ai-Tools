const ANSI_CSI_PATTERN = /\u001b\[([0-9;?]*)([ -\/]*)([@-~])/g
const ANSI_OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

const ANSI_COLOR_VARS = Object.freeze([
  'var(--notebook-ansi-black)',
  'var(--notebook-ansi-red)',
  'var(--notebook-ansi-green)',
  'var(--notebook-ansi-yellow)',
  'var(--notebook-ansi-blue)',
  'var(--notebook-ansi-magenta)',
  'var(--notebook-ansi-cyan)',
  'var(--notebook-ansi-white)',
  'var(--notebook-ansi-bright-black)',
  'var(--notebook-ansi-bright-red)',
  'var(--notebook-ansi-bright-green)',
  'var(--notebook-ansi-bright-yellow)',
  'var(--notebook-ansi-bright-blue)',
  'var(--notebook-ansi-bright-magenta)',
  'var(--notebook-ansi-bright-cyan)',
  'var(--notebook-ansi-bright-white)'
])

function normalizeAnsiText(text = '') {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function createAnsiState() {
  return {
    fg: '',
    bg: '',
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strike: false,
    hidden: false,
    inverse: false
  }
}

function resetAnsiState(state) {
  state.fg = ''
  state.bg = ''
  state.bold = false
  state.dim = false
  state.italic = false
  state.underline = false
  state.strike = false
  state.hidden = false
  state.inverse = false
}

function resolveAnsiColor256(code) {
  const normalized = Number(code)
  if (!Number.isFinite(normalized)) return ''
  if (normalized >= 0 && normalized <= 15) {
    return ANSI_COLOR_VARS[normalized] || ''
  }
  if (normalized >= 16 && normalized <= 231) {
    const index = normalized - 16
    const red = Math.floor(index / 36)
    const green = Math.floor((index % 36) / 6)
    const blue = index % 6
    const channel = [red, green, blue].map((value) => (value === 0 ? 0 : 55 + (value * 40)))
    return `rgb(${channel[0]}, ${channel[1]}, ${channel[2]})`
  }
  if (normalized >= 232 && normalized <= 255) {
    const value = 8 + ((normalized - 232) * 10)
    return `rgb(${value}, ${value}, ${value})`
  }
  return ''
}

function resolveAnsiColor(code) {
  const normalized = Number(code)
  if (!Number.isFinite(normalized)) return ''
  if (normalized >= 0 && normalized <= 15) return ANSI_COLOR_VARS[normalized] || ''
  if (normalized >= 16 && normalized <= 255) return resolveAnsiColor256(normalized)
  return ''
}

function applyAnsiColorCodes(params, state, target) {
  const mode = params[1]
  if (mode === 5 && params.length > 2) {
    const color = resolveAnsiColor(params[2])
    if (color) state[target] = color
    return 2
  }
  if (mode === 2 && params.length > 4) {
    const red = Number(params[2])
    const green = Number(params[3])
    const blue = Number(params[4])
    if ([red, green, blue].every((value) => Number.isFinite(value))) {
      state[target] = `rgb(${red}, ${green}, ${blue})`
    }
    return 4
  }
  return 0
}

function applyAnsiSgr(paramsText, state) {
  const params = String(paramsText || '')
    .split(';')
    .filter((item) => item !== '')
    .map((item) => Number(item))

  if (!params.length) {
    resetAnsiState(state)
    return
  }

  for (let index = 0; index < params.length; index += 1) {
    const code = params[index]
    if (!Number.isFinite(code)) continue

    switch (code) {
      case 0:
        resetAnsiState(state)
        break
      case 1:
        state.bold = true
        break
      case 2:
        state.dim = true
        break
      case 3:
        state.italic = true
        break
      case 4:
        state.underline = true
        break
      case 7:
        state.inverse = true
        break
      case 8:
        state.hidden = true
        break
      case 9:
        state.strike = true
        break
      case 21:
      case 22:
        state.bold = false
        state.dim = false
        break
      case 23:
        state.italic = false
        break
      case 24:
        state.underline = false
        break
      case 27:
        state.inverse = false
        break
      case 28:
        state.hidden = false
        break
      case 29:
        state.strike = false
        break
      case 39:
        state.fg = ''
        break
      case 49:
        state.bg = ''
        break
      case 38:
        index += applyAnsiColorCodes(params.slice(index), state, 'fg')
        break
      case 48:
        index += applyAnsiColorCodes(params.slice(index), state, 'bg')
        break
      default:
        if (code >= 30 && code <= 37) {
          state.fg = ANSI_COLOR_VARS[code - 30] || ''
        } else if (code >= 90 && code <= 97) {
          state.fg = ANSI_COLOR_VARS[code - 90 + 8] || ''
        } else if (code >= 40 && code <= 47) {
          state.bg = ANSI_COLOR_VARS[code - 40] || ''
        } else if (code >= 100 && code <= 107) {
          state.bg = ANSI_COLOR_VARS[code - 100 + 8] || ''
        }
        break
    }
  }
}

function buildAnsiStyle(state) {
  const style = {}

  if (state.hidden) {
    style.color = 'transparent'
    return style
  }

  if (state.inverse) {
    style.filter = 'invert(100%)'
  }

  if (state.fg) style.color = state.fg
  if (state.bg) style.backgroundColor = state.bg
  if (state.bold) style.fontWeight = '700'
  if (state.dim) style.opacity = '0.72'
  if (state.italic) style.fontStyle = 'italic'
  if (state.strike || state.underline) {
    const decorations = []
    if (state.underline) decorations.push('underline')
    if (state.strike) decorations.push('line-through')
    style.textDecorationLine = decorations.join(' ')
  }

  return style
}

function pushAnsiSegment(segments, text, state) {
  if (!text) return
  segments.push({
    text,
    style: buildAnsiStyle(state)
  })
}

export function parseAnsiTextSegments(rawText = '') {
  const text = normalizeAnsiText(rawText).replace(ANSI_OSC_PATTERN, '')
  if (!text) return []

  const segments = []
  const state = createAnsiState()
  let lastIndex = 0

  ANSI_CSI_PATTERN.lastIndex = 0

  let match = ANSI_CSI_PATTERN.exec(text)
  while (match) {
    pushAnsiSegment(segments, text.slice(lastIndex, match.index), state)
    if (match[3] === 'm') {
      applyAnsiSgr(match[1], state)
    }
    lastIndex = ANSI_CSI_PATTERN.lastIndex
    match = ANSI_CSI_PATTERN.exec(text)
  }

  pushAnsiSegment(segments, text.slice(lastIndex), state)
  return segments
}
