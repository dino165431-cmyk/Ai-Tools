<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--timed-task', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center">
        <n-flex align="center">
          <n-icon :component="Timer24Regular" size="20" :depth="1" />
          <span style="font-weight: 500;">定时任务</span>
        </n-flex>
        <n-flex align="center" :size="8">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button tertiary circle size="small" @click="openAddModal">
                <template #icon>
                  <n-icon :component="AddOutline" size="16" />
                </template>
              </n-button>
            </template>
            新增任务
          </n-tooltip>
        </n-flex>
      </n-flex>
      <n-text depth="3" style="font-size: 12px; margin-top: 8px; display: block;">
        任务仅在插件运行期间执行；关闭插件后不会触发。
      </n-text>
    </n-card>

    <n-empty v-if="!tasks.length" description="暂无任务" style="margin-top: 24px;" />

    <n-flex v-else vertical :size="12" style="width: 100%; margin-top: 12px;">
      <n-card
        v-for="task in tasks"
        :key="task._id"
        hoverable
        size="small"
        class="settings-list-card"
        style="width: 100%; cursor: pointer;"
        @click="openEditModal(task)"
      >
        <n-flex justify="space-between" align="flex-start" :size="12">
          <n-flex vertical :size="4" style="min-width: 0;">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ task.name || '未命名任务' }}
            </n-text>
            <n-text depth="3" style="font-size: 12px; word-break: break-all;">
              {{ task.description || '—' }}
            </n-text>
            <n-text depth="3" style="font-size: 12px;">
              触发：{{ formatTrigger(task) }}
            </n-text>
            <n-text depth="3" style="font-size: 12px;">
              智能体：{{ getAgentLabel(task.agentId) }}
            </n-text>
          </n-flex>

          <n-flex align="center" :size="8">
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-switch
                  :value="!!task.enabled"
                  @update:value="(val) => handleToggleEnabled(task, val)"
                  @click.stop
                />
              </template>
              {{ task.enabled ? '已启用' : '未启用' }}
            </n-tooltip>

            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button text size="small" @click.stop="confirmDelete(task)">
                  <n-icon :component="TrashOutline" size="18" />
                </n-button>
              </template>
              删除
            </n-tooltip>
          </n-flex>
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
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-align="left"
        require-mark-placement="left"
        label-width="110px"
        style="margin-top: 8px; padding: 0 10px;"
      >
        <n-form-item label="名字" path="name" required>
          <n-input v-model:value="formData.name" placeholder="任务名字（必填）" />
        </n-form-item>

        <n-form-item label="描述" path="description">
          <n-input
            v-model:value="formData.description"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="可选"
          />
        </n-form-item>

        <n-divider style="margin: 8px 0 16px;">触发规则</n-divider>

        <n-form-item label="类型" path="triggerType" required>
          <n-select v-model:value="formData.triggerType" :options="triggerTypeOptions" />
        </n-form-item>

        <n-form-item v-if="formData.triggerType === 'once'" label="执行日期" path="triggerDate" required>
          <n-date-picker v-model:formatted-value="formData.triggerDate" type="date" value-format="yyyy-MM-dd" clearable />
        </n-form-item>

        <n-form-item label="执行时间" path="triggerTime" required>
          <n-time-picker
            v-model:formatted-value="formData.triggerTime"
            value-format="HH:mm:ss"
            format="HH:mm:ss"
            clearable
          />
        </n-form-item>

        <n-form-item v-if="formData.triggerType === 'interval'" label="间隔（秒）" path="intervalSeconds" required>
          <n-input-number v-model:value="formData.intervalSeconds" :min="1" :max="86400" />
        </n-form-item>

        <n-form-item v-if="formData.triggerType === 'weekly'" label="星期" path="weekdays" required>
          <n-select
            v-model:value="formData.weekdays"
            multiple
            :options="weekdayOptions"
            placeholder="选择周一到周日（可多选）"
          />
        </n-form-item>

        <n-form-item v-if="formData.triggerType === 'monthly'" label="日期" path="monthDays" required>
          <n-select
            v-model:value="formData.monthDays"
            multiple
            :options="monthDayOptions"
            placeholder="选择每月的日期（可多选）"
          />
        </n-form-item>

        <n-divider style="margin: 16px 0;">执行内容</n-divider>

        <n-form-item label="智能体" path="agentId" required>
          <n-select v-model:value="formData.agentId" :options="agentOptions" filterable placeholder="选择一个智能体" />
        </n-form-item>

        <n-form-item label="执行内容" path="content" required>
          <n-input
            v-model:value="formData.content"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 10 }"
            placeholder="需要让智能体执行的内容"
          />
        </n-form-item>

        <n-divider style="margin: 16px 0;">后台行为与扩展</n-divider>

        <n-form-item label="MCP 服务" path="mcpIds">
          <n-select v-model:value="formData.mcpIds" multiple :options="mcpOptions" filterable placeholder="可多选，执行时全部挂载" />
        </n-form-item>

        <n-form-item label="技能" path="skillIds">
          <n-select
            v-model:value="formData.skillIds"
            multiple
            :options="skillOptions"
            filterable
            placeholder="可多选，执行时全部加入系统提示词"
          />
        </n-form-item>

        <n-form-item label="自动保存会话" path="autoSaveSession">
          <n-switch v-model:value="formData.autoSaveSession" />
          <n-text depth="3" style="margin-left: 8px; font-size: 12px;">
            保存到 `session/Timed Task/任务名/执行时间.json`
          </n-text>
        </n-form-item>

        <n-form-item label="启用" path="enabled">
          <n-switch v-model:value="formData.enabled" />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSave">
            保存
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { computed, ref, reactive } from 'vue'
import {
  NCard,
  NFlex,
  NIcon,
  NButton,
  NText,
  NTooltip,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
  NDivider,
  NDatePicker,
  NTimePicker,
  NInputNumber,
  NEmpty,
  useDialog,
  useMessage
} from 'naive-ui'
import { Timer24Regular } from '@vicons/fluent'
import { AddOutline, TrashOutline } from '@vicons/ionicons5'

