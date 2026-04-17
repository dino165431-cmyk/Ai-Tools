<template>
  <div :class="['assistant-media', 'chat-page', theme, { 'is-dark': theme === 'dark' }]">
    <div v-if="msg.imageTask && !msg.imageBubblePlaceholder" class="assistant-image-task">
      <div class="assistant-image-block__header">
        <div class="assistant-image-block__titles">
          <div class="assistant-image-block__eyebrow">图片任务</div>
          <div class="assistant-image-block__title">{{ helpers.assistantImageTaskTitle(msg) }}</div>
        </div>
        <n-tag class="assistant-media-tag assistant-media-tag--task" size="small" :bordered="false" :type="helpers.assistantImageTaskTagType(msg)">
          {{ helpers.assistantImageTaskStatusLabel(msg) }}
        </n-tag>
      </div>
      <div v-if="helpers.assistantImagePromptLabel(msg)" class="assistant-image-block__prompt">
        {{ helpers.assistantImagePromptLabel(msg) }}
      </div>
      <div v-if="helpers.assistantImageTaskMetaLabel(msg)" class="assistant-image-task__meta">
        {{ helpers.assistantImageTaskMetaLabel(msg) }}
      </div>
      <div v-if="helpers.assistantImageTaskNote(msg)" class="assistant-image-task__note">
        {{ helpers.assistantImageTaskNote(msg) }}
      </div>
    </div>

    <div v-if="visibleImages.length" class="assistant-image-block">
      <div class="assistant-image-block__header">
        <div class="assistant-image-block__titles">
          <div class="assistant-image-block__eyebrow">{{ helpers.assistantImageBlockEyebrow(msg) }}</div>
          <div class="assistant-image-block__title">{{ helpers.assistantImageDisplayTitle(msg) }}</div>
        </div>
        <n-tag class="assistant-media-tag" size="small" :bordered="false" :type="visibleImagesCount ? 'success' : 'warning'">
          {{ visibleImagesCount ? `${visibleImagesCount} 张图片` : '占位中' }}
        </n-tag>
      </div>
      <div v-if="helpers.assistantImagePromptLabel(msg)" class="assistant-image-block__prompt">
        {{ helpers.assistantImagePromptLabel(msg) }}
      </div>
      <div class="chat-image-grid chat-image-grid--assistant">
        <n-image-group>
          <div
            v-for="img in visibleImages"
            :key="img.id"
            :class="[
              'chat-image-item',
              'chat-image-item--assistant',
              { 'chat-image-item--placeholder': !img.src }
            ]"
            @click.stop
          >
            <div class="chat-image-frame chat-image-frame--assistant">
              <n-image
                v-if="img.src"
                :class="['chat-image-viewer', 'chat-image-viewer--assistant', { 'is-dark': theme === 'dark' }]"
                :src="img.src"
                :alt="img.name || 'image'"
                :img-props="{ class: 'chat-image-viewer__img' }"
                width="240"
                object-fit="cover"
              />
              <div v-else class="chat-image-placeholder chat-image-placeholder--assistant">
                <span class="chat-image-placeholder__label">
                  {{ helpers.assistantImagePlaceholderText(msg, img) }}
                </span>
              </div>
            </div>
            <div
              :class="[
                'chat-image-caption',
                'chat-image-caption--assistant',
                { 'chat-image-caption--placeholder': !img.src }
              ]"
            >
              <div class="chat-image-name">{{ img.name || 'image' }}</div>
              <div v-if="helpers.imageMetaLabel(img)" class="chat-image-meta-line">{{ helpers.imageMetaLabel(img) }}</div>
              <div v-if="helpers.assistantImageInsightLabel(msg, img)" class="chat-image-note">{{ helpers.assistantImageInsightLabel(msg, img) }}</div>
            </div>
            <n-flex v-if="img.src" justify="flex-end" align="center" :size="6" class="chat-image-actions">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" tertiary circle @click.stop="actions.copyChatImage(img)">
                    <template #icon>
                      <n-icon :component="CopyOutline" size="14" />
                    </template>
                  </n-button>
                </template>
                复制图片
              </n-tooltip>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" tertiary circle @click.stop="actions.downloadChatImage(img)">
                    <template #icon>
                      <n-icon :component="DownloadOutline" size="14" />
                    </template>
                  </n-button>
                </template>
                下载
              </n-tooltip>
            </n-flex>
          </div>
        </n-image-group>
      </div>
    </div>

    <div v-if="visibleVideos.length" class="assistant-image-block assistant-video-block">
      <div class="assistant-image-block__header">
        <div class="assistant-image-block__titles">
          <div class="assistant-image-block__eyebrow">{{ helpers.assistantVideoBlockEyebrow(msg) }}</div>
          <div class="assistant-image-block__title">{{ helpers.assistantVideoDisplayTitle(msg) }}</div>
        </div>
        <n-tag class="assistant-media-tag assistant-media-tag--video" size="small" :bordered="false" :type="visibleVideosCount ? 'success' : 'warning'">
          {{ visibleVideosCount ? `${visibleVideosCount} 个视频` : '占位中' }}
        </n-tag>
      </div>
      <div v-if="helpers.assistantVideoPromptLabel(msg)" class="assistant-image-block__prompt">
        {{ helpers.assistantVideoPromptLabel(msg) }}
      </div>
      <div class="chat-image-grid chat-image-grid--assistant">
        <div
          v-for="video in visibleVideos"
          :key="video.id"
          :class="[
            'chat-image-item',
            'chat-image-item--assistant',
            { 'chat-image-item--placeholder': !video.src }
          ]"
          @click.stop
        >
          <div class="chat-image-frame chat-image-frame--assistant chat-video-frame--assistant">
            <video
              v-if="video.src"
              :class="['chat-video-player', { 'is-dark': theme === 'dark' }]"
              :src="video.src"
              controls
              preload="metadata"
              playsinline
            />
            <div v-else class="chat-image-placeholder chat-image-placeholder--assistant">
              <span class="chat-image-placeholder__label">
                {{ helpers.assistantVideoPlaceholderText(msg, video) }}
              </span>
            </div>
          </div>
          <div
            :class="[
              'chat-image-caption',
              'chat-image-caption--assistant',
              { 'chat-image-caption--placeholder': !video.src }
            ]"
          >
            <div class="chat-image-name">{{ video.name || 'video' }}</div>
            <div v-if="helpers.videoMetaLabel(video)" class="chat-image-meta-line">{{ helpers.videoMetaLabel(video) }}</div>
            <div v-if="helpers.assistantVideoInsightLabel(msg, video)" class="chat-image-note">{{ helpers.assistantVideoInsightLabel(msg, video) }}</div>
          </div>
          <n-flex v-if="video.src" justify="flex-end" align="center" :size="6" class="chat-image-actions">
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button size="tiny" tertiary circle @click.stop="actions.copyChatVideo(video)">
                  <template #icon>
                    <n-icon :component="CopyOutline" size="14" />
                  </template>
                </n-button>
              </template>
              复制视频链接
            </n-tooltip>
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button size="tiny" tertiary circle @click.stop="actions.downloadChatVideo(video)">
                  <template #icon>
                    <n-icon :component="DownloadOutline" size="14" />
                  </template>
                </n-button>
              </template>
              下载
            </n-tooltip>
          </n-flex>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NButton, NFlex, NIcon, NImage, NImageGroup, NTag, NTooltip } from 'naive-ui'
