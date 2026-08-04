<template>
  <div
    :class="[
      'tool-message',
      'chat-page',
      theme,
      {
        'is-dark': theme === 'dark',
        'is-expanded': msg.toolExpanded,
        'is-current': msg.toolActivityCurrent
      }
    ]"
    :role="msg.toolActivityCurrent ? 'status' : undefined"
    :aria-live="msg.toolActivityCurrent ? 'polite' : undefined"
  >
    <div class="tool-message__toggle" @click="actions.toggleToolExpanded(msg)">
      <n-icon
        v-if="!msg.toolActivityCurrent"
        :component="helpers.toolActivityIcon(msg)"
        size="15"
        :class="['tool-message__state-icon', { 'is-spinning': helpers.getToolMessageStatus(msg) === 'running' }]"
      />
      <n-icon
        :component="helpers.toolActivityActionIcon(msg)"
        size="15"
        class="tool-message__action-icon"
      />
      <span
        v-if="msg.toolActivityCurrent"
        class="tool-message__phase"
        :class="[
          `is-${helpers.getToolMessageStatus(msg)}`,
          { 'is-live': helpers.getToolMessageStatus(msg) === 'running' }
        ]"
      >
        {{ helpers.toolActivityPhaseLabel(msg) }}
      </span>
      <span class="tool-message__label">{{ helpers.toolMessageLabel(msg) }}</span>
      <span
        v-if="!msg.toolActivityCurrent && helpers.shouldShowToolActivityStatus(msg)"
        class="tool-message__status"
        :class="`is-${helpers.getToolMessageStatus(msg)}`"
      >
        {{ helpers.toolMessageStatusLabel(msg) }}
      </span>
      <span class="tool-message__hint">{{ msg.toolExpanded ? '收起详情' : '查看详情' }}</span>
      <n-icon
        :component="msg.toolExpanded ? ChevronUpOutline : ChevronDownOutline"
        size="14"
        class="tool-message__chevron"
      />
    </div>
    <p v-if="helpers.toolActivityMeta(msg)" class="tool-message__summary">
      {{ helpers.toolActivityMeta(msg) }}
    </p>
    <div v-if="msg.toolExpanded" class="tool-message__body">
      <div
        v-if="helpers.toolActivityToolName(msg) || helpers.toolActivitySource(msg)"
        class="tool-message__technical"
      >
        <span>技术详情</span>
        <code v-if="helpers.toolActivityToolName(msg)">{{ helpers.toolActivityToolName(msg) }}</code>
        <span v-if="helpers.toolActivitySource(msg)">{{ helpers.toolActivitySource(msg) }}</span>
      </div>
      <div v-if="previewableImages.length" class="tool-message__media">
        <div class="tool-message__media-meta">
          <span class="tool-message__media-title">相关图片</span>
          <span class="tool-message__media-count">{{ previewableImages.length }} 张</span>
          <span v-if="hiddenImageCount > 0" class="tool-message__media-note">
            另有 {{ hiddenImageCount }} 张暂不可预览
          </span>
        </div>
        <n-image-group>
          <div class="tool-message__media-grid">
            <div
              v-for="(img, index) in previewableImages"
              :key="img.id || img.src || `tool-image-${index}`"
              class="tool-message__media-item"
              :title="toolImageTitle(img, index)"
              @click.stop
            >
              <n-image
                :class="['tool-message__media-image', { 'is-dark': theme === 'dark' }]"
                :src="img.src"
                :alt="toolImageTitle(img, index)"
                :img-props="{ class: 'tool-message__media-image-el', loading: 'lazy', decoding: 'async' }"
                object-fit="contain"
              />
            </div>
          </div>
        </n-image-group>
      </div>
      <ChatAgentRunFlow
        v-if="helpers.shouldRenderHeavyChatMessage(msg) && msg.toolName === 'agent_run'"
        :msg="msg"
        :theme="theme"
        :truncate-text="helpers.truncateInlineText"
        @step-expand="actions.scheduleScrollToBottom"
      />
      <div
        v-else-if="sandboxToolPayload"
        :class="[
          'tool-message__sandbox',
          `is-${sandboxResultPresentation.status}`,
          { 'is-dark': theme === 'dark' }
        ]"
      >
        <div class="tool-message__sandbox-header">
          <div>
            <div class="tool-message__sandbox-title">
              {{ sandboxToolPayload.workspaceKind === 'host' ? '本机命令工作区' : '命令沙盒' }}
            </div>
            <div class="tool-message__sandbox-meta">
              <span v-if="sandboxToolPayload.workspaceKind === 'host'">
                工作区：{{ sandboxToolPayload.workspacePath || '用户选择的本机目录' }}
              </span>
              <span v-else>工作区：{{ sandboxToolPayload.workspaceId || 'default' }}</span>
              <span v-if="sandboxToolPayload.cwd">目录：{{ sandboxToolPayload.cwd }}</span>
              <span v-if="sandboxResultPresentation.exitCode !== null">
                退出码：{{ sandboxResultPresentation.exitCode }}
              </span>
            </div>
          </div>
          <span
            class="tool-message__sandbox-status"
            :class="`is-${sandboxResultPresentation.status}`"
          >
            {{ helpers.toolMessageStatusLabel(msg) }}
          </span>
        </div>

        <div v-if="sandboxResultPresentation.notice" class="tool-message__sandbox-notice">
          <strong>{{ sandboxResultPresentation.notice }}</strong>
          <span v-if="sandboxResultPresentation.hasPartialResult">
            下方文件变化和命令输出是停止或失败前的部分结果，不代表整条命令执行成功。
          </span>
        </div>

        <div v-if="sandboxFiles.length" class="tool-message__sandbox-files">
          <div class="tool-message__sandbox-section-title">
            {{ sandboxResultPresentation.isFailure ? '执行期间检测到的文件变化' : '本次结果文件' }}
          </div>
          <button
            v-for="file in sandboxFiles"
            :key="file.dataPath || file.path"
            type="button"
            class="tool-message__sandbox-file"
            title="单击打开；右键查看更多操作"
            @click.stop="openSandboxFile(file)"
            @contextmenu.prevent.stop="showSandboxFileMenu($event, file)"
          >
            <span class="tool-message__sandbox-file-name">{{ file.name || file.path }}</span>
            <span class="tool-message__sandbox-file-path">{{ file.path }}</span>
            <span class="tool-message__sandbox-file-size">{{ formatFileSize(file.size) }}</span>
          </button>
        </div>
        <div v-else class="tool-message__sandbox-empty">
          {{
            sandboxToolPayload.workspaceKind === 'host' && sandboxToolPayload.tracksChanges === false
              ? '本机工作区模式不自动扫描全部文件变化；命令输出仍显示在下方。'
              : '本次操作没有返回新增或修改后的文件。'
          }}
        </div>

        <details v-if="sandboxToolPayload.stdout || sandboxToolPayload.stderr" class="tool-message__sandbox-log">
          <summary>查看命令输出</summary>
          <pre v-if="sandboxToolPayload.stdout">{{ sandboxToolPayload.stdout }}</pre>
          <pre v-if="sandboxToolPayload.stderr" class="is-stderr">{{ sandboxToolPayload.stderr }}</pre>
        </details>
      </div>
      <div
        v-else-if="webToolPayload"
        :class="['tool-message__web', { 'is-dark': theme === 'dark' }]"
      >
        <template v-if="webToolPayload.kind === 'web_search_result'">
          <div class="tool-message__web-header">
            <div>
              <div class="tool-message__web-title">搜索资料</div>
              <div class="tool-message__web-meta">
                <span v-if="webToolPayload.query">关键词：{{ webToolPayload.query }}</span>
                <span>结果：{{ webSearchResults.length }} 条</span>
                <span v-if="webToolPayload.engine">来源：{{ webToolPayload.engine }}</span>
              </div>
            </div>
          </div>

          <div v-if="webToolPayload.error" class="tool-message__web-error">
            {{ webToolPayload.error }}
          </div>
          <div v-if="webSearchAttemptLines.length" class="tool-message__web-warning">
            <div class="tool-message__web-section-title">搜索源尝试</div>
            <div v-for="line in webSearchAttemptLines" :key="line">{{ line }}</div>
          </div>

          <div v-if="webSearchResults.length" class="tool-message__web-list">
            <article
              v-for="(item, index) in webSearchResults"
              :key="item.url || `${item.title}-${index}`"
              class="tool-message__web-item"
            >
              <div class="tool-message__web-item-index">{{ index + 1 }}</div>
              <div class="tool-message__web-item-body">
                <a
                  v-if="item.safeUrl"
                  class="tool-message__web-link"
                  :href="item.safeUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click="openExternalWebLink($event, item.safeUrl)"
                >
                  {{ item.title || item.safeUrl }}
                </a>
                <div v-else class="tool-message__web-link is-plain">{{ item.title || `结果 ${index + 1}` }}</div>
                <div v-if="item.safeUrl" class="tool-message__web-url">{{ item.safeUrl }}</div>
                <p v-if="item.snippet" class="tool-message__web-snippet">
                  {{ item.snippet }}
                </p>
              </div>
            </article>
          </div>
          <div v-else class="tool-message__web-empty">没有解析到可用搜索结果。</div>
        </template>

        <template v-else-if="webToolPayload.kind === 'web_read_result'">
          <div class="tool-message__web-header">
            <div>
              <div class="tool-message__web-title">{{ webToolPayload.title || '网页内容' }}</div>
              <div class="tool-message__web-meta">
                <span v-if="webToolPayload.contentType">{{ webToolPayload.contentType }}</span>
                <span v-if="webToolPayload.totalChars">正文：{{ webToolPayload.totalChars }} 字</span>
                <span v-if="webToolPayload.truncated">已截断</span>
              </div>
            </div>
          </div>

          <a
            v-if="webReadUrl"
            class="tool-message__web-source"
            :href="webReadUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click="openExternalWebLink($event, webReadUrl)"
          >
            原文链接：{{ webReadUrl }}
          </a>

          <p v-if="webToolPayload.description" class="tool-message__web-description">
            {{ webToolPayload.description }}
          </p>

          <div v-if="webToolPayload.text" class="tool-message__web-excerpt">
            <div class="tool-message__web-section-title">内容摘要</div>
            <p>{{ webReadExcerpt }}</p>
          </div>
          <div v-else class="tool-message__web-empty">没有解析到可用正文。</div>
        </template>
      </div>
      <div v-else class="tool-message__details">
        <pre v-if="msg.render === 'text'" class="chat-plain">{{ expandedDisplayContent }}</pre>
        <LazyMarkdownPreview
          v-else-if="helpers.shouldRenderHeavyChatMessage(msg)"
          :editorId="`msg-${msg.id}`"
          :modelValue="expandedDisplayContent"
          previewTheme="github"
          :theme="theme"
          :deferBlockLayout="false"
          :code-foldable="true"
          :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
        />
        <pre v-else class="chat-plain chat-plain--deferred">{{ expandedDisplayContent }}</pre>
      </div>
    </div>
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :show="sandboxFileMenu.show"
      :x="sandboxFileMenu.x"
      :y="sandboxFileMenu.y"
      :options="sandboxFileMenuOptions"
      @clickoutside="closeSandboxFileMenu"
      @select="handleSandboxFileMenuSelect"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { NDropdown, NIcon, NImage, NImageGroup, useMessage } from 'naive-ui'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import { CHAT_CODE_AUTO_FOLD_THRESHOLD } from '@/utils/chatMarkdownPreview'
