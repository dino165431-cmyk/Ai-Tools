<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--note-template', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1180px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
      <n-flex justify="space-between" align="start" wrap :size="16">
        <n-flex vertical :size="6" style="min-width: 320px; flex: 1 1 460px;">
          <n-flex align="center" :size="8">
            <n-icon :component="NotepadEdit16Regular" size="20" />
            <n-text strong style="font-size: 18px;">笔记配置</n-text>
          </n-flex>
          <n-text depth="3">
            现在按“顶部栏目 -> 模板分组 -> 模板”统一管理。内置项会显示在列表里，不能删除，但可以修改并一键恢复默认。
          </n-text>
          <n-text depth="3" style="font-size: 12px;">
            {{ summaryText }}
          </n-text>
        </n-flex>

        <n-flex wrap justify="end" align="center" :size="12" style="min-width: 280px;">
          <n-button tertiary @click="openRootModal()">新增顶部栏目</n-button>
          <n-button tertiary :disabled="!selectedRoot" @click="openCategoryModal()">新增模板分组</n-button>
          <n-button type="primary" :disabled="!canCreateTemplate" @click="openTemplateModal()">
            新增模板
          </n-button>
        </n-flex>
      </n-flex>

      <div class="settings-section">
        <div class="settings-section__label">顶部栏目</div>
        <div class="settings-root-tabs">
          <button
            v-for="root in roots"
            :key="root.id"
            type="button"
            class="settings-root-tab"
            :class="{ 'is-active': root.id === selectedRootId }"
            @click="selectedRootId = root.id"
          >
            <span>{{ root.label }}</span>
            <span class="settings-tab-count">{{ root.templateCount }}</span>
          </button>
        </div>
      </div>

      <n-flex
        v-if="selectedRoot"
        justify="space-between"
        align="center"
        wrap
        :size="12"
        style="margin-top: 16px;"
      >
        <n-flex align="center" wrap :size="8">
          <n-tag size="small" :type="selectedRoot.builtin ? 'info' : 'success'" bordered>
            {{ selectedRoot.builtin ? '内置顶部栏目' : '自定义顶部栏目' }}
          </n-tag>
          <n-tag size="small" bordered>
            {{ selectedRoot.categoryCount }} 个模板分组
          </n-tag>
          <n-tag size="small" bordered>
            {{ selectedRoot.templateCount }} 个模板
          </n-tag>
          <n-text depth="3" style="font-size: 12px;">
            {{ rootHelperText }}
          </n-text>
        </n-flex>

        <n-flex :size="8" wrap justify="end">
          <n-button tertiary size="small" @click="openRootModal(selectedRoot)">编辑顶部栏目</n-button>
          <n-button
            v-if="selectedRoot.builtin && selectedRoot.isModified"
            tertiary
            size="small"
            @click="handleRestoreRoot(selectedRoot)"
          >
            恢复默认
          </n-button>
          <n-button
            v-if="!selectedRoot.builtin"
            tertiary
            size="small"
            type="error"
            :disabled="!selectedRoot.canDelete"
            @click="handleDeleteRoot(selectedRoot)"
          >
            删除顶部栏目
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-card hoverable class="settings-category-card" style="width: 100%; margin-top: 8px;">
      <n-flex justify="space-between" align="start" wrap :size="12">
        <div style="flex: 1 1 520px; min-width: 280px;">
          <div class="settings-section__label">模板分组</div>
          <div v-if="currentCategories.length" class="settings-category-tabs">
            <button
              v-for="category in currentCategories"
              :key="category.id"
              type="button"
              class="settings-category-tab"
              :class="{ 'is-active': category.id === selectedCategoryId }"
              @click="selectedCategoryId = category.id"
            >
              <span>{{ category.label }}</span>
              <span class="settings-tab-count">{{ category.templateCount }}</span>
            </button>
          </div>
          <n-text v-else depth="3" style="font-size: 13px;">
            当前顶部栏目下还没有模板分组，先新增一个模板分组，再往里面放模板。
          </n-text>
        </div>

        <n-flex v-if="selectedCategory" :size="8" wrap justify="end">
          <n-button tertiary size="small" @click="openCategoryModal(selectedCategory)">编辑模板分组</n-button>
          <n-button
            v-if="selectedCategory.builtin && selectedCategory.isModified"
            tertiary
            size="small"
            @click="handleRestoreCategory(selectedCategory)"
          >
            恢复默认
          </n-button>
          <n-button
            v-if="!selectedCategory.builtin"
            tertiary
            size="small"
            type="error"
            :disabled="!selectedCategory.canDelete"
            @click="handleDeleteCategory(selectedCategory)"
          >
            删除模板分组
          </n-button>
        </n-flex>
      </n-flex>

      <n-flex
        v-if="selectedCategory"
        align="center"
        wrap
        :size="8"
        style="margin-top: 12px;"
      >
        <n-tag size="small" :type="selectedCategory.builtin ? 'info' : 'success'" bordered>
          {{ selectedCategory.builtin ? '内置模板分组' : '自定义模板分组' }}
        </n-tag>
        <n-tag size="small" bordered>
          {{ selectedCategory.templateCount }} 个模板
        </n-tag>
        <n-text depth="3" style="font-size: 12px;">
          {{ categoryHelperText }}
        </n-text>
      </n-flex>
    </n-card>

    <n-flex wrap :size="16" class="settings-grid" style="width: 100%; margin-top: 8px;">
      <n-card
        v-for="item in currentTemplates"
        :key="item.id"
        hoverable
        size="small"
        class="settings-grid-card"
        :style="cardStyle"
        @click="openTemplateModal(item)"
      >
        <n-flex vertical :size="10">
          <n-flex justify="space-between" align="start" :size="8">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ item.label || '未命名模板' }}
            </n-text>
            <n-flex :size="6" wrap justify="end">
              <n-button
                v-if="item.builtin && item.isModified"
                text
                size="small"
                @click.stop="handleRestoreTemplate(item)"
              >
                恢复默认
              </n-button>
              <n-button
                v-if="!item.builtin"
                text
                size="small"
                type="error"
                @click.stop="handleDeleteTemplate(item)"
              >
                删除
              </n-button>
            </n-flex>
          </n-flex>

          <n-flex align="center" wrap :size="6">
            <n-tag size="small" :type="item.builtin ? 'info' : 'success'" bordered>
              {{ item.builtin ? '内置' : '自定义' }}
            </n-tag>
            <n-tag v-if="item.type === 'action'" size="small" bordered>
              快捷动作
            </n-tag>
            <n-tag v-if="item.builtin && item.syntax" size="small" type="warning" bordered>
              {{ item.syntax }}
            </n-tag>
            <n-tag v-if="item.isFavorite" size="small" type="error" bordered>
              收藏
            </n-tag>
            <n-tag v-if="item.isRecent" size="small" type="success" bordered>
              最近使用
            </n-tag>
          </n-flex>

          <n-ellipsis v-if="item.keywords?.length" :line-clamp="1" class="settings-card__meta">
            关键词：{{ item.keywords.join(', ') }}
          </n-ellipsis>

          <n-ellipsis :line-clamp="4" class="settings-card__meta settings-card__meta--code">
            {{ getTemplatePreview(item) }}
          </n-ellipsis>

          <div class="settings-card__meta settings-card__meta--subtle">
            {{ formatUpdatedAt(item) }}
          </div>
        </n-flex>
      </n-card>
    </n-flex>

    <n-card
      v-if="!currentTemplates.length"
      hoverable
      class="settings-empty-card"
      style="width: 100%; margin-top: 8px;"
    >
      <n-flex vertical align="center" :size="8" style="padding: 24px 12px;">
        <n-text strong>
          {{ currentCategories.length ? '当前模板分组下还没有模板' : '当前顶部栏目下还没有模板分组' }}
        </n-text>
        <n-text depth="3">
          {{ currentCategories.length ? '新增模板后，会直接出现在编辑器顶部对应栏目里。' : '先新增一个模板分组，再继续配置模板。' }}
        </n-text>
        <n-button tertiary @click="currentCategories.length ? openTemplateModal() : openCategoryModal()">
          {{ currentCategories.length ? '新增模板' : '新增模板分组' }}
        </n-button>
      </n-flex>
    </n-card>

    <n-modal
      v-model:show="rootModal.show"
      preset="card"
      :title="rootModalTitle"
      style="width: 560px; max-width: 94%;"
    >
      <n-form label-placement="top">
        <n-form-item label="顶部栏目名称">
          <n-input v-model:value="rootModal.form.label" placeholder="例如：数据可视化" />
        </n-form-item>

        <n-form-item label="顶部栏目说明">
          <n-input
            v-model:value="rootModal.form.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="可选，用于说明这个顶部栏目里主要放什么模板"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-text depth="3">
            顶部栏目只负责在编辑器顶部显示为一个按钮分组，模板内容本身直接按 Markdown 插入。
          </n-text>
          <n-flex :size="12">
            <n-button @click="closeRootModal">取消</n-button>
            <n-button type="primary" :loading="rootModal.saving" @click="saveRoot">
              保存顶部栏目
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <n-modal
      v-model:show="categoryModal.show"
      preset="card"
      :title="categoryModalTitle"
      style="width: 520px; max-width: 94%;"
    >
      <n-form label-placement="top">
        <n-form-item label="所属顶部栏目">
          <n-input :value="currentRootLabel" disabled />
        </n-form-item>
        <n-form-item label="模板分组名称">
          <n-input v-model:value="categoryModal.form.label" placeholder="例如：周报图表" />
        </n-form-item>
        <n-form-item label="模板分组说明">
          <n-input
            v-model:value="categoryModal.form.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="可选，用于说明这一组模板的用途"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-text depth="3">
            只有没有模板的模板分组才可以删除。
          </n-text>
          <n-flex :size="12">
            <n-button @click="closeCategoryModal">取消</n-button>
            <n-button type="primary" :loading="categoryModal.saving" @click="saveCategory">
              保存模板分组
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>

    <n-modal
      v-model:show="templateModal.show"
      preset="card"
      :title="templateModalTitle"
      style="width: 960px; max-width: 96%;"
    >
      <n-flex vertical :size="14">
        <n-flex align="center" wrap :size="12">
          <n-tag size="small" :type="templateModal.builtin ? 'info' : 'success'" bordered>
            {{ templateModal.builtin ? '内置项' : '自定义项' }}
          </n-tag>
          <n-tag size="small" bordered>
            {{ currentRootLabel }}
          </n-tag>
          <n-tag v-if="templateModal.itemType === 'action'" size="small" bordered>
            快捷动作
          </n-tag>
        </n-flex>

        <n-form label-placement="top">
          <n-flex wrap :size="12">
            <n-form-item label="所属模板分组" style="flex: 1; min-width: 220px;">
              <n-select v-model:value="templateModal.form.categoryId" :options="categoryOptions" />
            </n-form-item>
          </n-flex>

          <n-form-item label="模板名称">
            <n-input v-model:value="templateModal.form.label" placeholder="例如：周报折线图" />
          </n-form-item>

          <n-form-item label="搜索关键词（可选）">
            <n-input
              v-model:value="templateModal.form.keywords"
              placeholder="多个关键词用逗号或换行分隔，不填也可以"
            />
          </n-form-item>

          <n-form-item v-if="templateModal.itemType === 'template'" :label="templateContentLabel">
            <n-input
              v-model:value="templateModal.form.template"
              type="textarea"
              :autosize="{ minRows: 14, maxRows: 22 }"
              :placeholder="templateContentPlaceholder"
            />
          </n-form-item>

          <div v-if="templateModal.itemType === 'template' && !templateModal.builtin" class="template-editor-help">
            <div class="template-editor-help__title">写法提示</div>
            <div class="template-editor-help__text">
              模板默认按你填写的 Markdown 插入；如果当前位于公式、Mermaid 或 ECharts 顶部栏目，且你没有手动写
              <code>$...$</code>、<code>$$...$$</code>、<code>```mermaid</code> 或 <code>```echarts</code> 包裹，插入时会自动补全。若希望插入后默认选中某一段内容，请用
              <code>[[内容]]</code>
              包起来。
            </div>
            <div class="template-editor-help__grid">
              <section
                v-for="example in templateHelpExamples"
                :key="example.label"
                class="template-editor-help__card"
              >
                <div class="template-editor-help__card-title">{{ example.label }}</div>
                <pre class="template-editor-help__example">{{ example.content }}</pre>
              </section>
            </div>
          </div>

          <n-text
            v-else-if="templateModal.itemType === 'template' && templateModal.builtin"
            depth="3"
            style="font-size: 12px;"
          >
            内置模板沿用系统默认结构；如果想完全按自己的 Markdown 写法来插入，建议新增一个自定义模板。
          </n-text>

          <n-text v-else depth="3" style="font-size: 12px;">
            这是一个内置快捷动作，会根据当前选中的 Markdown 表格或 JSON 数据自动生成图表配置。这里可以修改它的名称、关键词和所属模板分组，但不能修改生成逻辑。
          </n-text>
        </n-form>
      </n-flex>

      <template #footer>
        <n-flex justify="space-between" align="center" wrap :size="12">
          <n-text depth="3">
            内置模板不能删除，修改后可以随时恢复默认。
          </n-text>
          <n-flex :size="12">
            <n-button @click="closeTemplateModal">取消</n-button>
            <n-button type="primary" :loading="templateModal.saving" @click="saveTemplate">
              保存模板
            </n-button>
          </n-flex>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  NButton,
  NCard,
  NEllipsis,
  NFlex,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NTag,
  NText,
  useDialog,
  useMessage
} from 'naive-ui'
import { NotepadEdit16Regular } from '@vicons/fluent'
import { getNoteConfig, getTheme, updateNoteConfig } from '@/utils/configListener'
import {
  addCustomCategory,
  addCustomRoot,
  addCustomTemplate,
  buildNextNoteEditorConfig,
  buildNoteTemplateView,
  removeCustomCategory,
  removeCustomRoot,
  removeCustomTemplate,
  restoreBuiltinCategory,
  restoreBuiltinRoot,
  restoreBuiltinTemplate,
  updateBuiltinCategoryOverride,
  updateBuiltinRootOverride,
  updateBuiltinTemplateOverride,
  updateCustomCategory,
  updateCustomRoot,
  updateCustomTemplate
} from '@/utils/noteTemplateConfig'

