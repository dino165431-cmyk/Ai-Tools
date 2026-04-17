function createAbortError(message = 'Aborted') {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

export async function consumeJsonEventStream({ response, signal, isAborted, onJson }) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let rawAll = ''
  let sawDataLine = false
  let sawAnyJson = false

  const throwIfAborted = () => {
    if (typeof isAborted === 'function' && isAborted()) throw createAbortError()
    if (signal?.aborted) throw createAbortError()
  }

  const processPayloadText = (payloadText) => {
    throwIfAborted()
    const text = String(payloadText || '').trim()
    if (!text) return
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      return
    }
    sawAnyJson = true
    onJson?.(json)
  }

  const processLine = (line) => {
    throwIfAborted()
    const trimmed = String(line || '').trim()
    if (!trimmed) return false

    if (trimmed.startsWith('data:')) {
      sawDataLine = true
      const payload = trimmed.slice(5).trim()
      if (!payload) return false
      if (payload === '[DONE]') return true
      processPayloadText(payload)
      return false
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) processPayloadText(trimmed)
    return false
  }

  const reader = response?.body?.getReader?.()
  if (!reader) {
    const raw = await response.text()
    rawAll = raw || ''
    const lines = String(rawAll).split(/\r?\n/)
    for (const line of lines) {
      if (processLine(line)) return { done: true, sawDataLine, sawAnyJson }
    }
    if (!sawDataLine && !sawAnyJson && rawAll.trim().startsWith('{')) processPayloadText(rawAll)
    return { done: false, sawDataLine, sawAnyJson }
  }

  while (true) {
    throwIfAborted()
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    buffer += chunk
    if (!sawDataLine && !sawAnyJson && rawAll.length < 1000000) rawAll += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (processLine(line)) return { done: true, sawDataLine, sawAnyJson }
    }
  }

  if (buffer) {
    throwIfAborted()
    if (!sawDataLine && !sawAnyJson && rawAll.length < 1000000) rawAll += buffer
    if (processLine(buffer)) return { done: true, sawDataLine, sawAnyJson }
  }

  if (!sawDataLine && !sawAnyJson && rawAll.trim().startsWith('{')) processPayloadText(rawAll)
  return { done: false, sawDataLine, sawAnyJson }
}
