<template>
  <div :style="{ maxHeight, overflowY: 'auto', padding }">
    <n-form :model="formData" label-placement="left" label-align="left" :label-width="labelWidth">
      <n-form-item
        v-for="param in params"
        :key="param.name"
        :label="param.displayName || param.name"
        :required="param.required"
      >
        <n-select
          v-if="param.enum && param.enum.length"
          v-model:value="formData[param.name]"
          :options="param.enum.map((value) => ({ label: String(value), value }))"
          :placeholder="param.description || 'Select a value'"
          clearable
        />
        <n-input
          v-else-if="param.type === 'string'"
          v-model:value="formData[param.name]"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 10 }"
          :placeholder="param.description || ''"
        />
        <n-input-number
          v-else-if="param.type === 'number' || param.type === 'integer'"
          v-model:value="formData[param.name]"
          :placeholder="param.description || ''"
          style="width: 100%;"
        />
        <n-switch v-else-if="param.type === 'boolean'" v-model:value="formData[param.name]" />
        <n-dynamic-input
          v-else-if="param.type === 'object'"
          v-model:value="formData[param.name]"
          :on-create="() => ({ key: '', value: '' })"
          #="{ index, value: pair }"
        >
          <n-flex :wrap="false" style="width: 100%;" :size="6">
            <n-input v-model:value="pair.key" placeholder="Key" style="width: 220px;" />
            <n-input
              v-model:value="pair.value"
              placeholder='Value supports JSON: 123 / true / null / {"a":1}; quote strings as needed'
            />
            <n-button text title="Remove object item" @click="removeObjectPair(param.name, index)">
              <n-icon :component="Minus" />
            </n-button>
          </n-flex>
        </n-dynamic-input>
        <n-dynamic-input
          v-else-if="param.type === 'array'"
          v-model:value="formData[param.name]"
          :on-create="() => ''"
          #="{ index, value: item }"
        >
          <n-flex :wrap="false" style="width: 100%;" :size="6">
            <n-input
              :value="item === undefined || item === null ? '' : String(item)"
              placeholder='Item supports JSON: 123 / true / null / {"a":1}; quote strings as needed'
              @update:value="(value) => setArrayItem(param.name, index, value)"
            />
            <n-button text title="Remove array item" @click="removeArrayItem(param.name, index)">
              <n-icon :component="Minus" />
            </n-button>
          </n-flex>
        </n-dynamic-input>
        <n-input
          v-else
          v-model:value="formData[param.name]"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 10 }"
          :placeholder="param.description || 'Enter a JSON value'"
        />
      </n-form-item>
    </n-form>
  </div>
</template>

<script setup>
import { NButton, NDynamicInput, NFlex, NForm, NFormItem, NIcon, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { Minus } from '@vicons/fa'

const props = defineProps({
  params: {
    type: Array,
    default: () => []
  },
  formData: {
    type: Object,
    required: true
  },
  maxHeight: {
    type: String,
    default: '200px'
  },
  padding: {
    type: String,
    default: '0 16px'
  },
  labelWidth: {
    type: String,
    default: '180px'
  }
})

function removeObjectPair(paramName, index) {
  const list = props.formData?.[paramName]
  if (!Array.isArray(list)) return
  list.splice(index, 1)
}

function removeArrayItem(paramName, index) {
  const list = props.formData?.[paramName]
  if (!Array.isArray(list)) return
  list.splice(index, 1)
}

function setArrayItem(paramName, index, nextValue) {
  if (!Array.isArray(props.formData?.[paramName])) props.formData[paramName] = []
  props.formData[paramName][index] = nextValue
}
</script>
