// HUD-логіка: рядки стану + короткі повідомлення з подій (+10, «Щит!», «Влучання»).
// Як і audio.js, слухає шину подій; симуляція цей модуль не імпортує.

const MESSAGE_MS = 1600
const EFFECT_NAMES = { shield: 'Щит!', rapid: 'Швидка стрільба!', homing: 'Самонавідні кулі!' }

export function createHud(bus, player) {
  const messages = [] // { text, until }
  const push = (text) => {
    messages.push({ text, until: performance.now() + MESSAGE_MS })
    if (messages.length > 4) messages.shift()
  }

  bus.addEventListener('scored', (e) => {
    if (e.detail.shipId === player.id) push(`+${e.detail.points}`)
  })
  bus.addEventListener('hit', (e) => {
    if (e.detail.targetId !== player.id) return
    push(e.detail.blocked ? 'щит відбив удар' : `влучання −${e.detail.damage}`)
  })
  bus.addEventListener('picked', (e) => {
    if (e.detail.shipId === player.id) push(EFFECT_NAMES[e.detail.effect])
  })

  function effects() {
    const list = []
    if (player.shield > 0) list.push(`shield ${player.shield.toFixed(1)}`)
    if (player.rapid > 0) list.push(`rapid ${player.rapid.toFixed(1)}`)
    if (player.homingShots > 0) list.push(`homing ${player.homingShots.toFixed(1)}`)
    return list.join(' ') || '—'
  }

  return {
    lines(world) {
      const now = performance.now()
      while (messages.length && messages[0].until < now) messages.shift()
      return [
        `${player.name}  score ${player.score}`,
        player.solid ? `hp       ${player.hp}` : `respawn  ${player.respawnIn.toFixed(1)} s`,
        `effects  ${effects()}`,
        `entities ${world.size}`,
        ...messages.map((m) => `» ${m.text}`),
      ]
    },
  }
}
