import { Entity } from './entity.js'

// Композиція: поведінка — це маленький шматок даних у полі сутності + система, що його обробляє.
// homing чіпляється і до Bullet, і до Asteroid; pickup — до звичайного Entity. Жодного нового extends.

// ---------- homing ----------
export function homing({ targets, turnRate, range }) {
  return { targets, turnRate, range }
}

function nearestTarget(world, e) {
  let best = null
  let bestDist = e.homing.range
  for (const kind of e.homing.targets) {
    for (const t of world.ofKind(kind)) {
      if (t === e || !t.solid || t.id === e.ownerId) continue
      const d = t.pos.sub(e.pos).length()
      if (d < bestDist) {
        best = t
        bestDist = d
      }
    }
  }
  return best
}

// Система: повертає швидкість кожної «самонавідної» сутності до найближчої цілі,
// не більше ніж на turnRate рад/с. Модуль швидкості не змінюється.
export function steerHoming(world, dt) {
  for (const e of world) {
    if (!e.homing || !e.alive) continue
    const target = nearestTarget(world, e)
    if (!target) continue
    const want = target.pos.sub(e.pos).angle()
    let diff = want - e.vel.angle()
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)) // у межах (−π, π]
    const maxTurn = e.homing.turnRate * dt
    e.vel = e.vel.rotate(Math.max(-maxTurn, Math.min(maxTurn, diff)))
  }
}

// ---------- pickup ----------
export const PICKUP_EFFECTS = ['shield', 'rapid', 'homing']
const EFFECT_SECONDS = { shield: 5, rapid: 6, homing: 8 }

// Pickup — не клас і не корабель: звичайна нерухома сутність із компонентом pickup.
export function createPickup({ x, y, effect }) {
  const e = new Entity({ kind: 'pickup', x, y, radius: 12, ttl: 12 })
  e.pickup = { effect }
  return e
}

export function applyPickup(ship, pickup) {
  const seconds = EFFECT_SECONDS[pickup.effect]
  if (pickup.effect === 'shield') ship.shield = seconds
  else if (pickup.effect === 'rapid') ship.rapid = seconds
  else if (pickup.effect === 'homing') ship.homingShots = seconds
}
