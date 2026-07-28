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
          <n-button tertiary size="small" @click="handleImportDirectory">导入目录</n-button>
          <n-button tertiary size="small" @click="handleImportSkillFile">导入 SKILL.md</n-button>
          <n-button type="primary" size="small" @click="openNewPage">新建内联技能</n-button>
        </n-flex>
      </n-flex>
      <n-text depth="3" class="hero-description">
        标准 Skill 会解析 SKILL.md、agents/openai.yaml、references、scripts 与 assets，并复制到当前数据目录托管。
        详情、绑定和文件结构统一在独立页面中管理。
      </n-text>
    </n-card>

    <n-empty v-if="!sortedSkills.length" description="暂无技能" style="margin-top: 24px;" />

    <n-flex v-else wrap :size="16" justify="flex-start" class="skill-grid">
      <n-card
        v-for="skill in sortedSkills"
        :key="skill._id"
        hoverable
        size="small"
        class="settings-grid-card skill-card"
        @click="openDetailPage(skill)"
      >
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="flex-start" :size="8">
            <n-flex align="center" :size="10" style="min-width: 0;">
              <n-avatar
                :src="iconUrls[skill._id] || undefined"
                :style="{ background: skill?.interface?.brandColor || '#64748b' }"
                round
                size="medium"
              >
                {{ getInitial(skill) }}
              </n-avatar>
              <n-flex vertical :size="2" style="min-width: 0;">
                <n-ellipsis :line-clamp="1">
                  <n-text strong style="font-size: 16px;">{{ skill.name || skill._id || '未命名技能' }}</n-text>
                </n-ellipsis>
                <n-text depth="3" style="font-size: 11px;">{{ skill.packageName || skill._id }}</n-text>
              </n-flex>
            </n-flex>
            <n-flex align="center" :size="6">
              <n-button
                v-if="isDirectorySkill(skill) && !skill.builtin"
                text
                size="small"
                title="从原始来源重新导入"
                @click.stop="handleRefresh(skill)"
              >
                刷新
              </n-button>
              <n-button
                v-if="!skill.builtin"
                text
                size="small"
                title="删除技能"
                @click.stop="confirmDelete(skill)"
              >
                <n-icon :component="Trash" size="17" />
              </n-button>
            </n-flex>
          </n-flex>

          <n-flex align="center" wrap :size="6">
            <n-tag v-if="skill.builtin" size="small" type="info" bordered>内置</n-tag>
            <n-tag size="small" :type="isDirectorySkill(skill) ? 'success' : 'default'" bordered>
              {{ isDirectorySkill(skill) ? '标准目录' : '内联' }}
            </n-tag>
            <n-tag v-if="skill.nativeActions?.length" size="small" type="warning" bordered>
              动作 {{ skill.nativeActions.length }}
            </n-tag>
            <n-tag v-if="skill.mcp?.length" size="small" bordered>MCP {{ skill.mcp.length }}</n-tag>
          </n-flex>

          <n-ellipsis v-if="getSkillDescription(skill)" :line-clamp="2" class="card-description">
            {{ getSkillDescription(skill) }}
          </n-ellipsis>
          <n-text v-if="isDirectorySkill(skill) && getSkillFileSummary(skill)" depth="3" style="font-size: 12px;">
            {{ getSkillFileSummary(skill) }}
          </n-text>
          <n-flex justify="space-between" align="center">
            <n-text depth="3" style="font-size: 11px;">
              {{ skill?.cache?.validationWarnings?.length ? `规范提示 ${skill.cache.validationWarnings.length}` : '结构已解析' }}
            </n-text>
            <n-button text type="primary" size="tiny">查看详情 →</n-button>
          </n-flex>
        </n-flex>
      </n-card>
    </n-flex>
  </n-flex>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAvatar,
  NButton,
  NCard,
  NEmpty,
  NEllipsis,
  NFlex,
  NIcon,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import { Trash } from '@vicons/fa'
import { SkillLevelIntermediate } from '@vicons/carbon'

import {
  deleteSkill,
  getSkills,
  getTheme,
  importSkillDirectory,
  importSkillFile,
  readSkillIcon,
  refreshSkillFromSource
} from '@/utils/configListener'
import {
  buildSkillFileIndexSummary,
  getSkillDescription,
  isDirectorySkill
} from '@/utils/skillUtils'

const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const skills = getSkills()
const theme = getTheme()
const iconUrls = reactive({})

