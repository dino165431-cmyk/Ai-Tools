<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--config', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center" wrap :size="12">
        <n-flex vertical :size="4">
          <n-text strong style="font-size: 18px;">全局配置</n-text>
          <n-text depth="3" style="font-size: 12px;">
            统一管理主题、数据目录、默认提示词、上下文窗口、云同步和全局配置密码。
          </n-text>
        </n-flex>
        <n-tag :type="hasConfigPassword ? 'warning' : 'success'" bordered>
          {{ hasConfigPassword ? '已启用全局配置密码' : '未设置全局配置密码' }}
        </n-tag>
      </n-flex>
    </n-card>

    <n-card v-if="!configAccessReady" hoverable style="width: 100%; margin-top: 12px;">
      <n-flex vertical :size="10" align="center" style="padding: 24px 8px;">
        <n-text strong>正在验证配置页访问状态</n-text>
        <n-text depth="3">请稍候...</n-text>
      </n-flex>
    </n-card>

    <n-card v-else-if="!configPageUnlocked" hoverable class="config-lock-card" style="width: 100%; margin-top: 12px;">
      <n-flex vertical :size="14" style="max-width: 460px; margin: 0 auto; padding: 12px 0;">
        <n-text strong style="font-size: 18px;">全局配置已加锁</n-text>
        <n-text depth="3">
          已设置全局配置密码。输入密码后才能进入该页面。
        </n-text>
        <n-input
          v-model:value="pageUnlockPassword"
          type="password"
          show-password-toggle
          placeholder="输入全局配置密码"
          @keydown.enter.prevent="submitPageUnlock"
        />
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-button
            secondary
            :disabled="!hasRecoveryQuestion"
            @click="openSecurityResetModal"
          >
            安全问题重置
          </n-button>
          <n-button type="primary" :loading="pageUnlockLoading" @click="submitPageUnlock">
            进入配置页
          </n-button>
        </n-flex>
        <n-text v-if="hasRecoveryQuestion" depth="3" style="font-size: 12px;">
          忘记密码时可通过安全问题重置，不需要旧密码。
        </n-text>
      </n-flex>
    </n-card>

    <n-flex v-else vertical :size="16" style="width: 100%; margin-top: 12px;">
      <n-card hoverable>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-flex vertical :size="6" style="min-width: 240px;">
            <n-text strong>主题</n-text>
            <n-text depth="3">{{ theme === 'dark' ? '当前为深色主题' : '当前为浅色主题' }}</n-text>
          </n-flex>
          <n-button @click="handleToggleTheme">切换主题</n-button>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-flex vertical :size="6" style="min-width: 280px;">
            <n-text strong>数据存储根目录</n-text>
            <n-text depth="3" style="word-break: break-all;">
              {{ dataStorageRootText }}
            </n-text>
          </n-flex>
          <n-flex :size="10" wrap>
            <n-button @click="handlePickDataStorageRoot">选择目录</n-button>
            <n-button secondary @click="handleResetDataStorageRoot">恢复默认</n-button>
          </n-flex>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-flex vertical :size="6" style="min-width: 280px;">
            <n-text strong>Notebook Runtime</n-text>
            <n-text depth="3">{{ notebookRuntimeSummary }}</n-text>
            <n-tag :type="notebookLspStatus.type" bordered style="width: fit-content;">
              {{ notebookLspStatus.label }}
            </n-tag>
          </n-flex>
          <n-flex :size="10" wrap>
            <n-button secondary @click="refreshNotebookPythonDetection" :loading="notebookRuntimeDetecting">重新检测</n-button>
            <n-button @click="openNotebookRuntimeModal">编辑配置</n-button>
          </n-flex>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="6" style="min-width: 280px;">
              <n-text strong>联网搜索代理</n-text>
              <n-text depth="3">{{ webSearchProxySummary }}</n-text>
              <n-text depth="3" style="font-size: 12px;">
                只保存在当前电脑本地，不参与云同步；留空表示直连。证书兜底只在证书链异常时重试。
              </n-text>
            </n-flex>
            <n-button type="primary" :loading="webSearchConfigSaving" @click="saveWebSearchConfig">保存联网设置</n-button>
          </n-flex>
          <n-input
            v-model:value="webSearchConfigDraft.proxyUrl"
            placeholder="例如：http://127.0.0.1:7890"
            clearable
          />
          <n-select
            v-model:value="webSearchConfigDraft.searchApiProvider"
            :options="webSearchApiProviderOptions"
          />
          <n-input
            v-if="webSearchConfigDraft.searchApiProvider === 'bocha_search' || webSearchConfigDraft.searchApiProvider === 'brave_search'"
            v-model:value="webSearchConfigDraft.searchApiKey"
            type="password"
            show-password-toggle
            :placeholder="webSearchConfigDraft.searchApiProvider === 'bocha_search' ? '博查搜索 API Key' : 'Brave Search API Key'"
            clearable
          />
          <n-input
            v-if="webSearchConfigDraft.searchApiProvider === 'bocha_search' || webSearchConfigDraft.searchApiProvider === 'brave_search'"
            v-model:value="webSearchConfigDraft.searchApiEndpoint"
            :placeholder="webSearchConfigDraft.searchApiProvider === 'bocha_search' ? '默认：https://api.bochaai.com/v1/web-search' : '默认：https://api.search.brave.com/res/v1/web/search'"
            clearable
          />
          <n-input
            v-if="webSearchConfigDraft.searchApiProvider === 'bocha_search' || webSearchConfigDraft.searchApiProvider === 'brave_search'"
            v-model:value="webSearchConfigDraft.searchApiMarket"
            placeholder="搜索市场，例如：zh-CN"
            clearable
          />
          <n-checkbox v-model:checked="webSearchConfigDraft.allowInsecureTlsFallback">
            证书链异常时自动降级重试
          </n-checkbox>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-flex vertical :size="6" style="min-width: 280px;">
            <n-text strong>默认系统提示词</n-text>
            <n-text depth="3" style="white-space: pre-wrap;">{{ systemPromptPreview }}</n-text>
          </n-flex>
          <n-button @click="openSystemPromptModal">编辑提示词</n-button>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="4">
              <n-text strong>图片 / 视频生成模式</n-text>
              <n-text depth="3">控制聊天页默认是否优先按图片或视频生成来解释请求。</n-text>
            </n-flex>
            <n-button type="primary" :loading="generationSaving" @click="saveGenerationModes">保存模式</n-button>
          </n-flex>
          <n-flex wrap :size="12">
            <n-form-item label="图片生成" style="flex: 1; min-width: 240px; margin-bottom: 0;">
              <n-select v-model:value="generationDraft.imageGenerationMode" :options="generationModeOptions" />
            </n-form-item>
            <n-form-item label="视频生成" style="flex: 1; min-width: 240px; margin-bottom: 0;">
              <n-select v-model:value="generationDraft.videoGenerationMode" :options="generationModeOptions" />
            </n-form-item>
          </n-flex>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-flex vertical :size="6" style="min-width: 280px;">
            <n-text strong>聊天上下文窗口</n-text>
            <n-text depth="3">{{ contextWindowSummary }}</n-text>
          </n-flex>
          <n-button @click="openContextWindowModal">编辑上下文策略</n-button>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="6" style="min-width: 280px;">
              <n-text strong>聊天记忆</n-text>
              <n-text depth="3">{{ memoryConfigSummary }}</n-text>
              <n-text depth="3" style="font-size: 12px;">
                记忆会同时沉淀长期事实、用户偏好、回答风格偏向和稳定约束。向量模型未配置时，会自动降级成关键词召回。
              </n-text>
            </n-flex>
            <n-flex :size="10" wrap>
              <n-button type="primary" :loading="memorySaving" @click="saveMemoryConfig">保存记忆配置</n-button>
              <n-button :disabled="memoryDraft.enabled !== true" @click="openMemoryPage">记忆管理</n-button>
            </n-flex>
          </n-flex>

          <n-flex wrap :size="12">
            <n-form-item label="启用记忆" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-switch v-model:value="memoryDraft.enabled" />
            </n-form-item>
            <n-form-item label="自动提取" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-switch v-model:value="memoryDraft.autoExtract" :disabled="memoryDraft.enabled !== true" />
            </n-form-item>
          </n-flex>

          <n-flex wrap :size="12">
            <n-form-item label="提取服务商" style="flex: 1; min-width: 260px; margin-bottom: 0;">
              <n-select
                v-model:value="memoryDraft.extraction.providerId"
                :options="memoryProviderOptions"
                :disabled="memoryDraft.enabled !== true"
                clearable
              />
            </n-form-item>
            <n-form-item label="提取模型" style="flex: 1; min-width: 260px; margin-bottom: 0;">
              <n-select
                v-model:value="memoryDraft.extraction.model"
                :options="memoryExtractionModelOptions"
                :disabled="memoryDraft.enabled !== true || !memoryDraft.extraction.providerId"
                clearable
              />
            </n-form-item>
          </n-flex>

          <n-flex wrap :size="12">
            <n-form-item label="向量服务商" style="flex: 1; min-width: 260px; margin-bottom: 0;">
              <n-select
                v-model:value="memoryDraft.embedding.providerId"
                :options="memoryEmbeddingProviderOptions"
                :disabled="memoryDraft.enabled !== true"
                clearable
              />
            </n-form-item>
            <n-form-item label="向量模型" style="flex: 1; min-width: 260px; margin-bottom: 0;">
              <n-select
                v-model:value="memoryDraft.embedding.model"
                :options="memoryEmbeddingModelOptions"
                :disabled="memoryDraft.enabled !== true || !memoryDraft.embedding.providerId"
                clearable
              />
            </n-form-item>
          </n-flex>

          <n-flex wrap :size="12">
            <n-form-item label="召回 TopK" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.topK" :min="1" :max="20" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
            <n-form-item label="注入字符上限" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.maxInjectChars" :min="400" :max="8000" :step="100" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
            <n-form-item label="最小相似度" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.minSimilarity" :min="0" :max="1" :step="0.01" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
          </n-flex>

          <n-flex wrap :size="12">
            <n-form-item label="最小置信度" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.minConfidence" :min="0" :max="1" :step="0.01" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
            <n-form-item label="画像条数上限" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.profileMaxItems" :min="1" :max="20" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
            <n-form-item label="相关记忆上限" style="flex: 1; min-width: 220px; margin-bottom: 0;">
              <n-input-number v-model:value="memoryDraft.relevantMaxItems" :min="1" :max="20" :disabled="memoryDraft.enabled !== true" style="width: 220px;" />
            </n-form-item>
          </n-flex>

          <n-alert type="info" :show-icon="false">
            记忆提取模型可选内置 uTools AI 或兼容 OpenAI 的聊天模型；向量模型建议使用标准 embeddings 接口，因此这里只显示兼容 OpenAI 的服务商。
          </n-alert>

          <n-flex wrap :size="10">
            <n-button secondary :disabled="memoryDraft.enabled !== true" :loading="memoryRebuilding" @click="handleRebuildMemory">重建向量</n-button>
            <n-button secondary :disabled="memoryDraft.enabled !== true" @click="handleCleanMemoryStore">清洗与合并</n-button>
            <n-button secondary :loading="memoryOpening" @click="handleOpenMemoryFolder">打开记忆目录</n-button>
          </n-flex>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="4">
              <n-text strong>云同步配置</n-text>
              <n-text depth="3">{{ cloudConfigSummary }}</n-text>
            </n-flex>
            <n-flex align="center" :size="10" wrap>
              <n-flex align="center" :size="8">
                <n-text depth="3">自动备份</n-text>
                <n-switch
                  :value="cloudAutoBackupEnabled"
                  :loading="cloudAutoBackupSaving"
                  @update:value="handleToggleCloudAutoBackup"
                />
              </n-flex>
              <n-flex align="center" :size="8">
                <n-text depth="3">自动恢复</n-text>
                <n-switch
                  :value="cloudAutoRestoreEnabled"
                  :loading="cloudAutoRestoreSaving"
                  @update:value="handleToggleCloudAutoRestore"
                />
              </n-flex>
              <n-button @click="openCloudConfigModal">编辑云配置</n-button>
            </n-flex>
          </n-flex>
          <n-flex wrap :size="10">
            <n-button :loading="cloudActionLoading.backup" @click="confirmCloudAction('backup')">备份到云端</n-button>
            <n-button :loading="cloudActionLoading.sync" @click="confirmCloudAction('sync')">与云端同步</n-button>
            <n-button secondary :loading="cloudActionLoading.restore" @click="confirmCloudAction('restore')">从云端恢复</n-button>
          </n-flex>
          <n-alert
            v-if="cloudActionFeedback.visible"
            :type="cloudActionFeedback.status === 'error' ? 'error' : cloudActionFeedback.status === 'success' ? 'success' : 'info'"
            :show-icon="cloudActionFeedback.status !== 'running'"
            :bordered="false"
          >
            <n-flex vertical :size="8">
              <n-text strong>{{ cloudActionFeedback.title }}</n-text>
              <n-text depth="3">{{ cloudActionFeedback.summary }}</n-text>
              <n-progress
                v-if="cloudActionFeedback.status === 'running' && cloudActionFeedback.total > 0"
                type="line"
                processing
                :percentage="cloudActionPercentage"
                indicator-placement="inside"
              />
              <n-text v-if="cloudActionFeedback.detail" depth="3" style="font-size: 12px;">
                {{ cloudActionFeedback.detail }}
              </n-text>
            </n-flex>
          </n-alert>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="4">
              <n-text strong>导入 / 导出配置</n-text>
              <n-text depth="3">
                导入会覆盖当前全局配置；导出会写出完整配置文件。若已设置全局配置密码，这两项操作都需要再次输入密码确认。
              </n-text>
            </n-flex>
          </n-flex>
          <n-flex wrap :size="10">
            <n-button @click="handleExportConfig">导出配置</n-button>
            <n-button secondary @click="handleImportConfig">导入配置</n-button>
          </n-flex>
        </n-flex>
      </n-card>

      <n-card hoverable>
        <n-flex vertical :size="12">
          <n-flex justify="space-between" align="center" wrap :size="12">
            <n-flex vertical :size="6">
              <n-text strong>全局配置密码</n-text>
              <n-text depth="3">
                {{ configPasswordSummary }}
              </n-text>
              <n-text v-if="configSecurity.recoveryQuestion" depth="3" style="font-size: 12px;">
                安全问题：{{ configSecurity.recoveryQuestion }}
              </n-text>
            </n-flex>
            <n-flex wrap :size="10">
              <n-button v-if="!hasConfigPassword" type="primary" @click="openConfigPasswordModal('set')">设置密码</n-button>
              <template v-else>
                <n-button @click="openConfigPasswordModal('change')">修改密码</n-button>
                <n-button secondary @click="openSecurityResetModal" :disabled="!hasRecoveryQuestion">安全问题重置</n-button>
                <n-button type="error" ghost @click="openConfigPasswordModal('clear')">清除密码</n-button>
              </template>
            </n-flex>
          </n-flex>
          <n-alert type="info" :show-icon="false">
            该密码同时作为“笔记密码重置”的全局凭据。修改、重置或清除时，会同步迁移或移除已绑定笔记中的恢复封装。
          </n-alert>
        </n-flex>
      </n-card>
    </n-flex>

    <n-modal v-model:show="systemPromptModal.show" preset="card" title="编辑默认系统提示词" style="width: 820px; max-width: 95%;">
      <n-input
        v-model:value="systemPromptModal.value"
        type="textarea"
        :autosize="{ minRows: 10, maxRows: 18 }"
        placeholder="输入默认系统提示词"
      />
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeSystemPromptModal">取消</n-button>
          <n-button type="primary" :loading="systemPromptModal.loading" @click="saveSystemPrompt">保存</n-button>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="contextWindowModal.show" preset="card" title="编辑上下文窗口策略" style="width: 720px; max-width: 95%;">
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="预设">
          <n-select v-model:value="contextWindowDraft.preset" :options="contextWindowPresetOptions" />
        </n-form-item>
        <n-form-item label="历史侧重点">
          <n-select v-model:value="contextWindowDraft.historyFocus" :options="contextWindowHistoryFocusOptions" />
        </n-form-item>
        <template v-if="contextWindowDraft.preset === 'custom'">
          <n-form-item label="最大轮次">
            <n-input-number v-model:value="contextWindowDraft.maxTurns" :min="2" :max="200" style="width: 220px;" />
          </n-form-item>
          <n-form-item label="完整保留轮次">
            <n-input-number v-model:value="contextWindowDraft.keepRecentTurnsFull" :min="1" :max="64" style="width: 220px;" />
          </n-form-item>
          <n-form-item label="最大消息数">
            <n-input-number v-model:value="contextWindowDraft.maxMessages" :min="8" :max="1000" style="width: 220px;" />
          </n-form-item>
          <n-form-item label="展开字符预算">
            <n-input-number v-model:value="contextWindowDraft.maxCharsExpanded" :min="4000" :max="4200000" :step="10000" style="width: 220px;" />
          </n-form-item>
          <n-form-item label="压缩字符预算">
            <n-input-number v-model:value="contextWindowDraft.maxCharsCompact" :min="6000" :max="4200000" :step="10000" style="width: 220px;" />
          </n-form-item>
        </template>
      </n-form>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeContextWindowModal">取消</n-button>
          <n-button type="primary" :loading="contextWindowModal.loading" @click="saveContextWindow">保存</n-button>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="notebookRuntimeModal.show" preset="card" title="Notebook Runtime 配置" style="width: 760px; max-width: 95%;">
      <n-flex vertical :size="12">
        <n-alert type="info" :show-icon="false">
          Notebook Runtime 配置只保存在当前电脑本地，不参与云同步，也不会被导入导出配置覆盖。
        </n-alert>
        <n-alert :type="notebookLspStatus.type === 'success' ? 'success' : 'warning'" :show-icon="false">
          {{ notebookLspStatusHelp }}
        </n-alert>
        <n-form label-placement="left" label-width="140px">
          <n-form-item label="Python 解释器">
            <n-input v-model:value="notebookRuntimeModal.form.pythonPath" placeholder="留空则优先使用自动检测到的 Python" />
          </n-form-item>
          <n-form-item label="虚拟环境存储目录">
            <n-flex vertical :size="8" style="width: 100%;">
              <n-input v-model:value="notebookRuntimeModal.form.venvRoot" placeholder="留空则使用本机默认目录" />
              <n-flex :size="8" wrap>
                <n-button secondary @click="handlePickNotebookVenvRoot">选择目录</n-button>
                <n-button secondary @click="handleResetNotebookVenvRoot">恢复默认</n-button>
              </n-flex>
              <n-text depth="3" style="word-break: break-all;">
                默认目录：{{ defaultNotebookVenvRootText }}
              </n-text>
            </n-flex>
          </n-form-item>
          <n-form-item label="自动检测结果">
            <n-flex vertical :size="8" style="width: 100%;">
              <n-text depth="3" style="word-break: break-all;">
                {{ detectedNotebookPythonText }}
              </n-text>
              <n-button secondary style="width: fit-content;" :loading="notebookRuntimeDetecting" @click="handleUseDetectedNotebookPython">
                使用检测结果
              </n-button>
            </n-flex>
          </n-form-item>
          <n-form-item label="默认 Kernel">
            <n-input v-model:value="notebookRuntimeModal.form.kernelName" placeholder="留空则使用环境默认 kernel" />
          </n-form-item>
          <n-form-item label="启动超时(ms)">
            <n-flex vertical :size="6" style="width: 100%;">
              <n-input-number v-model:value="notebookRuntimeModal.form.startupTimeoutMs" :min="0" :max="120000" :step="1000" style="width: 220px;" />
              <n-text depth="3">填 0 表示永不超时。</n-text>
            </n-flex>
          </n-form-item>
          <n-form-item label="执行超时(ms)">
            <n-flex vertical :size="6" style="width: 100%;">
              <n-input-number v-model:value="notebookRuntimeModal.form.executeTimeoutMs" :min="0" :max="600000" :step="1000" style="width: 220px;" />
              <n-text depth="3">填 0 表示永不超时。</n-text>
            </n-flex>
          </n-form-item>
        </n-form>
      </n-flex>
      <template #footer>
        <n-flex justify="space-between" align="center" :size="12">
          <n-button secondary :loading="notebookRuntimeDetecting" @click="refreshNotebookPythonDetection">重新检测 Python</n-button>
          <n-flex justify="flex-end" :size="12">
            <n-button @click="closeNotebookRuntimeModal">取消</n-button>
            <n-button type="primary" :loading="notebookRuntimeModal.loading" @click="saveNotebookRuntimeConfig">保存</n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="cloudConfigModal.show" preset="card" title="编辑云同步配置" style="width: 760px; max-width: 95%;">
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="Region">
          <n-input v-model:value="cloudConfigModal.form.region" placeholder="例如：ap-southeast-1" />
        </n-form-item>
        <n-form-item label="Access Key ID">
          <n-input v-model:value="cloudConfigModal.form.accessKeyId" placeholder="输入 Access Key ID" />
        </n-form-item>
        <n-form-item label="Secret Access Key">
          <n-input v-model:value="cloudConfigModal.form.secretAccessKey" type="password" show-password-toggle placeholder="输入 Secret Access Key" />
        </n-form-item>
        <n-form-item label="Bucket">
          <n-input v-model:value="cloudConfigModal.form.bucket" placeholder="输入 Bucket" />
        </n-form-item>
        <n-form-item label="Endpoint">
          <n-input v-model:value="cloudConfigModal.form.endpoint" placeholder="例如：https://s3.amazonaws.com" />
        </n-form-item>
        <n-form-item label="Force Path Style">
          <n-switch v-model:value="cloudConfigModal.form.forcePathStyle" />
        </n-form-item>
        <n-form-item label="自动备份">
          <n-switch v-model:value="cloudConfigModal.form.autoBackupEnabled" />
        </n-form-item>
        <n-form-item label="自动恢复">
          <n-switch v-model:value="cloudConfigModal.form.autoRestoreEnabled" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeCloudConfigModal">取消</n-button>
          <n-button type="primary" :loading="cloudConfigModal.loading" @click="saveCloudConfig">保存</n-button>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="configPasswordModal.show" preset="card" :title="configPasswordModalTitle" style="width: 560px; max-width: 95%;" :mask-closable="false">
      <n-flex vertical :size="12">
        <n-alert v-if="configPasswordModal.mode === 'clear'" type="warning" :show-icon="false">
          清除后，进入全局配置页、导入导出校验以及笔记密码重置的全局凭据都会一起失效。
        </n-alert>
        <n-input
          v-if="configPasswordModal.mode !== 'set'"
          v-model:value="configPasswordModal.currentPassword"
          type="password"
          show-password-toggle
          :placeholder="configPasswordModal.mode === 'clear' ? '输入当前全局配置密码' : '输入当前全局配置密码'"
        />
        <template v-if="configPasswordModal.mode !== 'clear'">
          <n-input
            v-model:value="configPasswordModal.newPassword"
            type="password"
            show-password-toggle
            placeholder="输入新的全局配置密码"
          />
          <n-input
            v-model:value="configPasswordModal.confirmPassword"
            type="password"
            show-password-toggle
            placeholder="再次输入新的全局配置密码"
          />
          <n-input
            v-model:value="configPasswordModal.recoveryQuestion"
            placeholder="设置一个安全问题"
          />
          <n-input
            v-model:value="configPasswordModal.recoveryAnswer"
            type="password"
            show-password-toggle
            placeholder="输入安全问题答案"
          />
          <n-input
            v-model:value="configPasswordModal.recoveryAnswerConfirm"
            type="password"
            show-password-toggle
            placeholder="再次输入安全问题答案"
            @keydown.enter.prevent="submitConfigPasswordModal"
          />
        </template>
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeConfigPasswordModal">取消</n-button>
          <n-button :type="configPasswordModal.mode === 'clear' ? 'error' : 'primary'" :loading="configPasswordModal.loading" @click="submitConfigPasswordModal">
            {{ configPasswordModal.mode === 'clear' ? '清除密码' : '保存' }}
          </n-button>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="securityResetModal.show" preset="card" title="通过安全问题重置全局配置密码" style="width: 560px; max-width: 95%;" :mask-closable="false">
      <n-flex vertical :size="12">
        <n-alert type="info" :show-icon="false">
          当前安全问题：{{ configSecurity.recoveryQuestion || '未设置' }}
        </n-alert>
        <n-input
          v-model:value="securityResetModal.answer"
          type="password"
          show-password-toggle
          placeholder="输入当前安全问题答案"
        />
        <n-input
          v-model:value="securityResetModal.newPassword"
          type="password"
          show-password-toggle
          placeholder="输入新的全局配置密码"
        />
        <n-input
          v-model:value="securityResetModal.confirmPassword"
          type="password"
          show-password-toggle
          placeholder="再次输入新的全局配置密码"
        />
        <n-input
          v-model:value="securityResetModal.recoveryQuestion"
          placeholder="设置新的安全问题"
        />
        <n-input
          v-model:value="securityResetModal.recoveryAnswer"
          type="password"
          show-password-toggle
          placeholder="输入新的安全问题答案"
        />
        <n-input
          v-model:value="securityResetModal.recoveryAnswerConfirm"
          type="password"
          show-password-toggle
          placeholder="再次输入新的安全问题答案"
          @keydown.enter.prevent="submitSecurityReset"
        />
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeSecurityResetModal">取消</n-button>
          <n-button type="primary" :loading="securityResetModal.loading" @click="submitSecurityReset">重置密码</n-button>
        </n-flex>
      </template>
    </n-modal>

    <n-modal v-model:show="actionPasswordModal.show" preset="card" :title="actionPasswordModal.title" style="width: 460px; max-width: 95%;" :mask-closable="false">
      <n-flex vertical :size="12">
        <n-text depth="3">{{ actionPasswordModal.description }}</n-text>
        <n-input
          v-model:value="actionPasswordModal.password"
          type="password"
          show-password-toggle
          placeholder="输入当前全局配置密码"
          @keydown.enter.prevent="submitActionPassword"
        />
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeActionPasswordModal">取消</n-button>
          <n-button type="primary" :loading="actionPasswordModal.loading" @click="submitActionPassword">确认</n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NFlex,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NProgress,
  NSelect,
  NSwitch,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import {
  cutTheme,
  exportGlobalConfigToFile,
  getChatConfig,
  getConfigSecurity,
  getCloudConfig,
  getDataStorageRoot,
  getNoteConfig,
  getProviders,
  getTheme,
  getWebSearchConfig,
  importGlobalConfigFromFile,
  resetDataStorageRoot,
  setDataStorageRoot,
  updateChatConfig,
  updateGlobalConfig,
  updateNoteConfig,
  updateCloudConfig,
  updateWebSearchConfig
} from '@/utils/configListener'
import {
  backupToCloud,
  describeFileOperationsError,
  readFile,
  restoreFromCloud,
  syncToCloud,
  writeFile
} from '@/utils/fileOperations'
import {
  changeFallbackPassword,
  createPasswordVerifier,
  decryptTextWithPassword,
  encryptTextWithPassword,
  hasFallbackRecovery,
  normalizeNoteSecurityConfig,
  verifyPassword
} from '@/utils/noteEncryption'
import {
  CHAT_CONTEXT_WINDOW_PRESETS,
  DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG,
  normalizeChatContextWindowConfig
} from '@/utils/chatContextWindow'
import { DEFAULT_CHAT_MEMORY_CONFIG, normalizeChatMemoryConfig } from '@/utils/chatMemoryConfig'
import { manageMemoryStore, rebuildMemoryEmbeddings, resetMemoryStoreCache } from '@/utils/chatMemory'
import { checkNotebookPythonLsp, detectNotebookPython, listNotebookPythonModules } from '@/utils/notebookRuntime'
import { normalizeNotebookRuntimeConfig } from '@/utils/notebookRuntimeConfig'

