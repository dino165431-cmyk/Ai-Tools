<template>
  <div v-if="visible" :class="['agent-run-flow', { 'is-dark': theme === 'dark' }]">
    <div v-if="overviewChips.length" class="agent-run-flow__chips">
      <span
        v-for="chip in overviewChips"
        :key="chip"
        class="agent-run-flow__chip"
      >
        {{ chip }}
      </span>
    </div>

    <div v-if="timelineItems.length" class="agent-run-flow__section">
      <div class="agent-run-flow__section-title">子任务进度</div>
      <div class="agent-run-flow__timeline">
        <div
          v-for="step in timelineItems"
          :key="step.id"
          class="agent-run-step"
        >
          <div class="agent-run-step__marker" :class="`is-${step.status}`">
            <n-icon :component="agentRunStepIcon(step)" size="14" />
          </div>
          <div class="agent-run-step__card" :class="`is-${step.status}`">
            <button
              type="button"
              class="agent-run-step__header agent-run-step__header--toggle"
              @click="handleToggleStep(step)"
            >
              <span class="agent-run-step__title">{{ step.title }}</span>
              <span v-if="step.timeLabel" class="agent-run-step__time">{{ step.timeLabel }}</span>
              <span v-if="stepSummary(step)" class="agent-run-step__summary">{{ stepSummary(step) }}</span>
              <span class="agent-run-step__status" :class="`is-${step.status}`">{{ agentRunStepStatusLabel(step) }}</span>
              <n-icon
                :component="isStepExpanded(step) ? ChevronUpOutline : ChevronDownOutline"
                size="14"
                class="agent-run-step__toggle-icon"
              />
            </button>
            <div v-if="step.metaText" class="agent-run-step__meta">{{ step.metaText }}</div>
            <div v-if="isStepExpanded(step) && Array.isArray(step.children) && step.children.length" class="agent-run-step__children">
              <div
                v-for="child in step.children"
                :key="child.id"
                class="agent-run-step__child"
              >
                <div class="agent-run-step__child-marker">
                  <n-icon :component="agentRunStepIcon(child)" size="12" />
                </div>
                <div class="agent-run-step__child-body">
                  <div class="agent-run-step__child-header">
                    <span class="agent-run-step__child-title">{{ child.title }}</span>
                    <span v-if="child.timeLabel" class="agent-run-step__child-time">{{ child.timeLabel }}</span>
                    <span v-if="stepSummary(child)" class="agent-run-step__child-summary">{{ stepSummary(child) }}</span>
                    <span class="agent-run-step__child-status" :class="`is-${child.status}`">
                      {{ agentRunStepStatusLabel(child) }}
                    </span>
                  </div>
                  <div v-if="child.metaText" class="agent-run-step__child-meta">{{ child.metaText }}</div>
                </div>
              </div>
            </div>
            <div v-if="isStepExpanded(step) && step.reasoningText" class="agent-run-step__section">
              <div class="agent-run-step__section-title">推理过程</div>
              <pre class="agent-run-step__thinking">{{ step.reasoningText }}</pre>
            </div>
            <div
              v-if="isStepExpanded(step) && step.kind === 'tool' && (step.serverName || step.toolName)"
              class="agent-run-step__section"
            >
              <div class="agent-run-step__section-title">技术信息</div>
              <pre class="agent-run-step__code">{{ [step.serverName, step.toolName].filter(Boolean).join(' / ') }}</pre>
            </div>
            <div v-if="isStepExpanded(step) && step.contentText" class="agent-run-step__section">
              <div class="agent-run-step__section-title">内容</div>
              <pre class="agent-run-step__content">{{ step.contentText }}</pre>
            </div>
            <div v-if="isStepExpanded(step) && step.argsText" class="agent-run-step__section">
              <div class="agent-run-step__section-title">参数</div>
              <pre class="agent-run-step__code">{{ step.argsText }}</pre>
            </div>
            <div v-if="isStepExpanded(step) && step.resultText" class="agent-run-step__section">
              <div class="agent-run-step__section-title">结果</div>
              <pre class="agent-run-step__code">{{ step.resultText }}</pre>
            </div>
            <div v-if="isStepExpanded(step) && step.errorText" class="agent-run-step__section">
              <div class="agent-run-step__section-title">错误</div>
              <pre class="agent-run-step__error">{{ step.errorText }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="finalContent" class="agent-run-flow__section">
      <div class="agent-run-flow__section-title">最终输出</div>
      <LazyMarkdownPreview
        :editorId="`msg-${msg.id}-agent-run-final`"
        :modelValue="finalContent"
        previewTheme="github"
        codeTheme="github"
        :theme="theme"
        :deferBlockLayout="false"
        :code-foldable="true"
        :auto-fold-threshold="CHAT_CODE_AUTO_FOLD_THRESHOLD"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'
import { CHAT_CODE_AUTO_FOLD_THRESHOLD } from '@/utils/chatMarkdownPreview'
import {
  ChatbubbleEllipsesOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  CloseOutline,
  HardwareChipOutline,
  PersonCircleOutline,
  PauseCircleOutline,
  RefreshOutline,
  ShieldOutline,
  SparklesOutline,
  SpeedometerOutline
} from '@vicons/ionicons5'
import {
  agentRunStepStatusLabel,
  agentRunStepSummary,
  buildAgentRunTimelineItems,
  getAgentRunFinalContent,
  getAgentRunResultPayload,
  getAgentRunOverviewChips,
  isAgentRunToolMessage,
  isAgentRunStepExpanded,
  toggleAgentRunStepExpanded
} from '@/utils/chatAgentRun'

const props = defineProps({
  msg: {
    type: Object,
    required: true
  },
  theme: {
    type: String,
    default: 'light'
  },
  truncateText: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['step-expand'])

const overviewChips = computed(() => getAgentRunOverviewChips(props.msg))
const finalContent = computed(() => getAgentRunFinalContent(props.msg))
const timelineItems = computed(() => buildAgentRunTimelineItems(props.msg))
const payloadStatus = computed(() => String(getAgentRunResultPayload(props.msg)?.status || '').trim())
const visible = computed(() => {
  if (!isAgentRunToolMessage(props.msg)) return false
  return (
    timelineItems.value.length > 0 ||
    !!finalContent.value ||
    payloadStatus.value === 'paused'
  )
})

function agentRunStepIcon(step) {
  const kind = String(step?.kind || '').trim()
  const status = String(step?.status || '').trim()
  if (kind === 'task') return PersonCircleOutline
  if (kind === 'assistant') {
    if (status === 'running') return ChatbubbleEllipsesOutline
    if (status === 'paused') return PauseCircleOutline
    if (status === 'stopped') return CloseOutline
    return SparklesOutline
  }
  if (kind === 'tool') {
    if (status === 'pending') return ShieldOutline
    if (status === 'running') return RefreshOutline
    if (status === 'paused') return PauseCircleOutline
    if (status === 'error') return CloseOutline
    if (status === 'rejected') return ShieldOutline
    if (status === 'stopped') return CloseOutline
    return HardwareChipOutline
  }
  return SpeedometerOutline
}

function isStepExpanded(step) {
  return isAgentRunStepExpanded(props.msg, step)
}

function handleToggleStep(step) {
  if (toggleAgentRunStepExpanded(props.msg, step)) emit('step-expand')
}

function stepSummary(step) {
  return agentRunStepSummary(step, props.truncateText)
}
</script>

<style scoped>
.agent-run-flow {
  position: relative;
  overflow: hidden;
  padding-left: 9px;
}

.agent-run-flow::before {
  content: '';
  position: absolute;
  inset: 8px auto 8px 0;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(42, 148, 125, 0.9), rgba(68, 114, 196, 0.2));
}

.agent-run-flow__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 7px;
}

