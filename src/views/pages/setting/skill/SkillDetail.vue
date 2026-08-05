<template>
  <n-flex
    vertical
    :class="['skill-detail-page', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1180px; margin: 0 auto;"
    :size="16"
  >
    <n-card class="detail-header">
      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex align="center" :size="12">
          <n-button quaternary size="small" @click="goBack">← 返回技能列表</n-button>
          <n-avatar
            :src="iconUrl || undefined"
            :style="{ background: currentBrandColor }"
            round
            size="large"
          >
            {{ currentInitial }}
          </n-avatar>
          <n-flex vertical :size="3">
            <n-text strong style="font-size: 20px;">{{ pageTitle }}</n-text>
            <n-flex align="center" wrap :size="6">
              <n-tag v-if="currentSkill?.builtin" size="small" type="info">内置</n-tag>
              <n-tag v-if="isDirectory" size="small" type="success">标准目录 Skill</n-tag>
              <n-tag v-else size="small">内联 Skill</n-tag>
              <n-tag v-if="currentSkill?.nativeActions?.length" size="small" type="warning">
                原生动作 {{ currentSkill.nativeActions.length }}
              </n-tag>
            </n-flex>
          </n-flex>
        </n-flex>
        <n-flex :size="8">
          <n-button
            v-if="isDirectory && !isBuiltin && !isNew"
            :loading="refreshing"
            @click="handleRefresh"
          >
            从来源刷新
          </n-button>
          <n-button v-if="!isBuiltin" type="primary" :loading="saving" @click="handleSave">
            {{ isNew ? '创建技能' : '保存修改' }}
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-alert v-if="!isNew && !currentSkill" type="error" title="技能不存在">
      当前技能可能已被删除，或配置尚未完成加载。
    </n-alert>

    <template v-else>
      <n-alert v-if="isBuiltin" type="info">
              内置 Skill 按标准包随应用提供，详情只读；原生动作通过按需发现网关直接执行，不再全量注册，也不再通过内置 MCP 中转。
      </n-alert>
      <n-alert v-else-if="isDirectory" type="info">
        包内容来自当前数据目录中的托管副本。这里可以调整触发条件和外部 MCP 绑定；包内文件请在原始来源修改后刷新。
      </n-alert>
      <n-alert
        v-for="warning in validationWarnings"
        :key="warning"
        type="warning"
        :show-icon="false"
      >
        {{ warning }}
      </n-alert>

      <div class="detail-grid">
        <n-flex vertical :size="16">
          <n-card title="基础信息" size="small">
            <n-form label-placement="top">
              <n-form-item label="名称">
                <n-input
                  v-model:value="form.name"
                  :disabled="isDirectory || isBuiltin"
                  placeholder="技能名称"
                />
              </n-form-item>
              <n-form-item label="描述">
                <n-input
                  v-model:value="form.description"
                  :disabled="isDirectory || isBuiltin"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 7 }"
                  placeholder="说明何时应使用此技能"
                />
              </n-form-item>
              <n-form-item v-if="!isNew" label="技能 ID">
                <n-input :value="currentSkill?._id || ''" disabled />
              </n-form-item>
              <n-form-item v-if="currentSkill?.packageName" label="包名">
                <n-input :value="currentSkill.packageName" disabled />
              </n-form-item>
              <n-form-item v-if="isDirectory" label="托管目录">
                <n-input :value="currentSkill?.sourcePath || ''" disabled />
              </n-form-item>
              <n-form-item v-if="isDirectory" label="入口文件">
                <n-input :value="currentSkill?.entryFile || 'SKILL.md'" disabled />
              </n-form-item>
            </n-form>
          </n-card>

          <n-card :title="isDirectory ? 'SKILL.md 正文' : '技能内容'" size="small">
            <n-spin :show="loadingContent">
              <n-input
                v-if="!isDirectory"
                v-model:value="form.content"
                :disabled="isBuiltin"
                type="textarea"
                :autosize="{ minRows: 14, maxRows: 30 }"
                placeholder="输入技能规则、流程和注意事项"
              />
              <pre v-else class="skill-source">{{ mainContent || '未读取到正文' }}</pre>
            </n-spin>
          </n-card>

          <n-card v-if="isDirectory" title="包文件与解析结果" size="small">
            <n-flex vertical :size="12">
              <n-flex wrap :size="8">
                <n-tag v-for="item in fileGroupSummary" :key="item.label" bordered>
                  {{ item.label }} {{ item.count }}
                </n-tag>
              </n-flex>
              <n-collapse>
                <n-collapse-item
                  v-for="group in fileGroups"
                  :key="group.key"
                  :title="`${group.label}（${group.items.length}）`"
                  :name="group.key"
                >
                  <n-empty v-if="!group.items.length" description="无文件" size="small" />
                  <n-list v-else bordered>
                    <n-list-item v-for="file in group.items" :key="file.path || file">
                      <n-flex justify="space-between" align="center" :size="8">
                        <n-text code>{{ file.path || file }}</n-text>
                        <n-flex align="center" :size="8">
                          <n-text v-if="file.size != null" depth="3" style="font-size: 12px;">
                            {{ formatBytes(file.size) }}
                          </n-text>
                          <n-button
                            v-if="canPreviewPackageFile(file.path || file)"
                            text
                            size="tiny"
                            @click="loadPackageFile(file.path || file)"
                          >
                            查看内容
                          </n-button>
                        </n-flex>
                      </n-flex>
                    </n-list-item>
                  </n-list>
                </n-collapse-item>
              </n-collapse>
              <n-spin :show="loadingPackageFile">
                <div v-if="selectedPackageFile" class="package-file-preview">
                  <n-flex justify="space-between" align="center" :size="8">
                    <n-text strong code>{{ selectedPackageFile }}</n-text>
                    <n-button text size="tiny" @click="clearPackageFilePreview">关闭预览</n-button>
                  </n-flex>
                  <pre class="skill-source package-file-preview__content">{{ packageFileContent }}</pre>
                </div>
              </n-spin>
            </n-flex>
          </n-card>

          <n-card v-if="scriptCatalog.length" title="可执行脚本" size="small">
            <n-list bordered>
              <n-list-item v-for="script in scriptCatalog" :key="script.path">
                <n-flex vertical :size="4">
                  <n-flex align="center" wrap :size="6">
                    <n-text code>{{ script.path }}</n-text>
                    <n-tag v-if="script.runtime" size="small">{{ script.runtime }}</n-tag>
                    <n-tag v-if="script.isLikelyEntrypoint" size="small" type="success">入口</n-tag>
                  </n-flex>
                  <n-text v-if="script.description || script.whenToUse" depth="3">
                    {{ script.description || script.whenToUse }}
                  </n-text>
                </n-flex>
              </n-list-item>
            </n-list>
          </n-card>
        </n-flex>

        <n-flex vertical :size="16">
          <n-card v-if="isDirectory" title="界面元数据 · agents/openai.yaml" size="small">
            <n-flex vertical :size="12">
              <n-flex align="center" :size="12">
                <n-avatar
                  :src="iconUrl || undefined"
                  :style="{ background: currentBrandColor }"
                  round
                  :size="56"
                >
                  {{ currentInitial }}
                </n-avatar>
                <n-flex vertical :size="3">
                  <n-text strong>{{ skillInterface.displayName || '未配置 display_name' }}</n-text>
                  <n-text depth="3">{{ skillInterface.shortDescription || '未配置 short_description' }}</n-text>
                </n-flex>
              </n-flex>
              <n-divider />
              <div class="metadata-row">
                <n-text depth="3">品牌色</n-text>
                <n-flex align="center" :size="6">
                  <span class="color-dot" :style="{ background: currentBrandColor }"></span>
                  <n-text code>{{ skillInterface.brandColor || '默认' }}</n-text>
                </n-flex>
              </div>
              <div class="metadata-row">
                <n-text depth="3">小图标</n-text>
                <n-text code>{{ skillInterface.iconSmall || '未配置' }}</n-text>
              </div>
              <div class="metadata-row">
                <n-text depth="3">大图标</n-text>
                <n-text code>{{ skillInterface.iconLarge || '未配置' }}</n-text>
              </div>
              <div class="metadata-row metadata-row--vertical">
                <n-text depth="3">默认提示</n-text>
                <n-text>{{ skillInterface.defaultPrompt || '未配置' }}</n-text>
              </div>
              <div class="metadata-row">
                <n-text depth="3">允许隐式调用</n-text>
                <n-tag size="small" :type="currentSkill?.policy?.allowImplicitInvocation === false ? 'default' : 'success'">
                  {{ currentSkill?.policy?.allowImplicitInvocation === false ? '否' : '是' }}
                </n-tag>
              </div>
            </n-flex>
          </n-card>

          <n-card v-if="currentSkill?.nativeActions?.length" title="内置原生动作" size="small">
            <n-flex wrap :size="8">
              <n-tag v-for="action in currentSkill.nativeActions" :key="action" type="warning" bordered>
                {{ action }}
              </n-tag>
            </n-flex>
            <n-text depth="3" class="section-note">
              这些动作由 Skill 运行时直接执行；写入、命令和代码执行仍会进入审批流程。
            </n-text>
          </n-card>

          <n-card title="触发与外部工具绑定" size="small">
            <n-form label-placement="top">
              <n-form-item label="标签">
                <n-input
                  v-model:value="form.tags"
                  :disabled="isBuiltin"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 5 }"
                  placeholder="每行一个标签"
                />
              </n-form-item>
              <n-form-item label="关键词">
                <n-input
                  v-model:value="form.keywords"
                  :disabled="isBuiltin"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 7 }"
                  placeholder="每行一个关键词"
                />
              </n-form-item>
              <n-form-item label="正则表达式">
                <n-input
                  v-model:value="form.regex"
                  :disabled="isBuiltin"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 6 }"
                  placeholder="每行一个正则"
                />
              </n-form-item>
              <n-form-item label="意图">
                <n-input
                  v-model:value="form.intents"
                  :disabled="isBuiltin"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 5 }"
                  placeholder="每行一个意图"
                />
              </n-form-item>
              <n-form-item label="关联外部 MCP">
                <n-select
                  v-model:value="form.mcp"
                  :disabled="isBuiltin"
                  :options="mcpOptions"
                  multiple
                  filterable
                  clearable
                  placeholder="选择外部 MCP 服务"
                />
              </n-form-item>
            </n-form>
          </n-card>

          <n-card v-if="installLines.length" title="导入与刷新记录" size="small">
            <n-list>
              <n-list-item v-for="line in installLines" :key="line.label">
                <n-flex vertical :size="3">
                  <n-text depth="3" style="font-size: 12px;">{{ line.label }}</n-text>
                  <n-text class="break-text">{{ line.value }}</n-text>
                </n-flex>
              </n-list-item>
            </n-list>
          </n-card>
        </n-flex>
      </div>
    </template>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NAvatar,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDivider,
  NEmpty,
  NFlex,
  NForm,
  NFormItem,
  NInput,
  NList,
  NListItem,
  NSelect,
  NSpin,
  NTag,
  NText,
  useMessage
} from 'naive-ui'

