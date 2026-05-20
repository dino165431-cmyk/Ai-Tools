import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectSessionMediaItems,
  filterSessionMediaItems
} from '../src/utils/chatMediaLibrary.js'

test('collectSessionMediaItems extracts assistant image and video media with prompts', () => {
  const image = { id: 'img1', src: 'data:image/png;base64,a', name: 'cover.png' }
  const video = { id: 'vid1', src: 'blob:video', name: 'clip.mp4' }
  const message = {
    id: 'msg1',
    role: 'assistant',
    imagePrompt: '画封面',
    videoPrompt: '做短视频',
    images: [image, { id: 'empty', src: '' }],
    videos: [video]
  }

  const items = collectSessionMediaItems([message], {
    imageMetaLabel: () => 'PNG',
    videoMetaLabel: () => 'MP4'
  })

  assert.equal(items.length, 2)
  assert.equal(items[0].key, 'msg1-image-img1')
  assert.equal(items[0].prompt, '画封面')
  assert.equal(items[0].meta, 'PNG')
  assert.equal(items[1].key, 'msg1-video-vid1')
  assert.equal(items[1].prompt, '做短视频')
  assert.equal(items[1].media, video)
})

test('filterSessionMediaItems filters only image or video kinds', () => {
  const items = [{ kind: 'image' }, { kind: 'video' }, { kind: 'image' }]
  assert.equal(filterSessionMediaItems(items, 'all').length, 3)
  assert.equal(filterSessionMediaItems(items, 'image').length, 2)
  assert.equal(filterSessionMediaItems(items, 'video').length, 1)
})
