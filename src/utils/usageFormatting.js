const exactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0
})

export function toNonNegativeUsageNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function formatExactUsageNumber(value) {
  return exactNumberFormatter.format(Math.round(toNonNegativeUsageNumber(value)))
}

export function formatCompactUsageNumber(value) {
  const number = toNonNegativeUsageNumber(value)
  if (number < 1000) return formatExactUsageNumber(number)

  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' }
  ]
  const unit = units.find((item) => number >= item.threshold)
  if (!unit) return formatExactUsageNumber(number)

  const scaled = number / unit.threshold
  const maximumFractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return `${scaled.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  })}${unit.suffix}`
}

export function formatUsagePercentage(numerator, denominator) {
  const total = toNonNegativeUsageNumber(denominator)
  if (!total) return '0%'
  const percentage = Math.min(100, Math.max(0, (toNonNegativeUsageNumber(numerator) / total) * 100))
  return `${percentage.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: percentage >= 10 ? 1 : 2
  })}%`
}

export function formatUsageMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''))
  if (!match) return '本月'
  return `${Number(match[1])} 年 ${Number(match[2])} 月`
}