import {
  addSkill,
  getMcpServers,
  getSkills,
  getTheme,
  readSkillFile,
  readSkillIcon,
  refreshSkillFromSource,
  updateSkill
} from '@/utils/configListener'
import {
  getSkillDescription,
  getSkillFileIndex,
  getSkillScriptCatalog,
  isDirectorySkill
} from '@/utils/skillUtils'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const skills = getSkills()
const mcpServers = getMcpServers()
const theme = getTheme()

const saving = ref(false)
const refreshing = ref(false)
const loadingContent = ref(false)
const loadingPackageFile = ref(false)
const iconUrl = ref('')
const mainContent = ref('')
const selectedPackageFile = ref('')
const packageFileContent = ref('')

const form = reactive({
  name: '',
  description: '',
  content: '',
  tags: '',
  keywords: '',
  regex: '',
  intents: '',
  mcp: []
})

const isNew = computed(() => route.name === 'skillNew')
const skillId = computed(() => String(route.params.id || '').trim())
const currentSkill = computed(() => {
  if (isNew.value) return null
  return (skills.value || []).find((skill) => String(skill?._id || '') === skillId.value) || null
})
const isDirectory = computed(() => isDirectorySkill(currentSkill.value))
const isBuiltin = computed(() => currentSkill.value?.builtin === true)
const pageTitle = computed(() => isNew.value ? '新建内联技能' : currentSkill.value?.name || currentSkill.value?._id || '技能详情')
const skillInterface = computed(() => currentSkill.value?.interface && typeof currentSkill.value.interface === 'object'
  ? currentSkill.value.interface
  : {})
