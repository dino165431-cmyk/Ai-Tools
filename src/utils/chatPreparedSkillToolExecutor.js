import { readSkillFile as readSkillRegistryFile, runSkillScript as runSkillRegistryScript } from './configListener.js'
import { discoverBuiltinSkillActions } from './chatSkillTooling.js'
import {
  formatToolResultDisplayContent,
  inferStructuredToolResultStatus,
  isAgentRunToolResult
} from './chatToolDisplay.js'
import { isDirectorySkill } from './skillUtils.js'
import { createAbortError, isAbortError, throwIfAborted, waitForAbortable } from './abortableRequest.js'
import { stableStringify } from './chatProviderStreaming.js'
import { stringifyToolResultForModel as stringifyToolResultForLlm } from './toolResultForModel.js'
import { truncateInlineText } from './chatAttachmentUtils.js'

const INTERNAL_SKILL_TOOL_NAMES = new Set([
  'skill_discover',
  'web_search',
  'web_read',
  'read_skill_file',
  'run_skill_script',
  'use_skill',
  'use_skills'
])

function shouldHandlePreparedSkillTool(mapping) {
  if (mapping?.type === 'skill') return true
  if (mapping?.type !== 'internal') return false
  if (mapping.internal === 'skill_call') return Boolean(mapping.gatewayError)
  return INTERNAL_SKILL_TOOL_NAMES.has(mapping.internal)
}

