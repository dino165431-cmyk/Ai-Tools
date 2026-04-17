<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--provider', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center">
        <n-flex align="center">
          <n-icon :component="AppsListDetail20Regular" size="20" :depth="1" />
          <span style="font-weight: 500;">服务商管理</span>
        </n-flex>
        <n-flex align="center">
          <n-button tertiary size="small" @click="openAddModal">
            新增服务商
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-flex wrap :size="16" justify="flex-start" class="settings-grid" style="width: 100%; margin-top: 8px;">
      <n-card
        v-for="provider in providers"
        :key="provider._id"
        hoverable
        size="small"
        class="settings-grid-card"
        :style="cardStyle"
        @click="openEditModal(provider)"
      >
        <n-flex vertical>
          <n-flex justify="space-between" align="center">
            <n-flex align="center" :size="6" wrap>
              <n-text strong depth="1" style="font-size: 16px;">
                {{ provider.name || '未命名' }}
              </n-text>
              <n-tag v-if="provider.builtin" size="small" type="info" bordered>内置</n-tag>
            </n-flex>

            <n-button
              v-if="!provider.builtin"
              text
              size="small"
              title="删除服务商"
              @click.stop="confirmDelete(provider)"
              style="margin-left: auto;"
            >
              <n-icon :component="Trash" size="18" />
            </n-button>
          </n-flex>

          <n-flex align="center" wrap :size="6" style="margin-top: 8px;">
            <n-tag size="small" bordered>
              模型 {{ (provider.selectModels || []).length }}
            </n-tag>
          </n-flex>

          <n-text depth="3" style="margin-top: 8px; font-size: 12px; word-break: break-all;">
            {{ getProviderSummary(provider) }}
          </n-text>
        </n-flex>
      </n-card>
    </n-flex>

    <n-modal
      v-model:show="showModal"
      :mask-closable="false"
      preset="card"
      :title="modalTitle"
      style="width: 720px; max-width: 95%;"
    >
      <n-flex v-if="isBuiltinEdit" vertical :size="12">
        <n-text depth="2">
          这是 uTools 官方 AI 的内置服务商。模型列表来自 uTools 统一的 AI 模型设置页，不在本插件里单独保存 `baseurl/apikey`。
        </n-text>

        <n-flex align="center" wrap :size="8">
          <n-button size="small" secondary @click="openBuiltinSettings">
            打开 uTools AI 模型设置
          </n-button>
          <n-button size="small" @click="refreshBuiltinModels(true)" :loading="loadingModels">
            刷新模型列表
          </n-button>
          <n-text depth="3" style="font-size: 12px;">
            当前已同步 {{ builtinModelRows.length }} 个模型
          </n-text>
        </n-flex>

        <n-text v-if="builtinModelsError" type="warning" style="font-size: 12px;">
          {{ builtinModelsError }}
        </n-text>
        <n-input
          v-model:value="builtinModelFilterKeyword"
          clearable
          placeholder="筛选模型，支持按 ID、名称、描述搜索"
        />

        <n-data-table
          :columns="builtinModelColumns"
          :data="filteredBuiltinModelRows"
          :loading="loadingModels"
          :max-height="360"
          :pagination="false"
          :bordered="false"
          size="small"
        />
      </n-flex>

      <n-form
        v-else
        ref="formRef"
        :model="formData"
        label-placement="left"
        label-align="left"
        require-mark-placement="left"
        label-width="100px"
        :show-feedback="true"
        style="margin-top: 8px; padding: 0 10px;"
      >
        <n-form-item label="名称" path="name" required>
          <n-input v-model:value="formData.name" placeholder="请输入服务商名称（必填）" />
        </n-form-item>
        <n-form-item label="接口地址" path="baseurl">
          <n-input v-model:value="formData.baseurl" placeholder="例如：https://api.openai.com/v1" />
        </n-form-item>
        <n-form-item label="API 密钥" path="apikey">
          <n-input
            v-model:value="formData.apikey"
            type="password"
            show-password-toggle
            placeholder="请输入 API 密钥"
          />
        </n-form-item>
        <n-form-item label="模型" label-placement="top" :show-feedback="false">
          <n-flex vertical style="width: 100%;">
            <n-flex justify="space-between" align="center">
              <n-text depth="2">选择要启用的模型</n-text>
              <n-button
                size="tiny"
                secondary
                title="从当前服务商接口刷新模型列表"
                :loading="loadingModels"
                @click="refreshModels"
              >
                <template #icon>
                  <n-icon :component="ArrowClockwise20Regular" />
                </template>
                刷新
              </n-button>
            </n-flex>
            <n-input
              v-model:value="modelFilterKeyword"
              clearable
              placeholder="筛选模型，支持按 ID、归属方搜索"
              style="margin-top: 8px;"
            />
            <n-data-table
              :columns="modelColumns"
              :data="filteredAvailableModels"
              :loading="loadingModels"
              :max-height="300"
              :pagination="false"
              :bordered="false"
              size="small"
              style="margin-top: 8px;"
            />
          </n-flex>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-flex v-if="isBuiltinEdit" :size="8">
            <n-button size="small" secondary @click="openBuiltinSettings">
              打开设置
            </n-button>
            <n-button size="small" @click="refreshBuiltinModels(true)" :loading="loadingModels">
              刷新模型
            </n-button>
          </n-flex>
          <span v-else />

          <n-flex justify="flex-end" :size="12">
            <n-button @click="showModal = false">{{ isBuiltinEdit ? '关闭' : '取消' }}</n-button>
            <n-button v-if="!isBuiltinEdit" type="primary" @click="handleSave" :loading="saving">
              保存
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { h, ref, reactive, watch, computed } from 'vue'
import {
  NCard,
  NFlex,
  NIcon,
  NButton,
  NInput,
  NText,
  NTag,
  NModal,
  NForm,
  NFormItem,
  NDataTable,
  useDialog,
  useMessage
} from 'naive-ui'
import { Trash, Plus, Minus } from '@vicons/fa'
import {
  AppsListDetail20Regular,
  ArrowClockwise20Regular
} from '@vicons/fluent'