import { CopyOutline, DownloadOutline } from '@vicons/ionicons5'

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

const visibleImages = computed(() => props.helpers.assistantVisibleImages(props.msg))
const visibleImagesCount = computed(() => props.helpers.assistantVisibleImageCount(props.msg))
const visibleVideos = computed(() => props.helpers.assistantVisibleVideos(props.msg))
const visibleVideosCount = computed(() => props.helpers.assistantVisibleVideoCount(props.msg))
</script>

<style scoped>
.assistant-media {
  display: contents;
}

.assistant-image-block {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 10px;
  padding: 14px;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(14, 165, 233, 0.16);
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 38%),
    radial-gradient(circle at bottom left, rgba(56, 189, 248, 0.08), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(240, 249, 255, 0.9));
  box-shadow:
    0 18px 40px rgba(14, 165, 233, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
  animation: assistant-media-fade-up 220ms ease;
}

.assistant-image-task {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  padding: 14px;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(245, 158, 11, 0.22);
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 40%),
    radial-gradient(circle at bottom left, rgba(251, 191, 36, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 251, 235, 0.92), rgba(255, 247, 237, 0.92));
  box-shadow:
    0 18px 40px rgba(245, 158, 11, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
  animation: assistant-media-fade-up 220ms ease;
}

.assistant-image-block::before,
.assistant-image-task::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.34), transparent 38%, transparent 62%, rgba(255, 255, 255, 0.18));
  opacity: 0.8;
}

