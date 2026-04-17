<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--agent', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
        <n-flex justify="space-between" align="center">
          <n-flex align="center">
            <n-icon :component="Magento" size="20" :depth="1" />
            <span style="font-weight: 500;">智能体管理</span>
          </n-flex>
          <n-flex align="center">
          <n-button tertiary size="small" @click="openAddModal">
            新增智能体
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-flex wrap :size="16" justify="flex-start" style="width: 100%; margin-top: 8px;">
      <n-card
        v-for="agent in agents"
        :key="agent._id"
        hoverable
        size="small"
        :style="cardStyle"
        class="settings-grid-card"
        @click="openEditModal(agent)"
      >
        <n-flex vertical>
          <n-flex justify="space-between" align="center">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ agent.name || '未命名' }}
            </n-text>
            <n-button
              v-if="!agent.builtin"
              text
              size="small"
              title="删除智能体"
              @click.stop="confirmDelete(agent)"
              style="margin-left: auto;"
            >
              <n-icon :component="Trash" size="18" />
            </n-button>
          </n-flex>

          <n-flex align="center" wrap :size="4" style="margin-top: 4px;">
            <n-tag v-if="agent.builtin" size="small" type="info" bordered>内置</n-tag>
            <n-tag v-if="agent.provider" size="small" type="info" bordered>
              {{ getProviderName(agent.provider) }}
            </n-tag>
            <n-tag v-if="agent.model" size="small" bordered>
              {{ agent.model }}
            </n-tag>
            <n-tag
              v-if="agent.skills && agent.skills.length"
              size="small"
              type="success"
              bordered
            >
              {{ agent.skills.length }} 个技能
            </n-tag>
            <n-tag
              v-if="agent.mcp && agent.mcp.length"
              size="small"
              type="warning"
              bordered
            >
              {{ agent.mcp.length }} 个 MCP
            </n-tag>
            <n-tag
              v-if="countConfiguredAgentModelParams(agent.modelParams)"
              size="small"
              type="primary"
              bordered
            >
              高级参数：{{ countConfiguredAgentModelParams(agent.modelParams) }}
            </n-tag>
          </n-flex>

          <n-ellipsis v-if="agent.prompt" class="settings-card__meta" :line-clamp="2">
            提示词：{{ getPromptName(agent.prompt) }}
          </n-ellipsis>
          <div v-else class="settings-card__meta settings-card__meta--subtle">未选择提示词</div>
        </n-flex>
      </n-card>
    </n-flex>

    <n-modal
      v-model:show="showModal"
      :mask-closable="false"
      preset="card"
      :title="modalMode === 'add' ? '新增智能体' : '编辑智能体'"
      style="width: 760px; max-width: 95%;"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-width="100px"
        require-mark-placement="right"
      >
        <n-form-item label="名称" path="name">
          <n-input v-model:value="formData.name" :disabled="isBuiltinEdit" placeholder="请输入名称（必填）" />
        </n-form-item>

        <n-form-item label="服务商" path="provider">
          <n-select
            v-model:value="formData.provider"
            :options="providerOptions"
            placeholder="请选择服务商"
            clearable
            filterable
            value-field="_id"
            label-field="name"
          />
        </n-form-item>

        <n-form-item label="默认模型" path="model">
          <n-select
            v-model:value="formData.model"
            :options="modelOptions"
            placeholder="请选择默认模型（可选）"
            clearable
            filterable
            :disabled="!formData.provider || modelOptions.length === 0"
          />
        </n-form-item>

        <n-form-item label="技能" path="skills">
          <n-select
            v-model:value="formData.skills"
            :disabled="isBuiltinEdit"
            multiple
            :options="skillOptions"
            placeholder="请选择技能（可选）"
            clearable
            filterable
            value-field="_id"
            label-field="name"
          />
          <n-text v-if="!isBuiltinEdit" depth="3" style="font-size: 12px; margin-top: 6px;">
            智能体技能默认按需加载。模型先看到的是技能名称、描述和目录文件索引；确实需要完整规则时才会调用 `use_skill` / `use_skills` 加载正文，目录技能还可以继续用 `read_skill_file` 读取 `references`、`scripts` 或文本型 `assets`，并用 `run_skill_script` 执行 `scripts/` 下的脚本。
          </n-text>
        </n-form-item>

        <n-form-item label="MCP 服务器" path="mcp">
          <n-select
            v-model:value="formData.mcp"
            multiple
            :options="mcpOptions"
            placeholder="请选择 MCP 服务器（可选）"
            clearable
            filterable
            value-field="_id"
            label-field="name"
          />
          <n-text v-if="isBuiltinEdit" depth="3" style="font-size: 12px; margin-top: 6px;">
            提示：内置智能体默认通过内置技能引导任务拆解与子智能体编排，技能中配置的 MCP 会在运行时自动挂载，这里不再默认追加编排 MCP。
          </n-text>
        </n-form-item>

        <n-form-item label="提示词" path="prompt">
          <n-select
            v-model:value="formData.prompt"
            :disabled="isBuiltinEdit"
            :options="promptOptions"
            placeholder="请选择提示词（可选）"
            clearable
            filterable
            value-field="_id"
            label-field="name"
          />
          <n-text depth="3" style="font-size: 12px; margin-top: 6px;">
            不选择提示词时，会自动回退到全局默认系统提示词，不会再落成空白系统提示词。
          </n-text>
        </n-form-item>

        <div class="agent-advanced-panel">
          <n-flex justify="space-between" align="center" wrap :size="8">
            <n-flex align="center" :size="6" wrap>
              <n-button text class="agent-advanced-toggle" @click="advancedExpanded = !advancedExpanded">
                <n-icon :component="advancedExpanded ? ChevronUpOutline : ChevronDownOutline" size="16" />
                <span>高级模型参数</span>
              </n-button>
              <help-tip text="留空表示该 Agent 不覆盖对应请求参数，具体是否生效取决于服务商接口兼容性。" />
              <n-tag v-if="configuredModelParamsCount" size="small" type="primary" bordered>
                已配置 {{ configuredModelParamsCount }} 项
              </n-tag>
            </n-flex>
            <n-text depth="3" style="font-size: 12px;">配置后会在聊天页和定时任务中自动带上这些参数</n-text>
          </n-flex>

          <n-collapse-transition :show="advancedExpanded">
            <div class="agent-advanced-grid">
            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Temperature</span>
                <help-tip text="控制采样随机性。越高越发散，越低越稳定；常见范围 0 到 2。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.temperature"
                clearable
                placeholder="留空则不传"
                :min="0"
                :max="2"
                :step="0.1"
              />
            </div>

            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Top P</span>
                <help-tip text="核采样阈值。通常与 temperature 二选一为主；常见范围 0 到 1。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.topP"
                clearable
                placeholder="留空则不传"
                :min="0"
                :max="1"
                :step="0.05"
              />
            </div>

            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Max Tokens</span>
                <help-tip text="限制单次回复最大输出 token 数。留空则交给服务商默认策略。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.maxTokens"
                clearable
                placeholder="留空则不传"
                :min="1"
                :step="1"
              />
            </div>

            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Seed</span>
                <help-tip text="支持时可提升结果复现性；并非所有兼容接口都实现该参数。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.seed"
                clearable
                placeholder="留空则不传"
                :step="1"
              />
            </div>

            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Presence Penalty</span>
                <help-tip text="鼓励模型引入新话题，常见范围 -2 到 2。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.presencePenalty"
                clearable
                placeholder="留空则不传"
                :min="-2"
                :max="2"
                :step="0.1"
              />
            </div>

            <div class="agent-advanced-field">
              <div class="agent-advanced-field__label">
                <span>Frequency Penalty</span>
                <help-tip text="抑制重复表达，常见范围 -2 到 2。" />
              </div>
              <n-input-number
                v-model:value="formData.modelParams.frequencyPenalty"
                clearable
                placeholder="留空则不传"
                :min="-2"
                :max="2"
                :step="0.1"
              />
            </div>

            <div class="agent-advanced-field agent-advanced-field--wide">
              <div class="agent-advanced-field__label">
                <span>推理强度</span>
                <help-tip text="会同步到聊天页的 reasoning_effort；仅在接口支持时生效，清空表示不覆盖当前聊天设置。" />
              </div>
              <n-select
                v-model:value="formData.modelParams.reasoningEffort"
                :options="reasoningEffortOptions"
                placeholder="不覆盖当前聊天设置"
                clearable
              />
            </div>
            </div>
          </n-collapse-transition>
        </div>
      </n-form>

      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button v-if="isBuiltinEdit" @click="resetBuiltinEditableFields">重置为默认</n-button>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSave" :loading="saving">
            保存
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import {
  NCard, NFlex, NIcon, NButton, NInput, NTag, NEllipsis, NText,
  NModal, NForm, NFormItem, NSelect, NInputNumber, NCollapseTransition, useDialog, useMessage
} from 'naive-ui'
import { Magento, Trash } from '@vicons/fa'
import { ChevronDownOutline, ChevronUpOutline } from '@vicons/ionicons5'
import HelpTip from '@/components/HelpTip.vue'
import {
  AGENT_REASONING_EFFORT_OPTIONS,
  compactAgentModelParams,
  countConfiguredAgentModelParams,
  createEmptyAgentModelParams,
  normalizeAgentModelParams
} from '@/utils/agentModelParams'

