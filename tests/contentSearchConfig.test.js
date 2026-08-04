import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import {
  isContentSearchHybrid,
  normalizeContentSearchConfig
} from '../src/utils/contentSearchConfig.js'

const require = createRequire(import.meta.url)
const preloadContentSearchConfig = require('../public/preload/utils/contentSearchConfig.js')

const normalizers = [
  ['renderer', normalizeContentSearchConfig, isContentSearchHybrid],
  [
    'preload',
    preloadContentSearchConfig.normalizeContentSearchConfig,
    preloadContentSearchConfig.isContentSearchHybrid
  ]
]

test('content search falls back to keyword mode until embedding config is complete', () => {
  const incompleteConfigs = [
    { searchMode: 'hybrid' },
    {
      searchMode: 'hybrid',
      embedding: { providerId: 'embedding-provider', model: '' }
    },
    {
      searchMode: 'hybrid',
      embedding: { providerId: '', model: 'embedding-model' }
    }
  ]

  for (const [name, normalize, isHybrid] of normalizers) {
    for (const config of incompleteConfigs) {
      const normalized = normalize(config)
      assert.equal(normalized.searchMode, 'keyword', `${name} should use keyword fallback`)
      assert.equal(isHybrid(config), false, `${name} should not report hybrid retrieval`)
    }
  }
})

test('content search enables hybrid mode only with a provider and model', () => {
  const config = {
    searchMode: ' HYBRID ',
    embedding: {
      providerId: ' embedding-provider ',
      model: ' embedding-model '
    }
  }

  for (const [name, normalize, isHybrid] of normalizers) {
    assert.deepEqual(normalize(config), {
      searchMode: 'hybrid',
      embedding: {
        providerId: 'embedding-provider',
        model: 'embedding-model'
      }
    }, `${name} should retain a complete hybrid config`)
    assert.equal(isHybrid(config), true, `${name} should report hybrid retrieval`)
    assert.equal(isHybrid({ ...config, searchMode: 'keyword' }), false)
  }
})