import {
  canManageUtoolsAiModels,
  getUtoolsAiModelsState,
  isUtoolsBuiltinProvider,
  openUtoolsAiModelsSetting,
  refreshUtoolsAiModels
} from '@/utils/utoolsAiProvider'
import {
  getProviders,
  addProvider,
  updateProvider,
  deleteProvider,
  getTheme
} from '@/utils/configListener'

const cardStyle = computed(() => ({
  width: 'calc((100% - 32px) / 3)',
  marginBottom: '0',
  cursor: 'pointer'
}))
const theme = getTheme()

const providersRef = getProviders()
const providers = computed(() => providersRef.value || [])

const dialog = useDialog()
const message = useMessage()
const formRef = ref(null)

const showModal = ref(false)
const modalMode = ref('add')
const currentEditId = ref(null)
const currentEditBuiltin = ref(false)

const { models: builtinModels, loadError: builtinModelsError } = getUtoolsAiModelsState()

const isBuiltinEdit = computed(() => modalMode.value === 'edit' && currentEditBuiltin.value)
const modalTitle = computed(() => {
  if (isBuiltinEdit.value) return 'uTools 官方 AI'
  return modalMode.value === 'add' ? '新增服务商' : '编辑服务商'
})

const formData = reactive({
  name: '',
  baseurl: '',
  apikey: '',
  selectModels: []
})

const availableModels = ref([])
const modelFilterKeyword = ref('')
const builtinModelFilterKeyword = ref('')
const loadingModels = ref(false)

