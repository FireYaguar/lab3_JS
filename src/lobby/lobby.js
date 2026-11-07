import { fetchJson } from '../assets/loader.js'

// Дані лобі без DOM: список кімнат, періодичне оновлення, вхід. Рендер — lobby-view.js.
// Події: 'loading', 'rooms' (detail: rooms), 'error' (detail: Error), 'join' (detail: { room, name }).

function parseRooms(data) {
  if (!data || !Array.isArray(data.rooms)) throw new TypeError('rooms: bad payload')
  return data.rooms.filter(
    (r) =>
      typeof r.id === 'string' &&
      typeof r.name === 'string' &&
      Number.isFinite(r.arena?.width) &&
      Number.isFinite(r.arena?.height),
  )
}

export class Lobby extends EventTarget {
  #url
  #intervalMs
  #timeoutMs
  #timer = 0
  #controller = null // живий, поки лобі на екрані; abort() — гравець пішов
  rooms = []

  constructor({ url = 'api/rooms.json', intervalMs = 5000, timeoutMs = 3000 } = {}) {
    super()
    this.#url = url
    this.#intervalMs = intervalMs
    this.#timeoutMs = timeoutMs
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  enter() {
    if (this.#controller) return
    this.#controller = new AbortController()
    this.refresh()
    this.#timer = setInterval(() => this.refresh(), this.#intervalMs)
  }

  async refresh() {
    const controller = this.#controller // запам’ятати: після leave() поле вже null
    if (!controller) return
    // кожен запит: скасування при виході АБО таймаут
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.#timeoutMs)])
    this.#emit('loading')
    try {
      const data = await fetchJson(this.#url, { signal })
      if (controller.signal.aborted) return // відповідь «з того світу» — екрана вже немає
      this.rooms = parseRooms(data)
      this.#emit('rooms', this.rooms)
    } catch (error) {
      if (controller.signal.aborted) return
      this.#emit('error', error)
    }
  }

  leave() {
    clearInterval(this.#timer)
    this.#controller?.abort()
    this.#controller = null
  }

  join(roomId, rawName) {
    const room = this.rooms.find((r) => r.id === roomId)
    const name = rawName.trim().slice(0, 16)
    if (!room) throw new Error('Оберіть кімнату')
    if (!name) throw new Error('Введіть ім’я')
    if (room.players >= room.maxPlayers) throw new Error('Кімната заповнена')
    this.leave()
    this.#emit('join', { room, name })
  }
}