const currentBrandColor = computed(() => skillInterface.value.brandColor || '#64748b')
const currentInitial = computed(() => Array.from(String(pageTitle.value || 'S'))[0] || 'S')
const validationWarnings = computed(() => Array.isArray(currentSkill.value?.cache?.validationWarnings)
  ? currentSkill.value.cache.validationWarnings
  : [])
const scriptCatalog = computed(() => getSkillScriptCatalog(currentSkill.value))
const mcpOptions = computed(() => (mcpServers.value || []).map((server) => ({
  label: server.name || server._id,
  value: server._id,
  disabled: !!server.disabled
})))

const fileDetails = computed(() => Array.isArray(currentSkill.value?.cache?.fileDetails)
  ? currentSkill.value.cache.fileDetails
  : [])
const fileIndex = computed(() => getSkillFileIndex(currentSkill.value))
const fileGroups = computed(() => {
  const detailsByPath = new Map(fileDetails.value.map((item) => [item.path, item]))
  const build = (key, label, paths) => ({
    key,
    label,
    items: paths.map((path) => detailsByPath.get(path) || { path })
  })
  return [
    build('agents', 'Agent 元数据', fileIndex.value.agents),
    build('references', '参考资料', fileIndex.value.references),
    build('scripts', '脚本', fileIndex.value.scripts),
    build('assets', '资源', fileIndex.value.assets),
    build('extra', '其他文件', fileIndex.value.extra)
  ]
})
const fileGroupSummary = computed(() => fileGroups.value
  .filter((group) => group.items.length)
  .map((group) => ({ label: group.label, count: group.items.length })))