const theme = getTheme()
const noteConfig = getNoteConfig()
const message = useMessage()
const dialog = useDialog()

const selectedRootId = ref('')
const selectedCategoryId = ref('')

const rootModal = reactive({
  show: false,
  saving: false,
  builtin: false,
  editingId: '',
  form: {
    label: '',
    description: ''
  }
})

const categoryModal = reactive({
  show: false,
  saving: false,
  builtin: false,
  editingId: '',
  form: {
    label: '',
    description: ''
  }
})

const templateModal = reactive({
  show: false,
  saving: false,
  builtin: false,
  editingId: '',
  itemType: 'template',
  sourceKind: '',
  form: {
    categoryId: '',
    label: '',
    keywords: '',
    template: ''
  }
})

const currentView = computed(() => buildNoteTemplateView(noteConfig.value))
const roots = computed(() => currentView.value.roots)
const selectedRoot = computed(() => currentView.value.rootMap.get(selectedRootId.value) || null)
const currentCategories = computed(() => currentView.value.categoriesByRoot.get(selectedRootId.value) || [])
const selectedCategory = computed(() =>
  currentCategories.value.find((item) => item.id === selectedCategoryId.value) || null
)
const currentTemplates = computed(() =>
  currentView.value.itemsByCategory.get(selectedCategoryId.value) || []
)
const categoryOptions = computed(() =>
  currentCategories.value.map((item) => ({
    label: item.label,
    value: item.id
  }))
)

