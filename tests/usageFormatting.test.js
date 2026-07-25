import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatCompactUsageNumber,
  formatExactUsageNumber,
  formatUsageMonth,
  formatUsagePercentage
} from '../src/utils/usageFormatting.js'

test('usage number formatting applies readable units by magnitude', () => {
  assert.equal(formatCompactUsageNumber(999), '999')
  assert.equal(formatCompactUsageNumber(1234), '1.23K')
  assert.equal(formatCompactUsageNumber(12_345), '12.3K')
  assert.equal(formatCompactUsageNumber(1_250_000), '1.25M')
  assert.equal(formatCompactUsageNumber(2_500_000_000), '2.5B')
  assert.equal(formatExactUsageNumber(1_234_567), '1,234,567')
})

test('usage percentage and month labels stay concise', () => {
  assert.equal(formatUsagePercentage(250, 1000), '25%')
  assert.equal(formatUsagePercentage(1, 3), '33.3%')
  assert.equal(formatUsagePercentage(0, 0), '0%')
  assert.equal(formatUsageMonth('2026-07'), '2026 年 7 月')
  assert.equal(formatUsageMonth('invalid'), '本月')
})
