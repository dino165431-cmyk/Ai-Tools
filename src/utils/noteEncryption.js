const SUPPORTED_PROTECTED_NOTE_EXTENSIONS = ['.md', '.ipynb']

const DEFAULT_NOTE_SECURITY_CONFIG = Object.freeze({
  globalFallbackVerifier: null,
  protectedNotes: {}
})

const PASSWORD_VERIFIER_ITERATIONS = 150000
const CONTENT_KEY_WRAP_ITERATIONS = 210000
const CONTENT_KEY_LENGTH = 32
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function getCryptoApi() {
  const cryptoApi = globalThis?.crypto
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('当前环境不支持加密能力')
  }
  return cryptoApi
}

function bytesToBase64(bytes) {
  const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < normalized.length; i += 1) binary += String.fromCharCode(normalized[i])
  return btoa(binary)
}

function base64ToBytes(base64) {
  const raw = String(base64 || '').trim()
  if (!raw) return new Uint8Array()
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(raw, 'base64'))
  }
  const binary = atob(raw)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizePassword(password, label = '密码') {
  const pass = String(password ?? '')
  if (!pass) throw new Error(`${label}不能为空`)
  return pass
}

function normalizePasswordVerifier(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  if (!src) return null
  const iterations = Number(src.iterations)
  const salt = String(src.salt || '').trim()
  const hash = String(src.hash || '').trim()
  if (!Number.isFinite(iterations) || iterations < 1000) return null
  if (!salt || !hash) return null
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: Math.floor(iterations),
    salt,
    hash
  }
}

function normalizeWrap(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  if (!src) return null
  const iterations = Number(src.iterations)
  const salt = String(src.salt || '').trim()
  const iv = String(src.iv || '').trim()
  const ciphertext = String(src.ciphertext || '').trim()
  if (!Number.isFinite(iterations) || iterations < 1000) return null
  if (!salt || !iv || !ciphertext) return null
  return {
    kdf: 'PBKDF2-SHA256',
    iterations: Math.floor(iterations),
    salt,
    iv,
    ciphertext
  }
}

function normalizeEncryptedPayload(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  if (!src || src.kind !== 'ai-tools-note' || Number(src.v) !== 1) return null

  const content = src.content && typeof src.content === 'object' && !Array.isArray(src.content)
    ? src.content
    : null
  const wraps = src.wraps && typeof src.wraps === 'object' && !Array.isArray(src.wraps)
    ? src.wraps
    : null
  if (!content || !wraps) return null

  const iv = String(content.iv || '').trim()
  const ciphertext = String(content.ciphertext || '').trim()
  if (!iv || !ciphertext) return null

  const noteWrap = normalizeWrap(wraps.note)
  if (!noteWrap) return null
  const fallbackWrap = normalizeWrap(wraps.fallback)

  return {
    kind: 'ai-tools-note',
    v: 1,
    content: {
      alg: 'AES-GCM',
      iv,
      ciphertext
    },
    wraps: {
      note: noteWrap,
      ...(fallbackWrap ? { fallback: fallbackWrap } : {})
    }
  }
}

function parseEncryptedPayload(rawText) {
  const text = String(rawText ?? '').trim()
  if (!text.startsWith('{')) return null
  try {
    return normalizeEncryptedPayload(JSON.parse(text))
  } catch {
    return null
  }
}

function normalizePasswordBoxPayload(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
  if (!src || src.kind !== 'ai-tools-password-box' || Number(src.v) !== 1) return null
  const iterations = Number(src.iterations)
  const salt = String(src.salt || '').trim()
  const iv = String(src.iv || '').trim()
  const ciphertext = String(src.ciphertext || '').trim()
  if (!Number.isFinite(iterations) || iterations < 1000) return null
  if (!salt || !iv || !ciphertext) return null
  return {
    kind: 'ai-tools-password-box',
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: Math.floor(iterations),
    salt,
    iv,
    ciphertext
  }
}

function parsePasswordBoxPayload(rawText) {
  const text = String(rawText ?? '').trim()
  if (!text.startsWith('{')) return null
  try {
    return normalizePasswordBoxPayload(JSON.parse(text))
  } catch {
    return null
  }
}

