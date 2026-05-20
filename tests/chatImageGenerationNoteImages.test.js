import test from 'node:test'
import assert from 'node:assert/strict'

import { extractImageOutputEntries } from '../src/utils/chatImageGeneration.js'

test('extractImageOutputEntries keeps at least 10 note images by default', () => {
  const payload = {
    images: Array.from({ length: 10 }, (_, index) => ({
      name: `note-image-${index + 1}`,
      mime: 'image/png',
      base64: Buffer.from(`img-${index + 1}-${'x'.repeat(160)}`).toString('base64')
    }))
  }

  const images = extractImageOutputEntries(payload)
  assert.equal(images.length, 10)
  assert.equal(images[0].name, 'note-image-1')
  assert.equal(images[9].name, 'note-image-10')
})

test('extractImageOutputEntries does not treat note hyperlinks as images', () => {
  const payload = {
    path: 'ops/nginx/certbot.md',
    content: [
      '- https://certbot.eff.org/',
      '- https://letsencrypt.org/',
      '- https://datatracker.ietf.org/doc/html/rfc8555',
      'return 301 https://$host$request_uri;',
      'proxy_pass http://127.0.0.1:9090/;',
      'proxy_pass http://127.0.0.1:9090/;'
    ].join('\n'),
    images: []
  }

  assert.deepEqual(extractImageOutputEntries(payload), [])
})

test('extractImageOutputEntries still reads markdown image links in note content', () => {
  const payload = {
    content: 'Diagram: ![nginx flow](https://cdn.example.test/render?id=nginx-flow)'
  }

  const images = extractImageOutputEntries(payload)
  assert.equal(images.length, 1)
  assert.equal(images[0].src, 'https://cdn.example.test/render?id=nginx-flow')
})
