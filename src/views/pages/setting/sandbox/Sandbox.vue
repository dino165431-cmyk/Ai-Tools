<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--sandbox', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1100px; margin: 0 auto;"
  >
    <n-card hoverable class="sandbox-hero-card" style="width: 100%;">
      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex vertical :size="4">
          <n-text strong style="font-size: 18px;">沙盒管理</n-text>
          <n-text depth="3" style="font-size: 12px;">
            查看聊天和工具生成的隔离工作区，清理未被会话引用的沙盒，并管理回收站。
          </n-text>
          <n-text depth="3" style="font-size: 12px;">
            被会话引用的沙盒受保护；移入回收站后默认保留 30 天。
          </n-text>
        </n-flex>
        <n-flex :size="10" wrap>
          <n-button secondary @click="handleOpenSandboxRoot">打开目录</n-button>
          <n-button
            secondary
            type="warning"
            :disabled="!orphanedWorkspaces.length || loading || !!busyKey"
            @click="confirmTrashOrphaned"
          >
            清理可回收项
          </n-button>
          <n-button type="primary" :loading="loading" @click="refreshInventory({ force: true })">刷新</n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-alert
      v-if="hasIncompleteReferenceScan"
      type="warning"
      :show-icon="false"
      class="sandbox-scan-alert"
    >
      会话引用扫描未完整结束。为避免误删，本次无法确认引用状态的沙盒已禁止清理。
    </n-alert>

    <div class="sandbox-metrics">
      <n-card v-for="metric in metricCards" :key="metric.key" size="small" class="sandbox-metric-card">
        <n-text depth="3" class="sandbox-metric-card__label">{{ metric.label }}</n-text>
        <div class="sandbox-metric-card__value">{{ metric.value }}</div>
        <n-text depth="3" class="sandbox-metric-card__hint">{{ metric.hint }}</n-text>
      </n-card>
    </div>

    <n-card hoverable class="sandbox-table-card" style="width: 100%;">
      <n-flex justify="space-between" align="center" wrap :size="10" class="sandbox-table-toolbar">
        <n-tabs v-model:value="activeTab" type="segment" size="small" class="sandbox-tabs">
          <n-tab name="active">活跃沙盒（{{ workspaces.length }}）</n-tab>
          <n-tab name="trash">回收站（{{ trashEntries.length }}）</n-tab>
        </n-tabs>
        <n-flex :size="8" wrap>
          <n-input
            v-model:value="keyword"
            clearable
            size="small"
            placeholder="搜索沙盒 ID"
            style="width: 220px;"
          />
          <n-button
            v-if="activeTab === 'trash'"
            size="small"
            type="error"
            secondary
            :disabled="!trashEntries.length || loading || !!busyKey"
            @click="confirmEmptyTrash"
          >
            清空回收站
          </n-button>
        </n-flex>
      </n-flex>

      <n-data-table
        v-if="activeTab === 'active'"
        class="sandbox-table"
        :columns="workspaceColumns"
        :data="filteredWorkspaces"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        :row-key="(row) => row.workspaceId"
        :scroll-x="960"
        size="small"
      />
      <n-data-table
        v-else
        class="sandbox-table"
        :columns="trashColumns"
        :data="filteredTrashEntries"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        :row-key="(row) => row.trashId"
        :scroll-x="960"
        size="small"
      />
    </n-card>
  </n-flex>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NFlex,
  NInput,
  NTab,
  NTabs,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import { getTheme } from '@/utils/configListener'
import {
  listSandboxTrashEntries,
  listSandboxWorkspaces,
  openInFileManager,
  purgeSandboxTrashEntries,
  restoreSandboxTrashEntries,
  trashSandboxWorkspaces
} from '@/utils/fileOperations'

defineOptions({ name: 'SandboxManagement' })

const theme = getTheme()
const dialog = useDialog()
const message = useMessage()
const loading = ref(false)
const busyKey = ref('')
const activeTab = ref('active')
const keyword = ref('')
const workspaces = ref([])
const trashEntries = ref([])

const filteredWorkspaces = computed(() => {
  const query = String(keyword.value || '').trim().toLowerCase()
  if (!query) return workspaces.value
  return workspaces.value.filter((item) =>
    String(item?.workspaceId || '').toLowerCase().includes(query)
  )
})