import { collectSandboxFileCatalog } from '@/utils/chatSandboxFileLink.js'
import {
  getSandboxToolResultPresentation,
  stripToolIdentityFromDisplayContent
} from '@/utils/chatToolDisplay'
import { ChevronDownOutline, ChevronUpOutline } from '@vicons/ionicons5'
import ChatAgentRunFlow from './ChatAgentRunFlow.vue'
import { copyTextToClipboard } from '@/utils/clipboard'
import { getSafeExternalUrl, safeOpenExternal } from '@/utils/safeOpenExternal'

const props = defineProps({
  msg: {
    type: Object,
    required: true
  },
  theme: {
    type: String,
    default: 'light'
  },
  helpers: {
    type: Object,
    required: true
  },
  actions: {
    type: Object,
    required: true
  }
})

const toolImages = computed(() => (Array.isArray(props.msg?.images) ? props.msg.images : []))
const message = useMessage()
const previewableImages = computed(() =>
  toolImages.value.filter((img) => String(img?.src || '').trim())
)
const hiddenImageCount = computed(() => Math.max(0, toolImages.value.length - previewableImages.value.length))
const expandedDisplayContent = computed(() =>
  stripToolIdentityFromDisplayContent(props.msg?.content)
)
const webToolPayload = computed(() => {
  const payload = props.msg?.toolResultPayload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const kind = String(payload.kind || '').trim()
  return kind === 'web_search_result' || kind === 'web_read_result' ? payload : null
})
const webSearchResults = computed(() => {
  if (webToolPayload.value?.kind !== 'web_search_result') return []
  return (Array.isArray(webToolPayload.value.results) ? webToolPayload.value.results : [])
    .map((item) => {
      const rawUrl = String(item?.url || '').trim()
      return {
        ...(item && typeof item === 'object' ? item : {}),
        safeUrl: getSafeExternalUrl(rawUrl)?.toString() || ''
      }
    })
})
const webSearchAttemptLines = computed(() => {
  if (webToolPayload.value?.kind !== 'web_search_result') return []
  const attempts = Array.isArray(webToolPayload.value.attempts) ? webToolPayload.value.attempts : []
  return attempts.map((attempt) => {
    const engine = String(attempt?.engine || '').trim() || 'unknown'
    if (attempt?.ok) return `${engine}：成功，解析到 ${Number(attempt?.resultCount) || 0} 条`
    return `${engine}：${String(attempt?.error || '未解析到结果').trim()}`
  }).filter(Boolean)
})
const webReadUrl = computed(() => {
  if (webToolPayload.value?.kind !== 'web_read_result') return ''
  const rawUrl = String(webToolPayload.value.finalUrl || webToolPayload.value.url || '').trim()
  return getSafeExternalUrl(rawUrl)?.toString() || ''
})
const webReadExcerpt = computed(() => {
  const text = String(webToolPayload.value?.text || '').trim()
  return typeof props.helpers?.truncateInlineText === 'function'
    ? props.helpers.truncateInlineText(text, 1800)
    : text.slice(0, 1800)
})
const sandboxToolPayload = computed(() => {
  const payload = props.msg?.toolResultPayload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const kind = String(payload.kind || '').trim()
  return kind.startsWith('sandbox_') ? payload : null
})
const sandboxResultPresentation = computed(() => getSandboxToolResultPresentation(
  sandboxToolPayload.value,
  props.helpers?.getToolMessageStatus?.(props.msg)
))
const sandboxFiles = computed(() => {
  return collectSandboxFileCatalog([props.msg])
})
const sandboxFileMenu = ref({
  show: false,
  x: 0,
  y: 0,
  file: null
})
const sandboxFileMenuOptions = [
  { label: '打开文件', key: 'open' },
  { label: '在文件夹中显示', key: 'show-in-folder' },
  { label: '另存为…', key: 'save-as' },
  { type: 'divider' },
  { label: '复制沙盒相对路径', key: 'copy-path' }
]

