// Пайплайн ассетів: кожен завантажувач приймає AbortSignal, мережеві збої повторюються з backoff.

export class HttpError extends Error {
  constructor(url, status) {
    super(`HTTP ${status}: ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

// fetch вирішується, щойно прийшли заголовки, і НЕ відхиляється на 404/500 — перевіряємо ok самі.
export async function fetchOk(url, { signal } = {}) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new HttpError(url, res.status)
  return res
}

// Тіло — другий асинхронний крок; битий JSON → SyntaxError.
export async function fetchJson(url, options) {
  const res = await fetchOk(url, options)
  return res.json()
}

export const loadJson = fetchJson

// Колбек-API Image загорнуто в проміс: однаковий порядок і для кешу, і для мережі.
function decodeImage(blob, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const src = URL.createObjectURL(blob)
    const cleanup = () => {
      URL.revokeObjectURL(src)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      img.src = ''
      reject(signal.reason)
    }
    img.onload = () => {
      cleanup()
      resolve(img)
    }
    img.onerror = () => {
      cleanup()
      const err = new Error('image decode failed')
      err.name = 'DecodeError'
      reject(err)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    img.src = src
  })
}

// Через fetch, а не голий img.src: так видно HTTP-статус (404 не ретраїмо, 503 — так).
export async function loadImage(url, { signal } = {}) {
  const res = await fetchOk(url, { signal })
  return decodeImage(await res.blob(), signal)
}

export async function loadAudio(audioCtx, url, { signal } = {}) {
  const res = await fetchOk(url, { signal })
  const data = await res.arrayBuffer()
  signal?.throwIfAborted()
  return audioCtx.decodeAudioData(data) // декодуємо зараз, а не на першому пострілі
}

// ---------- retry ----------

function isRetryable(err) {
  if (err.name === 'AbortError') return false // скасував користувач
  if (err instanceof HttpError) return err.status >= 500 // 4xx не виправиться повтором
  if (err.name === 'TimeoutError') return true
  return err instanceof TypeError // мережевий збій fetch
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

// fn(signal) викликається до `attempts` разів; кожна спроба має свій таймаут.
// Пауза: baseMs · 2^(спроба−1) · випадковий множник 0.5…1.5 (jitter — щоб клієнти не стукали хором).
export async function withRetry(
  fn,
  { attempts = 3, baseMs = 250, timeoutMs = 3000, signal, onRetry } = {},
) {
  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(timeoutMs)
    const attemptSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      return await fn(attemptSignal)
    } catch (err) {
      if (signal?.aborted) throw signal.reason
      if (attempt >= attempts || !isRetryable(err)) throw err
      const delay = baseMs * 2 ** (attempt - 1) * (0.5 + Math.random())
      onRetry?.(err, attempt, delay)
      await sleep(delay, signal)
    }
  }
}

// ---------- усі ассети ----------

function validateAtlas(atlas) {
  if (!atlas || typeof atlas.frames !== 'object') throw new TypeError('atlas: no frames')
  for (const name of ['ship_player', 'ship_enemy', 'bullet', 'asteroid_0']) {
    if (!atlas.frames[name]) throw new TypeError(`atlas: missing frame ${name}`)
  }
  return atlas
}

// Спрайти критичні (Promise.all: без корабля немає гри), звуки — ні (allSettled: гра стартує без них).
// Прогрес рахуємо самі: голий Promise.all мовчить до кінця.
export async function loadAll(
  manifest,
  { audioCtx, onProgress = () => {}, signal, retry = {} } = {},
) {
  const soundEntries = Object.entries(manifest.sounds ?? {})
  const total = 2 + soundEntries.length
  let done = 0
  const track = (label, promise) =>
    promise.then(
      (value) => {
        done += 1
        onProgress({ done, total, label })
        return value
      },
      (error) => {
        done += 1
        onProgress({ done, total, label, error })
        throw error
      },
    )
  const load = (fn) => withRetry(fn, { signal, ...retry })

  const critical = Promise.all([
    track(
      'atlas',
      load((s) => loadJson(manifest.sprites.atlas, { signal: s })),
    ),
    track(
      'sprites',
      load((s) => loadImage(manifest.sprites.image, { signal: s })),
    ),
  ])
  const optional = Promise.allSettled(
    soundEntries.map(([name, url]) =>
      track(
        name,
        load((s) => loadAudio(audioCtx, url, { signal: s })),
      ).then(
        (buffer) => [name, buffer],
        (error) => Promise.reject(Object.assign(error, { asset: name })),
      ),
    ),
  )

  const [[atlas, image], soundResults] = await Promise.all([critical, optional])
  const sounds = new Map()
  const warnings = []
  for (const r of soundResults) {
    if (r.status === 'fulfilled') sounds.set(r.value[0], r.value[1])
    else warnings.push(`звук "${r.reason.asset}" не завантажився: ${r.reason.name}`)
  }
  return { atlas: validateAtlas(atlas), image, sounds, warnings }
}
