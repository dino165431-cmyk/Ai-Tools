import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateNotebookHtmlTableColumnWidth,
  hasStandaloneNotebookHtmlTable,
  parseNotebookHtmlTable
} from '../src/utils/notebookHtmlTable.js'

test('parseNotebookHtmlTable parses a standalone dataframe table', () => {
  const html = `
    <table class="dataframe">
      <thead>
        <tr style="text-align: right;">
          <th></th>
          <th>id</th>
          <th>offer_name</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>0</th>
          <td>179734</td>
          <td>[FIG]BforBank-1728_iOS_FR_CPA_Click_AJ_[1rbpw5ml]</td>
        </tr>
        <tr>
          <th>1</th>
          <td>179735</td>
          <td>Short text</td>
        </tr>
      </tbody>
    </table>
  `

  const model = parseNotebookHtmlTable(html)

  assert.ok(model)
  assert.deepEqual(model.columns.map((column) => column.label), ['#', 'id', 'offer_name'])
  assert.equal(model.rows.length, 2)
  assert.equal(model.rows[0].col_0, '0')
  assert.equal(model.rows[0].col_1, '179734')
  assert.match(model.rows[0].col_2, /BforBank/)
  assert.ok(model.columns[2].width >= model.columns[1].width)
})

test('hasStandaloneNotebookHtmlTable rejects html with surrounding content', () => {
  const html = `
    <p>query result</p>
    <table class="dataframe">
      <thead>
        <tr>
          <th>id</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
        </tr>
      </tbody>
    </table>
    <p>extra text</p>
  `

  assert.equal(hasStandaloneNotebookHtmlTable(html), false)
  assert.equal(parseNotebookHtmlTable(html), null)
})

test('estimateNotebookHtmlTableColumnWidth prefers long values', () => {
  const shortWidth = estimateNotebookHtmlTableColumnWidth('id', ['1', '2', '3'])
  const longWidth = estimateNotebookHtmlTableColumnWidth('track_link', ['https://example.com/a/very/long/url/path/with/query?token=abc123'])

  assert.ok(shortWidth >= 96)
  assert.ok(longWidth <= 300)
  assert.ok(longWidth > shortWidth)
})