import {
  getAgents,
  getTheme,
  getSkills,
  getMcpServers,
  getTimedTasks,
  addTimedTask,
  updateTimedTask,
  deleteTimedTask
} from '@/utils/configListener'
import { createDirectory, exists, moveItem } from '@/utils/fileOperations'

const theme = getTheme()

const SESSION_ROOT = 'session'
const TIMED_TASK_ROOT = `${SESSION_ROOT}/Timed Task`

const tasks = getTimedTasks()
const agents = getAgents()
const skills = getSkills()
const mcpServers = getMcpServers()

const dialog = useDialog()
const message = useMessage()

const showModal = ref(false)
const modalMode = ref('add')
const currentEditId = ref(null)
const originalTaskName = ref('')
const formRef = ref(null)
const saving = ref(false)

const formData = reactive({
  name: '',
  description: '',
  enabled: false,

  triggerType: 'daily',
  triggerDate: null,
  triggerTime: null,
  intervalSeconds: 60,
  weekdays: [],
  monthDays: [],

  agentId: null,
  content: '',

  mcpIds: [],
  skillIds: [],

  autoSaveSession: true
})

const rules = {
  name: { required: true, message: '名字为必填项', trigger: ['blur', 'input'] },
  triggerType: { required: true, message: '请选择触发类型', trigger: ['change'] },
  agentId: { required: true, message: '请选择智能体', trigger: ['change'] },
  content: { required: true, message: '请输入执行内容', trigger: ['blur', 'input'] }
}

const modalTitle = computed(() => (modalMode.value === 'add' ? '新增定时任务' : '编辑定时任务'))

const triggerTypeOptions = [
  { label: '单次执行', value: 'once' },
  { label: '间隔触发', value: 'interval' },
  { label: '每日定时', value: 'daily' },
  { label: '每周定时', value: 'weekly' },
  { label: '每月定时', value: 'monthly' }
]

const weekdayOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 }
]

const monthDayOptions = Array.from({ length: 31 }).map((_, idx) => ({ label: String(idx + 1), value: idx + 1 }))

const agentOptions = computed(() => (agents.value || []).map((a) => ({ label: a.name || a._id, value: a._id })))
const skillOptions = computed(() => (skills.value || []).map((s) => ({ label: s.name || s._id, value: s._id })))
const mcpOptions = computed(() =>
  (mcpServers.value || []).map((s) => ({ label: s.name || s._id, value: s._id, disabled: !!s.disabled }))
)