function buildProtectedNoteMeta(rawVal, verifier) {
  return {
    verifier,
    updatedAt: typeof rawVal?.updatedAt === 'string' ? rawVal.updatedAt : '',
    hasFallbackRecovery: !!rawVal?.hasFallbackRecovery
  }
}

async function deriveKeyMaterial(password) {
  const subtle = getCryptoApi().subtle
  return subtle.importKey('raw', textEncoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey', 'deriveBits'])
}

async function deriveBits(password, saltBytes, iterations, bitLength = 256) {
  const subtle = getCryptoApi().subtle
  const keyMaterial = await deriveKeyMaterial(password)
  return new Uint8Array(
    await subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: saltBytes,
        iterations
      },
      keyMaterial,
      bitLength
    )
  )
}

async function deriveWrappingKey(password, saltBytes, iterations) {
  const subtle = getCryptoApi().subtle
  const keyMaterial = await deriveKeyMaterial(password)
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function importAesKey(rawKeyBytes) {
  return getCryptoApi().subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  getCryptoApi().getRandomValues(bytes)
  return bytes
}

async function encryptBytesWithKey(rawBytes, cryptoKey) {
  const iv = randomBytes(12)
  const ciphertext = await getCryptoApi().subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, rawBytes)
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  }
}

async function decryptBytesWithKey(envelope, cryptoKey) {
  const ivBytes = base64ToBytes(envelope.iv)
  const cipherBytes = base64ToBytes(envelope.ciphertext)
  const plaintext = await getCryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, cipherBytes)
  return new Uint8Array(plaintext)
}

async function wrapContentKey(contentKeyBytes, password) {
  const pass = normalizePassword(password)
  const salt = randomBytes(16)
  const wrapKey = await deriveWrappingKey(pass, salt, CONTENT_KEY_WRAP_ITERATIONS)
  const wrapped = await encryptBytesWithKey(contentKeyBytes, wrapKey)
  return {
    kdf: 'PBKDF2-SHA256',
    iterations: CONTENT_KEY_WRAP_ITERATIONS,
    salt: bytesToBase64(salt),
    ...wrapped
  }
}

async function unwrapContentKey(wrap, password) {
  const pass = normalizePassword(password)
  const normalizedWrap = normalizeWrap(wrap)
  if (!normalizedWrap) throw new Error('加密包装数据无效')
  const saltBytes = base64ToBytes(normalizedWrap.salt)
  const wrapKey = await deriveWrappingKey(pass, saltBytes, normalizedWrap.iterations)
  try {
    const contentKeyBytes = await decryptBytesWithKey(normalizedWrap, wrapKey)
    if (contentKeyBytes.byteLength !== CONTENT_KEY_LENGTH) {
      throw new Error('密钥长度无效')
    }
    return contentKeyBytes
  } catch {
    throw new Error('密码错误或笔记数据已损坏')
  }
}

async function encryptPlaintextWithContentKey(plaintext, contentKeyBytes) {
  const contentKey = await importAesKey(contentKeyBytes)
  return encryptBytesWithKey(textEncoder.encode(String(plaintext ?? '')), contentKey)
}

async function decryptPlaintextWithContentKey(contentEnvelope, contentKeyBytes) {
  const contentKey = await importAesKey(contentKeyBytes)
  try {
    const plainBytes = await decryptBytesWithKey(contentEnvelope, contentKey)
    return textDecoder.decode(plainBytes)
  } catch {
    throw new Error('笔记内容解密失败，数据可能已损坏')
  }
}

export function normalizeNoteSecurityConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const mapRaw = src.protectedNotes && typeof src.protectedNotes === 'object' && !Array.isArray(src.protectedNotes)
    ? src.protectedNotes
    : {}
  const protectedNotes = {}

  Object.entries(mapRaw).forEach(([rawKey, rawVal]) => {
    const key = String(rawKey || '').trim().replace(/\\/g, '/')
    if (!key || !key.startsWith('note/')) return
    if (!SUPPORTED_PROTECTED_NOTE_EXTENSIONS.some((ext) => key.toLowerCase().endsWith(ext))) return
    if (key.includes('\0') || key.includes('../') || key.startsWith('../')) return
    const verifier = normalizePasswordVerifier(rawVal?.verifier || rawVal?.passwordVerifier || rawVal)
    if (!verifier) return
    protectedNotes[key] = buildProtectedNoteMeta(rawVal, verifier)
  })

  return {
    globalFallbackVerifier: normalizePasswordVerifier(src.globalFallbackVerifier),
    protectedNotes
  }
}

