<template>
  <div :class="['notebook-html-table-output', { 'is-dark': theme === 'dark' }]">
    <template v-if="tableModel">
      <n-data-table
        class="notebook-html-table-output__table"
        :columns="tableColumns"
        :data="tableRows"
        :row-key="getRowKey"
        :row-class-name="createRowClassName"
        :row-props="createRowProps"
        :on-unstable-column-resize="handleColumnResize"
        :scrollbar-props="tableScrollbarProps"
        :scroll-x="tableScrollX"
        :max-height="tableMaxHeight"
        :bordered="false"
        :pagination="false"
        size="small"
        table-layout="fixed"
        single-line
      />

      <div v-if="selectedRow" class="notebook-html-table-output__detail-card">
        <div class="notebook-html-table-output__detail-header">
          <div class="notebook-html-table-output__detail-heading">
            <span class="notebook-html-table-output__detail-title">行 {{ selectedRow.__rowIndex + 1 }}</span>
            <span class="notebook-html-table-output__detail-hint">点击其他行可切换</span>
          </div>

          <div class="notebook-html-table-output__detail-actions">
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  secondary
                  :disabled="!selectedRow"
                  @click="copySelectedRow"
                >
                  <template #icon>
                    <n-icon><CopyOutline /></n-icon>
                  </template>
                  复制整行
                </n-button>
              </template>
              复制当前行内容
            </n-tooltip>
          </div>
        </div>

        <div class="notebook-html-table-output__detail-scroll">
          <dl class="notebook-html-table-output__detail-grid">
            <template v-for="entry in selectedRow.__detailEntries" :key="entry.key">
              <dt>{{ entry.label }}</dt>
              <dd>
                <div class="notebook-html-table-output__detail-value-row">
                  <span class="notebook-html-table-output__detail-value" :title="entry.value || ''">
                    {{ formatDetailValue(entry.value) }}
                  </span>

                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button
                        class="notebook-html-table-output__detail-copy-button"
                        quaternary
                        circle
                        size="tiny"
                        :disabled="!String(entry.value || '').trim()"
                        @click.stop="copyEntryValue(entry)"
                      >
                        <template #icon>
                          <n-icon><CopyOutline /></n-icon>
                        </template>
                      </n-button>
                    </template>
                    复制单元格
                  </n-tooltip>
                </div>
              </dd>
            </template>
          </dl>
        </div>
      </div>
    </template>

    <div
      v-else
      class="notebook-html-table-output__raw markdown-body"
      v-html="html"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NDataTable, NIcon, NTooltip, useMessage } from 'naive-ui'
import { CopyOutline } from '@vicons/ionicons5'
import { copyTextToClipboard } from '@/utils/clipboard'
import { parseNotebookHtmlTable } from '@/utils/notebookHtmlTable'

