<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--mcp', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <!-- 标题卡片 -->
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="center">
        <n-flex align="center">
          <n-icon :component="BareMetalServer02" size="20" :depth="1" />
          <span style="font-weight: 500;">MCP 服务器管理</span>
        </n-flex>
        <n-flex align="center">
          <n-button tertiary size="small" @click="openAddModal">
            新增 MCP 服务器
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <!-- MCP 卡片列表 -->
    <n-flex wrap :size="16" justify="flex-start" class="settings-grid" style="width: 100%; margin-top: 8px;">
      <n-card
        v-for="mcp in mcps"
        :key="mcp._id"
        hoverable
        size="small"
        class="settings-grid-card"
        :style="cardStyle"
        @click="handleCardClick(mcp)"
      >
        <n-flex vertical>
          <n-flex justify="space-between" align="center">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ mcp.name || '未命名' }}
            </n-text>
            <n-flex>
              <!-- 管理工具按钮（不触发卡片点击） -->
              <n-button
                v-if="!mcp.builtin"
                text
                size="small"
                :type="mcp.keepAlive ? 'primary' : 'default'"
                :title="mcp.keepAlive ? '长连接：已启用' : '长连接：未启用'"
                @click.stop="toggleKeepAlive(mcp)"
                style="margin-right: 4px;"
              >
                <n-icon :component="mcp.keepAlive ? Link : Unlink" size="18" />
              </n-button>
              <n-button
                text
                size="small"
                title="管理可用工具和测试入口"
                @click.stop="openToolModal(mcp)"
                style="margin-right: 4px;"
              >
                <n-icon :component="Settings20Regular" size="18" />
              </n-button>
              <!-- 删除按钮 -->
              <n-button
                v-if="!mcp.builtin"
                text
                size="small"
                title="删除 MCP 服务器"
                @click.stop="confirmDelete(mcp)"
              >
                <n-icon :component="Trash" size="18" />
              </n-button>
            </n-flex>
          </n-flex>
          <n-text depth="3" style="font-size: 12px;">
            类型：{{ mcp.transportType || '未知' }}
          </n-text>
          <n-flex align="center" wrap :size="6" style="margin-top: 6px;">
            <n-tag v-if="mcp.builtin" size="small" type="info" bordered>内置</n-tag>
            <n-tag v-if="mcp.disabled" size="small" bordered>已禁用</n-tag>
            <n-tag v-if="mcp.allowTools && mcp.allowTools.length" size="small" type="warning" bordered>
              工具：{{ mcp.allowTools.length }}
            </n-tag>
            <n-tag v-else size="small" type="success" bordered>
              工具：全部
            </n-tag>
          </n-flex>
        </n-flex>
      </n-card>
    </n-flex>

    <!-- 添加/编辑 MCP 模态框 -->
    <n-modal
      v-model:show="showEditModal"
      :mask-closable="false"
      preset="card"
      :title="modalMode === 'add' ? '新增 MCP 服务器' : '编辑 MCP 服务器'"
      style="width: 800px; max-width: 95%;"
    >
      <n-form
        ref="editFormRef"
        :model="editFormData"
        :rules="editRules"
        label-placement="left"
        label-align="left"
        require-mark-placement="left"
        label-width="120px"
        style="margin-top: 8px; padding: 0 10px;"
      >
        <!-- 公共字段 -->
        <n-form-item label="名称" path="name" required>
          <n-input v-model:value="editFormData.name" placeholder="请输入服务器名称（必填）" />
        </n-form-item>

        <n-form-item label="传输类型" path="transportType" required>
          <n-select
            v-model:value="editFormData.transportType"
            :options="transportOptions"
            placeholder="请选择传输类型"
            @update:value="onTransportTypeChange"
          />
        </n-form-item>

        <n-form-item label="填写说明">
          <n-alert type="info" :show-icon="false">
            <n-flex vertical :size="6">
              <n-text v-for="tip in transportGeneralTips" :key="tip" depth="2">
                {{ tip }}
              </n-text>
              <n-text strong>
                {{ activeTransportGuide.title }}
              </n-text>
              <n-text v-for="tip in activeTransportGuide.lines" :key="tip" depth="2">
                {{ tip }}
              </n-text>
            </n-flex>
          </n-alert>
        </n-form-item>

        <n-form-item label="禁用">
          <n-switch v-model:value="editFormData.disabled" />
        </n-form-item>

        <!-- Stdio 特有字段 -->
        <template v-if="editFormData.transportType === 'stdio'">
          <n-form-item label="命令" path="command" required>
            <n-input v-model:value="editFormData.command" placeholder="例如：npx、node、python；参数放在下方单独填写" />
          </n-form-item>

          <n-form-item label="参数">
            <n-dynamic-input
              v-model:value="editFormData.args"
              :on-create="() => ''"
              placeholder="请输入参数"
            />
          </n-form-item>

          <n-form-item label="环境变量">
            <n-dynamic-input
              v-model:value="envPairs"
              :on-create="() => ({ key: '', value: '' })"
              #="{ index, value }"
            >
              <n-flex :wrap="false" style="width: 100%;">
                <n-input v-model:value="value.key" placeholder="变量名，例如 API_KEY" />
                <n-input v-model:value="value.value" placeholder="变量值（敏感值不会在列表页明文展示）" />
                <n-button text title="移除环境变量" @click="removeEnv(index)">
                  <n-icon :component="Minus" />
                </n-button>
              </n-flex>
            </n-dynamic-input>
          </n-form-item>

          <n-form-item label="工作目录">
            <n-input v-model:value="editFormData.cwd" placeholder="例如：E:/tools/mcp-server 或 /path/to/workspace（可选）" />
          </n-form-item>

          <n-form-item label="超时（ms）">
            <n-input-number v-model:value="editFormData.timeout" :min="0" placeholder="例如：60000" />
          </n-form-item>
        </template>

        <!-- SSE 特有字段 -->
        <template v-else-if="editFormData.transportType === 'sse'">
          <n-form-item label="URL" path="url" required>
            <n-input v-model:value="editFormData.url" placeholder="例如：https://example.com/sse（填写 SSE 订阅地址）" />
          </n-form-item>

          <n-form-item label="请求头">
            <n-dynamic-input
              v-model:value="headerPairs"
              :on-create="() => ({ key: '', value: '' })"
              #="{ index, value }"
            >
              <n-flex :wrap="false" style="width: 100%;">
                <n-input v-model:value="value.key" placeholder="Header 名称，例如 Authorization" />
                <n-input v-model:value="value.value" placeholder="值，例如 Bearer xxx" />
                <n-button text title="移除请求头" @click="removeHeader(index)">
                  <n-icon :component="Minus" />
                </n-button>
              </n-flex>
            </n-dynamic-input>
          </n-form-item>

          <n-form-item label="超时（ms）">
            <n-input-number v-model:value="editFormData.timeout" :min="0" placeholder="例如：30000" />
          </n-form-item>

          <n-form-item label="连接时 Ping">
            <n-switch v-model:value="editFormData.pingOnConnect" />
          </n-form-item>

          <n-form-item label="最大总超时（ms）">
            <n-input-number v-model:value="editFormData.maxTotalTimeout" :min="0" placeholder="例如：120000" />
          </n-form-item>
        </template>

        <!-- Streamable HTTP 特有字段 -->
        <template v-else-if="editFormData.transportType === 'streamableHttp'">
          <n-form-item label="URL" path="url" required>
            <n-input v-model:value="editFormData.url" placeholder="例如：https://api.example.com/mcp（填写 MCP 接入地址）" />
          </n-form-item>

          <n-form-item label="方法">
            <n-select
              v-model:value="editFormData.method"
              :options="methodOptions"
              placeholder="HTTP 方法"
            />
          </n-form-item>

          <n-form-item label="请求头">
            <n-dynamic-input
              v-model:value="headerPairs"
              :on-create="() => ({ key: '', value: '' })"
              #="{ index, value }"
            >
              <n-flex :wrap="false" style="width: 100%;">
                <n-input v-model:value="value.key" placeholder="Header 名称，例如 Authorization" />
                <n-input v-model:value="value.value" placeholder="值，例如 Bearer xxx" />
                <n-button text title="移除 SSE 请求头" @click="removeHeader(index)">
                  <n-icon :component="Minus" />
                </n-button>
              </n-flex>
            </n-dynamic-input>
          </n-form-item>

          <n-form-item label="流式">
            <n-switch v-model:value="editFormData.stream" />
          </n-form-item>

          <n-form-item label="超时（ms）">
            <n-input-number v-model:value="editFormData.timeout" :min="0" placeholder="例如：45000" />
          </n-form-item>
        </template>

        <!-- 普通 HTTP 特有字段 -->
        <template v-else-if="editFormData.transportType === 'http'">
          <n-form-item label="URL" path="url" required>
            <n-input v-model:value="editFormData.url" placeholder="例如：https://api.example.com/mcp（普通 MCP 接入地址）" />
          </n-form-item>

          <n-form-item label="方法">
            <n-select
              v-model:value="editFormData.method"
              :options="methodOptions"
              placeholder="HTTP 方法"
            />
          </n-form-item>

          <n-form-item label="请求头">
            <n-dynamic-input
              v-model:value="headerPairs"
              :on-create="() => ({ key: '', value: '' })"
              #="{ index, value }"
            >
              <n-flex :wrap="false" style="width: 100%;">
                <n-input v-model:value="value.key" placeholder="Header 名称，例如 Authorization" />
                <n-input v-model:value="value.value" placeholder="值，例如 Bearer xxx" />
                <n-button text title="移除自定义请求头" @click="removeHeader(index)">
                  <n-icon :component="Minus" />
                </n-button>
              </n-flex>
            </n-dynamic-input>
          </n-form-item>

          <n-form-item label="超时（ms）">
            <n-input-number v-model:value="editFormData.timeout" :min="0" placeholder="例如：30000" />
          </n-form-item>
        </template>
      </n-form>

      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleEditSave" :loading="editSaving">
            保存
          </n-button>
        </n-flex>
      </template>
    </n-modal>

    <!-- 工具管理模态框 -->
    <n-modal
      v-model:show="showToolModal"
      :mask-closable="false"
      preset="card"
      :title="currentMcpForTool ? currentMcpForTool.name : '工具管理'"
      style="width: 1000px; max-width: 95%;"
    >
      <template #header-extra>
        <n-flex :size="8">
          <n-button
            size="small"
            :type="toolTab === 'enable' ? 'primary' : 'default'"
            @click="toolTab = 'enable'"
          >
            启用工具
          </n-button>
          <n-button
            size="small"
            :type="toolTab === 'test' ? 'primary' : 'default'"
            @click="toolTab = 'test'"
          >
            测试工具
          </n-button>
          <n-button
            size="small"
            :type="toolTab === 'prompts' ? 'primary' : 'default'"
            @click="toolTab = 'prompts'"
          >
            提示词
          </n-button>
          <n-button
            size="small"
            :type="toolTab === 'resources' ? 'primary' : 'default'"
            @click="toolTab = 'resources'"
          >
            资源
          </n-button>
          <n-button size="small" @click="refreshCurrentTab" :loading="refreshLoading">
            刷新
          </n-button>
        </n-flex>
      </template>

      <!-- 启用工具标签页 -->
      <div v-if="toolTab === 'enable'" style="min-height: 300px;">
        <n-data-table
          :columns="toolColumns"
          :data="tools"
          :loading="loadingTools"
          :pagination="false"
          :bordered="false"
          max-height="calc(70vh - 200px)"
          size="small"
        />
        <n-flex justify="flex-end" style="margin-top: 16px;">
          <n-button @click="showToolModal = false">取消</n-button>
          <n-button type="primary" @click="saveEnabledTools" :loading="savingTools">
            保存
          </n-button>
        </n-flex>
      </div>

      <!-- 测试工具标签页（增强） -->
      <div v-if="toolTab === 'test'" style="min-height: 300px;">
        <n-flex vertical>
          <n-form-item label="选择工具" required label-align="left" label-placement="left">
            <n-select
              style="width: 500px;"
              v-model:value="selectedTool"
              :options="toolOptions"
              placeholder="请选择要测试的工具"
              filterable
            />
          </n-form-item>

          <!-- 工具描述卡片 -->
          <n-card v-if="selectedTool" size="small" :bordered="false" embedded style="margin-bottom: 8px;">
            <div style="max-height: 6em; overflow-y: auto; line-height: 1.2;">
              <n-text depth="2">
                <strong>描述：</strong> {{ selectedToolDescription }}
              </n-text>
            </div>
          </n-card>

          <template v-if="selectedTool && toolParamsSchema[selectedTool]">
            <div style="max-height: 200px; overflow-y: auto; padding: 0 16px;">
              <n-form
                ref="testFormRef"
                :model="testFormData"
                label-placement="left"
                label-align="left"
                label-width="180px"
              >
                <n-form-item
                  v-for="param in toolParamsSchema[selectedTool]"
                  :key="param.name"
                  :label="param.displayName"
                  :required="param.required"
                >
                  <!-- 枚举值使用下拉选择框 -->
                  <n-select
                    v-if="param.enum && param.enum.length"
                    v-model:value="testFormData[param.name]"
                    :options="param.enum.map(v => ({ label: String(v), value: v }))"
                    :placeholder="param.description || '请选择值'"
                    clearable
                  />
                  <!-- 字符串类型且无枚举：使用文本域，自动调整高度 -->
                  <n-input
                    v-else-if="param.type === 'string'"
                    v-model:value="testFormData[param.name]"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 10 }"
                    :placeholder="param.description || ''"
                  />
                  <!-- 数字类型 -->
                  <n-input-number
                    v-else-if="param.type === 'number' || param.type === 'integer'"
                    v-model:value="testFormData[param.name]"
                    :placeholder="param.description || ''"
                    style="width: 100%;"
                  />
                  <!-- 布尔类型 -->
                  <n-switch
                    v-else-if="param.type === 'boolean'"
                    v-model:value="testFormData[param.name]"
                  />
                  <!-- 对象类型：key/value 录入 -->
                  <n-dynamic-input
                    v-else-if="param.type === 'object'"
                    v-model:value="testFormData[param.name]"
                    :on-create="() => ({ key: '', value: '' })"
                    #="{ index, value: pair }"
                  >
                    <n-flex :wrap="false" style="width: 100%;" :size="6">
                      <n-input v-model:value="pair.key" placeholder="键" style="width: 220px;" />
                      <n-input
                        v-model:value="pair.value"
                        placeholder='值（支持 JSON：如 123 / true / null / {"a":1}；字符串建议写 "文本"）'
                      />
                      <n-button text title="移除对象项" @click="removeToolObjectPair(param.name, index)">
                        <n-icon :component="Minus" />
                      </n-button>
                    </n-flex>
                  </n-dynamic-input>
                  <!-- 数组类型：逐项添加（每行一个元素，支持 JSON） -->
                  <n-dynamic-input
                    v-else-if="param.type === 'array'"
                    v-model:value="testFormData[param.name]"
                    :on-create="() => ''"
                    #="{ index, value: item }"
                  >
                    <n-flex :wrap="false" style="width: 100%;" :size="6">
                      <n-input
                        :value="item === undefined || item === null ? '' : String(item)"
                        placeholder='元素（支持 JSON：如 123 / true / null / {"a":1}；字符串建议写 "文本"）'
                        @update:value="(v) => setToolArrayItem(param.name, index, v)"
                      />
                      <n-button text title="移除数组项" @click="removeToolArrayItem(param.name, index)">
                        <n-icon :component="Minus" />
                      </n-button>
                    </n-flex>
                  </n-dynamic-input>
                  <!-- 其他类型（如数组、对象）用文本域，提示输入JSON -->
                  <n-input
                    v-else
                    v-model:value="testFormData[param.name]"
                    type="textarea"
                    :autosize="{ minRows: 1, maxRows: 10 }"
                    :placeholder="param.description || '请输入 JSON 值'"
                  />
                </n-form-item>
              </n-form>
            </div>

            <n-flex justify="space-between" style="margin-top: 16px;">
              <n-button @click="testTool" :loading="testing">测试</n-button>
            </n-flex>
          </template>

          <!-- 结果卡片：最大高度200px，超出滚动，带复制按钮，深度解析嵌套JSON -->
          <n-card v-if="testResult !== null" size="small" style="margin-top: 16px;">
            <template #header>
              <n-flex justify="space-between" align="center">
                <n-text strong>结果</n-text>
                <n-button text size="small" title="复制工具返回结果" @click="copyResult">
                  <n-icon :component="Copy" size="18" />
                </n-button>
              </n-flex>
            </template>
            <pre
              :style="{
                maxHeight: '200px',
                overflow: 'auto',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                backgroundColor: themeVars.popoverColor,
                padding: '5px'
              }"
            >{{ formattedTestResult }}</pre>
          </n-card>
        </n-flex>
      </div>

      <!-- Prompts 标签页 -->
      <div v-if="toolTab === 'prompts'" style="min-height: 300px;">
        <n-data-table
          :columns="promptColumns"
          :data="mcpPrompts"
          :loading="loadingPrompts"
          :pagination="false"
          :bordered="false"
          :row-props="promptRowProps"
          max-height="calc(70vh - 260px)"
          size="small"
        />

        <n-divider style="margin: 12px 0;" />

        <n-flex vertical>
          <n-text v-if="!selectedPromptName" depth="3">请选择上方提示词以查看/渲染。</n-text>

          <template v-else>
            <n-card size="small" :bordered="false" embedded style="margin-bottom: 8px;">
              <n-flex vertical :size="6">
                <n-text strong>{{ selectedPromptName }}</n-text>
                <n-text depth="3">{{ selectedPromptDescription || '无描述' }}</n-text>
              </n-flex>
            </n-card>

            <McpArgumentForm
              v-if="selectedPromptArgs.length"
              :params="selectedPromptArgs"
              :form-data="promptArgsForm"
            />
            <n-text v-else depth="3" style="font-size: 12px;">
              该提示词无参数，将直接获取。
            </n-text>

            <n-flex justify="space-between" style="margin-top: 16px;">
              <n-button @click="getPrompt" :loading="gettingPrompt">获取提示词</n-button>
            </n-flex>

            <n-card v-if="promptResult !== null" size="small" style="margin-top: 16px;">
              <template #header>
                <n-flex justify="space-between" align="center">
                  <n-text strong>结果</n-text>
                  <n-button text size="small" title="复制 Prompt 调试结果" @click="copyText(formattedPromptResult)">
                    <n-icon :component="Copy" size="18" />
                  </n-button>
                </n-flex>
              </template>
              <pre
                :style="{
                  maxHeight: '200px',
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  backgroundColor: themeVars.popoverColor,
                  padding: '5px'
                }"
              >{{ formattedPromptResult }}</pre>
            </n-card>
          </template>
        </n-flex>
      </div>

      <!-- Resources 标签页 -->
      <div v-if="toolTab === 'resources'" style="min-height: 300px;">
        <n-data-table
          :columns="resourceColumns"
          :data="mcpResources"
          :loading="loadingResources"
          :pagination="false"
          :bordered="false"
          :row-props="resourceRowProps"
          max-height="calc(70vh - 260px)"
          size="small"
        />

        <n-divider style="margin: 12px 0;" />

        <n-flex vertical>
          <n-text v-if="!selectedResourceUri" depth="3">请选择上方资源以读取。</n-text>

          <template v-else>
            <n-card size="small" :bordered="false" embedded style="margin-bottom: 8px;">
              <n-flex vertical :size="6">
                <n-text strong style="word-break: break-all;">{{ selectedResourceUri }}</n-text>
                <n-text depth="3">{{ selectedResourceDescription || '无描述' }}</n-text>
              </n-flex>
            </n-card>

            <n-flex justify="space-between" style="margin-top: 16px;">
              <n-button @click="readResource" :loading="readingResource">读取资源</n-button>
            </n-flex>

            <n-card v-if="resourceResult !== null" size="small" style="margin-top: 16px;">
              <template #header>
                <n-flex justify="space-between" align="center">
                  <n-text strong>结果</n-text>
                  <n-button text size="small" title="复制 Resource 调试结果" @click="copyText(formattedResourceResult)">
                    <n-icon :component="Copy" size="18" />
                  </n-button>
                </n-flex>
              </template>
              <pre
                :style="{
                  maxHeight: '200px',
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  backgroundColor: themeVars.popoverColor,
                  padding: '5px'
                }"
              >{{ formattedResourceResult }}</pre>
            </n-card>
          </template>
        </n-flex>
      </div>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { ref, reactive, computed, watch, h } from 'vue'
