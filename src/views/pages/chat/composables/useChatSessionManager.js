import {
  extractFinalSessionTitleContent,
  getSessionTitleFromPath
} from './useChatSessionTitles.js'

export function useChatSessionManager(dependencies) {
  const {
    canUseUtoolsAi,
    buildUtoolsAiMessages,
    recordModelUsage,
    extractModelUsage,
    streamChatCompletion,
    buildChatSessionAssetsDirectory,
    exists,
    moveItem,
    CHAT_SESSION_ROOT,
    createDirectory,
    AUTO_CHAT_SESSION_ROOT,
    sanitizeAutoSessionTitle,
    AUTO_CHAT_SESSION_DIR_NAME,
    getPersistedMemorySessionTitle,
    DEFAULT_MEMORY_SESSION_TITLE,
    normalizeGeneratedSessionTitle,
    buildAutoSessionTitle,
    isAutoChatSessionPath,
    isMemorySessionActive,
    activeSessionFilePath,
    activeSessionTitle,
    sessionTreeRef,
    canRetryMemorySessionTitle,
    canGenerateMemorySessionTitle,
    sessionTitleRequestTokens,
    buildSessionTitleGenerationPrompt,
    normalizeProviderApiMode,
    getMemorySessionById,
    activeMemorySessionId,
    getMemorySessionAutoPersistKey,
    hasResolvedMemorySessionTitle,
    markMemorySessionTitleReady,
    isGeneratedSessionTitle,
    shouldStampHistoryCreatedAtOnGeneratedTitle,
    applyFallbackMemorySessionTitle,
    isMemorySessionRunning,
    hasPersistableMemorySessionResponse,
    autoPersistMemorySessionInFlight,
    readSessionJsonFile,
    resolvePersistedSessionCreatedAtMs,
    AUTO_CHAT_SESSION_SOURCE_TYPE,
    resolveMemorySessionSandboxWorkspaceId,
    writeFile,
    pruneDormantMemorySessions,
    message,
    canPersistMemorySessionToHistory,
    purgeExpiredChatSessionTrash,
    purgeSandboxTrashEntries,
    listDirectory,
    parseIsoTimeMs,
    resolveChatSessionCreatedTimeMs,
    saveActiveMemorySessionDraft,
    isMemorySessionEmptyDraft,
    removeMemorySessionById,
    flushMemoryCandidatesForRecord,
    getActiveMemorySession,
    sending,
    abortController,
    createMemorySessionRecord,
    memorySessions,
    restoreMemorySession,
    withChatSessionOpeningHeavyRender,
    maybeWarmMarkdownPreviewRuntimeForMessages,
    scrollToBottom,
    settleChatViewportAfterSessionOpen,
    resolveCurrentHeavyRenderViewportBuffer,
    CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA,
    persistChatSessionMediaAssets,
    serializeChatMediaForSave,
    session,
    basePromptMode,
    selectedPromptId,
    buildCustomSystemPromptState,
    customSystemPrompt,
    customSystemPromptExplicit,
    selectedAgentId,
    selectedProviderId,
    selectedModel,
    deepCopyJson,
    normalizeStringList,
    selectedSkillIds,
    routerAddedSelectedSkillIds,
    agentSkillIds,
    routerAddedAgentSkillIds,
    activatedAgentSkillIds,
    routerActivatedAgentSkillIds,
    manualMcpIds,
    sandboxHostWorkspacePath,
    normalizeSelectedHostWorkspacePath,
    webSearchEnabled,
    toolApprovalMode,
    autoApproveTools,
    autoActivateAgentSkills,
    toolMode,
    effectiveToolMode,
    thinkingEffort,
    imageGenerationMode,
    videoGenerationMode,
    imageGenerationParamsEnabled,
    imageGenerationParams,
    createDefaultImageGenerationParams,
    videoGenerationParamsEnabled,
    videoGenerationParams,
    createDefaultVideoGenerationParams,
    sessionContextWindowOverride,
    normalizeChatContextWindowConfig,
    normalizeContextTokenTelemetry,
    chatConfig,
    resolveDefaultModelSelectionFromConfig,
    agents,
    BUILTIN_AGENT_ID,
    normalizeToolApprovalMode,
    TOOL_APPROVAL_MODE_MANUAL,
    TOOL_APPROVAL_MODE_SAFE,
    normalizeImageGenerationMode,
    createEmptyContextTokenTelemetry,
    buildMergedChatState,
    applyLoadedChatState,
    lastLoadedDefaultSystemPrompt,
    normalizePromptText,
    hasInitializedDefaultSystemPrompt,
    systemPromptDraft,
    agentModalSelectedId,
    promptModalSelectedId,
    skillModalSelectedIds,
    mcpModalSelectedIds,
    hasAppliedDefaultModel,
    mcpListToolsCache,
    mcpListToolsInFlight,
    mcpToolsRevision,
    clearMcpToolCatalog,
    clearPinnedMcpToolHints,
    normalizeMemoryCandidateQueue,
    clearSessionData,
    typewriterFlushAll,
    clearAllUserEditingState,
    expandedToolActivityGroupIds,
    resetUserAnchors,
    autoScrollEnabled,
    autoScrollSuspendedByUser,
    input,
    pendingAttachments,
    clearSessionApprovedTools,
    chatRunInputQueue,
    touchChatRunInputQueue,
    clearMemoryCandidateFlushTimer,
    createEmptyContextSummaryState,
    syncActiveRequestUiState,
    isMemorySessionChatRunning,
    nextTick,
    waitForLayoutFrame,
    resetChatSetupUiState,
    flushMemoryCandidatesInBackground,
    buildCombinedSystemContent,
    scheduleRefreshUserAnchorMeta,
    buildDefaultSessionName,
    sessionSiderCollapsed,
    collectChatMediaAssetPathsFromPayload,
    deleteChatMediaAssetPaths,
    deleteChatSessionAssetDirectory
  } = dependencies
  let sessionResetPromise = null

  async function requestSessionTitleFromModel({
    providerKind = 'openai-compatible',
    providerId = '',
    baseUrl = '',
    apiKey = '',
    apiMode = 'auto',
    model = '',
    prompt = ''
  } = {}) {
    const userPrompt = String(prompt || '').trim()
    if (!userPrompt) return ''

    const systemPrompt = '你是会话标题生成器。严格只输出一个 4 到 18 个字的中文标题，不输出任何解释、前缀、引号或格式标记。'

    if (providerKind === 'utools-ai') {
      if (!canUseUtoolsAi()) return ''
      const result = await window.utools.ai({
        model,
        messages: buildUtoolsAiMessages({
          systemContent: systemPrompt,
          apiMessages: [{ role: 'user', content: userPrompt }]
        })
      })
      recordModelUsage(extractModelUsage(result), {
        providerId,
        model,
        endpoint: 'utools-ai',
        purpose: 'session-title'
      })
      return extractFinalSessionTitleContent(result)
    }

    if (!baseUrl || !apiKey || !model) return ''
    const baseBody = {
      model,
      stream: true,
      max_tokens: 64,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    }
    const modes = String(apiMode || '').trim().toLowerCase() === 'auto'
      ? ['auto', 'responses']
      : [apiMode]
    let lastError = null
    // 第一轮显式关闭思考模式（reasoning_effort: none），让标题输出更快更稳定；
    // 若接口或模型不支持该字段，第二轮去掉该字段重试，避免标题生成直接失败。
    for (const reasoningEffort of ['none', '']) {
      for (const requestMode of modes) {
        try {
          apiMode = requestMode
          const body = { ...baseBody }
          if (reasoningEffort) body.reasoning_effort = reasoningEffort
          const result = await streamChatCompletion({
            baseUrl,
            apiKey,
            apiMode,
            body
          })
          recordModelUsage(result?.usage, {
            providerId,
            model,
            endpoint: result?.endpoint || requestMode || 'auto',
            purpose: 'session-title'
          })
          const title = extractFinalSessionTitleContent(result)
          if (title) return title
        } catch (err) {
          lastError = err
        }
      }
    }
    if (lastError) throw lastError
    return ''
  }

  async function moveAutoChatSessionAssetsForRename(oldPath, newPath) {
    const from = buildChatSessionAssetsDirectory(oldPath)
    const to = buildChatSessionAssetsDirectory(newPath)
    if (!from || !to || from === to) return
    try {
      if (!(await exists(from))) return
      await moveItem(from, to, { overwrite: true })
    } catch (err) {
      console.warn('[chat session title] move assets failed:', err)
    }
  }

  async function ensureAutoChatSessionRoot() {
    const rootExists = await exists(CHAT_SESSION_ROOT)
    if (!rootExists) await createDirectory(CHAT_SESSION_ROOT)
    const autoExists = await exists(AUTO_CHAT_SESSION_ROOT)
    if (!autoExists) await createDirectory(AUTO_CHAT_SESSION_ROOT)
  }

  async function allocateAutoChatSessionPathByTitle(title, options = {}) {
    await ensureAutoChatSessionRoot()
    const sanitizedTitle = sanitizeAutoSessionTitle(title, 96) || AUTO_CHAT_SESSION_DIR_NAME
    const excludePath = String(options.excludePath || '').trim()
    let candidate = `${AUTO_CHAT_SESSION_ROOT}/${sanitizedTitle}.json`
    let index = 2
    while (await exists(candidate)) {
      if (candidate === excludePath) break
      candidate = `${AUTO_CHAT_SESSION_ROOT}/${sanitizedTitle}-${index}.json`
      index += 1
    }
    return {
      filePath: candidate,
      title: sanitizeAutoSessionTitle(title, 32) || AUTO_CHAT_SESSION_DIR_NAME
    }
  }

  async function allocateAutoChatSessionPath(record) {
    const title = getPersistedMemorySessionTitle(record) || DEFAULT_MEMORY_SESSION_TITLE
    return allocateAutoChatSessionPathByTitle(title)
  }

  async function applyGeneratedSessionTitle(record, nextTitle, options = {}) {
    if (!record) return ''

    const fallbackTitle = normalizeGeneratedSessionTitle(options.fallbackTitle, buildAutoSessionTitle(record, AUTO_CHAT_SESSION_DIR_NAME))
    const generatedTitle = normalizeGeneratedSessionTitle(nextTitle, fallbackTitle)
    if (!generatedTitle) return ''

    const currentPath = String(record.activeSessionFilePath || '').trim()
    if (!currentPath || !isAutoChatSessionPath(currentPath)) return currentPath

    const currentVisibleTitle = String(record.activeSessionTitle || '').trim()
    if (
      currentVisibleTitle &&
      currentVisibleTitle !== fallbackTitle &&
      currentVisibleTitle !== generatedTitle
    ) {
      return currentPath
    }

    const allocated = await allocateAutoChatSessionPathByTitle(generatedTitle, { excludePath: currentPath })
    let nextPath = currentPath

    if (allocated.filePath !== currentPath) {
      await moveItem(currentPath, allocated.filePath)
      await moveAutoChatSessionAssetsForRename(currentPath, allocated.filePath)
      handleSessionPathRenamed(currentPath, allocated.filePath)
      nextPath = allocated.filePath
    }

    record.activeSessionFilePath = nextPath
    record.activeSessionTitle = generatedTitle
    record.title = generatedTitle
    record.titleSource = 'generated'
    record.titlePostReplyRetryDone = false
    record.titleReadyAt = Number(record.titleReadyAt || 0) || Date.now()
    record.updatedAt = Date.now()

    if (isMemorySessionActive(record)) {
      activeSessionFilePath.value = nextPath
      activeSessionTitle.value = generatedTitle
    }

    await autoPersistMemorySession(record, { notify: false, syncActiveUi: true })
    await sessionTreeRef.value?.refreshTree?.({ silent: true })
    await sessionTreeRef.value?.selectPath?.(nextPath)
    return nextPath
  }

  function requestSessionTitleAsync({
    record,
    cfg,
    text,
    attachments = [],
    initialPersistPromise = Promise.resolve(''),
    reason = 'initial'
  } = {}) {
    const triggerReason = String(reason || 'initial').trim() || 'initial'
    const canRequest = triggerReason === 'post_reply'
      ? canRetryMemorySessionTitle(record)
      : canGenerateMemorySessionTitle(record)
    if (!canRequest) return

    const recordId = String(record.id || '').trim()
    if (!recordId) return
    if (sessionTitleRequestTokens.has(recordId)) return

    const fallbackTitle = buildAutoSessionTitle(record, AUTO_CHAT_SESSION_DIR_NAME)
    const prompt = buildSessionTitleGenerationPrompt({ text, attachments })
    if (!prompt) return

    const titleToken = `${recordId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    sessionTitleRequestTokens.set(recordId, titleToken)
    if (triggerReason === 'post_reply') {
      record.titlePostReplyRetryDone = true
    }
    let retryAfterFailure = false

    void (async () => {
      try {
        const persistedPath = String(await Promise.resolve(initialPersistPromise).catch(() => '') || '').trim()
        const generated = await requestSessionTitleFromModel({
          providerKind: cfg?.providerKind || 'openai-compatible',
          providerId: String(cfg?.providerId || '').trim(),
          baseUrl: String(cfg?.baseUrl || '').trim(),
          apiKey: String(cfg?.apiKey || '').trim(),
          apiMode: normalizeProviderApiMode(cfg?.apiMode),
          model: String(cfg?.model || '').trim(),
          prompt
        })

        if (sessionTitleRequestTokens.get(recordId) !== titleToken) return

        const latestRecord = getMemorySessionById(recordId)
        if (!latestRecord) return

        const normalizedTitle = normalizeGeneratedSessionTitle(generated, '')
        // A provider may expose its reasoning stream as the text content. Do
        // not persist that meta-text as a title; the catch path applies the
        // deterministic title derived from the user's first message.
        if (!isGeneratedSessionTitle(normalizedTitle)) {
          throw new Error('模型返回的会话标题无效')
        }

        const titleReadyAt = Date.now()
        latestRecord.title = normalizedTitle
        latestRecord.activeSessionTitle = normalizedTitle
        latestRecord.titleSource = 'generated'
        latestRecord.titlePostReplyRetryDone = false
        latestRecord.titleReadyAt = titleReadyAt
        if (shouldStampHistoryCreatedAtOnGeneratedTitle(latestRecord)) {
          latestRecord.createdAt = titleReadyAt
        }
        if (isMemorySessionActive(latestRecord)) {
          activeSessionTitle.value = normalizedTitle
        }

        const currentPath = String(latestRecord.activeSessionFilePath || persistedPath || '').trim()
        if (!currentPath) {
          await autoPersistMemorySession(latestRecord, { notify: false, syncActiveUi: true })
        } else if (isAutoChatSessionPath(currentPath)) {
          await applyGeneratedSessionTitle(latestRecord, normalizedTitle, { fallbackTitle })
        }
      } catch (err) {
        console.warn('[chat session title] generation failed:', err)
        const latestRecord = getMemorySessionById(recordId)
        if (!latestRecord) return

        const titleReadyAt = applyFallbackMemorySessionTitle(latestRecord, fallbackTitle)
        if (!titleReadyAt) return

        if (isMemorySessionActive(latestRecord)) {
          activeSessionTitle.value = String(latestRecord.title || '').trim()
        }

        if (isMemorySessionRunning(latestRecord)) return

        const currentPath = String(latestRecord.activeSessionFilePath || '').trim()
        if (!currentPath) {
          await autoPersistMemorySession(latestRecord, { notify: false, syncActiveUi: true })
        } else if (isAutoChatSessionPath(currentPath)) {
          await applyGeneratedSessionTitle(latestRecord, latestRecord.title, { fallbackTitle: latestRecord.title })
        }

        if (hasPersistableMemorySessionResponse(latestRecord) && !latestRecord.titlePostReplyRetryDone) {
          retryAfterFailure = true
        }
      } finally {
        if (sessionTitleRequestTokens.get(recordId) === titleToken) {
          sessionTitleRequestTokens.delete(recordId)
        }
        if (retryAfterFailure) {
          retryAfterFailure = false
          void requestSessionTitleAsync({
            record: getMemorySessionById(recordId),
            cfg,
            text,
            attachments,
            reason: 'post_reply'
          })
        }
      }
    })()
  }

  async function autoPersistMemorySession(record, options = {}) {
    if (!record || !Array.isArray(record.messages) || !record.messages.length) return ''
    const titleReadyAt = markMemorySessionTitleReady(record)
    if (!titleReadyAt) return ''
    const currentPath = String(record.activeSessionFilePath || '').trim()
    if (currentPath && !isAutoChatSessionPath(currentPath)) return currentPath
    const previousPath = currentPath

    const persistKey = getMemorySessionAutoPersistKey(record)
    const shouldSyncActiveUi = options.syncActiveUi !== false
    const existingPersist = persistKey ? autoPersistMemorySessionInFlight.get(persistKey) : null
    if (existingPersist) return existingPersist

    const persistTask = (async () => {
      try {
        const allocated = currentPath
          ? { filePath: currentPath, title: getPersistedMemorySessionTitle(record) || DEFAULT_MEMORY_SESSION_TITLE }
          : await allocateAutoChatSessionPath(record)
        await prepareSessionMediaAssetsForSave(record, { notify: options.notify, sessionFilePath: allocated.filePath })
        const payload = buildSessionSavePayload({
          sessionLike: record,
          state: record.state && typeof record.state === 'object' ? record.state : buildCurrentChatState()
        })
        let previousPayload = null
        if (currentPath) {
          try {
            const previousSnapshot = await readSessionJsonFile(currentPath)
            previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
          } catch {
            previousPayload = null
          }
        }

        const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
          record,
          payload,
          previousPayload
        })
        const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : new Date().toISOString()
        const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
        payload.title = allocated.title
        payload.createdAt = createdAtIso
        if (previousSavedAt) payload.savedAt = previousSavedAt
        payload.updatedAt = new Date().toISOString()
        payload.source = {
          type: AUTO_CHAT_SESSION_SOURCE_TYPE,
          sessionId: String(record.id || '').trim(),
          sandboxWorkspaceId: resolveMemorySessionSandboxWorkspaceId(record),
          retentionPolicy: 'manual',
          managed: true,
          createdAt: payload.createdAt,
          titleReadyAt: new Date(titleReadyAt).toISOString(),
          titleSource: String(record.titleSource || '').trim() || 'generated',
          titleRetryCount: Number(record.titleRetryCount || 0) || 0
        }
        await writeFile(allocated.filePath, JSON.stringify(payload, null, 2))

        record.activeSessionFilePath = allocated.filePath
        record.activeSessionTitle = allocated.title
        record.autoManaged = true
        if (resolvedCreatedAtMs > 0) record.createdAt = resolvedCreatedAtMs
        record.updatedAt = Date.now()

        if (isMemorySessionActive(record) && shouldSyncActiveUi && previousPath !== allocated.filePath) {
          activeSessionFilePath.value = allocated.filePath
          activeSessionTitle.value = allocated.title
          void sessionTreeRef.value?.selectPath?.(allocated.filePath)
        }
        sessionTreeRef.value?.touchPath?.(allocated.filePath, {
          label: allocated.title,
          createdTimeMs: Number(record.createdAt || 0) || Date.now()
        })
        pruneDormantMemorySessions()
        return allocated.filePath
      } catch (err) {
        if (options.notify !== false) message.error('自动归档会话失败：' + (err?.message || String(err)))
        return ''
      }
    })()

    if (!persistKey) return persistTask
    autoPersistMemorySessionInFlight.set(persistKey, persistTask)
    try {
      return await persistTask
    } finally {
      if (autoPersistMemorySessionInFlight.get(persistKey) === persistTask) {
        autoPersistMemorySessionInFlight.delete(persistKey)
      }
    }
  }

  function autoPersistMemorySessionWhenIdle(record, options = {}) {
    if (isMemorySessionRunning(record) && options.allowWhileRunning !== true) return ''
    if (!canPersistMemorySessionToHistory(record)) return ''
    const currentPath = String(record?.activeSessionFilePath || '').trim()
    if (!hasResolvedMemorySessionTitle(record)) return ''
    if (currentPath && !isAutoChatSessionPath(currentPath)) {
      return persistMemorySessionToBoundPath(record, options)
    }
    return autoPersistMemorySession(record, options)
  }

  async function cleanupExpiredSessionTrash() {
    try {
      const purgedSessions = await purgeExpiredChatSessionTrash()
      const sandboxTrashEntries = purgedSessions.flatMap((item) =>
        Array.isArray(item?.sandboxTrashEntries) ? item.sandboxTrashEntries : []
      )
      if (sandboxTrashEntries.length) {
        await purgeSandboxTrashEntries(sandboxTrashEntries, { force: true })
      }
    } catch (err) {
      console.warn('[chat session trash] cleanup failed:', err)
    }
  }

  async function migrateLegacyAutoChatSessionCreatedAt(options = {}) {
    const notify = options.notify === true
    let migrated = 0

    try {
      await ensureAutoChatSessionRoot()
      const entries = await listDirectory(AUTO_CHAT_SESSION_ROOT)
      for (const entry of entries) {
        const entryPath = String(entry || '').trim().replace(/\\/g, '/')
        if (!entryPath || !entryPath.toLowerCase().endsWith('.json')) continue

        let parsed = null
        try {
          parsed = await readSessionJsonFile(entryPath, { repairIfRecovered: true })
        } catch {
          parsed = null
        }
        if (!parsed?.ok || !parsed.value || typeof parsed.value !== 'object') continue

        const payload = parsed.value
        const currentCreatedAt = String(payload?.createdAt || '').trim()
        const sourceCreatedAt = String(payload?.source?.createdAt || '').trim()
        const sourceStartedAt = String(payload?.source?.startedAt || '').trim()
        const existingCreatedAtMs =
          parseIsoTimeMs(currentCreatedAt) ||
          parseIsoTimeMs(sourceCreatedAt) ||
          parseIsoTimeMs(sourceStartedAt)
        const inferredCreatedAtMs = resolveChatSessionCreatedTimeMs(payload)
        if (!Number.isFinite(inferredCreatedAtMs) || inferredCreatedAtMs <= 0) continue
        if (existingCreatedAtMs > 0 && inferredCreatedAtMs >= existingCreatedAtMs) continue

        const inferredCreatedAt = new Date(inferredCreatedAtMs).toISOString()
        payload.createdAt = inferredCreatedAt
        payload.source = payload.source && typeof payload.source === 'object'
          ? { ...payload.source, createdAt: inferredCreatedAt }
          : { createdAt: inferredCreatedAt }
        if (!String(payload.savedAt || '').trim()) payload.savedAt = inferredCreatedAt

        await writeFile(entryPath, JSON.stringify(payload, null, 2))
        migrated += 1
      }

      if (migrated) {
        void sessionTreeRef.value?.refreshTree?.({ silent: true })
        if (notify) message.success(`已补齐 ${migrated} 个历史会话的创建时间`)
      } else if (notify) {
        message.info('没有需要补齐创建时间的历史会话')
      }
    } catch (err) {
      if (notify) message.error('补齐历史会话创建时间失败：' + (err?.message || String(err)))
    }
  }

  async function persistActiveMemorySessionBeforeLeaving(options = {}) {
    const targetPath = String(options.targetPath || '').trim()
    const previous = saveActiveMemorySessionDraft()

    if (isMemorySessionRunning(previous)) return previous
    if (isMemorySessionEmptyDraft(previous)) {
      removeMemorySessionById(previous.id)
      return null
    }

    const previousPath = String(previous.activeSessionFilePath || '').trim()
    if (previousPath && previousPath === targetPath) return previous

    await flushMemoryCandidatesForRecord(previous, { force: false })

    if (previousPath && !isAutoChatSessionPath(previousPath)) {
      await runSessionAutosave()
    } else {
      await autoPersistMemorySession(previous, {
        notify: false,
        syncActiveUi: !targetPath
      })
    }
    return previous
  }

  async function detachRunningSessionToHistory({ nextRecord = null, notify = true, restoreTarget = true } = {}) {
    const activeRecord = getActiveMemorySession()
    if (!isMemorySessionRunning(activeRecord)) return false

    const previous = saveActiveMemorySessionDraft()
    const previousPath = String(previous.activeSessionFilePath || '').trim()
    const preserveBoundPath = !!previousPath
    previous.autoManaged = preserveBoundPath ? isAutoChatSessionPath(previousPath) : true
    previous.state = previous.state && typeof previous.state === 'object' ? previous.state : buildCurrentChatState()
    if (!preserveBoundPath) {
      previous.activeSessionFilePath = ''
      previous.activeSessionTitle = ''
    }

    activeSessionFilePath.value = ''
    activeSessionTitle.value = ''
    sending.value = false
    abortController.value = null

    if (!restoreTarget) {
      if (notify) message.info('当前生成已转入后台，完成后会自动保存')
      return true
    }

    let target = nextRecord
    if (!target) {
      target = createMemorySessionRecord({ title: DEFAULT_MEMORY_SESSION_TITLE, state: buildDefaultChatState() })
      memorySessions.value = [...memorySessions.value, target]
    }

    restoreMemorySession(target, { skipScroll: !nextRecord, skipSaveCurrent: true })
    if (!nextRecord) {
      try {
        sessionTreeRef.value?.clearSelection?.()
      } catch {
        // ignore
      }
    }
    pruneDormantMemorySessions({ keepId: target.id })
    if (notify) message.info('当前生成已转入后台，完成后会自动保存')
    return true
  }

  async function startNewMemorySession(options = {}) {
    const activeRecord = getActiveMemorySession()
    if (isMemorySessionEmptyDraft(activeRecord)) {
      restoreMemorySession(activeRecord, { skipScroll: true, skipSaveCurrent: true })
      activeRecord.title = DEFAULT_MEMORY_SESSION_TITLE
      activeRecord.state = applyDefaultChatState()
      activeRecord.updatedAt = Date.now()
      try {
        sessionTreeRef.value?.clearSelection?.()
      } catch {
        // ignore
      }
      return
    }

    if (isMemorySessionRunning(activeRecord)) {
      await detachRunningSessionToHistory({ notify: options.notify !== false })
      return
    }

    await persistActiveMemorySessionBeforeLeaving()
    const record = createMemorySessionRecord({ title: DEFAULT_MEMORY_SESSION_TITLE, state: buildDefaultChatState() })
    memorySessions.value = [...memorySessions.value.filter((item) => !isMemorySessionEmptyDraft(item)), record]
    restoreMemorySession(record, { skipScroll: true, skipSaveCurrent: true })
    try {
      sessionTreeRef.value?.clearSelection?.()
    } catch {
      // ignore
    }
    if (options.notify !== false) message.info('已新建会话')
  }

  async function switchMemorySession(id) {
    const record = getMemorySessionById(id)
    if (!record || String(record.id || '') === String(activeMemorySessionId.value || '')) return

    const activeRecord = getActiveMemorySession()
    if (isMemorySessionRunning(activeRecord)) {
      await detachRunningSessionToHistory({ nextRecord: record, notify: false })
      message.info('当前生成已转入后台，已切换会话')
      return
    }

    await persistActiveMemorySessionBeforeLeaving()
    await withChatSessionOpeningHeavyRender(async () => {
      void maybeWarmMarkdownPreviewRuntimeForMessages(record.messages).catch(() => {})
      restoreMemorySession(record, { skipSaveCurrent: true, skipScroll: true })
      await scrollToBottom({ force: true })
      await settleChatViewportAfterSessionOpen({
        reconnectObserver: true,
        buffer: resolveCurrentHeavyRenderViewportBuffer(CHAT_HEAVY_RENDER_WARM_BUFFER_EXTRA)
      })
    })
    pruneDormantMemorySessions({ keepId: record.id })
  }

  function handleMemorySessionSelect(key) {
    const id = String(key || '').trim()
    if (id === '__new__') {
      void startNewMemorySession()
      return
    }
    void switchMemorySession(id)
  }

  async function prepareSessionMediaAssetsForSave(sessionLike, options = {}) {
    try {
      const sessionFilePath = String(options.sessionFilePath || sessionLike?.activeSessionFilePath || '').trim()
      await persistChatSessionMediaAssets(sessionLike, { sessionFilePath })
    } catch (err) {
      if (options.notify !== false) {
        message.warning('媒体文件持久化失败，部分图片/视频可能只能在当前页面临时预览：' + (err?.message || String(err)))
      }
    }
  }

  function serializeDisplayMessageForSave(msg) {
    if (!msg || typeof msg !== 'object') return null
    const out = { ...msg }

    if (out.compactGuidance) {
      out.role = 'system'
      out.guidance = false
      out.guidanceExpanded = false
    }

    if (out.role === 'user') {
      out.editing = false
      out.editDraft = ''
      out.attachmentsExpanded = false
      out.guidanceExpanded = false
    }

    if (out.role === 'assistant') {
      out.streaming = false
      out.thinkingExpanded = false
    }

    if (out.role === 'tool' || out.role === 'tool_call') {
      out.toolExpanded = false
      out.agentRunExpandedStepIds = []
    }

    if (Array.isArray(out.attachments)) {
      out.attachments = out.attachments
        .map((a) => {
          if (!a || typeof a !== 'object') return null
          return {
            id: a.id,
            name: a.name,
            ext: a.ext,
            mime: a.mime,
            size: a.size,
            kind: a.kind,
            status: a.status,
            error: a.error,
            sandboxOnly: a.sandboxOnly,
            previewError: a.previewError,
            sandboxWorkspaceId: a.sandboxWorkspaceId,
            sandboxPath: a.sandboxPath,
            sandboxDataPath: a.sandboxDataPath
          }
        })
        .filter(Boolean)
    }

    if (Array.isArray(out.images)) {
      out.images = out.images.map((media) => serializeChatMediaForSave(media, 'image')).filter(Boolean)
    }

    if (Array.isArray(out.videos)) {
      out.videos = out.videos.map((media) => serializeChatMediaForSave(media, 'video')).filter(Boolean)
    }

    return out
  }

  function buildCurrentChatState() {
    const activeRecord = getActiveMemorySession()
    const normalizedBasePromptState = basePromptMode.value === 'prompt'
      ? {
          basePromptMode: 'prompt',
          selectedPromptId: selectedPromptId.value,
          customSystemPrompt: '',
          customSystemPromptExplicit: false
        }
      : buildCustomSystemPromptState(customSystemPrompt.value, customSystemPromptExplicit.value)
    return {
      selectedAgentId: selectedAgentId.value,
      selectedProviderId: selectedProviderId.value,
      selectedModel: selectedModel.value,
      basePromptMode: normalizedBasePromptState.basePromptMode,
      selectedPromptId: normalizedBasePromptState.selectedPromptId,
      customSystemPrompt: normalizedBasePromptState.customSystemPrompt,
      customSystemPromptExplicit: normalizedBasePromptState.customSystemPromptExplicit,
      selectedSkillIds: deepCopyJson(
        normalizeStringList(selectedSkillIds.value)
          .filter((id) => !routerAddedSelectedSkillIds.has(id)),
        []
      ),
      agentSkillIds: deepCopyJson(
        normalizeStringList(agentSkillIds.value)
          .filter((id) => !routerAddedAgentSkillIds.has(id)),
        []
      ),
      activatedAgentSkillIds: deepCopyJson(
        normalizeStringList(activatedAgentSkillIds.value)
          .filter((id) => !routerActivatedAgentSkillIds.has(id)),
        []
      ),
      manualMcpIds: deepCopyJson(manualMcpIds.value, []),
      sandboxHostWorkspacePath: normalizeSelectedHostWorkspacePath(sandboxHostWorkspacePath.value),
      webSearchEnabled: webSearchEnabled.value,
      toolApprovalMode: toolApprovalMode.value,
      autoApproveTools: autoApproveTools.value,
      autoActivateAgentSkills: autoActivateAgentSkills.value,
      toolMode: toolMode.value,
      effectiveToolMode: effectiveToolMode.value,
      thinkingEffort: thinkingEffort.value,
      imageGenerationMode: imageGenerationMode.value,
      videoGenerationMode: videoGenerationMode.value,
      imageGenerationParamsEnabled: imageGenerationParamsEnabled.value,
      imageGenerationParams: deepCopyJson(imageGenerationParams, createDefaultImageGenerationParams()),
      videoGenerationParamsEnabled: videoGenerationParamsEnabled.value,
      videoGenerationParams: deepCopyJson(videoGenerationParams, createDefaultVideoGenerationParams()),
      contextWindow: sessionContextWindowOverride.value
        ? deepCopyJson(normalizeChatContextWindowConfig(sessionContextWindowOverride.value), null)
        : null,
      contextSummary: deepCopyJson(activeRecord?.contextSummary || {}, {}),
      contextTokenTelemetry: normalizeContextTokenTelemetry(activeRecord?.contextTokenTelemetry)
    }
  }

  function buildDefaultChatState() {
    const rawDefaultSystemPrompt = String(chatConfig.value?.defaultSystemPrompt || '')
    const defaultModel = resolveDefaultModelSelectionFromConfig()
    const defaultPromptState = buildCustomSystemPromptState(rawDefaultSystemPrompt, false)
    const builtinAgent = (agents.value || []).find((agent) => String(agent?._id || '').trim() === BUILTIN_AGENT_ID)
    const builtinSkillIds = normalizeStringList(builtinAgent?.skills)
    return {
      selectedAgentId: builtinAgent?._id || null,
      selectedProviderId: defaultModel.providerId || null,
      selectedModel: defaultModel.model || '',
      basePromptMode: defaultPromptState.basePromptMode,
      selectedPromptId: defaultPromptState.selectedPromptId,
      customSystemPrompt: defaultPromptState.customSystemPrompt,
      customSystemPromptExplicit: defaultPromptState.customSystemPromptExplicit,
      selectedSkillIds: builtinSkillIds,
      agentSkillIds: builtinSkillIds,
      activatedAgentSkillIds: [],
      manualMcpIds: [],
      sandboxHostWorkspacePath: '',
      webSearchEnabled: false,
      toolApprovalMode: normalizeToolApprovalMode(chatConfig.value?.toolApprovalMode),
      autoApproveTools: normalizeToolApprovalMode(chatConfig.value?.toolApprovalMode) !== TOOL_APPROVAL_MODE_MANUAL,
      autoActivateAgentSkills: true,
      toolMode: 'auto',
      effectiveToolMode: 'expanded',
      thinkingEffort: 'auto',
      imageGenerationMode: normalizeImageGenerationMode(chatConfig.value?.imageGenerationMode),
      videoGenerationMode: normalizeImageGenerationMode(chatConfig.value?.videoGenerationMode),
      imageGenerationParamsEnabled: false,
      imageGenerationParams: createDefaultImageGenerationParams(),
      videoGenerationParamsEnabled: false,
      videoGenerationParams: createDefaultVideoGenerationParams(),
      contextWindow: null,
      contextTokenTelemetry: createEmptyContextTokenTelemetry()
    }
  }

  function buildHydratedChatState(state) {
    const merged = buildMergedChatState(buildDefaultChatState(), state)
    merged.toolApprovalMode = normalizeToolApprovalMode(
      state?.toolApprovalMode,
      state?.autoApproveTools === false ? TOOL_APPROVAL_MODE_MANUAL : TOOL_APPROVAL_MODE_SAFE
    )
    merged.autoApproveTools = merged.toolApprovalMode !== TOOL_APPROVAL_MODE_MANUAL
    return merged
  }

  function applyDefaultChatState() {
    const state = buildDefaultChatState()
    sessionContextWindowOverride.value = null
    applyLoadedChatState(state)

    const rawDefaultSystemPrompt = String(state.customSystemPrompt || '')
    lastLoadedDefaultSystemPrompt.value = normalizePromptText(rawDefaultSystemPrompt)
    customSystemPromptExplicit.value = false
    hasInitializedDefaultSystemPrompt.value = true
    systemPromptDraft.value = ''
    agentModalSelectedId.value = null
    promptModalSelectedId.value = null
    skillModalSelectedIds.value = []
    mcpModalSelectedIds.value = []
    hasAppliedDefaultModel.value = !!(state.selectedProviderId && state.selectedModel)

    try {
      mcpListToolsCache.clear()
      mcpListToolsInFlight.clear()
      mcpToolsRevision.value += 1
      clearMcpToolCatalog()
      clearPinnedMcpToolHints()
    } catch {
      // ignore
    }

    return state
  }

  function buildSessionSavePayload(options = {}) {
    const sessionLike = options.sessionLike || options.session || session
    const activeRecord = getActiveMemorySession()
    const memorySource =
      sessionLike && Object.prototype.hasOwnProperty.call(sessionLike, 'memoryCandidates') ? sessionLike : activeRecord
    const state = options.state && typeof options.state === 'object' ? options.state : buildCurrentChatState()
    return {
      version: 1,
      type: 'chat_session',
      savedAt: new Date().toISOString(),
      state,
      session: {
        id: String(memorySource?.id || '').trim(),
        sandboxWorkspaceId: resolveMemorySessionSandboxWorkspaceId(memorySource),
        messages: (sessionLike.messages || []).map(serializeDisplayMessageForSave).filter(Boolean),
        apiMessages: deepCopyJson(sessionLike.apiMessages || [], [])
      },
      memory: {
        candidates: normalizeMemoryCandidateQueue(memorySource?.memoryCandidates),
        candidateUpdatedAt: Number(memorySource?.memoryCandidateUpdatedAt || 0) || 0,
        contextSummary: deepCopyJson(memorySource?.contextSummary || {}, {}),
        contextTokenTelemetry: normalizeContextTokenTelemetry(memorySource?.contextTokenTelemetry)
      }
    }
  }

  function replacePathPrefix(targetPath, oldBase, newBase) {
    const t = String(targetPath || '')
    if (t === oldBase) return newBase
    if (t.startsWith(oldBase + '/')) return newBase + t.slice(oldBase.length)
    return t
  }

  function isPathEqualOrInside(targetPath, basePath) {
    const target = String(targetPath || '').trim()
    const base = String(basePath || '').trim()
    if (!target || !base) return false
    return target === base || target.startsWith(base + '/')
  }

  async function persistMemorySessionToBoundPath(record, options = {}) {
    if (!record || !Array.isArray(record.messages) || !record.messages.length) return ''
    const filePath = String(record.activeSessionFilePath || '').trim()
    if (!filePath || isAutoChatSessionPath(filePath)) return ''

    try {
      const stateSnapshot =
        options.state && typeof options.state === 'object'
          ? deepCopyJson(options.state, {})
          : record.state && typeof record.state === 'object'
            ? deepCopyJson(record.state, {})
            : buildCurrentChatState()
      await prepareSessionMediaAssetsForSave(record, { notify: options.notify, sessionFilePath: filePath })
      const payload = buildSessionSavePayload({
        sessionLike: record,
        state: stateSnapshot
      })
      let previousPayload = null
      try {
        const previousSnapshot = await readSessionJsonFile(filePath)
        previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
      } catch {
        previousPayload = null
      }

      const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
        record,
        payload,
        previousPayload
      })
      const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : ''
      const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
      if (createdAtIso) payload.createdAt = createdAtIso
      if (previousSavedAt) payload.savedAt = previousSavedAt
      const title = getPersistedMemorySessionTitle(record, filePath)
      if (title) payload.title = title
      payload.updatedAt = new Date().toISOString()
      payload.source = {
        ...(previousPayload?.source && typeof previousPayload.source === 'object' ? previousPayload.source : {}),
        ...(payload?.source && typeof payload.source === 'object' ? payload.source : {}),
        sessionId: String(record.id || '').trim(),
        sandboxWorkspaceId: resolveMemorySessionSandboxWorkspaceId(record),
        retentionPolicy: 'manual'
      }

      await writeFile(filePath, JSON.stringify(payload, null, 2))
      if (resolvedCreatedAtMs > 0) record.createdAt = resolvedCreatedAtMs
      record.updatedAt = Date.now()
      void sessionTreeRef.value?.touchPath?.(filePath, {
        label: title,
        createdTimeMs: Number(record.createdAt || 0) || Date.now()
      })
      return filePath
    } catch (err) {
      if (options.notify !== false) message.error('自动保存失败：' + (err?.message || String(err)))
      return ''
    }
  }

  let sessionAutosaveTimer = null
  let lastSessionAutosaveAt = 0
  let sessionAutosaveInFlight = false
  let lastSessionAutosaveErrorAt = 0
  let lastSessionAutosaveErrorMsg = ''

  function unbindSessionAutosave(options = {}) {
    const silent = !!options.silent

    activeSessionFilePath.value = ''
    activeSessionTitle.value = ''

    if (sessionAutosaveTimer) {
      window.clearTimeout(sessionAutosaveTimer)
      sessionAutosaveTimer = null
    }

    if (!silent) message.info('已解除当前会话文件的自动保存绑定')
  }

  async function runSessionAutosave() {
    const filePath = String(activeSessionFilePath.value || '').trim()
    if (!filePath) return
    if (sessionAutosaveInFlight) return
    const activeRecord = getMemorySessionById(activeMemorySessionId.value)
    if (isMemorySessionChatRunning(activeRecord)) return
    if (isAutoChatSessionPath(filePath) && isMemorySessionRunning(activeRecord)) return

    sessionAutosaveInFlight = true
    try {
      await prepareSessionMediaAssetsForSave(session, { notify: false, sessionFilePath: filePath })
      const payload = buildSessionSavePayload()
      let previousPayload = null
      try {
        const previousSnapshot = await readSessionJsonFile(filePath)
        previousPayload = previousSnapshot.ok ? previousSnapshot.value : null
      } catch {
        previousPayload = null
      }
      const resolvedCreatedAtMs = resolvePersistedSessionCreatedAtMs({
        record: activeRecord,
        payload,
        previousPayload
      })
      const createdAtIso = resolvedCreatedAtMs > 0 ? new Date(resolvedCreatedAtMs).toISOString() : ''
      const previousSavedAt = String(previousPayload?.savedAt || previousPayload?.createdAt || '').trim()
      if (createdAtIso) payload.createdAt = createdAtIso
      if (previousSavedAt) payload.savedAt = previousSavedAt
      const title = getPersistedMemorySessionTitle(activeRecord, filePath)
      if (title) payload.title = title
      payload.updatedAt = new Date().toISOString()
      const json = JSON.stringify(payload, null, 2)
      await writeFile(filePath, json)
      if (activeRecord && resolvedCreatedAtMs > 0) activeRecord.createdAt = resolvedCreatedAtMs
      lastSessionAutosaveAt = Date.now()
    } catch (err) {
      const msg = err?.message || String(err)
      const now = Date.now()
      const shouldNotify = now - lastSessionAutosaveErrorAt > 5000 || msg !== lastSessionAutosaveErrorMsg
      if (shouldNotify) {
        message.error('自动保存失败：' + msg)
        lastSessionAutosaveErrorAt = now
        lastSessionAutosaveErrorMsg = msg
      }

      if (err?.code === 'ENOENT') {
        unbindSessionAutosave({ silent: true })
        message.warning('会话文件已不存在，已解除自动保存绑定')
      }
    } finally {
      sessionAutosaveInFlight = false
    }
  }

  function scheduleSessionAutosave(options = {}) {
    const filePath = String(activeSessionFilePath.value || '').trim()
    if (!filePath) return

    const force = !!options.force
    const activeRecord = getMemorySessionById(activeMemorySessionId.value)
    if (!force && isMemorySessionChatRunning(activeRecord)) return
    if (!force && isAutoChatSessionPath(filePath) && isMemorySessionRunning(activeRecord)) return
    const debounceMs = 900
    const maxWaitMs = 12000
    const now = Date.now()

    if (force) {
      if (sessionAutosaveTimer) {
        window.clearTimeout(sessionAutosaveTimer)
        sessionAutosaveTimer = null
      }
      void runSessionAutosave()
      return
    }

    if (sessionAutosaveTimer) window.clearTimeout(sessionAutosaveTimer)
    sessionAutosaveTimer = window.setTimeout(() => {
      sessionAutosaveTimer = null
      runSessionAutosave()
    }, debounceMs)

    if (!sessionAutosaveInFlight && now - lastSessionAutosaveAt >= maxWaitMs) {
      window.clearTimeout(sessionAutosaveTimer)
      sessionAutosaveTimer = null
      void runSessionAutosave()
    }
  }

  function resetChatRuntimeState() {
    typewriterFlushAll()
    clearAllUserEditingState()
    expandedToolActivityGroupIds.value = new Set()
    clearSessionData()
    resetUserAnchors()
    autoScrollEnabled.value = true
    autoScrollSuspendedByUser.value = false
    input.value = ''
    pendingAttachments.value = []
    abortController.value = null
    const record = getActiveMemorySession()
    clearSessionApprovedTools(record?.id)
    chatRunInputQueue.clear(record?.id)
    touchChatRunInputQueue()
    const now = Date.now()
    clearMemoryCandidateFlushTimer(record)
    record.messages = session.messages
    record.apiMessages = session.apiMessages
    record.input = ''
    record.pendingAttachments = []
    record.memoryCandidates = []
    record.memoryCandidateUpdatedAt = 0
    record.contextSummary = createEmptyContextSummaryState()
    record.contextTokenTelemetry = createEmptyContextTokenTelemetry()
    record.activeSessionFilePath = ''
    record.activeSessionTitle = ''
    record.title = DEFAULT_MEMORY_SESSION_TITLE
    record.titleSource = ''
    record.titleRetryCount = 0
    record.titlePostReplyRetryDone = false
    record.titleReadyAt = 0
    record.createdAt = now
    record.runningTaskCount = 0
    record.chatRunCount = 0
    record.activeRequestAbortState = null
    record.pendingApprovalRequests = []
    record.approvalPromptActive = false
    record.autoManaged = false
    record.state = applyDefaultChatState()
    record.updatedAt = now
    syncActiveRequestUiState(record)
  }

  async function waitForMemorySessionChatIdle(record, options = {}) {
    const target = record || getActiveMemorySession()
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 1200)
    const startedAt = Date.now()
    while (target && isMemorySessionChatRunning(target)) {
      if ((Date.now() - startedAt) >= timeoutMs) return false
      await nextTick()
      await waitForLayoutFrame()
      await new Promise((resolve) => window.setTimeout(resolve, 24))
    }
    return !target || !isMemorySessionChatRunning(target)
  }

  async function runExclusiveSessionReset(task) {
    if (sessionResetPromise) return sessionResetPromise
    sessionResetPromise = Promise.resolve()
      .then(() => task())
      .finally(() => {
        sessionResetPromise = null
      })
    return sessionResetPromise
  }

  async function clearSessionImpl() {
    const record = getActiveMemorySession()
    const chatIdle = await waitForMemorySessionChatIdle(record)
    if (!chatIdle) {
      message.warning('刚结束生成，正在整理最后内容，请稍后再试')
      return
    }

    const hasContent = (session.messages && session.messages.length) || (session.apiMessages && session.apiMessages.length)
    saveActiveMemorySessionDraft()
    if (Number(record?.runningTaskCount || 0) > 0) {
      await detachRunningSessionToHistory({ notify: false })
      message.info('当前会话仍有后台任务，已转入后台并新建会话')
      return
    }

    const boundPath = String(activeSessionFilePath.value || '').trim()
    if (boundPath) {
      await closeActiveSessionImpl({ skipIdleCheck: true })
      return
    }

    if (!hasContent) {
      resetChatSetupUiState()
      message.success('已重置为初始状态')
      return
    }

    flushMemoryCandidatesInBackground(record, {
      force: true,
      systemPrompt: buildCombinedSystemContent('', { sessionRecord: record })
    })
    resetChatSetupUiState()
    resetChatRuntimeState()
    await nextTick()
    scheduleRefreshUserAnchorMeta()
    message.success('已清空当前会话')
  }

  async function clearSession() {
    return runExclusiveSessionReset(clearSessionImpl)
  }

  async function openSaveSessionModal() {
    if (!session.messages.length) {
      message.warning('当前会话为空')
      return
    }

    const payload = buildSessionSavePayload()
    const options = {
      defaultName: buildDefaultSessionName(session),
      preparePayload: async (filePath) => {
        await prepareSessionMediaAssetsForSave(session, { sessionFilePath: filePath })
        return buildSessionSavePayload()
      }
    }

    if (sessionTreeRef.value?.openSaveSessionModal) {
      await sessionTreeRef.value.openSaveSessionModal(payload, options)
      return
    }

    // 兜底：如果侧边栏内容尚未挂载，先展开再尝试打开保存弹窗
    sessionSiderCollapsed.value = false
    await nextTick()
    if (!sessionTreeRef.value?.openSaveSessionModal) {
      message.warning('会话保存功能尚未就绪')
      return
    }
    await sessionTreeRef.value.openSaveSessionModal(payload, options)
  }

  function handleSessionSaved(filePath) {
    const rel = String(filePath || '').trim()
    if (!rel) return
    activeSessionFilePath.value = rel
    activeSessionTitle.value = getSessionTitleFromPath(rel)
    const record = getActiveMemorySession()
    record.activeSessionFilePath = rel
    record.activeSessionTitle = activeSessionTitle.value
    record.autoManaged = isAutoChatSessionPath(rel)
    void sessionTreeRef.value?.selectPath?.(rel)
  }

  function handleSessionPathRenamed(oldPath, newPath) {
    const cur = String(activeSessionFilePath.value || '').trim()
    const from = String(oldPath || '').trim()
    const to = String(newPath || '').trim()
    if (!from || !to) return

    const next = cur ? replacePathPrefix(cur, from, to) : cur
    const activeChanged = !!cur && next !== cur
    if (activeChanged) {
      activeSessionFilePath.value = next
      activeSessionTitle.value = getSessionTitleFromPath(next)
    }

    memorySessions.value.forEach((record) => {
      const recordPath = String(record?.activeSessionFilePath || '').trim()
      const recordNext = replacePathPrefix(recordPath, from, to)
      if (recordPath && recordNext !== recordPath) {
        record.activeSessionFilePath = recordNext
        record.activeSessionTitle = getSessionTitleFromPath(recordNext)
        record.autoManaged = isAutoChatSessionPath(recordNext)
        record.updatedAt = Date.now()
      }
    })
    if (activeChanged) void sessionTreeRef.value?.selectPath?.(next)
  }

  async function handleSessionPathDeleted(deletedPath, deletedSessionPayloads = [], deleteInfo = {}) {
    const cur = String(activeSessionFilePath.value || '').trim()
    const p = String(deletedPath || '').trim()
    if (!p) return

    if (deleteInfo?.softDeleted !== true && Array.isArray(deletedSessionPayloads) && deletedSessionPayloads.length) {
      const mediaAssetPaths = new Set()
      deletedSessionPayloads.forEach((item) => {
        const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
        const sessionFilePath = String(item?.path || item?.filePath || '').trim()
        collectChatMediaAssetPathsFromPayload(payload, { sessionFilePath }).forEach((assetPath) => mediaAssetPaths.add(assetPath))
      })
      if (mediaAssetPaths.size) {
        await deleteChatMediaAssetPaths(Array.from(mediaAssetPaths))
      }
      await Promise.all(
        deletedSessionPayloads
          .map((item) => String(item?.path || item?.filePath || '').trim())
          .filter(Boolean)
          .map((filePath) => deleteChatSessionAssetDirectory(filePath))
      )
    }

    memorySessions.value.forEach((record) => {
      const recordPath = String(record?.activeSessionFilePath || '').trim()
      if (!isPathEqualOrInside(recordPath, p)) return
      record.activeSessionFilePath = ''
      record.activeSessionTitle = ''
      record.autoManaged = isMemorySessionRunning(record)
      record.updatedAt = Date.now()
    })

    if (isPathEqualOrInside(cur, p)) {
      unbindSessionAutosave({ silent: true })
      const record = getActiveMemorySession()
      record.activeSessionFilePath = ''
      record.activeSessionTitle = ''
      record.autoManaged = isMemorySessionRunning(record)
      try {
        sessionTreeRef.value?.clearSelection?.()
      } catch {
        // ignore
      }
      message.warning('当前会话文件已被删除，自动保存绑定已解除')
    }
  }

  async function closeActiveSessionImpl(options = {}) {
    const record = getActiveMemorySession()
    if (!options.skipIdleCheck) {
      const chatIdle = await waitForMemorySessionChatIdle(record)
      if (!chatIdle) {
        message.warning('刚结束生成，正在整理最后内容，请稍后再试')
        return
      }
    }
    if (Number(record?.runningTaskCount || 0) > 0) {
      await detachRunningSessionToHistory({ notify: false })
      message.info('当前会话仍有后台任务，已转入后台并新建会话')
      return
    }

    const boundPath = String(activeSessionFilePath.value || '').trim()
    if (!boundPath) return

    const snapshot = {
      ...record,
      messages: Array.isArray(record.messages) ? [...record.messages] : [],
      apiMessages: Array.isArray(record.apiMessages) ? deepCopyJson(record.apiMessages, []) : [],
      pendingAttachments: Array.isArray(record.pendingAttachments) ? [...record.pendingAttachments] : [],
      memoryCandidates: normalizeMemoryCandidateQueue(record.memoryCandidates),
      contextSummary: deepCopyJson(record.contextSummary || {}, {}),
      state: buildCurrentChatState()
    }

    unbindSessionAutosave({ silent: true })
    try {
      sessionTreeRef.value?.clearSelection?.()
    } catch {
      // ignore
    }

    resetChatRuntimeState()
    await nextTick()
    scheduleRefreshUserAnchorMeta()

    void (async () => {
      await flushMemoryCandidatesForRecord(snapshot, { force: true })
      try {
        await persistMemorySessionToBoundPath(snapshot, { notify: false, state: snapshot.state })
      } catch {
        // ignore
      }
    })()

    message.info('已关闭会话绑定并清空当前会话')
  }

  async function closeActiveSession(options = {}) {
    return runExclusiveSessionReset(() => closeActiveSessionImpl(options))
  }

  return {
    requestSessionTitleAsync,
    autoPersistMemorySessionWhenIdle,
    cleanupExpiredSessionTrash,
    migrateLegacyAutoChatSessionCreatedAt,
    persistActiveMemorySessionBeforeLeaving,
    detachRunningSessionToHistory,
    handleMemorySessionSelect,
    buildCurrentChatState,
    buildDefaultChatState,
    buildHydratedChatState,
    applyDefaultChatState,
    getSessionTitleFromPath,
    unbindSessionAutosave,
    scheduleSessionAutosave,
    runExclusiveSessionReset,
    clearSession,
    openSaveSessionModal,
    handleSessionSaved,
    handleSessionPathRenamed,
    handleSessionPathDeleted,
    closeActiveSession
  }
}
