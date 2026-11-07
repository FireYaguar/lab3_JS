import { loadAll, loadJson, withRetry } from './assets/loader.js'
import { connectAudio, createAudio } from './audio.js'
import { createHud } from './hud.js'
import { createInput, readControls } from './input.js'
import { Lobby } from './lobby/lobby.js'
import { showLobby } from './lobby/lobby-view.js'
import { createLoop } from './loop.js'
import { setupCanvas } from './render/canvas.js'
import { drawHud, drawWorld } from './render/draw.js'
import { drawLoading } from './render/loading.js'
import { createArena } from './sim/arena.js'
import { Ship } from './sim/ship.js'
import { World } from './sim/world.js'

const params = new URLSearchParams(location.search)
const ui = document.getElementById('ui')
const { ctx, view } = setupCanvas(document.getElementById('game'))
const audio = createAudio()
// ?fault=… / ?slow=1 / ?exp=loadtime — галерея збоїв і заміри (README, Lab 3). Без параметрів не вантажиться.
const dev =
  params.has('fault') || params.has('slow') || params.get('exp') === 'loadtime'
    ? await import('./dev/faults.js')
    : null

// AudioContext стартує лише після жесту гравця
const unlockAudio = () => audio.unlock()
window.addEventListener('pointerdown', unlockAudio, { once: true })
window.addEventListener('keydown', unlockAudio, { once: true })

// ---------- UI-кнопки під екраном завантаження ----------
function actionButton(label, onClick) {
  const box = document.createElement('div')
  box.className = 'ui-actions'
  const btn = document.createElement('button')
  btn.textContent = label
  btn.addEventListener('click', onClick, { once: true })
  box.append(btn)
  ui.append(box)
  return box
}

function clickOnce(label) {
  return new Promise((resolve) => {
    const box = actionButton(label, () => {
      box.remove()
      resolve()
    })
  })
}

function describe(err) {
  switch (err.name) {
    case 'AbortError':
      return 'Завантаження скасовано'
    case 'TimeoutError':
      return 'Таймаут мережі (сервер не відповів вчасно)'
    case 'HttpError':
      return `Сервер відповів ${err.status}: ${err.url}`
    case 'SyntaxError':
      return `Битий JSON: ${err.message}`
    case 'TypeError':
      return `Мережа недоступна або невірні дані: ${err.message}`
    default:
      return `${err.name}: ${err.message}`
  }
}

// ---------- 1. Ассети: гра не стартує, поки не готові; збій → Retry ----------
async function loadAssets() {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController()
    const cancel = actionButton('Скасувати', () => controller.abort())
    let state = { done: 0, total: 1, label: 'manifest' }
    drawLoading(ctx, view, state)
    dev?.armAutoAbort(params, controller, attempt)
    try {
      let manifest = await withRetry((signal) => loadJson('assets/manifest.json', { signal }), {
        signal: controller.signal,
      })
      if (dev) manifest = dev.applyFaults(manifest, params)
      if (params.get('exp') === 'loadtime') return { manifest } // заміри замість гри
      return await loadAll(manifest, {
        audioCtx: audio.ctx,
        signal: controller.signal,
        retry: {
          onRetry: (err, n, ms) =>
            console.info(`[retry] ${err.name} → спроба ${n + 1} через ${Math.round(ms)} мс`),
        },
        onProgress: (p) => {
          if (controller.signal.aborted) return // запізнілі відмови сусідів після abort — не перемальовувати
          state = { ...p, label: p.error ? `${p.label}: ${p.error.name}` : p.label }
          drawLoading(ctx, view, state)
        },
      })
    } catch (err) {
      // Promise.all уже відхилився, але сусідні завантаження ще біжать — зупиняємо їх
      controller.abort()
      cancel.remove()
      console.warn('[loading] failed:', err)
      drawLoading(ctx, view, { ...state, color: '#ff6b6b', lines: [describe(err)] })
      await clickOnce('Retry')
    } finally {
      cancel.remove()
    }
  }
}

// ---------- 2. Лобі ----------
async function chooseRoom(notes) {
  const lobby = new Lobby({ url: dev?.lobbyUrl(params) ?? 'api/rooms.json' })
  if (!params.has('room')) return showLobby(ui, lobby, notes)
  // ?room=classic&name=… — автоматичний вхід (для експериментів і тестів)
  const joined = new Promise((resolve) => lobby.addEventListener('join', (e) => resolve(e.detail)))
  lobby.addEventListener(
    'rooms',
    () => lobby.join(params.get('room'), params.get('name') ?? 'pilot'),
    {
      once: true,
    },
  )
  lobby.enter()
  return joined
}

// ---------- 3. Гра ----------
function createGame(room, name, sprites) {
  const { width, height, seed, asteroids } = room.arena
  const world = new World(createArena(width, height), seed, { asteroids })
  const player = world.spawn(new Ship({ x: width / 2, y: height / 2, name }))
  // мішень: другий корабель без пілота — на ньому видно шкоду кулями, вибух і респаун
  world.spawn(new Ship({ x: width * 0.8, y: height * 0.3, name: 'drone' }))
  for (let i = 0; i < Math.min(5, asteroids); i++) world.spawnAsteroid()

  const input = createInput(window)
  const commands = new Map() // Map<shipId, command> — у Lab 5 сюди лягатимуть команди з мережі
  const hud = createHud(world.events, player)
  connectAudio(world.events, audio, player.id)

  const game = {
    world,
    player,
    hud: [], // додаткові рядки HUD (експерименти)
    simulate(dt, command = readControls(input)) {
      commands.set(player.id, command)
      world.step(dt, commands)
      input.consume()
    },
    render(alpha, stats) {
      drawWorld(ctx, view, world, alpha, player.id, sprites)
      drawHud(ctx, stats, [`room     ${room.name}`, ...hud.lines(world), ...game.hud])
    },
  }
  return game
}

const assets = await loadAssets()
if (params.get('exp') === 'loadtime') {
  await dev.runLoadTiming(assets.manifest, audio.ctx, (lines) =>
    drawLoading(ctx, view, { done: 1, total: 1, label: 'load timing', lines }),
  )
} else {
  audio.setBuffers(assets.sounds)
  ctx.fillStyle = '#05060c'
  ctx.fillRect(0, 0, view.width, view.height)
  // попередження (напр. «звук не завантажився») показуються в лобі — гра все одно стартує
  const { room, name } = await chooseRoom(assets.warnings)
  audio.unlock() // клік «Join» — жест користувача
  const game = createGame(room, name, assets)

  // ?exp=… — навмисні поломки з README (Lab 1 M4) і демонстрація бага з this (Lab 2).
  if (params.has('exp') || params.has('auto')) {
    const { createExperimentLoop } = await import('./dev/experiments.js')
    createExperimentLoop(params, game).start()
  } else {
    createLoop({ simulate: game.simulate, render: game.render }).start()
  }
}