const CONFIG_ACCESS_SESSION_KEY = '__ai_tools_config_access_password__'
const EMPTY_CONFIG_SECURITY = Object.freeze({
  passwordVerifier: null,
  recoveryQuestion: '',
  recoveryAnswerVerifier: null,
  passwordRecoveryEnvelope: ''
})

const generationModeOptions = [
  { label: '自动', value: 'auto' },
  { label: '开启', value: 'on' },
  { label: '关闭', value: 'off' }
]

const contextWindowPresetOptions = [
  { label: '紧凑', value: 'aggressive' },
  { label: '平衡', value: 'balanced' },
  { label: '宽松', value: 'wide' },
  { label: '自定义', value: 'custom' }
]

const contextWindowHistoryFocusOptions = [
  { label: '优先最近', value: 'recent' },
  { label: '平衡', value: 'balanced' },
  { label: '优先附件', value: 'attachments' }
]

const webSearchApiProviderOptions = [
  { label: '仅使用 HTML 搜索兜底', value: 'none' },
  { label: '博查搜索 API（国内友好，完整网页搜索）', value: 'bocha_search' },
  { label: 'DuckDuckGo Instant Answer（官方问答，不是完整网页搜索）', value: 'duckduckgo_instant_answer' },
  { label: 'Brave Search API（完整网页搜索）', value: 'brave_search' }
]