import {
  NAlert, NCard, NFlex, NIcon, NButton, NInput, NText, NTag, NDivider,
  NModal, NForm, NFormItem, NSelect, NSwitch,
  NInputNumber, NDynamicInput, NDataTable, useDialog, useMessage,
  useThemeVars 
} from 'naive-ui'
import { Trash, Minus, Copy, Link, Unlink } from '@vicons/fa'
import { BareMetalServer02 } from '@vicons/carbon'
import { Settings20Regular } from '@vicons/fluent'

import {
  getMcpServers,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  getTheme
} from '@/utils/configListener'
import { createMCPClient, getMcpPrompt, closePooledMCPClient } from '@/utils/mcpClient'
import McpArgumentForm from '@/components/McpArgumentForm.vue'
import {
  buildMcpArgsFromForm,
  flattenMcpSchemaProperties,
  normalizeMcpPromptArgumentDefinitions,
  resetMcpArgFormData
} from '@/utils/mcpArgumentForm'

const themeVars = useThemeVars()
const theme = getTheme()

// ---------- 卡片样式 ----------
const cardStyle = computed(() => ({
  width: 'calc((100% - 32px) / 3)',
  marginBottom: '0',
  cursor: 'pointer'
}))

const mcps = getMcpServers()

const dialog = useDialog()
const message = useMessage()

