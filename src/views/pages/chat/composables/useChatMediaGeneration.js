export function useChatMediaGeneration(dependencies) {
  const {
    VIDEO_GENERATION_RESULT_TIMEOUT_MS,
    applyImageGenerationImagesToDisplay,
    applyImageGenerationTaskToDisplay,
    applyImageGenerationTextToDisplay,
    applyVideoGenerationTaskToDisplay,
    applyVideoGenerationTextToDisplay,
    applyVideoGenerationVideosToDisplay,
    assistantImageTaskStatusLabel,
    attachMediaRequestSnapshot,
    autoPersistMemorySessionWhenIdle,
    autoScrollEnabled,
    buildCurrentChatState,
    buildImageGenerationApiSummary,
    buildImageGenerationCompatibilityError,
    buildImageGenerationPendingText,
    buildImageGenerationRequestOptionsWithReferences,
    buildManualImageGenerationRequestInfo,
    buildManualVideoGenerationRequestInfo,
    buildMediaRequestSnapshot,
    buildVideoGenerationApiSummary,
    buildVideoGenerationCompatibilityError,
    buildVideoGenerationPendingText,
    buildVideoGenerationRequestOptionsWithReferences,
    clearAllUserEditingState,
    clearAttachmentFileReferences,
    collectAttachmentMediaReferenceImages,
    collectImageGenerationRevisedPrompts,
    createAbortError,
    createAssistantImageBubblePlaceholder,
    createAssistantVideoBubblePlaceholder,
    createDisplayMessage,
    createImageGenerationPlaceholderDisplay,
    createVideoGenerationPlaceholderDisplay,
    deepCopyJson,
    detachedMediaAbortStates,
    extractChatImagesFromToolResult,
    extractChatVideosFromToolResult,
    extractEditableUserTextFromContent,
    extractImageGenerationPromptFromContent,
    extractImageGenerationTaskState,
    extractImageGenerationTextResult,
    extractVideoGenerationTaskState,
    getActiveMemorySession,
    getCompatKey,
    getMemorySessionForMessage,
    getRunSessionTarget,
    isAbortError,
    isDisplayMessageInActiveSession,
    isFinalizedMemorySessionTitle,
    isMemorySessionActive,
    isUtoolsBuiltinProvider,
    maybeScrollToBottomForRun,
    message,
    persistChatMediaListAssets,
    prepareUserApiMessage,
    preparingSend,
    providers,
    requestImageGeneration,
    requestVideoGeneration,
    resolveMemorySessionTitle,
    resumingMediaTaskKeys,
    runChatSession,
    scheduleRefreshUserAnchorMeta,
    scrollToBottom,
    selectedModel,
    selectedProvider,
    selectedProviderId,
    sending,
    session,
    shouldFetchVideoGenerationContent,
    showMediaLibraryModal,
    showModelModal,
    throwIfAborted,
    truncateInlineText,
    waitForVideoGenerationResult
  } = dependencies

  async function runImageGenerationRound({
    providerId = '',
    baseUrl,
    apiKey,
    model,
    signal,
    setCurrentAssistantDisplay,
    abortState = null,
    placeholderMode = 'text',
    requestOptionsOverride = null
  }) {
    const targetSession = getRunSessionTarget(abortState)
    throwIfAborted(abortState)
    const lastUserApiMsg = (() => {
      for (let i = (targetSession.apiMessages || []).length - 1; i >= 0; i--) {
        if (targetSession.apiMessages[i]?.role === 'user') return targetSession.apiMessages[i]
      }
      return null
    })()
  
    const userPrompt = extractEditableUserTextFromContent(
      extractImageGenerationPromptFromContent(lastUserApiMsg?.content)
    ).trim()
    if (!userPrompt) {
      throw new Error('图片生成提示词为空')
    }
  
    const requestOptions =
      requestOptionsOverride && typeof requestOptionsOverride === 'object'
        ? buildImageGenerationRequestOptionsWithReferences(requestOptionsOverride)
        : {}
    const requestInfo = placeholderMode === 'image' ? buildManualImageGenerationRequestInfo(requestOptions) : ''
    const startedAt = Date.now()
    const assistantDisplay = createImageGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
    attachMediaRequestSnapshot(assistantDisplay, 'image', buildMediaRequestSnapshot('image', {
      baseUrl,
      model,
      prompt: userPrompt,
      requestOptions,
      placeholderMode,
      startedAt
    }))
    targetSession.messages.push(assistantDisplay)
    setCurrentAssistantDisplay(assistantDisplay)
    await maybeScrollToBottomForRun(abortState)
  
    const prompt = buildImageGenerationPromptFromHistory(userPrompt, { apiMessages: targetSession.apiMessages })
    const { payload, requestMeta } = await requestImageGeneration({
      baseUrl,
      apiKey,
      model,
      prompt,
      requestOptions,
      signal
    })
    attachMediaRequestSnapshot(assistantDisplay, 'image', { requestMeta })
    recordModelUsageFromPayload(payload, {
      providerId,
      model,
      endpoint: requestMeta?.kind || 'image-generation',
      purpose: 'image-generation'
    })
    throwIfAborted(abortState)
  
    const imageTask = extractImageGenerationTaskState(payload, requestMeta)
    if (imageTask) {
      applyImageGenerationTaskToDisplay(assistantDisplay, { ...imageTask, startedAt }, placeholderMode)
      targetSession.apiMessages.push({
        role: 'assistant',
        content:
          placeholderMode === 'image'
            ? `图片任务已受理：${assistantImageTaskStatusLabel(assistantDisplay)}${imageTask.id ? `（任务 ID：${imageTask.id}）` : ''}`
            : buildImageGenerationPendingText(imageTask)
      })
      assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
      await maybeScrollToBottomForRun(abortState)
      return
    }
  
    const generationTimeMs = Math.max(0, Date.now() - startedAt)
    const images = await persistChatMediaListAssets(
      extractChatImagesFromToolResult(payload).map((image) => ({
        ...image,
        requestSize: image.requestSize || requestOptions.size || '',
        generationTimeMs: Number(image.generationTimeMs || 0) || generationTimeMs
      })),
      { kind: 'image', messageId: assistantDisplay.id }
    )
    const textResult = extractImageGenerationTextResult(payload)
    if (!images.length) {
      if (textResult) {
        applyImageGenerationTextToDisplay(assistantDisplay, textResult)
        targetSession.apiMessages.push({
          role: 'assistant',
          content: textResult
        })
        assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
        setCurrentAssistantDisplay(null)
        await maybeScrollToBottomForRun(abortState)
        return
      }
      throw new Error(buildImageGenerationCompatibilityError(payload, requestMeta))
    }
  
    const revisedPrompts = collectImageGenerationRevisedPrompts(payload)
    applyImageGenerationImagesToDisplay(assistantDisplay, { images, userPrompt, revisedPrompts })
  
    targetSession.apiMessages.push({
      role: 'assistant',
      content: buildImageGenerationApiSummary({
        imageCount: images.length,
        revisedPrompts
      })
    })
    assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
    setCurrentAssistantDisplay(null)
    await maybeScrollToBottomForRun(abortState)
  }
    function startDetachedVideoTaskPolling({
    assistantDisplay,
    initialPayload,
    requestMeta,
    apiKey,
    startedAt,
    placeholderMode,
    userPrompt,
    initialTask,
    sessionRecord = null,
    stateSnapshot = null
  }) {
    if (!assistantDisplay || !requestMeta || !apiKey) return
    const taskId = String(initialTask?.id || initialPayload?.id || initialPayload?.task_id || '').trim()
    if (!taskId) return
  
    const record = sessionRecord || getMemorySessionForMessage(assistantDisplay)
    const requestHandle = new AbortController()
    const abortState = createRequestAbortStateForMediaResume(requestHandle)
    detachedMediaAbortStates.add(abortState)
    setMediaTaskResuming(assistantDisplay, 'video', true)
    record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1
    if (stateSnapshot && typeof stateSnapshot === 'object') record.state = deepCopyJson(stateSnapshot, {})
  
    void (async () => {
      try {
        const resolvedPayload = await waitForVideoGenerationResult({
          initialPayload,
          requestMeta,
          apiKey,
          signal: requestHandle.signal,
          abortState,
          timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
          onStatus: (_payload, taskState) => {
            if (!isDisplayMessageTracked(assistantDisplay)) {
              abortState.abort()
              return
            }
            if (!taskState) return
            const nextTask = {
              ...(assistantDisplay.videoTask || {}),
              ...taskState,
              id: taskState.id || assistantDisplay.videoTask?.id || taskId,
              startedAt,
              lastPolledAt: Date.now()
            }
            applyVideoGenerationTaskToDisplay(assistantDisplay, nextTask, placeholderMode)
          }
        })
  
        if (!isDisplayMessageTracked(assistantDisplay)) return
  
        if (!resolvedPayload) {
          assistantDisplay.videoTask = {
            ...(assistantDisplay.videoTask || {}),
            id: taskId,
            status: 'processing',
            stage: 'polling',
            startedAt,
            note: '视频任务仍在生成中，稍后可继续轮询。'
          }
          applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
          setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask))
          return
        }
  
        const generationTimeMs = Math.max(0, Date.now() - startedAt)
        const videos = await persistChatMediaListAssets(
          extractChatVideosFromToolResult(resolvedPayload).map((video) => ({
            ...video,
            generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
          })),
          { kind: 'video', messageId: assistantDisplay.id }
        )
        if (!videos.length) {
          const textResult = extractImageGenerationTextResult(resolvedPayload)
          if (textResult) {
            applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
            setAssistantApiContentForDisplay(assistantDisplay, textResult)
            return
          }
          throw new Error(buildVideoGenerationCompatibilityError(resolvedPayload, requestMeta))
        }
  
        applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
        setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationApiSummary({ videoCount: videos.length }))
        message.success('视频生成完成')
      } catch (err) {
        if (!isDisplayMessageTracked(assistantDisplay)) return
        if (abortState.aborted || isAbortError(err)) {
          assistantDisplay.videoTask = {
            ...(assistantDisplay.videoTask || {}),
            id: taskId,
            status: 'processing',
            stage: 'polling',
            startedAt,
            note: '已停止自动轮询，稍后可继续轮询。'
          }
          applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
          setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask))
        } else {
          const errorText = err?.message || String(err)
          applyMediaGenerationFailureToDisplay(assistantDisplay, errorText)
          message.error(assistantDisplay.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '视频轮询失败')
        }
      } finally {
        detachedMediaAbortStates.delete(abortState)
        record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
        if (isDisplayMessageTracked(assistantDisplay)) {
          setMediaTaskResuming(assistantDisplay, 'video', false)
          void autoPersistMemorySessionWhenIdle(record)
          if (isDisplayMessageInActiveSession(assistantDisplay)) await scrollToBottom()
        }
      }
    })()
  }
  
  async function resolveVideoGenerationContentIfReady({
    payload,
    requestMeta,
    apiKey,
    signal,
    abortState = null,
    assistantDisplay = null,
    startedAt = Date.now(),
    placeholderMode = 'text'
  }) {
    if (!shouldFetchVideoGenerationContent(payload, requestMeta)) return payload
  
    const resolvedPayload = await waitForVideoGenerationResult({
      initialPayload: payload,
      requestMeta,
      apiKey,
      signal,
      abortState,
      timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
      initialPollDelayMs: 0,
      onStatus: (_payload, taskState) => {
        if (!taskState || !assistantDisplay) return
        const nextTask = {
          ...(assistantDisplay.videoTask || {}),
          ...taskState,
          startedAt,
          lastPolledAt: Date.now(),
          note: taskState.stage === 'fetching_result'
            ? '视频已生成，正在获取视频文件。'
            : taskState.note || '视频正在生成中，结果就绪后会展示在这里。'
        }
        applyVideoGenerationTaskToDisplay(assistantDisplay, nextTask, placeholderMode)
      }
    })
  
    return resolvedPayload || payload
  }
  
  async function runVideoGenerationRound({
    providerId = '',
    baseUrl,
    apiKey,
    model,
    signal,
    setCurrentAssistantDisplay,
    abortState = null,
    placeholderMode = 'text',
    requestOptionsOverride = null
  }) {
    const targetSession = getRunSessionTarget(abortState)
    throwIfAborted(abortState)
    const lastUserApiMsg = (() => {
      for (let i = (targetSession.apiMessages || []).length - 1; i >= 0; i--) {
        if (targetSession.apiMessages[i]?.role === 'user') return targetSession.apiMessages[i]
      }
      return null
    })()
  
    const userPrompt = extractImageGenerationPromptFromContent(lastUserApiMsg?.content).trim()
    if (!userPrompt) {
      throw new Error('视频生成提示词为空')
    }
  
    const requestOptions =
      requestOptionsOverride && typeof requestOptionsOverride === 'object'
        ? buildVideoGenerationRequestOptionsWithReferences(requestOptionsOverride)
        : {}
    const requestInfo = placeholderMode === 'video' ? buildManualVideoGenerationRequestInfo(requestOptions) : ''
    const startedAt = Date.now()
    const assistantDisplay = createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
    attachMediaRequestSnapshot(assistantDisplay, 'video', buildMediaRequestSnapshot('video', {
      baseUrl,
      model,
      prompt: userPrompt,
      requestOptions,
      placeholderMode,
      startedAt
    }))
    targetSession.messages.push(assistantDisplay)
    setCurrentAssistantDisplay(assistantDisplay)
    await maybeScrollToBottomForRun(abortState)
  
    const prompt = buildVideoGenerationPromptFromHistory(userPrompt, { apiMessages: targetSession.apiMessages })
    const { payload, requestMeta } = await requestVideoGeneration({
      baseUrl,
      apiKey,
      model,
      prompt,
      requestOptions,
      signal
    })
    attachMediaRequestSnapshot(assistantDisplay, 'video', { requestMeta })
    recordModelUsageFromPayload(payload, {
      providerId,
      model,
      endpoint: requestMeta?.kind || 'video-generation',
      purpose: 'video-generation'
    })
    throwIfAborted(abortState)
  
    let finalPayload = payload
    const videoTask = extractVideoGenerationTaskState(payload, requestMeta)
    if (videoTask) {
      applyVideoGenerationTaskToDisplay(assistantDisplay, { ...videoTask, startedAt }, placeholderMode)
      targetSession.apiMessages.push({
        role: 'assistant',
        content:
          placeholderMode === 'video'
            ? `视频任务已受理：${assistantVideoTaskStatusLabel(assistantDisplay)}${videoTask.id ? `（任务 ID：${videoTask.id}）` : ''}`
            : buildVideoGenerationPendingText(videoTask)
      })
      assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
      setCurrentAssistantDisplay(null)
      await maybeScrollToBottomForRun(abortState)
      startDetachedVideoTaskPolling({
        assistantDisplay,
        initialPayload: payload,
        requestMeta,
        apiKey,
        startedAt,
        placeholderMode,
        userPrompt,
        initialTask: videoTask,
        sessionRecord: targetSession,
        stateSnapshot: targetSession?.state || null
      })
      return
    }
  
    finalPayload = await resolveVideoGenerationContentIfReady({
      payload: finalPayload,
      requestMeta,
      apiKey,
      signal,
      abortState,
      assistantDisplay,
      startedAt,
      placeholderMode
    })
    throwIfAborted(abortState)
  
    const generationTimeMs = Math.max(0, Date.now() - startedAt)
    const videos = await persistChatMediaListAssets(
      extractChatVideosFromToolResult(finalPayload).map((video) => ({
        ...video,
        generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
      })),
      { kind: 'video', messageId: assistantDisplay.id }
    )
    const textResult = extractImageGenerationTextResult(finalPayload)
    if (!videos.length) {
      if (textResult) {
        applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
        targetSession.apiMessages.push({
          role: 'assistant',
          content: textResult
        })
        assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
        setCurrentAssistantDisplay(null)
        await maybeScrollToBottomForRun(abortState)
        return
      }
      throw new Error(buildVideoGenerationCompatibilityError(finalPayload, requestMeta))
    }
  
    applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
    targetSession.apiMessages.push({
      role: 'assistant',
      content: buildVideoGenerationApiSummary({
        videoCount: videos.length
      })
    })
    assistantDisplay.apiIndex = targetSession.apiMessages.length - 1
    setCurrentAssistantDisplay(null)
    await maybeScrollToBottomForRun(abortState)
  }
  
  async function runDetachedVideoGenerationRequest({
    record,
    assistantDisplay,
    baseUrl,
    apiKey,
    model,
    userPrompt,
    requestOptions,
    placeholderMode,
    startedAt,
    stateSnapshot
  }) {
    if (!record || !assistantDisplay) return
    const requestHandle = new AbortController()
    const abortState = createRequestAbortStateForMediaResume(requestHandle)
    detachedMediaAbortStates.add(abortState)
    record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1
    record.state = stateSnapshot && typeof stateSnapshot === 'object' ? deepCopyJson(stateSnapshot, {}) : record.state
  
    try {
      const { payload, requestMeta } = await requestVideoGeneration({
        baseUrl,
        apiKey,
        model,
        prompt: userPrompt,
        requestOptions,
        signal: requestHandle.signal
      })
      attachMediaRequestSnapshot(assistantDisplay, 'video', { requestMeta })
      if (abortState.aborted) throw createAbortError()
  
      const videoTask = extractVideoGenerationTaskState(payload, requestMeta)
      if (videoTask) {
        applyVideoGenerationTaskToDisplay(assistantDisplay, { ...videoTask, startedAt }, placeholderMode)
        setAssistantApiContentForDisplay(
          assistantDisplay,
          placeholderMode === 'video'
            ? `视频任务已受理：${assistantVideoTaskStatusLabel(assistantDisplay)}${videoTask.id ? `（任务 ID：${videoTask.id}）` : ''}`
            : buildVideoGenerationPendingText(videoTask),
          record
        )
        startDetachedVideoTaskPolling({
          assistantDisplay,
          initialPayload: payload,
          requestMeta,
          apiKey,
          startedAt,
          placeholderMode,
          userPrompt,
          initialTask: videoTask,
          sessionRecord: record,
          stateSnapshot
        })
        return
      }
  
      const finalPayload = await resolveVideoGenerationContentIfReady({
        payload,
        requestMeta,
        apiKey,
        signal: requestHandle.signal,
        abortState,
        assistantDisplay,
        startedAt,
        placeholderMode
      })
      if (abortState.aborted) throw createAbortError()
  
      const generationTimeMs = Math.max(0, Date.now() - startedAt)
      const videos = await persistChatMediaListAssets(
        extractChatVideosFromToolResult(finalPayload).map((video) => ({
          ...video,
          generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
        })),
        { kind: 'video', messageId: assistantDisplay.id }
      )
      if (!videos.length) {
        const textResult = extractImageGenerationTextResult(finalPayload)
        if (textResult) {
          applyVideoGenerationTextToDisplay(assistantDisplay, textResult)
          setAssistantApiContentForDisplay(assistantDisplay, textResult, record)
          return
        }
        throw new Error(buildVideoGenerationCompatibilityError(finalPayload, assistantDisplay?.mediaRequest?.requestMeta))
      }
  
      applyVideoGenerationVideosToDisplay(assistantDisplay, { videos, userPrompt })
      setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationApiSummary({ videoCount: videos.length }), record)
      message.success('视频生成完成')
    } catch (err) {
      if (abortState.aborted || isAbortError(err)) {
        assistantDisplay.videoTask = {
          ...(assistantDisplay.videoTask || {}),
          status: 'processing',
          stage: 'polling',
          startedAt,
          note: '已停止自动轮询，稍后可继续轮询。'
        }
        applyVideoGenerationTaskToDisplay(assistantDisplay, assistantDisplay.videoTask, placeholderMode)
        setAssistantApiContentForDisplay(assistantDisplay, buildVideoGenerationPendingText(assistantDisplay.videoTask), record)
      } else {
        const errorText = err?.message || String(err)
        applyMediaGenerationFailureToDisplay(assistantDisplay, errorText)
        message.error(assistantDisplay.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '视频生成失败')
      }
    } finally {
      detachedMediaAbortStates.delete(abortState)
      record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
      record.updatedAt = Date.now()
      void autoPersistMemorySessionWhenIdle(record)
      if (isDisplayMessageInActiveSession(assistantDisplay)) await scrollToBottom()
    }
  }
  
  async function startDetachedVideoGeneration({ cfg, text, attachments = [], userDisplay, sourceMessage = null }) {
    const record = getActiveMemorySession()
    const stateSnapshot = buildCurrentChatState()
    record.state = deepCopyJson(stateSnapshot, {})
    const referenceImages = await collectAttachmentMediaReferenceImages(attachments, userDisplay)
    clearAttachmentFileReferences(attachments)
  
    const promptText = String(text || '').trim()
    const userPrompt = extractImageGenerationPromptFromContent(promptText).trim()
    if (!userPrompt) {
      message.warning('视频生成提示词为空')
      return false
    }
  
    const apiContent = promptText || userPrompt
    record.apiMessages.push({ role: 'user', content: apiContent })
    userDisplay.apiIndex = record.apiMessages.length - 1
  
    const placeholderMode = String(cfg.videoGenerationPlaceholderMode || getMediaRequestPlaceholderMode(sourceMessage, 'video') || 'video')
    const rawVideoRequestOptions = mergeReferenceImagesIntoRequestOptions(
      cfg.videoGenerationRequestOptionsOverride && typeof cfg.videoGenerationRequestOptionsOverride === 'object'
        ? cfg.videoGenerationRequestOptionsOverride
        : {},
      referenceImages,
      'video'
    )
    const requestOptions = buildVideoGenerationRequestOptionsWithReferences(rawVideoRequestOptions)
    const requestInfo = placeholderMode === 'video' ? buildManualVideoGenerationRequestInfo(requestOptions) : ''
    const startedAt = Date.now()
    const assistantDisplay = createVideoGenerationPlaceholderDisplay(userPrompt, placeholderMode, { requestInfo })
    attachMediaRequestSnapshot(assistantDisplay, 'video', buildMediaRequestSnapshot('video', {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      prompt: userPrompt,
      requestOptions,
      placeholderMode,
      startedAt
    }))
    record.messages.push(assistantDisplay)
    record.updatedAt = Date.now()
    if (!isFinalizedMemorySessionTitle(record)) record.title = resolveMemorySessionTitle(record)
    scheduleRefreshUserAnchorMeta()
    if (isMemorySessionActive(record)) await scrollToBottom({ force: true })
    void runDetachedVideoGenerationRequest({
      record,
      assistantDisplay,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      userPrompt,
      requestOptions,
      placeholderMode,
      startedAt,
      stateSnapshot
    })
    return true
  }
  
  function getMediaRequestPrompt(msg, kind = 'image') {
    const direct = kind === 'video' ? msg?.videoPrompt : msg?.imagePrompt
    return String(direct || msg?.mediaRequest?.prompt || '').trim()
  }
  
  function getMediaRequestPlaceholderMode(msg, kind = 'image') {
    const mode = String(msg?.mediaRequest?.placeholderMode || '').trim()
    if (mode) return mode
    return kind === 'video' ? 'video' : 'image'
  }
  
  function getImageRequestOptionsFromMessage(msg) {
    if (msg?.mediaRequest?.requestOptions && typeof msg.mediaRequest.requestOptions === 'object') {
      return buildImageGenerationRequestOptionsWithReferences(deepCopyJson(msg.mediaRequest.requestOptions, {}))
    }
    const firstImage = Array.isArray(msg?.images) ? msg.images.find((img) => img && typeof img === 'object') : null
    const requestSize = String(firstImage?.requestSize || '').trim()
    return requestSize ? { size: requestSize } : {}
  }
  
  function getVideoRequestOptionsFromMessage(msg) {
    if (msg?.mediaRequest?.requestOptions && typeof msg.mediaRequest.requestOptions === 'object') {
      return buildVideoGenerationRequestOptionsWithReferences(deepCopyJson(msg.mediaRequest.requestOptions, {}))
    }
    const firstVideo = Array.isArray(msg?.videos) ? msg.videos.find((video) => video && typeof video === 'object') : null
    const requestSize = String(firstVideo?.requestSize || firstVideo?.resolution || '').trim()
    return requestSize ? { size: requestSize } : {}
  }
  
  function canRegenerateMedia(msg, kind = 'image') {
    if (sending.value || preparingSend.value) return false
    return !!getMediaRequestPrompt(msg, kind)
  }
  
  function mediaTaskResumeKey(msg, kind = 'video') {
    const task = kind === 'video' ? msg?.videoTask : msg?.imageTask
    return `${kind}:${String(msg?.id || '').trim()}:${String(task?.id || '').trim()}`
  }
  
  function isMediaTaskResuming(msg, kind = 'video') {
    const key = mediaTaskResumeKey(msg, kind)
    return !!key && resumingMediaTaskKeys.value.includes(key)
  }
  
  function setMediaTaskResuming(msg, kind = 'video', next = false) {
    const key = mediaTaskResumeKey(msg, kind)
    if (!key) return
    const current = new Set(resumingMediaTaskKeys.value)
    if (next) current.add(key)
    else current.delete(key)
    resumingMediaTaskKeys.value = Array.from(current)
  }
  
  function getVideoResumeRequestMeta(msg) {
    const meta = msg?.mediaRequest?.requestMeta
    if (meta && typeof meta === 'object' && String(meta.baseEndpoint || '').trim()) return meta
    return null
  }
  
  function canResumeMediaTask(msg, kind = 'video') {
    if (kind !== 'video' || preparingSend.value || isMediaTaskResuming(msg, kind)) return false
    if (assistantVisibleVideoCount(msg)) return false
    const task = msg?.videoTask
    const taskId = String(task?.id || '').trim()
    if (!taskId) return false
    const status = String(task?.status || task?.stage || '').trim().toLowerCase()
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return false
    return !!getVideoResumeRequestMeta(msg)
  }
  
  function countResumableMediaTasks() {
    return (session.messages || []).filter((msg) => canResumeMediaTask(msg, 'video')).length
  }
  
  function findOpenaiCompatibleProviderByBaseUrl(baseUrl) {
    const target = getCompatKey(baseUrl)
    if (!target) return null
    return (providers.value || []).find((provider) => {
      if (!provider || isUtoolsBuiltinProvider(provider)) return false
      return getCompatKey(provider.baseurl) === target
    }) || null
  }
  
  function getOpenaiCompatibleMediaConfigOrHint(kind = 'image', sourceMessage = null, options = {}) {
    const savedBaseUrl = String(sourceMessage?.mediaRequest?.baseUrl || '').trim()
    const savedProvider = savedBaseUrl ? findOpenaiCompatibleProviderByBaseUrl(savedBaseUrl) : null
    if (savedBaseUrl && !savedProvider && options.requireSavedProvider) {
      message.warning('当前配置中找不到该任务的原服务商，请切回或重新配置相同接口地址后再继续轮询。')
      return null
    }
    if (savedBaseUrl && !savedProvider && !options.silentFallback) {
      message.warning('未找到原服务商配置，已改用当前服务商再次生成。')
    }
  
    const provider = savedProvider || selectedProvider.value
    if (!provider) {
      message.warning('请先选择服务商 / 模型')
      showModelModal.value = true
      return null
    }
  
    if (isUtoolsBuiltinProvider(provider)) {
      message.warning('当前页面不支持用 uTools 内置 AI 直接恢复或再次生成媒体，请改用兼容 OpenAI 的服务商。')
      return null
    }
  
    const baseUrl = String(provider.baseurl || '').trim()
    const apiKey = String(provider.apikey || '').trim()
    const providerDefaultModel = Array.isArray(provider.selectModels) ? String(provider.selectModels[0] || '').trim() : ''
    const selectedModelForProvider = String(provider._id || '').trim() === String(selectedProviderId.value || '').trim()
      ? String(selectedModel.value || '').trim()
      : ''
    const model = String(
      savedProvider
        ? sourceMessage?.mediaRequest?.model || selectedModelForProvider || providerDefaultModel
        : selectedModel.value
    ).trim()
    if (!baseUrl || !apiKey) {
      message.warning('请先配置服务商接口地址 / API 密钥')
      return null
    }
    if (!model) {
      message.warning('请先选择模型')
      showModelModal.value = true
      return null
    }
  
    return {
      providerKind: 'openai-compatible',
      providerId: String(provider._id || '').trim(),
      baseUrl,
      apiKey,
      model,
      requestMode: kind === 'video' ? 'video-generation' : 'image-generation',
      imageGenerationPlaceholderMode: kind === 'image' ? 'image' : 'text',
      videoGenerationPlaceholderMode: kind === 'video' ? 'video' : 'text',
      supportsVision: false
    }
  }
  
  async function submitMediaGenerationPrompt(kind, prompt, sourceMessage = null) {
    if (sending.value || preparingSend.value) return
    const text = String(prompt || '').trim()
    if (!text) {
      message.warning(kind === 'video' ? '视频生成提示词为空' : '图片生成提示词为空')
      return
    }
  
    const cfg = getOpenaiCompatibleMediaConfigOrHint(kind, sourceMessage)
    if (!cfg) return
  
    clearAllUserEditingState()
    const placeholderMode = getMediaRequestPlaceholderMode(sourceMessage, kind)
    if (kind === 'video') {
      cfg.videoGenerationPlaceholderMode = placeholderMode
      cfg.videoGenerationRequestOptionsOverride = getVideoRequestOptionsFromMessage(sourceMessage)
    } else {
      cfg.imageGenerationPlaceholderMode = placeholderMode
      cfg.imageGenerationRequestOptionsOverride = getImageRequestOptionsFromMessage(sourceMessage)
    }
  
    const userDisplay = createDisplayMessage('user', text)
    session.messages.push(userDisplay)
    const requestRecord = getActiveMemorySession()
    autoScrollEnabled.value = true
    scheduleRefreshUserAnchorMeta()
    await scrollToBottom({ force: true })
    if (kind === 'video') {
      await startDetachedVideoGeneration({ cfg, text, attachments: [], userDisplay, sourceMessage })
      return
    }
    await runChatSession({
      ...cfg,
      sessionRecord: requestRecord,
      prepare: async () => {
        if (isMemorySessionActive(requestRecord)) await scrollToBottom({ force: true })
        await prepareUserApiMessage({
          text,
          attachments: [],
          userDisplay,
          preferVision: false,
          providerKind: 'openai-compatible',
          sessionTarget: requestRecord
        })
      }
    })
  }
  
  function regenerateMedia(msg, kind = 'image') {
    const prompt = getMediaRequestPrompt(msg, kind)
    if (!prompt) {
      message.warning(kind === 'video' ? '没有可复用的视频提示词' : '没有可复用的图片提示词')
      return
    }
    showMediaLibraryModal.value = false
    void submitMediaGenerationPrompt(kind, prompt, msg)
  }
  
  function setAssistantApiContentForDisplay(msg, content, sessionLike = null) {
    if (!msg) return
    const targetSession = sessionLike || getMemorySessionForMessage(msg) || session
    const text = String(content || '').trim()
    const apiIndex = Number(msg.apiIndex)
    if (Number.isFinite(apiIndex) && apiIndex >= 0 && targetSession.apiMessages?.[apiIndex]?.role === 'assistant') {
      targetSession.apiMessages[apiIndex].content = text
      return
    }
    targetSession.apiMessages.push({ role: 'assistant', content: text })
    msg.apiIndex = targetSession.apiMessages.length - 1
  }
  
  function extractMediaFailureReasonLine(errorText) {
    const raw = String(errorText || '').trim()
    if (!raw) return ''
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const reasonLine = lines.find((line) => /^原因[：:]/.test(line))
    if (reasonLine) return reasonLine
  
    const messageLine = lines.find((line) => /^(错误信息|错误消息|Error message|Message)[：:]/i.test(line))
    const codeLine = lines.find((line) => /^(错误码|错误代码|Error code|Code)[：:]/i.test(line))
    if (messageLine && codeLine) return `${codeLine}，${messageLine}`
    if (messageLine) return messageLine
    if (codeLine) return codeLine
  
    const diagnosticLine = lines.find((line) =>
      /moderation_blocked|moderation system|content safety|blocked by|rate limit|insufficient_quota|quota|unauthorized|forbidden|invalid|unsupported|not found|timeout|审核|拦截|限流|额度|余额|权限|不支持|不存在|超时/i.test(line)
    )
    return diagnosticLine || lines[0] || raw
  }
  
  function mediaFailureSummary(errorText, kind = 'image') {
    const reason = extractMediaFailureReasonLine(errorText) || '未知错误'
    const label = kind === 'video' ? '视频生成失败' : '图片生成失败'
    return `${label}：${truncateInlineText(reason, 260)}`
  }
  
  function mediaFailureSuggestion(errorText, kind = 'image') {
    const raw = String(errorText || '').trim()
    const lower = raw.toLowerCase()
    if (lower.includes('moderation_blocked') || lower.includes('moderation system') || lower.includes('content safety') || raw.includes('内容安全审核') || raw.includes('审核系统') || raw.includes('拦截')) {
      return kind === 'video'
        ? '请求被内容安全审核拦截，服务端不会返回可展示的视频文件。可以调整提示词或参考图后重试。'
        : '请求被内容安全审核拦截，服务端不会返回可展示的图片文件。可以调整提示词或参考图后重试。'
    }
    if (lower.includes('timeout') || raw.includes('超时')) return '请求已超时，没有自动回退。可以稍后重试，或检查服务商任务是否仍在后台生成。'
    if (lower.includes('429') || lower.includes('rate limit') || raw.includes('限流') || raw.includes('请求过多')) return '请求被服务商限流。可以稍后重试，或降低并发生成数量。'
    if (lower.includes('insufficient_quota') || lower.includes('quota') || raw.includes('额度') || raw.includes('余额')) return '请检查当前服务商账户额度、计费状态和模型权限。'
    if (lower.includes('401') || lower.includes('403') || raw.includes('密钥')) return '请检查当前服务商 API Key、模型权限和账户额度。'
    if (kind === 'image' && lower.includes('tool choice') && lower.includes('image_generation') && lower.includes('tools')) {
      return '当前服务商不兼容 Responses API 的图片生成工具调用，通常是中转站没有透传 tools 或不支持内置 image_generation 工具。建议切换到官方接口，或确认该服务商支持 /v1/images 与 /v1/responses 图片生成。'
    }
    if (lower.includes('404') || lower.includes('405') || raw.includes('接口不存在')) return kind === 'video'
      ? '当前服务商的视频接口可能不兼容，可以切换模型/服务商或改用普通聊天。'
      : '当前服务商的图片接口可能不兼容，可以切换模型/服务商或改用普通聊天。'
    return '可以直接重试；如果连续失败，建议切换模型/服务商或复制错误信息排查。'
  }
  
  function applyMediaGenerationFailureToDisplay(assistantDisplay, errorText) {
    if (!assistantDisplay || typeof assistantDisplay !== 'object') return false
    const kind = String(assistantDisplay.mediaRequest?.kind || (assistantDisplay.videoPrompt ? 'video' : assistantDisplay.imagePrompt ? 'image' : '')).trim()
    if (kind !== 'image' && kind !== 'video') return false
  
    const summary = mediaFailureSummary(errorText, kind)
    const suggestion = mediaFailureSuggestion(errorText, kind)
    const note = `${summary}\n${suggestion}`
    assistantDisplay.streaming = false
    assistantDisplay.render = 'text'
    assistantDisplay.transientRequestPlaceholder = false
    assistantDisplay.mediaFailure = {
      kind,
      summary,
      errorText: String(errorText || '').trim(),
      suggestion
    }
  
    const startedAt = Number(assistantDisplay.mediaRequest?.startedAt || 0) || Date.now()
    if (kind === 'video') {
      assistantDisplay.videoTask = {
        ...(assistantDisplay.videoTask || {}),
        status: 'failed',
        stage: 'failed',
        note,
        startedAt
      }
      if (getMediaRequestPlaceholderMode(assistantDisplay, kind) === 'video') {
        assistantDisplay.content = ''
        assistantDisplay.videoBubblePlaceholder = true
        assistantDisplay.videoBubblePlaceholderItem = createAssistantVideoBubblePlaceholder(note, assistantDisplay.videoRequestInfo || '')
      } else {
        assistantDisplay.videoBubblePlaceholder = false
        assistantDisplay.videoBubblePlaceholderItem = null
        assistantDisplay.content = ''
      }
    } else {
      assistantDisplay.imageTask = {
        ...(assistantDisplay.imageTask || {}),
        status: 'failed',
        stage: 'failed',
        note,
        startedAt
      }
      if (getMediaRequestPlaceholderMode(assistantDisplay, kind) === 'image') {
        assistantDisplay.content = ''
        assistantDisplay.imageBubblePlaceholder = true
        assistantDisplay.imageBubblePlaceholderImage = createAssistantImageBubblePlaceholder(note, assistantDisplay.imageRequestInfo || '')
      } else {
        assistantDisplay.imageBubblePlaceholder = false
        assistantDisplay.imageBubblePlaceholderImage = null
        assistantDisplay.content = ''
      }
    }
  
    setAssistantApiContentForDisplay(assistantDisplay, note)
    return true
  }
  
  function createRequestAbortStateForMediaResume(requestHandle) {
    const abortListeners = new Set()
    const abortState = {
      aborted: false,
      onAbort(listener) {
        if (typeof listener !== 'function') return () => {}
        if (abortState.aborted) {
          try {
            listener()
          } catch {
            // ignore
          }
          return () => {}
        }
        abortListeners.add(listener)
        return () => abortListeners.delete(listener)
      },
      abort() {
        if (abortState.aborted) return
        abortState.aborted = true
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
    return abortState
  }
  
  async function resumeMediaTask(msg, kind = 'video') {
    if (kind !== 'video') return
    if (preparingSend.value) return
    if (!canResumeMediaTask(msg, kind)) {
      message.warning('当前视频任务缺少可恢复的轮询信息')
      return
    }
  
    const cfg = getOpenaiCompatibleMediaConfigOrHint(kind, msg, { requireSavedProvider: true })
    if (!cfg) return
  
    const requestMeta = getVideoResumeRequestMeta(msg)
    const task = msg.videoTask || {}
    const taskId = String(task.id || '').trim()
    const requestHandle = new AbortController()
    const abortState = createRequestAbortStateForMediaResume(requestHandle)
    const startedAt = Number(task.startedAt || msg.mediaRequest?.startedAt || 0) || Date.now()
    const placeholderMode = getMediaRequestPlaceholderMode(msg, kind)
    const record = getMemorySessionForMessage(msg)
  
    setMediaTaskResuming(msg, kind, true)
    detachedMediaAbortStates.add(abortState)
    record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0)) + 1
  
    try {
      msg.videoTask = {
        ...task,
        id: taskId,
        status: String(task.status || 'processing').trim() || 'processing',
        stage: 'polling',
        startedAt,
        note: task.note || '正在继续查询视频任务，结果就绪后会展示在这里。'
      }
      applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
      if (isDisplayMessageInActiveSession(msg)) await scrollToBottom()
  
      const resolvedPayload = await waitForVideoGenerationResult({
        initialPayload: { id: taskId, status: msg.videoTask.status || 'processing' },
        requestMeta,
        apiKey: cfg.apiKey,
        signal: requestHandle.signal,
        abortState,
        timeoutMs: VIDEO_GENERATION_RESULT_TIMEOUT_MS,
        initialPollDelayMs: 0,
        onStatus: (_payload, taskState) => {
          if (!taskState) return
          msg.videoTask = {
            ...(msg.videoTask || {}),
            ...taskState,
            id: taskState.id || taskId,
            startedAt,
            lastPolledAt: Date.now()
          }
          applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
        }
      })
  
      if (!resolvedPayload) {
        msg.videoTask = {
          ...(msg.videoTask || {}),
          id: taskId,
          status: 'processing',
          stage: 'polling',
          startedAt,
          note: '视频任务仍在生成中，稍后可继续轮询。'
        }
        applyVideoGenerationTaskToDisplay(msg, msg.videoTask, placeholderMode)
        setAssistantApiContentForDisplay(msg, buildVideoGenerationPendingText(msg.videoTask))
        message.info('视频任务仍在生成中，稍后可继续轮询。')
        return
      }
  
      const generationTimeMs = Math.max(0, Date.now() - startedAt)
      const videos = await persistChatMediaListAssets(
        extractChatVideosFromToolResult(resolvedPayload).map((video) => ({
          ...video,
          generationTimeMs: Number(video.generationTimeMs || 0) || generationTimeMs
        })),
        { kind: 'video', messageId: msg.id }
      )
      if (!videos.length) {
        const textResult = extractImageGenerationTextResult(resolvedPayload)
        if (textResult) {
          applyVideoGenerationTextToDisplay(msg, textResult)
          setAssistantApiContentForDisplay(msg, textResult)
          return
        }
        throw new Error(buildVideoGenerationCompatibilityError(resolvedPayload, requestMeta))
      }
  
      applyVideoGenerationVideosToDisplay(msg, {
        videos,
        userPrompt: getMediaRequestPrompt(msg, 'video')
      })
      setAssistantApiContentForDisplay(msg, buildVideoGenerationApiSummary({ videoCount: videos.length }))
      message.success('视频结果已恢复')
    } catch (err) {
      if (abortState.aborted || isAbortError(err)) {
        message.info('已停止继续轮询视频任务')
      } else {
        const errorText = err?.message || String(err)
        applyMediaGenerationFailureToDisplay(msg, errorText)
        message.error(msg.mediaFailure?.summary || mediaFailureSummary(errorText, 'video') || '继续轮询失败')
      }
    } finally {
      detachedMediaAbortStates.delete(abortState)
      record.runningTaskCount = Math.max(0, Number(record.runningTaskCount || 0) - 1)
      setMediaTaskResuming(msg, kind, false)
      void autoPersistMemorySessionWhenIdle(record)
      if (isDisplayMessageInActiveSession(msg)) await scrollToBottom()
    }
  }

  return {
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
  }
}
