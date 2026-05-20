import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPasswordVerifier,
  verifyPassword,
  encryptNoteContent,
  decryptNoteContent,
  isEncryptedNoteContent,
  replaceEncryptedNoteContent,
  changeNotePassword,
  resetNotePasswordWithFallback,
  changeFallbackPassword,
  encryptTextWithPassword,
  decryptTextWithPassword,
  hasFallbackRecovery,
  normalizeNoteSecurityConfig
} from '../src/utils/noteEncryption.js'

test('password verifier can validate the original password', async () => {
  const verifier = await createPasswordVerifier('note-pass-123')
  assert.equal(await verifyPassword('note-pass-123', verifier), true)
  assert.equal(await verifyPassword('wrong-pass', verifier), false)
})

test('encryptNoteContent and decryptNoteContent round-trip note text', async () => {
  const plaintext = '# Title\n\nsecret body'
  const encrypted = await encryptNoteContent(plaintext, { notePassword: 'note-pass-123' })

  assert.equal(isEncryptedNoteContent(encrypted), true)
  assert.equal(await decryptNoteContent(encrypted, 'note-pass-123'), plaintext)
})

test('replaceEncryptedNoteContent keeps encrypted storage readable with the same password', async () => {
  const encrypted = await encryptNoteContent('draft v1', {
    notePassword: 'note-pass-123',
    fallbackPassword: 'global-pass-456'
  })

  const replaced = await replaceEncryptedNoteContent(encrypted, {
    notePassword: 'note-pass-123',
    plaintext: 'draft v2'
  })

  assert.equal(isEncryptedNoteContent(replaced), true)
  assert.equal(hasFallbackRecovery(replaced), true)
  assert.equal(await decryptNoteContent(replaced, 'note-pass-123'), 'draft v2')
})

test('changeNotePassword keeps existing fallback recovery when no new fallback password is supplied', async () => {
  const encrypted = await encryptNoteContent('secret body', {
    notePassword: 'note-pass-123',
    fallbackPassword: 'global-pass-456'
  })

  const changed = await changeNotePassword(encrypted, {
    currentNotePassword: 'note-pass-123',
    newNotePassword: 'note-pass-789'
  })

  assert.equal(await decryptNoteContent(changed, 'note-pass-789'), 'secret body')
  assert.equal(hasFallbackRecovery(changed), true)
  const reset = await resetNotePasswordWithFallback(changed, {
    fallbackPassword: 'global-pass-456',
    newNotePassword: 'note-pass-999',
    newFallbackPassword: 'global-pass-456'
  })
  assert.equal(await decryptNoteContent(reset, 'note-pass-999'), 'secret body')
})

test('resetNotePasswordWithFallback rewraps encrypted note without losing content', async () => {
  const encrypted = await encryptNoteContent('secret body', {
    notePassword: 'note-pass-123',
    fallbackPassword: 'global-pass-456'
  })

  const reset = await resetNotePasswordWithFallback(encrypted, {
    fallbackPassword: 'global-pass-456',
    newNotePassword: 'note-pass-789',
    newFallbackPassword: 'global-pass-456'
  })

  assert.equal(await decryptNoteContent(reset, 'note-pass-789'), 'secret body')
  await assert.rejects(() => decryptNoteContent(reset, 'note-pass-123'))
})

test('changeFallbackPassword can rotate and remove fallback recovery without changing note password', async () => {
  const encrypted = await encryptNoteContent('secret body', {
    notePassword: 'note-pass-123',
    fallbackPassword: 'global-pass-456'
  })

  const rotated = await changeFallbackPassword(encrypted, {
    currentFallbackPassword: 'global-pass-456',
    newFallbackPassword: 'global-pass-789'
  })
  assert.equal(hasFallbackRecovery(rotated), true)

  const reset = await resetNotePasswordWithFallback(rotated, {
    fallbackPassword: 'global-pass-789',
    newNotePassword: 'note-pass-999',
    newFallbackPassword: 'global-pass-789'
  })
  assert.equal(await decryptNoteContent(reset, 'note-pass-999'), 'secret body')

  const removed = await changeFallbackPassword(rotated, {
    currentFallbackPassword: 'global-pass-789',
    newFallbackPassword: ''
  })
  assert.equal(hasFallbackRecovery(removed), false)
})

test('encryptTextWithPassword and decryptTextWithPassword round-trip secret text', async () => {
  const encrypted = await encryptTextWithPassword('config-pass-123', 'answer-456')
  assert.equal(await decryptTextWithPassword(encrypted, 'answer-456'), 'config-pass-123')
  await assert.rejects(() => decryptTextWithPassword(encrypted, 'wrong-answer'))
})

test('normalizeNoteSecurityConfig preserves fallback recovery metadata for protected notes', () => {
  const normalized = normalizeNoteSecurityConfig({
    globalFallbackVerifier: {
      iterations: 150000,
      salt: 'abc',
      hash: 'def'
    },
    protectedNotes: {
      'note/demo.md': {
        verifier: {
          iterations: 150000,
          salt: 'ghi',
          hash: 'jkl'
        },
        updatedAt: '2026-04-02T00:00:00.000Z',
        hasFallbackRecovery: true
      }
    }
  })

  assert.equal(normalized.protectedNotes['note/demo.md'].hasFallbackRecovery, true)
})