.assistant-media.is-dark .assistant-image-task,
  :deep(.chat-page.dark) .assistant-image-task {
  border-color: rgba(251, 191, 36, 0.28);
  background:
    radial-gradient(circle at top right, rgba(251, 191, 36, 0.16), transparent 42%),
    radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.1), transparent 34%),
    linear-gradient(180deg, rgba(56, 37, 10, 0.88), rgba(30, 24, 13, 0.96));
  box-shadow:
    0 20px 42px rgba(2, 6, 23, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.assistant-media.is-dark .assistant-image-block,
:deep(.chat-page.dark) .assistant-image-block {
  border-color: rgba(56, 189, 248, 0.24);
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 42%),
    radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.1), transparent 34%),
    linear-gradient(180deg, rgba(8, 47, 73, 0.9), rgba(12, 28, 46, 0.96));
  box-shadow:
    0 20px 42px rgba(2, 6, 23, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.assistant-video-block {
  border-color: rgba(99, 102, 241, 0.16);
  background:
    radial-gradient(circle at top right, rgba(129, 140, 248, 0.16), transparent 38%),
    radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.08), transparent 32%),
    linear-gradient(180deg, rgba(250, 245, 255, 0.92), rgba(243, 244, 255, 0.92));
  box-shadow:
    0 18px 40px rgba(99, 102, 241, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.assistant-media.is-dark .assistant-video-block,
:deep(.chat-page.dark) .assistant-video-block {
  border-color: rgba(129, 140, 248, 0.26);
  background:
    radial-gradient(circle at top right, rgba(129, 140, 248, 0.18), transparent 40%),
    radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(30, 27, 75, 0.9), rgba(17, 24, 39, 0.96));
}

.assistant-image-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.assistant-image-block__titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.assistant-image-block__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f766e;
}

:deep(.chat-page.dark) .assistant-image-block__eyebrow {
  color: #67e8f9;
}

.assistant-image-block__title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.01em;
}

.assistant-image-block__prompt {
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 14px;
  color: rgba(15, 23, 42, 0.72);
  background: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

:deep(.chat-page.dark) .assistant-image-block__prompt {
  color: rgba(226, 232, 240, 0.8);
  background: rgba(15, 23, 42, 0.26);
  border-color: rgba(148, 163, 184, 0.18);
}

.assistant-image-task__meta {
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  color: rgba(15, 23, 42, 0.72);
  background: rgba(255, 255, 255, 0.38);
}

:deep(.chat-page.dark) .assistant-image-task__meta {
  color: rgba(226, 232, 240, 0.8);
  background: rgba(15, 23, 42, 0.24);
}

.assistant-image-task__note {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(15, 23, 42, 0.76);
}

:deep(.chat-page.dark) .assistant-image-task__note {
  color: rgba(226, 232, 240, 0.84);
}

.chat-image-grid--assistant {
  margin: 0;
  gap: 14px;
}

.chat-image-item--assistant {
  max-width: min(100%, 280px);
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.56);
  box-shadow: 0 16px 28px rgba(15, 23, 42, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.chat-image-item--assistant:hover {
  transform: translateY(-3px);
  border-color: rgba(14, 165, 233, 0.22);
  box-shadow: 0 22px 34px rgba(15, 23, 42, 0.12);
}

.assistant-media.is-dark .chat-image-item--assistant,
:deep(.chat-page.dark) .chat-image-item--assistant {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.34);
  box-shadow: 0 18px 32px rgba(2, 6, 23, 0.24);
}

.assistant-media.is-dark .chat-image-item--assistant:hover,
:deep(.chat-page.dark) .chat-image-item--assistant:hover {
  box-shadow: 0 24px 36px rgba(2, 6, 23, 0.3);
}

.chat-image-placeholder--assistant {
  position: relative;
  width: 100%;
  min-width: 220px;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  border-radius: 16px;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.12), rgba(226, 232, 240, 0.28));
}

.chat-image-placeholder--assistant::before {
  content: '';
  position: absolute;
  inset: -35% 0;
  background: linear-gradient(120deg, transparent 28%, rgba(255, 255, 255, 0.56) 50%, transparent 72%);
  animation: assistant-media-shimmer 2.4s linear infinite;
}

.assistant-media.is-dark .chat-image-placeholder--assistant::before,
:deep(.chat-page.dark) .chat-image-placeholder--assistant::before {
  background: linear-gradient(120deg, transparent 24%, rgba(148, 163, 184, 0.18) 50%, transparent 76%);
}

.assistant-media.is-dark .chat-image-placeholder--assistant,
:deep(.chat-page.dark) .chat-image-placeholder--assistant {
  background:
    linear-gradient(180deg, rgba(71, 85, 105, 0.48), rgba(51, 65, 85, 0.72));
  border-color: rgba(148, 163, 184, 0.2);
}

.chat-image-placeholder__label {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  line-height: 1.55;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.72);
}

.assistant-media.is-dark .chat-image-placeholder__label,
:deep(.chat-page.dark) .chat-image-placeholder__label {
  color: rgba(226, 232, 240, 0.84);
}

.chat-image-caption--assistant {
  gap: 4px;
  padding: 2px 2px 0;
}

.chat-image-caption--placeholder {
  gap: 2px;
}