const filteredTrashEntries = computed(() => {
  const query = String(keyword.value || '').trim().toLowerCase()
  if (!query) return trashEntries.value
  return trashEntries.value.filter((item) =>
    String(item?.workspaceId || '').toLowerCase().includes(query)
  )
})

const orphanedWorkspaces = computed(() =>
  workspaces.value.filter((item) =>
    item?.valid !== false &&
    item?.referenceStatus === 'orphaned'
  )
)

const hasIncompleteReferenceScan = computed(() =>
  workspaces.value.some((item) => item?.referenceScanComplete === false)
)

const metricCards = computed(() => {
  const activeBytes = workspaces.value.reduce((sum, item) => sum + Math.max(0, Number(item?.totalBytes) || 0), 0)
  const trashBytes = trashEntries.value.reduce((sum, item) => sum + Math.max(0, Number(item?.totalBytes) || 0), 0)
  const protectedCount = workspaces.value.filter((item) => item?.referenceStatus === 'referenced').length
  return [
    {
      key: 'active',
      label: '活跃沙盒',
      value: workspaces.value.length,
      hint: `占用 ${formatBytes(activeBytes)}`
    },
    {
      key: 'protected',
      label: '会话引用',
      value: protectedCount,
      hint: '受保护，不允许清理'
    },
    {
      key: 'orphaned',
      label: '可回收',
      value: orphanedWorkspaces.value.length,
      hint: '当前未发现会话引用'
    },
    {
      key: 'trash',
      label: '回收站',
      value: trashEntries.value.length,
      hint: `占用 ${formatBytes(trashBytes)}`
    }
  ]
})

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function formatDate(value) {
  const ms = typeof value === 'number' ? value : Date.parse(String(value || ''))
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const date = new Date(ms)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function renderWorkspaceStatus(row) {
  const statusMap = {
    referenced: { label: '会话引用', type: 'success' },
    orphaned: { label: '可回收', type: 'warning' },
    unknown: { label: '待确认', type: 'default' },
    invalid: { label: 'ID 异常', type: 'error' }
  }
  const status = statusMap[row?.referenceStatus] || statusMap.unknown
  return h(
    NFlex,
    { size: 6, wrap: false },
    {
      default: () => [
        h(NTag, { size: 'small', bordered: false }, { default: () => row?.kind === 'chat' ? '会话' : '通用' }),
        h(NTag, { size: 'small', type: status.type, bordered: false }, { default: () => status.label })
      ]
    }
  )
}

function renderInventory(row) {
  const suffix = row?.scanComplete === false ? '（未完整统计）' : ''
  return `${Number(row?.fileCount || 0)} 个文件 / ${formatBytes(row?.totalBytes)}${suffix}`
}

const workspaceColumns = [
  {
    title: '沙盒 ID',
    key: 'workspaceId',
    minWidth: 250,
    ellipsis: { tooltip: true }
  },
  {
    title: '状态',
    key: 'referenceStatus',
    width: 170,
    render: renderWorkspaceStatus
  },
  {
    title: '文件与空间',
    key: 'inventory',
    width: 190,
    render: renderInventory
  },
  {
    title: '最近修改',
    key: 'modifiedAt',
    width: 155,
    render: (row) => formatDate(row?.modifiedAt)
  },
  {
    title: '操作',
    key: 'actions',
    width: 170,
    fixed: 'right',
    render: (row) => h('div', { class: 'sandbox-actions' }, [
      h(
        NButton,
        {
          size: 'tiny',
          secondary: true,
          disabled: !!busyKey.value,
          onClick: () => handleOpenPath(row?.workspacePath)
        },
        { default: () => '打开' }
      ),
      h(
        NButton,
        {
          size: 'tiny',
          type: 'warning',
          secondary: true,
          disabled: row?.valid === false || row?.referenceStatus !== 'orphaned' || !!busyKey.value,
          loading: busyKey.value === `trash:${row?.workspaceId}`,
          onClick: () => confirmTrashWorkspace(row)
        },
        { default: () => '移入回收站' }
      )
    ])
  }
]

const trashColumns = [
  {
    title: '沙盒 ID',
    key: 'workspaceId',
    minWidth: 250,
    ellipsis: { tooltip: true }
  },
  {
    title: '文件与空间',
    key: 'inventory',
    width: 190,
    render: renderInventory
  },
  {
    title: '删除时间',
    key: 'deletedAt',
    width: 155,
    render: (row) => formatDate(row?.deletedAt)
  },
  {
    title: '自动清除时间',
    key: 'purgeAt',
    width: 155,
    render: (row) => formatDate(row?.purgeAt)
  },
  {
    title: '操作',
    key: 'actions',
    width: 220,
    fixed: 'right',
    render: (row) => h('div', { class: 'sandbox-actions' }, [
      h(
        NButton,
        {
          size: 'tiny',
          secondary: true,
          disabled: !!busyKey.value,
          onClick: () => handleOpenPath(`.ai-tools-sandbox/trash/${row?.trashId}/workspace`)
        },
        { default: () => '打开' }
      ),
      h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          secondary: true,
          disabled: row?.status !== 'trashed' || !!busyKey.value,
          loading: busyKey.value === `restore:${row?.trashId}`,
          onClick: () => handleRestore(row)
        },
        { default: () => '恢复' }
      ),
      h(
        NButton,
        {
          size: 'tiny',
          type: 'error',
          secondary: true,
          disabled: !!busyKey.value,
          loading: busyKey.value === `purge:${row?.trashId}`,
          onClick: () => confirmPurge(row)
        },
        { default: () => '彻底删除' }
      )
    ])
  }
]