const currentRootLabel = computed(() => selectedRoot.value?.label || '当前顶部栏目')
const canCreateTemplate = computed(() => !!selectedRoot.value && !!selectedCategory.value)
const summaryText = computed(() =>
  `${roots.value.length} 个顶部栏目 / ${currentView.value.categories.length} 个模板分组 / ${currentView.value.items.length} 个模板`
)

const rootHelperText = computed(() => {
  if (!selectedRoot.value) return '选择一个顶部栏目开始配置。'
  if (selectedRoot.value.description) return selectedRoot.value.description
  if (selectedRoot.value.builtin) {
    return '内置顶部栏目不能删除，可以修改名称和说明，也可以恢复默认。'
  }
  if (selectedRoot.value.canDelete) {
    return '这个自定义顶部栏目目前还是空的，可以直接删除。'
  }
  return '顶部栏目只负责在编辑器顶部显示为一个按钮分组，只有没有模板分组和模板时才可以删除。'
})

const categoryHelperText = computed(() => {
  if (!selectedCategory.value) return '先新增一个模板分组。'
  if (selectedCategory.value.description) return selectedCategory.value.description
  if (selectedCategory.value.builtin) {
    return '内置模板分组不能删除，可以修改名称和说明，也可以恢复默认。'
  }
  if (selectedCategory.value.canDelete) {
    return '这个自定义模板分组目前没有模板，可以删除。'
  }
  return '只有没有模板的模板分组才可以删除。'
})

