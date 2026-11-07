// Клавіатура як замикання: стан клавіш приватний, назовні — лише функції.

export function createInput(target = window) {
  const down = new Set()
  const pressed = new Set() // натиснуті з моменту останнього consume()

  function onKeyDown(e) {
    if (e.repeat) return // ОС шле повторні keydown, поки клавіша затиснута
    down.add(e.code)
    pressed.add(e.code)
  }
  function onKeyUp(e) {
    down.delete(e.code)
  }
  function onBlur() {
    // вікно втратило фокус — keyup може не прийти, інакше корабель «залипне» з газом
    down.clear()
    pressed.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    // викликати після кожного кроку симуляції, щоб «щойно натиснуто» спрацювало рівно один раз
    consume: () => pressed.clear(),
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
    },
  }
}

// Клавіші → команда для симуляції. Сим бачить лише { thrust, turn, fire },
// не знає про клавіатуру (у Lab 5 ця сама команда полетить на сервер).
export function readControls(input) {
  const left = input.isDown('ArrowLeft') || input.isDown('KeyA')
  const right = input.isDown('ArrowRight') || input.isDown('KeyD')
  return {
    thrust: input.isDown('ArrowUp') || input.isDown('KeyW'),
    turn: (right ? 1 : 0) - (left ? 1 : 0),
    fire: input.isDown('Space'), // затиснув — стріляє з кулдауном (Ship.fire)
  }
}