async function withTransientClient(serverConfig, handler) {
  let client = null
  try {
    client = createMCPClient(serverConfig)
    return await handler(client)
  } finally {
    try {
      client?.close?.()
    } catch {
      // ignore
    }
  }
}

function handleCardClick(mcp) {
  if (mcp?.builtin) {
    openToolModal(mcp)
    return
  }
  openEditModal(mcp)
}

async function toggleKeepAlive(mcp) {
  if (!mcp?._id) return
  if (mcp?.builtin) {
    message.warning('内置 MCP 不支持修改连接模式')
    return
  }
  const next = !mcp.keepAlive
  try {
    await updateMcpServer(mcp._id, { keepAlive: next })
    if (!next) closePooledMCPClient(mcp._id)
    message.success(next ? '已启用长连接' : '已关闭长连接')
  } catch (err) {
    message.error('操作失败：' + (err?.message || String(err)))
  }
}

// ---------- 编辑模态框相关 ----------
const showEditModal = ref(false)
const modalMode = ref('add')
const currentEditId = ref(null)
const editFormRef = ref(null)
const editSaving = ref(false)

// 传输类型选项（新增 http）
const transportOptions = [
  { label: 'Stdio（本地命令）', value: 'stdio' },
  { label: 'SSE（Server-Sent Events）', value: 'sse' },
  { label: 'Streamable HTTP（流式）', value: 'streamableHttp' },
  { label: 'HTTP（简单）', value: 'http' }
]