const theme = getTheme()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const chatConfig = getChatConfig()
const noteConfig = getNoteConfig()
const rawConfigSecurity = getConfigSecurity()
const dataStorageRoot = getDataStorageRoot()
const cloudConfig = getCloudConfig()
const webSearchConfig = getWebSearchConfig()
const providers = getProviders()

const configAccessReady = ref(false)
const configPageUnlocked = ref(false)
const pageUnlockPassword = ref('')
const pageUnlockLoading = ref(false)
let accessSyncToken = 0

const generationDraft = reactive({
  imageGenerationMode: 'auto',
  videoGenerationMode: 'auto'
})
const generationSaving = ref(false)

const systemPromptModal = reactive({
  show: false,
  value: '',
  loading: false
})

const contextWindowModal = reactive({
  show: false,
  loading: false
})
const contextWindowDraft = reactive({ ...DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG })
const cloudConfigModal = reactive({
  show: false,
  loading: false,
  form: {
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    endpoint: '',
    forcePathStyle: false,
    autoBackupEnabled: false,
    autoRestoreEnabled: false
  }
})
const notebookRuntimeDetecting = ref(false)
const detectedNotebookPython = ref('')
const detectedNotebookModules = ref([])
const notebookLspCheck = ref({ ok: false, error: '', pythonPath: '' })
const notebookRuntimeModal = reactive({
  show: false,
  loading: false,
  form: normalizeNotebookRuntimeConfig(noteConfig.value?.notebookRuntime)
})
const webSearchConfigDraft = reactive({
  proxyUrl: '',
  allowInsecureTlsFallback: true,
  searchApiProvider: 'none',
  searchApiKey: '',
  searchApiEndpoint: '',
  searchApiMarket: 'zh-CN'
})
const webSearchConfigSaving = ref(false)
const memorySaving = ref(false)
const memoryRebuilding = ref(false)
const memoryOpening = ref(false)