const installLines = computed(() => {
  const install = currentSkill.value?.install && typeof currentSkill.value.install === 'object'
    ? currentSkill.value.install
    : {}
  const cache = currentSkill.value?.cache && typeof currentSkill.value.cache === 'object'
    ? currentSkill.value.cache
    : {}
  const pythonDependencies = install.pythonDependencies && typeof install.pythonDependencies === 'object'
    ? install.pythonDependencies
    : null
  return [
    { label: '导入类型', value: install.type },
    { label: '原始来源', value: install.originalSourcePath || install.filePath },
    { label: '选中路径', value: install.selectedPath },
    pythonDependencies?.dependencyFile
      ? {
          label: 'Python 依赖',
          value: `${pythonDependencies.dependencyFile}（${pythonDependencies.reused ? '复用已就绪环境' : '已预装'}）`
        }
      : null,
    { label: '最近解析', value: cache.refreshedAt }
  ].filter((item) => item?.value)
})

watch(
  [isNew, currentSkill],
  async ([creating, skill]) => {
    resetForm()
    iconUrl.value = ''
    mainContent.value = ''
    clearPackageFilePreview()
    if (creating || !skill) return
    fillForm(skill)
    await Promise.all([loadMainContent(skill), loadIcon(skill)])
  },
  { immediate: true, deep: true }
)

function resetForm() {
  form.name = ''
  form.description = ''
  form.content = ''
  form.tags = ''
  form.keywords = ''
  form.regex = ''
  form.intents = ''
  form.mcp = []
}

function joinLines(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join('\n') : ''
}

function splitLines(value) {
  return Array.from(new Set(String(value || '').split(/[\n,，；;]+/).map((item) => item.trim()).filter(Boolean)))
}

function fillForm(skill) {
  const triggers = skill?.triggers && typeof skill.triggers === 'object' ? skill.triggers : {}
  form.name = String(skill?.name || '')
  form.description = getSkillDescription(skill)
  form.content = String(skill?.content || '')
  form.tags = joinLines(triggers.tags)
  form.keywords = joinLines(triggers.keywords)
  form.regex = joinLines(triggers.regex)
  form.intents = joinLines(triggers.intents)
  form.mcp = Array.isArray(skill?.mcp) ? [...skill.mcp] : []
}

async function loadMainContent(skill) {
  if (!isDirectorySkill(skill)) return
  loadingContent.value = true
  try {
    const result = await Promise.resolve(readSkillFile(skill._id, skill.entryFile || 'SKILL.md'))
    mainContent.value = String(result?.content || '')
  } catch (error) {
    mainContent.value = `读取失败：${error?.message || String(error)}`
  } finally {
    loadingContent.value = false
  }
}