function toolImageTitle(img, index) {
  const name = String(img?.name || '').trim() || `image-${index + 1}`
  return name
}

function formatFileSize(value) {
  const size = Math.max(0, Number(value) || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function openExternalWebLink(event, href) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  safeOpenExternal(href)
}

function closeSandboxFileMenu() {
  sandboxFileMenu.value.show = false
}

function showSandboxFileMenu(event, file) {
  sandboxFileMenu.value = {
    show: false,
    x: event.clientX,
    y: event.clientY,
    file
  }
  window.setTimeout(() => {
    sandboxFileMenu.value.show = true
  }, 0)
}

async function openSandboxFile(file) {
  const dataPath = String(file?.dataPath || '').trim()
  if (!dataPath && String(file?.workspaceKind || '').trim() !== 'host') return
  try {
    await props.actions.openChatWorkspaceResultFile(file)
  } catch (error) {
    message.error(`打开文件失败：${error?.message || String(error)}`)
  }
}

async function handleSandboxFileMenuSelect(key) {
  const file = sandboxFileMenu.value.file
  closeSandboxFileMenu()
  const dataPath = String(file?.dataPath || '').trim()
  if (!dataPath && String(file?.workspaceKind || '').trim() !== 'host') return

  try {
    if (key === 'open') {
      await props.actions.openChatWorkspaceResultFile(file)
      return
    }
    if (key === 'show-in-folder') {
      await props.actions.showChatWorkspaceResultFile(file)
      return
    }
    if (key === 'save-as') {
      const result = await props.actions.saveChatWorkspaceResultFile(file, {
        suggestedName: file?.name || 'sandbox-output'
      })
      if (!result?.canceled) message.success('文件已保存')
      return
    }
    if (key === 'copy-path') {
      await copyTextToClipboard(String(file?.path || dataPath), {
        onSuccess: () => message.success('已复制沙盒相对路径'),
        onUnsupported: () => message.warning('当前环境不支持剪贴板复制'),
        onError: (error) => message.error(`复制失败：${error?.message || String(error)}`)
      })
    }
  } catch (error) {
    message.error(`文件操作失败：${error?.message || String(error)}`)
  }
}
</script>

<style scoped>
.tool-message {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-message.is-expanded {
  width: min(100%, 780px);
  max-width: 100%;
  padding: 9px 10px 10px;
  overflow: clip;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.20);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.72);
  box-shadow: 0 5px 16px rgba(15, 23, 42, 0.04);
}