.agent-run-flow__chip {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: #17624f;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(45, 132, 109, 0.2);
}

.agent-run-flow.is-dark .agent-run-flow__chip {
  color: #b8f4e7;
  background: rgba(22, 34, 33, 0.78);
  border-color: rgba(87, 190, 169, 0.28);
}

.agent-run-flow__section {
  margin-top: 8px;
}

.agent-run-flow__section-title,
.agent-run-step__section-title {
  font-size: 12px;
  font-weight: 600;
  color: #4f6f67;
  margin-bottom: 4px;
}

.agent-run-step__thinking,
.agent-run-step__content,
.agent-run-step__code,
.agent-run-step__error {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  max-height: min(280px, 38vh);
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(69, 105, 99, 0.14);
}

.agent-run-flow.is-dark .agent-run-step__thinking,
.agent-run-flow.is-dark .agent-run-step__content,
.agent-run-flow.is-dark .agent-run-step__code,
.agent-run-flow.is-dark .agent-run-step__error {
  background: rgba(18, 27, 30, 0.88);
  border-color: rgba(116, 162, 176, 0.16);
}

.agent-run-step__error {
  color: #a23d42;
}

.agent-run-flow.is-dark .agent-run-step__error {
  color: #f1a4a7;
}

.agent-run-flow__timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(440px, 54vh);
  padding-right: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.agent-run-step {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
  animation: agent-run-step-enter 220ms ease;
}

