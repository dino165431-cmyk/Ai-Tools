<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--usage', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center" :wrap="false">
        <n-flex align="center" :size="10">
          <n-icon :component="DataUsage20Regular" size="20" :depth="1" />
          <div>
            <n-text strong>用量统计</n-text>
            <n-text depth="3" class="usage-period">{{ rangeLabel }}</n-text>
          </div>
        </n-flex>
        <n-button size="small" secondary :loading="loading" @click="loadSummary">
          <template #icon>
            <n-icon :component="ArrowClockwise20Regular" />
          </template>
          刷新
        </n-button>
      </n-flex>

      <n-flex class="usage-controls" align="center" :size="8" wrap>
        <n-select
          v-model:value="rangePreset"
          size="small"
          :options="rangePresetOptions"
          style="width: 118px"
          @update:value="handlePresetChange"
        />
        <n-date-picker
          v-if="rangePreset === 'custom'"
          v-model:value="customDateRange"
          type="daterange"
          size="small"
          :clearable="false"
          :actions="['confirm']"
          style="width: 270px"
          @update:value="handleCustomDateRangeChange"
        />
        <n-select
          v-model:value="groupBy"
          size="small"
          :options="groupByOptions"
          style="width: 104px"
          @update:value="loadSummary"
        />
      </n-flex>
    </n-card>

    <div class="usage-metrics">
      <n-card
        v-for="metric in metricCards"
        :key="metric.key"
        size="small"
        class="usage-metric-card"
      >
        <n-text depth="3" class="usage-metric-card__label">{{ metric.label }}</n-text>
        <div class="usage-metric-card__value" :title="metric.exactTitle">
          {{ metric.value }}
        </div>
        <n-text depth="3" class="usage-metric-card__hint">{{ metric.hint }}</n-text>
      </n-card>
    </div>

    <n-card size="small" class="usage-chart-card" style="width: 100%">
      <template #header>
        <n-flex justify="space-between" align="center" wrap :size="8">
          <n-flex align="center" :size="8">
            <n-icon :component="ChartMultiple20Regular" size="18" />
            <n-text strong>时间趋势</n-text>
          </n-flex>
          <n-flex align="center" :size="8">
            <n-select
              v-model:value="chartMetric"
              size="small"
              :options="chartMetricOptions"
              style="width: 124px"
              @update:value="renderChart"
            />
            <n-tag size="small" bordered>
              当前合计 {{ formatCompactNumber(currentChartTotal) }} {{ currentChartMetric.unit }}
            </n-tag>
          </n-flex>
        </n-flex>
      </template>

      <n-spin :show="loading">
        <div class="usage-chart-shell">
          <div ref="chartElement" class="usage-chart" />
          <n-empty
            v-if="!loading && !summary.requests"
            class="usage-chart-empty"
            description="所选时间内暂无用量记录"
          />
        </div>
      </n-spin>
    </n-card>

    <n-card size="small" class="usage-table-card" style="width: 100%">
      <template #header>
        <n-flex justify="space-between" align="center">
          <n-flex align="center" :size="8">
            <n-icon :component="ChartMultiple20Regular" size="18" />
            <n-text strong>按模型统计</n-text>
          </n-flex>
          <n-tag size="small" bordered>{{ rows.length }} 个模型</n-tag>
        </n-flex>
      </template>

      <n-empty v-if="!rows.length && !loading" description="所选时间内暂无用量记录" />
      <n-data-table
        v-else
        class="usage-table"
        :columns="columns"
        :data="rows"
        :loading="loading"
        :bordered="false"
        :pagination="tablePagination"
        :scroll-x="980"
        size="small"
      />
    </n-card>
  </n-flex>
</template>

<script setup>
import * as echarts from 'echarts'
import {
  computed,
  h,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch
} from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NEmpty,
  NFlex,
  NIcon,
  NSelect,
  NSpin,
  NTag,
  NText,
  NTooltip,
  useMessage
} from 'naive-ui'
import {
  ArrowClockwise20Regular,
  ChartMultiple20Regular,
  DataUsage20Regular
} from '@vicons/fluent'
import { getTheme } from '@/utils/configListener'
import {
  formatCompactUsageNumber as formatCompactNumber,
  formatExactUsageNumber as formatExactNumber,
  formatUsagePercentage as formatPercentage,
  toNonNegativeUsageNumber as toNonNegativeNumber
} from '@/utils/usageFormatting'