.tool-message.is-expanded.is-dark {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.44);
  box-shadow: 0 7px 20px rgba(2, 6, 23, 0.14);
}

.tool-message.is-current {
  width: min(100%, 780px);
  max-width: 100%;
  padding: 9px 10px 10px;
  overflow: clip;
  box-sizing: border-box;
  border: 1px solid rgba(14, 165, 233, 0.24);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(248, 250, 252, 0.78));
  box-shadow: 0 7px 20px rgba(14, 116, 144, 0.07);
}

.tool-message.is-current.is-dark {
  border-color: rgba(56, 189, 248, 0.28);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(15, 23, 42, 0.52));
  box-shadow: 0 8px 22px rgba(2, 6, 23, 0.18);
}

.tool-message__toggle {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  line-height: 1.2;
  color: rgba(0, 0, 0, 0.65);
}

.tool-message__state-icon {
  flex: 0 0 auto;
  opacity: 0.82;
}

.tool-message__state-icon.is-spinning {
  animation: tool-message-icon-spin 0.9s linear infinite;
}

.tool-message__action-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  color: rgb(3, 105, 161);
  background: rgba(14, 165, 233, 0.11);
}

.tool-message.is-dark .tool-message__action-icon {
  color: rgb(125, 211, 252);
  background: rgba(56, 189, 248, 0.14);
}