.chat-image-item--placeholder {
  max-width: min(100%, 236px);
  padding: 8px;
}

.chat-image-item--placeholder .chat-image-frame--assistant {
  padding: 6px;
}

.chat-image-item--placeholder .chat-image-placeholder--assistant,
.chat-image-item--placeholder .chat-video-player {
  min-width: 196px;
  min-height: 196px;
}

.chat-image-caption--placeholder .chat-image-name {
  font-size: 11px;
  font-weight: 600;
}

.chat-image-caption--placeholder .chat-image-meta-line,
.chat-image-caption--placeholder .chat-image-note {
  font-size: 11px;
}

.chat-image-frame--assistant {
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  padding: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(241, 245, 249, 0.9));
  box-shadow:
    0 18px 30px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.chat-image-viewer--assistant {
  display: block;
  width: 100%;
  overflow: hidden;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(226, 232, 240, 0.9));
}

.chat-image-viewer--assistant :deep(img),
.chat-image-viewer--assistant :deep(.chat-image-viewer__img),
.chat-image-viewer--assistant :deep(.n-image-placeholder),
.chat-image-viewer--assistant :deep(.n-image-error) {
  display: block;
  background: transparent;
}

.chat-image-item--assistant:hover .chat-image-frame--assistant {
  transform: translateY(-1px);
  box-shadow:
    0 24px 36px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  border-color: rgba(14, 165, 233, 0.22);
}

.assistant-media.is-dark .chat-image-frame--assistant,
:deep(.chat-page.dark) .chat-image-frame--assistant {
  border-color: rgba(148, 163, 184, 0.2);
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.84), rgba(30, 41, 59, 0.78));
  box-shadow:
    0 18px 34px rgba(2, 6, 23, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.assistant-media.is-dark .chat-image-viewer--assistant,
.chat-image-viewer--assistant.is-dark,
:deep(.chat-page.dark) .chat-image-viewer--assistant {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.84));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.assistant-media.is-dark .chat-image-viewer--assistant :deep(.n-image-placeholder),
.assistant-media.is-dark .chat-image-viewer--assistant :deep(.n-image-error),
.chat-image-viewer--assistant.is-dark :deep(.n-image-placeholder),
.chat-image-viewer--assistant.is-dark :deep(.n-image-error) {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
}

.assistant-media.is-dark .chat-image-item--assistant:hover .chat-image-frame--assistant,
:deep(.chat-page.dark) .chat-image-item--assistant:hover .chat-image-frame--assistant {
  border-color: rgba(56, 189, 248, 0.26);
}

.assistant-video-block .chat-image-item--assistant:hover .chat-image-frame--assistant {
  border-color: rgba(99, 102, 241, 0.24);
}

.chat-video-frame--assistant {
  padding: 10px;
  background:
    linear-gradient(180deg, rgba(238, 242, 255, 0.92), rgba(224, 231, 255, 0.88));
}

.assistant-media.is-dark .chat-video-frame--assistant,
:deep(.chat-page.dark) .chat-video-frame--assistant {
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.86));
}

.chat-video-player {
  display: block;
  width: 100%;
  min-width: 240px;
  max-width: 100%;
  min-height: 240px;
  border-radius: 14px;
  object-fit: cover;
  background: #000;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.assistant-media.is-dark .chat-video-player,
.chat-video-player.is-dark,
:deep(.chat-page.dark) .chat-video-player {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.14),
    0 10px 24px rgba(2, 6, 23, 0.22);
}

.chat-image-name {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.chat-image-meta-line,
.chat-image-note {
  line-height: 1.5;
}

.chat-image-actions {
  padding-top: 2px;
}

.assistant-media-tag {
  flex: 0 0 auto;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

:deep(.chat-page.dark) .assistant-media-tag {
  box-shadow: 0 12px 22px rgba(2, 6, 23, 0.28);
}

.assistant-video-block .assistant-image-block__eyebrow {
  color: #4338ca;
}

:deep(.chat-page.dark) .assistant-video-block .assistant-image-block__eyebrow {
  color: #a5b4fc;
}

@keyframes assistant-media-fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes assistant-media-shimmer {
  from {
    transform: translateX(-30%);
  }
  to {
    transform: translateX(30%);
  }
}

@media (max-width: 720px) {
  .assistant-image-block,
  .assistant-image-task {
    padding: 12px;
    border-radius: 18px;
  }

  .chat-image-item--assistant {
    width: 100%;
    max-width: 100%;
  }

  .chat-image-item--placeholder .chat-image-placeholder--assistant,
  .chat-image-item--placeholder .chat-video-player {
    min-width: 0;
    min-height: 176px;
  }

  .chat-image-placeholder--assistant,
  .chat-video-player {
    min-width: 0;
    min-height: 210px;
  }
}
</style>
