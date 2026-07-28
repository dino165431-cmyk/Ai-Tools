import assert from 'node:assert/strict'
import test from 'node:test'

import { parseEchartsOptionSource } from '../src/utils/echartsOptionParser.js'

test('ECharts option parser accepts JSON and common static object-literal syntax', () => {
  assert.deepEqual(
    parseEchartsOptionSource(`{
      title: { text: '趋势' },
      xAxis: { type: "category", data: ['Mon', 'Tue'] },
      series: [{ type: 'line', data: [12, -3.5] }],
    }`),
    {
      title: { text: '趋势' },
      xAxis: { type: 'category', data: ['Mon', 'Tue'] },
      series: [{ type: 'line', data: [12, -3.5] }]
    }
  )
})

test('ECharts option parser supports comments and legacy option assignments', () => {
  assert.deepEqual(
    parseEchartsOptionSource(`
      const option = {
        // one line
        tooltip: { trigger: 'axis' },
        /* another line */
        series: [],
      };
    `),
    {
      tooltip: { trigger: 'axis' },
      series: []
    }
  )
})

test('ECharts option parser rejects executable expressions and extra statements', () => {
  const executableSources = [
    `({ title: { text: globalThis.location.href } })`,
    `({ formatter: () => 'x' })`,
    `({ value: new Date() })`,
    `({ value: fetch('https://example.com') })`,
    `({ value: 1 }); globalThis.compromised = true`
  ]

  executableSources.forEach((source) => {
    assert.throws(
      () => parseEchartsOptionSource(source),
      /不支持可执行表达式|无法识别|期望|额外语句/
    )
  })
})

test('ECharts option parser blocks prototype-pollution keys and excessive nesting', () => {
  assert.throws(
    () => parseEchartsOptionSource(`{ "__proto__": { polluted: true } }`),
    /危险属性名/
  )
  assert.throws(
    () => parseEchartsOptionSource('{ value: [[[[1]]]] }', { maxDepth: 3 }),
    /嵌套过深/
  )
  assert.equal({}.polluted, undefined)
})