.agent-run-step__marker {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(42, 148, 125, 0.12);
  color: #1f7d67;
  border: 1px solid rgba(45, 132, 109, 0.18);
}

.agent-run-step__marker.is-pending,
.agent-run-step__marker.is-rejected,
.agent-run-step__marker.is-stopped {
  color: #8a651a;
  background: rgba(206, 161, 51, 0.14);
  border-color: rgba(206, 161, 51, 0.2);
}

.agent-run-step__marker.is-running {
  color: #3567b6;
  background: rgba(76, 123, 214, 0.12);
  border-color: rgba(76, 123, 214, 0.18);
}

.agent-run-step__marker.is-paused {
  color: #a86a1a;
  background: rgba(224, 168, 63, 0.14);
  border-color: rgba(224, 168, 63, 0.2);
}

.agent-run-step__marker.is-error {
  color: #aa4045;
  background: rgba(209, 76, 83, 0.12);
  border-color: rgba(209, 76, 83, 0.18);
}

.agent-run-step__marker.is-stopped {
  color: #a86a1a;
  background: rgba(224, 168, 63, 0.14);
  border-color: rgba(224, 168, 63, 0.2);
}

.agent-run-flow.is-dark .agent-run-step__marker {
  background: rgba(38, 80, 70, 0.42);
  color: #8be5cb;
  border-color: rgba(106, 201, 179, 0.2);
}

.agent-run-flow.is-dark .agent-run-step__marker.is-pending,
.agent-run-flow.is-dark .agent-run-step__marker.is-rejected {
  background: rgba(140, 111, 38, 0.34);
  color: #ffd78c;
}

.agent-run-flow.is-dark .agent-run-step__marker.is-stopped {
  background: rgba(140, 111, 38, 0.34);
  color: #ffd78c;
}

.agent-run-flow.is-dark .agent-run-step__marker.is-running {
  background: rgba(51, 78, 129, 0.4);
  color: #9abfff;
}

.agent-run-flow.is-dark .agent-run-step__marker.is-paused {
  background: rgba(140, 111, 38, 0.34);
  color: #ffd78c;
}

.agent-run-flow.is-dark .agent-run-step__marker.is-error {
  background: rgba(117, 42, 53, 0.42);
  color: #ffb0b6;
}