async function refreshInventory(options = {}) {
  const force = options?.force === true
  loading.value = true
  try {
    const [active, trash] = await Promise.all([
      listSandboxWorkspaces({ refreshInventory: force }),
      listSandboxTrashEntries({ refreshInventory: force })
    ])
    workspaces.value = Array.isArray(active) ? active : []
    trashEntries.value = Array.isArray(trash) ? trash : []
  } catch (error) {
    message.error(`读取沙盒列表失败：${error?.message || error}`)
  } finally {
    loading.value = false
  }
}

async function handleOpenPath(targetPath) {
  const target = String(targetPath || '').trim()
  if (!target) return
  try {
    await openInFileManager(target)
  } catch (error) {
    message.error(`打开目录失败：${error?.message || error}`)
  }
}

async function handleOpenSandboxRoot() {
  try {
    await openInFileManager('.ai-tools-sandbox')
  } catch {
    try {
      await openInFileManager('')
      message.info('沙盒目录尚未创建，已打开数据目录')
    } catch (error) {
      message.error(`打开目录失败：${error?.message || error}`)
    }
  }
}

async function trashWorkspaceRows(rows, actionKey = 'trash:bulk') {
  const ids = rows.map((item) => String(item?.workspaceId || '').trim()).filter(Boolean)
  if (!ids.length || busyKey.value) return
  busyKey.value = actionKey
  try {
    const results = await trashSandboxWorkspaces(ids, {
      allowNonChatWorkspace: true,
      retentionDays: 30
    })
    const trashedCount = results.filter((item) => item?.status === 'trashed').length
    const retainedCount = results.filter((item) => item?.status === 'retained').length
    const errorCount = results.filter((item) => item?.status === 'error').length
    await refreshInventory()
    if (errorCount) {
      message.warning(`已回收 ${trashedCount} 个，${errorCount} 个处理失败，原数据仍保留`)
    } else if (retainedCount) {
      message.info(`已回收 ${trashedCount} 个，${retainedCount} 个因引用或安全保护而保留`)
    } else {
      message.success(`已将 ${trashedCount} 个沙盒移入回收站`)
    }
  } catch (error) {
    message.error(`清理沙盒失败：${error?.message || error}`)
  } finally {
    busyKey.value = ''
  }
}

function confirmTrashWorkspace(row) {
  dialog.warning({
    title: '移入回收站',
    content: `确定将沙盒“${row?.workspaceId || ''}”移入回收站吗？其中数据将在 30 天后自动清除。`,
    positiveText: '移入回收站',
    negativeText: '取消',
    onPositiveClick: () => trashWorkspaceRows([row], `trash:${row?.workspaceId}`)
  })
}