function resetForm() {
  formData.name = ''
  formData.description = ''
  formData.enabled = false

  formData.triggerType = 'daily'
  formData.triggerDate = null
  formData.triggerTime = null
  formData.intervalSeconds = 60
  formData.weekdays = []
  formData.monthDays = []

  formData.agentId = null
  formData.content = ''

  formData.mcpIds = []
  formData.skillIds = []

  formData.autoSaveSession = true
}

function openAddModal() {
  modalMode.value = 'add'
  currentEditId.value = null
  originalTaskName.value = ''
  resetForm()
  formRef.value?.restoreValidation()
  showModal.value = true
}

function openEditModal(task) {
  modalMode.value = 'edit'
  currentEditId.value = task?._id || null
  originalTaskName.value = String(task?.name || '').trim()

  formData.name = task?.name || ''
  formData.description = task?.description || ''
  formData.enabled = !!task?.enabled

  const t = task?.trigger && typeof task.trigger === 'object' ? task.trigger : {}
  formData.triggerType = t.type || 'daily'
  formData.triggerDate = t.date || null
  formData.triggerTime = t.time || null
  formData.intervalSeconds = Number.isFinite(Number(t.intervalSeconds)) ? Number(t.intervalSeconds) : 60
  formData.weekdays = Array.isArray(t.weekdays) ? t.weekdays : []
  formData.monthDays = Array.isArray(t.monthDays) ? t.monthDays : []

  formData.agentId = task?.agentId || null
  formData.content = task?.content || ''

  formData.mcpIds = Array.isArray(task?.mcpIds) ? task.mcpIds : []
  formData.skillIds = Array.isArray(task?.skillIds) ? task.skillIds : []

  formData.autoSaveSession = task?.options?.autoSaveSession !== false

  formRef.value?.restoreValidation()
  showModal.value = true
}

function getAgentLabel(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return '—'
  const a = (agents.value || []).find((x) => x?._id === id)
  return a?.name || id
}

function weekdayLabel(val) {
  return weekdayOptions.find((o) => o.value === val)?.label || String(val)
}

function formatTrigger(task) {
  const t = task?.trigger || {}
  const type = String(t.type || '')
  const time = t.time ? String(t.time) : ''

  if (type === 'once') return `${t.date || '—'} ${time || ''}`.trim()
  if (type === 'interval') return `每 ${t.intervalSeconds || '?'} 秒（开始时间 ${time || '—'}）`
  if (type === 'daily') return `每天 ${time || '—'}`
  if (type === 'weekly') {
    const days = Array.isArray(t.weekdays) ? t.weekdays : []
    const label = days.length ? days.map((d) => weekdayLabel(d)).join(' / ') : '—'
    return `${label} ${time || ''}`.trim()
  }
  if (type === 'monthly') {
    const days = Array.isArray(t.monthDays) ? t.monthDays : []
    const label = days.length ? days.join(',') : '—'
    return `每月 ${label} 日 ${time || ''}`.trim()
  }
  return '—'
}

function sanitizePathSegment(name) {
  const raw = String(name || '').trim()
  if (!raw) return 'Untitled'
  const replaced = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  const safe = replaced === '.' || replaced === '..' ? `_${replaced}_` : replaced
  return safe.slice(0, 80) || 'Untitled'
}

async function maybeRenameTimedTaskSessionFolder({ taskId, oldName, newName, autoSaveSession }) {
  if (!autoSaveSession) return

  const id = String(taskId || '').trim()
  if (!id) return

  const oldDirName = sanitizePathSegment(oldName || id)
  const newDirName = sanitizePathSegment(newName || id)
  if (oldDirName === newDirName) return

  try {
    await createDirectory(TIMED_TASK_ROOT)
  } catch {
    // ignore
  }

  const oldDir = `${TIMED_TASK_ROOT}/${oldDirName}`
  const newDir = `${TIMED_TASK_ROOT}/${newDirName}`

  try {
    const oldExists = await exists(oldDir)
    if (!oldExists) return
    const newExists = await exists(newDir)
    if (newExists) {
      message.warning('目标会话目录已存在，未自动重命名旧目录')
      return
    }
    await moveItem(oldDir, newDir)
  } catch (err) {
    message.warning('重命名会话目录失败：' + (err?.message || String(err)))
  }
}