// HTTP 方法选项
const methodOptions = [
  { label: 'POST', value: 'POST' }
]

const transportGeneralTips = Object.freeze([
  '切换传输类型后，保存前要一次性补齐新类型的必填字段；不要依赖旧字段自动兼容。',
  'args 会按字符串数组保存；env / headers 会按对象保存，空键会被忽略。'
])

const transportGuideMap = Object.freeze({
  stdio: {
    title: 'Stdio 填写规则',
    lines: [
      '适用于本地命令启动型 MCP。command 只填命令本身，参数逐项放进 args。',
      '常见写法是 command=npx，args=["-y","包名","..."]；不要把整条命令复制到 command。',
      'env 用键值对对象表示；cwd 可选，通常指向 MCP 服务运行目录。'
    ]
  },
  sse: {
    title: 'SSE 填写规则',
    lines: [
      'url 填 SSE 订阅地址，不是官网首页或普通接口地址。',
      'headers 用对象表示；如果需要鉴权，通常在这里填 Authorization 等请求头。',
      'pingOnConnect 只用于服务端不会立即返回 endpoint/session 时的补探测；maxTotalTimeout 是建连总超时。'
    ]
  },
  streamableHttp: {
    title: 'Streamable HTTP 填写规则',
    lines: [
      'url 填 MCP 接入地址，不要写成无关的业务接口地址。',
      'method 当前固定 POST；stream 只对该传输类型生效。',
      'headers 用对象表示；如需鉴权，在这里配置。'
    ]
  },
  http: {
    title: 'HTTP 填写规则',
    lines: [
      '适用于简单非流式 HTTP MCP 接入地址。',
      'url 填 MCP 接入地址；method 当前固定 POST。',
      'headers 用对象表示；如需鉴权，在这里配置。'
    ]
  }
})

// 编辑表单数据
const editFormData = reactive({
  name: '',
  transportType: 'stdio',
  disabled: false,
  // stdio
  command: '',
  args: [],
  env: {},
  cwd: '',
  timeout: null,
  // sse / streamableHttp / http
  url: '',
  headers: {},
  pingOnConnect: false,
  maxTotalTimeout: null,
  // streamableHttp only
  method: 'POST',
  stream: false
})

// 用于编辑的键值对辅助数组
const envPairs = ref([])
const headerPairs = ref([])
const activeTransportGuide = computed(() => transportGuideMap[editFormData.transportType] || transportGuideMap.stdio)

// 表单验证规则
const editRules = {
  name: { required: true, message: '名称为必填项', trigger: 'blur' },
  command: { required: true, message: '命令为必填项', trigger: 'blur' },
  url: { required: true, message: 'URL 为必填项', trigger: 'blur' }
}

// 切换传输类型时清空所有特有字段（避免残留）
function onTransportTypeChange() {
  // 重置所有可能冲突的字段
  editFormData.command = ''
  editFormData.args = []
  editFormData.env = {}
  editFormData.cwd = ''
  editFormData.url = ''
  editFormData.headers = {}
  editFormData.pingOnConnect = false
  editFormData.maxTotalTimeout = null
  editFormData.method = 'POST'
  editFormData.stream = false
  envPairs.value = []
  headerPairs.value = []
}

function removeEnv(index) {
  envPairs.value.splice(index, 1)
}

function removeHeader(index) {
  headerPairs.value.splice(index, 1)
}

// 打开添加模态框
function openAddModal() {
  modalMode.value = 'add'
  currentEditId.value = null
  resetEditForm()
  editFormRef.value?.restoreValidation()
  showEditModal.value = true
}

