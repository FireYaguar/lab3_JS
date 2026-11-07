import { wrap } from './arena.js'
import { findCollisions, resolveCollisions } from './collision.js'
import { createPickup, homing, PICKUP_EFFECTS, steerHoming } from './components.js'
import { Asteroid, Explosion } from './entity.js'
import { mulberry32, pick, range } from './random.js'

const IDLE = { thrust: false, turn: 0, fire: false }
const HOMING_ASTEROID_EVERY = 4 // кожен 4-й астероїд — «мисливець»

// Менеджер сутностей: Map<id, Entity>, крок симуляції, прибирання мертвих.
// Події ('fired', 'hit', 'exploded', 'scored', 'picked') — через world.events (EventTarget):
// звук і HUD підписуються ззовні, симуляція їх не імпортує.
export class World {
  #entities = new Map()
  #spawnQueue = [] // спавн під час кроку — після нього, щоб не змінювати Map посеред обходу
  #stepping = false
  #asteroidTimer = 0
  #pickupTimer = 3
  #asteroidsSpawned = 0

  constructor(arena, seed = 1, { asteroids = 6 } = {}) {
    this.arena = arena
    this.rng = mulberry32(seed)
    this.time = 0
    this.asteroidCount = asteroids
    this.events = new EventTarget() // є і в браузері, і в Node — сим лишається спільним (Lab 5)
  }

  emit(type, detail) {
    this.events.dispatchEvent(new CustomEvent(type, { detail }))
  }

  get size() {
    return this.#entities.size
  }

  spawn(entity) {
    if (this.#stepping) this.#spawnQueue.push(entity)
    else this.#entities.set(entity.id, entity)
    return entity
  }

  // Відкладене видалення: лише позначка, фізично прибирає #sweep() наприкінці кроку.
  despawn(id) {
    const e = this.#entities.get(id)
    if (e) e.alive = false
  }

  get(id) {
    return this.#entities.get(id)
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values()
  }

  *ofKind(kind) {
    for (const e of this) if (e.kind === kind) yield e
  }

  explode(x, y, kind) {
    this.spawn(new Explosion({ x, y, rng: this.rng }))
    this.emit('exploded', { x, y, kind })
  }

  // commands: Map<shipId, { thrust, turn, fire }>
  step(dt, commands = new Map()) {
    this.#stepping = true
    this.time += dt
    for (const e of this) e.savePrev()

    for (const ship of this.ofKind('ship')) {
      const command = commands.get(ship.id) ?? IDLE
      ship.control(command, dt)
      if (command.fire) {
        const bullet = ship.fire()
        if (bullet) {
          this.spawn(bullet)
          this.emit('fired', { shipId: ship.id, x: bullet.pos.x, y: bullet.pos.y })
        }
      }
    }

    steerHoming(this, dt)
    for (const e of this) {
      e.update(dt)
      if (e.wraps) wrap(e.pos, this.arena)
    }
    resolveCollisions(this, findCollisions(this))
    this.#maintain(dt)
    this.#sweep()

    this.#stepping = false
    for (const e of this.#spawnQueue) this.#entities.set(e.id, e)
    this.#spawnQueue.length = 0
  }

  #sweep() {
    for (const [id, e] of this.#entities) if (!e.alive) this.#entities.delete(id)
  }

  // Респаун кораблів через 2 с, підтримка кількості астероїдів і pickup.
  #maintain(dt) {
    for (const ship of this.ofKind('ship')) {
      if (ship.solid) continue
      ship.respawnIn -= dt
      if (ship.respawnIn <= 0) {
        const p = this.safeSpot()
        ship.respawn(p.x, p.y)
      }
    }

    this.#asteroidTimer -= dt
    if (this.#asteroidTimer <= 0 && this.#count('asteroid') < this.asteroidCount) {
      this.spawnAsteroid()
      this.#asteroidTimer = 1.5
    }

    this.#pickupTimer -= dt
    if (this.#pickupTimer <= 0 && this.#count('pickup') === 0) {
      const p = this.safeSpot()
      this.spawn(createPickup({ x: p.x, y: p.y, effect: pick(this.rng, PICKUP_EFFECTS) }))
      this.#pickupTimer = 6
    }
  }

  spawnAsteroid() {
    const p = this.safeSpot()
    const asteroid = this.spawn(new Asteroid({ x: p.x, y: p.y, rng: this.rng }))
    this.#asteroidsSpawned += 1
    if (this.#asteroidsSpawned % HOMING_ASTEROID_EVERY === 0) {
      asteroid.homing = homing({ targets: ['ship'], turnRate: 0.7, range: 450 })
    }
    return asteroid
  }

  #count(kind) {
    let n = 0
    for (const _ of this.ofKind(kind)) n += 1
    return n
  }

  // Випадкова точка, далека від кораблів і астероїдів (до 30 спроб).
  safeSpot(minDist = 180) {
    let x = 0
    let y = 0
    for (let tries = 0; tries < 30; tries++) {
      x = range(this.rng, 0, this.arena.width)
      y = range(this.rng, 0, this.arena.height)
      let ok = true
      for (const e of this) {
        if (!e.solid || (e.kind !== 'ship' && e.kind !== 'asteroid')) continue
        if (Math.hypot(e.pos.x - x, e.pos.y - y) < minDist + e.radius) {
          ok = false
          break
        }
      }
      if (ok) break
    }
    return { x, y }
  }
}
