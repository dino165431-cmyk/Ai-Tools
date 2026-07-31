import { computed, shallowRef } from 'vue'

import {
  normalizeShellApprovalCommand,
  normalizeToolApprovalArgs
} from '@/utils/toolApprovalPolicy'

function normalizeApprovalKind(value) {
  if (value === 'shell') return 'shell'
  if (value === 'execution') return 'execution'
  return 'tool'
}

export function createChatToolApprovalController({
  createId,
  throwIfAborted
} = {}) {
  const approvedKeys = new Set()
  const pendingApprovals = shallowRef([])
  const activeApproval = computed(() => pendingApprovals.value[0] || null)
  const pendingApprovalCount = computed(() => pendingApprovals.value.length)

  function isApproved(key) {
    const normalized = String(key || '').trim()
    return !!normalized && approvedKeys.has(normalized)
  }

  function remember(key) {
    const normalized = String(key || '').trim()
    if (normalized) approvedKeys.add(normalized)
  }

  function clearSession(sessionId) {
    const target = String(sessionId || '').trim()
    if (!target) return
    for (const key of approvedKeys) {
      try {
        const parsed = JSON.parse(key)
        if (Array.isArray(parsed) && String(parsed[0] || '') === target) {
          approvedKeys.delete(key)
        }
      } catch {
        approvedKeys.delete(key)
      }
    }
  }

  function clearAllRemembered() {
    approvedKeys.clear()
  }

  async function requestApproval({
    serverName,
    toolName,
    argsText,
    reasoningText,
    abortState = null,
    titleText = '确认工具调用',
    extraLines = [],
    sessionId = '',
    sessionTitle = '',
    approvalKind = 'tool',
    hardApproval = false,
    rememberText = '本会话允许此工具',
    onRememberForSession = null
  }) {
    if (typeof throwIfAborted === 'function') throwIfAborted(abortState)
    const normalizedKind = normalizeApprovalKind(approvalKind)
    const normalizedArgsText = String(argsText || '{}').trim() || '{}'
    const normalizedArgs = normalizeToolApprovalArgs(null, normalizedArgsText)
    const shellCommand = normalizeShellApprovalCommand(normalizedArgs, normalizedArgsText)

    return await new Promise((resolve) => {
      let settled = false
      let unregisterAbort = null
      const requestId = `tool_approval_${typeof createId === 'function' ? createId() : Date.now()}`
      const finish = (value, rememberForSession = false) => {
        if (settled) return
        settled = true
        pendingApprovals.value = pendingApprovals.value.filter((item) => item.id !== requestId)
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
        if (rememberForSession && hardApproval !== true && typeof onRememberForSession === 'function') {
          try {
            onRememberForSession()
          } catch {
            // Approval remains valid for this call even if remembering fails.
          }
        }
        resolve(value)
      }

      pendingApprovals.value = [
        ...pendingApprovals.value,
        {
          id: requestId,
          serverName: String(serverName || '未知').trim() || '未知',
          toolName: String(toolName || 'unknown').trim() || 'unknown',
          argsText: normalizedArgsText,
          reasoningText: String(reasoningText || '').trim(),
          titleText: String(titleText || '确认工具调用').trim() || '确认工具调用',
          extraLines: Array.isArray(extraLines)
            ? extraLines.map((line) => String(line || '').trim()).filter(Boolean)
            : [],
          sessionId: String(sessionId || '').trim(),
          sessionTitle: String(sessionTitle || '').trim(),
          approvalKind: normalizedKind,
          hardApproval: hardApproval === true,
          commandText: normalizedKind === 'shell' ? shellCommand.command : '',
          cwdText: normalizedKind === 'shell' ? shellCommand.cwd : '',
          canRemember: hardApproval !== true && typeof onRememberForSession === 'function',
          rememberText: String(rememberText || '').trim() || '本会话允许此工具',
          scopeHint:
            normalizedKind === 'shell'
              ? '会话内允许只匹配当前 cwd 和完全相同的命令；其他 Bash 命令仍会再次询问。'
              : hardApproval === true
                ? '这是不可记忆的高风险操作；每次调用都必须重新确认。'
              : normalizedKind === 'execution'
                ? '会话内允许只匹配当前技能、脚本和完全相同的参数；其他代码执行仍会再次询问。'
                : '会话内允许只对当前会话中的此工具生效。',
          settle(decision) {
            if (decision === 'session') {
              finish(true, true)
              return
            }
            if (decision === 'once') {
              finish(true, false)
              return
            }
            if (decision === 'deny') {
              finish(false, false)
              return
            }
            finish(null, false)
          }
        }
      ]

      const abortCleanup = abortState?.onAbort?.(() => {
        finish(null)
      }) || null
      if (settled) {
        try {
          abortCleanup?.()
        } catch {
          // ignore
        }
      } else {
        unregisterAbort = abortCleanup
      }
    })
  }

  function resolveActive(decision) {
    activeApproval.value?.settle?.(decision)
  }

  function cancelPending() {
    const pending = [...pendingApprovals.value]
    pending.forEach((request) => request?.settle?.('abort'))
  }

  return {
    activeApproval,
    approvedKeys,
    cancelPending,
    clearAllRemembered,
    clearSession,
    isApproved,
    pendingApprovalCount,
    pendingApprovals,
    remember,
    requestApproval,
    resolveActive
  }
}