const cloudActionLoading = reactive({
  backup: false,
  restore: false,
  sync: false
})
const cloudAutoBackupSaving = ref(false)
const cloudAutoRestoreSaving = ref(false)

const cloudActionFeedback = reactive({
  visible: false,
  action: '',
  status: 'idle',
  title: '',
  summary: '',
  detail: '',
  current: 0,
  total: 0
})

const configPasswordModal = reactive({
  show: false,
  mode: 'set',
  loading: false,
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  recoveryQuestion: '',
  recoveryAnswer: '',
  recoveryAnswerConfirm: ''
})

const securityResetModal = reactive({
  show: false,
  loading: false,
  answer: '',
  newPassword: '',
  confirmPassword: '',
  recoveryQuestion: '',
  recoveryAnswer: '',
  recoveryAnswerConfirm: ''
})

const actionPasswordModal = reactive({
  show: false,
  action: '',
  title: '',
  description: '',
  password: '',
  loading: false
})
const actionPayload = ref(null)
const memoryDraft = reactive(normalizeChatMemoryConfig(DEFAULT_CHAT_MEMORY_CONFIG))

const noteSecurity = computed(() => normalizeNoteSecurityConfig(noteConfig.value?.noteSecurity))
const configSecurity = computed(() => normalizeConfigSecurityState(rawConfigSecurity.value))
const hasConfigPassword = computed(() => !!configSecurity.value.passwordVerifier)
const hasRecoveryQuestion = computed(() => {
  return !!configSecurity.value.recoveryQuestion
    && !!configSecurity.value.recoveryAnswerVerifier
    && !!configSecurity.value.passwordRecoveryEnvelope
})

const dataStorageRootText = computed(() => {
  const text = String(dataStorageRoot.value || '').trim()
  return text || '未设置，文件相关功能会使用插件默认目录。'
})

const detectedNotebookPythonText = computed(() => {
  const text = String(detectedNotebookPython.value || '').trim()
  return text || '未检测到可用 Python，请手动填写解释器路径。'
})
const defaultNotebookVenvRootText = computed(() => getDefaultNotebookVenvRootPath() || '未检测到本机默认目录')
const notebookLspStatus = computed(() => {
  const runtime = normalizeNotebookRuntimeConfig(noteConfig.value?.notebookRuntime)
  const configuredPath = String(runtime.pythonPath || '').trim()
  const effectivePath = configuredPath
  const moduleSet = new Set((Array.isArray(detectedNotebookModules.value) ? detectedNotebookModules.value : []).map((item) => String(item || '').trim()).filter(Boolean))
  const healthError = String(notebookLspCheck.value.error || '').trim().toLowerCase()
  if (!effectivePath) {
    return { type: 'default', label: 'LSP 未配置' }
  }
  if (notebookLspCheck.value.ok) {
    return { type: 'success', label: 'LSP 已启用' }
  }
  if (!moduleSet.has('jedi_language_server') || healthError.includes('no module named jedi_language_server')) {
    return { type: 'warning', label: 'LSP 缺少依赖' }
  }
  return { type: 'warning', label: 'LSP 未启用' }
})
const notebookLspStatusHelp = computed(() => {
  if (notebookLspStatus.value.type === 'success') {
    return '当前状态只根据 Notebook Runtime 配置中的 Python 解释器判断，且已通过语言服务器导入检查。'
  }
  if (notebookLspStatus.value.label === 'LSP 缺少依赖') {
    return '当前 Python 环境缺少 `jedi-language-server`，超级笔记补全不会启用。'
  }
  const healthError = String(notebookLspCheck.value.error || '').trim()
  if (healthError) return `当前状态只根据 Notebook Runtime 配置中的 Python 解释器判断。最近一次检查结果：${healthError}`
  return '当前状态只根据 Notebook Runtime 配置中的 Python 解释器判断。未启用不一定代表缺少依赖，也可能是解释器路径不可用或语言服务器启动失败。'
})

const notebookRuntimeSummary = computed(() => {
  const runtime = normalizeNotebookRuntimeConfig(noteConfig.value?.notebookRuntime)
  const configuredPath = String(runtime.pythonPath || '').trim()
  const configuredVenvRoot = String(runtime.venvRoot || '').trim()
  const detectedPath = String(detectedNotebookPython.value || '').trim()
  const effectivePath = configuredPath && configuredPath.toLowerCase() !== 'python'
    ? configuredPath
    : detectedPath || configuredPath || '未配置'
  const effectiveVenvRoot = configuredVenvRoot || getDefaultNotebookVenvRootPath() || '未配置'
  const pathLabel = configuredPath && configuredPath.toLowerCase() !== 'python'
    ? `Python: ${configuredPath}`
    : detectedPath
      ? `Python: 自动检测 ${detectedPath}`
      : `Python: ${configuredPath || '未配置'}`
  const venvRootLabel = configuredVenvRoot
    ? `Venv: ${configuredVenvRoot}`
    : `Venv: 默认 ${effectiveVenvRoot}`
  const kernelLabel = runtime.kernelName ? `Kernel: ${runtime.kernelName}` : 'Kernel: 默认'
  const startupTimeoutLabel = Number(runtime.startupTimeoutMs) > 0 ? `${runtime.startupTimeoutMs}ms` : '永不超时'
  const executeTimeoutLabel = Number(runtime.executeTimeoutMs) > 0 ? `${runtime.executeTimeoutMs}ms` : '永不超时'
  return `本机本地配置 / ${pathLabel} / ${venvRootLabel} / ${kernelLabel} / 启动 ${startupTimeoutLabel} / 执行 ${executeTimeoutLabel} / 生效解释器 ${effectivePath}`
})

const webSearchProxySummary = computed(() => {
  const proxyUrl = String(webSearchConfig.value?.proxyUrl || '').trim()
  const tlsLabel = webSearchConfig.value?.allowInsecureTlsFallback === false ? '证书兜底关闭' : '证书兜底开启'
  const apiProvider = String(webSearchConfig.value?.searchApiProvider || 'none')
  const apiLabel = apiProvider === 'bocha_search'
    ? '博查 API 优先'
    : apiProvider === 'brave_search'
      ? 'Brave API 优先'
      : apiProvider === 'duckduckgo_instant_answer'
        ? 'DuckDuckGo 问答 API 优先'
        : 'HTML 搜索优先'
  return proxyUrl
    ? `当前代理：${proxyUrl} / ${apiLabel} / ${tlsLabel}`
    : `当前直连 / ${apiLabel} / ${tlsLabel}。填写本机 HTTP 代理后，联网搜索会通过代理访问搜索源和网页。`
})

const systemPromptPreview = computed(() => {
  const raw = String(chatConfig.value?.defaultSystemPrompt || '').trim()
  if (!raw) return '未设置，将使用内置默认提示词。'
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw
})

const contextWindowSummary = computed(() => {
  const normalized = normalizeChatContextWindowConfig(chatConfig.value?.contextWindow)
  const presetLabel = getContextPresetLabel(normalized.preset)
  const focusLabel = getHistoryFocusLabel(normalized.historyFocus)
  return `${presetLabel} / ${focusLabel} / 最大 ${normalized.maxTurns} 轮，${normalized.maxMessages} 条消息，展开 ${normalized.maxCharsExpanded} 字符，压缩 ${normalized.maxCharsCompact} 字符`
})

const memoryProviderOptions = computed(() => {
  return (providers.value || []).map((provider) => ({
    label: provider?.name || provider?._id || '未命名服务商',
    value: String(provider?._id || '')
  }))
})

const memoryEmbeddingProviderOptions = computed(() => {
  return (providers.value || [])
    .filter((provider) => !provider?.builtin && String(provider?.providerType || '').trim() !== 'utools-ai')
    .map((provider) => ({
      label: provider?.name || provider?._id || '未命名服务商',
      value: String(provider?._id || '')
    }))
})

function findProviderById(id) {
  const target = String(id || '').trim()
  return (providers.value || []).find((provider) => String(provider?._id || '').trim() === target) || null
}

function buildProviderModelOptions(providerId) {
  const provider = findProviderById(providerId)
  return (provider?.selectModels || []).map((model) => ({
    label: String(model || ''),
    value: String(model || '')
  }))
}

const memoryExtractionModelOptions = computed(() => buildProviderModelOptions(memoryDraft.extraction.providerId))
const memoryEmbeddingModelOptions = computed(() => buildProviderModelOptions(memoryDraft.embedding.providerId))

const memoryConfigSummary = computed(() => {
  const memory = normalizeChatMemoryConfig(chatConfig.value?.memory)
  if (!memory.enabled) return '未启用。聊天不会提取或召回长期记忆。'
  const extractionProvider = findProviderById(memory.extraction.providerId)
  const embeddingProvider = findProviderById(memory.embedding.providerId)
  const extractionText = memory.extraction.model
    ? `提取：${extractionProvider?.name || memory.extraction.providerId} / ${memory.extraction.model}`
    : '提取模型未配置'
  const embeddingText = memory.embedding.model
    ? `向量：${embeddingProvider?.name || memory.embedding.providerId} / ${memory.embedding.model}`
    : '向量模型未配置，将降级为关键词召回'
  return [
    '已启用',
    extractionText,
    embeddingText,
    `召回 TopK ${memory.topK}`,
    `注入上限 ${memory.maxInjectChars} 字符`
  ].join(' / ')
})