function confirmTrashOrphaned() {
  dialog.warning({
    title: '清理可回收沙盒',
    content: `将 ${orphanedWorkspaces.value.length} 个当前未发现会话引用的沙盒移入回收站，并保留 30 天。是否继续？`,
    positiveText: '开始清理',
    negativeText: '取消',
    onPositiveClick: () => trashWorkspaceRows(orphanedWorkspaces.value)
  })
}

async function handleRestore(row) {
  const trashId = String(row?.trashId || '').trim()
  if (!trashId || busyKey.value) return
  busyKey.value = `restore:${trashId}`
  try {
    const results = await restoreSandboxTrashEntries([row])
    const result = results?.[0]
    await refreshInventory()
    if (result?.status === 'restored') {
      message.success('沙盒已恢复')
    } else if (result?.status === 'active-exists') {
      message.warning('同名活跃沙盒已存在，未覆盖现有数据')
    } else {
      message.warning(`沙盒未恢复：${result?.error || result?.status || '未知原因'}`)
    }
  } catch (error) {
    message.error(`恢复沙盒失败：${error?.message || error}`)
  } finally {
    busyKey.value = ''
  }
}

async function purgeTrashRow(row) {
  const trashId = String(row?.trashId || '').trim()
  if (!trashId || busyKey.value) return
  busyKey.value = `purge:${trashId}`
  try {
    await purgeSandboxTrashEntries([row], { force: true })
    await refreshInventory()
    message.success('沙盒已彻底删除')
  } catch (error) {
    message.error(`彻底删除失败：${error?.message || error}`)
  } finally {
    busyKey.value = ''
  }
}

function confirmPurge(row) {
  dialog.warning({
    title: '彻底删除沙盒',
    content: `确定彻底删除沙盒“${row?.workspaceId || ''}”吗？此操作不可撤销。`,
    positiveText: '彻底删除',
    negativeText: '取消',
    onPositiveClick: () => purgeTrashRow(row)
  })
}

function confirmEmptyTrash() {
  dialog.warning({
    title: '清空沙盒回收站',
    content: `确定彻底删除回收站中的 ${trashEntries.value.length} 个沙盒吗？此操作不可撤销。`,
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (busyKey.value) return
      busyKey.value = 'purge:all'
      try {
        const purged = await purgeSandboxTrashEntries([], { all: true, force: true })
        await refreshInventory()
        message.success(`已彻底删除 ${purged.length} 个沙盒`)
      } catch (error) {
        message.error(`清空回收站失败：${error?.message || error}`)
      } finally {
        busyKey.value = ''
      }
    }
  })
}

onMounted(refreshInventory)
</script>

<style scoped>
.settings-page--sandbox {
  position: relative;
  width: 100%;
  padding-bottom: 8px;
}

.sandbox-hero-card,
.sandbox-metric-card,
.sandbox-table-card {
  border: 1px solid rgba(76, 116, 128, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(246, 249, 250, 0.94));
  box-shadow: 0 16px 34px rgba(18, 39, 43, 0.07);
}

.settings-page--sandbox.is-dark .sandbox-hero-card,
.settings-page--sandbox.is-dark .sandbox-metric-card,
.settings-page--sandbox.is-dark .sandbox-table-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.sandbox-scan-alert {
  width: 100%;
  margin-top: 12px;
}

.sandbox-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  margin-top: 12px;
}

.sandbox-metric-card {
  min-width: 0;
}

.sandbox-metric-card__label,
.sandbox-metric-card__hint {
  display: block;
  font-size: 12px;
}

.sandbox-metric-card__value {
  margin: 7px 0 5px;
  font-size: 28px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.sandbox-table-card {
  margin-top: 12px;
}

.sandbox-table-toolbar {
  padding-bottom: 12px;
}

.sandbox-tabs {
  width: 330px;
}

.sandbox-table {
  width: 100%;
}

.sandbox-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.sandbox-table :deep(.n-data-table-th),
.sandbox-table :deep(.n-data-table-td) {
  white-space: nowrap;
}

@media (max-width: 760px) {
  .sandbox-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sandbox-tabs {
    width: 100%;
  }
}
</style>