export function getDefaultNoteSecurityConfig() {
  return {
    globalFallbackVerifier: DEFAULT_NOTE_SECURITY_CONFIG.globalFallbackVerifier,
    protectedNotes: {}
  }
}

export async function createPasswordVerifier(password) {
  const pass = normalizePassword(password)
  const salt = randomBytes(16)
  const hashBytes = await deriveBits(pass, salt, PASSWORD_VERIFIER_ITERATIONS)
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PASSWORD_VERIFIER_ITERATIONS,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hashBytes)
  }
}

export async function verifyPassword(password, verifier) {
  const pass = normalizePassword(password)
  const normalizedVerifier = normalizePasswordVerifier(verifier)
  if (!normalizedVerifier) return false
  const saltBytes = base64ToBytes(normalizedVerifier.salt)
  const hashBytes = await deriveBits(pass, saltBytes, normalizedVerifier.iterations)
  return bytesToBase64(hashBytes) === normalizedVerifier.hash
}

export async function encryptTextWithPassword(plaintext, password) {
  const pass = normalizePassword(password)
  const salt = randomBytes(16)
  const cryptoKey = await deriveWrappingKey(pass, salt, PASSWORD_VERIFIER_ITERATIONS)
  const encrypted = await encryptBytesWithKey(textEncoder.encode(String(plaintext ?? '')), cryptoKey)
  return JSON.stringify({
    kind: 'ai-tools-password-box',
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PASSWORD_VERIFIER_ITERATIONS,
    salt: bytesToBase64(salt),
    ...encrypted
  })
}

export async function decryptTextWithPassword(storedText, password) {
  const payload = parsePasswordBoxPayload(storedText)
  if (!payload) return String(storedText ?? '')
  const pass = normalizePassword(password)
  const saltBytes = base64ToBytes(payload.salt)
  const cryptoKey = await deriveWrappingKey(pass, saltBytes, payload.iterations)
  try {
    const plainBytes = await decryptBytesWithKey(payload, cryptoKey)
    return textDecoder.decode(plainBytes)
  } catch {
    throw new Error('密码错误或密文已损坏')
  }
}

export function isEncryptedNoteContent(rawText) {
  return !!parseEncryptedPayload(rawText)
}

export async function encryptNoteContent(plaintext, options = {}) {
  const notePassword = normalizePassword(options.notePassword, '笔记密码')
  const fallbackPassword = options.fallbackPassword ? normalizePassword(options.fallbackPassword, '全局配置密码') : ''
  const contentKeyBytes = randomBytes(CONTENT_KEY_LENGTH)
  const content = await encryptPlaintextWithContentKey(plaintext, contentKeyBytes)
  const noteWrap = await wrapContentKey(contentKeyBytes, notePassword)
  const fallbackWrap = fallbackPassword ? await wrapContentKey(contentKeyBytes, fallbackPassword) : null

  return JSON.stringify({
    kind: 'ai-tools-note',
    v: 1,
    content: {
      alg: 'AES-GCM',
      ...content
    },
    wraps: {
      note: noteWrap,
      ...(fallbackWrap ? { fallback: fallbackWrap } : {})
    }
  })
}

export async function decryptNoteContent(storedText, password) {
  const payload = parseEncryptedPayload(storedText)
  if (!payload) return String(storedText ?? '')
  const contentKeyBytes = await unwrapContentKey(payload.wraps.note, password)
  return decryptPlaintextWithContentKey(payload.content, contentKeyBytes)
}

