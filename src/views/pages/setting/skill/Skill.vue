<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--skill', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1120px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex align="center" :size="8">
          <n-icon :component="SkillLevelIntermediate" size="20" :depth="1" />
          <span style="font-weight: 600;">技能管理</span>
        </n-flex>

        <n-flex align="center" wrap :size="8">
          <n-button tertiary size="small" @click="handleImportDirectory()">
            导入目录
          </n-button>
          <n-button tertiary size="small" @click="handleImportSkillFile()">
            导入 SKILL.md
          </n-button>
          <n-button tertiary size="small" @click="openInlineModal()">
            新建内联技能
          </n-button>
        </n-flex>
      </n-flex>

      <n-text depth="3" style="display: block; margin-top: 10px; font-size: 12px;">
        标准目录技能只登记来源目录与绑定信息，实际文件仍保留在原目录。配置中只保存
        `sourcePath`、`entryFile`、`mcp`、`triggers` 等元数据，不复制技能文件。
      </n-text>
    </n-card>

    <n-empty
      v-if="!sortedSkills.length"
      description="暂无技能"
      style="margin-top: 24px;"
    />

    <n-flex
      v-else
      wrap
      :size="16"
      justify="flex-start"
      style="width: 100%; margin-top: 8px;"
    >
      <n-card
        v-for="skill in sortedSkills"
        :key="skill._id"
        hoverable
        size="small"
        :style="cardStyle"
        class="settings-grid-card"
        @click="openEditModal(skill)"
      >
        <n-flex vertical :size="10">
          <n-flex justify="space-between" align="center" :size="8">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ skill.name || skill._id || '未命名技能' }}
            </n-text>

            <n-flex align="center" :size="4">
              <n-button
                v-if="isDirectorySkill(skill) && !skill.builtin"
                text
                size="small"
                title="从源目录刷新"
                @click.stop="handleRefresh(skill)"
              >
                刷新
              </n-button>
              <n-button
                v-if="!skill.builtin"
                text
                size="small"
                title="删除技能记录"
                @click.stop="confirmDelete(skill)"
              >
                <n-icon :component="Trash" size="18" />
              </n-button>
            </n-flex>
          </n-flex>

          <n-flex align="center" wrap :size="6">
            <n-tag v-if="skill.builtin" size="small" type="info" bordered>内置</n-tag>
            <n-tag size="small" :type="isDirectorySkill(skill) ? 'success' : 'default'" bordered>
              {{ isDirectorySkill(skill) ? '目录技能' : '内联技能' }}
            </n-tag>
            <n-tag v-if="skill.mcp && skill.mcp.length" size="small" type="warning" bordered>
              MCP {{ skill.mcp.length }}
            </n-tag>
          </n-flex>

          <n-ellipsis
            v-if="getCardDescription(skill)"
            :line-clamp="2"
            class="settings-card__meta"
          >
            {{ getCardDescription(skill) }}
          </n-ellipsis>

          <n-ellipsis
            v-if="isDirectorySkill(skill) && skill.sourcePath"
            :line-clamp="1"
            class="settings-card__meta"
          >
            来源：{{ skill.sourcePath }}
          </n-ellipsis>

          <n-text
            v-if="isDirectorySkill(skill) && getCardFileSummary(skill)"
            depth="3"
            style="font-size: 12px;"
          >
            {{ getCardFileSummary(skill) }}
          </n-text>
        </n-flex>
      </n-card>
    </n-flex>

    <n-modal
      v-model:show="showEditModal"
      :mask-closable="false"
      preset="card"
      :title="editModalTitle"
      style="width: 860px; max-width: 95%;"
    >
      <n-form label-placement="left" label-width="120px">
        <n-alert
          v-if="editingBuiltinSkill"
          type="warning"
          style="margin-bottom: 12px;"
        >
          内置技能仅供查看，不支持在这里修改或删除。
        </n-alert>

        <n-alert
          v-if="editingDirectorySkill"
          type="info"
          style="margin-bottom: 12px;"
        >
          目录技能的名称、描述和正文都来自源目录中的 `SKILL.md`。这里仅编辑本插件自己的绑定信息，
          例如 MCP 与触发词；如果要修改名称或描述，请直接编辑源目录中的 `SKILL.md`。
        </n-alert>

        <n-form-item label="名称">
          <n-input
            v-model:value="formData.name"
            :disabled="editingDirectorySkill || editingBuiltinSkill"
            placeholder="请输入技能名称"
          />
        </n-form-item>

        <n-form-item label="描述">
          <n-input
            v-model:value="formData.description"
            :disabled="editingDirectorySkill || editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="技能描述"
          />
        </n-form-item>

        <n-form-item v-if="editingDirectorySkill" label="来源目录">
          <n-input :value="formData.sourcePath" disabled />
        </n-form-item>

        <n-form-item v-if="editingDirectorySkill" label="入口文件">
          <n-input :value="formData.entryFile" disabled />
        </n-form-item>

        <n-form-item v-if="editingDirectorySkill && formData.importInfo" label="导入记录">
          <n-input
            :value="formData.importInfo"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            disabled
          />
        </n-form-item>

        <n-form-item v-if="editingDirectorySkill" label="文件索引">
          <n-input
            :value="formData.fileIndexText || '未扫描到附属文件'"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            disabled
          />
        </n-form-item>

        <n-form-item v-if="editingDirectorySkill" label="脚本索引">
          <n-input
            :value="formData.scriptCatalogText || '未识别到可执行脚本'"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 10 }"
            disabled
          />
        </n-form-item>

        <n-form-item v-if="!editingDirectorySkill" label="内容">
          <n-input
            v-model:value="formData.content"
            :disabled="editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 16 }"
            placeholder="输入技能内容"
          />
        </n-form-item>

        <n-form-item label="标签">
          <n-input
            v-model:value="formData.triggerTagsText"
            :disabled="editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            placeholder="每行一个，或使用逗号分隔"
          />
        </n-form-item>

        <n-form-item label="关键词">
          <n-input
            v-model:value="formData.triggerKeywordsText"
            :disabled="editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="每行一个，或使用逗号分隔"
          />
        </n-form-item>

        <n-form-item label="正则">
          <n-input
            v-model:value="formData.triggerRegexText"
            :disabled="editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="每行一个正则表达式"
          />
        </n-form-item>

        <n-form-item label="意图">
          <n-input
            v-model:value="formData.triggerIntentsText"
            :disabled="editingBuiltinSkill"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            placeholder="每行一个，或使用逗号分隔"
          />
        </n-form-item>

        <n-form-item label="MCP">
          <n-select
            v-model:value="formData.mcp"
            multiple
            :options="mcpOptions"
            placeholder="选择技能依赖的 MCP 服务"
            clearable
            filterable
            :disabled="editingBuiltinSkill"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-button
            v-if="editingDirectorySkill && !editingBuiltinSkill"
            tertiary
            @click="handleRefresh(currentSkill)"
          >
            从源目录刷新
          </n-button>
          <span v-else />

          <n-flex justify="flex-end" :size="12">
            <n-button @click="showEditModal = false">取消</n-button>
            <n-button
              type="primary"
              :loading="saving"
              :disabled="editingBuiltinSkill"
              @click="handleSave()"
            >
              保存
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NEllipsis,
  NFlex,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import { Trash } from '@vicons/fa'