const props = defineProps({
  html: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const message = useMessage()
const tableMaxHeight = 300
const tableScrollbarProps = {
  trigger: 'none',
  containerClass: 'notebook-html-table-output__table-scrollbar-container'
}
const selectedRowIndex = ref(-1)
const columnWidths = ref([])

const tableModel = computed(() => parseNotebookHtmlTable(props.html))
const tableRows = computed(() => tableModel.value?.rows || [])
const selectedRow = computed(() => {
  if (selectedRowIndex.value < 0) return null
  return tableRows.value[selectedRowIndex.value] || null
})
const tableScrollX = computed(() => {
  const widthSum = columnWidths.value.reduce((sum, width) => sum + normalizeWidth(width), 0)
  return Math.max(widthSum || tableModel.value?.scrollX || 0, 640)
})

function normalizeWidth(width, fallback = 120) {
  const value = Number(width)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(96, Math.min(320, Math.round(value)))
}

function resetColumnWidths(model) {
  if (!model?.columns?.length) {
    columnWidths.value = []
    selectedRowIndex.value = -1
    return
  }

  columnWidths.value = model.columns.map((column) => normalizeWidth(column.width))
  selectedRowIndex.value = -1
}

watch(tableModel, (model) => {
  resetColumnWidths(model)
}, { immediate: true })

const tableColumns = computed(() => {
  const model = tableModel.value
  if (!model) return []

  return model.columns.map((column, index) => {
    const width = normalizeWidth(columnWidths.value[index] ?? column.width)
    return {
      title: column.label,
      key: column.key,
      width,
      minWidth: width,
      resizable: true,
      ellipsis: true,
      render: (rowData) => rowData?.[column.key] ?? '',
      cellProps: (rowData) => ({
        title: String(rowData?.[column.key] ?? '')
      })
    }
  })
})

function getRowKey(row) {
  return row?.__rowKey || ''
}

function createRowClassName(row, rowIndex) {
  return rowIndex === selectedRowIndex.value ? 'is-selected' : ''
}

function createRowProps(row, rowIndex) {
  return {
    style: {
      cursor: 'pointer'
    },
    onClick: () => {
      selectedRowIndex.value = selectedRowIndex.value === rowIndex ? -1 : rowIndex
    }
  }
}

function handleColumnResize(resizedWidth, limitedWidth, column) {
  const model = tableModel.value
  if (!model?.columns?.length || !column?.key) return

  const columnIndex = model.columns.findIndex((item) => item.key === column.key)
  if (columnIndex < 0) return

  const nextWidth = normalizeWidth(limitedWidth || resizedWidth || columnWidths.value[columnIndex] || column.width)
  const nextWidths = columnWidths.value.slice()
  nextWidths[columnIndex] = nextWidth
  columnWidths.value = nextWidths
}

function formatDetailValue(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function formatSelectedRowCopyText(row) {
  if (!row?.__detailEntries?.length) return ''
  return row.__detailEntries
    .map((entry) => `${String(entry.label || '').trim()}: ${String(entry.value ?? '').trim()}`)
    .join('\n')
    .trim()
}

async function copyValue(text, successMessage) {
  const value = String(text ?? '')
  if (!value.trim()) {
    message.warning('没有可复制的内容')
    return false
  }

  return copyTextToClipboard(value, {
    onUnsupported: () => message.warning('当前环境不支持剪贴板复制'),
    onSuccess: () => message.success(successMessage),
    onError: () => message.error('复制失败')
  })
}

function copySelectedRow() {
  if (!selectedRow.value) return
  return copyValue(formatSelectedRowCopyText(selectedRow.value), '已复制整行')
}

function copyEntryValue(entry) {
  return copyValue(entry?.value, '已复制单元格')
}
</script>

<style scoped>
.notebook-html-table-output {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notebook-html-table-output__table {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(248, 250, 252, 0.84);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.notebook-html-table-output__table :deep(.n-data-table-th) {
  padding-top: 7px;
  padding-bottom: 7px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(51, 65, 85, 0.96);
  background: rgba(248, 250, 252, 0.98);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  white-space: nowrap;
}

.notebook-html-table-output__table :deep(.n-data-table-td) {
  padding-top: 6px;
  padding-bottom: 6px;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(15, 23, 42, 0.92);
  white-space: nowrap;
}

.notebook-html-table-output__table :deep(.n-data-table-tr:hover > td) {
  background: rgba(241, 245, 249, 0.96) !important;
}

.notebook-html-table-output__table :deep(.n-data-table-tr.is-selected > td) {
  background: rgba(224, 231, 255, 0.86) !important;
}

.notebook-html-table-output__table :deep(.n-data-table-tr.is-selected > td:first-child) {
  box-shadow: inset 3px 0 0 rgba(37, 99, 235, 0.72);
}

.notebook-html-table-output__detail-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.notebook-html-table-output__detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notebook-html-table-output__detail-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.notebook-html-table-output__detail-title {
  font-size: 12px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.92);
}

.notebook-html-table-output__detail-hint {
  font-size: 11px;
  color: rgba(100, 116, 139, 0.92);
}

.notebook-html-table-output__detail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.notebook-html-table-output__detail-scroll {
  max-height: clamp(96px, 16vh, 180px);
  overflow-y: scroll;
  overflow-x: auto;
  padding-right: 2px;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.notebook-html-table-output__detail-scroll::-webkit-scrollbar,
.notebook-html-table-output__raw::-webkit-scrollbar {
  width: var(--app-scrollbar-size);
  height: var(--app-scrollbar-size);
}

.notebook-html-table-output__detail-scroll::-webkit-scrollbar-track,
.notebook-html-table-output__raw::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track);
}

.notebook-html-table-output__detail-scroll::-webkit-scrollbar-thumb,
.notebook-html-table-output__raw::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--app-scrollbar-thumb);
  background-clip: padding-box;
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
}

.notebook-html-table-output__detail-scroll::-webkit-scrollbar-thumb:hover,
.notebook-html-table-output__raw::-webkit-scrollbar-thumb:hover {
  background: var(--app-scrollbar-thumb-hover);
  background-clip: padding-box;
}

.notebook-html-table-output__detail-grid {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
}

.notebook-html-table-output__detail-grid dt {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: rgba(71, 85, 105, 0.96);
  word-break: break-word;
}

.notebook-html-table-output__detail-grid dd {
  margin: 0;
  min-width: 0;
}

.notebook-html-table-output__detail-value-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.notebook-html-table-output__detail-value {
  flex: 1;
  order: 2;
  min-width: 0;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(15, 23, 42, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
}

.notebook-html-table-output__detail-copy-button {
  order: 1;
  margin-top: -1px;
  color: rgba(100, 116, 139, 0.9);
}

.notebook-html-table-output__detail-copy-button:hover {
  color: rgba(37, 99, 235, 0.95);
}

.notebook-html-table-output__raw {
  max-height: clamp(150px, 22vh, 220px);
  overflow-y: scroll;
  overflow-x: auto;
  padding: 10px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  color: rgba(15, 23, 42, 0.92);
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.notebook-html-table-output__raw :deep(table) {
  width: 100%;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  table-layout: fixed;
}

.notebook-html-table-output__raw :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(51, 65, 85, 0.96);
  background: rgba(248, 250, 252, 0.98);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  white-space: nowrap;
}

.notebook-html-table-output__raw :deep(th),
.notebook-html-table-output__raw :deep(td) {
  padding: 7px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notebook-html-table-output__raw :deep(tbody tr:nth-child(even)) {
  background: rgba(248, 250, 252, 0.72);
}

.notebook-html-table-output__raw :deep(tbody tr:hover) {
  background: rgba(241, 245, 249, 0.96);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__table {
  border-color: rgba(71, 85, 105, 0.48);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.24);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__table :deep(.n-data-table-th) {
  color: rgba(226, 232, 240, 0.94);
  background: rgba(30, 41, 59, 0.96);
  border-bottom-color: rgba(71, 85, 105, 0.56);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__table :deep(.n-data-table-td) {
  color: rgba(226, 232, 240, 0.94);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__table :deep(.n-data-table-tr:hover > td) {
  background: rgba(30, 41, 59, 0.96) !important;
}

.notebook-html-table-output.is-dark .notebook-html-table-output__table :deep(.n-data-table-tr.is-selected > td) {
  background: rgba(30, 41, 59, 0.98) !important;
}

.notebook-html-table-output.is-dark .notebook-html-table-output__detail-card {
  border-color: rgba(71, 85, 105, 0.56);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.06);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__detail-title {
  color: rgba(226, 232, 240, 0.96);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__detail-hint {
  color: rgba(148, 163, 184, 0.92);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__detail-grid dt {
  color: rgba(186, 230, 253, 0.92);
}

.notebook-html-table-output.is-dark .notebook-html-table-output__detail-value {
  color: rgba(226, 232, 240, 0.96);
}
</style>

<style>
.notebook-html-table-output__table .n-data-table-base-table-body > .n-scrollbar-rail,
.notebook-html-table-output__table .n-data-table-base-table-body > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar {
  display: none !important;
}

.notebook-html-table-output__table-scrollbar-container {
  scrollbar-gutter: stable;
  scrollbar-width: auto !important;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track) !important;
}

.notebook-html-table-output__table-scrollbar-container::-webkit-scrollbar {
  width: var(--app-scrollbar-size) !important;
  height: var(--app-scrollbar-size) !important;
  display: block !important;
  background: var(--app-scrollbar-track) !important;
}

.notebook-html-table-output__table-scrollbar-container::-webkit-scrollbar-track {
  display: block !important;
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

.notebook-html-table-output__table-scrollbar-container::-webkit-scrollbar-track-piece {
  display: block !important;
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

.notebook-html-table-output__table-scrollbar-container::-webkit-scrollbar-thumb {
  display: block !important;
  background: var(--app-scrollbar-thumb) !important;
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: var(--app-scrollbar-radius);
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
}

.notebook-html-table-output__table-scrollbar-container::-webkit-scrollbar-thumb:hover {
  background: var(--app-scrollbar-thumb-hover) !important;
  background-clip: padding-box;
}
</style>