import {
  getAgents,
  addAgent,
  updateAgent,
  deleteAgent,
  getProviders,
  getPrompts,
  getSkills,
  getMcpServers,
  getTheme
} from '@/utils/configListener'

// 数据源
const agents = getAgents()
const theme = getTheme()
const providers = getProviders()
const prompts = getPrompts()
const skills = getSkills()
const mcps = getMcpServers()

// 选择器选项
const providerOptions = computed(() => providers.value || [])
const promptOptions = computed(() => prompts.value || [])
const skillOptions = computed(() => skills.value || [])
const mcpOptions = computed(() => mcps.value || [])

// 辅助函数：根据 id 获取名称
const getProviderName = (id) => {
  const p = providers.value.find(p => p._id === id)
  return p ? p.name : id
}
const getPromptName = (id) => {
  const p = prompts.value.find(p => p._id === id)
  return p ? p.name : id
}

// UI ״̬
const dialog = useDialog()
const message = useMessage()
const formRef = ref(null)

const showModal = ref(false)
const modalMode = ref('add')
const currentEditId = ref(null)
const currentEditBuiltin = ref(false)
const advancedExpanded = ref(false)
const isBuiltinEdit = computed(() => modalMode.value === 'edit' && currentEditBuiltin.value)

const reasoningEffortOptions = AGENT_REASONING_EFFORT_OPTIONS.map((value) => ({
  label: value === 'auto' ? 'auto（跟随接口默认）' : value,
  value
}))