const sortedSkills = computed(() => [...(skills.value || [])].sort((a, b) => {
  const builtinDiff = Number(!!b?.builtin) - Number(!!a?.builtin)
  if (builtinDiff) return builtinDiff
  const directoryDiff = Number(isDirectorySkill(b)) - Number(isDirectorySkill(a))
  if (directoryDiff) return directoryDiff
  return String(a?.name || a?._id || '').localeCompare(String(b?.name || b?._id || ''), 'zh-Hans-CN')
}))

watch(
  sortedSkills,
  async (items) => {
    const activeIds = new Set(items.map((item) => String(item?._id || '')).filter(Boolean))
    Object.keys(iconUrls).forEach((id) => {
      if (!activeIds.has(id)) delete iconUrls[id]
    })
    await Promise.all(items.map(async (skill) => {
      const id = String(skill?._id || '').trim()
      if (!id || iconUrls[id] || !isDirectorySkill(skill)) return
      try {
        const icon = await Promise.resolve(readSkillIcon(id, 'small'))
        if (icon?.dataUrl) iconUrls[id] = icon.dataUrl
      } catch {
        iconUrls[id] = ''
      }
    }))
  },
  { immediate: true, deep: true }
)

function getInitial(skill) {
  return Array.from(String(skill?.name || skill?._id || 'S').trim())[0] || 'S'
}

function getSkillFileSummary(skill) {
  return isDirectorySkill(skill) ? buildSkillFileIndexSummary(skill) : ''
}

function openNewPage() {
  router.push({ name: 'skillNew' })
}

function openDetailPage(skill) {
  const id = String(skill?._id || '').trim()
  if (id) router.push({ name: 'skillDetail', params: { id } })
}

function getUtoolsApi() {
  return window?.utools || globalThis?.utools
}

function extractDialogPath(result) {
  const value = Array.isArray(result) ? result[0] : Array.isArray(result?.filePaths) ? result.filePaths[0] : result
  if (typeof value === 'string') return value.trim()
  return String(value?.path || value?.filePath || value?.fullPath || value?.value || '').trim()
}

function openPathDialog(options) {
  const api = getUtoolsApi()
  if (!api?.showOpenDialog) throw new Error('当前环境不支持文件选择器')
  return extractDialogPath(api.showOpenDialog(options))
}

async function handleImportDirectory() {
  let sourcePath = ''
  try {
    sourcePath = openPathDialog({ title: '选择 Skill 目录', properties: ['openDirectory'] })
    if (!sourcePath) return
    const imported = await Promise.resolve(importSkillDirectory(sourcePath))
    message.success(`已导入：${imported?.name || imported?._id}`)
    openDetailPage(imported)
  } catch (error) {
    console.error('[Skill] import directory failed', { sourcePath, error })
    message.error(`导入目录失败：${error?.message || String(error)}`)
  }
}

async function handleImportSkillFile() {
  let filePath = ''
  try {
    filePath = openPathDialog({
      title: '选择 SKILL.md',
      properties: ['openFile'],
      filters: [{ name: 'Skill', extensions: ['md'] }]
    })
    if (!filePath) return
    const imported = await Promise.resolve(importSkillFile(filePath))
    message.success(`已导入：${imported?.name || imported?._id}`)
    openDetailPage(imported)
  } catch (error) {
    console.error('[Skill] import file failed', { filePath, error })
    message.error(`导入 SKILL.md 失败：${error?.message || String(error)}`)
  }
}

async function handleRefresh(skill) {
  try {
    const refreshed = await Promise.resolve(refreshSkillFromSource(skill._id))
    delete iconUrls[skill._id]
    message.success(`已刷新：${refreshed?.name || refreshed?._id || skill._id}`)
  } catch (error) {
    console.error('[Skill] refresh failed', { id: skill?._id, error })
    message.error(`刷新失败：${error?.message || String(error)}`)
  }
}

function confirmDelete(skill) {
  dialog.warning({
    title: '删除技能',
    content: `确定删除“${skill?.name || skill?._id}”吗？托管副本会随记录一起移除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await Promise.resolve(deleteSkill(skill._id))
        message.success('技能已删除')
      } catch (error) {
        message.error(`删除失败：${error?.message || String(error)}`)
      }
    }
  })
}
</script>

<style scoped>
.hero-description {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
}

.skill-grid {
  width: 100%;
  margin-top: 8px;
}

.skill-card {
  width: calc((100% - 32px) / 3);
  min-width: 300px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.skill-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.card-description {
  min-height: 40px;
  color: var(--n-text-color-3);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  .skill-card {
    width: 100%;
    min-width: 0;
  }
}
</style>
