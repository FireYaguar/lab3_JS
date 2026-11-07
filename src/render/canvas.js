// Canvas з урахуванням devicePixelRatio: буфер у фізичних пікселях, малюємо в CSS-пікселях.

export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d')
  const view = { width: 0, height: 0, dpr: 1 }

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    view.width = width
    view.height = height
    view.dpr = dpr
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 1 одиниця = 1 CSS-піксель
  }

  resize()
  window.addEventListener('resize', resize)
  return { ctx, view }
}