// 打开编辑模态框
function openEditModal(mcp) {
  if (mcp?.builtin) {
    message.warning('内置 MCP 不可编辑')
    return
  }
  modalMode.value = 'edit'
  currentEditId.value = mcp._id

  editFormData.name = mcp.name || ''
  editFormData.transportType = mcp.transportType || 'stdio'
  editFormData.disabled = mcp.disabled || false

  if (mcp.transportType === 'stdio') {
    editFormData.command = mcp.command || ''
    editFormData.args = mcp.args || []
    editFormData.env = mcp.env || {}
    editFormData.cwd = mcp.cwd || ''
    editFormData.timeout = mcp.timeout || null
    envPairs.value = Object.entries(editFormData.env).map(([key, value]) => ({ key, value }))
  } else if (mcp.transportType === 'sse') {
    editFormData.url = mcp.url || ''
    editFormData.headers = mcp.headers || {}
    editFormData.timeout = mcp.timeout || null
    editFormData.pingOnConnect = mcp.pingOnConnect || false
    editFormData.maxTotalTimeout = mcp.maxTotalTimeout || null
    headerPairs.value = Object.entries(editFormData.headers).map(([key, value]) => ({ key, value }))
  } else if (mcp.transportType === 'streamableHttp') {
    editFormData.url = mcp.url || ''
    editFormData.headers = mcp.headers || {}
    editFormData.method = 'POST'
    editFormData.stream = mcp.stream || false
    editFormData.timeout = mcp.timeout || null
    headerPairs.value = Object.entries(editFormData.headers).map(([key, value]) => ({ key, value }))
  } else if (mcp.transportType === 'http') {   // 新增 http 分支
    editFormData.url = mcp.url || ''
    editFormData.headers = mcp.headers || {}
    editFormData.method = 'POST'
    editFormData.timeout = mcp.timeout || null
    headerPairs.value = Object.entries(editFormData.headers).map(([key, value]) => ({ key, value }))
  }

  editFormRef.value?.restoreValidation()
  showEditModal.value = true
}

function resetEditForm() {
  editFormData.name = ''
  editFormData.transportType = 'stdio'
  editFormData.disabled = false
  editFormData.command = ''
  editFormData.args = []
  editFormData.env = {}
  editFormData.cwd = ''
  editFormData.timeout = null
  editFormData.url = ''
  editFormData.headers = {}
  editFormData.pingOnConnect = false
  editFormData.maxTotalTimeout = null
  editFormData.method = 'POST'
  editFormData.stream = false
  envPairs.value = []
  headerPairs.value = []
}

// 保存编辑
async function handleEditSave() {
  editFormRef.value?.validate(async (errors) => {
    if (errors) {
      message.warning('请填写必填项')
      return
    }

    if (modalMode.value === 'edit') {
      const current = (mcps.value || []).find((x) => x && x._id === currentEditId.value) || null
      if (current?.builtin) {
        message.warning('内置 MCP 不可编辑')
        return
      }
    }

    if (editFormData.transportType === 'stdio' && !editFormData.command) {
      message.warning('STDIO（标准输入输出）传输方式必须填写命令')
      return
    }
    if ((editFormData.transportType === 'sse' || editFormData.transportType === 'streamableHttp' || editFormData.transportType === 'http') && !editFormData.url) {
      message.warning('该传输类型必须填写链接地址')
      return
    }

    editSaving.value = true
    try {
      const baseData = {
        name: editFormData.name.trim(),
        transportType: editFormData.transportType,
        disabled: editFormData.disabled
      }

      if (editFormData.transportType === 'stdio') {
        const envObj = {}
        envPairs.value.forEach(pair => {
          if (pair.key) envObj[pair.key] = pair.value
        })
        baseData.command = editFormData.command
        baseData.args = editFormData.args.filter(arg => arg.trim() !== '')
        baseData.env = envObj
        if (editFormData.cwd) baseData.cwd = editFormData.cwd
        if (editFormData.timeout) baseData.timeout = editFormData.timeout
      } else if (editFormData.transportType === 'sse') {
        const headersObj = {}
        headerPairs.value.forEach(pair => {
          if (pair.key) headersObj[pair.key] = pair.value
        })
        baseData.url = editFormData.url
        baseData.headers = headersObj
        if (editFormData.timeout) baseData.timeout = editFormData.timeout
        baseData.pingOnConnect = editFormData.pingOnConnect
        if (editFormData.maxTotalTimeout) baseData.maxTotalTimeout = editFormData.maxTotalTimeout
      } else if (editFormData.transportType === 'streamableHttp') {
        const headersObj = {}
        headerPairs.value.forEach(pair => {
          if (pair.key) headersObj[pair.key] = pair.value
        })
        baseData.url = editFormData.url
        baseData.headers = headersObj
        baseData.method = editFormData.method
        baseData.stream = editFormData.stream
        if (editFormData.timeout) baseData.timeout = editFormData.timeout
      } else if (editFormData.transportType === 'http') {   // 新增 http 保存逻辑
        const headersObj = {}
        headerPairs.value.forEach(pair => {
          if (pair.key) headersObj[pair.key] = pair.value
        })
        baseData.url = editFormData.url
        baseData.headers = headersObj
        baseData.method = editFormData.method
        if (editFormData.timeout) baseData.timeout = editFormData.timeout
      }

      const safeData = JSON.parse(JSON.stringify(baseData))

      if (modalMode.value === 'add') {
        const newMcp = { _id: crypto.randomUUID(), ...safeData }
        await addMcpServer(newMcp)
        message.success('MCP 服务器新增成功')
      } else {
        await updateMcpServer(currentEditId.value, safeData)
        closePooledMCPClient(currentEditId.value)
        message.success('MCP 服务器更新成功')
      }
      showEditModal.value = false
    } catch (err) {
      message.error('操作失败：' + err.message)
    } finally {
      editSaving.value = false
    }
  })
}

