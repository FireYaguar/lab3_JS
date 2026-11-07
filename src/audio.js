// Web Audio. AudioContext можна створити одразу (буфери декодуються під час завантаження),
// але грати він почне лише після жесту гравця — unlock() на клік «Join» / першу клавішу.

export function createAudio() {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  let buffers = new Map()

  return {
    ctx,
    setBuffers(map) {
      buffers = map
    },
    unlock() {
      return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
    },
    play(name, { volume = 1, rate = 1 } = {}) {
      const buffer = buffers.get(name)
      if (!buffer || ctx.state !== 'running') return // немає звуку → гра все одно йде
      const source = ctx.createBufferSource() // одноразовий вузол, буфер — багаторазовий
      source.buffer = buffer
      source.playbackRate.value = rate
      const gain = ctx.createGain()
      gain.gain.value = volume
      source.connect(gain).connect(master)
      source.start()
    },
  }
}

// Підписка на шину подій симуляції. Сим не знає про цей модуль — лише dispatchEvent.
export function connectAudio(bus, audio, playerId) {
  const mine = (id) => (id === playerId ? 1 : 0.4)
  bus.addEventListener('fired', (e) => audio.play('shoot', { volume: 0.5 * mine(e.detail.shipId) }))
  bus.addEventListener('hit', () => audio.play('hit', { volume: 0.7 }))
  bus.addEventListener('exploded', (e) =>
    audio.play('explode', { rate: e.detail.kind === 'ship' ? 0.8 : 1.1 }),
  )
  bus.addEventListener('picked', () => audio.play('pickup'))
}
