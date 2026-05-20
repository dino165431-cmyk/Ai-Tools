import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDiagramContainerStyle,
  buildDiagramFenceMetaMap,
  getDiagramFenceMetaForLine,
  normalizeDiagramDimension,
  parseDiagramFenceInfo
} from '../src/utils/diagramFenceMeta.js'

test('parseDiagramFenceInfo supports width and height in fence info', () => {
  assert.deepEqual(parseDiagramFenceInfo('echarts {width=800 height=400}'), {
    kind: 'echarts',
    raw: 'echarts {width=800 height=400}',
    attrs: {
      width: '800',
      height: '400'
    },
    size: {
      width: '800px',
      height: '400px'
    },
    hasMeta: true
  })

  assert.deepEqual(parseDiagramFenceInfo('mermaid width=75% h=320px'), {
    kind: 'mermaid',
    raw: 'mermaid width=75% h=320px',
    attrs: {
      width: '75%',
      h: '320px'
    },
    size: {
      width: '75%',
      height: '320px'
    },
    hasMeta: true
  })
})

test('buildDiagramFenceMetaMap indexes diagram size by kind and start line', () => {
  const markdown = [
    '# Demo',
    '```echarts {width=800 height=400}',
    '{',
    '  title: { text: "Hello" }',
    '}',
    '```',
    '',
    '```mermaid width=60%',
    'graph TD',
    '  A --> B',
    '```'
  ].join('\n')

  const map = buildDiagramFenceMetaMap(markdown)

  assert.deepEqual(getDiagramFenceMetaForLine(map, 'echarts', 1), {
    kind: 'echarts',
    line: 1,
    width: '800px',
    height: '400px'
  })

  assert.deepEqual(getDiagramFenceMetaForLine(map, 'mermaid', 7), {
    kind: 'mermaid',
    line: 7,
    width: '60%',
    height: ''
  })
})

test('diagram dimension normalization and container style stay predictable', () => {
  assert.equal(normalizeDiagramDimension('960'), '960px')
  assert.equal(normalizeDiagramDimension('55%'), '55%')
  assert.equal(normalizeDiagramDimension('bad-value'), '')

  assert.equal(
    buildDiagramContainerStyle('echarts', { width: '800px', height: '400px' }),
    'margin: 0 auto; width: 100%; max-width: 800px; height: 400px; aspect-ratio: auto'
  )
})