const cloudConfigSummary = computed(() => {
  const cfg = cloudConfig.value || {}
  const endpoint = String(cfg.endpoint || '').trim()
  const bucket = String(cfg.bucket || '').trim()
  const region = String(cfg.region || '').trim()
  const autoBackupLabel = cfg.autoBackupEnabled
    ? (hasCompleteCloudConfig(cfg) ? '自动备份已开启' : '自动备份待补齐配置')
    : '自动备份关闭'
  const autoRestoreLabel = cfg.autoRestoreEnabled
    ? (hasCompleteCloudConfig(cfg) ? '自动恢复已开启' : '自动恢复待补齐配置')
    : '自动恢复关闭'
  if (!endpoint && !bucket && !region) return `未配置云同步 / ${autoBackupLabel} / ${autoRestoreLabel}。`
  return [bucket ? `Bucket: ${bucket}` : '', region ? `Region: ${region}` : '', endpoint ? `Endpoint: ${endpoint}` : '', autoBackupLabel, autoRestoreLabel]
    .filter(Boolean)
    .join(' / ')
})

const cloudAutoBackupEnabled = computed(() => cloudConfig.value?.autoBackupEnabled === true)
const cloudAutoRestoreEnabled = computed(() => cloudConfig.value?.autoRestoreEnabled === true)

const cloudActionPercentage = computed(() => {
  const total = Number(cloudActionFeedback.total || 0)
  const current = Number(cloudActionFeedback.current || 0)
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
})

const configPasswordSummary = computed(() => {
  if (!hasConfigPassword.value) return '未设置。设置后，进入全局配置页、导入导出配置，以及笔记密码重置都会走同一套校验。'
  return '已设置。修改和清除都必须输入当前密码；忘记密码时可通过安全问题重置。'
})

const configPasswordModalTitle = computed(() => {
  if (configPasswordModal.mode === 'clear') return '清除全局配置密码'
  if (configPasswordModal.mode === 'change') return '修改全局配置密码'
  return '设置全局配置密码'
})

watch(
  () => [chatConfig.value?.imageGenerationMode, chatConfig.value?.videoGenerationMode],
  ([nextImage, nextVideo]) => {
    generationDraft.imageGenerationMode = normalizeGenerationMode(nextImage)
    generationDraft.videoGenerationMode = normalizeGenerationMode(nextVideo)
  },
  { immediate: true }
)

function syncMemoryDraft(raw = chatConfig.value?.memory) {
  const normalized = normalizeChatMemoryConfig(raw)
  Object.assign(memoryDraft, normalized)
  memoryDraft.extraction = { ...normalized.extraction }
  memoryDraft.embedding = { ...normalized.embedding }
}

watch(
  () => chatConfig.value?.memory,
  (next) => {
    syncMemoryDraft(next)
  },
  { immediate: true, deep: true }
)

watch(
  () => memoryDraft.extraction.providerId,
  (next) => {
    const models = buildProviderModelOptions(next)
    if (!models.some((item) => item.value === memoryDraft.extraction.model)) {
      memoryDraft.extraction.model = models[0]?.value || ''
    }
  }
)

watch(
  () => memoryDraft.embedding.providerId,
  (next) => {
    const models = buildProviderModelOptions(next)
    if (!models.some((item) => item.value === memoryDraft.embedding.model)) {
      memoryDraft.embedding.model = models[0]?.value || ''
    }
  }
)

watch(
  () => contextWindowDraft.preset,
  (next, prev) => {
    if (!contextWindowModal.show) return
    if (!next || next === prev || next === 'custom') return
    Object.assign(
      contextWindowDraft,
      normalizeChatContextWindowConfig({
        preset: next,
        historyFocus: contextWindowDraft.historyFocus
      })
    )
  }
)

watch(
  () => webSearchConfig.value,
  (next) => {
    webSearchConfigDraft.proxyUrl = String(next?.proxyUrl || '').trim()
    webSearchConfigDraft.allowInsecureTlsFallback = next?.allowInsecureTlsFallback !== false
    webSearchConfigDraft.searchApiProvider = String(next?.searchApiProvider || 'none')
    webSearchConfigDraft.searchApiKey = String(next?.searchApiKey || '')
    webSearchConfigDraft.searchApiEndpoint = String(next?.searchApiEndpoint || '')
    webSearchConfigDraft.searchApiMarket = String(next?.searchApiMarket || 'zh-CN')
  },
  { immediate: true }
)

void refreshNotebookPythonDetection()

watch(
  () => configSecurity.value.passwordVerifier,
  () => {
    void syncConfigAccessState()
  },
  { immediate: true }
)

function normalizeConfigSecurityState(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    passwordVerifier: src.passwordVerifier || null,
    recoveryQuestion: typeof src.recoveryQuestion === 'string' ? src.recoveryQuestion.trim() : '',
    recoveryAnswerVerifier: src.recoveryAnswerVerifier || null,
    passwordRecoveryEnvelope: typeof src.passwordRecoveryEnvelope === 'string' ? src.passwordRecoveryEnvelope.trim() : ''
  }
}

function normalizeGenerationMode(value) {
  const text = String(value || 'auto').trim().toLowerCase()
  return ['auto', 'on', 'off'].includes(text) ? text : 'auto'
}

function getContextPresetLabel(value) {
  const match = contextWindowPresetOptions.find((item) => item.value === value)
  return match?.label || '平衡'
}

function getHistoryFocusLabel(value) {
  const match = contextWindowHistoryFocusOptions.find((item) => item.value === value)
  return match?.label || '平衡'
}

function hasCompleteCloudConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  return ['region', 'accessKeyId', 'secretAccessKey', 'bucket'].every((key) => String(cfg[key] || '').trim())
}

async function refreshNotebookPythonDetection() {
  notebookRuntimeDetecting.value = true
  try {
    const result = await detectNotebookPython()
    detectedNotebookPython.value = String(result?.pythonPath || result?.path || result || '').trim()
    const runtime = normalizeNotebookRuntimeConfig(noteConfig.value?.notebookRuntime)
    const configuredPath = String(runtime.pythonPath || '').trim()
    const modulePythonPath = configuredPath || 'python'
    if (modulePythonPath) {
      const [moduleResult, lspResult] = await Promise.all([
        listNotebookPythonModules({ pythonPath: modulePythonPath }),
        checkNotebookPythonLsp({ pythonPath: modulePythonPath })
      ])
      detectedNotebookModules.value = Array.isArray(moduleResult?.modules) ? moduleResult.modules : []
      notebookLspCheck.value = {
        ok: !!lspResult?.ok,
        error: String(lspResult?.error || '').trim(),
        pythonPath: String(lspResult?.pythonPath || modulePythonPath).trim()
      }
    } else {
      detectedNotebookModules.value = []
      notebookLspCheck.value = { ok: false, error: '', pythonPath: '' }
    }
  } catch (err) {
    detectedNotebookPython.value = ''
    detectedNotebookModules.value = []
    notebookLspCheck.value = { ok: false, error: '', pythonPath: '' }
    message.error(err?.message || String(err))
  } finally {
    notebookRuntimeDetecting.value = false
  }
}

function fillNotebookRuntimeForm(raw = noteConfig.value?.notebookRuntime) {
  notebookRuntimeModal.form = normalizeNotebookRuntimeConfig(raw)
}

function openNotebookRuntimeModal() {
  fillNotebookRuntimeForm(noteConfig.value?.notebookRuntime)
  notebookRuntimeModal.show = true
  notebookRuntimeModal.loading = false
}

function closeNotebookRuntimeModal() {
  notebookRuntimeModal.show = false
  notebookRuntimeModal.loading = false
}

function handleUseDetectedNotebookPython() {
  const detectedPath = String(detectedNotebookPython.value || '').trim()
  if (!detectedPath) {
    message.warning('当前未检测到可用的 Python 解释器')
    return
  }
  notebookRuntimeModal.form.pythonPath = detectedPath
}