export function createPreparedSkillToolExecutor(runtime) {
  const {
    activatedAgentSkillIds,
    agentSkillIdSet,
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
    listSelectedSkillsBrief,
    loadSkillMainContent,
    loadedSkillContentById,
    loadedSkillFileCacheBySkillId,
    markSkillActivationPersistent,
    maybeScrollToBottomForRun,
    mcpServers,
    prepareBuiltinAgentToolCallArgs,
    readSkillRegistryFile: readSkillRegistryFileOverride,
    resolveSelectedSkillTarget,
    resolveSkillScriptTarget,
    runSkillRegistryScript: runSkillRegistryScriptOverride,
    searchCapabilities,
    selectedSkillObjects
  } = runtime
  const readSkillFile = readSkillRegistryFileOverride || readSkillRegistryFile
  const runSkillScript = runSkillRegistryScriptOverride || runSkillRegistryScript

  function persistUsedSkill(skillId) {
    const id = String(skillId || '').trim()
    if (id) markSkillActivationPersistent?.([id])
  }

  async function executePreparedSkillTool(prepared, executionContext, abortState = null) {
    const {
      mapping,
      serverName,
      toolName,
      argsObj,
      pendingToolMessage
    } = prepared || {}
    const { targetSession, createCurrentToolResultMessage } = executionContext

    if (mapping?.type === 'internal' && mapping.internal === 'skill_call' && mapping.gatewayError) {
      const errorText = String(mapping.gatewayError || 'Skill Action 解析失败')
      targetSession.messages.push(
        createCurrentToolResultMessage(`### Skill 动作结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      await maybeScrollToBottomForRun(abortState)
      return {
        ok: false,
        content: stableStringify({
          ok: false,
          error: errorText,
          ...(mapping.gatewayDetails && typeof mapping.gatewayDetails === 'object'
            ? mapping.gatewayDetails
            : {})
        })
      }
    }

    if (mapping?.type === 'internal' && mapping.internal === 'skill_discover') {
      try {
        persistUsedSkill(argsObj?.skill_id ?? argsObj?.skillId ?? argsObj?.id)
        const result = await waitForAbortable(
          discoverBuiltinSkillActions({
            selectedSkills: selectedSkillObjects.value,
            catalog: builtinSkillActionCatalog,
            args: argsObj,
            searchCapabilities
          }),
          abortState
        )
        throwIfAborted(abortState)
        const resultText = stableStringify(result)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### Skill 动作发现\n\n\`\`\`json\n${resultText}\n\`\`\``, {
            toolMeta: `${serverName} / ${toolName}`,
            toolName,
            toolServerName: serverName,
            toolExpanded: false
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: result?.ok !== false, content: resultText, serverName, toolName }
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        const errorText = error?.message || String(error)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### Skill 动作发现\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: `错误：${errorText}` }
      }
    }

    if (mapping?.type === 'skill') {
      const skillsApi = getBuiltinSkillsApi()
      const skillId = String(mapping?.skillId || mapping?.serverId || '').trim()
      const skillName = String(mapping?.serverName || serverName || skillId).trim() || skillId
      try {
        if (!skillId || typeof skillsApi?.runAction !== 'function') {
          throw new Error('内置 Skill 动作 API 不可用')
        }
        persistUsedSkill(skillId)
        const callArgs = typeof mapping?.unwrapArgs === 'function' ? mapping.unwrapArgs(argsObj) : argsObj
        const runtimeArgs = prepareBuiltinAgentToolCallArgs(skillId, toolName, callArgs, pendingToolMessage)
        const hostWorkspacePath = String(runtimeArgs?.__host_workspace_path || '').trim()
        if (runtimeArgs && typeof runtimeArgs === 'object') {
          delete runtimeArgs.__host_workspace_path
        }
        throwIfAborted(abortState)
        if (hostWorkspacePath && typeof skillsApi.runActionWithHostContext !== 'function') {
          throw new Error('本机工作区能力尚未加载，请重载插件后重试')
        }
        const runActionPromise = hostWorkspacePath
          ? skillsApi.runActionWithHostContext(
              skillId,
              mapping.toolName,
              runtimeArgs,
              { hostWorkspacePath }
            )
          : skillsApi.runAction(skillId, mapping.toolName, runtimeArgs)
        const result = await waitForAbortable(
          Promise.resolve(runActionPromise),
          abortState
        )
        throwIfAborted(abortState)

        const resultStatus = inferStructuredToolResultStatus(result) || 'success'
        const resultOk = !['error', 'rejected', 'stopped'].includes(resultStatus)
        const images = extractChatImagesFromToolResult(result)
        const resultKind = String(result?.kind || '').trim()
        const toolResultPayload = (
          isAgentRunToolResult(result) ||
          resultKind.startsWith('sandbox_')
        )
          ? deepCopyJson(result, null)
          : null
        const resultText = stringifyToolResultForLlm(result)
        const imageHint = images.length ? `- 图片：${images.length}（已在上方预览；base64/dataUrl 已省略）\n` : ''
        const displayText = formatToolResultDisplayContent(result, {
          heading: '### Skill 动作结果',
          serverName: skillName,
          toolName,
          imageHint,
          resultText,
          truncateInlineText
        })
        targetSession.messages.push(
          createCurrentToolResultMessage(displayText, {
            toolMeta: `${skillName} / ${toolName}`,
            images,
            toolExpanded: false,
            toolName,
            toolServerName: skillName,
            toolSubMeta: buildToolExecutionResultSubMeta(result),
            toolResultPayload,
            toolStatus: resultStatus,
            toolTraceStreamId: String(pendingToolMessage?.toolTraceStreamId || '').trim(),
            toolAutoApproved: pendingToolMessage?.toolAutoApproved === true
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: resultOk, content: resultText, images, serverName: skillName, toolName }
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        const errorText = error?.message || String(error)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### Skill 动作结果\n- 动作：\`${toolName}\`\n- 错误：${errorText}`, {
            toolMeta: `${skillName} / ${toolName}`,
            toolTraceStreamId: String(pendingToolMessage?.toolTraceStreamId || '').trim(),
            toolAutoApproved: pendingToolMessage?.toolAutoApproved === true
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: `错误：${errorText}` }
      }
    }

    if (mapping?.type === 'internal' && (mapping.internal === 'web_search' || mapping.internal === 'web_read')) {
      try {
        const execution = await executeBuiltinWebTool({ mapping, argsObj, serverName, toolName, abortState })
        throwIfAborted(abortState)
        targetSession.messages.push(
          createCurrentToolResultMessage(
            execution.display || `### 联网工具结果\n\n\`\`\`json\n${execution.content || ''}\n\`\`\``,
            {
              toolMeta: `${serverName} / ${toolName}`,
              toolName,
              toolServerName: serverName,
              toolResultPayload: execution.payload || null,
              toolSubMeta: buildWebToolSubMeta(execution.payload)
            }
          )
        )
        await maybeScrollToBottomForRun(abortState)
        return execution
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        const errorText = error?.message || String(error)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### 联网工具结果\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: `错误：${errorText}` }
      }
    }

    if (mapping?.type === 'internal' && mapping.internal === 'read_skill_file') {
      const idCandidate = String(argsObj?.id ?? argsObj?._id ?? argsObj?.skillId ?? argsObj?.skill_id ?? '').trim()
      const pathCandidate = String(argsObj?.path ?? argsObj?.file ?? argsObj?.filePath ?? '').trim()
      const target = resolveSelectedSkillTarget({ idCandidate })

      if (!target?._id) {
        const errorText = `未找到要读取的技能文件。可用技能：${stableStringify(listSelectedSkillsBrief())}`
        targetSession.messages.push(
          createCurrentToolResultMessage(`### 技能文件读取结果\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: errorText }
      }
      if (!pathCandidate) {
        const errorText = 'path 不能为空'
        targetSession.messages.push(
          createCurrentToolResultMessage(`### 技能文件读取结果\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: errorText }
      }
      persistUsedSkill(target._id)

      try {
        throwIfAborted(abortState)
        const result = await waitForAbortable(
          Promise.resolve(readSkillFile(target._id, pathCandidate)),
          abortState
        )
        throwIfAborted(abortState)
        const skillId = String(target._id || '').trim()
        const skillName = String(target.name || target._id || '').trim() || skillId
        const resolvedPath = String(result?.path || pathCandidate).trim() || pathCandidate
        const content = String(result?.content || '')
        const current = getLoadedSkillFilePathSet(skillId)
        current.add(resolvedPath)
        loadedSkillFileCacheBySkillId[skillId] = Array.from(current)
        if (resolvedPath === String(target?.entryFile || 'SKILL.md').trim() || resolvedPath === 'SKILL.md') {
          loadedSkillContentById[skillId] = content.trim()
        }

        const resultText = [
          'OK: read_skill_file',
          `skill_id: ${skillId}`,
          `skill_name: ${skillName}`,
          `path: ${resolvedPath}`,
          '',
          content
        ].join('\n')
        throwIfAborted(abortState)
        targetSession.messages.push(
          createCurrentToolResultMessage(
            `### 技能文件读取结果\n- 技能：**${skillName}**\n- 路径：\`${resolvedPath}\`\n\n\`\`\`\n${content}\n\`\`\``,
            { toolMeta: `${serverName} / ${toolName}` }
          )
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: true, content: resultText }
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        const errorText = error?.message || String(error)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### 技能文件读取结果\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: errorText }
      }
    }

    if (mapping?.type === 'internal' && mapping.internal === 'run_skill_script') {
      return executeSkillScript({
        prepared,
        targetSession,
        createCurrentToolResultMessage,
        abortState
      })
    }

    if (mapping?.type === 'internal' && mapping.internal === 'use_skill') {
      return activateOneSkill({
        argsObj,
        serverName,
        toolName,
        targetSession,
        createCurrentToolResultMessage,
        abortState
      })
    }

    return activateManySkills({
      argsObj,
      serverName,
      toolName,
      targetSession,
      createCurrentToolResultMessage,
      abortState
    })
  }

  async function executeSkillScript({
    prepared,
    targetSession,
    createCurrentToolResultMessage,
    abortState
  }) {
    const { serverName, toolName, argsObj } = prepared
    const idCandidate = String(argsObj?.id ?? argsObj?._id ?? argsObj?.skillId ?? argsObj?.skill_id ?? '').trim()
    const pathCandidate = String(argsObj?.path ?? argsObj?.script ?? argsObj?.scriptPath ?? '').trim()
    const nameCandidate = String(argsObj?.name ?? argsObj?.skillName ?? argsObj?.skill_name ?? argsObj?.skill ?? '').trim()
    const target = resolveSelectedSkillTarget({ idCandidate, nameCandidate })

    if (!target?._id) {
      const errorText = `未找到要执行脚本的技能。可用技能：${stableStringify(listSelectedSkillsBrief())}`
      targetSession.messages.push(
        createCurrentToolResultMessage(`### 技能脚本执行结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: false, content: errorText }
    }

    const resolvedScript = resolveSkillScriptTarget(target, pathCandidate)
    if (!resolvedScript.ok) {
      const errorText = resolvedScript.error || '脚本路径无效'
      targetSession.messages.push(
        createCurrentToolResultMessage(`### 技能脚本执行结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: false, content: errorText }
    }
    persistUsedSkill(target._id)

    let successfulScriptResult = null
    try {
      throwIfAborted(abortState)
      const result = await waitForAbortable(
        Promise.resolve(runSkillScript(target._id, resolvedScript.path, {
          args: Array.isArray(argsObj?.args) ? argsObj.args : [],
          input: argsObj?.input,
          timeout_ms: argsObj?.timeout_ms
        })),
        abortState
      )
      throwIfAborted(abortState)

      const skillId = String(target._id || '').trim()
      const skillName = String(target.name || target._id || '').trim() || skillId
      const resolvedPath = String(result?.path || resolvedScript.path).trim() || resolvedScript.path
      const stdout = String(result?.stdout || '')
      const stderr = String(result?.stderr || '')
      const exitCode = Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : 0
      const command = String(result?.command || '').trim()
      const outputType = String(
        result?.outputType || (result?.output != null && typeof result.output === 'object' ? 'json' : 'text')
      ).trim() || 'text'
      const parsedOutput = result?.output === undefined ? null : result.output
      const scriptMeta = result?.scriptMeta && typeof result.scriptMeta === 'object'
        ? result.scriptMeta
        : (resolvedScript.entry || null)
      const images = extractChatImagesFromToolResult(result)
      const hasJsonOutput = outputType === 'json' && parsedOutput !== null
      const resultText = stringifyToolResultForLlm({
        ok: true,
        tool: 'run_skill_script',
        skill_id: skillId,
        skill_name: skillName,
        path: resolvedPath,
        inferred_path: Boolean(resolvedScript.inferred),
        command: command || '',
        exit_code: exitCode,
        output_type: outputType,
        output: hasJsonOutput ? parsedOutput : undefined,
        stdout: hasJsonOutput ? '' : stdout,
        stderr,
        script_meta: scriptMeta
      })

      const sections = [
        `### 技能脚本执行结果\n- 技能：**${skillName}**\n- 路径：\`${resolvedPath}\`\n- 退出码：**${exitCode}**${command ? `\n- 命令：\`${command}\`` : ''}`
      ]
      if (scriptMeta?.description || scriptMeta?.whenToUse) {
        sections.push([
          '#### 脚本信息',
          scriptMeta?.runtime ? `- 运行时：${scriptMeta.runtime}` : '',
          scriptMeta?.description ? `- 描述：${scriptMeta.description}` : '',
          scriptMeta?.whenToUse ? `- 使用场景：${scriptMeta.whenToUse}` : ''
        ].filter(Boolean).join('\n'))
      } else if (scriptMeta?.runtime) {
        sections.push(`#### 脚本信息\n- 运行时：${scriptMeta.runtime}`)
      }
      if (hasJsonOutput) {
        sections.push(`#### 输出（JSON）\n\`\`\`json\n${stableStringify(parsedOutput)}\n\`\`\``)
      }
      if (images.length) sections.push(`#### 图片\n- ${images.length} 张（已在上方预览；base64/dataUrl 已省略）`)
      if (stdout && !hasJsonOutput) sections.push(`#### 标准输出\n\`\`\`\n${stdout}\n\`\`\``)
      if (stderr) sections.push(`#### 标准错误\n\`\`\`\n${stderr}\n\`\`\``)
      if (!stdout && !stderr && !hasJsonOutput) sections.push('（脚本未产生输出）')

      throwIfAborted(abortState)
      const executionResult = { ok: true, content: resultText, images, serverName, toolName }
      targetSession.messages.push(
        createCurrentToolResultMessage(sections.join('\n\n'), {
          toolMeta: `${serverName} / ${toolName}`,
          images,
          toolName,
          toolServerName: serverName,
          toolExpanded: false
        })
      )
      successfulScriptResult = executionResult
      await maybeScrollToBottomForRun(abortState)
      return executionResult
    } catch (error) {
      if (isAbortError(error) || abortState?.aborted) throw createAbortError()
      if (successfulScriptResult) return successfulScriptResult
      const errorText = error?.message || String(error)
      targetSession.messages.push(
        createCurrentToolResultMessage(`### 技能脚本执行结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: false, content: errorText }
    }
  }

  async function activateOneSkill({
    argsObj,
    serverName,
    toolName,
    targetSession,
    createCurrentToolResultMessage,
    abortState
  }) {
    const idCandidate = String(argsObj?.id ?? argsObj?._id ?? argsObj?.skillId ?? argsObj?.skill_id ?? '').trim()
    const nameCandidate = String(argsObj?.name ?? argsObj?.skillName ?? argsObj?.skill_name ?? argsObj?.skill ?? '').trim()
    const available = Array.isArray(selectedSkillObjects.value) ? selectedSkillObjects.value : []

    let target = idCandidate
      ? available.find((skill) => String(skill?._id || '') === idCandidate) || null
      : null
    if (!target && nameCandidate) {
      const normalizedName = nameCandidate.toLowerCase()
      target =
        available.find((skill) => String(skill?.name || '').trim().toLowerCase() === normalizedName) ||
        available.find((skill) => String(skill?._id || '').trim().toLowerCase() === normalizedName) ||
        available.find((skill) => String(skill?.name || '').trim().toLowerCase().includes(normalizedName)) ||
        null
    }

    if (!target?._id) {
      const availableSkills = available
        .map((skill) => ({ id: skill?._id, name: skill?.name || skill?._id }))
        .filter((skill) => skill.id)
        .slice(0, 30)
      const errorText = `未找到要启用的技能（仅可启用当前已选择的技能）。可用技能：${stableStringify(availableSkills)}`
      targetSession.messages.push(
        createCurrentToolResultMessage(`### 技能启用结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      return { ok: false, content: errorText }
    }

    const skillId = String(target._id || '').trim()
    const skillName = String(target.name || target._id || '').trim() || skillId
    const isAgentSkill = agentSkillIdSet.value.has(skillId)
    const directorySkill = isDirectorySkill(target)
    const wasLoaded = directorySkill
      ? hasLoadedSkillMainContent(skillId, target?.entryFile || 'SKILL.md')
      : true

    if (directorySkill && !wasLoaded) {
      try {
        throwIfAborted(abortState)
        await waitForAbortable(loadSkillMainContent(skillId), abortState)
        throwIfAborted(abortState)
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        const errorText = error?.message || String(error)
        targetSession.messages.push(
          createCurrentToolResultMessage(`### 技能启用结果\n- 错误：${errorText}`, {
            toolMeta: `${serverName} / ${toolName}`
          })
        )
        await maybeScrollToBottomForRun(abortState)
        return { ok: false, content: errorText }
      }
    }

    let changed = false
    if (isAgentSkill) {
      markSkillActivationPersistent?.([skillId])
      throwIfAborted(abortState)
      const previous = Array.isArray(activatedAgentSkillIds.value) ? activatedAgentSkillIds.value : []
      if (!previous.includes(skillId)) {
        activatedAgentSkillIds.value = [...previous, skillId]
        changed = true
      }
    }

    const configuredMcpIds = Array.isArray(target?.mcp)
      ? target.mcp.map((id) => String(id || '').trim()).filter(Boolean)
      : []
    const configuredServers = Array.isArray(mcpServers.value) ? mcpServers.value : []
    const mcpById = new Map(
      configuredServers.filter((server) => server?._id).map((server) => [String(server._id), server])
    )
    const mountedMcpIds = configuredMcpIds.filter((id) => mcpById.has(String(id)))
    const missingMcpIds = configuredMcpIds.filter((id) => !mcpById.has(String(id)))
    const mountedMcpNames = mountedMcpIds.map((id) => mcpById.get(String(id))?.name || id)
    const status = directorySkill
      ? (wasLoaded ? 'already_loaded' : 'loaded')
      : (isAgentSkill ? (changed ? 'activated' : 'already_activated') : 'noop_not_agent_skill')

    const resultText = [
      'OK: use_skill',
      `skill_id: ${skillId}`,
      `skill_name: ${skillName}`,
      `status: ${status}`,
      `activation_status: ${isAgentSkill ? (changed ? 'activated' : 'already_activated') : 'noop_not_agent_skill'}`,
      `mounted_mcp: ${mountedMcpNames.length ? mountedMcpNames.join(', ') : '无'}`,
      ...(missingMcpIds.length ? [`missing_mcp: ${missingMcpIds.join(', ')}`] : []),
      isAgentSkill
        ? '说明：完整技能内容已加载。内置 Action 不会全量注册；需要参数 Schema 时调用 skill_discover，然后用 skill_call 执行。'
        : '说明：这个技能不是智能体预设技能，或已经启用，因此无需额外激活。'
    ].join('\n')

    throwIfAborted(abortState)
    targetSession.messages.push(
      createCurrentToolResultMessage(
        `### 技能启用结果\n- 技能：**${skillName}**\n- 状态：**${isAgentSkill ? (changed ? '已启用' : '已启用过') : '无需启用'}**\n- MCP：${mountedMcpNames.length ? mountedMcpNames.map((name) => `\`${name}\``).join(', ') : '（无）'}${missingMcpIds.length ? `\n- 缺失的 MCP 配置：${missingMcpIds.map((id) => `\`${id}\``).join(', ')}` : ''}`,
        { toolMeta: `${serverName} / ${toolName}` }
      )
    )
    await maybeScrollToBottomForRun(abortState)
    return { ok: true, content: resultText }
  }

  async function activateManySkills({
    argsObj,
    serverName,
    toolName,
    targetSession,
    createCurrentToolResultMessage,
    abortState
  }) {
    const idsRaw = argsObj?.ids ?? argsObj?.skill_ids ?? argsObj?.skillIds ?? []
    const namesRaw = argsObj?.names ?? argsObj?.skill_names ?? argsObj?.skillNames ?? []
    const ids = Array.isArray(idsRaw) ? idsRaw.map((id) => String(id || '').trim()).filter(Boolean) : []
    const names = Array.isArray(namesRaw) ? namesRaw.map((name) => String(name || '').trim()).filter(Boolean) : []
    const resolvedSkills = [
      ...ids.map((id) => resolveSelectedSkillTarget({ idCandidate: id })),
      ...names.map((name) => resolveSelectedSkillTarget({ nameCandidate: name }))
    ].filter(Boolean)
    const uniqueSkills = new Map()
    resolvedSkills.forEach((skill) => {
      const id = String(skill?._id || '').trim()
      if (id && !uniqueSkills.has(id)) uniqueSkills.set(id, skill)
    })
    const targets = Array.from(uniqueSkills.values())

    if (!targets.length) {
      const errorText = `未找到要启用的技能（仅可启用当前已选择的技能）。可用技能：${stableStringify(listSelectedSkillsBrief())}`
      targetSession.messages.push(
        createCurrentToolResultMessage(`### 技能启用结果\n- 错误：${errorText}`, {
          toolMeta: `${serverName} / ${toolName}`
        })
      )
      await maybeScrollToBottomForRun(abortState)
      return { ok: false, content: errorText }
    }

    const agentSet = agentSkillIdSet.value
    const loaded = []
    const alreadyLoaded = []
    const loadFailed = []
    for (const skill of targets) {
      throwIfAborted(abortState)
      const id = String(skill?._id || '').trim()
      if (!id || !isDirectorySkill(skill)) continue
      if (hasLoadedSkillMainContent(id, skill?.entryFile || 'SKILL.md')) {
        alreadyLoaded.push(id)
        continue
      }
      try {
        await waitForAbortable(loadSkillMainContent(id), abortState)
        throwIfAborted(abortState)
        loaded.push(id)
      } catch (error) {
        if (isAbortError(error) || abortState?.aborted) throw createAbortError()
        loadFailed.push({ id, error: error?.message || String(error) })
      }
    }

    const previous = new Set(Array.isArray(activatedAgentSkillIds.value) ? activatedAgentSkillIds.value : [])
    const activated = []
    const already = []
    const noop = []
    const mountedMcpNames = new Set()
    const missingMcpIds = new Set()
    targets.forEach((skill) => {
      const id = String(skill?._id || '').trim()
      if (!id || loadFailed.some((item) => item.id === id)) return
      if (!agentSet.has(id)) {
        noop.push(id)
        return
      }
      markSkillActivationPersistent?.([id])
      if (previous.has(id)) already.push(id)
      else {
        previous.add(id)
        activated.push(id)
      }

      const mcpStatus = getSkillMcpStatus(skill)
      mcpStatus.mountedNames.forEach((name) => mountedMcpNames.add(name))
      mcpStatus.missingMcpIds.forEach((idValue) => missingMcpIds.add(idValue))
    })
    throwIfAborted(abortState)
    activatedAgentSkillIds.value = Array.from(previous)

    const resultText = stableStringify({
      ok: true,
      tool: 'use_skills',
      resolved_skills: targets.map((skill) => ({ id: skill?._id, name: skill?.name || skill?._id })),
      status: {
        activated,
        already_activated: already,
        noop_not_agent_skill: noop
      },
      content_status: {
        loaded,
        already_loaded: alreadyLoaded,
        failed: loadFailed
      },
      mounted_mcp: Array.from(mountedMcpNames),
      missing_mcp: Array.from(missingMcpIds)
    })

    targetSession.messages.push(
      createCurrentToolResultMessage(
        `### 技能启用结果\n- 已启用：${activated.length}\n- 已启用过：${already.length}\n- 无需启用：${noop.length}\n- MCP：${mountedMcpNames.size ? Array.from(mountedMcpNames).map((name) => `\`${name}\``).join(', ') : '（无）'}${missingMcpIds.size ? `\n- 缺失的 MCP 配置：${Array.from(missingMcpIds).map((id) => `\`${id}\``).join(', ')}` : ''}`,
        { toolMeta: `${serverName} / ${toolName}` }
      )
    )
    await maybeScrollToBottomForRun(abortState)
    return { ok: true, content: resultText, serverName, toolName }
  }

  return async function handlePreparedSkillTool(prepared, executionContext, abortState = null) {
    if (!shouldHandlePreparedSkillTool(prepared?.mapping)) {
      return { handled: false, result: null }
    }
    const result = await executePreparedSkillTool(prepared, executionContext, abortState)
    return { handled: true, result }
  }
}