@keyframes tool-message-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

.tool-message.is-dark .tool-message__toggle,
:deep(.chat-page.dark) .tool-message__toggle {
  color: rgba(255, 255, 255, 0.78);
}

.tool-message__label {
  font-weight: 600;
  flex: 0 0 auto;
  min-width: 0;
  white-space: nowrap;
}

.tool-message__phase {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  color: rgb(3, 105, 161);
  background: rgba(14, 165, 233, 0.12);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.tool-message__phase::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.tool-message__phase.is-live::before {
  animation: tool-message-phase-pulse 1.4s ease-in-out infinite;
}

.tool-message.is-dark .tool-message__phase {
  color: rgb(125, 211, 252);
  background: rgba(56, 189, 248, 0.14);
}

.tool-message__phase.is-error,
.tool-message__phase.is-stopped,
.tool-message__phase.is-rejected {
  color: rgb(180, 83, 9);
  background: rgba(245, 158, 11, 0.14);
}

.tool-message.is-dark .tool-message__phase.is-error,
.tool-message.is-dark .tool-message__phase.is-stopped,
.tool-message.is-dark .tool-message__phase.is-rejected {
  color: rgb(253, 230, 138);
  background: rgba(245, 158, 11, 0.16);
}

@keyframes tool-message-phase-pulse {
  50% {
    opacity: 0.35;
    transform: scale(0.72);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-message__phase.is-live::before {
    animation: none;
  }
}

.tool-message__tool-name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 220px;
  padding: 1px 5px;
  border-radius: 5px;
  color: inherit;
  background: rgba(100, 116, 139, 0.10);
  font-family: var(--code-font-family, "Fira Code", monospace);
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message__source {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 190px;
  opacity: 0.62;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message__source::before {
  content: "·";
  margin-right: 6px;
}

.tool-message__status {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: rgba(0, 0, 0, 0.05);
}

.tool-message__status.is-running {
  color: rgb(180, 83, 9);
  background: rgba(245, 166, 35, 0.14);
}

.tool-message__status.is-paused {
  color: rgb(180, 83, 9);
  background: rgba(224, 168, 63, 0.14);
}

.tool-message__status.is-stopped {
  color: rgb(71, 85, 105);
  background: rgba(100, 116, 139, 0.12);
}

.tool-message__status.is-error {
  color: rgb(208, 48, 80);
  background: rgba(208, 48, 80, 0.10);
}

.tool-message__status.is-rejected {
  color: rgb(71, 85, 105);
  background: rgba(100, 116, 139, 0.12);
}

.tool-message__hint {
  margin-left: auto;
  flex: 0 0 auto;
  opacity: 0.7;
  font-size: 12px;
  white-space: nowrap;
}

.tool-message__chevron {
  flex: 0 0 auto;
  opacity: 0.56;
}

.tool-message__summary {
  margin: 5px 20px 0;
  color: rgba(71, 85, 105, 0.82);
  font-size: 11px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message.is-dark .tool-message__summary {
  color: rgba(203, 213, 225, 0.72);
}

.tool-message__technical {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  color: rgba(71, 85, 105, 0.66);
  font-size: 10px;
  line-height: 1.4;
}

.tool-message__technical code {
  max-width: 100%;
  padding: 1px 5px;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(100, 116, 139, 0.09);
  color: inherit;
  font-family: var(--code-font-family, "Fira Code", monospace);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message.is-dark .tool-message__technical {
  color: rgba(203, 213, 225, 0.62);
}

.tool-message__body {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin-top: 9px;
  padding-top: 9px;
  overflow: visible;
  box-sizing: border-box;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.tool-message.is-dark .tool-message__body {
  border-top-color: rgba(148, 163, 184, 0.14);
}

.tool-message__details {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  box-sizing: border-box;
}

.tool-message__details :deep(.markdown-preview-renderer),
.tool-message__details :deep(.md-editor),
.tool-message__details :deep(.md-editor-content),
.tool-message__details :deep(.md-editor-preview-wrapper),
.tool-message__details :deep(.md-editor-preview) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.tool-message__details :deep(h4) {
  margin: 8px 0 6px;
  color: rgba(51, 65, 85, 0.88);
  font-size: 12px;
  line-height: 1.45;
}

.tool-message.is-dark .tool-message__details :deep(h4) {
  color: rgba(226, 232, 240, 0.84);
}

.tool-message__details :deep(pre) {
  width: 100%;
  max-width: 100%;
  max-height: min(720px, 68vh);
  margin: 6px 0 8px;
  overflow: auto;
  box-sizing: border-box;
  border-radius: 8px;
  font-size: 11px;
}

.tool-message__details :deep(.md-editor-code) {
  width: 100%;
  max-width: 100%;
  max-height: min(720px, 68vh);
  overflow: auto;
  box-sizing: border-box;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.tool-message__details :deep(.md-editor-code pre) {
  width: max-content;
  min-width: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  overflow: visible;
}

.tool-message__details :deep(.language-json),
.tool-message__details :deep(code.language-json) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.tool-message__sandbox {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(16, 185, 129, 0.18);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.9), rgba(248, 250, 252, 0.92));
}

.tool-message__sandbox.is-dark {
  border-color: rgba(52, 211, 153, 0.2);
  background: linear-gradient(180deg, rgba(6, 78, 59, 0.36), rgba(15, 23, 42, 0.72));
}

.tool-message__sandbox-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tool-message__sandbox-status {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  color: rgb(4, 120, 87);
  background: rgba(16, 185, 129, 0.12);
  font-size: 11px;
  font-weight: 700;
}

.tool-message__sandbox-status.is-error {
  color: rgb(190, 18, 60);
  background: rgba(244, 63, 94, 0.12);
}

.tool-message__sandbox-status.is-stopped,
.tool-message__sandbox-status.is-rejected {
  color: rgb(180, 83, 9);
  background: rgba(245, 158, 11, 0.14);
}

.tool-message__sandbox.is-dark .tool-message__sandbox-status {
  color: rgba(167, 243, 208, 0.96);
  background: rgba(16, 185, 129, 0.18);
}

.tool-message__sandbox.is-dark .tool-message__sandbox-status.is-error {
  color: rgba(254, 205, 211, 0.96);
  background: rgba(244, 63, 94, 0.2);
}

.tool-message__sandbox.is-dark .tool-message__sandbox-status.is-stopped,
.tool-message__sandbox.is-dark .tool-message__sandbox-status.is-rejected {
  color: rgba(253, 230, 138, 0.96);
  background: rgba(245, 158, 11, 0.2);
}

.tool-message__sandbox-notice {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid rgba(244, 63, 94, 0.16);
  border-radius: 9px;
  color: rgb(159, 18, 57);
  background: rgba(255, 241, 242, 0.76);
  font-size: 12px;
  line-height: 1.5;
}

.tool-message__sandbox-notice span {
  color: rgba(159, 18, 57, 0.78);
}

.tool-message__sandbox-title,
.tool-message__sandbox-section-title {
  color: rgba(15, 23, 42, 0.88);
  font-size: 13px;
  font-weight: 700;
}

.tool-message__sandbox.is-dark .tool-message__sandbox-title,
.tool-message__sandbox.is-dark .tool-message__sandbox-section-title {
  color: rgba(226, 232, 240, 0.94);
}

.tool-message__sandbox-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 4px;
  color: rgba(71, 85, 105, 0.82);
  font-size: 11px;
}

.tool-message__sandbox.is-dark .tool-message__sandbox-meta {
  color: rgba(203, 213, 225, 0.76);
}

.tool-message__sandbox-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-message__sandbox-file {
  display: grid;
  grid-template-columns: minmax(120px, 0.7fr) minmax(160px, 1.3fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(16, 185, 129, 0.14);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.76);
  color: rgba(15, 23, 42, 0.84);
  text-align: left;
  cursor: pointer;
}

.tool-message__sandbox-file:hover {
  border-color: rgba(16, 185, 129, 0.32);
  background: rgba(255, 255, 255, 0.94);
}

.tool-message__sandbox.is-dark .tool-message__sandbox-file {
  border-color: rgba(52, 211, 153, 0.16);
  background: rgba(15, 23, 42, 0.52);
  color: rgba(226, 232, 240, 0.9);
}

.tool-message__sandbox-file-name {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message__sandbox-file-path {
  overflow: hidden;
  opacity: 0.7;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-message__sandbox-file-size {
  opacity: 0.64;
  font-size: 11px;
  white-space: nowrap;
}

.tool-message__sandbox-empty {
  color: rgba(71, 85, 105, 0.8);
  font-size: 12px;
}

.tool-message__sandbox.is-dark .tool-message__sandbox-empty {
  color: rgba(203, 213, 225, 0.72);
}

.tool-message__sandbox-log summary {
  color: rgba(71, 85, 105, 0.82);
  cursor: pointer;
  font-size: 12px;
}

.tool-message__sandbox-log pre {
  max-height: 260px;
  margin: 8px 0 0;
  overflow: auto;
  padding: 9px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-message__sandbox-log pre.is-stderr {
  color: rgb(190, 18, 60);
}

.tool-message__sandbox.is-error {
  border-color: rgba(244, 63, 94, 0.22);
  background: linear-gradient(180deg, rgba(255, 241, 242, 0.9), rgba(248, 250, 252, 0.92));
}

.tool-message__sandbox.is-stopped,
.tool-message__sandbox.is-rejected {
  border-color: rgba(245, 158, 11, 0.24);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.9), rgba(248, 250, 252, 0.92));
}

.tool-message__sandbox.is-error .tool-message__sandbox-file {
  border-color: rgba(244, 63, 94, 0.15);
}

.tool-message__sandbox.is-stopped .tool-message__sandbox-file,
.tool-message__sandbox.is-rejected .tool-message__sandbox-file {
  border-color: rgba(245, 158, 11, 0.17);
}

.tool-message__sandbox.is-dark.is-error {
  border-color: rgba(251, 113, 133, 0.26);
  background: linear-gradient(180deg, rgba(76, 5, 25, 0.42), rgba(15, 23, 42, 0.72));
}

.tool-message__sandbox.is-dark.is-stopped,
.tool-message__sandbox.is-dark.is-rejected {
  border-color: rgba(251, 191, 36, 0.26);
  background: linear-gradient(180deg, rgba(69, 26, 3, 0.4), rgba(15, 23, 42, 0.72));
}

.tool-message__sandbox.is-dark .tool-message__sandbox-notice {
  border-color: rgba(251, 113, 133, 0.22);
  color: rgba(254, 205, 211, 0.96);
  background: rgba(76, 5, 25, 0.38);
}

.tool-message__sandbox.is-dark .tool-message__sandbox-notice span {
  color: rgba(254, 205, 211, 0.76);
}

.tool-message__web {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(14, 165, 233, 0.16);
  background: linear-gradient(180deg, rgba(240, 249, 255, 0.92), rgba(248, 250, 252, 0.9));
}

.tool-message__web.is-dark {
  border-color: rgba(125, 211, 252, 0.18);
  background: linear-gradient(180deg, rgba(8, 47, 73, 0.42), rgba(15, 23, 42, 0.72));
}

.tool-message__web-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.tool-message__web-title {
  color: rgba(15, 23, 42, 0.88);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
}

.tool-message__web.is-dark .tool-message__web-title {
  color: rgba(226, 232, 240, 0.94);
}

.tool-message__web-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  color: rgba(71, 85, 105, 0.88);
  font-size: 11px;
  line-height: 1.35;
}

.tool-message__web.is-dark .tool-message__web-meta {
  color: rgba(203, 213, 225, 0.78);
}

.tool-message__web-error,
.tool-message__web-empty {
  color: rgb(208, 48, 80);
  font-size: 12px;
  line-height: 1.5;
}

.tool-message__web-warning {
  color: rgba(71, 85, 105, 0.88);
  font-size: 11px;
  line-height: 1.5;
}

.tool-message__web.is-dark .tool-message__web-warning {
  color: rgba(203, 213, 225, 0.78);
}

.tool-message__web-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-message__web-item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.1);
}

.tool-message__web.is-dark .tool-message__web-item {
  background: rgba(15, 23, 42, 0.5);
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.12);
}

.tool-message__web-item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 8px;
  color: rgb(8, 145, 178);
  background: rgba(14, 165, 233, 0.12);
  font-size: 11px;
  font-weight: 700;
}

