import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEchartsOptionSnippetFromSelection,
  parseJsonToDataset,
  parseMarkdownTableToDataset,
  parseSelectionToEchartsDataset
} from '../src/utils/echartsDataTransform.js'

test('parseMarkdownTableToDataset extracts categories and series from markdown tables', () => {
  const dataset = parseMarkdownTableToDataset(`
| Month | Sales | Profit |
| --- | ---: | ---: |
| Jan | 12 | 5 |
| Feb | 20 | 9 |
`)

  assert.deepEqual(dataset, {
    categories: ['Jan', 'Feb'],
    series: [
      { name: 'Sales', data: [12, 20] },
      { name: 'Profit', data: [5, 9] }
    ]
  })
})

test('parseMarkdownTableToDataset supports centered separator rows with two dashes', () => {
  const dataset = parseMarkdownTableToDataset(`
| a | b | c |
| :--: | :--: | :--: |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
`)

  assert.deepEqual(dataset, {
    categories: ['1', '4'],
    series: [
      { name: 'b', data: [2, 5] },
      { name: 'c', data: [3, 6] }
    ]
  })
})

test('parseMarkdownTableToDataset supports single dash separator rows', () => {
  const dataset = parseMarkdownTableToDataset(`
| Column | | |
| - | - | - |
| A | 1 | 2 |
| B | 3 | 4 |
`)

  assert.deepEqual(dataset, {
    categories: ['A', 'B'],
    series: [
      { name: '系列 1', data: [1, 3] },
      { name: '系列 2', data: [2, 4] }
    ]
  })
})

test('parseJsonToDataset supports simple record arrays', () => {
  const dataset = parseJsonToDataset(JSON.stringify([
    { month: 'Jan', visits: 120, signups: 32 },
    { month: 'Feb', visits: 150, signups: 41 }
  ]))

  assert.deepEqual(dataset, {
    categories: ['Jan', 'Feb'],
    series: [
      { name: 'visits', data: [120, 150] },
      { name: 'signups', data: [32, 41] }
    ]
  })
})

test('buildEchartsOptionSnippetFromSelection generates editable chart snippets', () => {
  const snippet = buildEchartsOptionSnippetFromSelection(`
| Week | Orders |
| --- | ---: |
| W1 | 12 |
| W2 | 18 |
`, { chartType: 'bar' })

  assert.match(snippet, /text: '\[\[图表标题\]\]'/)
  assert.match(snippet, /type: ["']bar["']/)
  assert.match(snippet, /data: \[\s*"W1",\s*"W2"\s*\]/)
  assert.match(snippet, /data: \[\s*12,\s*18\s*\]/)
})

test('parseSelectionToEchartsDataset returns null for unsupported content', () => {
  assert.equal(parseSelectionToEchartsDataset('plain text only'), null)
})
