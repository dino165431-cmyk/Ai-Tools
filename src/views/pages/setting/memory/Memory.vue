<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--memory', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1100px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex vertical :size="4">
          <n-text strong style="font-size: 18px;">记忆管理</n-text>
          <n-text depth="3" style="font-size: 12px;">
            查看、编辑、删除长期记忆与用户画像。这里的内容会参与后续聊天的召回与回答风格适配。
          </n-text>
        </n-flex>
        <n-flex :size="10" wrap>
          <n-button @click="openEditor()">新增记忆</n-button>
          <n-button secondary :loading="cleaning" @click="handleClean">清洗合并</n-button>
          <n-button secondary :loading="rebuilding" @click="handleRebuild">重建向量</n-button>
          <n-button secondary @click="handleOpenFolder">打开目录</n-button>
          <n-button type="primary" :loading="loading" @click="refreshList">刷新</n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-card hoverable style="width: 100%; margin-top: 12px;">
      <n-flex class="memory-filter-row" :wrap="false" :size="12" align="end">
        <n-input
          v-model:value="filters.keyword"
          class="memory-filter-row__keyword"
          placeholder="搜索内容、标签、画像键"
          clearable
          style="flex: 1;"
        />
        <n-select
          v-model:value="filters.lane"
          class="memory-filter-row__select"
          :options="laneOptions"
          clearable
          placeholder="按分组筛选"
          style="width: 156px;"
        />
        <n-select
          v-model:value="filters.kind"
          class="memory-filter-row__select"
          :options="kindOptions"
          clearable
          placeholder="按类型筛选"
          style="width: 156px;"
        />
        <n-select
          v-model:value="filters.status"
          class="memory-filter-row__select"
          :options="statusOptions"
          clearable
          placeholder="按状态筛选"
          style="width: 156px;"
        />
      </n-flex>
    </n-card>

    <n-card hoverable style="width: 100%; margin-top: 12px;">
      <n-data-table
        class="memory-table"
        :columns="columns"
        :data="filteredItems"
        :loading="loading"
        :pagination="{ pageSize: 12 }"
        table-layout="fixed"
        size="small"
      />
    </n-card>

    <n-modal
      v-model:show="editor.show"
      preset="card"
      :title="editor.mode === 'create' ? '新增记忆' : '编辑记忆'"
      style="width: 760px; max-width: 95%;"
    >
      <n-form label-placement="left" label-width="110px">
        <n-form-item label="类型">
          <n-select v-model:value="editor.form.kind" :options="kindOptions.filter((item) => item.value)" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select v-model:value="editor.form.status" :options="statusOptions.filter((item) => item.value)" />
        </n-form-item>
        <n-form-item label="画像键">
          <n-input v-model:value="editor.form.profileKey" placeholder="例如：reply.style / language.preference" />
        </n-form-item>
        <n-form-item label="摘要">
          <n-input v-model:value="editor.form.summary" placeholder="简短摘要，方便快速识别" />
        </n-form-item>
        <n-form-item label="内容">
          <n-input
            v-model:value="editor.form.text"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 14 }"
            placeholder="长期记忆正文"
          />
        </n-form-item>
        <n-form-item label="标签">
          <n-input v-model:value="editor.form.tagsText" placeholder="多个标签用逗号分隔" />
        </n-form-item>
        <n-form-item label="置信度">
          <n-input-number v-model:value="editor.form.confidence" :min="0" :max="1" :step="0.01" style="width: 220px;" />
        </n-form-item>
        <n-form-item label="去重键">
          <n-input v-model:value="editor.form.dedupeKey" placeholder="可选，留空则系统自动推断" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeEditor">取消</n-button>
          <n-button type="primary" :loading="saving" @click="submitEditor">保存</n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { computed, h, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NFlex,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import { getTheme } from '@/utils/configListener'
import {
  deleteMemoryItem,
  getMemoryLane,
  listMemoryItems,
  manageMemoryStore,
  rebuildMemoryEmbeddings,
  updateMemoryItem,
  upsertMemoryItem
} from '@/utils/chatMemory'

const theme = getTheme()
const dialog = useDialog()
const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const cleaning = ref(false)
const rebuilding = ref(false)
const items = ref([])

const filters = reactive({
  keyword: '',
  lane: null,
  kind: null,
  status: null
})

const laneOptions = [
  { label: '全部分组', value: null },
  { label: '用户画像', value: 'profile' },
  { label: '动态记忆', value: 'memory' }
]

const kindOptions = [
  { label: '全部类型', value: null },
  { label: '画像', value: 'profile' },
  { label: '偏好', value: 'preference' },
  { label: '风格', value: 'style' },
  { label: '约束', value: 'constraint' },
  { label: '事实', value: 'fact' },
  { label: '项目', value: 'project' }
]

const statusOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: 'active' },
  { label: '归档', value: 'archived' },
  { label: '删除', value: 'deleted' }
]

