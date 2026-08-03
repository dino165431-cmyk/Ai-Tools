<template>
  <transition name="tool-approval">
    <section
      v-if="approval"
      class="tool-approval-card"
      role="alertdialog"
      aria-live="assertive"
      aria-label="工具调用审批"
    >
      <div class="tool-approval-card__header">
        <div class="tool-approval-card__title-wrap">
          <span class="tool-approval-card__icon">
            <n-icon :component="ShieldOutline" size="18" />
          </span>
          <div class="tool-approval-card__title-copy">
            <strong>{{ approval.titleText }}</strong>
            <span>{{ approval.serverName }} / {{ approval.toolName }}</span>
          </div>
        </div>
        <n-flex align="center" :size="6">
          <n-tag size="small" type="warning" :bordered="false">等待确认</n-tag>
          <n-tag v-if="pendingCount > 1" size="small" :bordered="false">队列 {{ pendingCount }}</n-tag>
        </n-flex>
      </div>

      <div class="tool-approval-card__meta">
        <span v-if="approval.sessionTitle">会话：{{ approval.sessionTitle }}</span>
        <span v-for="line in approval.extraLines" :key="line">{{ line }}</span>
      </div>

      <div v-if="approval.approvalKind === 'shell'" class="tool-approval-card__command">
        <div class="tool-approval-card__command-label">
          <span>Bash 命令</span>
          <code>cwd: {{ approval.cwdText }}</code>
        </div>
        <pre>{{ approval.commandText || '（空命令）' }}</pre>
      </div>

      <details v-else class="tool-approval-card__details" open>
        <summary>{{ approval.approvalKind === 'execution' ? '查看待执行脚本与参数' : '查看调用参数' }}</summary>
        <pre>{{ approval.argsText }}</pre>
      </details>

      <details v-if="approval.approvalKind === 'shell' || approval.reasoningText" class="tool-approval-card__details">
        <summary>{{ approval.reasoningText ? '查看模型说明与完整参数' : '查看完整参数' }}</summary>
        <div v-if="approval.reasoningText" class="tool-approval-card__reasoning">{{ approval.reasoningText }}</div>
        <pre>{{ approval.argsText }}</pre>
      </details>

      <div class="tool-approval-card__footer">
        <n-text depth="3" class="tool-approval-card__scope">{{ approval.scopeHint }}</n-text>
        <n-flex justify="end" wrap :size="8">
          <n-button size="small" @click="emit('resolve', 'deny')">拒绝</n-button>
          <n-button size="small" secondary type="primary" @click="emit('resolve', 'once')">允许一次</n-button>
          <n-button v-if="approval.canRemember" size="small" type="primary" @click="emit('resolve', 'session')">
            {{ approval.rememberText }}
          </n-button>
        </n-flex>
      </div>
    </section>
  </transition>
</template>

<script setup>
import { NButton, NFlex, NIcon, NTag, NText } from 'naive-ui'
import { ShieldOutline } from '@vicons/ionicons5'

defineProps({
  approval: { type: Object, default: null },
  pendingCount: { type: Number, default: 0 }
})

const emit = defineEmits(['resolve'])
</script>