const formData = reactive({
  name: '',
  provider: null,
  model: null,
  skills: [],
  mcp: [],
  prompt: null,
  modelParams: createEmptyAgentModelParams()
})

const configuredModelParamsCount = computed(() => countConfiguredAgentModelParams(formData.modelParams))

const selectedProvider = computed(() => {
  return providers.value.find(p => p._id === formData.provider) || null
})

const modelOptions = computed(() => {
  const enabledModels = selectedProvider.value?.selectModels || []
  return enabledModels.map((id) => ({ label: id, value: id }))
})

const rules = {
  name: { required: true, message: '名称为必填项', trigger: ['blur', 'input'] }
}

const cardStyle = computed(() => ({
  width: 'calc((100% - 32px) / 3)',
  marginBottom: '0',
  cursor: 'pointer'
}))

function assignFormModelParams(raw) {
  const normalized = normalizeAgentModelParams(raw)
  formData.modelParams.temperature = normalized.temperature
  formData.modelParams.topP = normalized.topP
  formData.modelParams.maxTokens = normalized.maxTokens
  formData.modelParams.presencePenalty = normalized.presencePenalty
  formData.modelParams.frequencyPenalty = normalized.frequencyPenalty
  formData.modelParams.seed = normalized.seed
  formData.modelParams.reasoningEffort = normalized.reasoningEffort
}

const openAddModal = () => {
  modalMode.value = 'add'
  currentEditId.value = null
  currentEditBuiltin.value = false
  advancedExpanded.value = false
  resetForm()
  formRef.value?.restoreValidation()
  showModal.value = true
}

const openEditModal = (agent) => {
  modalMode.value = 'edit'
  currentEditId.value = agent._id
  currentEditBuiltin.value = !!agent.builtin
  advancedExpanded.value = false
  formData.name = agent.name || ''
  formData.provider = agent.provider || null
  formData.model = agent.model || null
  formData.skills = agent.skills || []
  formData.mcp = agent.mcp || []
  formData.prompt = agent.prompt || null
  assignFormModelParams(agent.modelParams)
  formRef.value?.restoreValidation()
  showModal.value = true
}