.tool-message__web-link,
.tool-message__web-source {
  color: rgb(3, 105, 161);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  text-decoration: none;
  word-break: break-word;
}

.tool-message__web.is-dark .tool-message__web-link,
.tool-message__web.is-dark .tool-message__web-source {
  color: rgb(125, 211, 252);
}

.tool-message__web-link:hover,
.tool-message__web-source:hover {
  text-decoration: underline;
}

.tool-message__web-link.is-plain {
  color: rgba(15, 23, 42, 0.84);
}

.tool-message__web-url {
  margin-top: 2px;
  color: rgba(71, 85, 105, 0.78);
  font-size: 11px;
  line-height: 1.35;
  word-break: break-all;
}

.tool-message__web.is-dark .tool-message__web-url {
  color: rgba(203, 213, 225, 0.68);
}

.tool-message__web-snippet,
.tool-message__web-description,
.tool-message__web-excerpt p {
  margin: 6px 0 0;
  color: rgba(15, 23, 42, 0.8);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-message__web.is-dark .tool-message__web-snippet,
.tool-message__web.is-dark .tool-message__web-description,
.tool-message__web.is-dark .tool-message__web-excerpt p {
  color: rgba(226, 232, 240, 0.82);
}

.tool-message__web-source {
  display: block;
  font-size: 12px;
}

.tool-message__web-section-title {
  margin-top: 2px;
  color: rgba(15, 23, 42, 0.78);
  font-size: 12px;
  font-weight: 700;
}

.tool-message__web.is-dark .tool-message__web-section-title {
  color: rgba(226, 232, 240, 0.88);
}

.tool-message__media {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.92));
}

