import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser as XmlDomParser, XMLSerializer } from '@xmldom/xmldom'

function installMinimalDom() {
  if (globalThis.window && globalThis.document) {
    return
  }

  const serializer = new XMLSerializer()
  const xhtmlMime = 'application/xhtml+xml'

  function serializeChildren(node) {
    return Array.from(node.childNodes || []).map((child) => serializer.serializeToString(child)).join('')
  }

  function copyPrototypeAccessors(instance, prototype) {
    const propertyNames = ['parentNode', 'childNodes', 'nextSibling', 'firstChild', 'lastChild', 'ownerDocument', 'textContent', 'namespaceURI']
    for (const propertyName of propertyNames) {
      if (Object.getOwnPropertyDescriptor(prototype, propertyName)) continue
      const descriptor = Object.getOwnPropertyDescriptor(instance, propertyName)
      if (!descriptor) continue
      Object.defineProperty(prototype, propertyName, descriptor)
    }
  }

  function enhanceDocument(document) {
    if (!document.createNodeIterator) {
      document.createNodeIterator = function(root) {
        const nodes = []
        const visit = (node) => {
          nodes.push(node)
          const children = node.childNodes ? Array.from(node.childNodes) : []
          for (const child of children) visit(child)
        }
        visit(root)
        let index = -1
        return {
          nextNode() {
            index += 1
            return nodes[index] ?? null
          }
        }
      }
    }
    if (!document.importNode) {
      document.importNode = (node) => node.cloneNode(true)
    }
    if (!document.implementation.createHTMLDocument) {
      document.implementation.createHTMLDocument = () => createHtmlDocument('')
    }
    return document
  }

  function createHtmlDocument(fragment = '') {
    const document = new XmlDomParser().parseFromString(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>${fragment}</body></html>`,
      xhtmlMime
    )
    return enhanceDocument(document)
  }

  class TestDOMParser {
    parseFromString(markup, mimeType = 'text/html') {
      if (mimeType === 'text/html') {
        return createHtmlDocument(markup)
      }
      return enhanceDocument(new XmlDomParser().parseFromString(markup, mimeType))
    }
  }

  const bootstrapDocument = createHtmlDocument('')
  const sampleElement = bootstrapDocument.createElement('div')
  const sampleFragment = bootstrapDocument.createDocumentFragment()
  const sampleText = bootstrapDocument.createTextNode('x')

  const elementPrototype = Object.getPrototypeOf(sampleElement)
  const fragmentPrototype = Object.getPrototypeOf(sampleFragment)
  const documentPrototype = Object.getPrototypeOf(bootstrapDocument)
  const nodePrototype = Object.getPrototypeOf(elementPrototype)

  copyPrototypeAccessors(sampleElement, elementPrototype)
  copyPrototypeAccessors(sampleElement, nodePrototype)
  copyPrototypeAccessors(sampleFragment, fragmentPrototype)
  copyPrototypeAccessors(sampleFragment, Object.getPrototypeOf(fragmentPrototype))
  copyPrototypeAccessors(sampleText, Object.getPrototypeOf(sampleText))

  if (!Object.getOwnPropertyDescriptor(elementPrototype, 'innerHTML')) {
    Object.defineProperty(elementPrototype, 'innerHTML', {
      get() {
        return serializeChildren(this)
      },
      set(value) {
        while (this.firstChild) {
          this.removeChild(this.firstChild)
        }
        if (!value) return
        const parsed = createHtmlDocument(value)
        const parsedBody = parsed.getElementsByTagName('body')[0]
        while (parsedBody.firstChild) {
          this.appendChild(parsedBody.firstChild)
        }
      }
    })
  }

  if (!Object.getOwnPropertyDescriptor(elementPrototype, 'outerHTML')) {
    Object.defineProperty(elementPrototype, 'outerHTML', {
      get() {
        return serializer.serializeToString(this)
      }
    })
  }

  if (!Object.getOwnPropertyDescriptor(fragmentPrototype, 'innerHTML')) {
    Object.defineProperty(fragmentPrototype, 'innerHTML', {
      get() {
        return serializeChildren(this)
      }
    })
  }

  if (!Object.getOwnPropertyDescriptor(documentPrototype, 'body')) {
    Object.defineProperty(documentPrototype, 'body', {
      get() {
        return this.getElementsByTagName('body')[0] ?? null
      }
    })
  }

  const windowLike = {
    document: bootstrapDocument,
    Element: sampleElement.constructor,
    HTMLElement: sampleElement.constructor,
    Node: sampleElement.constructor,
    DocumentFragment: sampleFragment.constructor,
    HTMLTemplateElement: function HTMLTemplateElement() {},
    HTMLFormElement: function HTMLFormElement() {},
    NamedNodeMap: sampleElement.attributes.constructor,
    MozNamedAttrMap: sampleElement.attributes.constructor,
    NodeFilter: {
      SHOW_ELEMENT: 0x1,
      SHOW_TEXT: 0x4,
      SHOW_COMMENT: 0x80,
      SHOW_PROCESSING_INSTRUCTION: 0x40,
      SHOW_CDATA_SECTION: 0x8
    },
    DOMParser: TestDOMParser,
    XMLSerializer
  }

  globalThis.window = windowLike
  globalThis.document = bootstrapDocument
  globalThis.Element = windowLike.Element
  globalThis.HTMLElement = windowLike.HTMLElement
  globalThis.Node = windowLike.Node
  globalThis.DocumentFragment = windowLike.DocumentFragment
  globalThis.HTMLTemplateElement = windowLike.HTMLTemplateElement
  globalThis.HTMLFormElement = windowLike.HTMLFormElement
  globalThis.NamedNodeMap = windowLike.NamedNodeMap
  globalThis.MozNamedAttrMap = windowLike.MozNamedAttrMap
  globalThis.NodeFilter = windowLike.NodeFilter
  globalThis.DOMParser = TestDOMParser
}

installMinimalDom()

const DOMPurify = (await import('dompurify')).default
const { sanitizeHtml } = await import('../src/utils/sanitizeHtml.js')

test('sanitizeHtml removes dangerous tags, inline handlers, and javascript urls', () => {
  const sanitized = sanitizeHtml([
    '<div onclick="alert(1)">hello</div>',
    '<script>alert(1)</script>',
    '<iframe src="https://example.com"></iframe>',
    '<a href="javascript:alert(1)">open</a>'
  ].join(''))

  const removedEntries = DOMPurify.removed.map((item) => item.element?.nodeName || item.attribute?.name).filter(Boolean)

  assert.match(sanitized, /<div[^>]*>hello<\/div>/i)
  assert.doesNotMatch(sanitized, /\sonclick=/i)
  assert.doesNotMatch(sanitized, /javascript:/i)
  assert.ok(removedEntries.includes('script'))
  assert.ok(removedEntries.includes('iframe'))
  assert.ok(removedEntries.includes('onclick'))
  assert.ok(removedEntries.includes('href'))
})

test('sanitizeHtml keeps benign rich text markup intact', () => {
  const sanitized = sanitizeHtml([
    '<table><tbody><tr><th>name</th><td>value</td></tr></tbody></table>',
    '<p><strong>ok</strong></p>',
    '<a href="note:/demo.md">note</a>',
    '<a href="sandbox-file://chat-demo/output/result.zip">download</a>'
  ].join(''))

  assert.match(sanitized, /<table/i)
  assert.match(sanitized, /<tbody/i)
  assert.match(sanitized, /<tr/i)
  assert.match(sanitized, /<th[^>]*>name<\/th>/i)
  assert.match(sanitized, /<td[^>]*>value<\/td>/i)
  assert.match(sanitized, /<strong[^>]*>ok<\/strong>/i)
  assert.match(sanitized, /href="note:\/demo\.md"/i)
  assert.match(sanitized, /href="sandbox-file:\/\/chat-demo\/output\/result\.zip"/i)
})