defineOptions({ name: 'Usage' })

const DAY_MS = 24 * 60 * 60 * 1000
const message = useMessage()
const theme = getTheme()
const loading = ref(false)
const chartElement = ref(null)
const rangePreset = ref('7d')
const groupBy = ref('day')
const chartMetric = ref('totalTokens')
const customDateRange = ref(createLastDaysRange(7))
let chart = null
let chartResizeObserver = null
let latestLoadId = 0
const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange(page) {
    pagination.page = page
  },
  onUpdatePageSize(pageSize) {
    pagination.pageSize = pageSize
    pagination.page = 1
  }
})

const summary = reactive(createEmptySummary())

const rangePresetOptions = [
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '本月', value: 'month' },
  { label: '自定义', value: 'custom' }
]

const chartMetricOptions = [
  { label: '总 Token', value: 'totalTokens' },
  { label: '请求次数', value: 'requests' },
  { label: '输入 Token', value: 'inputTokens' },
  { label: '输出 Token', value: 'outputTokens' },
  { label: '缓存读取', value: 'cachedTokens' },
  { label: '缓存写入', value: 'cacheWriteTokens' },
  { label: '推理 Token', value: 'reasoningTokens' }
]

const chartMetricMeta = {
  totalTokens: { label: '总 Token', color: '#18a058', unit: 'Token' },
  requests: { label: '请求次数', color: '#2080f0', unit: '次' },
  inputTokens: { label: '输入 Token', color: '#0ea5e9', unit: 'Token' },
  outputTokens: { label: '输出 Token', color: '#8b5cf6', unit: 'Token' },
  cachedTokens: { label: '缓存读取', color: '#f59e0b', unit: 'Token' },
  cacheWriteTokens: { label: '缓存写入', color: '#ef8354', unit: 'Token' },
  reasoningTokens: { label: '推理 Token', color: '#ec4899', unit: 'Token' }
}

const selectedRange = computed(resolveSelectedRange)
const rangeDuration = computed(() => selectedRange.value.endAt - selectedRange.value.startAt)
const groupByOptions = computed(() => [
  { label: '按小时', value: 'hour', disabled: rangeDuration.value > 31 * DAY_MS },
  { label: '按天', value: 'day', disabled: rangeDuration.value > 3 * 366 * DAY_MS },
  { label: '按月', value: 'month' }
])
const currentChartMetric = computed(() => chartMetricMeta[chartMetric.value] || chartMetricMeta.totalTokens)
const currentChartTotal = computed(() => toNonNegativeNumber(summary[chartMetric.value]))
const rangeLabel = computed(() => formatRangeLabel(selectedRange.value))
const cacheRate = computed(() => formatPercentage(summary.cachedTokens, summary.cacheReportedInputTokens))
const averageTokens = computed(() => {
  const requests = toNonNegativeNumber(summary.requests)
  return requests ? summary.totalTokens / requests : 0
})

const metricCards = computed(() => [
  {
    key: 'requests',
    label: '请求次数',
    value: formatCompactNumber(summary.requests),
    exactTitle: `${formatExactNumber(summary.requests)} 次请求`,
    hint: `${formatExactNumber(Object.keys(summary.byModel || {}).length)} 个模型`
  },
  {
    key: 'total',
    label: '总 Token',
    value: formatCompactNumber(summary.totalTokens),
    exactTitle: `${formatExactNumber(summary.totalTokens)} Token`,
    hint: `平均 ${formatCompactNumber(averageTokens.value)} / 次`
  },
  {
    key: 'input',
    label: '输入 Token',
    value: formatCompactNumber(summary.inputTokens),
    exactTitle: `${formatExactNumber(summary.inputTokens)} Token`,
    hint: `占总量 ${formatPercentage(summary.inputTokens, summary.totalTokens)}`
  },
  {
    key: 'output',
    label: '输出 Token',
    value: formatCompactNumber(summary.outputTokens),
    exactTitle: `${formatExactNumber(summary.outputTokens)} Token`,
    hint: `占总量 ${formatPercentage(summary.outputTokens, summary.totalTokens)}`
  },
  {
    key: 'cached',
    label: '缓存读取',
    value: formatCompactNumber(summary.cachedTokens),
    exactTitle: `${formatExactNumber(summary.cachedTokens)} Token`,
    hint: summary.cacheReportedRequests
      ? `命中率 ${cacheRate.value} · ${formatExactNumber(summary.cacheReportedRequests)}/${formatExactNumber(summary.requests)} 次上报`
      : '提供商未返回缓存明细'
  },
  {
    key: 'cache_write',
    label: '缓存写入',
    value: formatCompactNumber(summary.cacheWriteTokens),
    exactTitle: `${formatExactNumber(summary.cacheWriteTokens)} Token`,
    hint: summary.cacheWriteReportedRequests
      ? `${formatExactNumber(summary.cacheWriteReportedRequests)}/${formatExactNumber(summary.requests)} 次上报`
      : '提供商未返回写入明细'
  },
  {
    key: 'reasoning',
    label: '推理 Token',
    value: formatCompactNumber(summary.reasoningTokens),
    exactTitle: `${formatExactNumber(summary.reasoningTokens)} Token`,
    hint: '通常已包含在输出 Token 中'
  }
])