const rootModalTitle = computed(() => {
  if (rootModal.editingId) {
    return rootModal.builtin ? '编辑内置顶部栏目' : '编辑自定义顶部栏目'
  }
  return '新增顶部栏目'
})

const categoryModalTitle = computed(() => {
  if (categoryModal.editingId) {
    return categoryModal.builtin ? '编辑内置模板分组' : '编辑自定义模板分组'
  }
  return `新增 ${currentRootLabel.value} 模板分组`
})

const templateModalTitle = computed(() => {
  if (!templateModal.editingId) return `新增 ${currentRootLabel.value} 模板`
  if (templateModal.itemType === 'action') return '编辑内置快捷动作'
  return templateModal.builtin ? '编辑内置模板' : '编辑自定义模板'
})

const templateContentLabel = computed(() =>
  templateModal.builtin ? '模板内容' : 'Markdown 模板内容'
)

const effectiveTemplateKind = computed(() =>
  String(templateModal.sourceKind || selectedRoot.value?.kind || '').trim()
)

const templateContentPlaceholder = computed(() => {
  if (templateModal.itemType !== 'template') return ''
  if (!templateModal.builtin) {
    if (effectiveTemplateKind.value === 'formula') {
      return '直接填写公式内容；没写 $ / $$ 时插入会自动补全，也可以自己写完整 Markdown'
    }
    if (effectiveTemplateKind.value === 'echarts') {
      return '直接填写 ECharts 配置；没写 ```echarts 围栏时插入会自动补全，也可以自己写完整 Markdown'
    }
    if (effectiveTemplateKind.value === 'mermaid') {
      return '直接填写 Mermaid 源码；没写 ```mermaid 围栏时插入会自动补全，也可以自己写完整 Markdown'
    }
    return '直接填写要插入的 Markdown 内容，可包含标题、列表、代码块、公式、表格，以及 [[默认选中内容]] 标记'
  }
  if (effectiveTemplateKind.value === 'formula') return '填写内置公式模板内容'
  if (effectiveTemplateKind.value === 'echarts') return '填写内置 ECharts 模板内容'
  if (effectiveTemplateKind.value === 'mermaid') return '填写内置 Mermaid 模板内容'
  return '填写模板内容'
})
const templateHelpExamples = computed(() => {
  const examples = [
    {
      label: '普通 Markdown',
      content: ['# [[标题]]', '', '- 第一项', '- 第二项', '', '> 这里是正文'].join('\n')
    },
    {
      label: 'Mermaid',
      content: ['```mermaid', 'graph TD', '  A[[开始]] --> B[结束]', '```'].join('\n')
    },
    {
      label: 'ECharts',
      content: [
        '```echarts',
        '{',
        "  title: { text: '[[图表标题]]' },",
        '  tooltip: {},',
        "  xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },",
        "  yAxis: { type: 'value' },",
        "  series: [{ type: 'bar', data: [120, 200, 150] }]",
        '}',
        '```'
      ].join('\n')
    },
    {
      label: '数学公式',
      content: ['$[[a^2 + b^2 = c^2]]$', '', '$$', '[[\\int_a^b f(x)\\,dx]]', '$$'].join('\n')
    }
  ]

  if (effectiveTemplateKind.value === 'formula') {
    return [examples[3], examples[0], examples[1], examples[2]]
  }
  if (effectiveTemplateKind.value === 'echarts') {
    return [examples[2], examples[0], examples[1], examples[3]]
  }
  if (effectiveTemplateKind.value === 'mermaid') {
    return [examples[1], examples[0], examples[2], examples[3]]
  }
  return examples
})

