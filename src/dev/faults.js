// Lab 3: галерея збоїв і заміри завантаження. Вмикається параметрами URL:
//   ?slow=1             — кожен ассет із затримкою (видно прогрес-бар)
//   ?fault=404          — спрайтшит → 404 (критичний, без ретраю) → Retry
//   ?fault=timeout      — звук explode відповідає 10 с → таймаут ×3 спроби → гра стартує без нього
//   ?fault=abort        — повільне завантаження + автоматичне «Скасувати» через 200 мс → Retry
//   ?fault=badjson      — атлас спрайтів — обрізаний JSON → SyntaxError → Retry
//   ?fault=flaky        — спрайтшит двічі відповідає 503 → retry з backoff → успіх
//   ?fault=lobby-timeout — /api/rooms відповідає 5 с при таймауті 3 с → помилка в лобі, автоповтор
//   ?exp=loadtime       — sequential await vs Promise.all (з ?slow=1)
// Затримки/збої робить middleware у vite.config.js (працює в `npm run dev` і `npm run preview`).

import { loadAudio, loadImage, loadJson } from '../assets/loader.js'

const SLOW_DELAYS = [150, 400, 200, 250, 300, 350] // мс: атлас, спрайтшит, 4 звуки

function withQuery(url, query) {
  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}

export function applyFaults(manifest, params) {
  const m = structuredClone(manifest)
  const fault = params.get('fault')
  if (params.has('slow') || fault === 'abort') {
    m.sprites.atlas = withQuery(m.sprites.atlas, `delay=${SLOW_DELAYS[0]}`)
    m.sprites.image = withQuery(m.sprites.image, `delay=${SLOW_DELAYS[1]}`)
    Object.keys(m.sounds).forEach((k, i) => {
      m.sounds[k] = withQuery(m.sounds[k], `delay=${SLOW_DELAYS[2 + i] ?? 300}`)
    })
  }
  if (fault === '404') m.sprites.image = 'assets/missing-sprites.png'
  if (fault === 'timeout') m.sounds.explode = withQuery(m.sounds.explode, 'delay=10000')
  if (fault === 'badjson') m.sprites.atlas = withQuery(m.sprites.atlas, 'corrupt=1')
  if (fault === 'flaky') m.sprites.image = withQuery(m.sprites.image, 'flaky=2')
  return m
}

export function armAutoAbort(params, controller, attempt) {
  if (params.get('fault') !== 'abort' || attempt > 1) return
  setTimeout(() => {
    console.log('[fault] auto-abort посеред завантаження')
    controller.abort()
  }, 200)
}

export function lobbyUrl(params) {
  return params.get('fault') === 'lobby-timeout' ? 'api/rooms.json?delay=5000' : 'api/rooms.json'
}

// ---------- sequential vs concurrent ----------
function jobs(manifest, audioCtx, run) {
  const bust = (url) => withQuery(url, `run=${run}`) // обхід HTTP-кешу між прогонами
  return [
    () => loadJson(bust(manifest.sprites.atlas)),
    () => loadImage(bust(manifest.sprites.image)),
    ...Object.values(manifest.sounds).map((url) => () => loadAudio(audioCtx, bust(url))),
  ]
}

async function sequential(manifest, audioCtx, run) {
  const t = performance.now()
  for (const job of jobs(manifest, audioCtx, run)) await job() // наступний стартує лише після попереднього
  return performance.now() - t
}

async function concurrent(manifest, audioCtx, run) {
  const t = performance.now()
  await Promise.all(jobs(manifest, audioCtx, run).map((job) => job())) // усі стартують одразу
  return performance.now() - t
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export async function runLoadTiming(manifest, audioCtx, show, runs = 5) {
  const seq = []
  const con = []
  for (let i = 0; i < runs; i++) {
    seq.push(await sequential(manifest, audioCtx, `s${i}`))
    con.push(await concurrent(manifest, audioCtx, `c${i}`))
    show([`прогін ${i + 1}/${runs}…`])
  }
  const result = {
    runs,
    sequentialMs: seq.map(Math.round),
    concurrentMs: con.map(Math.round),
    sequentialMedian: Math.round(median(seq)),
    concurrentMedian: Math.round(median(con)),
  }
  window.__loadtime = result
  console.log('[loadtime]', result)
  show([
    `sequential: медіана ${result.sequentialMedian} мс`,
    `Promise.all: медіана ${result.concurrentMedian} мс`,
  ])
  return result
}