function createEmptySummary() {
  return {
    startAt: '',
    endAt: '',
    groupBy: 'day',
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cacheReportedRequests: 0,
    cacheWriteReportedRequests: 0,
    cacheReportedInputTokens: 0,
    totalTokens: 0,
    byModel: {},
    series: []
  }
}

function startOfDay(value = Date.now()) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addLocalDays(value, amount) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date.getTime()
}

function createLastDaysRange(days) {
  const today = startOfDay()
  return [addLocalDays(today, -(days - 1)), today]
}

function resolveSelectedRange() {
  const today = startOfDay()
  const tomorrow = addLocalDays(today, 1)
  if (rangePreset.value === 'today') return { startAt: today, endAt: tomorrow }
  if (rangePreset.value === '30d') return { startAt: addLocalDays(today, -29), endAt: tomorrow }
  if (rangePreset.value === 'month') {
    const now = new Date()
    return { startAt: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endAt: tomorrow }
  }
  if (rangePreset.value === 'custom' && Array.isArray(customDateRange.value)) {
    const startAt = startOfDay(customDateRange.value[0])
    const endAt = addLocalDays(startOfDay(customDateRange.value[1]), 1)
    if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt) {
      return { startAt, endAt }
    }
  }
  return { startAt: addLocalDays(today, -6), endAt: tomorrow }
}

function formatDate(value, includeYear = false) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: 'numeric',
    day: 'numeric'
  }).format(date)
}

function formatRangeLabel(range) {
  const lastIncludedAt = Math.max(range.startAt, range.endAt - 1)
  const start = new Date(range.startAt)
  const end = new Date(lastIncludedAt)
  const includeYear = start.getFullYear() !== new Date().getFullYear() || start.getFullYear() !== end.getFullYear()
  const startText = formatDate(start, includeYear)
  const endText = formatDate(end, includeYear)
  return startText === endText ? startText : `${startText} — ${endText}`
}

function suggestGroupBy() {
  const duration = rangeDuration.value
  if (duration <= 2 * DAY_MS) return 'hour'
  if (duration > 3 * 366 * DAY_MS) return 'month'
  return 'day'
}

function handlePresetChange(value) {
  if (value === 'custom' && !Array.isArray(customDateRange.value)) {
    customDateRange.value = createLastDaysRange(7)
  }
  groupBy.value = suggestGroupBy()
  void loadSummary()
}

function handleCustomDateRangeChange(value) {
  if (!Array.isArray(value) || value.length !== 2) return
  groupBy.value = suggestGroupBy()
  void loadSummary()
}

function renderNumber(value, unit = 'Token') {
  const compact = formatCompactNumber(value)
  const exact = formatExactNumber(value)
  return h(
    NTooltip,
    { trigger: 'hover' },
    {
      trigger: () => h('span', { class: 'usage-number' }, compact),
      default: () => `${exact} ${unit}`
    }
  )
}