import { SkillLevelIntermediate } from '@vicons/carbon'

import {
  addSkill,
  deleteSkill,
  getMcpServers,
  getSkills,
  getTheme,
  importSkillDirectory,
  importSkillFile,
  refreshSkillFromSource,
  updateSkill
} from '@/utils/configListener'
import {
  buildSkillFileIndexLines,
  buildSkillScriptCatalogLines,
  buildSkillFileIndexSummary,
  getSkillDescription,
  isDirectorySkill
} from '@/utils/skillUtils'

const skills = getSkills()
const mcpServers = getMcpServers()

const dialog = useDialog()
const message = useMessage()
const theme = getTheme()

const showEditModal = ref(false)
const saving = ref(false)
const editMode = ref('add-inline')
const currentSkillId = ref('')

const formData = reactive({
  name: '',
  description: '',
  content: '',
  sourcePath: '',
  entryFile: '',
  importInfo: '',
  fileIndexText: '',
  scriptCatalogText: '',
  triggerTagsText: '',
  triggerKeywordsText: '',
  triggerRegexText: '',
  triggerIntentsText: '',
  mcp: []
})

const sortedSkills = computed(() => {
  return [...(skills.value || [])].sort((a, b) => {
    const builtinDiff = Number(!!b?.builtin) - Number(!!a?.builtin)
    if (builtinDiff !== 0) return builtinDiff

    const directoryDiff = Number(!isDirectorySkill(a)) - Number(!isDirectorySkill(b))
    if (directoryDiff !== 0) return directoryDiff

    return String(a?.name || a?._id || '').localeCompare(String(b?.name || b?._id || ''), 'zh-Hans-CN')
  })
})

