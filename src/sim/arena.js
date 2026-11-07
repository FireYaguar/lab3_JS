// Арена фіксованого розміру у «світових» пікселях — не залежить від розміру вікна.
// Двоє гравців з різними моніторами (Lab 5) мають жити в одному світі.

export function createArena(width = 1600, height = 900) {
  return { width, height }
}

function wrapValue(v, size) {
  return ((v % size) + size) % size
}

// «Загортання» країв: вилетів праворуч — з’явився ліворуч.
export function wrap(entity, arena) {
  entity.x = wrapValue(entity.x, arena.width)
  entity.y = wrapValue(entity.y, arena.height)
  return entity
}

// lerp з урахуванням загортання: якщо між станами стрибок через край,
// не тягнемо корабель через усю арену, а малюємо поточну позицію.
export function lerpWrapped(a, b, t, size) {
  if (Math.abs(b - a) > size / 2) return b
  return a + (b - a) * t
}