.tool-message.is-dark .tool-message__media,
:deep(.chat-page.dark) .tool-message__media {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.74), rgba(30, 41, 59, 0.72));
}

.tool-message__media-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  font-size: 11px;
  line-height: 1.4;
}

.tool-message__media-title {
  font-weight: 700;
  color: rgba(15, 23, 42, 0.82);
}

.tool-message.is-dark .tool-message__media-title,
:deep(.chat-page.dark) .tool-message__media-title {
  color: rgba(226, 232, 240, 0.88);
}

.tool-message__media-count {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: rgb(8, 145, 178);
  font-weight: 600;
}

.tool-message.is-dark .tool-message__media-count,
:deep(.chat-page.dark) .tool-message__media-count {
  background: rgba(56, 189, 248, 0.16);
  color: rgb(103, 232, 249);
}

.tool-message__media-note {
  opacity: 0.72;
}

.tool-message__media-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tool-message__media-item {
  flex: 0 0 auto;
  width: 96px;
  border-radius: 12px;
  overflow: hidden;
  cursor: zoom-in;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(226, 232, 240, 0.92));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.14);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.tool-message.is-dark .tool-message__media-item,
:deep(.chat-page.dark) .tool-message__media-item {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.84));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
}

.tool-message__media-item:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 1px rgba(56, 189, 248, 0.24),
    0 8px 18px rgba(15, 23, 42, 0.08);
}

.tool-message.is-dark .tool-message__media-item:hover,
:deep(.chat-page.dark) .tool-message__media-item:hover {
  box-shadow:
    inset 0 0 0 1px rgba(103, 232, 249, 0.22),
    0 10px 20px rgba(2, 6, 23, 0.22);
}

.tool-message__media-image {
  display: block;
  width: 96px;
  height: 72px;
}

.tool-message__media-image.is-dark {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
}

.tool-message__media-image :deep(img),
.tool-message__media-image :deep(.tool-message__media-image-el),
.tool-message__media-image :deep(.n-image-placeholder),
.tool-message__media-image :deep(.n-image-error) {
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
}

.tool-message.is-dark .tool-message__media-image :deep(.n-image-placeholder),
.tool-message.is-dark .tool-message__media-image :deep(.n-image-error),
.tool-message__media-image.is-dark :deep(.n-image-placeholder),
.tool-message__media-image.is-dark :deep(.n-image-error) {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
}

@media (max-width: 720px) {
  .tool-message__media {
    padding: 8px;
  }

  .tool-message__media-grid {
    gap: 6px;
  }

  .tool-message__media-item,
  .tool-message__media-image {
    width: 84px;
  }

  .tool-message__media-image {
    height: 64px;
  }
}
</style>
