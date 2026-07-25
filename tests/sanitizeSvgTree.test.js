import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser as XmlDomParser, XMLSerializer } from '@xmldom/xmldom'

function installMinimalDom() {
  if (globalThis.window && globalThis.document && globalThis.DOMParser) return

  function walk(node, visit) {
    visit(node)
    const children = node.childNodes ? Array.from(node.childNodes) : []
    for (const child of children) walk(child, visit)
  }

  function attachQueryHelpers(node) {
    if (!node || typeof node !== 'object') return node
    if (typeof node.hasAttribute !== 'function') {
      node.hasAttribute = function(name) {
        return this.getAttribute(name) != null
      }
    }
    if (typeof node.querySelectorAll !== 'function') {
      node.querySelectorAll = function(selector) {
        const normalized = String(selector || '').trim().toLowerCase()
        const names = normalized
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
        const matches = []
        walk(this, (current) => {
          const name = String(current?.nodeName || '').toLowerCase()
          if (names.includes(name)) matches.push(current)
        })
        return matches
      }
    }
    const children = node.childNodes ? Array.from(node.childNodes) : []
    children.forEach((child) => attachQueryHelpers(child))
    return node
  }

  class TestDOMParser {
    parseFromString(markup, mimeType = 'image/svg+xml') {
      const document = new XmlDomParser().parseFromString(markup, mimeType)
      if (!document.importNode) {
        document.importNode = (node) => node.cloneNode(true)
      }
      attachQueryHelpers(document)
      attachQueryHelpers(document.documentElement)
      return document
    }
  }

  globalThis.window = {
    DOMParser: TestDOMParser,
    XMLSerializer
  }
  globalThis.DOMParser = TestDOMParser
  globalThis.XMLSerializer = XMLSerializer
  globalThis.document = new TestDOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'image/svg+xml'
  )
}

installMinimalDom()

const { sanitizeSvgTree } = await import('../src/utils/sanitizeSvg.js')

test('sanitizeSvgTree strips scripts, event handlers, and external hrefs', () => {
  const svg = sanitizeSvgTree(`
    <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(1)</script>
      <a href="https://example.com" onclick="alert(2)">
        <text>hello</text>
      </a>
    </svg>
  `)

  const output = new XMLSerializer().serializeToString(svg)
  assert.doesNotMatch(output, /script/i)
  assert.doesNotMatch(output, /onload=/i)
  assert.doesNotMatch(output, /onclick=/i)
  assert.doesNotMatch(output, /href="https:\/\/example\.com"/i)
  assert.match(output, /hello/)
})