const resetForm = () => {
  formData.name = ''
  formData.provider = null
  formData.model = null
  formData.skills = []
  formData.mcp = []
  formData.prompt = null
  assignFormModelParams(null)
}

watch([() => formData.provider, () => formData.model], ([providerId, modelId]) => {
  if (!providerId) {
    if (modelId) formData.model = null
    return
  }
  const enabledModels = selectedProvider.value?.selectModels || []
  if (enabledModels.length === 0) {
    if (modelId) formData.model = null
    return
  }
  if (modelId && !enabledModels.includes(modelId)) {
    formData.model = null
  }
})

const saving = ref(false)
const handleSave = () => {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      message.warning('请填写必填项')
      return
    }
    saving.value = true
    try {
      const builtinPatch = {
        provider: formData.provider,
        model: formData.model,
        mcp: Array.isArray(formData.mcp) && formData.mcp.length ? formData.mcp : [],
        modelParams: compactAgentModelParams(formData.modelParams)
      }

      const submitData = isBuiltinEdit.value
        ? builtinPatch
        : {
            name: formData.name.trim(),
            provider: formData.provider,
            model: formData.model,
            skills: formData.skills.length ? formData.skills : [],
            mcp: formData.mcp.length ? formData.mcp : [],
            prompt: formData.prompt,
            modelParams: compactAgentModelParams(formData.modelParams)
          }

      if (modalMode.value === 'add') {
        // 生成 _id
        const safeData = JSON.parse(JSON.stringify(submitData))
        const newAgent = { _id: crypto.randomUUID(), ...safeData }
        await addAgent(newAgent)
        message.success('智能体新增成功')
      } else {
        const safeData = JSON.parse(JSON.stringify(submitData))
        await updateAgent(currentEditId.value, safeData)
        message.success('智能体更新成功')
      }
      showModal.value = false
    } catch (err) {
      message.error('操作失败：' + err.message)
    } finally {
      saving.value = false
    }
  })
}

const resetBuiltinEditableFields = () => {
  if (!isBuiltinEdit.value) return
  formData.provider = null
  formData.model = null
  formData.mcp = []
  assignFormModelParams(null)
}

const confirmDelete = (agent) => {
  if (agent?.builtin) {
    message.warning('内置智能体不可删除')
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `确定删除智能体“${agent.name || '未命名'}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteAgent(agent._id)
        message.success('智能体已删除')
      } catch (err) {
        message.error('删除失败：' + err.message)
      }
    }
  })
}
</script>

<style scoped>
.n-card {
  transition: all 0.2s;
}
.settings-page {
  position: relative;
  width: 100%;
}

.settings-page.is-dark {
  color-scheme: dark;
}

.settings-hero-card,
.settings-grid-card {
  border-radius: 22px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.10), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.86));
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
  animation: settings-card-enter 300ms ease;
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-grid-card {
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.16), transparent 34%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.n-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.settings-page.is-dark .n-card:hover {
  box-shadow: 0 18px 34px rgba(2, 6, 23, 0.34);
}

@keyframes settings-card-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.agent-advanced-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(0, 0, 0, 0.12);
}

.agent-advanced-toggle {
  padding: 0;
  font-weight: 600;
}

.agent-advanced-toggle :deep(.n-button__content) {
  gap: 6px;
}

.agent-advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.agent-advanced-field {
  min-width: 0;
}

.agent-advanced-field--wide {
  grid-column: 1 / -1;
}

.agent-advanced-field__label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 12px;
  color: inherit;
  opacity: 0.72;
}

.settings-card__meta {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(71, 85, 105, 0.88);
}

.settings-card__meta--subtle {
  color: rgba(100, 116, 139, 0.72);
}

.settings-page.is-dark .settings-card__meta {
  color: rgba(203, 213, 225, 0.88);
}

.settings-page.is-dark .settings-card__meta--subtle {
  color: rgba(148, 163, 184, 0.84);
}

@media (max-width: 720px) {
  .agent-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-advanced-field--wide {
    grid-column: auto;
  }
}
</style>