const modelColumns = [
  {
    title: '模型 ID',
    key: 'id',
    ellipsis: { tooltip: true }
  },
  {
    title: '所属',
    key: 'owned_by',
    ellipsis: { tooltip: true },
    render(row) {
      return row.owned_by || '-'
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 80,
    align: 'center',
    render(row) {
      const isSelected = formData.selectModels.includes(row.id)
      return h(
        NButton,
        {
          text: true,
          size: 'small',
          onClick: () => toggleModel(row.id, isSelected)
        },
        {
          default: () => h(NIcon, null, { default: () => h(isSelected ? Minus : Plus) })
        }
      )
    }
  }
]

const builtinModelColumns = [
  {
    title: '模型 ID',
    key: 'id',
    ellipsis: { tooltip: true }
  },
  {
    title: '显示名',
    key: 'label',
    ellipsis: { tooltip: true }
  },
  {
    title: '说明',
    key: 'description',
    ellipsis: { tooltip: true },
    render(row) {
      return row.description || '-'
    }
  },
  {
    title: '成本',
    key: 'cost',
    width: 90,
    render(row) {
      return Number.isFinite(Number(row.cost)) ? String(row.cost) : '-'
    }
  }
]

const builtinModelRows = computed(() => (builtinModels.value || []).map((item) => ({ ...item })))

function normalizeModelFilterKeyword(value) {
  return String(value || '').trim().toLowerCase()
}

function matchesModelFilter(row, keyword, fields = []) {
  if (!keyword) return true
  return fields.some((field) => String(row?.[field] || '').toLowerCase().includes(keyword))
}

const filteredAvailableModels = computed(() => {
  const keyword = normalizeModelFilterKeyword(modelFilterKeyword.value)
  return (availableModels.value || []).filter((row) =>
    matchesModelFilter(row, keyword, ['id', 'name', 'model', 'owned_by'])
  )
})

const filteredBuiltinModelRows = computed(() => {
  const keyword = normalizeModelFilterKeyword(builtinModelFilterKeyword.value)
  return builtinModelRows.value.filter((row) =>
    matchesModelFilter(row, keyword, ['id', 'label', 'description'])
  )
})

function getProviderSummary(provider) {
  if (isUtoolsBuiltinProvider(provider)) {
    return 'uTools 官方 AI，模型由 uTools 统一设置与管理'
  }
  return provider?.baseurl || '未配置接口地址'
}

function toggleModel(modelId, isSelected) {
  if (isSelected) {
    formData.selectModels = formData.selectModels.filter((id) => id !== modelId)
  } else {
    formData.selectModels.push(modelId)
  }
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  const noQuery = raw.split('#')[0].split('?')[0]
  let base = noQuery.replace(/\/+$/, '')

  base = base
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/models$/i, '')

  return base.replace(/\/+$/, '')
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 12000
const PROVIDER_MODELS_FETCH_RETRIES = 1

function stripUtf8Bom(text) {
  return String(text || '').replace(/^\uFEFF/, '')
}

function shouldRetryProviderModelsRequest(statusCode, attempt) {
  return attempt < PROVIDER_MODELS_FETCH_RETRIES && (statusCode === 429 || statusCode >= 500)
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_MODELS_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timerHost = typeof window !== 'undefined' ? window : globalThis
  const timer = timerHost.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs}ms）`)
    }
    throw err
  } finally {
    timerHost.clearTimeout(timer)
  }
}

async function requestProviderModelsEndpoint(url, apiKey) {
  let lastError = null
  for (let attempt = 0; attempt <= PROVIDER_MODELS_FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
      if (shouldRetryProviderModelsRequest(response.status, attempt)) continue
      return response
    } catch (err) {
      lastError = err
      if (attempt >= PROVIDER_MODELS_FETCH_RETRIES) throw err
    }
  }
  if (lastError) throw lastError
  throw new Error('请求失败：未获取到响应')
}

function extractModelsFromResponseData(data) {
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.models)) return data.models
  if (Array.isArray(data?.result)) return data.result
  if (Array.isArray(data)) return data
  return []
}

async function refreshBuiltinModels(showSuccess = false) {
  if (!canManageUtoolsAiModels()) {
    message.warning('当前环境不支持读取 uTools 官方 AI 模型列表')
    return
  }

  loadingModels.value = true
  try {
    const list = await refreshUtoolsAiModels({ force: true })
    if (showSuccess) {
      message.success(`已同步 ${Array.isArray(list) ? list.length : 0} 个 uTools AI 模型`)
    }
  } catch (err) {
    message.error('同步 uTools AI 模型失败：' + (err?.message || String(err)))
  } finally {
    loadingModels.value = false
  }
}

function openBuiltinSettings() {
  if (openUtoolsAiModelsSetting()) return
  message.warning('当前环境不支持打开 uTools AI 模型设置页')
}

async function refreshModels() {
  if (!formData.baseurl || !formData.apikey) {
    message.warning('请先填写接口地址和 API 密钥，再拉取模型列表')
    return
  }

  loadingModels.value = true
  try {
    const base = normalizeBaseUrl(formData.baseurl)
    if (!base) throw new Error('接口地址为空')

    const candidates = [`${base}/models`]
    if (!/\/v1$/i.test(base)) candidates.push(`${base}/v1/models`)

    let loaded = false
    let lastError = null

    for (const [index, url] of candidates.entries()) {
      const isLastCandidate = index === candidates.length - 1
      try {
        const response = await requestProviderModelsEndpoint(url, formData.apikey)
        if (!response.ok) {
          const text = stripUtf8Bom(await response.text()).trim()
          if (response.status === 404 && !isLastCandidate) continue
          throw new Error(`HTTP ${response.status}: ${text || response.statusText}\nURL: ${url}`)
        }

        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
        const rawText = stripUtf8Bom(await response.text())
        const trimmed = rawText.trim()
        const data = safeJsonParse(trimmed, null)
        if (!data) {
          if (!isLastCandidate) continue
          const snippet = trimmed.slice(0, 240)
          throw new Error(
            `Model list API returned non-JSON.\nURL: ${url}\nContent-Type: ${contentType || 'unknown'}\nResponse: ${snippet || '[empty]'}`
          )
        }

        const models = extractModelsFromResponseData(data)
        availableModels.value = models
          .map((item) => {
            const id = String(item?.id || item?.name || item?.model || '').trim()
            if (!id) return null
            return { id, ...item }
          })
          .filter(Boolean)

        if (!availableModels.value.length) {
          const sampleKeys = data && typeof data === 'object' && !Array.isArray(data)
            ? Object.keys(data).slice(0, 8).join(', ')
            : ''
          message.warning(`模型列表为空。URL: ${url}${sampleKeys ? `；响应字段: ${sampleKeys}` : ''}`)
        }

        loaded = true
        break
      } catch (err) {
        lastError = err
        if (!isLastCandidate) continue
      }
    }

    if (!loaded) throw lastError || new Error('模型列表加载失败')
  } catch (err) {
    message.error('模型列表加载失败：' + (err?.message || String(err)))
    availableModels.value = []
  } finally {
    loadingModels.value = false
  }
}

function resetCustomForm() {
  formData.name = ''
  formData.baseurl = ''
  formData.apikey = ''
  formData.selectModels = []
  availableModels.value = []
  modelFilterKeyword.value = ''
}

function openAddModal() {
  modalMode.value = 'add'
  currentEditId.value = null
  currentEditBuiltin.value = false
  builtinModelFilterKeyword.value = ''
  resetCustomForm()
  formRef.value?.restoreValidation()
  showModal.value = true
}

async function openEditModal(provider) {
  modalMode.value = 'edit'
  currentEditId.value = provider._id
  currentEditBuiltin.value = !!provider.builtin || isUtoolsBuiltinProvider(provider)
  builtinModelFilterKeyword.value = ''
  modelFilterKeyword.value = ''

  if (isBuiltinEdit.value) {
    showModal.value = true
    await refreshBuiltinModels()
    return
  }

  formData.name = provider.name || ''
  formData.baseurl = provider.baseurl || ''
  formData.apikey = provider.apikey || ''
  formData.selectModels = provider.selectModels ? [...provider.selectModels] : []
  if (formData.baseurl && formData.apikey) {
    refreshModels()
  } else {
    availableModels.value = []
  }
  formRef.value?.restoreValidation()
  showModal.value = true
}

const saving = ref(false)

function handleSave() {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      message.warning('请填写必填项')
      return
    }

    saving.value = true
    try {
      const providerData = {
        name: String(formData.name || '').trim(),
        baseurl: formData.baseurl,
        apikey: formData.apikey,
        selectModels: formData.selectModels
      }

      const safeData = JSON.parse(JSON.stringify(providerData))

      if (modalMode.value === 'add') {
        const newProvider = { _id: crypto.randomUUID(), ...safeData }
        await addProvider(newProvider)
        message.success('服务商新增成功')
      } else {
        await updateProvider(currentEditId.value, safeData)
        message.success('服务商更新成功')
      }

      showModal.value = false
    } catch (err) {
      message.error('操作失败：' + (err?.message || String(err)))
    } finally {
      saving.value = false
    }
  })
}

function confirmDelete(provider) {
  if (provider?.builtin || isUtoolsBuiltinProvider(provider)) {
    message.warning('内置 Provider 不可删除')
    return
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除服务商“${provider.name || '未命名'}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteProvider(provider._id)
        message.success('服务商已删除')
      } catch (err) {
        message.error('删除失败：' + (err?.message || String(err)))
      }
    }
  })
}

watch(showModal, (val) => {
  if (val || isBuiltinEdit.value) return
  availableModels.value = []
})
</script>

<style scoped>
.settings-page {
  position: relative;
  padding-bottom: 8px;
}

.settings-page::before {
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

.settings-page.is-dark::before {
  background:
    radial-gradient(circle at top left, rgba(52, 168, 139, 0.2), transparent 48%),
    radial-gradient(circle at top right, rgba(83, 117, 191, 0.16), transparent 42%);
}

.settings-hero-card,
.settings-grid-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(76, 116, 128, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-grid-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.settings-hero-card::after,
.settings-grid-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 48%);
  pointer-events: none;
}

.settings-page.is-dark .settings-hero-card::after,
.settings-page.is-dark .settings-grid-card::after {
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 48%);
}

.settings-grid-card {
  animation: settings-card-enter 240ms ease;
}

.n-card {
  transition: all 0.2s;
}

.n-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(15, 34, 38, 0.12);
}

.settings-page.is-dark .n-card:hover {
  box-shadow: 0 18px 34px rgba(2, 6, 23, 0.34);
}

@keyframes settings-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
