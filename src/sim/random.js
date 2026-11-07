// Детермінований PRNG (mulberry32). У симуляції — лише він, ніколи Math.random():
// однаковий seed → однакова гра на клієнті й сервері (Lab 5).

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function range(rng, min, max) {
  return min + rng() * (max - min)
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)]
}