.agent-run-step__card {
  border-radius: 10px;
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(82, 121, 113, 0.16);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.agent-run-step__card:hover {
  background: rgba(255, 255, 255, 0.78);
}

.agent-run-step__card.is-running {
  border-color: rgba(76, 123, 214, 0.26);
}

.agent-run-step__card.is-pending {
  border-color: rgba(206, 161, 51, 0.28);
}

.agent-run-step__card.is-paused {
  border-color: rgba(224, 168, 63, 0.28);
}

.agent-run-step__card.is-error {
  border-color: rgba(209, 76, 83, 0.3);
}

.agent-run-step__card.is-rejected {
  border-color: rgba(170, 115, 40, 0.24);
}

.agent-run-step__card.is-stopped {
  border-color: rgba(224, 168, 63, 0.28);
}

.agent-run-flow.is-dark .agent-run-step__card {
  background: rgba(18, 27, 30, 0.74);
  border-color: rgba(117, 157, 170, 0.16);
}

.agent-run-flow.is-dark .agent-run-step__card:hover {
  background: rgba(22, 34, 38, 0.9);
}

.agent-run-flow.is-dark .agent-run-step__card.is-running {
  border-color: rgba(100, 145, 228, 0.28);
}

.agent-run-flow.is-dark .agent-run-step__card.is-pending {
  border-color: rgba(219, 177, 72, 0.26);
}

.agent-run-flow.is-dark .agent-run-step__card.is-paused {
  border-color: rgba(219, 177, 72, 0.26);
}

.agent-run-flow.is-dark .agent-run-step__card.is-error,
.agent-run-flow.is-dark .agent-run-step__card.is-rejected {
  border-color: rgba(208, 93, 99, 0.26);
}

.agent-run-flow.is-dark .agent-run-step__card.is-stopped {
  border-color: rgba(219, 177, 72, 0.26);
}

.agent-run-step__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.agent-run-step__header--toggle {
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.agent-run-step__header--toggle:hover .agent-run-step__title,
.agent-run-step__header--toggle:hover .agent-run-step__toggle-icon {
  color: #1e7b68;
}

.agent-run-step__title {
  font-size: 12px;
  font-weight: 600;
  color: #27423d;
}

.agent-run-step__time {
  font-size: 11px;
  color: #6a807a;
}

.agent-run-step__summary {
  min-width: 0;
  flex: 1;
  font-size: 11px;
  color: #6a807a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-run-step__status {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(42, 148, 125, 0.12);
  color: #1f7d67;
}

.agent-run-step__status.is-running {
  background: rgba(76, 123, 214, 0.14);
  color: #3567b6;
}

.agent-run-step__status.is-paused {
  background: rgba(224, 168, 63, 0.16);
  color: #a86a1a;
}

.agent-run-step__status.is-pending,
.agent-run-step__status.is-rejected {
  background: rgba(206, 161, 51, 0.16);
  color: #8a651a;
}

.agent-run-step__status.is-error {
  background: rgba(209, 76, 83, 0.14);
  color: #aa4045;
}

.agent-run-step__status.is-stopped {
  background: rgba(224, 168, 63, 0.16);
  color: #a86a1a;
}

.agent-run-step__status.is-success {
  background: rgba(42, 148, 125, 0.12);
  color: #1f7d67;
}

.agent-run-step__toggle-icon {
  flex: none;
  color: #7b908b;
  transition: color 0.18s ease, transform 0.18s ease;
}

.agent-run-step__meta {
  margin-top: 3px;
  font-size: 11px;
  color: #6f847f;
}

.agent-run-step__children {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  padding-left: 2px;
}

.agent-run-step__child {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}

.agent-run-step__child-marker {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(42, 148, 125, 0.1);
  color: #1f7d67;
  border: 1px solid rgba(45, 132, 109, 0.14);
}

.agent-run-flow.is-dark .agent-run-step__child-marker {
  background: rgba(38, 80, 70, 0.32);
  color: #8be5cb;
  border-color: rgba(106, 201, 179, 0.18);
}

.agent-run-step__child-body {
  min-width: 0;
  padding: 5px 7px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(69, 105, 99, 0.12);
}

.agent-run-flow.is-dark .agent-run-step__child-body {
  background: rgba(18, 27, 30, 0.72);
  border-color: rgba(116, 162, 176, 0.14);
}

.agent-run-step__child-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.agent-run-step__child-title {
  font-size: 12px;
  font-weight: 600;
  color: #27423d;
}

.agent-run-flow.is-dark .agent-run-step__child-title {
  color: #d7f5ee;
}

.agent-run-step__child-time,
.agent-run-step__child-summary {
  font-size: 12px;
  color: #6f847f;
}

.agent-run-step__child-status {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(42, 148, 125, 0.1);
  color: #1f7d67;
}

.agent-run-step__child-status.is-running {
  background: rgba(76, 123, 214, 0.12);
  color: #3567b6;
}

.agent-run-step__child-status.is-paused {
  background: rgba(224, 168, 63, 0.12);
  color: #a86a1a;
}

.agent-run-step__child-status.is-error,
.agent-run-step__child-status.is-rejected {
  background: rgba(209, 76, 83, 0.12);
  color: #aa4045;
}

.agent-run-flow.is-dark .agent-run-step__child-status {
  background: rgba(38, 80, 70, 0.34);
  color: #8be5cb;
}

.agent-run-flow.is-dark .agent-run-step__child-status.is-running {
  background: rgba(51, 78, 129, 0.34);
  color: #9abfff;
}

.agent-run-flow.is-dark .agent-run-step__child-status.is-paused {
  background: rgba(140, 111, 38, 0.34);
  color: #ffd78c;
}

.agent-run-flow.is-dark .agent-run-step__child-status.is-error,
.agent-run-flow.is-dark .agent-run-step__child-status.is-rejected {
  background: rgba(117, 42, 53, 0.36);
  color: #ffb0b6;
}

.agent-run-flow.is-dark .agent-run-step__child-status.is-stopped {
  background: rgba(140, 111, 38, 0.34);
  color: #ffd78c;
}

.agent-run-step__child-meta {
  margin-top: 4px;
  font-size: 11px;
  color: #6f847f;
}

.agent-run-step__section {
  margin-top: 6px;
}

@keyframes agent-run-step-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .agent-run-step {
    grid-template-columns: 1fr;
  }

  .agent-run-step__marker {
    display: none;
  }

  .agent-run-step__header {
    flex-wrap: wrap;
  }

  .agent-run-step__summary {
    flex-basis: 100%;
    white-space: normal;
  }
}
</style>