function handlePickNotebookVenvRoot() {
  try {
    const nextPath = openDirectoryDialog()
    if (!nextPath) return
    notebookRuntimeModal.form.venvRoot = nextPath
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

function handleResetNotebookVenvRoot() {
  notebookRuntimeModal.form.venvRoot = ''
}

function isAbsoluteDirectoryPath(input = '') {
  const text = String(input || '').trim()
  if (!text) return false
  return /^[A-Za-z]:[\\/]/.test(text) || /^\\\\/.test(text) || text.startsWith('/')
}

function validateWebSearchProxyUrl(proxyUrl) {
  const text = String(proxyUrl || '').trim()
  if (!text) return ''
  let parsed = null
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('代理地址格式不正确，例如：http://127.0.0.1:7890')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('联网搜索代理目前支持 HTTP/HTTPS 代理，例如：http://127.0.0.1:7890')
  }
  if (!parsed.hostname) {
    throw new Error('代理地址缺少主机名，例如：http://127.0.0.1:7890')
  }
  return parsed.toString().replace(/\/$/, '')
}

function validateWebSearchApiProvider(provider) {
  const text = String(provider || 'none').trim()
  if (webSearchApiProviderOptions.some((item) => item.value === text)) return text
  return 'none'
}

function validateOptionalHttpUrl(input, label) {
  const text = String(input || '').trim()
  if (!text) return ''
  let parsed = null
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`${label}格式不正确`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label}必须是 HTTP/HTTPS 地址`)
  }
  return parsed.toString()
}

async function saveWebSearchConfig() {
  webSearchConfigSaving.value = true
  try {
    const proxyUrl = validateWebSearchProxyUrl(webSearchConfigDraft.proxyUrl)
    const searchApiProvider = validateWebSearchApiProvider(webSearchConfigDraft.searchApiProvider)
    const searchApiKey = String(webSearchConfigDraft.searchApiKey || '').trim()
    const searchApiEndpoint = validateOptionalHttpUrl(webSearchConfigDraft.searchApiEndpoint, '搜索 API Endpoint')
    const searchApiMarket = String(webSearchConfigDraft.searchApiMarket || '').trim() || 'zh-CN'
    if ((searchApiProvider === 'bocha_search' || searchApiProvider === 'brave_search') && !searchApiKey) {
      throw new Error(searchApiProvider === 'bocha_search' ? '使用博查搜索 API 时需要填写 API Key' : '使用 Brave Search API 时需要填写 API Key')
    }
    await updateWebSearchConfig({
      proxyUrl,
      allowInsecureTlsFallback: webSearchConfigDraft.allowInsecureTlsFallback !== false,
      searchApiProvider,
      searchApiKey: searchApiProvider === 'bocha_search' || searchApiProvider === 'brave_search' ? searchApiKey : '',
      searchApiEndpoint: searchApiProvider === 'bocha_search' || searchApiProvider === 'brave_search' ? searchApiEndpoint : '',
      searchApiMarket
    })
    webSearchConfigDraft.proxyUrl = proxyUrl
    webSearchConfigDraft.searchApiProvider = searchApiProvider
    webSearchConfigDraft.searchApiKey = searchApiProvider === 'bocha_search' || searchApiProvider === 'brave_search' ? searchApiKey : ''
    webSearchConfigDraft.searchApiEndpoint = searchApiProvider === 'bocha_search' || searchApiProvider === 'brave_search' ? searchApiEndpoint : ''
    webSearchConfigDraft.searchApiMarket = searchApiMarket
    message.success(proxyUrl ? '联网搜索设置已保存到当前电脑本地' : '联网搜索已改为直连')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    webSearchConfigSaving.value = false
  }
}

async function saveNotebookRuntimeConfig() {
  notebookRuntimeModal.loading = true
  try {
    const normalized = normalizeNotebookRuntimeConfig(notebookRuntimeModal.form)
    if (normalized.venvRoot && !isAbsoluteDirectoryPath(normalized.venvRoot)) {
      throw new Error('虚拟环境存储目录必须填写绝对路径，或留空使用默认目录。')
    }
    await updateNoteConfig({
      notebookRuntime: normalized
    })
    try {
      const pythonPath = String(normalized.pythonPath || '').trim() || 'python'
      const [moduleResult, lspResult] = await Promise.all([
        listNotebookPythonModules({ pythonPath }),
        checkNotebookPythonLsp({ pythonPath })
      ])
      detectedNotebookModules.value = Array.isArray(moduleResult?.modules) ? moduleResult.modules : []
      notebookLspCheck.value = {
        ok: !!lspResult?.ok,
        error: String(lspResult?.error || '').trim(),
        pythonPath: String(lspResult?.pythonPath || pythonPath).trim()
      }
    } catch {
      detectedNotebookModules.value = []
      notebookLspCheck.value = { ok: false, error: '', pythonPath: '' }
    }
    fillNotebookRuntimeForm(normalized)
    closeNotebookRuntimeModal()
    message.success('Notebook Runtime 配置已保存到当前电脑本地')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    notebookRuntimeModal.loading = false
  }
}

function getUtoolsApi() {
  return window?.utools || globalThis?.utools
}

function extractDialogPath(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return entry.trim()
  if (typeof entry === 'object') {
    const candidates = [entry.path, entry.filePath, entry.fullPath, entry.value]
    for (const candidate of candidates) {
      const text = typeof candidate === 'string' ? candidate.trim() : ''
      if (text) return text
    }
  }
  return ''
}

function resolveOpenDialogPath(result) {
  if (!result) return ''
  if (Array.isArray(result)) return extractDialogPath(result[0])
  if (typeof result === 'object' && Array.isArray(result.filePaths)) return extractDialogPath(result.filePaths[0])
  return extractDialogPath(result)
}

function resolveSaveDialogPath(result) {
  if (!result) return ''
  if (typeof result === 'string') return result.trim()
  if (typeof result === 'object') return extractDialogPath(result)
  return ''
}

function openDirectoryDialog() {
  const api = getUtoolsApi()
  if (!api?.showOpenDialog) throw new Error('当前环境不支持目录选择。')
  return resolveOpenDialogPath(api.showOpenDialog({ properties: ['openDirectory'] }))
}

function getDefaultNotebookVenvRootPath() {
  const userDataRoot = String(getUtoolsApi()?.getPath?.('userData') || '').trim()
  if (!userDataRoot) return ''
  const trimmed = userDataRoot.replace(/[\\/]+$/, '')
  const useBackslash = trimmed.includes('\\')
  return useBackslash
    ? `${trimmed}\\.ai-tools-local\\venv`
    : `${trimmed}/.ai-tools-local/venv`
}

function openFileDialog() {
  const api = getUtoolsApi()
  if (!api?.showOpenDialog) throw new Error('当前环境不支持文件选择。')
  return resolveOpenDialogPath(
    api.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
  )
}

function saveFileDialog() {
  const api = getUtoolsApi()
  if (!api?.showSaveDialog) throw new Error('当前环境不支持保存文件对话框。')
  return resolveSaveDialogPath(
    api.showSaveDialog({
      title: '导出全局配置',
      defaultPath: 'ai-tools-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
  )
}

function getSessionPassword() {
  const host = typeof window !== 'undefined' ? window : globalThis
  return String(host?.[CONFIG_ACCESS_SESSION_KEY] || '')
}

function setSessionPassword(password) {
  const text = String(password || '')
  globalThis[CONFIG_ACCESS_SESSION_KEY] = text
  if (typeof window !== 'undefined') window[CONFIG_ACCESS_SESSION_KEY] = text
}

function clearSessionPassword() {
  try {
    delete globalThis[CONFIG_ACCESS_SESSION_KEY]
  } catch {
    globalThis[CONFIG_ACCESS_SESSION_KEY] = ''
  }
  if (typeof window !== 'undefined') {
    try {
      delete window[CONFIG_ACCESS_SESSION_KEY]
    } catch {
      window[CONFIG_ACCESS_SESSION_KEY] = ''
    }
  }
}

async function syncConfigAccessState() {
  const token = ++accessSyncToken
  configAccessReady.value = false

  if (!hasConfigPassword.value) {
    clearSessionPassword()
    configPageUnlocked.value = true
    configAccessReady.value = true
    return
  }

  const cachedPassword = getSessionPassword()
  if (!cachedPassword) {
    configPageUnlocked.value = false
    configAccessReady.value = true
    return
  }

  try {
    const ok = await verifyPassword(cachedPassword, configSecurity.value.passwordVerifier)
    if (token !== accessSyncToken) return
    if (ok) {
      configPageUnlocked.value = true
    } else {
      clearSessionPassword()
      configPageUnlocked.value = false
    }
  } catch {
    clearSessionPassword()
    configPageUnlocked.value = false
  } finally {
    if (token === accessSyncToken) configAccessReady.value = true
  }
}

async function submitPageUnlock() {
  const password = String(pageUnlockPassword.value || '')
  if (!password) {
    message.warning('请输入全局配置密码')
    return
  }

  pageUnlockLoading.value = true
  try {
    const ok = await verifyPassword(password, configSecurity.value.passwordVerifier)
    if (!ok) {
      message.error('全局配置密码错误')
      return
    }
    setSessionPassword(password)
    configPageUnlocked.value = true
    configAccessReady.value = true
    pageUnlockPassword.value = ''
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    pageUnlockLoading.value = false
  }
}

function cloneProtectedNotesMap() {
  const out = {}
  Object.entries(noteSecurity.value.protectedNotes || {}).forEach(([notePath, meta]) => {
    out[notePath] = { ...meta }
  })
  return out
}

async function assertCurrentConfigPassword(password) {
  const text = String(password || '')
  if (!text) throw new Error('请输入当前全局配置密码')
  const ok = await verifyPassword(text, configSecurity.value.passwordVerifier)
  if (!ok) throw new Error('当前全局配置密码错误')
  return text
}

async function buildConfigSecurityPayload(password, recoveryQuestion, recoveryAnswer) {
  const nextPassword = String(password || '')
  const question = String(recoveryQuestion || '').trim()
  const answer = String(recoveryAnswer || '')

  if (!nextPassword) throw new Error('新的全局配置密码不能为空')
  if (!question) throw new Error('安全问题不能为空')
  if (!answer) throw new Error('安全问题答案不能为空')

  return {
    passwordVerifier: await createPasswordVerifier(nextPassword),
    recoveryQuestion: question,
    recoveryAnswerVerifier: await createPasswordVerifier(answer),
    passwordRecoveryEnvelope: await encryptTextWithPassword(nextPassword, answer)
  }
}

async function rollbackNoteRewrites(writtenEntries) {
  for (let i = writtenEntries.length - 1; i >= 0; i -= 1) {
    const item = writtenEntries[i]
    try {
      await writeFile(item.notePath, item.originalRaw)
    } catch (err) {
      console.error('[Config] failed to rollback protected note rewrite', item.notePath, err)
    }
  }
}

async function prepareFallbackMigration(currentPassword, nextPassword) {
  const nextProtectedNotes = cloneProtectedNotesMap()
  const rewrites = []
  const now = new Date().toISOString()

  for (const [notePath, meta] of Object.entries(nextProtectedNotes)) {
    if (!meta?.hasFallbackRecovery) continue

    const raw = String(await readFile(notePath, 'utf-8') || '')
    if (!hasFallbackRecovery(raw)) {
      nextProtectedNotes[notePath] = {
        ...meta,
        hasFallbackRecovery: false
      }
      continue
    }

    const nextRaw = await changeFallbackPassword(raw, {
      currentFallbackPassword: currentPassword,
      newFallbackPassword: nextPassword
    })

    rewrites.push({
      notePath,
      originalRaw: raw,
      nextRaw
    })

    nextProtectedNotes[notePath] = {
      ...meta,
      updatedAt: now,
      hasFallbackRecovery: !!nextPassword
    }
  }

  return { nextProtectedNotes, rewrites }
}

async function applyConfigPasswordTransition(options = {}) {
  const clearPassword = !!options.clearPassword
  const currentPassword = String(options.currentPassword || '')
  const nextPassword = String(options.newPassword || '')
  const nextConfigSecurity = clearPassword ? { ...EMPTY_CONFIG_SECURITY } : { ...(options.nextConfigSecurity || EMPTY_CONFIG_SECURITY) }
  const baseNoteSecurity = noteSecurity.value
  const migration = hasConfigPassword.value
    ? await prepareFallbackMigration(currentPassword, clearPassword ? '' : nextPassword)
    : { nextProtectedNotes: cloneProtectedNotesMap(), rewrites: [] }

  const writtenEntries = []
  try {
    for (const item of migration.rewrites) {
      if (item.originalRaw === item.nextRaw) continue
      await writeFile(item.notePath, item.nextRaw)
      writtenEntries.push(item)
    }
  } catch (err) {
    await rollbackNoteRewrites(writtenEntries)
    throw err
  }

  try {
    await updateGlobalConfig({
      noteConfig: {
        noteSecurity: {
          ...baseNoteSecurity,
          protectedNotes: migration.nextProtectedNotes
        }
      },
      configSecurity: nextConfigSecurity
    })
  } catch (err) {
    await rollbackNoteRewrites(writtenEntries)
    throw err
  }

  if (clearPassword) {
    clearSessionPassword()
  } else {
    setSessionPassword(nextPassword)
  }
  configPageUnlocked.value = true
  configAccessReady.value = true
  pageUnlockPassword.value = ''
}

async function handleToggleTheme() {
  try {
    await cutTheme()
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

async function handlePickDataStorageRoot() {
  try {
    const nextPath = openDirectoryDialog()
    if (!nextPath) return
    await setDataStorageRoot(nextPath)
    message.success('数据存储根目录已更新')
  } catch (err) {
    message.error(describeFileOperationsError(err, '设置数据存储根目录'))
  }
}

async function handleResetDataStorageRoot() {
  try {
    await resetDataStorageRoot()
    message.success('数据存储根目录已恢复默认')
  } catch (err) {
    message.error(describeFileOperationsError(err, '重置数据存储根目录'))
  }
}

function openSystemPromptModal() {
  systemPromptModal.show = true
  systemPromptModal.value = String(chatConfig.value?.defaultSystemPrompt || '')
  systemPromptModal.loading = false
}

function closeSystemPromptModal() {
  systemPromptModal.show = false
  systemPromptModal.value = ''
  systemPromptModal.loading = false
}

async function saveSystemPrompt() {
  systemPromptModal.loading = true
  try {
    await updateChatConfig({
      defaultSystemPrompt: String(systemPromptModal.value || '')
    })
    closeSystemPromptModal()
    message.success('默认系统提示词已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    systemPromptModal.loading = false
  }
}

async function saveGenerationModes() {
  generationSaving.value = true
  try {
    await updateChatConfig({
      imageGenerationMode: normalizeGenerationMode(generationDraft.imageGenerationMode),
      videoGenerationMode: normalizeGenerationMode(generationDraft.videoGenerationMode)
    })
    message.success('生成模式已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    generationSaving.value = false
  }
}

function syncContextWindowDraft(raw = chatConfig.value?.contextWindow) {
  Object.assign(contextWindowDraft, normalizeChatContextWindowConfig(raw))
}

function openContextWindowModal() {
  syncContextWindowDraft(chatConfig.value?.contextWindow)
  contextWindowModal.show = true
  contextWindowModal.loading = false
}

function closeContextWindowModal() {
  contextWindowModal.show = false
  contextWindowModal.loading = false
}

async function saveContextWindow() {
  contextWindowModal.loading = true
  try {
    const normalized = normalizeChatContextWindowConfig({ ...contextWindowDraft })
    await updateChatConfig({ contextWindow: normalized })
    closeContextWindowModal()
    message.success('上下文窗口策略已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    contextWindowModal.loading = false
  }
}

async function saveMemoryConfig() {
  memorySaving.value = true
  try {
    const normalized = normalizeChatMemoryConfig({
      ...memoryDraft,
      extraction: { ...memoryDraft.extraction },
      embedding: { ...memoryDraft.embedding }
    })
    await updateChatConfig({ memory: normalized })
    syncMemoryDraft(normalized)
    message.success('聊天记忆配置已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    memorySaving.value = false
  }
}

function openMemoryPage() {
  if (memoryDraft.enabled !== true) {
    message.warning('请先启用聊天记忆，再进入记忆管理页')
    return
  }
  router.push({ name: 'memory' })
}

async function handleRebuildMemory() {
  memoryRebuilding.value = true
  try {
    await rebuildMemoryEmbeddings()
    message.success('记忆向量已重建')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    memoryRebuilding.value = false
  }
}

async function handleOpenMemoryFolder() {
  memoryOpening.value = true
  try {
    await manageMemoryStore('open')
  } catch (err) {
    message.error(describeFileOperationsError(err, '打开记忆目录'))
  } finally {
    memoryOpening.value = false
  }
}

async function handleCleanMemoryStore() {
  try {
    await manageMemoryStore('clean')
    message.success('记忆已完成清洗与合并')
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

function fillCloudConfigForm(raw = cloudConfig.value) {
  const src = raw && typeof raw === 'object' ? raw : {}
  cloudConfigModal.form.region = String(src.region || '')
  cloudConfigModal.form.accessKeyId = String(src.accessKeyId || '')
  cloudConfigModal.form.secretAccessKey = String(src.secretAccessKey || '')
  cloudConfigModal.form.bucket = String(src.bucket || '')
  cloudConfigModal.form.endpoint = String(src.endpoint || '')
  cloudConfigModal.form.forcePathStyle = !!src.forcePathStyle
  cloudConfigModal.form.autoBackupEnabled = src.autoBackupEnabled === true
  cloudConfigModal.form.autoRestoreEnabled = src.autoRestoreEnabled === true
}

function openCloudConfigModal() {
  fillCloudConfigForm(cloudConfig.value)
  cloudConfigModal.show = true
  cloudConfigModal.loading = false
}

function closeCloudConfigModal() {
  cloudConfigModal.show = false
  cloudConfigModal.loading = false
}

async function saveCloudConfig() {
  cloudConfigModal.loading = true
  try {
    await updateCloudConfig({
      region: cloudConfigModal.form.region.trim(),
      accessKeyId: cloudConfigModal.form.accessKeyId.trim(),
      secretAccessKey: cloudConfigModal.form.secretAccessKey.trim(),
      bucket: cloudConfigModal.form.bucket.trim(),
      endpoint: cloudConfigModal.form.endpoint.trim(),
      forcePathStyle: !!cloudConfigModal.form.forcePathStyle,
      autoBackupEnabled: cloudConfigModal.form.autoBackupEnabled === true,
      autoRestoreEnabled: cloudConfigModal.form.autoRestoreEnabled === true
    })
    closeCloudConfigModal()
    message.success('云同步配置已保存')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    cloudConfigModal.loading = false
  }
}

async function handleToggleCloudAutoBackup(value) {
  const enabled = value === true
  cloudAutoBackupSaving.value = true
  try {
    await updateCloudConfig({ autoBackupEnabled: enabled })
    if (enabled && !hasCompleteCloudConfig(cloudConfig.value)) {
      message.warning('自动备份已开启，补齐云同步配置后会开始后台备份')
    } else {
      message.success(enabled ? '自动备份已开启' : '自动备份已关闭')
    }
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    cloudAutoBackupSaving.value = false
  }
}

async function handleToggleCloudAutoRestore(value) {
  const enabled = value === true
  cloudAutoRestoreSaving.value = true
  try {
    await updateCloudConfig({ autoRestoreEnabled: enabled })
    if (enabled && !hasCompleteCloudConfig(cloudConfig.value)) {
      message.warning('自动恢复已开启，补齐云同步配置后会开始后台恢复')
    } else {
      message.success(enabled ? '自动恢复已开启' : '自动恢复已关闭')
    }
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    cloudAutoRestoreSaving.value = false
  }
}

function getCloudActionLabel(action) {
  if (action === 'backup') return '备份到云端'
  if (action === 'sync') return '以本地为准同步到云端'
  return '从云端恢复'
}

function getCloudActionConfirmOptions(action) {
  if (action === 'backup') {
    return {
      title: '确认备份到云端',
      content: '会上传本地文件并覆盖云端同名文件，不会删除云端已有文件。',
      positiveText: '开始备份'
    }
  }

  if (action === 'sync') {
    return {
      title: '确认以本地为准同步到云端',
      content: '会上传本地文件并覆盖云端同名文件，同时删除云端中本地不存在的文件。请确认当前本地数据就是你要保留的版本。',
      positiveText: '开始同步'
    }
  }

  return {
    title: '确认从云端恢复',
    content: '从云端恢复会覆盖本地已有文件，建议先执行一次“备份到云端”或手动导出配置。',
    positiveText: '继续恢复'
  }
}

function beginCloudActionFeedback(action) {
  cloudActionFeedback.visible = true
  cloudActionFeedback.action = action
  cloudActionFeedback.status = 'running'
  cloudActionFeedback.title = `${getCloudActionLabel(action)}进行中`
  cloudActionFeedback.summary = '正在准备文件列表...'
  cloudActionFeedback.detail = action === 'backup'
    ? '会上传本地文件并覆盖云端同名文件。'
    : action === 'sync'
      ? '会执行上传覆盖和云端删除两类操作，并以本地数据为准。'
      : '会下载云端文件并覆盖本地同名文件。'
  cloudActionFeedback.current = 0
  cloudActionFeedback.total = 0
}

function updateCloudActionFeedback(action, current, total) {
  const nextCurrent = Math.max(0, Number(current) || 0)
  const nextTotal = Math.max(nextCurrent, Number(total) || 0)
  cloudActionFeedback.visible = true
  cloudActionFeedback.action = action
  cloudActionFeedback.status = 'running'
  cloudActionFeedback.title = `${getCloudActionLabel(action)}进行中`
  cloudActionFeedback.current = nextCurrent
  cloudActionFeedback.total = nextTotal
  cloudActionFeedback.summary = nextTotal > 0
    ? `已处理 ${nextCurrent} / ${nextTotal} 项`
    : '正在准备文件列表...'
  cloudActionFeedback.detail = action === 'sync'
    ? '同步过程会同时统计上传覆盖和云端删除操作。'
    : action === 'backup'
      ? '处理进度包含本地文件上传过程，最终会显示实际上传数量。'
      : '处理进度包含云端文件下载过程，最终会显示实际下载数量。'
}

function buildCloudActionSuccessSummary(action, result) {
  const total = Math.max(Number(cloudActionFeedback.total || 0), Number(cloudActionFeedback.current || 0))
  if (action === 'backup') {
    const uploaded = Math.max(0, Number(result?.uploaded || 0))
    return `已处理 ${total} 项，上传/覆盖 ${uploaded} 个文件。`
  }
  if (action === 'sync') {
    const uploaded = Math.max(0, Number(result?.uploaded || 0))
    const deleted = Math.max(0, Number(result?.deleted || 0))
    return `已执行 ${total} 项操作，上传/覆盖 ${uploaded} 个文件，删除云端 ${deleted} 个文件。`
  }
  const downloaded = Math.max(0, Number(result?.downloaded || 0))
  return `已处理 ${total} 项，下载/覆盖 ${downloaded} 个文件。`
}

async function handleCloudAction(action) {
  beginCloudActionFeedback(action)
  cloudActionLoading[action] = true
  try {
    const progressCallback = (current, total) => {
      updateCloudActionFeedback(action, current, total)
    }

    let result
    if (action === 'backup') result = await backupToCloud(progressCallback)
    else if (action === 'sync') result = await syncToCloud(progressCallback)
    else result = await restoreFromCloud(progressCallback)

    const summary = buildCloudActionSuccessSummary(action, result)
    cloudActionFeedback.visible = true
    cloudActionFeedback.action = action
    cloudActionFeedback.status = 'success'
    cloudActionFeedback.title = `${getCloudActionLabel(action)}已完成`
    cloudActionFeedback.summary = summary
    cloudActionFeedback.detail = action === 'sync'
      ? '云端已按本地状态完成收敛。'
      : action === 'backup'
        ? '云端同名文件已使用本地版本覆盖。'
        : '本地同名文件已使用云端版本覆盖。'
    cloudActionFeedback.current = Math.max(cloudActionFeedback.current, cloudActionFeedback.total)
    if (action === 'restore') resetMemoryStoreCache()
    message.success(summary)
  } catch (err) {
    const label = getCloudActionLabel(action)
    const errorText = describeFileOperationsError(err, label)
    cloudActionFeedback.visible = true
    cloudActionFeedback.action = action
    cloudActionFeedback.status = 'error'
    cloudActionFeedback.title = `${label}失败`
    cloudActionFeedback.summary = errorText
    cloudActionFeedback.detail = ''
    message.error(errorText)
  } finally {
    cloudActionLoading[action] = false
  }
}

function confirmCloudAction(action) {
  const options = getCloudActionConfirmOptions(action)
  dialog.warning({
    title: options.title,
    content: options.content,
    positiveText: options.positiveText,
    negativeText: '取消',
    onPositiveClick: () => {
      void handleCloudAction(action)
    }
  })
}

function resetConfigPasswordModalState() {
  configPasswordModal.show = false
  configPasswordModal.mode = 'set'
  configPasswordModal.loading = false
  configPasswordModal.currentPassword = ''
  configPasswordModal.newPassword = ''
  configPasswordModal.confirmPassword = ''
  configPasswordModal.recoveryQuestion = ''
  configPasswordModal.recoveryAnswer = ''
  configPasswordModal.recoveryAnswerConfirm = ''
}

function openConfigPasswordModal(mode) {
  resetConfigPasswordModalState()
  configPasswordModal.show = true
  configPasswordModal.mode = mode
  if (mode !== 'clear') configPasswordModal.recoveryQuestion = configSecurity.value.recoveryQuestion || ''
}

function closeConfigPasswordModal() {
  resetConfigPasswordModalState()
}

async function submitConfigPasswordModal() {
  configPasswordModal.loading = true
  try {
    if (configPasswordModal.mode === 'clear') {
      const currentPassword = await assertCurrentConfigPassword(configPasswordModal.currentPassword)
      await applyConfigPasswordTransition({
        currentPassword,
        clearPassword: true
      })
      closeConfigPasswordModal()
      message.success('全局配置密码已清除')
      return
    }

    const newPassword = String(configPasswordModal.newPassword || '')
    const confirmPassword = String(configPasswordModal.confirmPassword || '')
    const question = String(configPasswordModal.recoveryQuestion || '').trim()
    const answer = String(configPasswordModal.recoveryAnswer || '')
    const answerConfirm = String(configPasswordModal.recoveryAnswerConfirm || '')

    if (!newPassword) throw new Error('新的全局配置密码不能为空')
    if (newPassword !== confirmPassword) throw new Error('两次输入的全局配置密码不一致')
    if (!question) throw new Error('安全问题不能为空')
    if (!answer) throw new Error('安全问题答案不能为空')
    if (answer !== answerConfirm) throw new Error('两次输入的安全问题答案不一致')

    let currentPassword = ''
    if (configPasswordModal.mode === 'change') {
      currentPassword = await assertCurrentConfigPassword(configPasswordModal.currentPassword)
    }

    const nextConfigSecurity = await buildConfigSecurityPayload(newPassword, question, answer)
    await applyConfigPasswordTransition({
      currentPassword,
      newPassword,
      nextConfigSecurity,
      clearPassword: false
    })
    closeConfigPasswordModal()
    message.success(configPasswordModal.mode === 'change' ? '全局配置密码已修改' : '全局配置密码已设置')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    configPasswordModal.loading = false
  }
}

function resetSecurityResetModalState() {
  securityResetModal.show = false
  securityResetModal.loading = false
  securityResetModal.answer = ''
  securityResetModal.newPassword = ''
  securityResetModal.confirmPassword = ''
  securityResetModal.recoveryQuestion = ''
  securityResetModal.recoveryAnswer = ''
  securityResetModal.recoveryAnswerConfirm = ''
}

function openSecurityResetModal() {
  if (!hasRecoveryQuestion.value) {
    message.warning('当前未设置可用的安全问题')
    return
  }
  resetSecurityResetModalState()
  securityResetModal.show = true
  securityResetModal.recoveryQuestion = configSecurity.value.recoveryQuestion || ''
}

function closeSecurityResetModal() {
  resetSecurityResetModalState()
}

async function submitSecurityReset() {
  securityResetModal.loading = true
  try {
    const answer = String(securityResetModal.answer || '')
    const newPassword = String(securityResetModal.newPassword || '')
    const confirmPassword = String(securityResetModal.confirmPassword || '')
    const question = String(securityResetModal.recoveryQuestion || '').trim()
    const newAnswer = String(securityResetModal.recoveryAnswer || '')
    const newAnswerConfirm = String(securityResetModal.recoveryAnswerConfirm || '')

    if (!answer) throw new Error('请输入当前安全问题答案')
    if (!newPassword) throw new Error('新的全局配置密码不能为空')
    if (newPassword !== confirmPassword) throw new Error('两次输入的全局配置密码不一致')
    if (!question) throw new Error('新的安全问题不能为空')
    if (!newAnswer) throw new Error('新的安全问题答案不能为空')
    if (newAnswer !== newAnswerConfirm) throw new Error('两次输入的安全问题答案不一致')

    const answerOk = await verifyPassword(answer, configSecurity.value.recoveryAnswerVerifier)
    if (!answerOk) throw new Error('安全问题答案错误')

    const currentPassword = await decryptTextWithPassword(configSecurity.value.passwordRecoveryEnvelope, answer)
    const nextConfigSecurity = await buildConfigSecurityPayload(newPassword, question, newAnswer)
    await applyConfigPasswordTransition({
      currentPassword,
      newPassword,
      nextConfigSecurity,
      clearPassword: false
    })
    closeSecurityResetModal()
    message.success('全局配置密码已通过安全问题重置')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    securityResetModal.loading = false
  }
}

function closeActionPasswordModal() {
  actionPasswordModal.show = false
  actionPasswordModal.action = ''
  actionPasswordModal.title = ''
  actionPasswordModal.description = ''
  actionPasswordModal.password = ''
  actionPasswordModal.loading = false
  actionPayload.value = null
}

function requestProtectedAction(action, payload) {
  if (!hasConfigPassword.value) {
    return performProtectedAction(action, payload)
  }

  actionPasswordModal.show = true
  actionPasswordModal.action = action
  actionPasswordModal.title = action === 'export' ? '导出配置验证' : '导入配置验证'
  actionPasswordModal.description = action === 'export'
    ? '导出配置前，请再次输入当前全局配置密码。'
    : '导入配置前，请再次输入当前全局配置密码。'
  actionPasswordModal.password = ''
  actionPasswordModal.loading = false
  actionPayload.value = payload
  return Promise.resolve()
}

async function submitActionPassword() {
  actionPasswordModal.loading = true
  try {
    const password = await assertCurrentConfigPassword(actionPasswordModal.password)
    await performProtectedAction(actionPasswordModal.action, actionPayload.value, password)
    closeActionPasswordModal()
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    actionPasswordModal.loading = false
  }
}

async function performProtectedAction(action, payload) {
  if (!payload?.filePath) throw new Error('目标文件路径不能为空')

  if (action === 'export') {
    await exportGlobalConfigToFile(payload.filePath)
    message.success('配置已导出')
    return
  }

  await importGlobalConfigFromFile(payload.filePath)
  message.success('配置已导入')
}

async function handleExportConfig() {
  try {
    const filePath = saveFileDialog()
    if (!filePath) return
    await requestProtectedAction('export', { filePath })
  } catch (err) {
    message.error(err?.message || String(err))
  }
}

async function handleImportConfig() {
  try {
    const filePath = openFileDialog()
    if (!filePath) return
    dialog.warning({
      title: '确认导入配置',
      content: '导入会覆盖当前全局配置，是否继续？',
      positiveText: '继续导入',
      negativeText: '取消',
      onPositiveClick: async () => {
        await requestProtectedAction('import', { filePath })
      }
    })
  } catch (err) {
    message.error(err?.message || String(err))
  }
}
</script>

<style scoped>
.settings-page {
  position: relative;
  padding-bottom: 8px;
}

.settings-page::before {
  content: '';
  position: absolute;
  inset: 10px 0 auto;
  height: 220px;
  border-radius: 30px;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 48%),
    radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 42%);
  filter: blur(6px);
  pointer-events: none;
}

.settings-page.is-dark::before {
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 48%),
    radial-gradient(circle at top right, rgba(74, 222, 128, 0.14), transparent 42%);
}

.settings-page :deep(.n-card) {
  border-radius: 22px;
}

.config-lock-card :deep(.n-card__content) {
  padding-top: 28px;
  padding-bottom: 28px;
}

</style>


