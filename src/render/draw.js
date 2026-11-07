import { lerpWrapped } from '../sim/arena.js'
import { mulberry32 } from '../sim/random.js'

export function lerp(a, b, t) {
  return a + (b - a) * t
}

// Кут коротким шляхом по колу: між 359° і 1° — 2°, а не 358° навпаки.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

let stars = null
function getStars(arena) {
  if (stars) return stars
  const rnd = mulberry32(42)
  stars = Array.from({ length: 220 }, () => ({
    x: rnd() * arena.width,
    y: rnd() * arena.height,
    r: rnd() * 1.4 + 0.3,
    a: rnd() * 0.6 + 0.3,
  }))
  return stars
}

// Масштаб «світ → екран»: арена вписується у вікно, по центру.
export function fitArena(view, arena) {
  const scale = Math.min(view.width / arena.width, view.height / arena.height)
  return {
    scale,
    offsetX: (view.width - arena.width * scale) / 2,
    offsetY: (view.height - arena.height * scale) / 2,
  }
}

function drawBackground(ctx, arena) {
  ctx.fillStyle = '#0a0d1a'
  ctx.fillRect(0, 0, arena.width, arena.height)

  ctx.strokeStyle = 'rgba(90, 120, 200, 0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= arena.width; x += 100) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, arena.height)
  }
  for (let y = 0; y <= arena.height; y += 100) {
    ctx.moveTo(0, y)
    ctx.lineTo(arena.width, y)
  }
  ctx.stroke()

  for (const s of getStars(arena)) {
    ctx.globalAlpha = s.a
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.strokeStyle = 'rgba(120, 160, 255, 0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, arena.width, arena.height)
}

// Спрайт з атласу: кадр центрується в (x, y), повертається на angle; k — додатковий масштаб.
// atlas.scale — світових одиниць на піксель спрайта (спрайти намальовані 2×, для retina).
export function drawSprite(ctx, sprites, name, x, y, angle = 0, k = 1) {
  const f = sprites.atlas.frames[name]
  const w = f.w * sprites.atlas.scale * k
  const h = f.h * sprites.atlas.scale * k
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(sprites.image, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h)
  ctx.restore()
}

function drawShip(ctx, sprites, x, y, angle, ship, frame) {
  if (ship.thrust) {
    const flicker = 10 + Math.random() * 8 // косметика рендеру, у симуляцію не потрапляє
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = '#ffb347'
    ctx.beginPath()
    ctx.moveTo(-10, -5)
    ctx.lineTo(-10 - flicker, 0)
    ctx.lineTo(-10, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  drawSprite(ctx, sprites, frame, x, y, angle)
  if (ship.shield > 0) {
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, ship.radius + 8, 0, Math.PI * 2)
    ctx.stroke()
  }
  // смужка hp над кораблем
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(x - 18, y - 30, 36, 4)
  ctx.fillStyle = ship.hp > 30 ? '#6f6' : '#f55'
  ctx.fillRect(x - 18, y - 30, (36 * ship.hp) / 100, 4)
}

function drawAsteroid(ctx, sprites, x, y, angle, a) {
  const k = a.radius / (sprites.atlas.asteroidRadiusPx * sprites.atlas.scale)
  drawSprite(ctx, sprites, `asteroid_${a.shapeSeed % 3}`, x, y, angle, k)
  if (a.homing) {
    // «мисливець» з homing — червоне кільце
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, a.radius + 4, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawExplosion(ctx, e) {
  ctx.globalAlpha = Math.max(0, e.ttl / 0.8)
  ctx.fillStyle = '#ffae42'
  for (const p of e.particles) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
  ctx.globalAlpha = 1
}

export function drawWorld(ctx, view, world, alpha, playerId, sprites) {
  const { arena } = world
  ctx.fillStyle = '#05060c'
  ctx.fillRect(0, 0, view.width, view.height)

  const { scale, offsetX, offsetY } = fitArena(view, arena)
  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  ctx.beginPath()
  ctx.rect(0, 0, arena.width, arena.height)
  ctx.clip()
  drawBackground(ctx, arena)

  for (const e of world) {
    // інтерполяція між попереднім і поточним кроком
    const x = lerpWrapped(e.prevX, e.pos.x, alpha, arena.width)
    const y = lerpWrapped(e.prevY, e.pos.y, alpha, arena.height)
    const angle = lerpAngle(e.prevAngle, e.angle, alpha)
    switch (e.kind) {
      case 'ship':
        if (e.solid) {
          drawShip(ctx, sprites, x, y, angle, e, e.id === playerId ? 'ship_player' : 'ship_enemy')
        }
        break
      case 'asteroid':
        drawAsteroid(ctx, sprites, x, y, angle, e)
        break
      case 'bullet':
        drawSprite(ctx, sprites, e.homing ? 'bullet_homing' : 'bullet', x, y)
        break
      case 'pickup':
        drawSprite(
          ctx,
          sprites,
          `pickup_${e.pickup.effect}`,
          x,
          y,
          0,
          1 + Math.sin(world.time * 6) * 0.1,
        )
        break
      case 'explosion':
        drawExplosion(ctx, e)
        break
      default:
        break
    }
  }
  ctx.restore()
}

export function drawHud(ctx, stats, extra = []) {
  const lines = [
    `steps/s  ${stats.stepsPerSec.toFixed(1)}`,
    `frames/s ${stats.framesPerSec.toFixed(1)}`,
    `frame ms ${stats.frameMs.toFixed(2)}  (js ${stats.workMs.toFixed(2)})`,
    ...extra,
  ]
  ctx.font = '13px ui-monospace, Menlo, Consolas, monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(8, 8, 270, lines.length * 18 + 10)
  ctx.fillStyle = '#9fffb0'
  lines.forEach((line, i) => {
    ctx.fillText(line, 14, 14 + i * 18)
  })
}