const kindLabelMap = new Map(kindOptions.filter((item) => item.value).map((item) => [item.value, item.label]))
const statusLabelMap = new Map(statusOptions.filter((item) => item.value).map((item) => [item.value, item.label]))

const editor = reactive({
  show: false,
  mode: 'edit',
  form: {
    id: '',
    kind: 'fact',
    status: 'active',
    profileKey: '',
    summary: '',
    text: '',
    tagsText: '',
    confidence: 0.8,
    dedupeKey: ''
  }
})

function normalizeTags(text) {
  return [...new Set(String(text || '').split(/[,，]/).map((part) => String(part || '').trim()).filter(Boolean))]
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function toDisplayText(value, fallback = '-') {
  const text = normalizeText(value)
  return text || fallback
}

function fillEditor(item = null) {
  const src = item && typeof item === 'object' ? item : {}
  editor.form.id = String(src.id || '')
  editor.form.kind = String(src.kind || 'fact')
  editor.form.status = String(src.status || 'active')
  editor.form.profileKey = String(src.profileKey || '')
  editor.form.summary = String(src.summary || '')
  editor.form.text = String(src.text || '')
  editor.form.tagsText = Array.isArray(src.tags) ? src.tags.join(', ') : ''
  editor.form.confidence = Number.isFinite(Number(src.confidence)) ? Number(src.confidence) : 0.8
  editor.form.dedupeKey = String(src.dedupeKey || '')
}

function openEditor(item = null) {
  editor.mode = item ? 'edit' : 'create'
  fillEditor(item)
  editor.show = true
}

function closeEditor() {
  editor.show = false
  fillEditor(null)
}

const filteredItems = computed(() => {
  const keyword = normalizeText(filters.keyword).toLowerCase()
  return (items.value || []).filter((item) => {
    const lane = getMemoryLane(item)
    if (filters.lane && lane !== filters.lane) return false
    if (filters.kind && item.kind !== filters.kind) return false
    if (filters.status && item.status !== filters.status) return false
    if (!keyword) return true
    const hay = [
      item.text,
      item.summary,
      item.profileKey,
      ...(item.tags || [])
    ].join(' ').toLowerCase()
    return hay.includes(keyword)
  })
})

const columns = [
  {
    title: '分组',
    key: 'lane',
    width: 78,
    render(row) {
      const lane = getMemoryLane(row)
      return h(
        NTag,
        { bordered: false, type: lane === 'profile' ? 'success' : 'default' },
        { default: () => (lane === 'profile' ? '画像' : '记忆') }
      )
    }
  },
  {
    title: '类型',
    key: 'kind',
    width: 92,
    render(row) {
      const kind = String(row.kind || '')
      const type =
        kind === 'profile'
          ? 'success'
          : kind === 'preference'
            ? 'info'
            : kind === 'style'
              ? 'warning'
              : kind === 'constraint'
                ? 'error'
                : kind === 'project'
                  ? 'info'
                  : 'default'
      return h(
        NTag,
        { bordered: false, type },
        { default: () => kindLabelMap.get(kind) || kind || '-' }
      )
    }
  },
  {
    title: '内容',
    key: 'text',
    ellipsis: { tooltip: true },
    render(row) {
      return toDisplayText(row.summary || row.text)
    }
  },
  {
    title: '画像键',
    key: 'profileKey',
    width: 132,
    ellipsis: { tooltip: true },
    render(row) {
      return toDisplayText(row.profileKey)
    }
  },
  {
    title: '标签',
    key: 'tags',
    width: 122,
    ellipsis: { tooltip: true },
    render(row) {
      const tags = Array.isArray(row.tags) ? row.tags : []
      return toDisplayText(tags.length ? tags.join(' / ') : '')
    }
  },
  {
    title: '置信度',
    key: 'confidence',
    width: 78,
    render(row) {
      return Number(row.confidence || 0).toFixed(2)
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 88,
    render(row) {
      const status = String(row.status || '')
      const type = status === 'active' ? 'success' : status === 'archived' ? 'warning' : status === 'deleted' ? 'error' : 'default'
      return h(
        NTag,
        { bordered: false, type },
        { default: () => statusLabelMap.get(status) || status || '-' }
      )
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 164,
    render(row) {
      return h('div', { class: 'memory-actions' }, [
        h(
          NButton,
          { size: 'small', tertiary: true, onClick: () => openEditor(row) },
          { default: () => '编辑' }
        ),
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            onClick: () => handleArchive(row)
          },
          { default: () => (row.status === 'archived' ? '启用' : '归档') }
        ),
        h(
          NButton,
          {
            size: 'small',
            tertiary: true,
            type: 'error',
            onClick: () => handleDelete(row)
          },
          { default: () => '删除' }
        )
      ])
    }
  }
]

async function refreshList() {
  loading.value = true
  try {
    items.value = await listMemoryItems()
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    loading.value = false
  }
}

async function submitEditor() {
  const text = normalizeText(editor.form.text)
  if (!text) {
    message.warning('记忆内容不能为空')
    return
  }
  saving.value = true
  try {
    const payload = {
      id: editor.form.id || undefined,
      kind: editor.form.kind,
      status: editor.form.status,
      profileKey: editor.form.profileKey,
      summary: editor.form.summary || text.slice(0, 80),
      text,
      tags: normalizeTags(editor.form.tagsText),
      confidence: Number(editor.form.confidence || 0.8),
      dedupeKey: editor.form.dedupeKey
    }
    if (editor.mode === 'create') {
      await upsertMemoryItem(payload)
    } else {
      await updateMemoryItem(editor.form.id, payload)
    }
    closeEditor()
    await refreshList()
    message.success('记忆已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  dialog.warning({
    title: '删除记忆',
    content: '删除后将不再参与记忆召回，是否继续？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteMemoryItem(row.id)
        await refreshList()
        message.success('记忆已删除')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

async function handleArchive(row) {
  try {
    await updateMemoryItem(row.id, { status: row.status === 'archived' ? 'active' : 'archived' })
    await refreshList()
    message.success(row.status === 'archived' ? '记忆已重新启用' : '记忆已归档')
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

async function handleClean() {
  cleaning.value = true
  try {
    const result = await manageMemoryStore('clean')
    await refreshList()
    const mergedCount = Number(result?.stats?.mergedCount || 0)
    message.success(mergedCount > 0 ? `记忆已完成清洗与合并，本次合并 ${mergedCount} 条重复项` : '记忆已完成清洗，未发现可合并的重复项')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    cleaning.value = false
  }
}

async function handleRebuild() {
  rebuilding.value = true
  try {
    await rebuildMemoryEmbeddings()
    await refreshList()
    message.success('向量已重建')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    rebuilding.value = false
  }
}

async function handleOpenFolder() {
  try {
    await manageMemoryStore('open')
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

refreshList()
</script>

<style scoped>
.settings-page--memory {
  width: 100%;
}

.memory-filter-row {
  width: 100%;
  min-width: 0;
}

.memory-filter-row__keyword {
  min-width: 0;
}

.memory-filter-row__select {
  flex: 0 0 auto;
}

.memory-table {
  width: 100%;
}

.memory-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.memory-table :deep(.n-data-table-wrapper) {
  overflow-x: hidden;
}

.memory-table :deep(.n-data-table-th),
.memory-table :deep(.n-data-table-td) {
  white-space: nowrap;
}
</style>