const mcpOptions = computed(() => {
  return (mcpServers.value || []).map((server) => ({
    label: server.name || server._id,
    value: server._id,
    disabled: !!server.disabled
  }))
})

const currentSkill = computed(() => {
  const id = String(currentSkillId.value || '').trim()
  if (!id) return null
  return (skills.value || []).find((skill) => skill && skill._id === id) || null
})

const editingDirectorySkill = computed(() => isDirectorySkill(currentSkill.value))
const editingBuiltinSkill = computed(() => !!currentSkill.value?.builtin)

const editModalTitle = computed(() => {
  if (editMode.value === 'add-inline') return '新建内联技能'
  if (editingBuiltinSkill.value) return '查看内置技能'
  return editingDirectorySkill.value ? '编辑目录技能绑定' : '编辑内联技能'
})

const cardStyle = computed(() => ({
  width: 'calc((100% - 32px) / 3)',
  minWidth: '300px',
  marginBottom: '0',
  cursor: 'pointer'
}))

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `skill_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  }
}

function getUtoolsApi() {
  return window?.utools || globalThis?.utools
}

function extractDialogPath(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return entry.trim()

  if (typeof entry === 'object') {
    const candidates = [entry.path, entry.filePath, entry.fullPath, entry.value]
    for (const candidate of candidates) {
      const text = typeof candidate === 'string' ? candidate.trim() : ''
      if (text) return text
    }
  }

  return ''
}

function resolveOpenDialogPath(result) {
  if (!result) return ''
  if (Array.isArray(result)) return extractDialogPath(result[0])
  if (typeof result === 'object' && Array.isArray(result.filePaths)) {
    return extractDialogPath(result.filePaths[0])
  }
  return extractDialogPath(result)
}

function isLikelyUiEvent(value) {
  return !!value
    && typeof value === 'object'
    && (
      typeof value.preventDefault === 'function'
      || typeof value.stopPropagation === 'function'
      || ['PointerEvent', 'MouseEvent', 'Event'].includes(value?.constructor?.name)
      || ('target' in value && 'currentTarget' in value)
    )
}

function normalizeImportPath(value) {
  if (isLikelyUiEvent(value)) return ''

  const raw = typeof value === 'object' ? extractDialogPath(value) : String(value || '')
  const text = raw.trim()
  if (!text) return ''

  const match = text.match(/^(['"])([\s\S]*)\1$/)
  return match ? match[2].trim() : text
}

function openPathDialog(options) {
  const api = getUtoolsApi()
  if (!api?.showOpenDialog) {
    throw new Error('当前环境不支持打开文件选择器')
  }
  return normalizeImportPath(resolveOpenDialogPath(api.showOpenDialog(options)))
}

function errorText(err) {
  return err?.message || String(err || '未知错误')
}

function reportActionError(action, err, target = '') {
  console.error(`[Skill] ${action} failed`, {
    target,
    error: err
  })

  const suffix = target ? `（${target}）` : ''
  message.error(`${action}失败${suffix}：${errorText(err)}`)
}

function splitListText(text) {
  return String(text || '')
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqList(list) {
  const out = []
  const seen = new Set()

  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const text = String(item || '').trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push(text)
  })

  return out
}

function joinListText(list) {
  return uniqList(list).join('\n')
}

function normalizeTriggersFromForm() {
  return {
    tags: uniqList(splitListText(formData.triggerTagsText)),
    keywords: uniqList(splitListText(formData.triggerKeywordsText)),
    regex: uniqList(splitListText(formData.triggerRegexText)),
    intents: uniqList(splitListText(formData.triggerIntentsText))
  }
}

function buildImportInfo(skill) {
  const install = skill?.install && typeof skill.install === 'object' ? skill.install : null
  const cache = skill?.cache && typeof skill.cache === 'object' ? skill.cache : null
  const lines = []

  if (install?.type === 'file') lines.push('导入方式：从 SKILL.md 导入')
  else if (install?.type === 'directory') lines.push('导入方式：从目录导入')

  if (install?.selectedPath) lines.push(`选择路径：${install.selectedPath}`)
  if (install?.filePath) lines.push(`原始 SKILL.md：${install.filePath}`)
  if (cache?.refreshedAt) lines.push(`最近刷新：${cache.refreshedAt}`)

  return lines.join('\n')
}

function getCardDescription(skill) {
  return getSkillDescription(skill)
}

function getCardFileSummary(skill) {
  if (!isDirectorySkill(skill)) return ''
  return buildSkillFileIndexSummary(skill)
}

function resetForm() {
  formData.name = ''
  formData.description = ''
  formData.content = ''
  formData.sourcePath = ''
  formData.entryFile = ''
  formData.importInfo = ''
  formData.fileIndexText = ''
  formData.scriptCatalogText = ''
  formData.triggerTagsText = ''
  formData.triggerKeywordsText = ''
  formData.triggerRegexText = ''
  formData.triggerIntentsText = ''
  formData.mcp = []
}

function fillFormFromSkill(skill) {
  resetForm()
  if (!skill) return

  const triggers = skill?.triggers && typeof skill.triggers === 'object' ? skill.triggers : {}

  formData.name = String(skill.name || '')
  formData.description = getSkillDescription(skill)
  formData.content = String(skill.content || '')
  formData.sourcePath = String(skill.sourcePath || '')
  formData.entryFile = String(skill.entryFile || 'SKILL.md')
  formData.importInfo = buildImportInfo(skill)
  formData.fileIndexText = buildSkillFileIndexLines(skill).join('\n')
  formData.scriptCatalogText = buildSkillScriptCatalogLines(skill).join('\n')
  formData.triggerTagsText = joinListText(triggers.tags)
  formData.triggerKeywordsText = joinListText(triggers.keywords)
  formData.triggerRegexText = joinListText(triggers.regex)
  formData.triggerIntentsText = joinListText(triggers.intents)
  formData.mcp = Array.isArray(skill.mcp) ? [...skill.mcp] : []
}

function openInlineModal() {
  editMode.value = 'add-inline'
  currentSkillId.value = ''
  resetForm()
  showEditModal.value = true
}

function openEditModal(skill) {
  if (!skill) return
  editMode.value = 'edit'
  currentSkillId.value = String(skill._id || '')
  fillFormFromSkill(skill)
  showEditModal.value = true
}

async function handleSave() {
  if (editingBuiltinSkill.value) {
    message.warning('内置技能不可编辑')
    return
  }

  const name = String(formData.name || '').trim()
  const description = String(formData.description || '').trim()
  const content = String(formData.content || '')
  const triggers = normalizeTriggersFromForm()
  const mcp = uniqList(formData.mcp)

  if (!editingDirectorySkill.value && !name) {
    message.warning('名称不能为空')
    return
  }

  saving.value = true
  try {
    if (editingDirectorySkill.value) {
      await updateSkill(currentSkillId.value, {
        triggers,
        mcp
      })
      message.success('目录技能绑定已更新')
    } else if (editMode.value === 'add-inline') {
      await addSkill({
        _id: newId(),
        name,
        description,
        content,
        triggers,
        mcp
      })
      message.success('内联技能已创建')
    } else {
      await updateSkill(currentSkillId.value, {
        name,
        description,
        content,
        triggers,
        mcp
      })
      message.success('技能已更新')
    }

    showEditModal.value = false
  } catch (err) {
    reportActionError('保存技能', err, currentSkillId.value || name)
  } finally {
    saving.value = false
  }
}

async function handleImportDirectory(pathFromPayload = '') {
  let sourcePath = normalizeImportPath(pathFromPayload)

  try {
    if (!sourcePath) {
      sourcePath = openPathDialog({
        title: '选择技能目录',
        properties: ['openDirectory']
      })
    }

    if (!sourcePath) {
      message.warning('未获取到有效目录路径')
      return
    }

    const imported = await Promise.resolve(importSkillDirectory(sourcePath))
    message.success(`已导入：${imported?.name || imported?._id || sourcePath}`)
    openEditModal(imported)
  } catch (err) {
    reportActionError('导入目录', err, sourcePath)
  }
}

async function handleImportSkillFile(pathFromPayload = '') {
  let filePath = normalizeImportPath(pathFromPayload)

  try {
    if (!filePath) {
      filePath = openPathDialog({
        title: '选择 SKILL.md',
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
    }

    if (!filePath) {
      message.warning('未获取到有效文件路径')
      return
    }

    const imported = await Promise.resolve(importSkillFile(filePath))
    message.success(`已导入：${imported?.name || imported?._id || filePath}`)
    openEditModal(imported)
  } catch (err) {
    reportActionError('导入 SKILL.md', err, filePath)
  }
}

async function handleRefresh(skill) {
  const target = skill || currentSkill.value
  if (!target?._id || !isDirectorySkill(target)) return

  try {
    const refreshed = await Promise.resolve(refreshSkillFromSource(target._id))
    if (currentSkillId.value === refreshed?._id) {
      fillFormFromSkill(refreshed)
    }
    message.success(`已刷新：${refreshed?.name || refreshed?._id || target._id}`)
  } catch (err) {
    reportActionError('刷新技能', err, target?._id || '')
  }
}

function confirmDelete(skill) {
  if (skill?.builtin) {
    message.warning('内置技能不可删除')
    return
  }

  dialog.warning({
    title: '确认删除',
    content: isDirectorySkill(skill)
      ? `删除后只会移除本插件中的技能记录，不会删除原目录文件。\n\n确定删除“${skill.name || skill._id}”吗？`
      : `确定删除“${skill.name || skill._id}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteSkill(skill._id)
        if (currentSkillId.value === skill._id) showEditModal.value = false
        message.success('技能已删除')
      } catch (err) {
        reportActionError('删除技能', err, skill?._id || '')
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
    radial-gradient(circle at top right, rgba(24, 160, 88, 0.10), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.86));
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
  animation: settings-card-enter 300ms ease;
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-grid-card {
  background:
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.16), transparent 34%),
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

.settings-card__meta {
  font-size: 12px;
  color: rgba(71, 85, 105, 0.88);
}

.settings-page.is-dark .settings-card__meta {
  color: rgba(203, 213, 225, 0.88);
}
</style>