function buildSubmitData() {
  const name = String(formData.name || '').trim()
  const description = String(formData.description || '').trim()

  const triggerType = String(formData.triggerType || '').trim()
  const triggerDate = formData.triggerDate ? String(formData.triggerDate) : null
  const triggerTime = formData.triggerTime ? String(formData.triggerTime) : null

  const trigger = { type: triggerType }
  if (triggerType === 'once') {
    trigger.date = triggerDate
    trigger.time = triggerTime
  } else {
    trigger.time = triggerTime
    if (triggerType === 'interval') {
      trigger.intervalSeconds = Math.max(1, Math.floor(Number(formData.intervalSeconds || 0)))
    }
    if (triggerType === 'weekly') {
      trigger.weekdays = Array.isArray(formData.weekdays) ? formData.weekdays : []
    }
    if (triggerType === 'monthly') {
      trigger.monthDays = Array.isArray(formData.monthDays) ? formData.monthDays : []
    }
  }

  return {
    name,
    description,
    enabled: !!formData.enabled,
    trigger,
    agentId: formData.agentId,
    content: formData.content,
    mcpIds: Array.isArray(formData.mcpIds) ? formData.mcpIds : [],
    skillIds: Array.isArray(formData.skillIds) ? formData.skillIds : [],
    options: {
      autoSaveSession: !!formData.autoSaveSession
    }
  }
}

function validateTrigger(submit) {
  const t = submit?.trigger || {}
  if (!t.type) return '请选择触发类型'

  if (t.type === 'once') {
    if (!t.date) return '请选择执行日期'
    if (!t.time) return '请选择执行时间'
    return ''
  }

  if (!t.time) return '请选择执行时间'

  if (t.type === 'interval') {
    if (!Number.isFinite(Number(t.intervalSeconds)) || Number(t.intervalSeconds) <= 0) return '请填写有效的间隔秒数'
  }

  if (t.type === 'weekly') {
    if (!Array.isArray(t.weekdays) || t.weekdays.length === 0) return '请选择触发星期'
  }

  if (t.type === 'monthly') {
    if (!Array.isArray(t.monthDays) || t.monthDays.length === 0) return '请选择每月日期'
  }

  return ''
}

function handleSave() {
  formRef.value?.validate(async (errors) => {
    if (errors) {
      message.warning('请完善必填项')
      return
    }

    const submit = buildSubmitData()
    const triggerErr = validateTrigger(submit)
    if (triggerErr) {
      message.warning(triggerErr)
      return
    }

    saving.value = true
    try {
      const safeData = JSON.parse(JSON.stringify(submit))
      if (modalMode.value === 'add') {
        const newItem = { _id: crypto.randomUUID(), ...safeData }
        await addTimedTask(newItem)
        message.success('任务新增成功')
      } else {
        await maybeRenameTimedTaskSessionFolder({
          taskId: currentEditId.value,
          oldName: originalTaskName.value,
          newName: safeData.name,
          autoSaveSession: safeData?.options?.autoSaveSession !== false
        })
        await updateTimedTask(currentEditId.value, safeData)
        originalTaskName.value = String(safeData?.name || '').trim()
        message.success('任务更新成功')
      }
      showModal.value = false
    } catch (err) {
      message.error('操作失败：' + (err?.message || String(err)))
    } finally {
      saving.value = false
    }
  })
}

async function handleToggleEnabled(task, val) {
  try {
    await updateTimedTask(task._id, { enabled: !!val })
  } catch (err) {
    message.error('更新失败：' + (err?.message || String(err)))
  }
}

function confirmDelete(task) {
  dialog.warning({
    title: '删除任务',
    content: `确定要删除「${task?.name || task?._id}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteTimedTask(task._id)
        message.success('已删除')
      } catch (err) {
        message.error('删除失败：' + (err?.message || String(err)))
      }
    }
  })
}
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
.settings-list-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(76, 116, 128, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-list-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.settings-hero-card::after,
.settings-list-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 48%);
  pointer-events: none;
}

.settings-page.is-dark .settings-hero-card::after,
.settings-page.is-dark .settings-list-card::after {
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 48%);
}

.settings-list-card {
  animation: settings-card-enter 240ms ease;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.settings-list-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(15, 34, 38, 0.12);
}

.settings-page.is-dark .settings-list-card:hover {
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
