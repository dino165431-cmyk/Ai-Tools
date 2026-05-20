import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatSessionAssetsDirectory,
  collectChatMediaAssetPathsFromPayload,
  inferChatMediaAssetExtension,
  isChatSessionAssetsDirectoryPath,
  isTransientChatMediaSrc,
  resolveChatMediaAssetPath,
  serializeChatMediaForSave
} from '../src/utils/chatMediaAssets.js'

test('serializeChatMediaForSave stores local asset reference without transient src', () => {
  const media = serializeChatMediaForSave({
    src: 'blob:file:///temporary-video',
    mime: 'video/mp4',
    name: 'clip.mp4',
    assetRef: 'message/clip.mp4',
    assetPath: 'session/history/test.json.assets/message/clip.mp4'
  }, 'video')

  assert.equal(media.src, undefined)
  assert.equal(media.assetRef, 'message/clip.mp4')
  assert.equal(media.assetPath, undefined)
  assert.equal(media.localPath, undefined)
  assert.equal(media.kind, 'video')
})

test('chat media asset helpers infer common image and video extensions', () => {
  assert.equal(inferChatMediaAssetExtension({ mime: 'image/webp' }, 'image'), 'webp')
  assert.equal(inferChatMediaAssetExtension({ mime: 'video/mp4' }, 'video'), 'mp4')
  assert.equal(inferChatMediaAssetExtension({ name: 'preview.jpeg' }, 'image'), 'jpeg')
})

test('collectChatMediaAssetPathsFromPayload reads saved image and video assets', () => {
  const payload = {
    session: {
      messages: [
        {
          images: [{ assetRef: 'a/image.png' }],
          videos: [{ assetRef: 'a/video.mp4' }]
        }
      ]
    }
  }

  assert.deepEqual(
    collectChatMediaAssetPathsFromPayload(payload, { sessionFilePath: 'session/history/test.json' }),
    [
      'session/history/test.json.assets/a/image.png',
      'session/history/test.json.assets/a/video.mp4'
    ]
  )
})

test('session media assets resolve from the session file sidecar directory', () => {
  const sessionFilePath = 'session/projects/story.json'

  assert.equal(
    buildChatSessionAssetsDirectory(sessionFilePath),
    'session/projects/story.json.assets'
  )
  assert.equal(
    resolveChatMediaAssetPath({ assetRef: 'msg/image.png' }, { sessionFilePath }),
    'session/projects/story.json.assets/msg/image.png'
  )
})

test('chat session asset directories are recognized as sidecar storage', () => {
  assert.equal(isChatSessionAssetsDirectoryPath('session/history/story.json.assets'), true)
  assert.equal(isChatSessionAssetsDirectoryPath('session/history/story.json.assets/msg/image.png'), true)
  assert.equal(isChatSessionAssetsDirectoryPath('session/history/story.assets'), false)
  assert.equal(isChatSessionAssetsDirectoryPath('session/history/story.json'), false)
})

test('isTransientChatMediaSrc detects inline and blob media urls', () => {
  assert.equal(isTransientChatMediaSrc('data:image/png;base64,abc'), true)
  assert.equal(isTransientChatMediaSrc('data:video/mp4;base64,abc'), true)
  assert.equal(isTransientChatMediaSrc('blob:file:///abc'), true)
  assert.equal(isTransientChatMediaSrc('https://cdn.example.test/a.png'), false)
})

test('inferChatMediaAssetExtension falls back to mime and file names', () => {
  assert.equal(inferChatMediaAssetExtension({ mime: 'image/png' }, 'image'), 'png')
  assert.equal(inferChatMediaAssetExtension({ fileName: 'clip.mov' }, 'video'), 'mov')
})

test('global chat media paths are not treated as managed assets', () => {
  const unmanagedPath = `${['chat', 'media'].join('-')}/2026-04/message/clip.mp4`
  const media = serializeChatMediaForSave({
    src: 'blob:file:///temporary-video',
    mime: 'video/mp4',
    assetPath: unmanagedPath
  }, 'video')

  assert.equal(media.src, undefined)
  assert.equal(media.assetPath, undefined)
  assert.equal(media.localPath, undefined)
  assert.equal(
    resolveChatMediaAssetPath(
      { assetPath: unmanagedPath },
      { sessionFilePath: 'session/history/test.json' }
    ),
    ''
  )
  assert.deepEqual(
    collectChatMediaAssetPathsFromPayload({
      messages: [{ videos: [{ assetPath: unmanagedPath }] }]
    }, { sessionFilePath: 'session/history/test.json' }),
    []
  )
})
