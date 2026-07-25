import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allowsAutomaticApiFallback,
  getProviderModelType,
  normalizeProviderApiMode,
  normalizeProviderModelTypes,
  resolveChatApiMode
} from '../src/utils/providerModelConfig.js'

test('provider API mode keeps auto as the backward-compatible default', () => {
  assert.equal(normalizeProviderApiMode(), 'auto')
  assert.equal(normalizeProviderApiMode('response'), 'responses')
  assert.equal(normalizeProviderApiMode('Chat Completions'), 'chat-completions')
  assert.equal(allowsAutomaticApiFallback('auto'), true)
  assert.equal(allowsAutomaticApiFallback('responses'), false)
})

test('explicit provider API mode overrides automatic model preference', () => {
  assert.equal(resolveChatApiMode({ configuredMode: 'responses', preferResponses: false }), 'responses')
  assert.equal(resolveChatApiMode({ configuredMode: 'chat-completions', preferResponses: true }), 'chat-completions')
  assert.equal(resolveChatApiMode({ configuredMode: 'auto', preferResponses: true }), 'responses')
  assert.equal(resolveChatApiMode({ configuredMode: 'auto', preferResponses: false }), 'chat-completions')
})

test('provider model types store only explicit supported routing types', () => {
  const modelTypes = normalizeProviderModelTypes({
    'chat-model': 'chat',
    'image-model': 'image',
    'legacy-auto': 'auto',
    'unknown-model': 'unsupported'
  })

  assert.deepEqual(modelTypes, {
    'chat-model': 'chat',
    'image-model': 'image-generation'
  })
  assert.equal(getProviderModelType({ modelTypes }, 'image-model'), 'image-generation')
  assert.equal(getProviderModelType({ modelTypes }, 'unconfigured-model'), 'auto')
})
