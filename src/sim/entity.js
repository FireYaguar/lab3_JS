import { range } from './random.js'
import { Vector2 } from './vector.js'

// Базова сутність. Наслідування — максимум один рівень (Bullet/Asteroid/Explosion/Ship extends Entity).
// Додаткова поведінка (homing, pickup) — це КОМПОНЕНТИ-поля, а не нові підкласи (див. components.js).
export class Entity {
  static #nextId = 1
  #id = Entity.#nextId++

  constructor({ kind, x = 0, y = 0, vx = 0, vy = 0, angle = 0, radius = 10, ttl = Infinity }) {
    // усі поля — в конструкторі, в одному порядку: одна «форма» об’єкта для всіх сутностей (Lab 7)
    this.kind = kind
    this.pos = new Vector2(x, y)
    this.vel = new Vector2(vx, vy)
    this.angle = angle
    this.radius = radius
    this.ttl = ttl // секунд до самознищення; Infinity — живе вічно
    this.alive = true // false → World прибере наприкінці кроку
    this.solid = true // бере участь у колізіях
    this.wraps = true // загортається по краях арени
    // компоненти (композиція): null, якщо поведінки немає
    this.homing = null
    this.pickup = null
    // стан попереднього кроку — для інтерполяції в рендері
    this.prevX = x
    this.prevY = y
    this.prevAngle = angle
  }

  get id() {
    return this.#id
  }

  savePrev() {
    this.prevX = this.pos.x
    this.prevY = this.pos.y
    this.prevAngle = this.angle
  }

  update(dt) {
    this.pos.addScaledInPlace(this.vel, dt)
    if (this.ttl !== Infinity) {
      this.ttl -= dt
      if (this.ttl <= 0) this.alive = false
    }
  }
}

export class Bullet extends Entity {
  static SPEED = 620
  static DAMAGE = 25

  constructor({ x, y, vx, vy, ownerId }) {
    super({ kind: 'bullet', x, y, vx, vy, radius: 3, ttl: 1.1 })
    this.ownerId = ownerId
    this.damage = Bullet.DAMAGE
  }
}

export class Asteroid extends Entity {
  constructor({ x, y, rng }) {
    const speed = range(rng, 20, 70)
    const dir = range(rng, 0, Math.PI * 2)
    super({
      kind: 'asteroid',
      x,
      y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      angle: dir,
      radius: range(rng, 20, 38),
    })
    this.spin = range(rng, -1, 1)
    this.shapeSeed = Math.floor(rng() * 1e9) // форма «каменя» для рендеру
  }

  update(dt) {
    super.update(dt)
    this.angle += this.spin * dt
  }
}

// Вибух: багато короткоживучих частинок (саме вони стануть «гарячою точкою» GC у Lab 7).
export class Explosion extends Entity {
  constructor({ x, y, rng, count = 18 }) {
    super({ kind: 'explosion', x, y, ttl: 0.8 })
    this.solid = false
    this.wraps = false
    this.particles = Array.from({ length: count }, () => {
      const a = range(rng, 0, Math.PI * 2)
      const s = range(rng, 40, 220)
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s }
    })
  }

  update(dt) {
    super.update(dt)
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
  }
}