const columns = [
  {
    title: '模型',
    key: 'model',
    minWidth: 190,
    ellipsis: { tooltip: true }
  },
  {
    title: '请求',
    key: 'requests',
    width: 88,
    align: 'right',
    render: (row) => renderNumber(row.requests, '次')
  },
  {
    title: '输入',
    key: 'inputTokens',
    width: 108,
    align: 'right',
    render: (row) => renderNumber(row.inputTokens)
  },
  {
    title: '输出',
    key: 'outputTokens',
    width: 108,
    align: 'right',
    render: (row) => renderNumber(row.outputTokens)
  },
  {
    title: '缓存读取',
    key: 'cachedTokens',
    width: 108,
    align: 'right',
    render: (row) => renderNumber(row.cachedTokens)
  },
  {
    title: '缓存写入',
    key: 'cacheWriteTokens',
    width: 108,
    align: 'right',
    render: (row) => renderNumber(row.cacheWriteTokens)
  },
  {
    title: '推理',
    key: 'reasoningTokens',
    width: 108,
    align: 'right',
    render: (row) => renderNumber(row.reasoningTokens)
  },
  {
    title: '总计',
    key: 'totalTokens',
    width: 116,
    align: 'right',
    sorter: (a, b) => toNonNegativeNumber(a.totalTokens) - toNonNegativeNumber(b.totalTokens),
    render: (row) => renderNumber(row.totalTokens)
  }
]

const rows = computed(() => Object.entries(summary.byModel || {})
  .map(([model, value]) => ({
    key: model,
    model,
    requests: toNonNegativeNumber(value?.requests),
    inputTokens: toNonNegativeNumber(value?.inputTokens),
    outputTokens: toNonNegativeNumber(value?.outputTokens),
    cachedTokens: toNonNegativeNumber(value?.cachedTokens),
    cacheWriteTokens: toNonNegativeNumber(value?.cacheWriteTokens),
    reasoningTokens: toNonNegativeNumber(value?.reasoningTokens),
    totalTokens: toNonNegativeNumber(value?.totalTokens)
  }))
  .sort((a, b) => b.totalTokens - a.totalTokens))
const tablePagination = computed(() => rows.value.length > 10 ? pagination : false)

