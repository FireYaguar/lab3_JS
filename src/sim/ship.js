import { homing } from './components.js'
import { Bullet, Entity } from './entity.js'

// Корабель з Lab 1 тепер — Ship extends Entity (рівно один рівень).
// Фізика та сама: поворот, газ уздовж носа, тертя, обмеження швидкості. Рух (pos += vel·dt) — у Entity.update.

export const SHIP = {
  turnRate: 3.6, // рад/с
  thrust: 320, // px/с²
  drag: 0.55, // частка швидкості, що губиться за секунду
  maxSpeed: 420, // px/с
  radius: 14,
  maxHp: 100,
  cooldown: 0.25, // с між пострілами
  rapidCooldown: 0.08,
  respawnDelay: 2,
}

export class Ship extends Entity {
  #hp = SHIP.maxHp

  constructor({ x = 0, y = 0, angle = -Math.PI / 2, name = 'ship' } = {}) {
    super({ kind: 'ship', x, y, angle, radius: SHIP.radius })
    this.name = name
    this.thrust = false
    this.score = 0
    this.cooldown = 0
    this.respawnIn = 0 // > 0 — корабель знищено, чекає респауну
    // таймери ефектів від pickup (секунди)
    this.shield = 0
    this.rapid = 0
    this.homingShots = 0
  }

  get hp() {
    return this.#hp
  }

  // command: { thrust: boolean, turn: -1 | 0 | 1, fire: boolean } — та сама форма, що піде по мережі в Lab 5
  control(command, dt) {
    if (!this.solid) return
    this.angle += command.turn * SHIP.turnRate * dt
    this.thrust = command.thrust
    if (command.thrust) {
      this.vel.x += Math.cos(this.angle) * SHIP.thrust * dt
      this.vel.y += Math.sin(this.angle) * SHIP.thrust * dt
    }
    this.vel.scaleInPlace(1 - SHIP.drag * dt)
    const speed = this.vel.length()
    if (speed > SHIP.maxSpeed) this.vel.scaleInPlace(SHIP.maxSpeed / speed)
  }

  // Повертає нову кулю або null (кулдаун / корабель знищено). Спавнить її World.
  // Метод використовує this — тому його не можна передавати «голим» у addEventListener (див. README).
  fire() {
    if (!this.solid || this.cooldown > 0) return null
    this.cooldown = this.rapid > 0 ? SHIP.rapidCooldown : SHIP.cooldown
    const dirX = Math.cos(this.angle)
    const dirY = Math.sin(this.angle)
    const bullet = new Bullet({
      x: this.pos.x + dirX * (this.radius + 4), // з носа
      y: this.pos.y + dirY * (this.radius + 4),
      vx: this.vel.x + dirX * Bullet.SPEED, // успадкована швидкість корабля
      vy: this.vel.y + dirY * Bullet.SPEED,
      ownerId: this.id,
    })
    if (this.homingShots > 0) {
      bullet.homing = homing({ targets: ['asteroid', 'ship'], turnRate: 4, range: 380 })
    }
    return bullet
  }

  // true — корабель знищено цим ударом
  takeDamage(amount) {
    if (!this.solid || this.shield > 0) return false
    this.#hp = Math.max(0, this.#hp - amount)
    if (this.#hp > 0) return false
    this.solid = false
    this.thrust = false
    this.respawnIn = SHIP.respawnDelay
    return true
  }

  respawn(x, y) {
    this.#hp = SHIP.maxHp
    this.solid = true
    this.respawnIn = 0
    this.pos.set(x, y)
    this.vel.set(0, 0)
    this.angle = -Math.PI / 2
    this.shield = 1.5 // коротка невразливість після появи
    this.savePrev() // не інтерполювати з місця загибелі
  }

  update(dt) {
    if (!this.solid) return
    super.update(dt)
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.shield = Math.max(0, this.shield - dt)
    this.rapid = Math.max(0, this.rapid - dt)
    this.homingShots = Math.max(0, this.homingShots - dt)
  }
}
