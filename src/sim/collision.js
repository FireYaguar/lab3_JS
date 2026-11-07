import { applyPickup } from './components.js'

// Система колізій окремо від World: спочатку знаходимо пари, потім застосовуємо правила.
// Наївний O(n²) — свідомо; у Lab 7 findCollisions заміниться на spatial hash без змін у правилах.

export function* findCollisions(world) {
  const list = []
  for (const e of world) if (e.solid && e.alive) list.push(e)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      const dx = a.pos.x - b.pos.x
      const dy = a.pos.y - b.pos.y
      const r = a.radius + b.radius
      if (dx * dx + dy * dy <= r * r) yield [a, b]
    }
  }
}

const SCORE = { asteroid: 10, ship: 100 }
const RAM_DAMAGE = 30

function credit(world, ownerId, points) {
  const owner = world.get(ownerId)
  if (!owner) return
  owner.score += points
  world.emit('scored', { shipId: ownerId, points, total: owner.score })
}

function damage(world, ship, amount, sourceId) {
  const killed = ship.takeDamage(amount)
  world.emit('hit', { targetId: ship.id, sourceId, damage: amount, blocked: ship.shield > 0 })
  if (killed) world.explode(ship.pos.x, ship.pos.y, 'ship')
  return killed
}

export function resolveCollisions(world, pairs) {
  for (const pair of pairs) {
    const [a, b] = pair[0].kind <= pair[1].kind ? pair : [pair[1], pair[0]] // упорядкувати за kind
    if (!a.alive || !b.alive || !a.solid || !b.solid) continue // уже знищено в цьому кроці

    switch (`${a.kind}:${b.kind}`) {
      case 'asteroid:bullet':
        a.alive = false
        b.alive = false
        world.explode(a.pos.x, a.pos.y, 'asteroid')
        credit(world, b.ownerId, SCORE.asteroid)
        break
      case 'bullet:ship':
        if (a.ownerId === b.id) break // своя куля не б’є
        a.alive = false
        if (damage(world, b, a.damage, a.ownerId)) credit(world, a.ownerId, SCORE.ship)
        break
      case 'asteroid:ship':
        a.alive = false
        world.explode(a.pos.x, a.pos.y, 'asteroid')
        damage(world, b, RAM_DAMAGE, a.id)
        break
      case 'pickup:ship':
        a.alive = false
        applyPickup(b, a.pickup)
        world.emit('picked', { shipId: b.id, effect: a.pickup.effect })
        break
      default:
        break // asteroid:asteroid, bullet:bullet, bullet:pickup… — ігноруємо
    }
  }
}