// 删除确认
function confirmDelete(mcp) {
  if (mcp?.builtin) {
    message.warning('内置 MCP 不可删除')
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `确定删除 MCP 服务器“${mcp.name || '未命名'}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteMcpServer(mcp._id)
        message.success('MCP 服务器已删除')
      } catch (err) {
        message.error('删除失败：' + err.message)
      }
    }
  })
}

watch(showEditModal, (val) => {
  if (!val) resetEditForm()
})

// ---------- 工具管理模态框 ----------
const showToolModal = ref(false)
const currentMcpForTool = ref(null)
const toolTab = ref('enable')
const loadingTools = ref(false)
const tools = ref([])
const enabledTools = ref(new Set())

const loadingPrompts = ref(false)
const mcpPrompts = ref([])
const promptsLoaded = ref(false)
const selectedPromptName = ref(null)
const promptArgsForm = reactive({})
const gettingPrompt = ref(false)
const promptResult = ref(null)

const loadingResources = ref(false)
const mcpResources = ref([])
const resourcesLoaded = ref(false)
const selectedResourceUri = ref(null)
const readingResource = ref(false)
const resourceResult = ref(null)

// 工具表格列定义
const toolColumns = [
  { title: '名称', key: 'name', width: 250 },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  {
    title: '启用',
    key: 'enabled',
    width: 110,
    render(row) {
      return h(NSwitch, {
        value: enabledTools.value.has(row.name),
        onUpdateValue: (val) => {
          if (val) {
            enabledTools.value.add(row.name)
          } else {
            enabledTools.value.delete(row.name)
          }
        }
      })
    }
  }
]

// 工具选项（简单，不带图标和描述）
const toolOptions = computed(() => tools.value.map(t => ({
  label: t.name,
  value: t.name
})))

const promptColumns = [
  { title: '名称', key: 'name', width: 260, ellipsis: { tooltip: true } },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  {
    title: '参数',
    key: 'args',
    width: 70,
    align: 'center',
    render(row) {
      return normalizeMcpPromptArgumentDefinitions(row).length
    }
  }
]

const resourceColumns = [
  { title: 'URI', key: 'uri', width: 360, ellipsis: { tooltip: true } },
  { title: '名称', key: 'name', width: 200, ellipsis: { tooltip: true } },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  { title: 'MIME', key: 'mimeType', width: 140, ellipsis: { tooltip: true } }
]

function promptRowProps(row) {
  return {
    style: 'cursor: pointer;',
    onClick: () => {
      selectedPromptName.value = row.name
    }
  }
}

function resourceRowProps(row) {
  return {
    style: 'cursor: pointer;',
    onClick: () => {
      selectedResourceUri.value = row.uri
    }
  }
}

// 当前选中工具的描述
const selectedToolDescription = computed(() => {
  if (!selectedTool.value) return ''
  const tool = tools.value.find(t => t.name === selectedTool.value)
  return tool?.description || ''
})

const selectedPrompt = computed(() => {
  if (!selectedPromptName.value) return null
  return mcpPrompts.value.find(p => p.name === selectedPromptName.value) || null
})

const selectedPromptDescription = computed(() => selectedPrompt.value?.description || '')

const selectedPromptArgs = computed(() => {
  return normalizeMcpPromptArgumentDefinitions(selectedPrompt.value)
})

const selectedResource = computed(() => {
  if (!selectedResourceUri.value) return null
  return mcpResources.value.find(r => r.uri === selectedResourceUri.value) || null
})

const selectedResourceDescription = computed(() => selectedResource.value?.description || '')

// 存储每个工具的扁平参数列表，用于生成表单
const toolParamsSchema = ref({})

const selectedTool = ref(null)
const testFormData = reactive({})
const testFormRef = ref(null)
const testing = ref(false)
const testResult = ref(null)

const savingTools = ref(false)

// ---------- 新增：深度解析 JSON 字符串（递归） ----------
function deepParseJsonStrings(input) {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      // 解析成功后递归处理解析后的值
      return deepParseJsonStrings(parsed);
    } catch {
      return input; // 不是 JSON 则原样返回
    }
  } else if (Array.isArray(input)) {
    return input.map(item => deepParseJsonStrings(item));
  } else if (input && typeof input === 'object') {
    const result = {};
    for (const key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        result[key] = deepParseJsonStrings(input[key]);
      }
    }
    return result;
  } else {
    return input;
  }
}

function isEmptyToolArgValue(val) {
  if (val === undefined || val === null) return true
  if (typeof val === 'string' && !val.trim()) return true
  if (Array.isArray(val)) {
    if (val.length === 0) return true
    return val.every((item) => {
      if (item === undefined || item === null) return true
      if (typeof item === 'string') return !item.trim()
      if (typeof item === 'object') {
        const k = String(item.key ?? '').trim()
        if (k) return false
        const v = item.value
        if (v === undefined || v === null) return true
        if (typeof v === 'string') return !v.trim()
        if (typeof v === 'object') return Object.keys(v).length === 0
        return false
      }
      return false
    })
  }
  if (typeof val === 'object') return Object.keys(val).length === 0
  return false
}

function parseToolArgValue(param, rawValue) {
  const type = String(param?.type || 'string')

  const parseLooseJson = (text) => {
    const trimmed = String(text ?? '').trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      return String(text ?? '')
    }
  }

  if (type === 'object') {
    if (rawValue === undefined || rawValue === null) return undefined

    // 兼容旧实现：允许直接输入 JSON 字符串
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) return undefined
      try {
        const parsed = JSON.parse(trimmed)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('不是对象')
        }
        if (Object.keys(parsed).length === 0) return undefined
        return parsed
      } catch (err) {
        throw new Error(`参数「${param.displayName || param.name}」需要输入对象（JSON），解析失败：${err.message || String(err)}`)
      }
    }

    // key/value UI：[{key,value}] → object
    if (Array.isArray(rawValue)) {
      const obj = {}
      rawValue.forEach((pair) => {
        const k = String(pair?.key ?? '').trim()
        if (!k) return
        const vRaw = pair?.value
        const vParsed = typeof vRaw === 'string' ? parseLooseJson(vRaw) : vRaw
        obj[k] = vParsed === undefined ? '' : vParsed
      })
      if (Object.keys(obj).length === 0) return undefined
      return obj
    }

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      if (Object.keys(rawValue).length === 0) return undefined
      return rawValue
    }

    return rawValue
  }

  if (type === 'array') {
    if (rawValue === undefined || rawValue === null) return undefined

    // 兼容旧实现：允许直接输入 JSON 字符串
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) return undefined
      try {
        const parsed = JSON.parse(trimmed)
        if (!Array.isArray(parsed)) {
          throw new Error('不是数组')
        }
        if (parsed.length === 0) return undefined
        return parsed
      } catch (err) {
        throw new Error(`参数「${param.displayName || param.name}」需要输入数组（JSON），解析失败：${err.message || String(err)}`)
      }
    }

    if (Array.isArray(rawValue)) {
      const arr = rawValue
        .map((item) => {
          if (item === undefined || item === null) return undefined
          if (typeof item === 'string') return parseLooseJson(item)
          return item
        })
        .filter((v) => v !== undefined)

      if (arr.length === 0) return undefined
      return arr
    }

    return rawValue
  }

  // 其他类型：保持 UI 组件输出的原始类型（number/boolean），字符串直接传递
  if (typeof rawValue === 'string') return rawValue
  return rawValue
}

function removeToolObjectPair(paramName, index) {
  const list = testFormData?.[paramName]
  if (!Array.isArray(list)) return
  list.splice(index, 1)
}

function removeToolArrayItem(paramName, index) {
  const list = testFormData?.[paramName]
  if (!Array.isArray(list)) return
  list.splice(index, 1)
}

function setToolArrayItem(paramName, index, nextValue) {
  const list = testFormData?.[paramName]
  if (!Array.isArray(list)) {
    testFormData[paramName] = []
  }
  if (!Array.isArray(testFormData?.[paramName])) return
  testFormData[paramName][index] = nextValue
}

// 格式化结果的计算属性（深度解析 + 漂亮打印）
const formattedTestResult = computed(() => {
  const result = testResult.value;
  if (result === null || result === undefined) return '';
  const parsed = deepParseJsonStrings(result);
  if (typeof parsed === 'object') {
    return JSON.stringify(parsed, null, 2);
  }
  return String(parsed);
});

// 复制结果到剪贴板
function copyText(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败')
  })
}

const copyResult = () => copyText(formattedTestResult.value)

const formattedPromptResult = computed(() => {
  const result = promptResult.value
  if (result === null || result === undefined) return ''
  const parsed = deepParseJsonStrings(result)
  if (typeof parsed === 'object') {
    return JSON.stringify(parsed, null, 2)
  }
  return String(parsed)
})

const formattedResourceResult = computed(() => {
  const result = resourceResult.value
  if (result === null || result === undefined) return ''
  const parsed = deepParseJsonStrings(result)
  if (typeof parsed === 'object') {
    return JSON.stringify(parsed, null, 2)
  }
  return String(parsed)
})

const refreshLoading = computed(() => {
  if (toolTab.value === 'prompts') return loadingPrompts.value
  if (toolTab.value === 'resources') return loadingResources.value
  return loadingTools.value
})

function refreshCurrentTab() {
  if (toolTab.value === 'prompts') return refreshPrompts()
  if (toolTab.value === 'resources') return refreshResources()
  return refreshTools()
}

/**
 * 递归展开 JSON Schema 属性，返回扁平参数列表（增加 default 字段）
 */
function flattenProperties(properties, required = [], prefix = '') {
  let params = []
  for (const [key, schema] of Object.entries(properties)) {
    const fullName = prefix ? `${prefix}.${key}` : key
    const isRequired = required.includes(key)
    if (schema.type === 'object' && schema.properties) {
      // 递归展开子对象
      const subRequired = schema.required || []
      params = params.concat(flattenProperties(schema.properties, subRequired, fullName))
    } else {
      params.push({
        name: fullName,
        displayName: fullName,
        type: schema.type || 'string',
        required: isRequired,
        description: schema.description || '',
        enum: schema.enum || null,
        default: schema.default   // 提取默认值
      })
    }
  }
  return params
}

/**
 * 将扁平对象（如 { 'options.includeComments': true }）转换为嵌套对象
 */
function unflattenObject(flatObj) {
  const result = {}
  for (const [key, value] of Object.entries(flatObj)) {
    const parts = key.split('.')
    let current = result
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {}
      }
      current = current[part]
    }
    current[parts[parts.length - 1]] = value
  }
  return result
}

// 刷新工具列表
async function refreshTools() {
  if (!currentMcpForTool.value) return
  loadingTools.value = true
  try {
    const toolList = await withTransientClient(currentMcpForTool.value, (client) => client.listTools())
    tools.value = toolList

    // 解析每个工具的输入参数 schema
    tools.value.forEach(t => {
      if (t.inputSchema && t.inputSchema.properties) {
        toolParamsSchema.value[t.name] = flattenMcpSchemaProperties(
          t.inputSchema.properties,
          t.inputSchema.required || []
        )
      } else {
        toolParamsSchema.value[t.name] = []
      }
    })

    const server = currentMcpForTool.value
    const allowTools = server.allowTools || []
    if (allowTools.length === 0) {
      enabledTools.value = new Set(tools.value.map(t => t.name))
    } else {
      enabledTools.value = new Set(allowTools)
    }

    // 如果之前选中的工具已不存在，清空选择
    if (selectedTool.value && !tools.value.some(t => t.name === selectedTool.value)) {
      selectedTool.value = null
    }
  } catch (err) {
    message.error('工具列表加载失败：' + err.message)
    tools.value = []
  } finally {
    loadingTools.value = false
  }
}

async function refreshPrompts() {
  if (!currentMcpForTool.value) return
  loadingPrompts.value = true
  try {
    const promptList = await withTransientClient(currentMcpForTool.value, (client) => client.listPrompts())
    mcpPrompts.value = Array.isArray(promptList) ? promptList : (promptList?.prompts || [])
    promptsLoaded.value = true

    if (selectedPromptName.value && !mcpPrompts.value.some(p => p.name === selectedPromptName.value)) {
      selectedPromptName.value = null
    }
  } catch (err) {
    message.error('提示词列表加载失败：' + err.message)
    mcpPrompts.value = []
    promptsLoaded.value = true
  } finally {
    loadingPrompts.value = false
  }
}

async function refreshResources() {
  if (!currentMcpForTool.value) return
  loadingResources.value = true
  try {
    const resourceList = await withTransientClient(currentMcpForTool.value, (client) => client.listResources())
    mcpResources.value = Array.isArray(resourceList) ? resourceList : (resourceList?.resources || [])
    resourcesLoaded.value = true

    if (selectedResourceUri.value && !mcpResources.value.some(r => r.uri === selectedResourceUri.value)) {
      selectedResourceUri.value = null
    }
  } catch (err) {
    message.error('资源列表加载失败：' + err.message)
    mcpResources.value = []
    resourcesLoaded.value = true
  } finally {
    loadingResources.value = false
  }
}

async function getPrompt() {
  if (!currentMcpForTool.value) return
  if (!selectedPrompt.value) {
    message.warning('请选择提示词')
    return
  }
  gettingPrompt.value = true
  promptResult.value = null
  try {
    let args = undefined
    if (selectedPromptArgs.value.length) {
      args = buildMcpArgsFromForm(selectedPromptArgs.value, promptArgsForm)
    }

    const result = await withTransientClient(currentMcpForTool.value, (client) => getMcpPrompt(client, selectedPrompt.value.name, args))
    promptResult.value = result
  } catch (err) {
    promptResult.value = `错误：${err.message}`
  } finally {
    gettingPrompt.value = false
  }
}

async function readResource() {
  if (!currentMcpForTool.value) return
  if (!selectedResource.value) {
    message.warning('请选择资源')
    return
  }
  readingResource.value = true
  resourceResult.value = null
  try {
    const result = await withTransientClient(currentMcpForTool.value, (client) => client.readResource(selectedResource.value.uri))
    resourceResult.value = result
  } catch (err) {
    resourceResult.value = `错误：${err.message}`
  } finally {
    readingResource.value = false
  }
}

// 打开工具管理弹窗
function openToolModal(mcp) {
  currentMcpForTool.value = mcp
  toolTab.value = 'enable'
  selectedTool.value = null
  testResult.value = null
  Object.keys(testFormData).forEach(key => delete testFormData[key])

  promptsLoaded.value = false
  resourcesLoaded.value = false
  mcpPrompts.value = []
  mcpResources.value = []
  selectedPromptName.value = null
  selectedResourceUri.value = null
  promptResult.value = null
  resourceResult.value = null
  Object.keys(promptArgsForm).forEach(key => delete promptArgsForm[key])

  refreshTools()
  showToolModal.value = true
}

// 保存启用工具
async function saveEnabledTools() {
  if (!currentMcpForTool.value) return
  if (currentMcpForTool.value?.builtin) {
    message.warning('内置 MCP 不支持修改启用工具列表')
    return
  }
  savingTools.value = true
  try {
    const allowTools = Array.from(enabledTools.value)
    const allToolNames = tools.value.map(t => t.name)
    const finalAllowTools = allowTools.length === allToolNames.length ? [] : allowTools

    await updateMcpServer(currentMcpForTool.value._id, {
      ...currentMcpForTool.value,
      allowTools: finalAllowTools
    })
    message.success('工具设置已保存')
    showToolModal.value = false
  } catch (err) {
    message.error('保存失败：' + err.message)
  } finally {
    savingTools.value = false
  }
}

// 测试工具
async function testTool() {
  if (!selectedTool.value) {
    message.warning('请选择工具')
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const schema = toolParamsSchema.value?.[selectedTool.value] || []
    const flatParams = {}
    schema.forEach((param) => {
      const rawValue = testFormData[param.name]
      const required = !!param.required

      if (required && isEmptyToolArgValue(rawValue)) {
        throw new Error(`请填写参数「${param.displayName || param.name}」`)
      }

      const parsed = parseToolArgValue(param, rawValue)
      if (parsed === undefined) return

      flatParams[param.name] = parsed
    })

    const nestedParams = unflattenObject(flatParams)
    const result = await withTransientClient(currentMcpForTool.value, (client) => client.callTool(selectedTool.value, nestedParams))
    testResult.value = result
  } catch (err) {
    testResult.value = `错误：${err.message}`
  } finally {
    testing.value = false
  }
}

// 监听工具选择变化，重置测试表单并预填充默认值
watch(selectedTool, (newTool) => {
  testResult.value = null
  Object.keys(testFormData).forEach(key => delete testFormData[key])
  if (newTool && toolParamsSchema.value[newTool]) {
    toolParamsSchema.value[newTool].forEach(param => {
      if (param.default !== undefined) {
        // 有默认值则使用默认值
        if (param.type === 'object') {
          if (param.default && typeof param.default === 'object' && !Array.isArray(param.default)) {
            testFormData[param.name] = Object.entries(param.default).map(([k, v]) => ({
              key: String(k),
              value: typeof v === 'string' ? v : JSON.stringify(v)
            }))
          } else if (typeof param.default === 'string') {
            try {
              const parsed = JSON.parse(param.default)
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                testFormData[param.name] = Object.entries(parsed).map(([k, v]) => ({
                  key: String(k),
                  value: typeof v === 'string' ? v : JSON.stringify(v)
                }))
              } else {
                testFormData[param.name] = []
              }
            } catch {
              testFormData[param.name] = []
            }
          } else {
            testFormData[param.name] = []
          }
          return
        }

        if (param.type === 'array') {
          if (Array.isArray(param.default)) {
            testFormData[param.name] = JSON.parse(JSON.stringify(param.default))
          } else if (typeof param.default === 'string') {
            try {
              const parsed = JSON.parse(param.default)
              testFormData[param.name] = Array.isArray(parsed) ? parsed : []
            } catch {
              testFormData[param.name] = []
            }
          } else {
            testFormData[param.name] = []
          }
          return
        }

        testFormData[param.name] = param.default
      } else if (param.type === 'boolean') {
        testFormData[param.name] = false
      } else if (param.type === 'number' || param.type === 'integer') {
        testFormData[param.name] = null
      } else if (param.type === 'string' && param.enum && param.enum.length) {
        testFormData[param.name] = null
      } else if (param.type === 'object') {
        testFormData[param.name] = []
      } else if (param.type === 'array') {
        testFormData[param.name] = []
      } else {
        testFormData[param.name] = ''
      }
    })
  }
})

// 关闭工具弹窗时清理
watch(showToolModal, (val) => {
  if (!val) {
    currentMcpForTool.value = null
    tools.value = []
    enabledTools.value.clear()
    selectedTool.value = null
    testResult.value = null

    mcpPrompts.value = []
    mcpResources.value = []
    selectedPromptName.value = null
    selectedResourceUri.value = null
    promptResult.value = null
    resourceResult.value = null
    promptsLoaded.value = false
    resourcesLoaded.value = false
    Object.keys(promptArgsForm).forEach(key => delete promptArgsForm[key])
  }
})

watch(toolTab, (val) => {
  if (val === 'prompts' && !promptsLoaded.value && !loadingPrompts.value) {
    refreshPrompts()
  }
  if (val === 'resources' && !resourcesLoaded.value && !loadingResources.value) {
    refreshResources()
  }
})

watch(selectedPromptName, () => {
  promptResult.value = null
  resetMcpArgFormData(selectedPromptArgs.value, promptArgsForm)
})

watch(selectedResourceUri, () => {
  resourceResult.value = null
})
</script>

<style scoped>
.settings-page {
  position: relative;
  padding-bottom: 6px;
}

.settings-page::before {
  content: '';
  position: absolute;
  inset: 12px 0 auto;
  height: 220px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(63, 164, 139, 0.16), transparent 48%),
    radial-gradient(circle at top right, rgba(72, 112, 196, 0.12), transparent 42%);
  pointer-events: none;
  filter: blur(6px);
}

.settings-page.is-dark::before {
  background:
    radial-gradient(circle at top left, rgba(63, 164, 139, 0.2), transparent 48%),
    radial-gradient(circle at top right, rgba(72, 112, 196, 0.16), transparent 42%);
}

.settings-hero-card,
.settings-grid-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(79, 117, 129, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-grid-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.settings-hero-card::after,
.settings-grid-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 48%);
  pointer-events: none;
}

.settings-page.is-dark .settings-hero-card::after,
.settings-page.is-dark .settings-grid-card::after {
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 48%);
}

.settings-grid {
  position: relative;
}

.settings-grid-card {
  animation: settings-card-enter 240ms ease;
}

.n-card {
  transition: all 0.2s;
}
.n-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(15, 34, 38, 0.12);
}

.settings-page.is-dark .n-card:hover {
  box-shadow: 0 18px 34px rgba(2, 6, 23, 0.34);
}

@keyframes settings-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