function formatSeriesLabel(timestamp, granularity = summary.groupBy) {
  const date = new Date(timestamp)
  if (granularity === 'month') return `${date.getFullYear()}/${date.getMonth() + 1}`
  if (granularity === 'hour') {
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function ensureChart() {
  if (chart || !chartElement.value) return chart
  chart = echarts.init(chartElement.value)
  if (typeof ResizeObserver !== 'undefined') {
    chartResizeObserver = new ResizeObserver(() => chart?.resize())
    chartResizeObserver.observe(chartElement.value)
  }
  return chart
}

function renderChart() {
  const instance = ensureChart()
  if (!instance) return

  const meta = currentChartMetric.value
  const points = Array.isArray(summary.series) ? summary.series : []
  const dark = theme.value === 'dark'
  const textColor = dark ? 'rgba(226, 232, 240, 0.72)' : 'rgba(51, 65, 85, 0.72)'
  const splitLineColor = dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.12)'

  instance.setOption({
    animationDuration: 260,
    grid: { left: 14, right: 18, top: 18, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter(params) {
        const item = Array.isArray(params) ? params[0] : params
        const index = Number(item?.dataIndex)
        const point = points[index]
        if (!point) return ''
        const exact = formatExactNumber(point[chartMetric.value])
        return `${formatSeriesLabel(point.timestamp)}<br/>${meta.label}：${exact} ${meta.unit}`
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => formatSeriesLabel(point.timestamp)),
      axisLine: { lineStyle: { color: splitLineColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        hideOverlap: true,
        margin: 12
      }
    },
    yAxis: {
      type: 'value',
      minInterval: chartMetric.value === 'requests' ? 1 : 0,
      axisLabel: {
        color: textColor,
        formatter: (value) => formatCompactNumber(value)
      },
      splitLine: { lineStyle: { color: splitLineColor } }
    },
    series: [{
      name: meta.label,
      type: 'line',
      smooth: points.length <= 64 ? 0.28 : false,
      symbol: 'circle',
      showSymbol: points.length <= 32,
      symbolSize: 6,
      data: points.map((point) => toNonNegativeNumber(point?.[chartMetric.value])),
      lineStyle: { color: meta.color, width: 2.4 },
      itemStyle: { color: meta.color },
      areaStyle: { color: meta.color, opacity: dark ? 0.14 : 0.1 }
    }]
  }, true)
}

async function loadSummary() {
  const reader = window?.aiToolsApi?.usage?.getUsageSummary
  if (typeof reader !== 'function') {
    message.warning('当前插件预加载版本不支持用量统计，请重启插件后重试。')
    return
  }

  const loadId = ++latestLoadId
  const range = selectedRange.value
  loading.value = true
  try {
    const result = await reader({
      startAt: range.startAt,
      endAt: range.endAt,
      groupBy: groupBy.value
    })
    if (loadId !== latestLoadId) return
    Object.assign(summary, createEmptySummary(), result || {})
    pagination.page = 1
    if (result?.groupBy && result.groupBy !== groupBy.value) groupBy.value = result.groupBy
    await nextTick()
    renderChart()
  } catch (error) {
    if (loadId === latestLoadId) message.error(`读取用量统计失败：${error?.message || error}`)
  } finally {
    if (loadId === latestLoadId) loading.value = false
  }
}

watch(theme, () => renderChart())

onMounted(async () => {
  await nextTick()
  ensureChart()
  await loadSummary()
})

onActivated(() => {
  nextTick(() => {
    chart?.resize()
    renderChart()
  })
})

onBeforeUnmount(() => {
  chartResizeObserver?.disconnect()
  chartResizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.settings-page--usage {
  position: relative;
  width: 100%;
  padding-bottom: 8px;
}

.settings-page--usage::before {
  content: '';
  position: absolute;
  inset: 10px 0 auto;
  height: 220px;
  border-radius: 30px;
  background:
    radial-gradient(circle at top left, rgba(52, 168, 139, 0.16), transparent 48%),
    radial-gradient(circle at top right, rgba(83, 117, 191, 0.12), transparent 42%);
  filter: blur(6px);
  pointer-events: none;
}

.settings-page--usage.is-dark::before {
  background:
    radial-gradient(circle at top left, rgba(52, 168, 139, 0.2), transparent 48%),
    radial-gradient(circle at top right, rgba(83, 117, 191, 0.16), transparent 42%);
}

.settings-hero-card,
.usage-metric-card,
.usage-chart-card,
.usage-table-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(76, 116, 128, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.settings-page--usage.is-dark .settings-hero-card,
.settings-page--usage.is-dark .usage-metric-card,
.settings-page--usage.is-dark .usage-chart-card,
.settings-page--usage.is-dark .usage-table-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.settings-hero-card::after,
.usage-metric-card::after,
.usage-chart-card::after,
.usage-table-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 48%);
  pointer-events: none;
}

.settings-page--usage.is-dark .settings-hero-card::after,
.settings-page--usage.is-dark .usage-metric-card::after,
.settings-page--usage.is-dark .usage-chart-card::after,
.settings-page--usage.is-dark .usage-table-card::after {
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 48%);
}

.usage-period {
  display: block;
  margin-top: 2px;
  font-size: 12px;
}

.usage-controls {
  position: relative;
  z-index: 1;
  padding-top: 13px;
  margin-top: 13px;
  border-top: 1px solid rgba(100, 116, 139, 0.12);
}

.usage-metrics {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 12px;
  width: 100%;
  margin-top: 12px;
}

.usage-metric-card {
  min-width: 0;
  animation: usage-card-enter 240ms ease;
}

.usage-metric-card__label,
.usage-metric-card__hint,
.usage-control-label {
  display: block;
  font-size: 12px;
}

.usage-metric-card__value {
  overflow: hidden;
  margin: 7px 0 5px;
  font-size: clamp(22px, 2.3vw, 30px);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-chart-card,
.usage-table-card {
  margin-top: 12px;
}

.usage-chart-shell {
  position: relative;
  min-height: 300px;
}

.usage-chart {
  width: 100%;
  height: 300px;
}

.usage-chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.52);
}

.settings-page--usage.is-dark .usage-chart-empty {
  background: rgba(15, 23, 42, 0.48);
}

.usage-table :deep(.usage-number) {
  font-variant-numeric: tabular-nums;
}

.usage-table :deep(.n-data-table-th),
.usage-table :deep(.n-data-table-td) {
  white-space: nowrap;
}

@keyframes usage-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .usage-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .usage-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .usage-chart,
  .usage-chart-shell {
    height: 260px;
    min-height: 260px;
  }
}
</style>
