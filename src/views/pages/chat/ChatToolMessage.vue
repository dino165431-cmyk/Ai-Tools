<template>
  <div :class="['tool-message', 'chat-page', theme, { 'is-dark': theme === 'dark' }]">
    <div class="tool-message__toggle" @click="actions.toggleToolExpanded(msg)">
      <n-icon :component="msg.toolExpanded ? ChevronUpOutline : ChevronDownOutline" size="14" />
      <span class="tool-message__label">{{ helpers.toolMessageLabel(msg) }}</span>
      <span class="tool-message__status" :class="`is-${helpers.getToolMessageStatus(msg)}`">{{ helpers.toolMessageStatusLabel(msg) }}</span>
      <span v-if="msg.toolSubMeta" class="tool-message__submeta">{{ msg.toolSubMeta }}</span>
      <span v-if="msg.toolMeta" class="tool-message__meta">{{ msg.toolMeta }}</span>
      <span class="tool-message__hint">{{ msg.toolExpanded ? '点击收起' : '点击展开' }}</span>
    </div>
    <div v-if="msg.toolExpanded" class="tool-message__body">
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
                :img-props="{ class: 'tool-message__media-image-el' }"
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
                  v-if="item.url"
                  class="tool-message__web-link"
                  :href="item.url"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ item.title || item.url }}
                </a>
                <div v-else class="tool-message__web-link is-plain">{{ item.title || `结果 ${index + 1}` }}</div>
                <div v-if="item.url" class="tool-message__web-url">{{ item.url }}</div>
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
            rel="noreferrer"
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
      <template v-else>
        <pre v-if="msg.render === 'text'" class="chat-plain">{{ msg.content }}</pre>
        <LazyMarkdownPreview
          v-else-if="helpers.shouldRenderHeavyChatMessage(msg)"
          :editorId="`msg-${msg.id}`"
          :modelValue="msg.content"
          previewTheme="github"
          :theme="theme"
          :code-foldable="true"
          :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
        />
        <pre v-else class="chat-plain chat-plain--deferred">{{ msg.content }}</pre>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NIcon, NImage, NImageGroup } from 'naive-ui'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import { CHAT_CODE_AUTO_FOLD_THRESHOLD } from '@/utils/chatMarkdownPreview'
import { ChevronDownOutline, ChevronUpOutline } from '@vicons/ionicons5'
import ChatAgentRunFlow from './ChatAgentRunFlow.vue'

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
const previewableImages = computed(() =>
  toolImages.value.filter((img) => String(img?.src || '').trim())
)
const hiddenImageCount = computed(() => Math.max(0, toolImages.value.length - previewableImages.value.length))
const webToolPayload = computed(() => {
  const payload = props.msg?.toolResultPayload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const kind = String(payload.kind || '').trim()
  return kind === 'web_search_result' || kind === 'web_read_result' ? payload : null
})
const webSearchResults = computed(() => {
  if (webToolPayload.value?.kind !== 'web_search_result') return []
  return Array.isArray(webToolPayload.value.results) ? webToolPayload.value.results : []
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
  return String(webToolPayload.value.finalUrl || webToolPayload.value.url || '').trim()
})
const webReadExcerpt = computed(() => {
  const text = String(webToolPayload.value?.text || '').trim()
  return typeof props.helpers?.truncateInlineText === 'function'
    ? props.helpers.truncateInlineText(text, 1800)
    : text.slice(0, 1800)
})

function toolImageTitle(img, index) {
  const name = String(img?.name || '').trim() || `image-${index + 1}`
  return name
}
</script>

<style scoped>
.tool-message__toggle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  line-height: 1.2;
  color: rgba(0, 0, 0, 0.65);
}

.tool-message.is-dark .tool-message__toggle,
:deep(.chat-page.dark) .tool-message__toggle {
  color: rgba(255, 255, 255, 0.78);
}

.tool-message__label {
  font-weight: 600;
}

.tool-message__status {
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

.tool-message__status.is-success {
  color: rgb(8, 145, 178);
  background: rgba(14, 165, 233, 0.12);
}

.tool-message__status.is-error {
  color: rgb(208, 48, 80);
  background: rgba(208, 48, 80, 0.10);
}

.tool-message__status.is-rejected {
  color: rgb(71, 85, 105);
  background: rgba(100, 116, 139, 0.12);
}

.tool-message__submeta {
  opacity: 0.82;
  font-size: 12px;
  font-weight: 500;
}

.tool-message__meta {
  opacity: 0.75;
  font-size: 12px;
}

.tool-message__hint {
  margin-left: auto;
  opacity: 0.7;
  font-size: 12px;
}

.tool-message__body {
  margin-top: 8px;
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
