import { useChatMediaGeneration } from './useChatMediaGeneration.js'

export function useChatRequestRunner(dependencies) {
  const {
    BUILTIN_AGENTS_TOOL_APPROVAL_MODE_CHANGE_EVENT,
    BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT,
    BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT,
    BUILTIN_AGENTS_TRACE_EVENT,
    BUILTIN_AGENT_ORCHESTRATION_SKILL_ID,
    BUILTIN_SHELL_SKILL_ID,
    CHAT_RUN_INPUT_MODE_QUEUE,
    CHAT_RUN_INPUT_MODE_STEER,
    CHAT_TOOL_COMPACT_MIN_MESSAGES,
    CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES,
    INLINE_COMMAND_KIND_LABELS,
    INTERNAL_TOOL_SPECS,
    MAX_EXPANDED_TOOL_COUNT,
    MCP_CATALOG_MAX_TOOL_HINTS_PER_SERVER,
    MCP_CATALOG_MAX_TOOL_NAMES_PER_SERVER,
    MCP_LIST_PROMPTS_TTL_MS,
    MCP_LIST_TOOLS_TTL_MS,
    MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER,
    TOOL_APPROVAL_MODE_FULL,
    TOOL_APPROVAL_MODE_MANUAL,
    TOOL_APPROVAL_MODE_SAFE,
    TOOL_APPROVAL_MODE_TRUSTED,
    VIDEO_GENERATION_RESULT_TIMEOUT_MS,
    abortController,
    activatedAgentSkillIds,
    activeAgentRunToolMessageByStreamId,
    activeMcpIds,
    activeMcpServers,
    activeMemorySessionId,
    agentModalSelectedId,
    agentSkillIds,
    applyAgent,
    applyAssistantRequestPlaceholderMode,
    applyBasePromptSelection,
    applyDefaultChatState,
    applyDefaultGeneralAgent,
    applyImageGenerationImagesToDisplay,
    applyImageGenerationTaskToDisplay,
    applyImageGenerationTextToDisplay,
    applyVideoGenerationTaskToDisplay,
    applyVideoGenerationTextToDisplay,
    applyVideoGenerationVideosToDisplay,
    assistantImageTaskStatusLabel,
    assistantVideoTaskStatusLabel,
    assistantVisibleVideoCount,
    attachMediaRequestSnapshot,
    autoActivateAgentSkills,
    autoActivateAgentSkillsFromText,
    autoPersistMemorySessionWhenIdle,
    autoScrollEnabled,
    autoScrollSuspendedByUser,
    basePromptMode,
    basePromptText,
    buildActiveRequestOverrides,
    buildChatAttachmentReferenceBlock,
    buildChatContextWindow,
    buildChatContextWindowRuntimeOptions,
    buildChatRequestMessages,
    buildCombinedSystemContent,
    buildContextSummarySourceHash,
    buildContextSummaryTurnSegments,
    buildCurrentChatState,
    buildImageGenerationApiSummary,
    buildImageGenerationCompatibilityError,
    buildImageGenerationPendingText,
    buildImageGenerationRequestOptionsWithReferences,
    buildManualImageGenerationRequestInfo,
    buildManualVideoGenerationRequestInfo,
    buildMcpArgsFromForm,
    buildMcpToolHint,
    buildMediaRequestSnapshot,
    buildMemoryInjection,
    buildMemoryRecallQueryFromAttachments,
    buildMemoryRecallQueryFromRecord,
    buildPromptVariableValues,
    buildProviderToolDefinition,
    buildProviderToolDescription,
    buildSessionToolApprovalKey,
    buildSkillToolsBundle,
    buildToolExecutionResultSubMeta,
    buildToolVisionUserMessage,
    buildUtoolsAiMessages,
    buildVideoGenerationApiSummary,
    buildVideoGenerationCompatibilityError,
    buildVideoGenerationPendingText,
    buildVideoGenerationRequestOptionsWithReferences,
    calculateContextSummaryTriggerChars,
    calculateReservedRequestChars,
    canGenerateMemorySessionTitle,
    canRetryMemorySessionTitle,
    canUseUtoolsAi,
    cancelPendingToolApprovals,
    chatConfig,
    chatMessageEstimatedHeightCache,
    chatRunInputQueue,
    cleanupChatPreviewLinkHandlers,
    cleanupPendingBuiltinAgentsEvents,
    clearAssistantMediaBubblePlaceholders,
    clearAttachmentFileReferences,
    clearChatVirtualItemRemeasure,
    clearInlineAgentPicker,
    clearInlineCommandPicker,
    clearInlinePickers,
    clearStickyChatBubbleSync,
    closeAllPooledMCPClients,
    closePooledMCPClient,
    collectAttachmentMediaReferenceImages,
    collectImageGenerationRevisedPrompts,
    composerInputKey,
    composerPanelRef,
    computed,
    confirmToolCall,
    contentHasUserAttachments,
    contextWindowDraft,
    contextWindowPreviewOmittedFilter,
    contextWindowResolvedOptions,
    createAbortError,
    createAssistantImageBubblePlaceholder,
    createAssistantVideoBubblePlaceholder,
    createBuiltinSkillActionCatalog,
    createEmptyContextSummaryState,
    createImageGenerationPlaceholderDisplay,
    createPendingLongTextAttachment,
    createPendingToolExecutionMessage,
    createPreparedMcpToolExecutor,
    createPreparedSkillToolExecutor,
    createRepeatedToolCallGuard,
    createToolExecutionResultMessage,
    createToolResultApiMessage,
    createVideoGenerationPlaceholderDisplay,
    customSystemPrompt,
    customSystemPromptExplicit,
    deepCopyJson,
    deferredAppendMessageField,
    deferredMessageFieldWaitIdle,
    detachedMediaAbortStates,
    dialog,
    disconnectChatLayoutResizeObserver,
    disconnectChatMessageVisibilityObserver,
    effectiveContextWindowConfig,
    effectiveToolMode,
    enableFcToolCallIdCompat,
    enrichImageAttachmentsForMemoryRecall,
    ensureAttachmentParsed,
    estimateMessageSize,
    estimateMessagesSize,
    estimateToolDefinitionsChars,
    evaluateToolApproval,
    extractChatImagesFromToolResult,
    extractChatVideosFromToolResult,
    extractContextTokenMetrics,
    extractEditableUserTextFromContent,
    extractImageGenerationPromptFromContent,
    extractImageGenerationTaskState,
    extractImageGenerationTextResult,
    extractInlineAgentContext,
    extractInlineCommandContext,
    extractModelUsage,
    extractPromptVariables,
    extractUtoolsAiReasoningText,
    extractVideoGenerationTaskState,
    findLocalPromptById,
    findMcpPromptCatalogItem,
    flushDeferredMessageFieldsForMessage,
    flushPendingBuiltinAgentsEvents,
    formatLocalUserPromptForComposer,
    formatMcpPromptResultForComposer,
    formatToolResultContentForModel,
    getActiveMemorySession,
    getCompatKey,
    getContextTokenTelemetry,
    getCurrentImageGenerationRequestOptions,
    getCurrentVideoGenerationRequestOptions,
    getFirstEnabledInlineCommandIndex,
    getLoadedSkillFilePathSet,
    getMcpPrompt,
    getMediaGenerationSystemContent,
    getMemorySessionById,
    getMemorySessionForMessage,
    getMemorySessionForToolMessage,
    getMemorySessionPendingApprovalCount,
    getOrCreateMCPClient,
    getProviderModelType,
    getRunRecord,
    getRunSessionTarget,
    getSkillFileIndex,
    getSkillScriptCatalog,
    globalContextWindowConfig,
    handleBuiltinAgentsTraceEvent,
    hasChatContextWindowReduction,
    hasLoadedSkillMainContent,
    hasPendingBuiltinAgentsEvents,
    imageGenerationMode,
    importFilesToSandbox,
    inferUserDisplayMessageRender,
    inlineAgentActiveIndex,
    inlineAgentMatchEnd,
    inlineAgentMatchStart,
    inlineAgentQuery,
    inlineAgentSuggestions,
    inlineCommandActiveIndex,
    inlineCommandMatchEnd,
    inlineCommandMatchStart,
    inlineCommandMode,
    inlineCommandQuery,
    inlineCommandSuggestions,
    inlineCommandType,
    input,
    inspectChatContextWindow,
    isAbortError,
    isAgentRunToolName,
    isChatMemoryEnabled,
    isComposerCompositionKeydownEvent,
    isDangerousShellApprovalCommand,
    isDefaultGeneralAgent,
    isDirectorySkill,
    isFcToolCallIdCompatEnabled,
    isFinalizedMemorySessionTitle,
    isLikelyImageGenerationModel,
    isLikelyVideoGenerationModel,
    isMemorySessionActive,
    isMemorySessionChatRunning,
    isRunnableSkillScriptPath,
    isSkillPromptContentLoaded,
    isSystemPrompt,
    isToolMessage,
    isUserPrompt,
    isUtoolsBuiltinProvider,
    lastBuiltRequestToolsStats,
    listSelectedSkillsBriefFromList,
    loadSkillMainContent,
    loadedSkillContentById,
    loadedSkillFileCacheBySkillId,
    loadingMcpPrompts,
    makeLocalPromptOptionValue,
    makeMcpPromptOptionValue,
    makeToolFunctionName,
    manualMcpIds,
    markSkillActivationPersistent,
    maybeScheduleScrollToBottomForRun,
    maybeScrollToBottomForRun,
    mcpListPromptsCache,
    mcpListPromptsInFlight,
    mcpListToolsCache,
    mcpListToolsInFlight,
    mcpModalSelectedIds,
    mcpPinnedToolHintsByServerId,
    mcpPinnedToolHintsRevision,
    mcpPromptCatalog,
    mcpServers,
    mcpToolCatalogByServerId,
    mcpToolCatalogRevision,
    mcpToolsRevision,
    mcpToolsStatusByServerId,
    memorySessions,
    mergeReferenceImagesIntoRequestOptions,
    mergeUserTextWithExistingAttachments,
    message,
    messageContentHasImageUrl,
    moveInlineAgentActive,
    moveInlineCommandActive,
    newId,
    nextDisplayMessageTime,
    nextTick,
    normalizeAssistantToolCalls,
    normalizeChatContextWindowConfig,
    normalizeImageGenerationMode,
    normalizeMcpPromptList,
    normalizeProviderApiMode,
    normalizeSkillScriptApprovalArgs,
    normalizeStringList,
    normalizeToolApprovalMode,
    onBeforeUnmount,
    parsePromptOptionValue,
    pendingAttachments,
    pendingToolApprovals,
    persistChatMediaListAssets,
    prepareAssistantDisplayForTextResponse,
    preparingSend,
    preparingSendStage,
    promptMcpArgsForm,
    promptModalSelectedId,
    promptUserArgsForm,
    providers,
    queueMemoryCandidateForRecord,
    reactive,
    refreshingMcpTools,
    registerUtoolsAiToolFunctions,
    releaseMCPClient,
    removeDisplayMessageById,
    removeRunDisplayMessageById,
    requestImageGeneration,
    requestSessionTitleAsync,
    requestVideoGeneration,
    resetPromptVariableFormData,
    resolveActiveAgentRunToolMessage,
    resolveBuiltinSkillCall,
    resolveChatContextWindowBudgetPlan,
    resolveChatContextWindowOptions,
    resolveChatLongTextAttachmentPlan,
    resolveChatToolWorkspaceScope,
    resolveContextSummaryChain,
    resolveContextSummaryLevel,
    resolveContextSummarySourceLabel,
    resolveMcpToolApprovalPolicy,
    resolveMemorySessionSandboxWorkspaceId,
    resolveMemorySessionTitle,
    resolveSelectedSkillTargetFromList,
    resolveSessionHostWorkspacePath,
    resolveSystemPromptModalApplyState,
    resumingMediaTaskKeys,
    routerActivatedAgentSkillIds,
    routerAddedAgentSkillIds,
    routerAddedSelectedSkillIds,
    runRecordByAbortState,
    runtimeAgentSkillIdSet,
    runtimeAgentSkillIds,
    runtimeMcpServers,
    runtimeSkillObjects,
    safeJsonParse,
    saveActiveMemorySessionDraft,
    scheduleRefreshUserAnchorMeta,
    scheduleScrollToBottom,
    scrollToBottom,
    searchCapabilities,
    selectedAgent,
    selectedLocalPromptVariables,
    selectedMcpPromptArgs,
    selectedModel,
    selectedPromptId,
    selectedPromptModalParsedValue,
    selectedProvider,
    selectedProviderId,
    resolveModelContextWindowTokens,
    selectedSkillIds,
    selectedSkillObjects,
    sending,
    session,
    sessionApprovedToolKeys,
    sessionContextWindowOverride,
    setStickyChatBubbleState,
    shouldAutoAttachToolImagesForVision,
    shouldClearBasePromptSelectionImmediately,
    shouldFallbackMediaRequestToChat,
    shouldFallbackVisionInputToText,
    shouldFetchVideoGenerationContent,
    shouldIncludeReasoningContent,
    shouldRetryWithReasoningContent,
    shouldRetryWithoutParallelToolCalls,
    shouldSubmitComposerKeydownEvent,
    shouldSummarizeContextWindow,
    showAgentModal,
    showContextWindowModal,
    showInlineAgentPicker,
    showInlineCommandPicker,
    showMcpModal,
    showMediaLibraryModal,
    showModelModal,
    showPromptModal,
    showSkillModal,
    showSystemPromptModal,
    skillModalSelectedIds,
    skills,
    stableStringify,
    streamChatCompletion,
    syncActiveRequestUiState,
    syncChatResponsiveState,
    systemContent,
    systemPromptDraft,
    thinkingEffort,
    throwIfAborted,
    toolApprovalMode,
    toolMode,
    touchChatRunInputQueue,
    truncateInlineText,
    truncateText,
    typewriterEnqueue,
    typewriterFlushAll,
    typewriterStates,
    typewriterWaitIdle,
    updateChatConfig,
    useChatMessageTracking,
    useChatUserMessageIndexing,
    videoGenerationMode,
    visibleSelectedAgent,
    waitForAbortable,
    waitForVideoGenerationResult,
    webSearchEnabled,
    withDefaultChatSandboxWorkspaceId,
    withTimeout
  } = dependencies
  let mcpPromptCatalogLoadPromise = null

  function enqueueMemorySessionApprovalRequest(record, request) {
    if (!record || !request || typeof request !== 'object') return null
    if (!Array.isArray(record.pendingApprovalRequests)) record.pendingApprovalRequests = []
    const requestId = String(request.requestId || '').trim()
    if (!requestId) return null
    const existing = record.pendingApprovalRequests.find((item) => String(item?.requestId || '').trim() === requestId)
    if (existing) return existing
    const next = {
      requestId,
      serverName: String(request.serverName || '').trim(),
      serverId: String(request.serverId || '').trim(),
      toolName: String(request.toolName || '').trim(),
      argsText: String(request.argsText || '{}').trim() || '{}',
      reasoningText: String(request.reasoningText || '').trim(),
      approvalKind:
        request.approvalKind === 'shell'
          ? 'shell'
          : request.approvalKind === 'execution'
            ? 'execution'
            : 'tool',
      forceApproval: request.forceApproval === true,
      hardApproval: request.hardApproval === true,
      approvalKey: String(request.approvalKey || '').trim(),
      streamId: String(request.streamId || '').trim(),
      agentName: String(request.agentName || '').trim(),
      extraLines: Array.isArray(request.extraLines) ? request.extraLines.map((line) => String(line || '').trim()).filter(Boolean) : [],
      createdAt: Date.now()
    }
    record.pendingApprovalRequests = [...record.pendingApprovalRequests, next]
    record.updatedAt = Date.now()
    return next
  }
  
  function removeMemorySessionApprovalRequest(record, requestId) {
    if (!record || !Array.isArray(record.pendingApprovalRequests)) return null
    const id = String(requestId || '').trim()
    if (!id) return null
    const existing = record.pendingApprovalRequests.find((item) => String(item?.requestId || '').trim() === id) || null
    if (!existing) return null
    record.pendingApprovalRequests = record.pendingApprovalRequests.filter((item) => String(item?.requestId || '').trim() !== id)
    record.updatedAt = Date.now()
    return existing
  }
  
  async function flushMemorySessionApprovalQueue(record) {
    if (!record || !isMemorySessionActive(record) || record.approvalPromptActive === true) return false
    const queue = Array.isArray(record.pendingApprovalRequests) ? record.pendingApprovalRequests : []
    const nextRequest = queue[0]
    if (!nextRequest) return false

    const approvalDecision = evaluateToolApproval({
      mode: resolveCurrentToolApprovalMode(record.activeRequestAbortState || null, record),
      forceApproval: nextRequest.forceApproval === true,
      hardApproval: nextRequest.hardApproval === true,
      interactive: true
    })
    if (
      (
        nextRequest.hardApproval !== true &&
        nextRequest.approvalKey &&
        sessionApprovedToolKeys.has(nextRequest.approvalKey)
      ) ||
      approvalDecision.action === 'allow'
    ) {
      removeMemorySessionApprovalRequest(record, nextRequest.requestId)
      dispatchBuiltinAgentsToolApprovalResponse(nextRequest.requestId, true)
      window.setTimeout(() => {
        void flushMemorySessionApprovalQueue(record)
      }, 0)
      return true
    }

    record.approvalPromptActive = true
    try {
      const approved = await confirmToolCall({
        serverName: nextRequest.serverName,
        toolName: nextRequest.toolName,
        argsText: nextRequest.argsText,
        reasoningText: nextRequest.reasoningText,
        abortState: createAbortAwareDialogStateFromController(getMemorySessionById(record.id)?.activeRequestAbortState || abortController.value || null),
        titleText: '确认子 Agent 工具调用',
        extraLines: nextRequest.extraLines,
        sessionId: record.id,
        sessionTitle: resolveMemorySessionTitle(record),
        approvalKind: nextRequest.approvalKind,
        hardApproval: nextRequest.hardApproval === true,
        rememberText:
          nextRequest.approvalKind === 'shell'
            ? '本会话允许相同命令'
            : nextRequest.approvalKind === 'execution'
              ? '本会话允许相同脚本调用'
              : '本会话允许此工具',
        onRememberForSession:
          nextRequest.hardApproval !== true && nextRequest.approvalKey
            ? () => sessionApprovedToolKeys.add(nextRequest.approvalKey)
            : null
      })
      removeMemorySessionApprovalRequest(record, nextRequest.requestId)
      dispatchBuiltinAgentsToolApprovalResponse(nextRequest.requestId, approved)
      if (approved === null) return true
    } finally {
      record.approvalPromptActive = false
    }
  
    if (getMemorySessionPendingApprovalCount(record) > 0) {
      window.setTimeout(() => {
        void flushMemorySessionApprovalQueue(record)
      }, 0)
    }
    return true
  }
  
  function prepareBuiltinAgentToolCallArgs(skillId, toolName, argsObj, pendingMessage) {
    const nextArgs = argsObj && typeof argsObj === 'object' && !Array.isArray(argsObj) ? { ...argsObj } : {}
    delete nextArgs.__host_workspace_path

    const normalizedSkillId = String(skillId || '').trim()
    const normalizedToolName = String(toolName || '').trim()
    if (
      normalizedSkillId === BUILTIN_SHELL_SKILL_ID &&
      [
        'sandbox_status',
        'sandbox_run',
        'bash_run',
        'sandbox_read_file',
        'sandbox_write_file',
        'sandbox_import',
        'sandbox_export',
        'sandbox_list',
        'sandbox_reset'
      ].includes(normalizedToolName)
    ) {
      const targetRecord = getRunRecord(
        pendingMessage?.toolAbortState || abortController.value || null
      ) || (pendingMessage ? getMemorySessionForToolMessage(pendingMessage) : null) || getActiveMemorySession()
      const sessionId = targetRecord?.id || activeMemorySessionId.value || 'default'
      const defaultWorkspaceId = resolveMemorySessionSandboxWorkspaceId(targetRecord)
      const withSessionWorkspace = (args) => withDefaultChatSandboxWorkspaceId(
        String(args?.workspace_id || '').trim()
          ? args
          : { ...(args || {}), workspace_id: defaultWorkspaceId },
        sessionId
      )
      if (normalizedToolName === 'sandbox_import' || normalizedToolName === 'sandbox_reset') {
        return withSessionWorkspace(nextArgs)
      }
      const workspacePath = resolveSessionHostWorkspacePath(targetRecord)
      if (normalizedToolName === 'sandbox_export') {
        const routedArgs = withSessionWorkspace(nextArgs)
        if (workspacePath) routedArgs.__host_workspace_path = workspacePath
        return routedArgs
      }
      const workspaceScope = resolveChatToolWorkspaceScope(
        normalizedToolName,
        nextArgs,
        { hasHostWorkspace: !!workspacePath }
      )
      const routedArgs = withSessionWorkspace(
        {
          ...nextArgs,
          workspace_scope: workspaceScope
        }
      )
      if (workspacePath && (workspaceScope === 'host' || workspaceScope === 'all')) {
        routedArgs.__host_workspace_path = workspacePath
      }
      return routedArgs
    }

    const isBuiltinAgentsSkill = normalizedSkillId === BUILTIN_AGENT_ORCHESTRATION_SKILL_ID
    if (!isBuiltinAgentsSkill || !isAgentRunToolName(toolName)) return nextArgs

    const streamId = String(pendingMessage?.toolTraceStreamId || pendingMessage?.id || '').trim()
    const approvalMode = resolveCurrentToolApprovalMode(
      pendingMessage?.toolAbortState || abortController.value || null
    )
    if (streamId) {
      // Keep legacy/internal key and a plain key to avoid middleware stripping prefixed fields.
      nextArgs.__trace_stream_id = streamId
      nextArgs.trace_stream_id = streamId
    }
    // Keep legacy/internal key and a plain key for better cross-provider compatibility.
    nextArgs.__tool_approval_mode = approvalMode
    nextArgs.tool_approval_mode = approvalMode
  
    if (pendingMessage) {
      pendingMessage.toolTraceStreamId = streamId
      pendingMessage.toolApprovalMode = approvalMode
      if (streamId) activeAgentRunToolMessageByStreamId.set(streamId, pendingMessage)
      if (hasPendingBuiltinAgentsEvents(streamId)) {
        flushPendingBuiltinAgentsEvents()
      }
    }
  
    return nextArgs
  }
  
  function dispatchBuiltinAgentsToolApprovalResponse(requestId, approved) {
    const id = String(requestId || '').trim()
    if (!id || !window?.dispatchEvent || typeof window.CustomEvent !== 'function') return
    try {
      window.dispatchEvent(
        new window.CustomEvent(BUILTIN_AGENTS_TOOL_APPROVAL_RESPONSE_EVENT, {
          detail: {
            requestId: id,
            approved: approved === true ? true : approved === false ? false : null
          }
        })
      )
    } catch {
      // ignore
    }
  }
  
  function createAbortAwareDialogStateFromController(controller = null) {
    if (controller?.onAbort) {
      return {
        onAbort(listener) {
          if (typeof listener !== 'function') return null
          return controller.onAbort(listener)
        }
      }
    }
    const signal = controller?.signal
    if (!signal?.addEventListener) return null
    return {
      onAbort(listener) {
        if (typeof listener !== 'function') return null
        const handler = () => listener()
        signal.addEventListener('abort', handler, { once: true })
        return () => {
          try {
            signal.removeEventListener('abort', handler)
          } catch {
            // ignore
          }
        }
      }
    }
  }
  
  async function handleBuiltinAgentsToolApprovalRequest(event) {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
    const requestId = String(detail.requestId || '').trim()
    if (!requestId) return
  
    const serverId = String(detail.serverId || '').trim()
    const serverName = String(detail.serverName || serverId || '').trim() || '未知'
    const toolName = String(detail.toolName || '').trim() || 'unknown'
    const argsText = String(detail.argsText || '{}').trim() || '{}'
    const reasoningText = String(detail.reasoningText || '').trim()
    const agentName = String(detail.agentName || '').trim()
    const extraLines = agentName ? ['智能体：' + agentName] : []
  
    const streamId = String(detail.streamId || detail.traceStreamId || detail.trace_stream_id || '').trim()
    const relatedToolMessage = streamId ? resolveActiveAgentRunToolMessage(streamId) : null
    const targetRecord = relatedToolMessage ? getMemorySessionForToolMessage(relatedToolMessage) : getActiveMemorySession()
    const approvalKind =
      detail.approvalKind === 'shell'
        ? 'shell'
        : detail.approvalKind === 'execution'
          ? 'execution'
          : 'tool'
    const forceApproval =
      detail.forceApproval === true ||
      approvalKind === 'shell'
    const hardApproval = detail.hardApproval === true
    const approvalKey = buildSessionToolApprovalKey({
      sessionId: String(targetRecord?.id || 'chat'),
      serverId,
      serverName,
      toolName,
      approvalKind,
      argsText
    })
    const inheritedMode = resolveCurrentToolApprovalMode(
      targetRecord?.activeRequestAbortState || null,
      targetRecord
    )
    const autoApproved =
      (hardApproval !== true && sessionApprovedToolKeys.has(approvalKey)) ||
      evaluateToolApproval({
        mode: inheritedMode,
        forceApproval,
        hardApproval,
        interactive: true
      }).action === 'allow'

    let approved = null
    if (autoApproved) {
      approved = true
    } else {
      enqueueMemorySessionApprovalRequest(targetRecord, {
        requestId,
        serverId,
        serverName,
        toolName,
        argsText,
        reasoningText,
        approvalKind,
        forceApproval,
        hardApproval,
        approvalKey,
        streamId,
        agentName,
        extraLines
      })
      if (isMemorySessionActive(targetRecord)) {
        await flushMemorySessionApprovalQueue(targetRecord)
      }
      return
    }
  
    dispatchBuiltinAgentsToolApprovalResponse(requestId, approved)
  }
  
  
  


  function stop() {
    abortController.value?.abort()
    typewriterFlushAll()
  }
  
  onBeforeUnmount(() => {
    chatMessageEstimatedHeightCache.clear()
    cancelPendingToolApprovals()
    sessionApprovedToolKeys.clear()
    chatRunInputQueue.clearAll()
    touchChatRunInputQueue()
    queuedInputDrainTimers.forEach((timer) => window.clearTimeout(timer))
    queuedInputDrainTimers.clear()
    queuedInputDrainInFlight.clear()
    cleanupPendingBuiltinAgentsEvents()
    try {
      window?.removeEventListener?.(BUILTIN_AGENTS_TRACE_EVENT, handleBuiltinAgentsTraceEvent)
    } catch {
      // ignore
    }
    try {
      window?.removeEventListener?.(BUILTIN_AGENTS_TOOL_APPROVAL_REQUEST_EVENT, handleBuiltinAgentsToolApprovalRequest)
    } catch {
      // ignore
    }
    try {
      window?.removeEventListener?.('resize', syncChatResponsiveState)
    } catch {
      // ignore
    }
    disconnectChatLayoutResizeObserver()
    disconnectChatMessageVisibilityObserver()
    clearChatVirtualItemRemeasure()
    clearStickyChatBubbleSync()
    setStickyChatBubbleState(null)
    cleanupChatPreviewLinkHandlers()
    try {
      abortController.value?.abort()
    } catch {
      // ignore
    }
    detachedMediaAbortStates.forEach((state) => {
      try {
        state?.abort?.()
      } catch {
        // ignore
      }
    })
    detachedMediaAbortStates.clear()
    try {
      typewriterFlushAll()
    } catch {
      // ignore
    }
    try {
      closeAllPooledMCPClients()
    } catch {
      // ignore
    }
  })
  
  function handleUserEditKeydown(e, msg) {
    if (!msg || !msg.editing) return
    if (sending.value) return
    if (isComposerCompositionKeydownEvent(e)) return
  
    if (e.key === 'Escape') {
      e.preventDefault()
      msg.editing = false
      msg.editDraft = ''
      return
    }
  
    if (shouldSubmitComposerKeydownEvent(e)) {
      e.preventDefault()
      toggleOrSubmitUserEdit(msg)
    }
  }
  
  function clearAllUserEditingState() {
    ;(session.messages || []).forEach((m) => {
      if (m?.role !== 'user') return
      if (m.editing) {
        m.editing = false
        m.editDraft = ''
      }
    })
    scheduleRefreshUserAnchorMeta()
  }
  
  const {
    isFiniteNumber,
    resolveUserApiIndexForDisplayMessage,
    getUserApiMessageContentByIndex,
    messageHasDisplayAttachments,
    findNearestUserApiIndexBefore,
    findDisplayIndexByApiIndex,
    truncateConversationAfterUser
  } = useChatUserMessageIndexing({
    getSession: () => session,
    contentHasUserAttachments
  })
  
  function resetComposerInput() {
    composerInputKey.value += 1
  }
  
  function getRequestConfigOrHint() {
    const provider = selectedProvider.value
    if (!provider) {
      message.warning('请先选择服务商 / 模型')
      showModelModal.value = true
      return null
    }
  
    if (isUtoolsBuiltinProvider(provider)) {
      if (!canUseUtoolsAi()) {
        message.warning('当前环境不支持内置 uTools AI 服务商，请在 uTools 插件环境中使用。')
        return null
      }
  
      const model = String(selectedModel.value || '').trim()
      if (!model) {
        message.warning('请先选择模型')
        showModelModal.value = true
        return null
      }
  
      const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
      const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
      if (
        imageMode === 'on' ||
        (imageMode === 'auto' && isLikelyImageGenerationModel(model)) ||
        videoMode === 'on' ||
        (videoMode === 'auto' && isLikelyVideoGenerationModel(model))
      ) {
        message.warning('当前页面会将 uTools 内置 AI 按文本聊天处理，不支持直接图片/视频生成，请改用兼容 OpenAI 的服务商。')
        return null
      }
  
      return {
        providerKind: 'utools-ai',
        providerId: String(provider._id || '').trim(),
        model,
        requestMode: 'chat',
        imageGenerationPlaceholderMode: 'text',
        supportsVision: false
      }
    }
  
    const baseUrl = provider.baseurl
    const apiKey = provider.apikey
    if (!baseUrl || !apiKey) {
      message.warning('请先配置服务商接口地址 / API 密钥')
      return null
    }
  
    const model = String(selectedModel.value || '').trim()
    if (!model) {
      message.warning('请先选择模型')
      showModelModal.value = true
      return null
    }
  
    const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
    const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
    const apiMode = normalizeProviderApiMode(provider.apiMode)
    const modelType = getProviderModelType(provider, model)
    if (modelType === 'embedding') {
      message.warning('当前模型被标记为向量模型，不能用于聊天。请切换模型或在服务商设置中调整模型用途。')
      showModelModal.value = true
      return null
    }
    const useManualImageGeneration = imageMode === 'on'
    const useAutoImageGeneration =
      imageMode === 'auto' &&
      (modelType === 'image-generation' || (modelType === 'auto' && isLikelyImageGenerationModel(model)))
    const useManualVideoGeneration = videoMode === 'on'
    const useAutoVideoGeneration =
      videoMode === 'auto' &&
      (modelType === 'video-generation' || (modelType === 'auto' && isLikelyVideoGenerationModel(model)))
    const requestMode =
      useManualVideoGeneration
        ? 'video-generation'
        : useManualImageGeneration
        ? 'image-generation'
        : videoMode === 'off' && imageMode === 'off'
          ? 'chat'
          : useAutoVideoGeneration
            ? 'video-generation'
          : useAutoImageGeneration
            ? 'image-generation'
            : 'chat'
    const imageGenerationRequestOptions = (useManualImageGeneration || useAutoImageGeneration)
      ? getCurrentImageGenerationRequestOptions()
      : {}
    const videoGenerationRequestOptions = (useManualVideoGeneration || useAutoVideoGeneration)
      ? getCurrentVideoGenerationRequestOptions()
      : {}
  
    return {
      providerKind: 'openai-compatible',
      providerId: String(provider._id || '').trim(),
      baseUrl,
      apiKey,
      apiMode,
      model,
      modelType,
      requestMode,
      imageGenerationPlaceholderMode: useManualImageGeneration ? 'image' : 'text',
      videoGenerationPlaceholderMode: useManualVideoGeneration ? 'video' : 'text',
      imageGenerationRequestOptionsOverride: imageGenerationRequestOptions,
      videoGenerationRequestOptionsOverride: videoGenerationRequestOptions,
      supportsVision: requestMode === 'chat'
    }
  }
  
  function getCurrentToolsKey() {
    const mcpKey = (activeMcpIds.value || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .sort()
      .join(',')
  
    const skillKey = (selectedSkillObjects.value || [])
      .map((skill) => {
        const id = String(skill?._id || '').trim()
        const actionCount = Array.isArray(skill?.nativeActions) ? skill.nativeActions.length : 0
        return `${id}:${String(skill?.sourceType || '')}:${actionCount}`
      })
      .filter(Boolean)
      .sort()
      .join(',')
  
    const mcpConfigKey = (activeMcpServers.value || [])
      .map((s) => {
        if (!s || !s._id) return ''
        const id = String(s._id || '').trim()
        const disabled = s.disabled ? 1 : 0
        const allow = Array.isArray(s.allowTools)
          ? s.allowTools.map((x) => String(x || '').trim()).filter(Boolean).sort().join('|')
          : ''
        const transport = String(s.transportType || '')
        const url = String(s.url || '')
        const command = String(s.command || '')
        return `${id}:${disabled}:${transport}:${url}:${command}:${allow}`
      })
      .filter(Boolean)
      .sort()
      .join(';')
  
    return `${toolMode.value}|${mcpToolsRevision.value}|${skillKey}|${mcpConfigKey}|${mcpKey}`
  }
  
  function syncLastBuiltRequestToolsStats(tools) {
    const list = Array.isArray(tools) ? tools : []
    lastBuiltRequestToolsStats.key = getCurrentToolsKey()
    lastBuiltRequestToolsStats.count = list.length
    lastBuiltRequestToolsStats.chars = estimateToolDefinitionsChars(list)
    lastBuiltRequestToolsStats.updatedAt = Date.now()
    lastBuiltRequestToolsStats.mode = String(effectiveToolMode.value || 'expanded')
  }
  
  function dispatchBuiltinAgentsToolApprovalModeChange(record, mode) {
    const sessionId = String(record?.id || '').trim()
    if (!sessionId) return false
    const streamIds = []
    for (const [streamId, toolMessage] of activeAgentRunToolMessageByStreamId) {
      const owner = getMemorySessionForToolMessage(toolMessage)
      if (String(owner?.id || '').trim() !== sessionId) continue
      const normalizedStreamId = String(streamId || '').trim()
      if (normalizedStreamId) streamIds.push(normalizedStreamId)
      if (toolMessage && typeof toolMessage === 'object') {
        toolMessage.toolApprovalMode = mode
      }
    }
    if (!streamIds.length) return false
    try {
      window.dispatchEvent(
        new window.CustomEvent(BUILTIN_AGENTS_TOOL_APPROVAL_MODE_CHANGE_EVENT, {
          detail: {
            sessionId,
            streamIds,
            toolApprovalMode: mode
          }
        })
      )
      return true
    } catch {
      return false
    }
  }

  function updateContextTokenTelemetry(record, usage, {
    requestChars = 0,
    providerId = '',
    model = '',
    endpoint = ''
  } = {}) {
    if (!record || typeof record !== 'object') return
    const metrics = extractContextTokenMetrics(usage)
    const normalizedRequestChars = Math.max(0, Math.floor(Number(requestChars) || 0))
    if (!metrics.inputTokens || !normalizedRequestChars) return

    record.contextTokenTelemetry = {
      inputTokens: metrics.inputTokens,
      requestChars: normalizedRequestChars,
      cachedTokens: metrics.cachedTokens,
      providerId: String(providerId || ''),
      model: String(model || ''),
      endpoint: String(endpoint || ''),
      updatedAt: Date.now()
    }
  }

  function recordModelUsage(usage, {
    providerId = selectedProviderId.value,
    model = '',
    endpoint = '',
    purpose = 'chat'
  } = {}) {
    if (!usage || typeof usage !== 'object') return
    const recorder = window?.aiToolsApi?.usage?.recordUsage
    if (typeof recorder !== 'function') return
    void recorder({
      usage,
      providerId: String(providerId || ''),
      model: String(model || ''),
      endpoint: String(endpoint || ''),
      purpose: String(purpose || '')
    }).catch((error) => {
      console.warn('记录模型用量失败：', error)
    })
  }

  function recordModelUsageFromPayload(payload, options = {}) {
    recordModelUsage(extractModelUsage(payload), options)
  }

  async function injectPendingGuidanceMessages(abortState, { preferVision = false } = {}) {
    const runRecord = runRecordByAbortState.get(abortState)
    if (!runRecord) return false

    const entries = chatRunInputQueue.takeSteering(runRecord.id)
    if (!entries.length) return false
    touchChatRunInputQueue()

    let completedCount = 0
    try {
      for (const entry of entries) {
        throwIfAborted(abortState)
        const text = String(entry?.text || '').trim()
        const attachments = Array.isArray(entry?.attachments) ? entry.attachments : []
        const userDisplay = createDisplayMessage('user', text || (attachments.length ? '(sent attachments)' : ''), {
          guidance: true
        })
        if (attachments.length) {
          userDisplay.attachmentsExpanded = false
          userDisplay.attachments = attachments
        }
        runRecord.messages.push(userDisplay)
        try {
          await prepareUserApiMessage({
            text,
            attachments,
            userDisplay,
            preferVision,
            providerKind: 'openai-compatible',
            sessionTarget: runRecord
          })
        } catch (error) {
          const displayIndex = runRecord.messages.findIndex((item) => item?.id === userDisplay.id)
          if (displayIndex >= 0) runRecord.messages.splice(displayIndex, 1)
          throw error
        }
        completedCount += 1
      }
    } catch (error) {
      chatRunInputQueue.restore(runRecord.id, entries.slice(completedCount))
      touchChatRunInputQueue()
      throw error
    }

    runRecord.updatedAt = Date.now()
    await maybeScrollToBottomForRun(abortState)
    return true
  }

  async function maybeCompactContextInline(targetSession, tools, abortState, requestCfg = {}) {
    if (!targetSession || typeof targetSession !== "object") return false
    const sourceMessages = Array.isArray(targetSession.apiMessages) ? targetSession.apiMessages : []
    if (sourceMessages.length < 4) return false
    const reservedChars = calculateReservedRequestChars({ systemContent: systemContent.value, tools })
    const sourceChars = estimateMessagesSize(sourceMessages)
    const tokenTelemetry = getContextTokenTelemetry(targetSession)
    const budgetPlan = resolveChatContextWindowBudgetPlan(effectiveContextWindowConfig.value, {
      reservedChars,
      sourceChars,
      reportedInputTokens: tokenTelemetry.inputTokens,
      reportedRequestChars: tokenTelemetry.requestChars,
      modelContextTokens: resolveModelContextWindowTokens(selectedProvider.value, selectedModel.value)
    })
    if (budgetPlan.mode !== "compact" || budgetPlan.reason !== "auto_threshold") return false
    const summaryTriggerChars = calculateContextSummaryTriggerChars({ historyCharsBudget: budgetPlan.historyCharsBudget })
    const summaryText = await ensureContextWindowSummary({
      cfg: {
        requestMode: "chat",
        providerKind: "openai-compatible",
        providerId: String(requestCfg.providerId || "").trim(),
        baseUrl: requestCfg.baseUrl,
        apiKey: requestCfg.apiKey,
        apiMode: normalizeProviderApiMode(requestCfg.apiMode),
        model: requestCfg.model
      },
      requestRecord: targetSession,
      tools,
      reservedCharsOverride: reservedChars,
      targetSourceChars: summaryTriggerChars,
      force: false
    }).catch((err) => {
      console.warn("[chat context summary] inline compact failed:", err)
      return ""
    })
    return !!String(summaryText || "").trim()
  }

  function pushCompactResumeStep(targetSession, abortState) {
    if (!targetSession || typeof targetSession !== "object") return
    const step = createDisplayMessage("user", "", {
      guidance: true,
      compactGuidance: true,
      content: "（较早历史已压缩，继续处理中）"
    })
    targetSession.messages.push(step)
    maybeScrollToBottomForRun(abortState)
  }
  async function runChatRounds({
    providerId = '',
    baseUrl,
    apiKey,
    apiMode = 'auto',
    model,
    signal,
    setCurrentAssistantDisplay,
    abortState = null,
    assistantPlaceholderMode = 'text',
    supportsVision = false,
    memorySystemContent = ''
  }) {
    const targetSession = getRunSessionTarget(abortState)
    let tools = []
    let toolMap = new Map()
    let lastToolsKey = ''
  
    const refreshToolsBundleIfNeeded = async () => {
      if (lastToolsKey) return
      const key = getCurrentToolsKey()
      const bundle = await buildToolsBundle({ abortState })
      tools = Array.isArray(bundle?.tools) ? bundle.tools : []
      toolMap = bundle?.map instanceof Map ? bundle.map : new Map()
      lastToolsKey = key
    }
  
    throwIfAborted(abortState)
    await refreshToolsBundleIfNeeded()
    // Do not impose a fixed round limit: long searches can legitimately need many
    // distinct tool calls. Identical consecutive batches are still stopped by the
    // repeated-call guard below, and the user can abort the run at any time.
    let omitReasoningEffort = false
    let forceReasoningContent = false
    let imagesFallbackToText = false
    let compatFcToolCallId = isFcToolCallIdCompatEnabled(baseUrl)
    let plainTextToolFallback = false
    let parallelToolCallsMode = 'enabled'
    let repeatedToolCallRecoveryPending = false
    const repeatedToolCallGuard = createRepeatedToolCallGuard({ maxConsecutive: 3 })

    for (let round = 0; ; round += 1) {
      throwIfAborted(abortState)
      await refreshToolsBundleIfNeeded()
      if (round > 0) {
        const inlineCompacted = await maybeCompactContextInline(targetSession, tools, abortState, {
          providerId,
          baseUrl,
          apiKey,
          apiMode,
          model
        })
        if (inlineCompacted) pushCompactResumeStep(targetSession, abortState)
        await injectPendingGuidanceMessages(abortState, { preferVision: supportsVision })
      }
      const assistantDisplay = createDisplayMessage('assistant', '', {
        thinking: '',
        thinkingExpanded: false,
        streaming: true,
        render: 'md',
        transientRequestPlaceholder: String(assistantPlaceholderMode || 'text').trim().toLowerCase() !== 'text'
      })
      applyAssistantRequestPlaceholderMode(assistantDisplay, assistantPlaceholderMode)
      let assistantDisplayMounted = false
      const ensureAssistantDisplayMounted = () => {
        if (assistantDisplayMounted) return assistantDisplay
        targetSession.messages.push(assistantDisplay)
        setCurrentAssistantDisplay(assistantDisplay)
        assistantDisplayMounted = true
        return assistantDisplay
      }
  
      let lastReasoningText = ''
  
      const onDelta = (evt) => {
        if (abortState?.aborted || signal?.aborted) return
        if (evt?.type === 'content' && evt.delta) {
          prepareAssistantDisplayForTextResponse(assistantDisplay)
          ensureAssistantDisplayMounted()
          typewriterEnqueue(assistantDisplay, String(evt.delta))
        }
  
        if (evt?.type === 'reasoning' && evt.delta) {
          prepareAssistantDisplayForTextResponse(assistantDisplay)
          ensureAssistantDisplayMounted()
          deferredAppendMessageField(assistantDisplay, 'thinking', String(evt.delta), { scheduleScroll: true })
          lastReasoningText = String(evt.reasoning || '')
        }
      }

      let result = null
      let successfulRequestChars = 0
      const isRepeatedToolCallRecoveryRound = repeatedToolCallRecoveryPending
      for (let attempt = 0; attempt < 3; attempt++) {
          // A loop recovery round is deliberately tool-free so the model can
          // explain the current result instead of immediately entering the same
          // call sequence again.
          const activeTools = plainTextToolFallback || isRepeatedToolCallRecoveryRound ? [] : tools
          const attemptBody = {
            model,
            stream: true,
            messages: buildRequestMessages({
              baseUrl,
              model,
              memorySystemContent,
              sessionRecord: targetSession,
              forceReasoningContent,
              compatToolCallIdAsFc: compatFcToolCallId,
              fallbackAllVisionMessages: imagesFallbackToText,
              tools: activeTools,
              apiMessages: buildRequestApiMessages('openai-compatible', {
                tools: activeTools,
                apiMessages: targetSession.apiMessages,
                contextSummary: targetSession?.contextSummary || null,
                sessionRecord: targetSession
              }),
              plainTextToolFallback
            }),
            ...(activeTools.length
              ? {
                  tools: activeTools,
                  tool_choice: 'auto',
                  ...(parallelToolCallsMode === 'enabled' ? { parallel_tool_calls: true } : {})
                }
              : {}),
            ...buildActiveRequestOverrides({ omitReasoningEffort })
          }
          const attemptRequestChars =
            estimateMessagesSize(attemptBody.messages) +
            estimateToolDefinitionsChars(attemptBody.tools)

        try {
          result = await streamChatCompletion({
            baseUrl,
            apiKey,
            apiMode,
            body: attemptBody,
            signal,
            onDelta,
            abortState
          })
          throwIfAborted(abortState)
          successfulRequestChars = attemptRequestChars
          break
        } catch (err) {
          const errText = String(err?.message || err || '')
          if (isAbortError(err) || abortState?.aborted || signal?.aborted) throw createAbortError()
  
          if (!compatFcToolCallId && errText.includes("Expected an ID that begins with 'fc'") && errText.includes('input[') && errText.includes('.id')) {
            compatFcToolCallId = true
            enableFcToolCallIdCompat(baseUrl)
            message.warning("检测到当前端点要求工具调用 ID 以 fc_ 开头，已启用兼容模式（tool_calls.id: call_ -> fc_）。")
            continue
          }
  
          const hasVision = (targetSession.apiMessages || []).some((msg) => messageContentHasImageUrl(msg?.content))
          if (!imagesFallbackToText && hasVision && shouldFallbackVisionInputToText(errText)) {
            imagesFallbackToText = true
            message.warning('当前端点不支持 image_url 输入。本次请求已自动改为纯文本发送，模型将无法直接理解图片。')
            continue
          }
  
          if (!omitReasoningEffort && thinkingEffort.value !== 'auto' && errText.includes('reasoning_effort')) {
            // 部分接口不支持 reasoning_effort，自动回退为不传该字段
            omitReasoningEffort = true
            continue
          }
  
          if (parallelToolCallsMode === 'enabled' && shouldRetryWithoutParallelToolCalls(errText)) {
            parallelToolCallsMode = 'disabled'
            continue
          }
  
          if (!plainTextToolFallback && hasToolStateMessages(targetSession.apiMessages) && shouldRetryToolContinuationAsPlainText(errText)) {
            plainTextToolFallback = true
            message.warning('当前端点的工具续跑接口临时不可用，已改为用纯文本工具结果继续回答。')
            continue
          }
  
          if (!forceReasoningContent) {
            if (shouldRetryWithReasoningContent(errText)) {
              // DeepSeek thinking_mode 下，后续请求里的 assistant 消息需要带上 reasoning_content
              forceReasoningContent = true
              continue
            }
          }
  
          throw err
        }
      }
  
      if (!result) {
        throw new Error('请求失败：已达到重试次数上限')
      }
      throwIfAborted(abortState)
      recordModelUsage(result?.usage, {
        providerId,
        model,
        endpoint: result?.endpoint || apiMode || 'auto',
        purpose: round > 0 ? 'chat-tool-round' : 'chat'
      })
      updateContextTokenTelemetry(targetSession, result?.usage, {
        requestChars: successfulRequestChars,
        providerId,
        model,
        endpoint: result?.endpoint || apiMode || 'auto'
      })

      if (result?.content && !assistantDisplay.content && !typewriterStates.has(assistantDisplay.id)) {
        prepareAssistantDisplayForTextResponse(assistantDisplay)
        ensureAssistantDisplayMounted()
        typewriterEnqueue(assistantDisplay, String(result.content || ''))
      }
  
      await Promise.all([
        typewriterWaitIdle(assistantDisplay.id),
        deferredMessageFieldWaitIdle(assistantDisplay.id, 'thinking')
      ])
      assistantDisplay.streaming = false
      assistantDisplay.render = 'md'
      typewriterStates.delete(assistantDisplay.id)
      const assistantImages = await persistChatMediaListAssets(
        extractChatImagesFromToolResult(result?.payloads?.length ? result.payloads : result),
        { kind: 'image', messageId: assistantDisplay.id }
      )
      const assistantVideos = await persistChatMediaListAssets(
        extractChatVideosFromToolResult(result?.payloads?.length ? result.payloads : result),
        { kind: 'video', messageId: assistantDisplay.id }
      )
      if (assistantImages.length) {
        assistantDisplay.images = assistantImages
        assistantDisplay.transientRequestPlaceholder = false
        clearAssistantMediaBubblePlaceholders(assistantDisplay)
        ensureAssistantDisplayMounted()
      }
      if (assistantVideos.length) {
        assistantDisplay.videos = assistantVideos
        assistantDisplay.transientRequestPlaceholder = false
        clearAssistantMediaBubblePlaceholders(assistantDisplay)
        ensureAssistantDisplayMounted()
      }
      maybeScheduleScrollToBottomForRun(abortState)
  
      const normalizedToolCalls = normalizeAssistantToolCalls(result?.toolCalls, {
        createFallbackId: () => `call_${newId()}`
      })
  
      targetSession.apiMessages.push({
        role: 'assistant',
        content: String(result.content || ''),
        ...(normalizedToolCalls.length ? { tool_calls: normalizedToolCalls } : {}),
        reasoning_content: String(result.reasoning ?? '')
      })
      assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
  
      if (!assistantDisplay.content.trim() && normalizedToolCalls.length && !String(assistantDisplay.thinking || '').trim()) {
        const idx = targetSession.messages.findIndex((m) => m.id === assistantDisplay.id)
        if (idx !== -1) targetSession.messages.splice(idx, 1)
      }
      if (
        !assistantDisplay.content.trim() &&
        !normalizedToolCalls.length &&
        !(Array.isArray(assistantDisplay.images) && assistantDisplay.images.length) &&
        !(Array.isArray(assistantDisplay.videos) && assistantDisplay.videos.length)
      ) {
        prepareAssistantDisplayForTextResponse(assistantDisplay)
        assistantDisplay.content = buildEmptyAssistantResponseText(targetSession.apiMessages)
        ensureAssistantDisplayMounted()
      }
  
      setCurrentAssistantDisplay(null)
      await maybeScrollToBottomForRun(abortState)
  
      if (!normalizedToolCalls.length) {
        const guidanceInjected =
          !isRepeatedToolCallRecoveryRound
            ? await injectPendingGuidanceMessages(abortState, { preferVision: supportsVision })
            : false
        if (guidanceInjected) continue
        break
      }

      if (isRepeatedToolCallRecoveryRound) {
        // A provider should not return tool calls when no tools were supplied.
        // If it does, do not execute hallucinated calls or leave an unmatched
        // tool_calls message in the persisted API history.
        const fallbackText = '任务已暂停：工具连续返回了相同调用，系统为避免循环已停止。请补充更明确的目标后重试。'
        const recoveryApiMessage = targetSession.apiMessages[assistantDisplay.apiIndex]
        if (recoveryApiMessage && typeof recoveryApiMessage === 'object') {
          recoveryApiMessage.content = fallbackText
          delete recoveryApiMessage.tool_calls
        }
        prepareAssistantDisplayForTextResponse(assistantDisplay)
        assistantDisplay.content = fallbackText
        assistantDisplay.thinking = ''
        ensureAssistantDisplayMounted()
        await maybeScrollToBottomForRun(abortState)
        break
      }

      const repeatedToolCallState = repeatedToolCallGuard.observe(normalizedToolCalls)
      if (repeatedToolCallState.blocked) {
        const stopText = [
          '系统已阻止本批工具执行：检测到相同工具和参数连续调用 3 次。',
          '不要再次调用任何工具。请根据已经获得的结果，直接向用户说明当前进展、阻塞原因和可行的下一步；不要复述这条内部提示。'
        ].join('\n')
        normalizedToolCalls.forEach((toolCall) => {
          targetSession.apiMessages.push(createToolResultApiMessage(toolCall, stopText, {
            ok: false,
            status: 'stopped'
          }))
        })
        repeatedToolCallRecoveryPending = true
        repeatedToolCallGuard.reset()
        await maybeScrollToBottomForRun(abortState)
        continue
      }

      const toolExecResults = await executeToolCallsParallel(
        normalizedToolCalls,
        toolMap,
        lastReasoningText || String(result.reasoning || ''),
        abortState
      )
  
      for (let index = 0; index < normalizedToolCalls.length; index += 1) {
        const toolCall = normalizedToolCalls[index]
        const exec = toolExecResults[index]
        throwIfAborted(abortState)
        targetSession.apiMessages.push(createToolResultApiMessage(toolCall, exec?.content, {
          ok: exec?.ok
        }))
        const latestUserPrompt = getLatestRealUserPromptText(targetSession.apiMessages)
        const shouldAttachToolImages =
          String(exec?.toolName || '').trim() === 'notes_read' ||
          shouldAutoAttachToolImagesForVision(latestUserPrompt)
        if (supportsVision && shouldAttachToolImages && Array.isArray(exec?.images) && exec.images.length) {
          const syntheticVisionMessage = buildToolVisionUserMessage({
            images: exec.images,
            serverName: exec.serverName || toolCall?.function?.name || '',
            toolName: exec.toolName || toolCall?.function?.name || '',
            userPrompt: latestUserPrompt
          })
          if (syntheticVisionMessage) {
            targetSession.apiMessages.push(syntheticVisionMessage)
          }
        }
      }
    }
  }
  
  function mergeUtoolsAiStreamText(previous, incoming) {
    const next = String(incoming || '')
    if (!next) {
      return {
        delta: '',
        total: String(previous || '')
      }
    }
  
    const current = String(previous || '')
    if (current && next.startsWith(current)) {
      return {
        delta: next.slice(current.length),
        total: next
      }
    }
  
    return {
      delta: next,
      total: current + next
    }
  }
  
  async function runUtoolsAiChatRound({
    providerId = '',
    model,
    setCurrentAssistantDisplay,
    setAbortHandle,
    isAborted,
    abortState = null
  }) {
    if (!canUseUtoolsAi()) {
      throw new Error('当前环境不支持 uTools 官方 AI')
    }
  
    const targetSession = getRunSessionTarget(abortState)
    throwIfAborted(abortState)
    const bundle = await buildToolsBundle({ abortState })
    const tools = Array.isArray(bundle?.tools) ? bundle.tools : []
    const toolMap = bundle?.map instanceof Map ? bundle.map : new Map()
    const assistantSegments = []
    let assistantDisplay = null
  
    const createStreamingAssistantDisplay = () => {
      const msg = createDisplayMessage('assistant', '', {
        thinking: '',
        thinkingExpanded: false,
        streaming: true,
        render: 'md'
      })
      assistantSegments.push(msg)
      assistantDisplay = msg
      targetSession.messages.push(msg)
      setCurrentAssistantDisplay(msg)
      return msg
    }
  
    const hasVisibleAssistantContent = (msg) => {
      return !!String(msg?.content || '').trim() || !!String(msg?.thinking || '').trim()
    }
  
    const finalizeStreamingAssistantDisplay = async (options = {}) => {
      const removeIfEmpty = !!options.removeIfEmpty
      const current = assistantDisplay
      if (!current) return null
  
      await Promise.all([
        typewriterWaitIdle(current.id),
        deferredMessageFieldWaitIdle(current.id, 'thinking')
      ])
      current.streaming = false
      current.render = 'md'
      typewriterStates.delete(current.id)
  
      if (removeIfEmpty && !hasVisibleAssistantContent(current)) {
        const idx = targetSession.messages.findIndex((m) => m.id === current.id)
        if (idx !== -1) targetSession.messages.splice(idx, 1)
      }
  
      assistantDisplay = null
      setCurrentAssistantDisplay(null)
      maybeScheduleScrollToBottomForRun(abortState)
      return current
    }
  
    const ensureStreamingAssistantDisplay = () => assistantDisplay || createStreamingAssistantDisplay()
  
    let streamedContent = ''
    let streamedReasoning = ''
    let toolInvokeCount = 0
    const utoolsToolFallbackRecords = []
  
    const buildUtoolsToolFallbackPrompt = () => {
      const records = utoolsToolFallbackRecords
        .map((record, index) => {
          const serverName = String(record.serverName || '').trim()
          const toolName = String(record.toolName || record.name || '').trim()
          const args = truncateText(record.argsText || '{}', 1200, '（工具参数已截断）')
          const content = truncateText(record.content || '', 24000, '（工具结果已截断）')
          return [
            `### 工具结果 ${index + 1}`,
            serverName || toolName ? `工具：${[serverName, toolName].filter(Boolean).join(' / ')}` : '',
            `参数：${args}`,
            '结果：',
            content || '（空结果）'
          ].filter(Boolean).join('\n')
        })
        .filter(Boolean)
        .join('\n\n')
  
      return [
        '系统补充：刚才已经完成了工具调用，但当前 uTools AI 工具续跑接口临时不可用。',
        '请直接基于下面的工具结果回答用户刚才的问题；如果资料不足，请说明不足之处。',
        records
      ].filter(Boolean).join('\n\n')
    }

    const memorySystemContent = String(abortState?.memorySystemContent || '').trim()
    let lastUtoolsRequestChars = 0
    const requestUtoolsAi = (requestApiMessages, requestTools = tools) => {
      const requestMessages = buildUtoolsAiMessages({
        systemContent: buildCombinedSystemContent(memorySystemContent, { sessionRecord: targetSession }),
        apiMessages: requestApiMessages
      })
      lastUtoolsRequestChars =
        estimateMessagesSize(requestMessages) +
        estimateToolDefinitionsChars(requestTools)
      return window.utools.ai(
        {
          model,
          messages: requestMessages,
          ...(requestTools.length ? { tools: requestTools } : {})
        },
        (chunk) => {
          if (abortState?.aborted || isAborted?.()) return
          const contentState = mergeUtoolsAiStreamText(streamedContent, chunk?.content)
          streamedContent = contentState.total
          if (contentState.delta) {
            ensureStreamingAssistantDisplay()
            typewriterEnqueue(assistantDisplay, contentState.delta)
          }
  
          const reasoningState = mergeUtoolsAiStreamText(streamedReasoning, extractUtoolsAiReasoningText(chunk))
          streamedReasoning = reasoningState.total
          if (reasoningState.delta) {
            ensureStreamingAssistantDisplay()
            deferredAppendMessageField(assistantDisplay, 'thinking', reasoningState.delta, { scheduleScroll: true })
          }
        }
      )
    }
  
    const unregisterToolFns = registerUtoolsAiToolFunctions({
      tools,
      invokeTool: async (name, argsObj) => {
        throwIfAborted(abortState)
        toolInvokeCount += 1
        await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })
  
        const argsText = stableStringify(argsObj || {})
        const exec = await executeToolCall(
          {
            id: `utools_call_${newId()}`,
            type: 'function',
            function: {
              name,
              arguments: argsText || '{}'
            }
          },
          toolMap,
          streamedReasoning,
          abortState
        )
  
        const raw = formatToolResultContentForModel(exec?.content, {
          ok: exec?.ok
        })
        utoolsToolFallbackRecords.push({
          name,
          argsText,
          content: raw,
          serverName: exec?.serverName || '',
          toolName: exec?.toolName || name
        })
        const parsed = safeJsonParse(raw)
        if (exec?.serverName === '内置联网' || exec?.toolName === 'web_search' || exec?.toolName === 'web_read') {
          return raw
        }
        return parsed.ok ? parsed.value : raw
      }
    })
  
    try {
      const requestApiMessages = buildRequestApiMessages('utools-ai', {
        tools,
        apiMessages: targetSession.apiMessages,
        contextSummary: targetSession?.contextSummary || null,
        sessionRecord: targetSession
      })
      let request = requestUtoolsAi(requestApiMessages, tools)
      setAbortHandle(request)
      let result = null
      try {
        result = await request
      } catch (err) {
        const errText = err?.message || String(err)
        if (!toolInvokeCount || !shouldRetryToolContinuationAsPlainText(errText) || abortState?.aborted || isAborted?.()) throw err
        await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })
        message.warning('当前 uTools AI 工具续跑接口临时不可用，已改为用纯文本工具结果继续回答。')
        request = requestUtoolsAi(
          [
            ...requestApiMessages,
            {
              role: 'user',
              content: buildUtoolsToolFallbackPrompt()
            }
          ],
          []
        )
        setAbortHandle(request)
        result = await request
      }
  
      if (isAborted?.() || abortState?.aborted) throw createAbortError()
      recordModelUsage(extractModelUsage(result), {
        providerId,
        model,
        endpoint: 'utools-ai',
        purpose: 'chat'
      })
      updateContextTokenTelemetry(targetSession, extractModelUsage(result), {
        requestChars: lastUtoolsRequestChars,
        providerId,
        model,
        endpoint: 'utools-ai'
      })
  
      const finalContentState = mergeUtoolsAiStreamText(streamedContent, result?.content)
      streamedContent = finalContentState.total
      if (finalContentState.delta) {
        ensureStreamingAssistantDisplay()
        typewriterEnqueue(assistantDisplay, finalContentState.delta)
      }
  
      const finalReasoningState = mergeUtoolsAiStreamText(streamedReasoning, extractUtoolsAiReasoningText(result))
      streamedReasoning = finalReasoningState.total
      if (finalReasoningState.delta) {
        ensureStreamingAssistantDisplay()
        deferredAppendMessageField(assistantDisplay, 'thinking', finalReasoningState.delta, { scheduleScroll: true })
      }
  
      await finalizeStreamingAssistantDisplay({ removeIfEmpty: true })
  
      targetSession.apiMessages.push({
        role: 'assistant',
        content: String(streamedContent || ''),
        reasoning_content: String(streamedReasoning || '')
      })
      const assistantApiIndex = targetSession.apiMessages.length - 1
      const visibleSegments = assistantSegments.filter((segment) => targetSession.messages.some((m) => m.id === segment.id))
      visibleSegments.forEach((segment) => {
        segment.apiIndex = assistantApiIndex
      })
  
      if (!visibleSegments.some((segment) => hasVisibleAssistantContent(segment)) && toolInvokeCount === 0) {
        const emptyMsg = createDisplayMessage('assistant', buildEmptyAssistantResponseText(targetSession.apiMessages))
        emptyMsg.apiIndex = assistantApiIndex
        targetSession.messages.push(emptyMsg)
      }
  
      setCurrentAssistantDisplay(null)
      await maybeScrollToBottomForRun(abortState)
    } finally {
      unregisterToolFns()
      setAbortHandle(null)
    }
  }
  

  const {
    activeSessionMessageIdSet,
    trackedMessageIdSet,
    isDisplayMessageInActiveSession,
    isDisplayMessageTracked
  } = useChatMessageTracking({
    session,
    memorySessions
  })
  const sessionToolMessageCount = computed(() =>
    (Array.isArray(session.messages) ? session.messages : []).reduce(
      (count, msg) => count + (isToolMessage(msg) ? 1 : 0),
      0
    )
  )
  const compactToolMessageMode = computed(
    () =>
      (session.messages?.length || 0) >= CHAT_TOOL_COMPACT_MIN_MESSAGES &&
      sessionToolMessageCount.value >= CHAT_TOOL_COMPACT_MIN_TOOL_MESSAGES
  )
  
  const {
    runImageGenerationRound,
    startDetachedVideoTaskPolling,
    resolveVideoGenerationContentIfReady,
    runVideoGenerationRound,
    runDetachedVideoGenerationRequest,
    startDetachedVideoGeneration,
    getMediaRequestPrompt,
    getMediaRequestPlaceholderMode,
    getImageRequestOptionsFromMessage,
    getVideoRequestOptionsFromMessage,
    canRegenerateMedia,
    mediaTaskResumeKey,
    isMediaTaskResuming,
    setMediaTaskResuming,
    getVideoResumeRequestMeta,
    canResumeMediaTask,
    countResumableMediaTasks,
    findOpenaiCompatibleProviderByBaseUrl,
    getOpenaiCompatibleMediaConfigOrHint,
    submitMediaGenerationPrompt,
    regenerateMedia,
    setAssistantApiContentForDisplay,
    extractMediaFailureReasonLine,
    mediaFailureSummary,
    mediaFailureSuggestion,
    applyMediaGenerationFailureToDisplay,
    createRequestAbortStateForMediaResume,
    resumeMediaTask
  } = useChatMediaGeneration({
    ...dependencies,
    assistantVideoTaskStatusLabel,
    assistantVisibleVideoCount,
    buildImageGenerationPromptFromHistory,
    buildVideoGenerationPromptFromHistory,
    clearAllUserEditingState,
    createDisplayMessage,
    isDisplayMessageTracked,
    isDisplayMessageInActiveSession,
    prepareUserApiMessage,
    recordModelUsageFromPayload,
    runChatSession
  })

  const CHAT_REQUEST_TIMEOUT_MS = 36000000
  
  async function runChatSession({
    providerId = '',
    providerKind = 'openai-compatible',
    apiMode = 'auto',
    requestMode = 'chat',
    imageGenerationPlaceholderMode = 'text',
    videoGenerationPlaceholderMode = 'text',
    supportsVision = false,
    baseUrl,
    apiKey,
    model,
    imageGenerationRequestOptionsOverride = null,
    videoGenerationRequestOptionsOverride = null,
    sessionRecord = null,
    memorySystemContent = '',
    memorySourceUserText = '',
    prepare
  }) {
    if (sending.value) return false

    sending.value = true
    const runRecord = sessionRecord || getActiveMemorySession()
    runRecord.runningTaskCount = Math.max(0, Number(runRecord.runningTaskCount || 0)) + 1
    runRecord.chatRunCount = Math.max(0, Number(runRecord.chatRunCount || 0)) + 1
    runRecord.state = buildCurrentChatState()
    if (!isFinalizedMemorySessionTitle(runRecord)) runRecord.title = resolveMemorySessionTitle(runRecord)
    let requestHandle = null
    const abortListeners = new Set()
    const requestAbortState = {
      aborted: false,
      memorySystemContent,
      toolApprovalMode: normalizeToolApprovalMode(
        runRecord?.toolApprovalMode,
        runRecord?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
      ),
      autoApproveTools: normalizeToolApprovalMode(
        runRecord?.toolApprovalMode,
        runRecord?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
      ) !== TOOL_APPROVAL_MODE_MANUAL,
      onAbort(listener) {
        if (typeof listener !== 'function') return () => {}
        if (requestAbortState.aborted) {
          try {
            listener()
          } catch {
            // ignore
          }
          return () => {}
        }
        abortListeners.add(listener)
        return () => {
          abortListeners.delete(listener)
        }
      },
      abort() {
        if (requestAbortState.aborted) return
        requestAbortState.aborted = true
        abortListeners.forEach((listener) => {
          try {
            listener()
          } catch {
            // ignore
          }
        })
        abortListeners.clear()
        try {
          requestHandle?.abort?.()
        } catch {
          // ignore
        }
      }
    }
    runRecordByAbortState.set(requestAbortState, runRecord)
    runRecord.activeRequestAbortState = requestAbortState
    abortController.value = requestAbortState
    let timedOut = false
    const requestTimeoutTimer = window.setTimeout(() => {
      timedOut = true
      requestAbortState.abort()
    }, CHAT_REQUEST_TIMEOUT_MS)
  
    let currentAssistantDisplay = null
    let succeeded = false

    try {
      if (typeof prepare === 'function') await prepare()
  
      if (providerKind === 'utools-ai') {
        await runUtoolsAiChatRound({
          providerId,
          model,
          setCurrentAssistantDisplay: (m) => {
            currentAssistantDisplay = m
          },
          setAbortHandle: (handle) => {
            requestHandle = handle
          },
          isAborted: () => requestAbortState.aborted,
          abortState: requestAbortState
        })
      } else {
        requestHandle = new AbortController()
        if (requestAbortState.aborted) requestHandle.abort()
        if (requestMode === 'image-generation') {
          try {
            await runImageGenerationRound({
              providerId,
              baseUrl,
              apiKey,
              model,
              signal: requestHandle.signal,
              placeholderMode: imageGenerationPlaceholderMode,
              requestOptionsOverride: imageGenerationRequestOptionsOverride,
              setCurrentAssistantDisplay: (m) => {
                currentAssistantDisplay = m
              },
              abortState: requestAbortState
            })
          } catch (err) {
            const allowTextFallback = imageGenerationPlaceholderMode !== 'image'
            if (!allowTextFallback || !shouldFallbackMediaRequestToChat(err, 'image')) throw err
            removeRunDisplayMessageById(requestAbortState, currentAssistantDisplay?.id)
            currentAssistantDisplay = null
            requestHandle = new AbortController()
            if (requestAbortState.aborted) requestHandle.abort()
            message.warning('图片生成接口不兼容当前返回，已自动回退为文本聊天。')
            await runChatRounds({
              providerId,
              baseUrl,
              apiKey,
              apiMode,
              model,
              signal: requestHandle.signal,
              assistantPlaceholderMode: imageGenerationPlaceholderMode,
              supportsVision,
              memorySystemContent,
              setCurrentAssistantDisplay: (m) => {
                currentAssistantDisplay = m
              },
              abortState: requestAbortState
            })
          }
        } else if (requestMode === 'video-generation') {
          try {
            await runVideoGenerationRound({
              providerId,
              baseUrl,
              apiKey,
              model,
              signal: requestHandle.signal,
              placeholderMode: videoGenerationPlaceholderMode,
              requestOptionsOverride: videoGenerationRequestOptionsOverride,
              setCurrentAssistantDisplay: (m) => {
                currentAssistantDisplay = m
              },
              abortState: requestAbortState
            })
          } catch (err) {
            const allowTextFallback = videoGenerationPlaceholderMode !== 'video'
            if (!allowTextFallback || !shouldFallbackMediaRequestToChat(err, 'video')) throw err
            removeRunDisplayMessageById(requestAbortState, currentAssistantDisplay?.id)
            currentAssistantDisplay = null
            requestHandle = new AbortController()
            if (requestAbortState.aborted) requestHandle.abort()
            message.warning('视频生成接口不兼容当前返回，已自动回退为文本聊天。')
            await runChatRounds({
              providerId,
              baseUrl,
              apiKey,
              apiMode,
              model,
              signal: requestHandle.signal,
              assistantPlaceholderMode: videoGenerationPlaceholderMode,
              supportsVision,
              memorySystemContent,
              setCurrentAssistantDisplay: (m) => {
                currentAssistantDisplay = m
              },
              abortState: requestAbortState
            })
          }
        } else {
          await runChatRounds({
            providerId,
            baseUrl,
            apiKey,
            apiMode,
            model,
            signal: requestHandle.signal,
            supportsVision,
            memorySystemContent,
            setCurrentAssistantDisplay: (m) => {
              currentAssistantDisplay = m
            },
            abortState: requestAbortState
          })
        }
      }
      succeeded = true
    } catch (err) {
      if (requestAbortState.aborted || isAbortError(err)) {
        const stopText = timedOut ? `（请求在 ${CHAT_REQUEST_TIMEOUT_MS}ms 后超时并已停止）` : '（已停止）'
        if (currentAssistantDisplay) {
          flushDeferredMessageFieldsForMessage(currentAssistantDisplay.id)
          currentAssistantDisplay.streaming = false
          currentAssistantDisplay.content = currentAssistantDisplay.content || stopText
        } else {
            getRunSessionTarget(requestAbortState).messages.push(createDisplayMessage('assistant', stopText))
        }
      } else {
        const errorText = err?.message || String(err)
        const mediaFailureApplied = applyMediaGenerationFailureToDisplay(currentAssistantDisplay, errorText)
        if (mediaFailureApplied) {
          // 媒体生成错误保留在任务卡片中，便于重试和查看建议。
        } else if (currentAssistantDisplay) {
          flushDeferredMessageFieldsForMessage(currentAssistantDisplay.id)
          currentAssistantDisplay.streaming = false
          const shouldRemovePlaceholder =
            currentAssistantDisplay.transientRequestPlaceholder ||
            (!String(currentAssistantDisplay.content || '').trim() &&
              !String(currentAssistantDisplay.thinking || '').trim() &&
              !(Array.isArray(currentAssistantDisplay.images) && currentAssistantDisplay.images.length) &&
              !(Array.isArray(currentAssistantDisplay.videos) && currentAssistantDisplay.videos.length) &&
              !currentAssistantDisplay.imageTask &&
              !currentAssistantDisplay.videoTask)
          if (shouldRemovePlaceholder) {
            const targetSession = getRunSessionTarget(requestAbortState)
            const idx = targetSession.messages.findIndex((m) => m.id === currentAssistantDisplay.id)
            if (idx !== -1) targetSession.messages.splice(idx, 1)
          }
        }
        message.error(mediaFailureApplied ? (currentAssistantDisplay?.mediaFailure?.summary || '媒体生成失败') : (errorText || '请求失败'))
        await maybeScrollToBottomForRun(requestAbortState)
      }
    } finally {
      window.clearTimeout(requestTimeoutTimer)
      runRecord.runningTaskCount = Math.max(0, Number(runRecord.runningTaskCount || 0) - 1)
      runRecord.chatRunCount = Math.max(0, Number(runRecord.chatRunCount || 0) - 1)
      if (runRecord.activeRequestAbortState === requestAbortState) {
        runRecord.activeRequestAbortState = null
      }
      currentAssistantDisplay = null
      if (isMemorySessionActive(runRecord)) {
        syncActiveRequestUiState(runRecord)
      } else if (abortController.value === requestAbortState) {
        sending.value = false
        abortController.value = null
      }
      if (isMemorySessionActive(runRecord)) {
        const record = saveActiveMemorySessionDraft()
        void autoPersistMemorySessionWhenIdle(record)
      } else {
        runRecord.updatedAt = Date.now()
        if (!isFinalizedMemorySessionTitle(runRecord)) runRecord.title = resolveMemorySessionTitle(runRecord)
        void autoPersistMemorySessionWhenIdle(runRecord)
      }
      const memoryConfig = chatConfig.value?.memory
      const memoryEnabled = isChatMemoryEnabled(memoryConfig)
      if (memoryEnabled && memoryConfig?.autoExtract !== false && !requestAbortState.aborted && requestMode === 'chat') {
        const assistantApiMessages = Array.isArray(runRecord.apiMessages) ? runRecord.apiMessages : []
        const latestAssistant = [...assistantApiMessages].reverse().find((msg) => msg?.role === 'assistant' && String(msg?.content || '').trim())
        const userText = String(memorySourceUserText || '').trim()
        const assistantText = String(latestAssistant?.content || '').trim()
        if (userText && assistantText) {
          queueMemoryCandidateForRecord(runRecord, {
            userText,
            assistantText,
            systemPrompt: buildCombinedSystemContent('', { sessionRecord: runRecord }),
            summary: userText.slice(0, 140)
          })
        }
      }
      await maybeScrollToBottomForRun(requestAbortState)
      runRecordByAbortState.delete(requestAbortState)
      scheduleQueuedInputDrain(runRecord)
    }

    return succeeded
  }

  async function stageChatAttachmentsInSandbox(attachments, sessionTarget = null) {
    const list = Array.isArray(attachments) ? attachments : []
    const sandboxWorkspaceId = resolveMemorySessionSandboxWorkspaceId(
      sessionTarget || getMemorySessionById(activeMemorySessionId.value)
    )
    const unstagedAttachments = list.filter((attachment) =>
      attachment?.file &&
      typeof attachment.file.arrayBuffer === 'function' &&
      !String(attachment?.sandboxPath || '').trim()
    )
    if (!unstagedAttachments.length) return sandboxWorkspaceId

    let importedWorkspaceId = sandboxWorkspaceId
    for (const attachment of unstagedAttachments) {
      let imported
      try {
        // Import one file at a time so a large selection is not duplicated in
        // renderer memory before being written to disk.
        imported = await importFilesToSandbox(sandboxWorkspaceId, [{
          name: attachment.name || attachment.file?.name || 'attachment',
          data: new Uint8Array(await attachment.file.arrayBuffer())
        }])
      } catch (error) {
        throw new Error(`附件写入聊天沙盒失败：${error?.message || String(error)}`)
      }

      const entry = Array.isArray(imported?.imported) ? imported.imported[0] : null
      if (!String(entry?.path || '').trim()) {
        throw new Error('附件写入聊天沙盒不完整，请重试')
      }

      importedWorkspaceId = imported.workspaceId || importedWorkspaceId
      attachment.sandboxWorkspaceId = importedWorkspaceId
      attachment.sandboxPath = entry.path
      attachment.sandboxDataPath = entry.dataPath || ''
      // File objects are not serializable and may retain a large in-memory blob.
      attachment.file = null
    }
    return importedWorkspaceId
  }

  async function ensureAttachmentSandboxSkillAvailable(attachments = []) {
    if (!(Array.isArray(attachments) && attachments.some((item) => String(item?.sandboxPath || '').trim()))) return false
    const skill = (skills.value || []).find((item) => String(item?._id || '').trim() === BUILTIN_SHELL_SKILL_ID)
    if (!skill) return false

    if (!normalizeStringList(selectedSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
      selectedSkillIds.value = normalizeStringList([...selectedSkillIds.value, BUILTIN_SHELL_SKILL_ID])
      routerAddedSelectedSkillIds.add(BUILTIN_SHELL_SKILL_ID)
    }
    if (!normalizeStringList(agentSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
      agentSkillIds.value = normalizeStringList([...agentSkillIds.value, BUILTIN_SHELL_SKILL_ID])
      routerAddedAgentSkillIds.add(BUILTIN_SHELL_SKILL_ID)
    }
    if (!normalizeStringList(activatedAgentSkillIds.value).includes(BUILTIN_SHELL_SKILL_ID)) {
      activatedAgentSkillIds.value = normalizeStringList([...activatedAgentSkillIds.value, BUILTIN_SHELL_SKILL_ID])
      routerActivatedAgentSkillIds.add(BUILTIN_SHELL_SKILL_ID)
    }
    if (isDirectorySkill(skill)) await loadSkillMainContent(BUILTIN_SHELL_SKILL_ID)
    return true
  }

  async function prepareUserApiMessage({
    text,
    attachments,
    userDisplay,
    preferVision = true,
    providerKind = 'openai-compatible',
    sessionTarget = null,
    imageAttachmentMode = 'chat'
  }) {
    const targetSession = sessionTarget || session
    const list = Array.isArray(attachments) ? attachments : []
    const imageAttachmentsAsMediaReferences = imageAttachmentMode === 'media-reference'
    if (list.length) {
      await Promise.all(list.map((a) => ensureAttachmentParsed(a)))
    }

    await stageChatAttachmentsInSandbox(list, targetSession)
    await ensureAttachmentSandboxSkillAvailable(list)
  
    const attachmentContextBlocksForVision = []
    const attachmentContextBlocksTextOnly = []
    const imageAttachments = []

    for (const a of list) {
      const referenceBlock = buildChatAttachmentReferenceBlock(a, {
        sessionId: targetSession?.id || activeMemorySessionId.value || 'default'
      })
      if (a.status === 'ready' && a.kind === 'image' && a.dataUrl) {
        imageAttachments.push(a)
        if (!imageAttachmentsAsMediaReferences) {
          attachmentContextBlocksForVision.push(`${referenceBlock}\nThe image is also attached to this request for visual input.`)
          attachmentContextBlocksTextOnly.push(`${referenceBlock}\nThe current provider receives only this file reference, not image pixels.`)
        }
        continue
      }
      if (a.status === 'ready') {
        const fallbackPreview = a?.sandboxPath
          ? ''
          : truncateText(String(a.text || '').trim(), 8000, '（附件预览已截断）')
        const block = [referenceBlock, fallbackPreview].filter(Boolean).join('\n')
        attachmentContextBlocksForVision.push(block)
        attachmentContextBlocksTextOnly.push(block)
        continue
      }
      if (a.status === 'error') {
        const block = `${referenceBlock}\nLocal preview parsing failed: ${a.error || 'unknown error'}. Read the sandbox file directly.`
        attachmentContextBlocksForVision.push(block)
        attachmentContextBlocksTextOnly.push(block)
      }
    }
  
    try {
      userDisplay.images = imageAttachments.map((a) => ({
        id: newId(),
        src: a.dataUrl,
        name: a.name || 'image',
        mime: a.mime || '',
        size: Number(a.size || 0),
        width: Number(a.width || 0),
        height: Number(a.height || 0),
        metaLine: a.metaLine || '',
        svgTextPreview: a.svgTextPreview || ''
      }))

      // A title may have created the session file before attachment parsing finishes.
      // Persist the previews as soon as both pieces are available so reopening that
      // in-flight session never observes a JSON record whose sidecar is still empty.
      const sessionFilePath = String(targetSession?.activeSessionFilePath || '').trim()
      if (sessionFilePath && userDisplay.images.length) {
        userDisplay.images = await persistChatMediaListAssets(userDisplay.images, {
          kind: 'image',
          messageId: userDisplay.id,
          sessionFilePath
        })
        // Commit the matching asset reference into the already-created session
        // record. This is intentionally allowed while the request is running:
        // otherwise autosave waits for completion and leaves a reload window.
        await autoPersistMemorySessionWhenIdle(targetSession, {
          notify: false,
          allowWhileRunning: true
        })
      }
    } catch {
      // ignore
    }
  
    const attachmentBlockForVision = attachmentContextBlocksForVision.length
      ? `【附件内容】\n${attachmentContextBlocksForVision.join('\n\n')}`
      : ''
    const attachmentBlockTextOnly = attachmentContextBlocksTextOnly.length
      ? `【附件内容】\n${attachmentContextBlocksTextOnly.join('\n\n')}`
      : ''
  
    const combinedTextForVision = [String(text || '').trim(), attachmentBlockForVision].filter(Boolean).join('\n\n')
    const combinedTextTextOnly = [String(text || '').trim(), attachmentBlockTextOnly].filter(Boolean).join('\n\n')
  
    const userApiMessage = { role: 'user', content: combinedTextTextOnly }
    if (preferVision && imageAttachments.length) {
      userApiMessage.content = [
        {
          type: 'text',
          text: combinedTextForVision || '请结合下面的图片进行回答。'
        },
        ...imageAttachments.map((a) => ({
          type: 'image_url',
          image_url: { url: a.dataUrl }
        }))
      ]
      userApiMessage.vision_fallback_text = combinedTextTextOnly
    }
  
    targetSession.apiMessages.push(userApiMessage)
    userDisplay.apiIndex = targetSession.apiMessages.length - 1
    if (targetSession === session) await scrollToBottom({ force: true })
  }
  
  function getLatestRealUserPromptText(apiMessages = session.apiMessages) {
    for (let i = (Array.isArray(apiMessages) ? apiMessages : []).length - 1; i >= 0; i -= 1) {
      const msg = apiMessages[i]
      if (msg?.role !== 'user' || msg?.synthetic_tool_vision === true) continue
      return extractEditableUserTextFromContent(msg.content)
    }
    return ''
  }
  
  async function regenerateAssistant(msg) {
    if (sending.value || preparingSend.value) return
    const cfg = getRequestConfigOrHint()
    if (!cfg) return
  
    typewriterFlushAll()
    clearAllUserEditingState()
  
    const assistantApiIndex = isFiniteNumber(msg?.apiIndex)
      ? msg.apiIndex
      : (() => {
          for (let i = (session.apiMessages || []).length - 1; i >= 0; i--) {
            if (session.apiMessages[i]?.role === 'assistant') return i
          }
          return -1
        })()
  
    if (!isFiniteNumber(assistantApiIndex) || assistantApiIndex < 0) {
      message.warning('没有找到可重新生成的回答')
      return
    }
  
    const userApiIndex = findNearestUserApiIndexBefore(assistantApiIndex)
    if (!isFiniteNumber(userApiIndex) || userApiIndex < 0) {
      message.error('未找到对应的用户提问，无法继续重新生成')
      return
    }
  
    const userDisplayIndex =
      findDisplayIndexByApiIndex('user', userApiIndex) >= 0
        ? findDisplayIndexByApiIndex('user', userApiIndex)
        : (() => {
            const assistantDisplayIndex = (session.messages || []).findIndex((m) => m?.id === msg?.id)
            if (assistantDisplayIndex <= 0) return -1
            for (let i = assistantDisplayIndex - 1; i >= 0; i--) {
              if (session.messages[i]?.role === 'user') return i
            }
            return -1
          })()
  
    if (userDisplayIndex < 0) {
      message.error('未找到对应的用户气泡，无法继续重新生成')
      return
    }
  
    const hasFollowing = session.messages.length > userDisplayIndex + 1 || session.apiMessages.length > userApiIndex + 1
    const ok = await new Promise((resolve) => {
      dialog.warning({
        title: '确认重新生成',
        content: hasFollowing ? '重新生成会删除本次回答及其后的对话内容，确定继续吗？' : '确定重新生成这条回答吗？',
        positiveText: '重新生成',
        negativeText: '取消',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false)
      })
    })
    if (!ok) return
  
    await startPreparingSend(async ({ release }) => {
      truncateConversationAfterUser(userApiIndex, userDisplayIndex)
      const requestRecord = getActiveMemorySession()
      const userDisplay = session.messages[userDisplayIndex]
      const attachments = Array.isArray(userDisplay?.attachments) ? userDisplay.attachments : []
      const userText = extractEditableUserTextFromContent(getUserApiMessageContentByIndex(userApiIndex) ?? userDisplay?.content)
      const { memorySystemContent, attachmentRecallText } = await prepareChatRequestContext({
        cfg,
        text: userText,
        attachments,
        requestRecord,
        excludeLatestUserTurnFromMemoryRecall: true
      })
      const runPromise = runChatSession({
        ...cfg,
        sessionRecord: requestRecord,
        memorySystemContent,
        memorySourceUserText: [userText, attachmentRecallText].filter(Boolean).join('\n\n'),
        prepare: async () => {
          if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
        }
      })
      release()
      await runPromise
    })
  }
  
  function toggleOrSubmitUserEdit(msg) {
    if (!msg || msg.role !== 'user') return
    if (sending.value || preparingSend.value) return
  
    if (!msg.editing) {
      clearAllUserEditingState()
      const userApiIndex = resolveUserApiIndexForDisplayMessage(msg)
      const apiContent = getUserApiMessageContentByIndex(userApiIndex)
      msg.editing = true
      msg.editDraft = extractEditableUserTextFromContent(apiContent ?? msg.content)
      scheduleScrollToBottom()
      scheduleRefreshUserAnchorMeta()
      return
    }
  
    submitUserEdit(msg)
  }
  
  async function submitUserEdit(msg) {
    if (!msg || msg.role !== 'user') return
    if (sending.value || preparingSend.value) return
  
    const draft = String(msg.editDraft ?? '').trim()
    const userApiIndex = resolveUserApiIndexForDisplayMessage(msg)
    const hasAttachments = messageHasDisplayAttachments(msg, userApiIndex)
    if (!draft && !hasAttachments) {
      message.warning('内容不能为空')
      return
    }
  
    const cfg = getRequestConfigOrHint()
    if (!cfg) return
  
    typewriterFlushAll()
  
    if (!isFiniteNumber(userApiIndex) || userApiIndex < 0) {
      message.error('未找到对应的请求记录，无法继续编辑并重发')
      return
    }
  
    const userDisplayIndex = (session.messages || []).findIndex((m) => m?.id === msg?.id)
    if (userDisplayIndex < 0) {
      message.error('未找到对应的用户气泡，无法继续编辑并重发')
      return
    }
  
    const hasFollowing = session.messages.length > userDisplayIndex + 1 || session.apiMessages.length > userApiIndex + 1
    const ok = await new Promise((resolve) => {
      dialog.warning({
        title: '确认重发',
        content: hasFollowing ? '重发会删除这条消息之后的所有对话内容，确定继续吗？' : '确定重发这条消息吗？' ,
        positiveText: '重发',
        negativeText: '取消',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false)
      })
    })
    if (!ok) return
  
    await startPreparingSend(async ({ release }) => {
      msg.content = draft || (hasAttachments ? '(sent attachments)' : '')
      msg.render = inferUserDisplayMessageRender(msg.content)
      msg.editing = false
      msg.editDraft = ''
  
      if (session.apiMessages?.[userApiIndex]?.role === 'user') {
        session.apiMessages[userApiIndex].content = mergeUserTextWithExistingAttachments(
          session.apiMessages[userApiIndex].content,
          draft
        )
      }
  
      truncateConversationAfterUser(userApiIndex, userDisplayIndex)
      const requestRecord = getActiveMemorySession()
      const attachments = Array.isArray(msg?.attachments) ? msg.attachments : []
      const { memorySystemContent, attachmentRecallText } = await prepareChatRequestContext({
        cfg,
        text: draft,
        attachments,
        requestRecord,
        excludeLatestUserTurnFromMemoryRecall: true
      })
      const runPromise = runChatSession({
        ...cfg,
        sessionRecord: requestRecord,
        memorySystemContent,
        memorySourceUserText: [draft, attachmentRecallText].filter(Boolean).join('\n\n'),
        prepare: async () => {
          if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
        }
      })
      release()
      await runPromise
    })
  }
  
  function commitToolApprovalMode(value) {
    const nextMode = normalizeToolApprovalMode(value)
    toolApprovalMode.value = nextMode
    try {
      void Promise.resolve(updateChatConfig({ toolApprovalMode: nextMode })).catch((error) => {
        console.warn('保存工具调用控制选项失败:', error)
      })
    } catch (error) {
      console.warn('保存工具调用控制选项失败:', error)
    }
    const record = getActiveMemorySession()
    if (record) {
      record.toolApprovalMode = nextMode
      record.autoApproveTools = nextMode !== TOOL_APPROVAL_MODE_MANUAL
      if (record.state && typeof record.state === 'object') {
        record.state.toolApprovalMode = nextMode
        record.state.autoApproveTools = nextMode !== TOOL_APPROVAL_MODE_MANUAL
      }
      if (record.activeRequestAbortState && typeof record.activeRequestAbortState === 'object') {
        record.activeRequestAbortState.toolApprovalMode = nextMode
        record.activeRequestAbortState.autoApproveTools = nextMode !== TOOL_APPROVAL_MODE_MANUAL
      }
      dispatchBuiltinAgentsToolApprovalModeChange(record, nextMode)
      if (nextMode === TOOL_APPROVAL_MODE_FULL || nextMode === TOOL_APPROVAL_MODE_TRUSTED) {
        pendingToolApprovals.value
          .filter((request) => (
            (nextMode === TOOL_APPROVAL_MODE_TRUSTED || request?.hardApproval !== true) &&
            (!request?.sessionId || String(request.sessionId) === String(record.id))
          ))
          .forEach((request) => request?.settle?.('once'))
        window.setTimeout(() => {
          void flushMemorySessionApprovalQueue(record)
        }, 0)
      }
    }
  }

  function setToolApprovalMode(value) {
    const nextMode = normalizeToolApprovalMode(value)
    if (nextMode === toolApprovalMode.value) {
      commitToolApprovalMode(nextMode)
      return
    }
    if (nextMode === TOOL_APPROVAL_MODE_TRUSTED) {
      dialog.error({
        title: '启用完全信任？',
        content: '此模式会记住为后续新会话的默认选项，并直接批准所有工具调用，包括命令、主机代码执行、删除及其他破坏性操作；子 Agent 也会继承。请仅在当前智能体、技能和 MCP 服务全部可信时启用。',
        positiveText: '完全信任并记住',
        negativeText: '取消',
        onPositiveClick: () => commitToolApprovalMode(nextMode)
      })
      return
    }
    if (nextMode === TOOL_APPROVAL_MODE_FULL) {
      dialog.warning({
        title: '启用高风险自动调用？',
        content: '此模式会记住为后续新会话的默认选项，并直接执行普通写入、常规命令和一般代码；明显破坏性的命令，以及删除、付款、发布等危险操作仍需确认。子 Agent 也会继承。',
        positiveText: '启用高风险自动',
        negativeText: '取消',
        onPositiveClick: () => commitToolApprovalMode(nextMode)
      })
      return
    }
    commitToolApprovalMode(nextMode)
  }
  
  function toggleWebSearch() {
    webSearchEnabled.value = !webSearchEnabled.value
  }
  
  function toggleAutoActivateAgentSkills() {
    autoActivateAgentSkills.value = !autoActivateAgentSkills.value
  }
  
  function cycleToolMode() {
    const order = ['auto', 'expanded', 'compact']
    const current = String(toolMode.value || 'auto')
    const idx = order.indexOf(current)
    const next = order[(idx + 1 + order.length) % order.length]
    toolMode.value = next
    if (next === 'expanded') effectiveToolMode.value = 'expanded'
    if (next === 'compact') effectiveToolMode.value = 'compact'
  }
  
  async function refreshActiveMcpTools() {
    if (refreshingMcpTools.value) return
    const servers = (activeMcpServers.value || []).filter((s) => s && !s.disabled && s._id)
    if (!servers.length) {
      message.info('当前没有启用的 MCP 服务')
      return
    }
  
    refreshingMcpTools.value = true
    try {
      mcpListToolsCache.clear()
      mcpListToolsInFlight.clear()
      mcpToolsRevision.value += 1
      clearMcpToolCatalog()
      clearPinnedMcpToolHints()
      await warmMcpToolCatalogForServers(servers, { forceRefresh: true })
      message.success('已刷新 MCP 工具列表')
    } catch (err) {
      message.error('刷新 MCP 工具列表失败：' + (err?.message || String(err)))
    } finally {
      refreshingMcpTools.value = false
    }
  }
  
  function getComposerTextareaEl() {
    return composerPanelRef.value?.getTextareaEl?.() || null
  }
  
  function refreshComposerInlinePickers(options = {}) {
    const text = typeof options.text === 'string' ? options.text : String(input.value || '')
    const caret =
      typeof options.caret === 'number'
        ? options.caret
        : (getComposerTextareaEl()?.selectionStart ?? text.length)
  
    const commandContext = extractInlineCommandContext(text, caret)
    if (commandContext) {
      clearInlineAgentPicker()
      inlineCommandMode.value = commandContext.mode
      inlineCommandType.value = commandContext.type
      inlineCommandQuery.value = commandContext.query
      inlineCommandMatchStart.value = commandContext.start
      inlineCommandMatchEnd.value = commandContext.end
      if (commandContext.mode === 'item' && commandContext.type === 'prompt') {
        void ensureMcpPromptCatalogLoaded({ silent: true })
      }
      return
    }
  
    const agentContext = extractInlineAgentContext(text, caret)
    if (agentContext) {
      clearInlineCommandPicker()
      inlineAgentQuery.value = agentContext.query
      inlineAgentMatchStart.value = agentContext.start
      inlineAgentMatchEnd.value = agentContext.end
      return
    }
  
    clearInlinePickers()
  }
  
  function handleComposerCursorChange() {
    refreshComposerInlinePickers()
  }
  
  function handleComposerBlur() {
    clearInlinePickers()
  }
  
  function focusComposerAt(position) {
    nextTick(() => {
      composerPanelRef.value?.focusComposer?.()
      const el = getComposerTextareaEl()
      if (el && Number.isFinite(position)) {
        el.setSelectionRange(position, position)
      }
      refreshComposerInlinePickers({ caret: position })
    })
  }
  
  function insertInlineCommandTrigger(kind) {
    const normalizedKind = String(kind || '').trim().toLowerCase()
    if (!INLINE_COMMAND_KIND_LABELS[normalizedKind]) return
  
    clearInlinePickers()
  
    const token = `/${normalizedKind} `
    const raw = String(input.value || '')
    const el = getComposerTextareaEl()
    const start = el?.selectionStart ?? raw.length
    const end = el?.selectionEnd ?? start
    const before = raw.slice(0, start)
    const after = raw.slice(end)
    const prefix = before && !/[\s\n]$/.test(before) ? ' ' : ''
    const suffix = after && !/^[\s\n]/.test(after) ? ' ' : ''
  
    input.value = `${before}${prefix}${token}${suffix}${after}`
    focusComposerAt(before.length + prefix.length + token.length)
  }
  
  function applyInlineAgentSuggestion(agentId) {
    const id = String(agentId || '').trim()
    if (!id) return
  
    const raw = String(input.value || '')
    const start = inlineAgentMatchStart.value
    const end = inlineAgentMatchEnd.value >= start ? inlineAgentMatchEnd.value : start
    let nextCaret = Math.max(0, start)
  
    if (start >= 0 && end >= start) {
      const before = raw.slice(0, start)
      let after = raw.slice(end)
      if (/\s$/.test(before) && /^\s/.test(after)) {
        after = after.replace(/^\s+/, ' ')
      }
      input.value = `${before}${after}`
      nextCaret = before.length
    }
  
    applyAgent(id)
    clearInlineAgentPicker()
    focusComposerAt(nextCaret)
  }
  
  function replaceInlineCommandToken(kind) {
    const normalizedKind = String(kind || '').trim().toLowerCase()
    if (!INLINE_COMMAND_KIND_LABELS[normalizedKind]) return
  
    const raw = String(input.value || '')
    const start = inlineCommandMatchStart.value
    const end = inlineCommandMatchEnd.value >= start ? inlineCommandMatchEnd.value : start
    const before = start >= 0 ? raw.slice(0, start) : raw
    let after = end >= start ? raw.slice(end) : ''
    const token = `/${normalizedKind} `
  
    if (/^[ \t]+/.test(after)) {
      after = after.replace(/^[ \t]+/, '')
    } else if (after && !/^[\s\n]/.test(after)) {
      after = ` ${after}`
    }
  
    input.value = `${before}${token}${after}`
    focusComposerAt(before.length + token.length)
  }
  
  function removeInlineCommandToken() {
    const raw = String(input.value || '')
    const start = inlineCommandMatchStart.value
    const end = inlineCommandMatchEnd.value >= start ? inlineCommandMatchEnd.value : start
    let nextCaret = Math.max(0, start)
  
    if (start >= 0 && end >= start) {
      const before = raw.slice(0, start)
      let after = raw.slice(end)
      if (/\s$/.test(before) && /^\s/.test(after)) {
        after = after.replace(/^\s+/, ' ')
      }
      input.value = `${before}${after}`
      nextCaret = before.length
    }
  
    clearInlineCommandPicker()
    focusComposerAt(nextCaret)
  }
  
  async function applyInlineCommandSuggestion(item) {
    const value = String(item?.value || '').trim()
    if (!value) return
    if (item?.disabled) {
      message.warning('该 MCP 已禁用，请先到设置页启用')
      return
    }
  
    if (inlineCommandMode.value === 'kind') {
      replaceInlineCommandToken(value)
      return
    }
  
    if (inlineCommandType.value === 'prompt') {
      const parsed = parsePromptOptionValue(value)
      if (parsed.type === 'mcp') {
        const promptItem = findMcpPromptCatalogItem(parsed.serverId, parsed.promptName)
        if (!promptItem) {
          message.warning('未找到该 MCP 提示词，请刷新后重试')
          return
        }
  
        removeInlineCommandToken()
        if (Array.isArray(promptItem.arguments) && promptItem.arguments.length) {
          promptModalSelectedId.value = makeMcpPromptOptionValue(promptItem)
          showPromptModal.value = true
          return
        }
  
        await applyMcpPromptToComposer(promptItem)
        return
      }
  
      const localPrompt = findLocalPromptById(parsed.promptId || null)
      if (!localPrompt) {
        message.warning('未找到该本地提示词，请刷新后重试')
        removeInlineCommandToken()
        return
      }
  
      if (isUserPrompt(localPrompt)) {
        removeInlineCommandToken()
        const variables = extractPromptVariables(localPrompt.content)
        if (!variables.length) {
          applyLocalPromptToComposer(localPrompt, {})
          return
        }
        promptModalSelectedId.value = makeLocalPromptOptionValue(localPrompt._id)
        resetPromptVariableFormData(variables, promptUserArgsForm)
        showPromptModal.value = true
        return
      }
  
      applyBasePromptSelection(localPrompt._id)
      removeInlineCommandToken()
      return
    }
  
    if (inlineCommandType.value === 'skill') {
      const set = new Set(Array.isArray(selectedSkillIds.value) ? selectedSkillIds.value : [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      selectedSkillIds.value = Array.from(set)
      removeInlineCommandToken()
      return
    }
  
    if (inlineCommandType.value === 'mcp') {
      const set = new Set(Array.isArray(manualMcpIds.value) ? manualMcpIds.value : [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      manualMcpIds.value = Array.from(set)
      void ensureMcpPromptCatalogLoaded({ silent: true, forceRefresh: true })
      removeInlineCommandToken()
    }
  }
  
  function openSystemPromptModal() {
    systemPromptDraft.value = basePromptText.value
    showSystemPromptModal.value = true
  }
  
  function applyCustomSystemPrompt() {
    const selectedPrompt = findLocalPromptById(selectedPromptId.value)
    const nextState = resolveSystemPromptModalApplyState(
      {
        basePromptMode: basePromptMode.value,
        selectedPromptId: selectedPromptId.value,
        customSystemPrompt: customSystemPrompt.value,
        customSystemPromptExplicit: customSystemPromptExplicit.value
      },
      {
        draftText: systemPromptDraft.value,
        selectedPromptId: selectedPromptId.value,
        selectedPromptContent: isSystemPrompt(selectedPrompt) ? String(selectedPrompt?.content || '') : ''
      }
    )
    basePromptMode.value = nextState.basePromptMode
    selectedPromptId.value = nextState.selectedPromptId
    customSystemPrompt.value = nextState.customSystemPrompt
    customSystemPromptExplicit.value = nextState.customSystemPromptExplicit
    showSystemPromptModal.value = false
  }
  
  function clearCustomSystemPrompt() {
    systemPromptDraft.value = ''
  }
  
  function resetSystemPromptToSelectedPrompt() {
    const p = findLocalPromptById(selectedPromptId.value)
    systemPromptDraft.value = isSystemPrompt(p) ? String(p?.content || '') : ''
  }
  
  function syncContextWindowDraft(raw = effectiveContextWindowConfig.value) {
    Object.assign(contextWindowDraft, resolveChatContextWindowOptions(raw))
  }
  
  function openContextWindowModal() {
    syncContextWindowDraft()
    contextWindowPreviewOmittedFilter.value = 'all'
    showContextWindowModal.value = true
  }
  
  function handleContextWindowPresetChange(value) {
    const preset = String(value || '').trim()
    if (!preset || preset === 'custom') return
    Object.assign(contextWindowDraft, resolveChatContextWindowOptions({ ...contextWindowDraft, preset }))
  }
  
  function resetContextWindowDraftToDefault() {
    Object.assign(contextWindowDraft, resolveChatContextWindowOptions(globalContextWindowConfig.value))
  }
  
  async function applyContextWindowSettings() {
    try {
      const normalized = resolveChatContextWindowOptions(normalizeChatContextWindowConfig(contextWindowDraft))
      const globalNormalized = normalizeChatContextWindowConfig(chatConfig.value?.contextWindow)
      sessionContextWindowOverride.value = JSON.stringify(normalized) === JSON.stringify(globalNormalized)
        ? null
        : deepCopyJson(normalized, null)
      const activeRecord = getMemorySessionById(activeMemorySessionId.value)
      if (activeRecord) {
        activeRecord.state = buildCurrentChatState()
        activeRecord.updatedAt = Date.now()
      }
      syncContextWindowDraft(normalized)
      showContextWindowModal.value = false
      message.success('当前会话上下文策略已应用')
    } catch (err) {
      message.error('保存上下文窗口设置失败：' + (err?.message || String(err)))
    }
  }
  
  function isCurrentModel(providerId, model) {
    return providerId === selectedProviderId.value && model === selectedModel.value
  }
  
  function selectProviderModel(providerId, model) {
    selectedProviderId.value = providerId
    selectedModel.value = model
    showModelModal.value = false
  }
  
  function openAgentModal() {
    clearInlinePickers()
    agentModalSelectedId.value = visibleSelectedAgent.value?._id || null
    showAgentModal.value = true
  }

  function resetChatSetupUiState() {
    clearInlinePickers()
  
    // 关闭弹窗
    showModelModal.value = false
    showSystemPromptModal.value = false
    showContextWindowModal.value = false
    showAgentModal.value = false
    showPromptModal.value = false
    showSkillModal.value = false
    showMcpModal.value = false
  
    applyDefaultChatState()
  }
  
  function clearSelectedAgent() {
    clearInlinePickers()
    const skillIdsToRemove = new Set([
      ...normalizeStringList(agentSkillIds.value),
      ...normalizeStringList(selectedAgent.value?.skills)
    ])
    const mcpIdsToRemove = new Set(normalizeStringList(selectedAgent.value?.mcp))
  
    if (skillIdsToRemove.size) {
      selectedSkillIds.value = normalizeStringList((selectedSkillIds.value || []).filter((id) => !skillIdsToRemove.has(id)))
    }
    if (mcpIdsToRemove.size) {
      manualMcpIds.value = normalizeStringList((manualMcpIds.value || []).filter((id) => !mcpIdsToRemove.has(id)))
    }
  
    applyDefaultGeneralAgent()
    agentModalSelectedId.value = null
    showAgentModal.value = false
  }
  
  function applyAgentModal() {
    if (!agentModalSelectedId.value) return
    applyAgent(agentModalSelectedId.value)
    clearInlinePickers()
    showAgentModal.value = false
  }
  
  function clearSelectedPrompt() {
    const parsedBeforeClear = selectedPromptModalParsedValue.value
    promptModalSelectedId.value = null
    resetPromptVariableFormData([], promptUserArgsForm)
    if (shouldClearBasePromptSelectionImmediately({
      basePromptMode: basePromptMode.value,
      selectedPromptId: selectedPromptId.value
    }, parsedBeforeClear)) {
      applyBasePromptSelection(null)
    }
    showPromptModal.value = false
  }
  
  async function applyPromptModal() {
    const parsed = selectedPromptModalParsedValue.value
    if (parsed.type === 'mcp') {
      const promptItem = findMcpPromptCatalogItem(parsed.serverId, parsed.promptName)
      if (!promptItem) {
        message.warning('未找到该 MCP 提示词，请刷新后重试')
        return
      }
  
      let args = {}
      try {
        args = buildMcpPromptArgsFromModal()
      } catch (err) {
        message.warning('MCP 提示词参数无效：' + (err?.message || String(err)))
        return
      }
  
      const ok = await applyMcpPromptToComposer(promptItem, args)
      if (!ok) return
      showPromptModal.value = false
      return
    }
  
    const localPrompt = findLocalPromptById(parsed.promptId || null)
    if (!localPrompt) {
      if (shouldClearBasePromptSelectionImmediately({
        basePromptMode: basePromptMode.value,
        selectedPromptId: selectedPromptId.value
      }, parsed)) {
        applyBasePromptSelection(null)
      }
      showPromptModal.value = false
      return
    }
  
    if (isUserPrompt(localPrompt)) {
      let values = {}
      try {
        values = buildLocalPromptArgsFromModal()
      } catch (err) {
        message.warning(err?.message || String(err))
        return
      }
  
      const ok = applyLocalPromptToComposer(localPrompt, values)
      if (!ok) return
      showPromptModal.value = false
      return
    }
  
    applyBasePromptSelection(localPrompt._id)
    showPromptModal.value = false
  }
  
  function applySkillModal() {
    selectedSkillIds.value = Array.isArray(skillModalSelectedIds.value) ? [...skillModalSelectedIds.value] : []
    showSkillModal.value = false
  }
  
  function applyMcpModal() {
    manualMcpIds.value = Array.isArray(mcpModalSelectedIds.value) ? [...mcpModalSelectedIds.value] : []
    showMcpModal.value = false
    void ensureMcpPromptCatalogLoaded({ silent: true, forceRefresh: true })
  }
  
  function resolveHistoryContextBudgetState(options = {}) {
    const { tools = [], reservedCharsOverride = null, apiMessages = null, sessionRecord = null } = options || {}
    const reservedChars = Number.isFinite(Number(reservedCharsOverride))
      ? Math.max(0, Math.floor(Number(reservedCharsOverride)))
      : calculateReservedRequestChars({
          systemContent: systemContent.value,
          tools
        })
    const sourceMessages = Array.isArray(apiMessages) ? apiMessages : session.apiMessages
    const sourceChars = estimateMessagesSize(sourceMessages)
    const tokenTelemetry = getContextTokenTelemetry(sessionRecord)
    const budgetPlan = resolveChatContextWindowBudgetPlan(effectiveContextWindowConfig.value, {
      reservedChars,
      sourceChars,
      reportedInputTokens: tokenTelemetry.inputTokens,
      reportedRequestChars: tokenTelemetry.requestChars,
      modelContextTokens: resolveModelContextWindowTokens(selectedProvider.value, selectedModel.value)
    })
    const historyBudget = budgetPlan.historyCharsBudget
    return {
      reservedChars,
      sourceChars,
      budgetPlan,
      historyBudget
    }
  }
  
  function getHistoryContextCharBudget(options = {}) {
    return resolveHistoryContextBudgetState(options).historyBudget
  }
  
  function buildRequestApiMessages(providerKind = 'openai-compatible', options = {}) {
    const {
      tools = [],
      reservedCharsOverride = null,
      apiMessages = null,
      contextSummary = null,
      sessionRecord = null
    } = options || {}
    const sourceMessages = Array.isArray(apiMessages) ? apiMessages : session.apiMessages
    const summary =
      contextSummary && typeof contextSummary === 'object'
        ? contextSummary
        : null
    const summaryText = String(summary?.summaryText || '').trim()
    const coveredMessageCount = Math.max(0, Math.floor(Number(summary?.coveredMessageCount || 0)))
    const effectiveMessages =
      summaryText && coveredMessageCount > 0 && coveredMessageCount <= sourceMessages.length
        ? sourceMessages.slice(coveredMessageCount)
        : sourceMessages
    const budgetState = resolveHistoryContextBudgetState({
      tools,
      reservedCharsOverride,
      apiMessages: effectiveMessages,
      sessionRecord
    })
  
    return buildChatContextWindow(
      effectiveMessages,
      buildChatContextWindowRuntimeOptions(contextWindowResolvedOptions.value, {
        providerKind,
        maxChars: budgetState.historyBudget,
        preserveToolResultTurns: budgetState.budgetPlan.mode !== 'compact' || !summaryText
      })
    )
  }
  
  async function requestContextWindowSummary({
    providerKind = 'openai-compatible',
    providerId = '',
    baseUrl = '',
    apiKey = '',
    apiMode = 'auto',
    model = '',
    systemPrompt = '',
    conversationPairs = []
  } = {}) {
    const pairs = Array.isArray(conversationPairs) ? conversationPairs.filter((item) => item && (item.userText || item.assistantText)) : []
    if (!pairs.length) return ''
  
    const prompt = [
      '请把下面这段较早的多轮对话压缩成后续继续聊天可用的历史摘要。',
      '保留：用户身份、长期偏好、约束、项目背景、关键已决策事项、未完成事项、重要事实。',
      '删除：寒暄、重复表述、低信息量回复、工具噪声。',
      '输出要求：使用简洁中文，分点总结，控制在 800 字以内，不要编造。'
    ]
  
    pairs.forEach((item, index) => {
      prompt.push(
        [
          `片段 ${index + 1}`,
          item.userText ? `用户：\n${item.userText}` : '',
          item.assistantText ? `助手：\n${item.assistantText}` : ''
        ].filter(Boolean).join('\n\n')
      )
    })
  
    if (providerKind === 'utools-ai') {
      if (!canUseUtoolsAi()) return ''
      const result = await window.utools.ai({
        model,
        messages: buildUtoolsAiMessages({
          systemContent: systemPrompt,
          apiMessages: [{ role: 'user', content: prompt.join('\n\n') }]
        })
      })
      recordModelUsage(extractModelUsage(result), {
        providerId,
        model,
        endpoint: 'utools-ai',
        purpose: 'context-summary'
      })
      return truncateText(String(result?.content || '').trim(), 1200, '（摘要已截断）')
    }
  
    if (!baseUrl || !apiKey || !model) return ''
    const result = await streamChatCompletion({
      baseUrl,
      apiKey,
      apiMode,
      body: {
        model,
        stream: true,
        messages: buildRequestMessages({
          baseUrl,
          model,
          apiMessages: [{ role: 'user', content: prompt.join('\n\n') }],
          memorySystemContent: '',
          tools: []
        }).map((message, index) => {
          if (index === 0 && message.role === 'system' && systemPrompt) {
            return { ...message, content: systemPrompt }
          }
          return message
        })
      },
      signal: undefined,
      onDelta: null,
      abortState: null
    })
    recordModelUsage(result?.usage, {
      providerId,
      model,
      endpoint: result?.endpoint || 'auto',
      purpose: 'context-summary'
    })
    return truncateText(String(result?.content || '').trim(), 1200, '（摘要已截断）')
  }
  
  function resolveContextSummaryCoverage({
    sourceMessages = [],
    cfg = null,
    tools = [],
    reservedCharsOverride = null,
    targetSourceChars = null,
    sessionRecord = null
  } = {}) {
    const list = Array.isArray(sourceMessages) ? sourceMessages : []
    if (!cfg || cfg.requestMode !== 'chat' || list.length < 1) {
      return {
        coveredCount: 0,
        sourceSlice: [],
        sourceHash: ''
      }
    }
  
    const requestMessages = buildRequestApiMessages(cfg.providerKind || 'openai-compatible', {
      tools,
      reservedCharsOverride,
      apiMessages: list,
      sessionRecord
    })
    let coveredCount = Math.max(0, list.length - requestMessages.length)
    if (coveredCount < 1 && list.length > 1 && Number.isFinite(Number(targetSourceChars))) {
      const targetChars = Math.max(4000, Math.floor(Number(targetSourceChars)))
      const keepRecentTurnsFull = Math.max(1, Number(contextWindowResolvedOptions.value?.keepRecentTurnsFull || 6))
      const minKeptMessages = Math.max(1, Math.min(list.length - 1, Math.max(2, keepRecentTurnsFull * 2)))
      let keepStart = Math.max(0, list.length - minKeptMessages)
      let keptChars = estimateMessagesSize(list.slice(keepStart))
  
      while (keepStart > 0) {
        const nextMessageChars = estimateMessageSize(list[keepStart - 1])
        if (keptChars + nextMessageChars > targetChars) break
        keepStart -= 1
        keptChars += nextMessageChars
      }
  
      if (keepStart > 0) coveredCount = keepStart
    }
  
    if (coveredCount < 1) {
      return {
        coveredCount: 0,
        sourceSlice: [],
        sourceHash: ''
      }
    }
  
    const sourceSlice = list.slice(0, coveredCount)
    return {
      coveredCount,
      sourceSlice,
      sourceHash: buildContextSummarySourceHash(sourceSlice)
    }
  }
  
  async function ensureContextWindowSummary({
    cfg,
    requestRecord,
    tools = [],
    reservedCharsOverride = null,
    targetSourceChars = null,
    force = false
  } = {}) {
    if (!cfg || cfg.requestMode !== 'chat' || !requestRecord) return ''
    const sourceMessages = Array.isArray(requestRecord.apiMessages) ? requestRecord.apiMessages : []
    const { coveredCount, sourceSlice, sourceHash } = resolveContextSummaryCoverage({
      sourceMessages,
      cfg,
      tools,
      reservedCharsOverride,
      targetSourceChars,
      sessionRecord: requestRecord
    })
    if (coveredCount < 1) return ''
  
    const cached = requestRecord.contextSummary && typeof requestRecord.contextSummary === 'object'
      ? requestRecord.contextSummary
      : null
    if (!force && cached?.summaryText && cached.sourceHash === sourceHash && Number(cached.coveredMessageCount || 0) === coveredCount) {
      return String(cached.summaryText || '').trim()
    }
  
    const cachedSummaryText = String(cached?.summaryText || '').trim()
    const cachedCoveredCount = Math.max(0, Math.floor(Number(cached?.coveredMessageCount || 0)))
    const hasForwardProgress = cachedSummaryText && cachedCoveredCount > 0 && cachedCoveredCount < coveredCount
    const layeredSourceMessages = hasForwardProgress
      ? [
          {
            role: 'system',
            content: `previous compressed summary:\n${cachedSummaryText}`
          },
          ...sourceMessages.slice(cachedCoveredCount, coveredCount)
        ]
      : sourceMessages.slice(0, coveredCount)
    const conversationTurns = buildContextSummaryTurnSegments(layeredSourceMessages, {
      endExclusive: layeredSourceMessages.length
    })
    const conversationText = conversationTurns
      .map((item, index) => {
        const turnText = String(item?.turnText || item?.userText || '').trim()
        if (!turnText) return ''
        return [`turn ${index + 1}`, turnText].filter(Boolean).join('\n\n')
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    const conversationPairs = conversationText
      ? [{
          userText: `all history before compression:\n\n${conversationText}`,
          assistantText: '',
          summary: hasForwardProgress
            ? `compressed history from previous summary plus ${conversationTurns.length} turns`
            : `all prior history, ${conversationTurns.length} turns`
        }]
      : []
    if (!conversationPairs.length) return ''
    const summaryLevel = resolveContextSummaryLevel(cached, hasForwardProgress)
    const summaryChain = resolveContextSummaryChain(cached, summaryLevel, hasForwardProgress)
    const summarySourceLabel = resolveContextSummarySourceLabel(hasForwardProgress)
  
    const summaryText = await requestContextWindowSummary({
      providerKind: cfg.providerKind,
      providerId: cfg.providerId,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      apiMode: normalizeProviderApiMode(cfg.apiMode),
      model: cfg.model,
      systemPrompt: '你是一个对话历史压缩器，只输出供后续对话继续使用的忠实摘要。',
      conversationPairs
    }).catch((err) => {
      console.warn('[chat context summary] generation failed:', err)
      return ''
    })
  
    requestRecord.contextSummary = {
      summaryText: String(summaryText || '').trim(),
      coveredMessageCount: coveredCount,
      coveredTurnCount: conversationTurns.length,
      batchCount: 1,
      summaryLevel,
      summaryChain,
      summarySourceLabel,
      sourceHash,
      updatedAt: Date.now()
    }
    return String(requestRecord.contextSummary.summaryText || '').trim()
  }
  
  function syncContextSummaryCacheForRecord(requestRecord, coverage = null) {
    if (!requestRecord || typeof requestRecord !== 'object') return null
    const cached = requestRecord.contextSummary && typeof requestRecord.contextSummary === 'object'
      ? requestRecord.contextSummary
      : null
    if (!cached) return null
  
    const coveredCount = Math.max(0, Math.floor(Number(coverage?.coveredCount || 0)))
    const sourceHash = String(coverage?.sourceHash || '')
    if (
      !String(cached.summaryText || '').trim() ||
      coveredCount < 1 ||
      !sourceHash ||
      coveredCount > (Array.isArray(requestRecord.apiMessages) ? requestRecord.apiMessages.length : 0)
    ) {
      requestRecord.contextSummary = createEmptyContextSummaryState()
      return requestRecord.contextSummary
    }
  
    return cached
  }
  
  async function prepareChatRequestContext({
    cfg,
    text = '',
    attachments = [],
    requestRecord = null,
    includeMemoryRecall = true,
    excludeLatestUserTurnFromMemoryRecall = false
  } = {}) {
    const safeText = String(text || '').trim()
    const safeAttachments = Array.isArray(attachments) ? attachments : []
    const targetRecord = requestRecord || getActiveMemorySession()
  
    const triggerText = safeText || safeAttachments.map((a) => String(a?.name || '')).filter(Boolean).join(' ')
    try {
      await autoActivateAgentSkillsFromText(triggerText)
    } catch {
      // ignore
    }
  
    if (safeAttachments.length) {
      try {
        preparingSendStage.value = '正在解析附件'
        await Promise.all(safeAttachments.map((a) => ensureAttachmentParsed(a)))
        await enrichImageAttachmentsForMemoryRecall(safeAttachments, cfg)
      } catch {
        // ignore attachment parsing failure for recall
      }
      preparingSendStage.value = '正在写入聊天沙盒'
      await stageChatAttachmentsInSandbox(safeAttachments, targetRecord)
      if (cfg?.requestMode === 'chat') {
        await ensureAttachmentSandboxSkillAvailable(safeAttachments)
      }
    }
  
    let memorySystemContent = ''
    let attachmentRecallText = ''
    if (includeMemoryRecall && cfg?.requestMode === 'chat' && isChatMemoryEnabled(chatConfig.value?.memory)) {
      try {
        preparingSendStage.value = '正在召回记忆'
        attachmentRecallText = buildMemoryRecallQueryFromAttachments(safeAttachments)
        const memoryQueryText = [
          buildMemoryRecallQueryFromRecord(targetRecord, safeText, {
            excludeLatestUserTurn: excludeLatestUserTurnFromMemoryRecall
          }),
          attachmentRecallText
        ].filter(Boolean).join('\n\n')
        const recall = await buildMemoryInjection({
          queryText: memoryQueryText,
          userText: [safeText, attachmentRecallText].filter(Boolean).join('\n\n'),
          systemPrompt: systemContent.value
        })
        memorySystemContent = String(recall?.text || '').trim()
      } catch (err) {
        console.warn('[chat memory] recall failed:', err)
      }
    }
  
    try {
      preparingSendStage.value = '正在压缩历史'
      if (cfg?.requestMode !== 'chat') {
        return {
          requestRecord: targetRecord,
          memorySystemContent,
          attachmentRecallText
        }
      }
      const contextCfg = effectiveContextWindowConfig.value
      const resolvedContext = resolveChatContextWindowOptions(contextCfg)
      const requestTools = []
      const combinedSystemContent = buildCombinedSystemContent(memorySystemContent, { sessionRecord: targetRecord })
      const reservedChars = calculateReservedRequestChars({ systemContent: combinedSystemContent, tools: requestTools })
      const sourceMessages = Array.isArray(targetRecord.apiMessages) ? targetRecord.apiMessages : []
      const budgetState = resolveHistoryContextBudgetState({
        tools: requestTools,
        reservedCharsOverride: reservedChars,
        apiMessages: sourceMessages,
        sessionRecord: targetRecord
      })
      const historyBudget = budgetState.historyBudget
      const summaryTriggerChars = calculateContextSummaryTriggerChars({
        historyCharsBudget: historyBudget
      })
      const sourceChars = estimateMessagesSize(sourceMessages)
      const coverage = resolveContextSummaryCoverage({
        sourceMessages,
        cfg,
        tools: requestTools,
        reservedCharsOverride: reservedChars,
        targetSourceChars: summaryTriggerChars,
        sessionRecord: targetRecord
      })
      const cachedSummary = syncContextSummaryCacheForRecord(targetRecord, coverage)
      const sourceBudgetMessages = buildRequestApiMessages(cfg.providerKind || 'openai-compatible', {
        tools: requestTools,
        reservedCharsOverride: reservedChars,
        apiMessages: sourceMessages,
        contextSummary: targetRecord?.contextSummary || null,
        sessionRecord: targetRecord
      })
      const contextInspection = inspectChatContextWindow(
        sourceMessages,
        buildChatContextWindowRuntimeOptions(resolvedContext, {
          providerKind: cfg.providerKind || 'openai-compatible',
          maxChars: historyBudget,
          preserveToolResultTurns: budgetState.budgetPlan.mode !== 'compact' || !String(cachedSummary?.summaryText || '').trim()
        })
      )
      const contextWouldTrim =
        sourceBudgetMessages.length < sourceMessages.length || hasChatContextWindowReduction(contextInspection)
      const summaryMissing = !String(cachedSummary?.summaryText || '').trim()
      const summaryStale =
        coverage.coveredCount >= 1 &&
        (
          coverage.sourceHash !== String(cachedSummary?.sourceHash || '') ||
          coverage.coveredCount !== Math.max(0, Math.floor(Number(cachedSummary?.coveredMessageCount || 0)))
        )
      const shouldSummarize = shouldSummarizeContextWindow({
        sourceMessages,
        sourceChars,
        summaryTriggerChars,
        coveredCount: coverage.coveredCount,
        contextWouldTrim,
        summaryMissing,
        summaryStale,
        minMessages: 2
      })
      if (shouldSummarize) {
        await ensureContextWindowSummary({
          cfg,
          requestRecord: targetRecord,
          tools: requestTools,
          reservedCharsOverride: reservedChars,
          targetSourceChars: summaryTriggerChars,
          force: summaryStale
        })
      }
    } catch (err) {
      console.warn('[chat context summary] prepare failed:', err)
    } finally {
      preparingSendStage.value = '正在发送'
    }
  
    return {
      requestRecord: targetRecord,
      memorySystemContent,
      attachmentRecallText
    }
  }
  
  async function startPreparingSend(task) {
    if (sending.value || preparingSend.value) return false
    preparingSend.value = true
    preparingSendStage.value = '正在准备上下文'
    let released = false
    const release = () => {
      if (released) return
      released = true
      preparingSend.value = false
      preparingSendStage.value = ''
    }
    try {
      await task?.({ release })
      release()
      return true
    } catch (err) {
      release()
      throw err
    }
  }
  
  function isLikelyImageGenerationPrompt(text) {
    const normalized = String(text || '').trim().toLowerCase()
    if (!normalized) return false
  
    return /(^|\b)(draw|generate|create|make|render|illustrate|design)(\b|$)|生成图片|生成一张图|生成一幅图|画一张图|画一幅图|做一张图|出图|产图|画图|绘图|海报|封面图|插画|头像|壁纸|logo/i.test(
      normalized
    )
  }
  
  function isLikelyVideoGenerationPrompt(text) {
    const normalized = String(text || '').trim().toLowerCase()
    if (!normalized) return false
  
    return /(^|\b)(animate|generate|create|make|render)(\b|$)|生成视频|做个视频|出视频|产视频|视频生成|动画短片|短视频|motion video|text to video|text-to-video|img2video|image-to-video/i.test(
      normalized
    )
  }

  function extractRequestMessageTextContent(content) {
    return extractImageGenerationPromptFromContent(content)
  }

  function buildEmptyAssistantResponseText(apiMessages = session.apiMessages) {
    const imageMode = normalizeImageGenerationMode(imageGenerationMode.value)
    const videoMode = normalizeImageGenerationMode(videoGenerationMode.value)
    const model = String(selectedModel.value || '').trim()
    const latestUserPrompt = (() => {
      const list = Array.isArray(apiMessages) ? apiMessages : []
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const msg = list[i]
        if (msg?.role === 'user') return extractRequestMessageTextContent(msg.content)
      }
      return ''
    })()
  
    if (videoMode === 'on') {
      return '（模型返回为空：当前已开启视频生成模式，但服务商/模型没有返回可用结果，请检查视频生成接口兼容性）'
    }
  
    if (imageMode === 'on') {
      return '（模型返回为空：当前已开启图片生成模式，但服务商/模型没有返回可用结果，请检查图片生成接口兼容性）'
    }
  
    if (videoMode === 'auto' && isLikelyVideoGenerationPrompt(latestUserPrompt) && !isLikelyVideoGenerationModel(model)) {
      return '（模型返回为空：如果这实际是视频生成请求，请将视频生成模式切换为开启后重试）'
    }
  
    if (imageMode === 'auto' && isLikelyImageGenerationPrompt(latestUserPrompt) && !isLikelyImageGenerationModel(model)) {
      return '（模型返回为空：如果这实际是图片生成请求，请将图片生成模式切换为开启后重试）'
    }
  
    return '（模型返回为空：请检查服务商配置或接口兼容性）'
  }
  
  function buildMediaGenerationPromptFromHistory(userPrompt, options = {}) {
    const currentPrompt = String(userPrompt || '').trim()
    if (!currentPrompt) return ''
  
    const mediaLabel = String(options.mediaLabel || '图片').trim() || '图片'
    const promptLead = `当前${mediaLabel}生成需求：\n${currentPrompt}`
    const mediaSystemContent = getMediaGenerationSystemContent()
    const reservedChars = mediaSystemContent.length + promptLead.length + 2000
    const requestMessages = buildRequestApiMessages('openai-compatible', {
      reservedCharsOverride: reservedChars,
      apiMessages: Array.isArray(options.apiMessages) ? options.apiMessages : null
    })
  
    let latestUserIndex = -1
    for (let i = requestMessages.length - 1; i >= 0; i -= 1) {
      if (requestMessages[i]?.role === 'user') {
        latestUserIndex = i
        break
      }
    }
  
    const historyLines = (latestUserIndex > 0 ? requestMessages.slice(0, latestUserIndex) : [])
      .filter((message) => message?.role === 'user' || message?.role === 'assistant')
      .map((message) => {
        const text = truncateInlineText(extractEditableUserTextFromContent(extractRequestMessageTextContent(message.content)), 800)
        if (!text) return ''
        const roleLabel = message.role === 'assistant' ? '助手' : '用户'
        return `${roleLabel}: ${text}`
      })
      .filter(Boolean)
  
    const contextText = historyLines.length
      ? truncateText(historyLines.join('\n\n'), 6000, '（较早的对话上下文已截断）')
      : ''
  
    return [mediaSystemContent, contextText ? `参考最近对话上下文：\n${contextText}` : '', promptLead]
      .filter(Boolean)
      .join('\n\n')
  }
  
  function buildImageGenerationPromptFromHistory(userPrompt, options = {}) {
    return buildMediaGenerationPromptFromHistory(userPrompt, { ...options, mediaLabel: '图片' })
  }
  
  function buildVideoGenerationPromptFromHistory(userPrompt, options = {}) {
    return buildMediaGenerationPromptFromHistory(userPrompt, { ...options, mediaLabel: '视频' })
  }
  
  function hasToolStateMessages(messages) {
    return (Array.isArray(messages) ? messages : []).some((message) => {
      if (!message || typeof message !== 'object') return false
      return message.role === 'tool' || (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
    })
  }
  
  function shouldRetryToolContinuationAsPlainText(errorText) {
    const lower = String(errorText || '').toLowerCase()
    if (!lower) return false
    if (lower.includes('reasoning_content') && lower.includes('thinking mode')) return true
    if (lower.includes('reasoning_content') && lower.includes('passed back to the api')) return true
    if (lower.includes('request targeted an endpoint') && lower.includes('temporarily unavailable')) return true
    if (lower.includes('endpoint') && lower.includes('closed') && lower.includes('temporarily unavailable')) return true
    if (lower.includes('unsupported') && lower.includes('tool')) return true
    if (lower.includes('does not support') && lower.includes('tool')) return true
    return false
  }
  
  function buildRequestMessages(options = {}) {
    const {
      baseUrl = '',
      model = '',
      memorySystemContent = '',
      sessionRecord = null,
      forceReasoningContent = false,
      compatToolCallIdAsFc = false,
      visionFallbackText = '',
      fallbackAllVisionMessages = false,
      plainTextToolFallback = false,
      apiMessages = null,
      tools = []
    } = options || {}
    const sourceMessages = Array.isArray(apiMessages)
      ? apiMessages
      : buildRequestApiMessages('openai-compatible', {
          tools,
          contextSummary: sessionRecord?.contextSummary || null,
          sessionRecord
        })
    return buildChatRequestMessages({
      systemContent: buildCombinedSystemContent(memorySystemContent, { sessionRecord }),
      sourceMessages,
      needsReasoningContent: shouldIncludeReasoningContent({
        baseUrl,
        model,
        forceReasoningContent,
        apiMessages: sourceMessages
      }),
      compatToolCallIdAsFc,
      visionFallbackText,
      fallbackAllVisionMessages,
      plainTextToolFallback
    })
  }
  
  function resolveCurrentToolApprovalMode(abortState = abortController.value, record = null) {
    const runRecord = record || getRunRecord(abortState)
    if (runRecord && isMemorySessionActive(runRecord)) {
      return normalizeToolApprovalMode(toolApprovalMode.value)
    }
    if (abortState && typeof abortState.toolApprovalMode === 'string') {
      return normalizeToolApprovalMode(abortState.toolApprovalMode)
    }
    if (runRecord) {
      return normalizeToolApprovalMode(
        runRecord.toolApprovalMode,
        runRecord.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : toolApprovalMode.value
      )
    }
    return normalizeToolApprovalMode(toolApprovalMode.value)
  }

  function closeMcpClientSafely(server, client, pooled = false) {
    try {
      if (pooled && server?._id) closePooledMCPClient(server._id)
      else client?.close?.()
    } catch {
      // ignore
    }
  }
  
  function registerAbortableMcpClient(abortState, server, client, pooled = false) {
    if (!abortState?.onAbort || !client) return null
    return abortState.onAbort(() => {
      closeMcpClientSafely(server, client, pooled)
    }) || null
  }
  
  function ensureMcpToolsStatus(serverId) {
    const id = String(serverId || '').trim()
    if (!id) return null
    if (!mcpToolsStatusByServerId[id]) {
      mcpToolsStatusByServerId[id] = {
        loading: false,
        toolCount: 0,
        updatedAt: 0,
        lastError: '',
        lastErrorAt: 0
      }
    }
    return mcpToolsStatusByServerId[id]
  }
  
  function getMcpToolsCacheKey(server) {
    const id = String(server?._id || '').trim()
    const fingerprint = stableStringify({
      transportType: server?.transportType,
      command: server?.command,
      args: server?.args,
      url: server?.url,
      method: server?.method,
      headers: server?.headers,
      env: server?.env,
      cwd: server?.cwd
    })
    return `${id}|${fingerprint}`
  }
  
  function filterAllowedMcpTools(server, list) {
    const allow = Array.isArray(server?.allowTools) ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
    if (!allow.length) return Array.isArray(list) ? list : []
    const enabledNames = new Set(allow)
    return (Array.isArray(list) ? list : []).filter((t) => enabledNames.has(String(t?.name || '').trim()))
  }
  
  async function listMcpToolsForServer(server, options = {}) {
    const forceRefresh = !!options.forceRefresh
    const silent = !!options.silent
    const abortState = options.abortState || null
  
    throwIfAborted(abortState)
  
    const serverId = String(server?._id || '').trim()
    if (!serverId) return { ok: false, tools: [], error: new Error('missing server id') }
  
    const status = ensureMcpToolsStatus(serverId)
    const cacheKey = getMcpToolsCacheKey(server)
    const now = Date.now()
  
    const cached = mcpListToolsCache.get(cacheKey)
    if (!forceRefresh && cached && now - cached.at < MCP_LIST_TOOLS_TTL_MS) {
      if (status) {
        status.loading = false
        status.toolCount = Array.isArray(cached.tools) ? cached.tools.length : 0
        status.updatedAt = cached.at
        status.lastError = ''
        status.lastErrorAt = 0
      }
      return { ok: true, tools: cached.tools, cached: true, updatedAt: cached.at }
    }
  
    const inflight = mcpListToolsInFlight.get(cacheKey)
    if (inflight) return abortState ? waitForAbortable(inflight, abortState) : inflight
  
    const promise = (async () => {
      if (status) status.loading = true
  
      let client = null
      let pooled = false
      let unregisterAbort = null
      try {
        ;({ client, pooled } = getOrCreateMCPClient(server))
        if (!client?.listTools) {
          throw new Error('MCP 客户端不可用（未注入 createMCPClient）')
        }
  
        const listTimeoutMs = Number(server?.timeout) || 10000
        unregisterAbort = registerAbortableMcpClient(abortState, server, client, pooled)
        const list = await waitForAbortable(
          withTimeout(client.listTools(), listTimeoutMs, `获取 MCP 工具列表：${server.name || server._id}`),
          abortState
        )
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
        unregisterAbort = null
        throwIfAborted(abortState)
        releaseMCPClient(server, client)
        client = null
  
        const tools = Array.isArray(list) ? list : Array.isArray(list?.tools) ? list.tools : []
        const at = Date.now()
        mcpListToolsCache.set(cacheKey, { at, tools })
  
        if (status) {
          status.loading = false
          status.toolCount = tools.length
          status.updatedAt = at
          status.lastError = ''
          status.lastErrorAt = 0
        }
  
        return { ok: true, tools, cached: false, updatedAt: at }
      } catch (err) {
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
        unregisterAbort = null
  
        if (isAbortError(err) || abortState?.aborted) {
          if (status) status.loading = false
          throw createAbortError()
        }
  
        closeMcpClientSafely(server, client, pooled)
  
        const errorText = err?.message || String(err)
        if (status) {
          status.loading = false
          status.lastError = errorText
          status.lastErrorAt = Date.now()
        }
  
        if (!silent) console.warn('listMcpToolsForServer failed', serverId, err)
        return { ok: false, tools: [], error: err }
      } finally {
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
      }
    })()
  
    mcpListToolsInFlight.set(cacheKey, promise)
    promise.finally(() => mcpListToolsInFlight.delete(cacheKey))
    return promise
  }
  
  async function listMcpPromptsForServer(server, options = {}) {
    const forceRefresh = !!options.forceRefresh
    const abortState = options.abortState || null
    throwIfAborted(abortState)
  
    const serverId = String(server?._id || '').trim()
    if (!serverId) return { ok: false, prompts: [], error: new Error('missing server id') }
    if (server?.disabled) return { ok: true, prompts: [], disabled: true }
  
    const cacheKey = getMcpToolsCacheKey(server)
    const now = Date.now()
    const cached = mcpListPromptsCache.get(cacheKey)
    if (!forceRefresh && cached && now - cached.at < MCP_LIST_PROMPTS_TTL_MS) {
      return { ok: true, prompts: cached.prompts, cached: true, updatedAt: cached.at }
    }
  
    const inflight = mcpListPromptsInFlight.get(cacheKey)
    if (inflight) return abortState ? waitForAbortable(inflight, abortState) : inflight
  
    const promise = (async () => {
      let client = null
      let pooled = false
      let unregisterAbort = null
      try {
        ;({ client, pooled } = getOrCreateMCPClient(server))
        if (!client?.listPrompts) {
          throw new Error('MCP 客户端不支持 prompts/list')
        }
  
        const listTimeoutMs = Number(server?.timeout) || 10000
        unregisterAbort = registerAbortableMcpClient(abortState, server, client, pooled)
        const list = await waitForAbortable(
          withTimeout(client.listPrompts(), listTimeoutMs, `获取 MCP 提示词列表：${server.name || server._id}`),
          abortState
        )
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
        unregisterAbort = null
        throwIfAborted(abortState)
        releaseMCPClient(server, client)
        client = null
  
        const promptsList = Array.isArray(list) ? list : Array.isArray(list?.prompts) ? list.prompts : []
        const prompts = normalizeMcpPromptList(server, promptsList)
        const at = Date.now()
        mcpListPromptsCache.set(cacheKey, { at, prompts })
        return { ok: true, prompts, cached: false, updatedAt: at }
      } catch (err) {
        try {
          unregisterAbort?.()
        } catch {
          // ignore
        }
        closeMcpClientSafely(server, client, pooled)
        return { ok: false, prompts: [], error: err }
      } finally {
        mcpListPromptsInFlight.delete(cacheKey)
      }
    })()
  
    mcpListPromptsInFlight.set(cacheKey, promise)
    return promise
  }
  
  async function ensureMcpPromptCatalogLoaded(options = {}) {
    const forceRefresh = !!options.forceRefresh
    const silent = !!options.silent
    if (mcpPromptCatalogLoadPromise && !forceRefresh) return mcpPromptCatalogLoadPromise
  
    mcpPromptCatalogLoadPromise = (async () => {
      const servers = (Array.isArray(activeMcpServers.value) ? activeMcpServers.value : []).filter((server) => server && server._id && !server.disabled)
      if (!servers.length) {
        mcpPromptCatalog.value = []
        return []
      }
  
      loadingMcpPrompts.value = true
      try {
        const results = await Promise.all(servers.map((server) => listMcpPromptsForServer(server, { forceRefresh })))
        const promptsList = []
        results.forEach((result, index) => {
          if (result?.ok) {
            promptsList.push(...(Array.isArray(result.prompts) ? result.prompts : []))
            return
          }
          if (!silent) {
            const server = servers[index]
            message.warning(`MCP 提示词加载失败：${server?.name || server?._id || ''} ${result?.error?.message || result?.error || ''}`.trim())
          }
        })
        promptsList.sort((a, b) => String(a.serverName || '').localeCompare(String(b.serverName || ''), 'zh-Hans-CN') || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))
        mcpPromptCatalog.value = promptsList
        return promptsList
      } finally {
        loadingMcpPrompts.value = false
        mcpPromptCatalogLoadPromise = null
      }
    })()
  
    return mcpPromptCatalogLoadPromise
  }
  
  function buildMcpPromptArgsFromModal() {
    const args = selectedMcpPromptArgs.value
    if (Array.isArray(args) && args.length) {
      return buildMcpArgsFromForm(args, promptMcpArgsForm)
    }
  
    return undefined
  }
  
  function buildLocalPromptArgsFromModal() {
    return buildPromptVariableValues(selectedLocalPromptVariables.value, promptUserArgsForm)
  }
  
  function insertTextIntoComposer(text) {
    const insertion = String(text || '').trim()
    if (!insertion) return
  
    const raw = String(input.value || '')
    const el = getComposerTextareaEl()
    const start = el?.selectionStart ?? raw.length
    const end = el?.selectionEnd ?? start
    const before = raw.slice(0, start)
    const after = raw.slice(end)
    const prefix = before && !/[\s\n]$/.test(before) ? '\n\n' : ''
    const suffix = after && !/^[\s\n]/.test(after) ? '\n\n' : ''
    input.value = `${before}${prefix}${insertion}${suffix}${after}`
    focusComposerAt(before.length + prefix.length + insertion.length)
  }
  
  async function applyMcpPromptToComposer(item, args) {
    const serverId = String(item?.serverId || '').trim()
    const promptName = String(item?.name || '').trim()
    if (!serverId || !promptName) return false
  
    const server = (mcpServers.value || []).find((candidate) => candidate?._id === serverId) || null
    if (!server || server.disabled) {
      message.warning('该 MCP 不可用，请先到设置页启用')
      return false
    }
  
    let client = null
    let pooled = false
    try {
      ;({ client, pooled } = getOrCreateMCPClient(server))
      if (!client?.getPrompt && !client?.sendRequest) throw new Error('MCP 客户端不支持 prompts/get')
  
      const timeoutMs = Number(server?.timeout) || 30000
      const result = await withTimeout(getMcpPrompt(client, promptName, args), timeoutMs, `获取 MCP 提示词：${server.name || server._id} / ${promptName}`)
      releaseMCPClient(server, client)
      client = null
  
      insertTextIntoComposer(formatMcpPromptResultForComposer(result, item))
      message.success('MCP 提示词已插入输入框，可编辑后发送')
      return true
    } catch (err) {
      closeMcpClientSafely(server, client, pooled)
      message.error('获取 MCP 提示词失败：' + (err?.message || String(err)))
      return false
    }
  }
  
  function applyLocalPromptToComposer(prompt, values) {
    const rendered = formatLocalUserPromptForComposer(prompt, values)
    if (!rendered) {
      message.warning('该用户提示词内容为空')
      return false
    }
    insertTextIntoComposer(rendered)
    message.success('用户提示词已插入输入框，可继续编辑后发送')
    return true
  }
  
  function upsertPinnedMcpToolHint(serverId, tool) {
    const id = String(serverId || '').trim()
    if (!id) return
    const hint = buildMcpToolHint(tool)
    if (!hint?.name) return
  
    const prev = mcpPinnedToolHintsByServerId.get(id)
    const list = Array.isArray(prev) ? prev : []
    const next = [hint, ...list.filter((x) => String(x?.name || '') !== hint.name)]
    if (next.length > MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER) next.length = MCP_PINNED_TOOL_HINTS_MAX_PER_SERVER
    mcpPinnedToolHintsByServerId.set(id, next)
    mcpPinnedToolHintsRevision.value += 1
  }
  
  function clearPinnedMcpToolHints() {
    try {
      mcpPinnedToolHintsByServerId.clear()
    } catch {
      // ignore
    }
    mcpPinnedToolHintsRevision.value += 1
  }
  
  function buildMcpToolCatalogEntry(server, tools) {
    const serverId = String(server?._id || '').trim()
    const serverName = String(server?.name || serverId).trim() || serverId
  
    const allow = Array.isArray(server?.allowTools) ? server.allowTools.map((x) => String(x || '').trim()).filter(Boolean) : []
    const allowMode = allow.length ? 'whitelist' : 'all'
  
    const allowed = filterAllowedMcpTools(server, tools)
    const allNames = allowed.map((t) => String(t?.name || '').trim()).filter(Boolean)
    const toolNames = allNames.slice(0, MCP_CATALOG_MAX_TOOL_NAMES_PER_SERVER)
    const toolNamesTruncated = allNames.length > toolNames.length
  
    const hints = []
    for (const t of allowed) {
      if (hints.length >= MCP_CATALOG_MAX_TOOL_HINTS_PER_SERVER) break
      const hint = buildMcpToolHint(t)
      // 只保留对参数有帮助的提示，避免无意义膨胀
      if (hint && (hint.description || hint.required || hint.optional || hint.input_type)) hints.push(hint)
    }
  
    return {
      ok: true,
      server_id: serverId,
      server_name: serverName,
      keepAlive: !!server?.keepAlive,
      allow_mode: allowMode,
      allow_count: allow.length,
      tool_count: allNames.length,
      tool_names: toolNames,
      tool_names_truncated: toolNamesTruncated,
      tool_hints: hints,
      updated_at: Date.now()
    }
  }
  
  function setMcpToolCatalogEntry(serverId, entry) {
    const id = String(serverId || '').trim()
    if (!id) return
    mcpToolCatalogByServerId.set(id, entry)
    mcpToolCatalogRevision.value += 1
  }
  
  function clearMcpToolCatalog() {
    try {
      mcpToolCatalogByServerId.clear()
    } catch {
      // ignore
    }
    mcpToolCatalogRevision.value += 1
  }
  
  async function warmMcpToolCatalogForServers(servers, options = {}) {
    const forceRefresh = !!options.forceRefresh
    const abortState = options.abortState || null
    const list = (Array.isArray(servers) ? servers : []).filter((s) => s && s._id && !s.disabled)
    if (!list.length) return
  
    throwIfAborted(abortState)
    const results = await Promise.allSettled(list.map((s) => listMcpToolsForServer(s, { forceRefresh, silent: true, abortState })))
    throwIfAborted(abortState)
    list.forEach((server, idx) => {
      const r = results[idx]
      if (!r || r.status !== 'fulfilled' || !r.value?.ok) {
        const err = r?.status === 'fulfilled' ? r.value?.error : r?.reason
        setMcpToolCatalogEntry(String(server._id), {
          ok: false,
          server_id: String(server._id),
          server_name: server.name || server._id,
          keepAlive: !!server.keepAlive,
          error: err?.message || String(err || 'listTools failed'),
          updated_at: Date.now()
        })
        return
      }
  
      const entry = buildMcpToolCatalogEntry(server, r.value.tools)
      setMcpToolCatalogEntry(String(server._id), entry)
    })
  }
  
  async function buildToolsBundle(options = {}) {
    const abortState = options.abortState || null
    const targetSession = options.sessionTarget || getRunSessionTarget(abortState)
    const functionMap = new Map()
    const tools = []
    const finalizeBundle = () => {
      syncLastBuiltRequestToolsStats(tools)
      return { tools, map: functionMap }
    }
  
    throwIfAborted(abortState)
  
    if (webSearchEnabled.value) {
      functionMap.set('web_search', { type: 'internal', internal: 'web_search', serverName: '内置联网', toolName: 'web_search' })
      functionMap.set('web_read', { type: 'internal', internal: 'web_read', serverName: '内置联网', toolName: 'web_read' })
      tools.push(
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: INTERNAL_TOOL_SPECS.webSearch.description,
            parameters: INTERNAL_TOOL_SPECS.webSearch.parameters
          }
        },
        {
          type: 'function',
          function: {
            name: 'web_read',
            description: INTERNAL_TOOL_SPECS.webRead.description,
            parameters: INTERNAL_TOOL_SPECS.webRead.parameters
          }
        }
      )
    }
  
    const skillBundle = buildSkillToolsBundle({
      selectedSkills: runtimeSkillObjects.value,
      availableSkills: skills.value,
      agentSkillIds: runtimeAgentSkillIds.value,
      internalToolSpecs: INTERNAL_TOOL_SPECS
    })
    skillBundle.tools.forEach((tool) => tools.push(tool))
    skillBundle.map.forEach((mapping, name) => functionMap.set(name, mapping))

    const servers = runtimeMcpServers.value.filter((s) => s && !s.disabled && s._id)
  
    const desiredMode = String(toolMode.value || 'auto')
    let mode = desiredMode
    if (mode !== 'expanded' && mode !== 'compact') mode = 'auto'
  
    const addCompactMcpTools = () => {
      functionMap.set('mcp_discover', { type: 'internal', internal: 'mcp_discover', serverName: 'MCP', toolName: 'mcp_discover' })
      functionMap.set('mcp_call', { type: 'internal', internal: 'mcp_call', serverName: 'MCP', toolName: 'mcp_call' })
  
      tools.push(
        {
          type: 'function',
          function: {
            name: 'mcp_discover',
            description: INTERNAL_TOOL_SPECS.mcpDiscover.description,
            parameters: INTERNAL_TOOL_SPECS.mcpDiscover.parameters
          }
        },
        {
          type: 'function',
          function: {
            name: 'mcp_call',
            description: INTERNAL_TOOL_SPECS.mcpCall.description,
            parameters: INTERNAL_TOOL_SPECS.mcpCall.parameters
          }
        }
      )
    }

    if (isDefaultGeneralAgent.value && servers.length) {
      effectiveToolMode.value = 'compact'
      addCompactMcpTools()
      return finalizeBundle()
    }

    if (mode === 'compact') {
      effectiveToolMode.value = 'compact'
  
      // 保持 keepAlive 行为：在精简模式下也尽量预连接需要长连接的 MCP
      servers
        .filter((s) => s && s.keepAlive)
        .forEach((s) => {
          try {
            getOrCreateMCPClient(s)
          } catch {
            // ignore
          }
        })
  
      addCompactMcpTools()
      await warmMcpToolCatalogForServers(servers, { forceRefresh: false, abortState })
      throwIfAborted(abortState)
      return finalizeBundle()
    }
  
    const shouldUseCompactByAuto = async () => {
      if (mode !== 'auto') return false
      let total = 0
      for (const server of servers) {
        throwIfAborted(abortState)
        const listResult = await listMcpToolsForServer(server, { silent: true, abortState })
        if (!listResult.ok) continue
        const allowed = filterAllowedMcpTools(server, listResult.tools)
        total += allowed.length
        if (total > MAX_EXPANDED_TOOL_COUNT) return true
      }
      return false
    }
  
    if (await shouldUseCompactByAuto()) {
      effectiveToolMode.value = 'compact'
      servers
        .filter((s) => s && s.keepAlive)
        .forEach((s) => {
          try {
            getOrCreateMCPClient(s)
          } catch {
            // ignore
          }
        })
      addCompactMcpTools()
      await warmMcpToolCatalogForServers(servers, { forceRefresh: false, abortState })
      throwIfAborted(abortState)
      return finalizeBundle()
    }
  
    effectiveToolMode.value = 'expanded'
  
    for (const server of servers) {
      throwIfAborted(abortState)
      const listResult = await listMcpToolsForServer(server, { silent: true, abortState })
      if (!listResult.ok) {
        const err = listResult.error || new Error('listTools failed')
        throwIfAborted(abortState)
        targetSession.messages.push(
          createDisplayMessage(
            'tool',
            `### MCP 工具加载失败\n- 服务：**${server.name || server._id}**\n- 错误：${err.message || String(err)}`,
            { toolMeta: `${server.name || server._id} / MCP` }
          )
        )
        continue
      }
  
      const allowedTools = filterAllowedMcpTools(server, listResult.tools)
      throwIfAborted(abortState)
      for (const t of allowedTools) {
        if (!t?.name) continue
        const fnName = makeToolFunctionName(server._id, t.name)
        const toolDef = buildProviderToolDefinition(t.inputSchema)
        const approvalPolicy = resolveMcpToolApprovalPolicy(t)
        functionMap.set(fnName, {
          type: 'mcp',
          serverId: server._id,
          toolName: t.name,
          serverName: server.name || server._id,
          toolTitle: String(t.annotations?.title || '').trim(),
          toolDescription: String(t.description || '').trim(),
          transportType: server.transportType,
          forceApproval: approvalPolicy.forceApproval,
          hardApproval: approvalPolicy.hardApproval,
          approvalKind: approvalPolicy.approvalKind,
          approvalReason: approvalPolicy.approvalReason,
          annotations: t.annotations || null,
          unwrapArgs: toolDef.unwrapArgs
        })
  
        tools.push({
          type: 'function',
          function: {
            name: fnName,
            description: buildProviderToolDescription(server, t, toolDef),
            parameters: toolDef.parameters
          }
        })
      }
    }
  
    throwIfAborted(abortState)
    return finalizeBundle()
  }
  
  function createDisplayMessage(role, content = '', extra = {}) {
    const defaultRender = role === 'assistant' || role === 'thinking'
      ? 'text'
      : role === 'user'
        ? inferUserDisplayMessageRender(content)
        : 'md'
    const base = { id: newId(), role, content, time: nextDisplayMessageTime(), render: defaultRender }
    if (role === 'tool' || role === 'tool_call') {
      base.toolExpanded = false
      base.toolMeta = ''
      base.toolStatus = role === 'tool_call' ? 'running' : ''
      base.toolName = ''
      base.toolServerName = ''
      base.toolTitle = ''
      base.toolDescription = ''
      base.toolCallId = ''
      base.toolArgsText = ''
      base.toolAutoApproved = false
      base.toolSubMeta = ''
      base.toolTraceStreamId = ''
      base.toolLiveTrace = []
      base.toolAgentName = ''
      base.toolLiveFinalContent = ''
      base.toolLiveFinalReasoning = ''
      base.toolLiveRound = 0
      base.toolResultPayload = null
    }
    return reactive({ ...base, ...extra })
  }
  
  function resolveSelectedSkillTarget({ idCandidate = '', nameCandidate = '' } = {}) {
    return resolveSelectedSkillTargetFromList(runtimeSkillObjects.value, {
      idCandidate,
      nameCandidate
    })
  }

  function resolveInstalledSkillTarget({ idCandidate = '', nameCandidate = '' } = {}) {
    return resolveSelectedSkillTargetFromList(skills.value, {
      idCandidate,
      nameCandidate
    })
  }

  function listSelectedSkillsBrief(limit = 30) {
    return listSelectedSkillsBriefFromList(runtimeSkillObjects.value, limit)
  }

  function listInstalledSkillsBrief(limit = 30) {
    return listSelectedSkillsBriefFromList(skills.value, limit)
  }

  function selectSkillForSession(skillId) {
    const id = String(skillId || '').trim()
    if (!id || !resolveInstalledSkillTarget({ idCandidate: id })) {
      return { ok: false, changed: false }
    }

    markSkillActivationPersistent([id])
    const selected = normalizeStringList(selectedSkillIds.value)
    const agent = normalizeStringList(agentSkillIds.value)
    const activated = normalizeStringList(activatedAgentSkillIds.value)
    const addedSelected = !selected.includes(id)
    const addedAgent = !agent.includes(id)
    const addedActivation = !activated.includes(id)

    if (addedSelected) selectedSkillIds.value = [...selected, id]
    if (addedAgent) agentSkillIds.value = [...agent, id]
    if (addedActivation) activatedAgentSkillIds.value = [...activated, id]

    return {
      ok: true,
      changed: addedSelected || addedAgent || addedActivation,
      addedSelected,
      addedAgent,
      addedActivation
    }
  }

  function normalizeSkillScriptPathCandidate(value) {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  }
  
  function buildSkillScriptChoiceList(skill, limit = 20) {
    return getSkillScriptCatalog(skill)
      .slice(0, limit)
      .map((entry) => ({
        path: entry.path,
        name: entry.name || undefined,
        entry: !!entry.isLikelyEntrypoint || undefined,
        runtime: entry.runtime || undefined,
        description: entry.description || undefined,
        when_to_use: entry.whenToUse || undefined,
        output_type: entry.outputType || undefined
      }))
  }
  
  function resolveSkillScriptTarget(skill, pathCandidate = '') {
    const catalog = getSkillScriptCatalog(skill)
    if (!catalog.length) {
      return {
        ok: false,
        error: '当前技能没有可执行脚本',
        catalog: []
      }
    }
  
    const raw = normalizeSkillScriptPathCandidate(pathCandidate)
    if (!raw) {
      if (catalog.length === 1) {
        return {
          ok: true,
          path: catalog[0].path,
          entry: catalog[0],
          inferred: true
        }
      }
      return {
        ok: false,
        error: `path 不能为空；可用脚本：${stableStringify(buildSkillScriptChoiceList(skill))}`,
        catalog
      }
    }
  
    const norm = raw.toLowerCase()
    const prefixed = norm.startsWith('scripts/') ? norm : `scripts/${norm}`
    const basename = norm.split('/').pop() || norm
    const basenameNoExt = basename.replace(/\.[^.]+$/, '')
    const pushUnique = (target, entry) => {
      if (!entry?.path) return
      if (target.some((item) => item.path === entry.path)) return
      target.push(entry)
    }
  
    const matches = []
  
    catalog.forEach((entry) => {
      const entryPath = String(entry?.path || '').trim().toLowerCase()
      if (entryPath === norm || entryPath === prefixed) pushUnique(matches, entry)
    })
  
    if (!matches.length) {
      catalog.forEach((entry) => {
        const entryName = String(entry?.name || '').trim().toLowerCase()
        if (entryName && entryName === norm) pushUnique(matches, entry)
      })
    }
  
    if (!matches.length) {
      catalog.forEach((entry) => {
        const entryBase = String(entry?.path || '').trim().toLowerCase().split('/').pop() || ''
        const entryBaseNoExt = entryBase.replace(/\.[^.]+$/, '')
        if (entryBase === basename || entryBaseNoExt === basenameNoExt) pushUnique(matches, entry)
      })
    }
  
    if (matches.length === 1) {
      return {
        ok: true,
        path: matches[0].path,
        entry: matches[0],
        inferred: normalizeSkillScriptPathCandidate(pathCandidate) !== matches[0].path
      }
    }
  
    if (matches.length > 1) {
      return {
        ok: false,
        error: `脚本路径不唯一，请改用完整 path。候选：${stableStringify(buildSkillScriptChoiceList({ cache: { scriptCatalog: matches } }))}`,
        catalog
      }
    }
  
    const normalizedFileIndex = getSkillFileIndex(skill)
    const directPath = [raw, prefixed]
      .map((item) => normalizeSkillScriptPathCandidate(item))
      .find((candidate) => candidate && normalizedFileIndex.scripts.includes(candidate) && isRunnableSkillScriptPath(candidate))
  
    if (directPath) {
      return {
        ok: true,
        path: directPath,
        entry: {
          path: directPath,
          name: directPath.split('/').pop()?.replace(/\.[^.]+$/, '') || directPath,
          description: '',
          whenToUse: '',
          outputType: 'text'
        },
        inferred: normalizeSkillScriptPathCandidate(pathCandidate) !== directPath
      }
    }
  
    return {
      ok: false,
      error: `未找到脚本：${raw}。可用脚本：${stableStringify(buildSkillScriptChoiceList(skill))}`,
      catalog
    }
  }
  
  function resolveActiveMcpServer({ idCandidate = '', nameCandidate = '' } = {}) {
    const list = Array.isArray(runtimeMcpServers.value) ? runtimeMcpServers.value : []
  
    const id = String(idCandidate || '').trim()
    if (id) {
      const hit = list.find((s) => String(s?._id || '').trim() === id)
      if (hit) return hit
    }
  
    const name = String(nameCandidate || '').trim()
    if (name) {
      const norm = name.toLowerCase()
      return (
        list.find((s) => String(s?.name || '').trim().toLowerCase() === norm) ||
        list.find((s) => String(s?._id || '').trim().toLowerCase() === norm) ||
        list.find((s) => String(s?.name || '').trim().toLowerCase().includes(norm)) ||
        null
      )
    }
  
    return null
  }
  
  function listActiveMcpServersBrief(limit = 30) {
    const list = Array.isArray(runtimeMcpServers.value) ? runtimeMcpServers.value : []
    return list
      .filter((s) => s && s._id && !s.disabled)
      .map((s) => ({
        id: s._id,
        name: s.name || s._id,
        keepAlive: !!s.keepAlive,
        allowTools: Array.isArray(s.allowTools) && s.allowTools.length ? s.allowTools.length : 'all'
      }))
      .slice(0, limit)
  }
  
  function getSkillMcpStatus(skill) {
    const mcpIds = Array.isArray(skill?.mcp) ? skill.mcp.map((x) => String(x || '').trim()).filter(Boolean) : []
    const mcpList = Array.isArray(mcpServers.value) ? mcpServers.value : []
    const mcpById = new Map(mcpList.filter((s) => s && s._id).map((s) => [String(s._id), s]))
    const mountedMcpIds = mcpIds.filter((id) => mcpById.has(String(id)))
    const missingMcpIds = mcpIds.filter((id) => !mcpById.has(String(id)))
    const mountedNames = mountedMcpIds.map((id) => mcpById.get(String(id))?.name || id)
    return { mcpIds, mountedMcpIds, missingMcpIds, mountedNames }
  }
  
  function getWebOperationsApi() {
    return globalThis?.aiToolsApi?.web || null
  }

  function getBuiltinSkillsApi() {
    return globalThis?.aiToolsApi?.dangerous?.skills || null
  }

  const builtinSkillActionCatalog = createBuiltinSkillActionCatalog((skillId) => {
    const api = getBuiltinSkillsApi()
    if (typeof api?.listActions !== 'function') {
      throw new Error('preload 未注入内置 Skill 动作 API')
    }
    return api.listActions(skillId)
  })

  function getWebToolMissingText() {
    return '内置联网服务不可用：preload 未注入 aiToolsApi.web。请在 uTools 插件环境中运行，或重新构建插件。'
  }
  
  const WEB_TOOL_RESULT_GUIDANCE = '这些结果来自本次运行的联网工具。请优先基于工具结果回答，不要因为模型知识截止时间更早而反复搜索同一问题；资料不足时说明不足。'
  
  function buildWebToolModelContent(result) {
    const payload = result && typeof result === 'object' ? deepCopyJson(result, {}) : {}
    return stableStringify({
      guidance: WEB_TOOL_RESULT_GUIDANCE,
      ...payload
    })
  }
  
  function formatWebSearchDisplay(result) {
    const query = String(result?.query || '').trim()
    const items = Array.isArray(result?.results) ? result.results : []
    const lines = [`### 联网搜索结果${query ? `：${query}` : ''}`]
    if (!items.length) {
      lines.push('', '未找到可用结果。')
      if (result?.error) lines.push(`错误：${result.error}`)
      return lines.join('\n')
    }
    items.forEach((item, index) => {
      const title = String(item?.title || item?.url || `结果 ${index + 1}`).trim()
      const url = String(item?.url || '').trim()
      const snippet = truncateInlineText(item?.snippet || '', 360)
      lines.push('', `${index + 1}. ${url ? `[${title}](${url})` : title}`)
      if (snippet) lines.push(`   ${snippet}`)
    })
    return lines.join('\n')
  }
  
  function formatWebReadDisplay(result) {
    const title = String(result?.title || result?.finalUrl || result?.url || '网页').trim()
    const url = String(result?.finalUrl || result?.url || '').trim()
    const description = truncateInlineText(result?.description || '', 280)
    const totalChars = Number(result?.totalChars)
    const text = truncateInlineText(result?.text || '', 1200)
    const lines = [`### 网页读取结果：${title}`]
    if (url) lines.push(`- 来源：${url}`)
    if (description) lines.push(`- 描述：${description}`)
    if (Number.isFinite(totalChars) && totalChars > 0) {
      lines.push(`- 正文：${totalChars} 字${result?.truncated ? '（已截断）' : ''}`)
    }
    if (text) lines.push('', '#### 摘录', text)
    return lines.join('\n')
  }
  
  function buildWebToolSubMeta(payload) {
    if (!payload || typeof payload !== 'object') return ''
    const kind = String(payload.kind || '').trim()
    if (kind === 'web_search_result') {
      const count = Array.isArray(payload.results) ? payload.results.length : 0
      const engine = String(payload.engine || '').trim()
      return [`结果 ${count} 条`, engine].filter(Boolean).join(' · ')
    }
    if (kind === 'web_read_result') {
      const title = truncateInlineText(payload.title || payload.finalUrl || payload.url || '', 42)
      const totalChars = Number(payload.totalChars)
      return [title, Number.isFinite(totalChars) && totalChars > 0 ? `${totalChars} 字` : ''].filter(Boolean).join(' · ')
    }
    return ''
  }
  
  async function executeBuiltinWebTool({ mapping, argsObj, serverName, toolName, abortState = null }) {
    const api = getWebOperationsApi()
    if (!api) {
      return { ok: false, content: getWebToolMissingText(), display: `### 联网工具结果\n- 错误：${getWebToolMissingText()}` }
    }
  
    const internal = String(mapping?.internal || '').trim()
    if (internal === 'web_search') {
      const query = String(argsObj?.query ?? argsObj?.q ?? '').trim()
      const limit = Math.min(Math.max(1, Math.floor(Number(argsObj?.limit) || 5)), 10)
      if (!query) {
        const errorText = 'query 不能为空'
        return { ok: false, content: errorText, display: `### 联网搜索结果\n- 错误：${errorText}` }
      }
      throwIfAborted(abortState)
      const result = await waitForAbortable(Promise.resolve(api.webSearch({ query, limit })), abortState)
      throwIfAborted(abortState)
      return {
        ok: result?.ok !== false,
        content: buildWebToolModelContent(result),
        display: formatWebSearchDisplay(result),
        payload: {
          kind: 'web_search_result',
          ...(result && typeof result === 'object' ? deepCopyJson(result, {}) : {})
        },
        serverName,
        toolName
      }
    }
  
    if (internal === 'web_read') {
      const url = String(argsObj?.url || '').trim()
      const maxChars = Math.min(Math.max(1000, Math.floor(Number(argsObj?.maxChars) || 12000)), 40000)
      if (!url) {
        const errorText = 'url 不能为空'
        return { ok: false, content: errorText, display: `### 网页读取结果\n- 错误：${errorText}` }
      }
      throwIfAborted(abortState)
      const result = await waitForAbortable(Promise.resolve(api.webRead({ url, maxChars })), abortState)
      throwIfAborted(abortState)
      return {
        ok: true,
        content: buildWebToolModelContent(result),
        display: formatWebReadDisplay(result),
        payload: {
          kind: 'web_read_result',
          ...(result && typeof result === 'object' ? deepCopyJson(result, {}) : {})
        },
        serverName,
        toolName
      }
    }
  
    return { ok: false, content: `未知联网工具：${internal}`, display: `### 联网工具结果\n- 错误：未知联网工具：${internal}` }
  }
  
  function normalizeToolCallExecutionContext(toolCall, toolMap) {
    const fn = toolCall?.function?.name
    const argsRaw = toolCall?.function?.arguments || ''
    const toolCallId = String(toolCall?.id || '').trim()
    const toolExecutionId = `tool_exec_${newId()}`
    const mapping = toolMap.get(fn)
    const serverName = mapping?.serverName || '未知'
    const toolName = mapping?.toolName || fn
    const toolTitle = String(mapping?.toolTitle || '').trim()
    const toolDescription = String(mapping?.toolDescription || '').trim()
    const parsedArgs = safeJsonParse(argsRaw)
    const argsObj = parsedArgs.ok && parsedArgs.value && typeof parsedArgs.value === 'object' ? parsedArgs.value : {}
    const argsText = parsedArgs.ok ? stableStringify(parsedArgs.value) : argsRaw
  
    return {
      toolCall,
      toolCallId,
      toolExecutionId,
      fn,
      mapping,
      serverName,
      toolName,
      toolTitle,
      toolDescription,
      argsRaw,
      argsObj,
      argsText: argsText || '{}'
    }
  }

function resolveSkillObjectsForRecord(record) {
  const state = record?.state && typeof record.state === 'object' ? record.state : {}
  const ids = new Set([
    ...normalizeStringList(state.selectedSkillIds),
    ...normalizeStringList(state.agentSkillIds),
    ...normalizeStringList(state.activatedAgentSkillIds)
  ])
  return (Array.isArray(skills.value) ? skills.value : []).filter((skill) =>
    skill && ids.has(String(skill?._id || '').trim())
  )
}

  async function hydrateSkillGatewayExecutionContext(context, abortState = null) {
    if (context?.mapping?.type !== 'internal' || context.mapping.internal !== 'skill_call') {
      return context
    }

    let resolved = null
    try {
      throwIfAborted(abortState)
      resolved = await waitForAbortable(
        resolveBuiltinSkillCall({
          selectedSkills: getRunRecord(abortState) ? resolveSkillObjectsForRecord(getRunRecord(abortState)) : selectedSkillObjects.value,
          catalog: builtinSkillActionCatalog,
          args: context.argsObj,
          isSkillLoaded: isSkillPromptContentLoaded
        }),
        abortState
      )
      throwIfAborted(abortState)
    } catch (err) {
      if (isAbortError(err) || abortState?.aborted) throw createAbortError()
      resolved = { ok: false, error: err?.message || String(err) }
    }

    if (!resolved?.ok) {
      return {
        ...context,
        mapping: {
          ...context.mapping,
          gatewayError: resolved?.error || 'Skill Action 解析失败',
          gatewayDetails: resolved || null
        }
      }
    }

    return {
      ...context,
      mapping: resolved.mapping,
      serverName: resolved.mapping.serverName,
      toolName: resolved.mapping.toolName,
      toolTitle: String(resolved.mapping.toolTitle || '').trim(),
      toolDescription: String(resolved.mapping.toolDescription || '').trim(),
      argsObj: resolved.args,
      argsText: stableStringify(resolved.args)
    }
  }

  function resolveToolApprovalTarget(context = {}) {
    const mapping = context.mapping || {}
    let serverId = String(mapping.serverId || '').trim()
    let serverName = String(mapping.serverName || context.serverName || '').trim() || '未知'
    let toolName = String(mapping.toolName || context.toolName || '').trim() || 'unknown'
    let argsObj = context.argsObj && typeof context.argsObj === 'object' ? context.argsObj : {}
    let argsText = String(context.argsText || '{}').trim() || '{}'
    let server = serverId ? runtimeMcpServers.value.find((item) => String(item?._id || '') === serverId) : null

    if (mapping?.type === 'internal' && mapping.internal === 'mcp_call') {
      const wrapperArgs = argsObj
      const serverIdCandidate = String(wrapperArgs?.server_id ?? wrapperArgs?.serverId ?? wrapperArgs?.id ?? '').trim()
      const serverNameCandidate = String(wrapperArgs?.server_name ?? wrapperArgs?.serverName ?? wrapperArgs?.server ?? '').trim()
      server = resolveActiveMcpServer({ idCandidate: serverIdCandidate, nameCandidate: serverNameCandidate })
      serverId = String(server?._id || serverIdCandidate).trim()
      serverName = String(server?.name || server?._id || serverNameCandidate || serverName).trim() || '未知'
      toolName = String(wrapperArgs?.tool || toolName).trim() || 'unknown'
      if (Object.prototype.hasOwnProperty.call(wrapperArgs, 'args')) {
        argsObj = wrapperArgs.args
      } else if (Object.prototype.hasOwnProperty.call(wrapperArgs, 'arguments')) {
        argsObj = wrapperArgs.arguments
      } else {
        argsObj = {}
      }
      argsText = stableStringify(argsObj)
    } else if (typeof mapping?.unwrapArgs === 'function') {
      try {
        argsObj = mapping.unwrapArgs(argsObj)
        argsText = stableStringify(argsObj)
      } catch {
        // Keep the original model arguments for approval display if unwrapping fails.
      }
    }

    if (mapping?.type === 'internal' && mapping.internal === 'run_skill_script') {
      argsObj = normalizeSkillScriptApprovalArgs(argsObj, {
        resolveSkill: resolveSelectedSkillTarget,
        resolveScript: resolveSkillScriptTarget
      })
      argsText = stableStringify(argsObj)
    }

    let resolvedTool = null
    if (server && toolName) {
      const cachedTools = mcpListToolsCache.get(getMcpToolsCacheKey(server))?.tools
      if (Array.isArray(cachedTools)) {
        resolvedTool = cachedTools.find((tool) => String(tool?.name || '').trim() === toolName) || null
      }
    }
    const isMcpTool =
      mapping?.type === 'mcp' ||
      (mapping?.type === 'internal' && mapping?.internal === 'mcp_call')
    const resolvedPolicy = isMcpTool
      ? resolveMcpToolApprovalPolicy(resolvedTool || {
          name: toolName,
          annotations: mapping.annotations || null
        })
      : {
          forceApproval: false,
          hardApproval: false,
          approvalKind: 'tool',
          approvalReason: ''
        }
    const configuredApprovalKind = String(mapping.approvalKind || resolvedPolicy.approvalKind || '').trim()
    const isShell = configuredApprovalKind === 'shell'
    const approvalKind =
      isShell
        ? 'shell'
        : configuredApprovalKind === 'execution'
          ? 'execution'
          : 'tool'
    const forceApproval =
      isShell ||
      configuredApprovalKind === 'execution' ||
      mapping.forceApproval === true ||
      resolvedPolicy.forceApproval === true
    const hardApproval =
      mapping.hardApproval === true ||
      resolvedPolicy.hardApproval === true ||
      (isShell && isDangerousShellApprovalCommand(argsObj, argsText))
    const approvalReason =
      isShell && hardApproval
        ? '命令包含删除、系统修改或其他明显破坏性操作'
        : isShell
          ? '低风险模式下，命令执行需要确认具体命令和工作目录'
          : configuredApprovalKind === 'execution'
            ? (
                toolName === 'notebook_execute_cell' || toolName === 'notebook_execute_all'
                  ? '将在主机 Notebook Runtime 中执行代码，可访问电脑文件并启动进程，不受会话沙盒限制'
                  : '低风险模式下，技能脚本或代码执行需要确认具体脚本和参数'
              )
            : String(mapping.approvalReason || resolvedPolicy.approvalReason || (
                mapping.forceApproval === true ? '技能将写入数据或改变外部状态' : ''
              )).trim()

    return {
      server,
      serverId,
      serverName,
      toolName,
      toolTitle: String(resolvedTool?.annotations?.title || mapping.toolTitle || context.toolTitle || '').trim(),
      toolDescription: String(resolvedTool?.description || mapping.toolDescription || context.toolDescription || '').trim(),
      argsObj,
      argsText: String(argsText || '{}').trim() || '{}',
      approvalKind,
      forceApproval,
      hardApproval,
      approvalReason
    }
  }

  async function prepareToolCallExecution(toolCall, toolMap, lastReasoningText, abortState = null) {
    const targetSession = getRunSessionTarget(abortState)
    const targetRecord = getRunRecord(abortState) || getActiveMemorySession()
    throwIfAborted(abortState)
    const normalizedContext = normalizeToolCallExecutionContext(toolCall, toolMap)
    const context = await hydrateSkillGatewayExecutionContext(normalizedContext, abortState)
    const approvalTarget = resolveToolApprovalTarget(context)
    const usesCommandWorkspace =
      approvalTarget.approvalKind === 'shell' ||
      String(approvalTarget.serverId || '').trim() === BUILTIN_SHELL_SKILL_ID
    const availableHostWorkspacePath = usesCommandWorkspace
      ? resolveSessionHostWorkspacePath(targetRecord)
      : ''
    const commandWorkspaceScope = usesCommandWorkspace
      ? resolveChatToolWorkspaceScope(
          approvalTarget.toolName,
          approvalTarget.argsObj,
          { hasHostWorkspace: !!availableHostWorkspacePath }
        )
      : ''
    const approvedHostWorkspacePath =
      availableHostWorkspacePath &&
      (commandWorkspaceScope === 'host' || commandWorkspaceScope === 'all')
        ? availableHostWorkspacePath
        : ''
    const approvalKeyArgs = usesCommandWorkspace
      ? {
          ...approvalTarget.argsObj,
          workspace_scope: commandWorkspaceScope,
          ...(approvedHostWorkspacePath
            ? { __host_workspace_path: approvedHostWorkspacePath }
            : {})
        }
      : approvalTarget.argsObj
    const approvalKey = buildSessionToolApprovalKey({
      sessionId: String(targetRecord?.id || 'chat'),
      serverId: approvalTarget.serverId,
      serverName: approvalTarget.serverName,
      toolName: approvalTarget.toolName,
      approvalKind: approvalTarget.approvalKind,
      args: approvalKeyArgs,
      argsText: approvalTarget.argsText
    })
    const currentApprovalMode = resolveCurrentToolApprovalMode(abortState)
    const autoApproved =
      (approvalTarget.hardApproval !== true && sessionApprovedToolKeys.has(approvalKey)) ||
      evaluateToolApproval({
        mode: currentApprovalMode,
        forceApproval: approvalTarget.forceApproval === true,
        hardApproval: approvalTarget.hardApproval === true,
        interactive: true
      }).action === 'allow'
  
    const pendingToolMessage = createPendingToolExecutionMessage({
      serverName: approvalTarget.serverName,
      toolName: approvalTarget.toolName,
      toolTitle: approvalTarget.toolTitle,
      toolDescription: approvalTarget.toolDescription,
      argsText: approvalTarget.argsText,
      autoApproved: autoApproved,
      argsObj: approvalTarget.argsObj,
      toolCallId: context.toolCallId,
      toolExecutionId: context.toolExecutionId,
      toolSessionId: String(targetRecord?.id || '').trim()
    })
    pendingToolMessage.toolAbortState = abortState || null
    pendingToolMessage.toolApprovalMode = currentApprovalMode
    if (usesCommandWorkspace) {
      const chatWorkspaceId = resolveMemorySessionSandboxWorkspaceId(targetRecord)
      pendingToolMessage.toolSubMeta =
        commandWorkspaceScope === 'all'
          ? approvedHostWorkspacePath
            ? `检索：会话沙盒 ${chatWorkspaceId} + 本机工作区 ${approvedHostWorkspacePath}`
            : `会话沙盒：${chatWorkspaceId}`
          : commandWorkspaceScope === 'host'
            ? `本机工作区：${approvedHostWorkspacePath || '未选择'}`
            : `会话沙盒：${chatWorkspaceId}`
    }
    targetSession.messages.push(pendingToolMessage)
    await maybeScrollToBottomForRun(abortState)
  
    if (!context.mapping) {
        targetSession.messages.push(
          createToolExecutionResultMessage(`### 工具结果\n- 错误：未在工具注册表中找到：${context.fn}`, {
            toolMeta: `${context.serverName} / ${context.toolName}`
          }, context.toolCallId, context.toolExecutionId)
        )
      return {
        ...context,
        pendingToolMessage,
        skipped: true,
        execResult: { ok: false, content: `未在工具注册表中找到：${context.fn}` }
      }
    }
  
    if (!autoApproved) {
      const ok = await confirmToolCall({
        serverName: approvalTarget.serverName,
        toolName: approvalTarget.toolName,
        argsText: approvalTarget.argsText,
        reasoningText: lastReasoningText,
        abortState,
        sessionId: String(targetRecord?.id || 'chat'),
        sessionTitle: resolveMemorySessionTitle(targetRecord),
        approvalKind: approvalTarget.approvalKind,
        hardApproval: approvalTarget.hardApproval === true,
        extraLines: [
          ...(approvalTarget.approvalReason
            ? [`需要确认：${approvalTarget.approvalReason}`]
            : []),
          ...(approvedHostWorkspacePath
            ? [`本机工作区：${approvedHostWorkspacePath}`]
            : usesCommandWorkspace && commandWorkspaceScope === 'sandbox'
              ? ['执行位置：会话沙盒']
              : [])
        ],
        rememberText:
          approvalTarget.approvalKind === 'shell'
            ? '本会话允许相同命令'
            : approvalTarget.approvalKind === 'execution'
              ? '本会话允许相同脚本调用'
              : '本会话允许此工具',
        onRememberForSession:
          approvalTarget.hardApproval === true
            ? null
            : () => sessionApprovedToolKeys.add(approvalKey)
      })
      if (ok === null) throw createAbortError()
      throwIfAborted(abortState)
      if (!ok) {
        targetSession.messages.push(
          createToolExecutionResultMessage(`### 工具结果\n- 工具：\`${context.toolName}\`\n- 状态：**已拒绝**`, {
            toolMeta: `${context.serverName} / ${context.toolName}`
          }, context.toolCallId, context.toolExecutionId)
        )
        return {
          ...context,
          pendingToolMessage,
          skipped: true,
          execResult: {
            ok: false,
            content: [
              'TOOL_REJECTED',
              `tool_name: ${context.toolName}`,
              `server_name: ${context.serverName}`,
              'status: rejected',
              'reason: user_denied',
              'message: The user explicitly rejected this tool call.',
              'guidance: Do not claim the tool failed. Treat this as a user decision and continue by either explaining what can be done without the tool, asking for permission to use an alternative approach, or waiting for new user instructions.'
            ].join('\n')
          }
        }
      }
    }
  
    return {
      ...context,
      autoApproved,
      pendingToolMessage,
      skipped: false
    }
  }
  
  function getToolCallParallelExecutionKey(prepared = {}) {
    const mapping = prepared?.mapping
    if (mapping?.type === 'internal' && mapping.internal === 'mcp_call') {
      const argsObj = prepared?.argsObj && typeof prepared.argsObj === 'object' ? prepared.argsObj : {}
      const serverIdCandidate = String(argsObj?.server_id ?? argsObj?.serverId ?? argsObj?.id ?? '').trim()
      const serverNameCandidate = String(argsObj?.server_name ?? argsObj?.serverName ?? argsObj?.server ?? '').trim()
      const server = resolveActiveMcpServer({ idCandidate: serverIdCandidate, nameCandidate: serverNameCandidate })
      if (server?.keepAlive && server?._id) return `mcp-call:${server._id}`
      return `parallel:${newId()}`
    }
  
    if (mapping?.type === 'mcp') {
      const server = runtimeMcpServers.value.find((s) => s._id === mapping.serverId)
      if (server?.keepAlive && server?._id) return `mcp:${server._id}`
      return `parallel:${newId()}`
    }

    if (mapping?.type === 'skill' && mapping?.skillId) {
      return `skill:${mapping.skillId}`
    }

    return `parallel:${newId()}`
  }

  const executePreparedSkillTool = createPreparedSkillToolExecutor({
    activatedAgentSkillIds,
    agentSkillIdSet: runtimeAgentSkillIdSet,
    availableSkillObjects: skills,
    buildToolExecutionResultSubMeta,
    buildWebToolSubMeta,
    builtinSkillActionCatalog,
    deepCopyJson,
    executeBuiltinWebTool,
    extractChatImagesFromToolResult,
    getBuiltinSkillsApi,
    getLoadedSkillFilePathSet,
    getSkillMcpStatus,
    hasLoadedSkillMainContent,
    listAvailableSkillsBrief: listInstalledSkillsBrief,
    listSelectedSkillsBrief,
    loadSkillMainContent,
    loadedSkillContentById,
    loadedSkillFileCacheBySkillId,
    markSkillActivationPersistent,
    maybeScrollToBottomForRun,
    mcpServers,
    prepareBuiltinAgentToolCallArgs,
    resolveAvailableSkillTarget: resolveInstalledSkillTarget,
    resolveSelectedSkillTarget,
    resolveSkillScriptTarget,
    searchCapabilities,
    selectSkillForSession,
    selectedSkillObjects: runtimeSkillObjects
  })

  const executePreparedMcpTool = createPreparedMcpToolExecutor({
    activeMcpServers: runtimeMcpServers,
    buildMcpToolCatalogEntry,
    buildToolExecutionResultSubMeta,
    closeMcpClientSafely,
    deepCopyJson,
    extractChatImagesFromToolResult,
    filterAllowedMcpTools,
    listActiveMcpServersBrief,
    listMcpToolsForServer,
    maybeScrollToBottomForRun,
    registerAbortableMcpClient,
    resolveActiveMcpServer,
    setMcpToolCatalogEntry,
    upsertPinnedMcpToolHint
  })

  async function executePreparedToolCall(prepared, abortState = null) {
    const targetSession = getRunSessionTarget(abortState)
    throwIfAborted(abortState)
    const {
      toolCallId,
      toolExecutionId
    } = prepared || {}
    const createCurrentToolResultMessage = (content = '', extra = {}) =>
      createToolExecutionResultMessage(content, extra, toolCallId, toolExecutionId)

    const skillExecution = await executePreparedSkillTool(
      prepared,
      { targetSession, createCurrentToolResultMessage },
      abortState
    )
    if (skillExecution.handled) return skillExecution.result

    return executePreparedMcpTool(
      prepared,
      { targetSession, createCurrentToolResultMessage },
      abortState
    )
  }
  
  async function executeToolCallsParallel(toolCalls, toolMap, lastReasoningText, abortState = null) {
    const preparedCalls = []
    for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
      throwIfAborted(abortState)
      preparedCalls.push(await prepareToolCallExecution(toolCall, toolMap, lastReasoningText, abortState))
    }
  
    const results = new Array(preparedCalls.length)
    const chainsByKey = new Map()
  
    preparedCalls.forEach((prepared, index) => {
      if (prepared?.skipped) {
        results[index] = prepared.execResult
        return
      }
  
      const key = getToolCallParallelExecutionKey(prepared)
      const previous = chainsByKey.get(key) || Promise.resolve()
      const current = previous.then(async () => {
        throwIfAborted(abortState)
        return executePreparedToolCall(prepared, abortState)
      })
      chainsByKey.set(key, current.catch(() => {}))
      results[index] = current
    })
  
    const resolved = await Promise.all(results.map(async (entry) => {
      if (entry && typeof entry?.then === 'function') return entry
      return entry
    }))
    throwIfAborted(abortState)
    return resolved
  }
  
  async function executeToolCall(toolCall, toolMap, lastReasoningText, abortState = null) {
    const [result] = await executeToolCallsParallel([toolCall], toolMap, lastReasoningText, abortState)
    return result
  }
  
  const queuedInputDrainTimers = new Map()
  const queuedInputDrainInFlight = new Set()

  function getComposerDraft() {
    const text = String(input.value || '').trim()
    const attachments = Array.isArray(pendingAttachments.value) ? pendingAttachments.value.slice() : []
    const plan = resolveChatLongTextAttachmentPlan(text, attachments)
    if (!plan.wrapped) {
      return {
        text,
        attachments,
        validationError: String(plan.error || '')
      }
    }

    const longTextAttachment = createPendingLongTextAttachment(plan)
    if (!longTextAttachment) {
      return {
        text,
        attachments,
        validationError: '当前环境无法创建长文本附件，请改为手动上传 Markdown 文件。'
      }
    }
    return {
      text: plan.text,
      attachments: [...attachments, longTextAttachment],
      autoWrappedLongText: true,
      validationError: ''
    }
  }

  function clearComposerDraft() {
    input.value = ''
    resetComposerInput()
    pendingAttachments.value = []
  }

  function enqueueComposerDraft(mode = CHAT_RUN_INPUT_MODE_QUEUE) {
    if (preparingSend.value) return null
    const draft = getComposerDraft()
    if (draft.validationError) {
      message.warning(draft.validationError)
      return null
    }
    if (!draft.text && !draft.attachments.length) return null

    clearAllUserEditingState()
    const record = getActiveMemorySession()
    const entry = chatRunInputQueue.enqueue(record.id, draft, mode)
    if (!entry) return null

    clearComposerDraft()
    record.input = ''
    record.pendingAttachments = []
    record.updatedAt = Date.now()
    touchChatRunInputQueue()
    if (mode === CHAT_RUN_INPUT_MODE_STEER) {
      message.info('已加入引导，将在当前任务的下一个安全边界生效')
    } else {
      message.info('消息已加入队列')
    }
    return entry
  }

  function steerCurrentRun() {
    if (!sending.value) {
      void send()
      return
    }
    enqueueComposerDraft(CHAT_RUN_INPUT_MODE_STEER)
  }

  function removeQueuedInput(entryId) {
    const removed = chatRunInputQueue.remove(activeMemorySessionId.value, entryId)
    if (!removed) return
    touchChatRunInputQueue()
    message.info(removed.mode === CHAT_RUN_INPUT_MODE_STEER ? '已移除引导' : '已移除排队消息')
  }

  function steerQueuedInput(entryId) {
    const updated = chatRunInputQueue.setMode(
      activeMemorySessionId.value,
      entryId,
      CHAT_RUN_INPUT_MODE_STEER
    )
    if (!updated) return
    touchChatRunInputQueue()
    message.info('已改为引导，将在当前任务的下一个安全边界生效')
  }

  function scheduleQueuedInputDrain(record = getMemorySessionById(activeMemorySessionId.value)) {
    const sessionId = String(record?.id || '').trim()
    if (!sessionId || queuedInputDrainTimers.has(sessionId)) return
    const timer = window.setTimeout(() => {
      queuedInputDrainTimers.delete(sessionId)
      void drainQueuedInputs(record)
    }, 0)
    queuedInputDrainTimers.set(sessionId, timer)
  }

  async function drainQueuedInputs(record) {
    const sessionId = String(record?.id || '').trim()
    if (!sessionId || queuedInputDrainInFlight.has(sessionId)) return
    if (!isMemorySessionActive(record)) return
    if (preparingSend.value || sending.value || isMemorySessionChatRunning(record)) return

    const entry = chatRunInputQueue.takeNext(sessionId)
    if (!entry) return
    touchChatRunInputQueue()
    queuedInputDrainInFlight.add(sessionId)
    try {
      const accepted = await dispatchChatDraft(entry)
      if (!accepted) {
        chatRunInputQueue.restore(sessionId, [entry])
        touchChatRunInputQueue()
        return
      }
    } finally {
      queuedInputDrainInFlight.delete(sessionId)
    }

    if (chatRunInputQueue.count(sessionId) > 0) scheduleQueuedInputDrain(record)
  }

  async function dispatchChatDraft({ text: rawText, attachments: rawAttachments } = {}) {
    if (sending.value || preparingSend.value) return false
    const cfg = getRequestConfigOrHint()
    if (!cfg) return false

    const text = String(rawText || '').trim()
    const attachments = Array.isArray(rawAttachments) ? rawAttachments.slice() : []
    if (!text && !attachments.length) return false

    let prepared = false
    const accepted = await startPreparingSend(async ({ release }) => {
      const userDisplay = createDisplayMessage('user', text || (attachments.length ? '(sent attachments)' : ''))
      if (attachments.length) {
        userDisplay.attachmentsExpanded = false
        userDisplay.attachments = attachments
      }
      session.messages.push(userDisplay)
      autoScrollEnabled.value = true
      autoScrollSuspendedByUser.value = false
      scheduleRefreshUserAnchorMeta()
      await scrollToBottom({ force: true })
      const requestRecord = getActiveMemorySession()
      let memorySystemContent = ''
      let attachmentRecallText = ''
      try {
        const prepared = await prepareChatRequestContext({
          cfg,
          text,
          attachments,
          requestRecord,
          excludeLatestUserTurnFromMemoryRecall: true
        })
        memorySystemContent = prepared.memorySystemContent
        attachmentRecallText = prepared.attachmentRecallText
        if (cfg.requestMode === 'image-generation') {
          const referenceImages = await collectAttachmentMediaReferenceImages(attachments, userDisplay)
          cfg.imageGenerationRequestOptionsOverride = mergeReferenceImagesIntoRequestOptions(
            cfg.imageGenerationRequestOptionsOverride && typeof cfg.imageGenerationRequestOptionsOverride === 'object'
              ? cfg.imageGenerationRequestOptionsOverride
              : {},
            referenceImages,
            'image'
          )
        }
      } catch (err) {
        removeDisplayMessageById(userDisplay.id)
        autoScrollEnabled.value = true
        autoScrollSuspendedByUser.value = false
        scheduleRefreshUserAnchorMeta()
        await scrollToBottom({ force: true })
        message.error('发送准备失败：' + (err?.message || String(err)))
        return
      }
      prepared = true
      if (canGenerateMemorySessionTitle(requestRecord)) {
        requestRecord.titlePostReplyRetryDone = false
        requestSessionTitleAsync({
          record: requestRecord,
          cfg,
          text,
          attachments,
          reason: 'initial'
        })
      }

      if (cfg.requestMode === 'video-generation') {
        release()
        const generated = await startDetachedVideoGeneration({ cfg, text, attachments, userDisplay })
        if (generated && canRetryMemorySessionTitle(requestRecord)) {
          requestSessionTitleAsync({
            record: requestRecord,
            cfg,
            text,
            attachments,
            reason: 'post_reply'
          })
        }
        return
      }

      const runPromise = runChatSession({
        ...cfg,
        sessionRecord: requestRecord,
        memorySystemContent,
        memorySourceUserText: [text, attachmentRecallText].filter(Boolean).join('\n\n'),
        prepare: async () => {
          if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
          await prepareUserApiMessage({
            text,
            attachments,
            userDisplay,
            preferVision: cfg.supportsVision !== false,
            providerKind: cfg.providerKind || 'openai-compatible',
            sessionTarget: requestRecord,
            imageAttachmentMode: cfg.requestMode === 'image-generation' ? 'media-reference' : 'chat'
          })
        }
      })
      release()
      const succeeded = await runPromise

      if (succeeded && canRetryMemorySessionTitle(requestRecord)) {
        requestSessionTitleAsync({
          record: requestRecord,
          cfg,
          text,
          attachments,
          reason: 'post_reply'
        })
      }

    })
    return accepted && prepared
  }

  async function send() {
    if (preparingSend.value) return
    if (sending.value) {
      enqueueComposerDraft(CHAT_RUN_INPUT_MODE_QUEUE)
      return
    }

    const draft = getComposerDraft()
    if (draft.validationError) {
      message.warning(draft.validationError)
      return
    }
    if (!draft.text && !draft.attachments.length) return
    clearAllUserEditingState()
    clearComposerDraft()
    const accepted = await dispatchChatDraft(draft)
    if (!accepted) {
      input.value = draft.text
      pendingAttachments.value = draft.attachments
      resetComposerInput()
      return
    }
    scheduleQueuedInputDrain(getMemorySessionById(activeMemorySessionId.value))
  }

  return {
    enqueueMemorySessionApprovalRequest,
    removeMemorySessionApprovalRequest,
    flushMemorySessionApprovalQueue,
    prepareBuiltinAgentToolCallArgs,
    dispatchBuiltinAgentsToolApprovalResponse,
    createAbortAwareDialogStateFromController,
    handleBuiltinAgentsToolApprovalRequest,
    stop,
    handleUserEditKeydown,
    clearAllUserEditingState,
    isFiniteNumber,
    resolveUserApiIndexForDisplayMessage,
    getUserApiMessageContentByIndex,
    messageHasDisplayAttachments,
    findNearestUserApiIndexBefore,
    findDisplayIndexByApiIndex,
    truncateConversationAfterUser,
    resetComposerInput,
    getRequestConfigOrHint,
    getCurrentToolsKey,
    syncLastBuiltRequestToolsStats,
    dispatchBuiltinAgentsToolApprovalModeChange,
    updateContextTokenTelemetry,
    recordModelUsage,
    recordModelUsageFromPayload,
    injectPendingGuidanceMessages,
    runChatRounds,
    mergeUtoolsAiStreamText,
    runUtoolsAiChatRound,
    runImageGenerationRound,
    activeSessionMessageIdSet,
    trackedMessageIdSet,
    isDisplayMessageInActiveSession,
    isDisplayMessageTracked,
    sessionToolMessageCount,
    compactToolMessageMode,
    startDetachedVideoTaskPolling,
    resolveVideoGenerationContentIfReady,
    runVideoGenerationRound,
    runDetachedVideoGenerationRequest,
    startDetachedVideoGeneration,
    getMediaRequestPrompt,
    getMediaRequestPlaceholderMode,
    getImageRequestOptionsFromMessage,
    getVideoRequestOptionsFromMessage,
    canRegenerateMedia,
    mediaTaskResumeKey,
    isMediaTaskResuming,
    setMediaTaskResuming,
    getVideoResumeRequestMeta,
    canResumeMediaTask,
    countResumableMediaTasks,
    findOpenaiCompatibleProviderByBaseUrl,
    getOpenaiCompatibleMediaConfigOrHint,
    submitMediaGenerationPrompt,
    regenerateMedia,
    setAssistantApiContentForDisplay,
    extractMediaFailureReasonLine,
    mediaFailureSummary,
    mediaFailureSuggestion,
    applyMediaGenerationFailureToDisplay,
    createRequestAbortStateForMediaResume,
    resumeMediaTask,
    CHAT_REQUEST_TIMEOUT_MS,
    runChatSession,
    stageChatAttachmentsInSandbox,
    ensureAttachmentSandboxSkillAvailable,
    prepareUserApiMessage,
    getLatestRealUserPromptText,
    regenerateAssistant,
    toggleOrSubmitUserEdit,
    submitUserEdit,
    commitToolApprovalMode,
    setToolApprovalMode,
    toggleWebSearch,
    toggleAutoActivateAgentSkills,
    cycleToolMode,
    refreshActiveMcpTools,
    getComposerTextareaEl,
    refreshComposerInlinePickers,
    handleComposerCursorChange,
    handleComposerBlur,
    focusComposerAt,
    insertInlineCommandTrigger,
    applyInlineAgentSuggestion,
    replaceInlineCommandToken,
    removeInlineCommandToken,
    applyInlineCommandSuggestion,
    openSystemPromptModal,
    applyCustomSystemPrompt,
    clearCustomSystemPrompt,
    resetSystemPromptToSelectedPrompt,
    syncContextWindowDraft,
    openContextWindowModal,
    handleContextWindowPresetChange,
    resetContextWindowDraftToDefault,
    applyContextWindowSettings,
    isCurrentModel,
    selectProviderModel,
    openAgentModal,
    resetChatSetupUiState,
    clearSelectedAgent,
    applyAgentModal,
    clearSelectedPrompt,
    applyPromptModal,
    applySkillModal,
    applyMcpModal,
    resolveHistoryContextBudgetState,
    getHistoryContextCharBudget,
    buildRequestApiMessages,
    requestContextWindowSummary,
    resolveContextSummaryCoverage,
    ensureContextWindowSummary,
    syncContextSummaryCacheForRecord,
    prepareChatRequestContext,
    startPreparingSend,
    isLikelyImageGenerationPrompt,
    isLikelyVideoGenerationPrompt,
    buildEmptyAssistantResponseText,
    buildMediaGenerationPromptFromHistory,
    buildImageGenerationPromptFromHistory,
    buildVideoGenerationPromptFromHistory,
    hasToolStateMessages,
    shouldRetryToolContinuationAsPlainText,
    buildRequestMessages,
    resolveCurrentToolApprovalMode,
    closeMcpClientSafely,
    registerAbortableMcpClient,
    ensureMcpToolsStatus,
    getMcpToolsCacheKey,
    filterAllowedMcpTools,
    listMcpToolsForServer,
    listMcpPromptsForServer,
    ensureMcpPromptCatalogLoaded,
    buildMcpPromptArgsFromModal,
    buildLocalPromptArgsFromModal,
    insertTextIntoComposer,
    applyMcpPromptToComposer,
    applyLocalPromptToComposer,
    upsertPinnedMcpToolHint,
    clearPinnedMcpToolHints,
    buildMcpToolCatalogEntry,
    setMcpToolCatalogEntry,
    clearMcpToolCatalog,
    warmMcpToolCatalogForServers,
    buildToolsBundle,
    createDisplayMessage,
    resolveSelectedSkillTarget,
    resolveInstalledSkillTarget,
    listSelectedSkillsBrief,
    listInstalledSkillsBrief,
    selectSkillForSession,
    normalizeSkillScriptPathCandidate,
    buildSkillScriptChoiceList,
    resolveSkillScriptTarget,
    resolveActiveMcpServer,
    listActiveMcpServersBrief,
    getSkillMcpStatus,
    getWebOperationsApi,
    getBuiltinSkillsApi,
    builtinSkillActionCatalog,
    getWebToolMissingText,
    WEB_TOOL_RESULT_GUIDANCE,
    buildWebToolModelContent,
    formatWebSearchDisplay,
    formatWebReadDisplay,
    buildWebToolSubMeta,
    executeBuiltinWebTool,
    normalizeToolCallExecutionContext,
    hydrateSkillGatewayExecutionContext,
    resolveToolApprovalTarget,
    prepareToolCallExecution,
    getToolCallParallelExecutionKey,
    executePreparedSkillTool,
    executePreparedMcpTool,
    executePreparedToolCall,
    executeToolCallsParallel,
    executeToolCall,
    queuedInputDrainTimers,
    queuedInputDrainInFlight,
    getComposerDraft,
    clearComposerDraft,
    enqueueComposerDraft,
    steerCurrentRun,
    removeQueuedInput,
    steerQueuedInput,
    scheduleQueuedInputDrain,
    drainQueuedInputs,
    dispatchChatDraft,
    send
  }
}