const cardStyle = computed(() => ({
  flex: '1 1 320px',
  maxWidth: 'calc((100% - 32px) / 3)',
  minWidth: '300px',
  marginBottom: '0',
  cursor: 'pointer'
}))

watch(
  roots,
  (nextRoots) => {
    const hasSelected = nextRoots.some((item) => item.id === selectedRootId.value)
    if (hasSelected) return
    selectedRootId.value = nextRoots[0]?.id || ''
  },
  { immediate: true }
)

watch(
  currentCategories,
  (nextCategories) => {
    const hasSelected = nextCategories.some((item) => item.id === selectedCategoryId.value)
    if (hasSelected) return
    selectedCategoryId.value = nextCategories[0]?.id || ''
  },
  { immediate: true }
)

function parseKeywords(text) {
  return String(text || '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getDefaultCategoryId(rootId = selectedRootId.value) {
  return String(
    selectedCategoryId.value
      || currentView.value.firstCategoryByRoot.get(rootId)
      || ''
  )
}

function resetRootModal() {
  rootModal.show = false
  rootModal.saving = false
  rootModal.builtin = false
  rootModal.editingId = ''
  rootModal.form.label = ''
  rootModal.form.description = ''
}

function resetCategoryModal() {
  categoryModal.show = false
  categoryModal.saving = false
  categoryModal.builtin = false
  categoryModal.editingId = ''
  categoryModal.form.label = ''
  categoryModal.form.description = ''
}

function resetTemplateModal() {
  templateModal.show = false
  templateModal.saving = false
  templateModal.builtin = false
  templateModal.editingId = ''
  templateModal.itemType = 'template'
  templateModal.sourceKind = String(selectedRoot.value?.kind || '')
  templateModal.form.categoryId = getDefaultCategoryId()
  templateModal.form.label = ''
  templateModal.form.keywords = ''
  templateModal.form.template = ''
}

function openRootModal(root = null) {
  rootModal.show = true
  rootModal.saving = false
  rootModal.builtin = !!root?.builtin
  rootModal.editingId = String(root?.id || '')
  rootModal.form.label = String(root?.label || '')
  rootModal.form.description = String(root?.description || '')
}

function closeRootModal() {
  resetRootModal()
}

function openCategoryModal(category = null) {
  if (!selectedRoot.value) {
    message.warning('请先选择一个顶部栏目')
    return
  }

  categoryModal.show = true
  categoryModal.saving = false
  categoryModal.builtin = !!category?.builtin
  categoryModal.editingId = String(category?.id || '')
  categoryModal.form.label = String(category?.label || '')
  categoryModal.form.description = String(category?.description || '')
}

function closeCategoryModal() {
  resetCategoryModal()
}

function openTemplateModal(item = null) {
  if (!item && !currentCategories.value.length) {
    message.warning('请先新增一个模板分组')
    return
  }

  templateModal.show = true
  templateModal.saving = false
  templateModal.builtin = !!item?.builtin
  templateModal.editingId = String(item?.id || '')
  templateModal.itemType = String(item?.type || 'template')
  templateModal.sourceKind = String(item?.kind || selectedRoot.value?.kind || '')
  templateModal.form.categoryId = String(item?.categoryId || getDefaultCategoryId())
  templateModal.form.label = String(item?.label || '')
  templateModal.form.keywords = Array.isArray(item?.keywords) ? item.keywords.join(', ') : ''
  templateModal.form.template = String(item?.template || '')
}

function closeTemplateModal() {
  resetTemplateModal()
}

async function persistStore(updater) {
  const nextNoteEditor = buildNextNoteEditorConfig(noteConfig.value, updater)
  await updateNoteConfig({
    noteEditor: nextNoteEditor
  })
}

async function saveRoot() {
  rootModal.saving = true
  try {
    const payload = {
      label: String(rootModal.form.label || '').trim(),
      description: String(rootModal.form.description || '').trim()
    }
    let createdRootId = ''

    await persistStore((state) => {
      if (!rootModal.editingId) {
        const nextState = addCustomRoot(state, payload)
        createdRootId = nextState.customRoots[nextState.customRoots.length - 1]?.id || ''
        return nextState
      }
      if (rootModal.builtin) {
        return updateBuiltinRootOverride(state, rootModal.editingId, payload)
      }
      return updateCustomRoot(state, rootModal.editingId, payload)
    })

    if (createdRootId) {
      selectedRootId.value = createdRootId
      selectedCategoryId.value = ''
    }

    const isEditing = !!rootModal.editingId
    closeRootModal()
    message.success(isEditing ? '顶部栏目已更新' : '顶部栏目已新增')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    rootModal.saving = false
  }
}

function handleDeleteRoot(root) {
  if (!root?.canDelete) {
    message.warning('只有没有模板分组和模板的顶部栏目才可以删除')
    return
  }

  dialog.warning({
    title: '删除顶部栏目',
    content: `确定删除「${root.label}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => removeCustomRoot(state, root.id))
        message.success('顶部栏目已删除')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

function handleRestoreRoot(root) {
  dialog.warning({
    title: '恢复默认顶部栏目',
    content: `确定恢复「${root.label}」的默认设置吗？`,
    positiveText: '恢复默认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => restoreBuiltinRoot(state, root.id))
        message.success('顶部栏目已恢复默认')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

async function saveCategory() {
  categoryModal.saving = true
  try {
    const payload = {
      rootId: selectedRootId.value,
      label: String(categoryModal.form.label || '').trim(),
      description: String(categoryModal.form.description || '').trim()
    }
    let createdCategoryId = ''

    await persistStore((state) => {
      if (!categoryModal.editingId) {
        const nextState = addCustomCategory(state, payload)
        createdCategoryId = nextState.customCategories[nextState.customCategories.length - 1]?.id || ''
        return nextState
      }
      if (categoryModal.builtin) {
        return updateBuiltinCategoryOverride(state, categoryModal.editingId, payload)
      }
      return updateCustomCategory(state, categoryModal.editingId, payload)
    })

    if (createdCategoryId) {
      selectedCategoryId.value = createdCategoryId
    }

    const isEditing = !!categoryModal.editingId
    closeCategoryModal()
    message.success(isEditing ? '模板分组已更新' : '模板分组已新增')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    categoryModal.saving = false
  }
}

function handleDeleteCategory(category) {
  if (!category?.canDelete) {
    message.warning('只有没有模板的模板分组才可以删除')
    return
  }

  dialog.warning({
    title: '删除模板分组',
    content: `确定删除「${category.label}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => removeCustomCategory(state, category.id))
        message.success('模板分组已删除')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

function handleRestoreCategory(category) {
  dialog.warning({
    title: '恢复默认模板分组',
    content: `确定恢复「${category.label}」的默认设置吗？`,
    positiveText: '恢复默认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => restoreBuiltinCategory(state, category.id))
        message.success('模板分组已恢复默认')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

async function saveTemplate() {
  templateModal.saving = true
  try {
    const payload = {
      rootId: selectedRootId.value,
      categoryId: String(templateModal.form.categoryId || '').trim(),
      kind: String(templateModal.sourceKind || selectedRoot.value?.kind || 'mermaid').trim(),
      label: String(templateModal.form.label || '').trim(),
      keywords: parseKeywords(templateModal.form.keywords)
    }

    if (templateModal.itemType === 'template') {
      payload.template = String(templateModal.form.template || '')
    }

    await persistStore((state) => {
      if (!templateModal.editingId) {
        return addCustomTemplate(state, payload)
      }
      if (templateModal.builtin) {
        return updateBuiltinTemplateOverride(state, templateModal.editingId, payload)
      }
      return updateCustomTemplate(state, templateModal.editingId, payload)
    })

    if (payload.categoryId) {
      selectedCategoryId.value = payload.categoryId
    }

    const isEditing = !!templateModal.editingId
    closeTemplateModal()
    message.success(isEditing ? '模板已更新' : '模板已新增')
  } catch (err) {
    message.error(err?.message || String(err))
  } finally {
    templateModal.saving = false
  }
}

function handleDeleteTemplate(item) {
  dialog.warning({
    title: '删除模板',
    content: `确定删除「${item.label || '未命名模板'}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => removeCustomTemplate(state, item.id))
        if (templateModal.editingId === item.id) {
          closeTemplateModal()
        }
        message.success('模板已删除')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

function handleRestoreTemplate(item) {
  dialog.warning({
    title: '恢复默认模板',
    content: `确定恢复「${item.label}」的默认内容吗？`,
    positiveText: '恢复默认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await persistStore((state) => restoreBuiltinTemplate(state, item.id))
        if (templateModal.editingId === item.id) {
          closeTemplateModal()
        }
        message.success('模板已恢复默认')
      } catch (err) {
        message.error(err?.message || String(err))
      }
    }
  })
}

function getTemplatePreview(item) {
  if (item.type === 'action') {
    return item.description || '根据当前选中的 Markdown 表格或 JSON 数据生成图表配置'
  }
  return String(item.template || '')
}

function formatUpdatedAt(item) {
  if (item.builtin && !item.isModified) return '内置默认项'
  const timestamp = Date.parse(String(item?.updatedAt || ''))
  if (!timestamp) return item.builtin ? '已修改' : '未记录更新时间'
  return `更新于 ${new Date(timestamp).toLocaleString()}`
}

resetRootModal()
resetCategoryModal()
resetTemplateModal()
</script>

<style scoped>
.settings-page {
  position: relative;
  min-height: calc(100vh - 30px);
  padding: 8px 0 32px;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 26%),
    radial-gradient(circle at 80% 10%, rgba(249, 115, 22, 0.08), transparent 22%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.75), rgba(241, 245, 249, 0.9));
}

.settings-page.is-dark {
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.14), transparent 26%),
    radial-gradient(circle at 78% 12%, rgba(96, 165, 250, 0.14), transparent 24%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.76), rgba(2, 6, 23, 0.92));
}

.settings-hero-card,
.settings-category-card,
.settings-grid-card,
.settings-empty-card {
  contain: layout paint;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-category-card,
.settings-page.is-dark .settings-grid-card,
.settings-page.is-dark .settings-empty-card {
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(125, 211, 252, 0.12);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.18);
}

.settings-grid-card {
  content-visibility: auto;
  contain-intrinsic-size: 240px;
}

.settings-page.is-dark .n-card:hover,
.settings-grid-card:hover {
  transform: translateY(-2px);
}

.settings-section {
  margin-top: 16px;
}

.settings-section__label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(71, 85, 105, 0.9);
}

.settings-root-tabs,
.settings-category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.settings-root-tab,
.settings-category-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: rgba(51, 65, 85, 0.92);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
}

.settings-root-tab:hover,
.settings-root-tab.is-active,
.settings-category-tab:hover,
.settings-category-tab.is-active {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.settings-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  font-size: 11px;
  line-height: 1;
}

.settings-page.is-dark .settings-section__label {
  color: rgba(191, 219, 254, 0.84);
}

.settings-page.is-dark .settings-root-tab,
.settings-page.is-dark .settings-category-tab {
  background: rgba(15, 23, 42, 0.7);
  color: rgba(226, 232, 240, 0.92);
  border-color: rgba(148, 163, 184, 0.18);
}
.settings-page.is-dark .settings-root-tab:hover,
.settings-page.is-dark .settings-root-tab.is-active,
.settings-page.is-dark .settings-category-tab:hover,
.settings-page.is-dark .settings-category-tab.is-active {
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(125, 211, 252, 0.28);
  color: #bae6fd;
}

.settings-page.is-dark .settings-tab-count {
  background: rgba(125, 211, 252, 0.14);
}

.settings-card__meta {
  font-size: 12px;
  color: rgba(71, 85, 105, 0.92);
  white-space: pre-wrap;
}

.settings-card__meta--subtle {
  color: rgba(100, 116, 139, 0.92);
}

.settings-card__meta--code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  white-space: pre-wrap;
}

.settings-page.is-dark .settings-card__meta {
  color: rgba(203, 213, 225, 0.88);
}

.settings-page.is-dark .settings-card__meta--subtle {
  color: rgba(148, 163, 184, 0.92);
}

.template-editor-help {
  margin-top: 4px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.82);
}

.template-editor-help__title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(30, 41, 59, 0.94);
}

.template-editor-help__text {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(71, 85, 105, 0.92);
}

.template-editor-help__text code {
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.06);
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

.template-editor-help__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.template-editor-help__card {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.template-editor-help__card-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(37, 99, 235, 0.92);
}

.template-editor-help__example {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  color: rgba(30, 41, 59, 0.94);
}

.settings-page.is-dark .template-editor-help {
  background: rgba(15, 23, 42, 0.64);
  border-color: rgba(125, 211, 252, 0.14);
}

.settings-page.is-dark .template-editor-help__title {
  color: rgba(226, 232, 240, 0.94);
}

.settings-page.is-dark .template-editor-help__text {
  color: rgba(191, 219, 254, 0.82);
}

.settings-page.is-dark .template-editor-help__text code {
  background: rgba(125, 211, 252, 0.12);
}

.settings-page.is-dark .template-editor-help__card {
  background: rgba(2, 6, 23, 0.52);
  border-color: rgba(125, 211, 252, 0.12);
}

.settings-page.is-dark .template-editor-help__card-title {
  color: #7dd3fc;
}

.settings-page.is-dark .template-editor-help__example {
  color: rgba(226, 232, 240, 0.92);
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

@media (max-width: 1024px) {
  .settings-grid-card {
    max-width: calc((100% - 16px) / 2) !important;
  }
}

@media (max-width: 640px) {
  .settings-grid-card {
    max-width: 100% !important;
    min-width: 100% !important;
  }

  .template-editor-help__grid {
    grid-template-columns: 1fr;
  }
}
</style>