async function loadIcon(skill) {
  if (!isDirectorySkill(skill)) return
  try {
    const result = await Promise.resolve(readSkillIcon(skill._id, 'large'))
    iconUrl.value = String(result?.dataUrl || '')
  } catch {
    iconUrl.value = ''
  }
}

function canPreviewPackageFile(filePath) {
  const path = String(filePath || '').trim()
  if (!path) return false
  return !/\.(?:png|jpe?g|webp|gif|avif|ico|bmp|woff2?|ttf|otf|zip|gz|7z|pdf)$/i.test(path)
}

async function loadPackageFile(filePath) {
  const path = String(filePath || '').trim()
  if (!currentSkill.value?._id || !canPreviewPackageFile(path)) return
  selectedPackageFile.value = path
  packageFileContent.value = ''
  loadingPackageFile.value = true
  try {
    const result = await Promise.resolve(readSkillFile(currentSkill.value._id, path))
    packageFileContent.value = String(result?.content || '')
  } catch (error) {
    packageFileContent.value = `读取失败：${error?.message || String(error)}`
  } finally {
    loadingPackageFile.value = false
  }
}

function clearPackageFilePreview() {
  selectedPackageFile.value = ''
  packageFileContent.value = ''
  loadingPackageFile.value = false
}

function createId() {
  try {
    return `skill_${crypto.randomUUID()}`
  } catch {
    return `skill_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  }
}

function buildBindings() {
  return {
    triggers: {
      tags: splitLines(form.tags),
      keywords: splitLines(form.keywords),
      regex: splitLines(form.regex),
      intents: splitLines(form.intents)
    },
    mcp: Array.from(new Set(form.mcp.map((item) => String(item || '').trim()).filter(Boolean)))
  }
}

async function handleSave() {
  const name = String(form.name || '').trim()
  if (!isDirectory.value && !name) {
    message.warning('名称不能为空')
    return
  }
  saving.value = true
  try {
    const bindings = buildBindings()
    if (isNew.value) {
      const id = createId()
      await Promise.resolve(addSkill({
        _id: id,
        name,
        description: String(form.description || '').trim(),
        content: String(form.content || ''),
        sourceType: 'inline',
        ...bindings
      }))
      message.success('内联技能已创建')
      await router.replace({ name: 'skillDetail', params: { id } })
      return
    }
    if (isDirectory.value) {
      await Promise.resolve(updateSkill(currentSkill.value._id, bindings))
    } else {
      await Promise.resolve(updateSkill(currentSkill.value._id, {
        name,
        description: String(form.description || '').trim(),
        content: String(form.content || ''),
        ...bindings
      }))
    }
    message.success('技能已保存')
  } catch (error) {
    console.error('[Skill] save failed', { id: currentSkill.value?._id, error })
    message.error(`保存失败：${error?.message || String(error)}`)
  } finally {
    saving.value = false
  }
}

async function handleRefresh() {
  if (!currentSkill.value?._id) return
  refreshing.value = true
  try {
    const refreshed = await Promise.resolve(refreshSkillFromSource(currentSkill.value._id))
    message.success(`已刷新：${refreshed?.name || refreshed?._id}`)
  } catch (error) {
    message.error(`刷新失败：${error?.message || String(error)}`)
  } finally {
    refreshing.value = false
  }
}

function formatBytes(value) {
  const size = Number(value) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function goBack() {
  router.push({ name: 'skill' })
}
</script>

<style scoped>
.skill-detail-page {
  width: 100%;
  padding-bottom: 28px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
  gap: 16px;
  align-items: start;
}

.skill-source {
  min-height: 260px;
  max-height: 680px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.1);
  white-space: pre-wrap;
  word-break: break-word;
  font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.package-file-preview {
  padding-top: 4px;
}

.package-file-preview__content {
  min-height: 120px;
  max-height: 420px;
  margin-top: 10px;
}

.metadata-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.metadata-row--vertical {
  align-items: flex-start;
  flex-direction: column;
}

.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}

.section-note {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
}

.break-text {
  word-break: break-all;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
