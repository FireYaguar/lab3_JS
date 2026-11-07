// DOM лобі. Лише слухає події Lobby і викликає його методи; даних сам не тягне.

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) // дані з мережі → не HTML

// Подія → проміс (одна подія, один раз): «дочекатися join».
function once(target, type, signal) {
  return new Promise((resolve) =>
    target.addEventListener(type, (e) => resolve(e.detail), { once: true, signal }),
  )
}

export function showLobby(root, lobby, notes = []) {
  const cleanup = new AbortController() // знімає всі слухачі разом
  const { signal } = cleanup
  root.innerHTML = `
    <div class="panel lobby">
      <h1>Spacefight</h1>
      <label>Ім’я пілота <input id="lobby-name" maxlength="16" value="pilot" /></label>
      <div class="rooms-head"><span>Кімнати</span><span id="lobby-status"></span></div>
      <ul id="lobby-rooms"></ul>
      <p id="lobby-error" class="error"></p>
      ${notes.map((n) => `<p class="warn">⚠ ${esc(n)}</p>`).join('')}
      <button id="lobby-join" type="button">Join</button>
    </div>`
  const $ = (id) => root.querySelector(id)
  let selected = null

  function renderRooms(rooms) {
    if (!rooms.some((r) => r.id === selected)) selected = rooms[0]?.id ?? null
    $('#lobby-rooms').innerHTML = rooms
      .map(
        (
          r,
        ) => `<li><label><input type="radio" name="room" value="${esc(r.id)}" ${r.id === selected ? 'checked' : ''} />
          <b>${esc(r.name)}</b> <span>${r.players}/${r.maxPlayers} · ${r.arena.width}×${r.arena.height} · астероїдів ${r.arena.asteroids}</span></label></li>`,
      )
      .join('')
  }

  lobby.addEventListener('loading', () => ($('#lobby-status').textContent = 'оновлення…'), {
    signal,
  })
  lobby.addEventListener(
    'rooms',
    (e) => {
      $('#lobby-status').textContent = `оновлено ${new Date().toLocaleTimeString()}`
      $('#lobby-error').textContent = ''
      renderRooms(e.detail)
    },
    { signal },
  )
  lobby.addEventListener(
    'error',
    (e) => {
      $('#lobby-status').textContent = 'помилка'
      $('#lobby-error').textContent =
        `Не вдалося оновити список (${e.detail.name}: ${e.detail.message}). Спробую ще раз автоматично.`
    },
    { signal },
  )
  $('#lobby-rooms').addEventListener('change', (e) => (selected = e.target.value), { signal })
  $('#lobby-join').addEventListener(
    'click',
    () => {
      try {
        lobby.join(selected, $('#lobby-name').value)
      } catch (err) {
        $('#lobby-error').textContent = err.message
      }
    },
    { signal },
  )

  const joined = once(lobby, 'join', signal).then((detail) => {
    cleanup.abort()
    root.innerHTML = ''
    return detail
  })
  lobby.enter()
  return joined
}