export async function replaceEncryptedNoteContent(storedText, options = {}) {
  const notePassword = normalizePassword(options.notePassword, '笔记密码')
  const plaintext = String(options.plaintext ?? '')
  const payload = parseEncryptedPayload(storedText)
  if (!payload) {
    return encryptNoteContent(plaintext, { notePassword })
  }

  const contentKeyBytes = await unwrapContentKey(payload.wraps.note, notePassword)
  const content = await encryptPlaintextWithContentKey(plaintext, contentKeyBytes)
  return JSON.stringify({
    ...cloneJson(payload),
    content: {
      alg: 'AES-GCM',
      ...content
    }
  })
}

export async function clearEncryptedNoteContent(storedText, password) {
  const payload = parseEncryptedPayload(storedText)
  if (!payload) return String(storedText ?? '')
  const contentKeyBytes = await unwrapContentKey(payload.wraps.note, password)
  return decryptPlaintextWithContentKey(payload.content, contentKeyBytes)
}

export function hasFallbackRecovery(storedText) {
  const payload = parseEncryptedPayload(storedText)
  return !!payload?.wraps?.fallback
}

export async function changeNotePassword(storedText, options = {}) {
  const payload = parseEncryptedPayload(storedText)
  if (!payload) throw new Error('当前笔记不是加密笔记')

  const currentNotePassword = normalizePassword(options.currentNotePassword, '当前笔记密码')
  const newNotePassword = normalizePassword(options.newNotePassword, '新笔记密码')
  const nextFallbackPassword = options.newFallbackPassword

  const contentKeyBytes = await unwrapContentKey(payload.wraps.note, currentNotePassword)
  const noteWrap = await wrapContentKey(contentKeyBytes, newNotePassword)
  let fallbackWrap = payload.wraps.fallback ? cloneJson(payload.wraps.fallback) : null

  if (nextFallbackPassword !== undefined) {
    fallbackWrap = nextFallbackPassword
      ? await wrapContentKey(contentKeyBytes, normalizePassword(nextFallbackPassword, '全局配置密码'))
      : null
  }

  return JSON.stringify({
    ...cloneJson(payload),
    wraps: {
      note: noteWrap,
      ...(fallbackWrap ? { fallback: fallbackWrap } : {})
    }
  })
}

export async function resetNotePasswordWithFallback(storedText, options = {}) {
  const payload = parseEncryptedPayload(storedText)
  if (!payload) throw new Error('当前笔记不是加密笔记')
  if (!payload.wraps.fallback) throw new Error('当前笔记未绑定全局配置密码')

  const fallbackPassword = normalizePassword(options.fallbackPassword, '全局配置密码')
  const newNotePassword = normalizePassword(options.newNotePassword, '新笔记密码')
  const newFallbackPassword = options.newFallbackPassword
    ? normalizePassword(options.newFallbackPassword, '全局配置密码')
    : fallbackPassword

  const contentKeyBytes = await unwrapContentKey(payload.wraps.fallback, fallbackPassword)
  const noteWrap = await wrapContentKey(contentKeyBytes, newNotePassword)
  const fallbackWrap = await wrapContentKey(contentKeyBytes, newFallbackPassword)

  return JSON.stringify({
    ...cloneJson(payload),
    wraps: {
      note: noteWrap,
      fallback: fallbackWrap
    }
  })
}

export async function changeFallbackPassword(storedText, options = {}) {
  const payload = parseEncryptedPayload(storedText)
  if (!payload) throw new Error('当前笔记不是加密笔记')
  if (!payload.wraps.fallback) throw new Error('当前笔记未绑定全局配置密码')

  const currentFallbackPassword = normalizePassword(options.currentFallbackPassword, '全局配置密码')
  const nextFallbackPassword = options.newFallbackPassword
  const contentKeyBytes = await unwrapContentKey(payload.wraps.fallback, currentFallbackPassword)

  const nextFallbackWrap = nextFallbackPassword
    ? await wrapContentKey(contentKeyBytes, normalizePassword(nextFallbackPassword, '全局配置密码'))
    : null

  return JSON.stringify({
    ...cloneJson(payload),
    wraps: {
      ...cloneJson(payload.wraps),
      ...(nextFallbackWrap ? { fallback: nextFallbackWrap } : {})
    }
  }, (key, value) => {
    if (key === 'fallback' && !nextFallbackWrap) return undefined
    return value
  })
}
