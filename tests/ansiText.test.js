import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAnsiTextSegments } from '../src/utils/ansiText.js'

test('parseAnsiTextSegments applies SGR colors and keeps plain text intact', () => {
  const segments = parseAnsiTextSegments('\u001b[1;32mgreen\u001b[0m plain')

  assert.deepEqual(segments, [
    {
      text: 'green',
      style: {
        color: 'var(--notebook-ansi-green)',
        fontWeight: '700'
      }
    },
    {
      text: ' plain',
      style: {}
    }
  ])
})

test('parseAnsiTextSegments supports 24-bit colors and strips unsupported control sequences', () => {
  const segments = parseAnsiTextSegments('\u001b[38;2;12;34;56mtruecolor\u001b[0m\u001b[2Kdone\u001b[38;5;196m!\u001b[0m')

  assert.equal(segments.map((segment) => segment.text).join(''), 'truecolordone!')
  assert.equal(segments.some((segment) => segment.style.color === 'rgb(12, 34, 56)'), true)
  assert.equal(segments.some((segment) => segment.style.color === 'rgb(255, 0, 0)'), true)
})

test('parseAnsiTextSegments normalizes carriage returns', () => {
  const segments = parseAnsiTextSegments('line 1\r\nline 2\rline 3')

  assert.equal(segments.map((segment) => segment.text).join(''), 'line 1\nline 2\nline 3')
})
