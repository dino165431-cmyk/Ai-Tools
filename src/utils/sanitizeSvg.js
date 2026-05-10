function parseSvgInput(svgInput) {
  if (typeof svgInput === 'string') {
    const doc = new DOMParser().parseFromString(svgInput, 'image/svg+xml')
    const svg = doc.documentElement
    if (!svg || String(svg.nodeName || '').toLowerCase() !== 'svg') {
      throw new Error('SVG 解析失败')
    }
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }
    return svg
  }

  if (!svgInput) {
    throw new Error('SVG 不存在')
  }

  return svgInput
}

function getNodeChildren(node) {
  return node?.childNodes ? Array.from(node.childNodes) : []
}

function walkSvgTree(node, visit) {
  if (!node) return
  visit(node)
  getNodeChildren(node).forEach((child) => walkSvgTree(child, visit))
}

function removeNode(node) {
  try {
    if (typeof node?.remove === 'function') {
      node.remove()
      return
    }
  } catch {
    // fall through
  }

  try {
    node?.parentNode?.removeChild?.(node)
  } catch {
    // ignore
  }
}

function sanitizeSvgCssText(cssText) {
  return String(cssText || '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\(([^)]+)\)/gi, (match, rawValue) => {
      const value = String(rawValue || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')

      if (!value) return 'none'
      if (value.startsWith('#') || value.startsWith('data:')) return match
      return 'none'
    })
}

function isExternalSvgReference(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.startsWith('#') || text.startsWith('data:')) return false
  return true
}

export function sanitizeSvgTree(svgInput, { aggressive = false } = {}) {
  const svg = parseSvgInput(svgInput)

  const sanitizeElement = (node) => {
    if (Number(node?.nodeType) !== 1) {
      return
    }

    const tagName = String(node.nodeName || '').toLowerCase()

    if (tagName === 'script') {
      removeNode(node)
      return
    }

    if (aggressive && tagName === 'foreignobject') {
      removeNode(node)
      return
    }

    Array.from(node.attributes || []).forEach((attr) => {
      const name = String(attr?.name || '').toLowerCase()
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name)
      }
    })

    if (tagName === 'style') {
      node.textContent = sanitizeSvgCssText(node.textContent || '')
      return
    }

    if (typeof node.hasAttribute === 'function' && node.hasAttribute('style')) {
      node.setAttribute('style', sanitizeSvgCssText(node.getAttribute('style')))
    }

    const href = String(
      node.getAttribute?.('href') ||
        node.getAttribute?.('xlink:href') ||
        node.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ||
        ''
    ).trim()

    if (tagName !== 'image' && isExternalSvgReference(href)) {
      node.removeAttribute('href')
      node.removeAttribute('xlink:href')
      node.removeAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
    }

    ;['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start', 'marker-mid', 'marker-end'].forEach(
      (attrName) => {
        const value = String(node.getAttribute(attrName) || '').trim()
        if (!/url\(/i.test(value)) return
        if (/url\(\s*['"]?(#|data:)/i.test(value)) return
        node.removeAttribute(attrName)
      }
    )
  }

  sanitizeElement(svg)

  walkSvgTree(svg, (node) => {
    if (node !== svg) sanitizeElement(node)
  })

  return svg
}
