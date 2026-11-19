// Telegram-specific test multiplayer UI, isolated from the original website.
(() => {
  const tg = window.Telegram?.WebApp;
  const style = document.createElement('style');
  style.textContent = `
  .tg-round{margin:14px 8px 18px;padding:14px;background:#0d281d;border:1px solid #c9a45c80;border-radius:17px;color:#fff0c6}
  .tg-round-head{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#edd28c}
  .tg-round-title{font-size:17px;font-weight:900;margin:8px 0}
  .tg-round-line{font-size:12px;color:#b9d4c2;margin:9px 0}
  .tg-hand{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}
  .tg-card{min-width:46px;height:65px;border-radius:8px;background:#f8f4e8;color:#15251e;display:flex;flex-direction:column;justify-content:space-between;padding:6px;font-size:18px;font-weight:900;box-shadow:0 3px 8px #0006}
  .tg-card.red{color:#bd332f}.tg-card.back{background:linear-gradient(145deg,#245f48,#153728);border:2px solid #e4c077;color:#d9b971}
  .tg-player-row{padding:5px 0;border-bottom:1px solid #ffffff1a;font-size:12px;display:flex;justify-content:space-between;gap:6px}
  .tg-round-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
  .tg-round-buttons button{flex:1;padding:12px 7px;border-radius:10px;background:#e9c77d;color:#1b231b;border:0;font-weight:850;font-size:13px;min-width:70px}
  .tg-round-buttons button.danger{background:#774239;color:#ffe3d8}
  .tg-round-buttons button:disabled{opacity:.5}
  `;
  document.head.append(style);
  let busy = false;
  let requestedTable = null;
  let errorMessage = '';

  function addCard(parent, card) {
    const item = document.createElement('div');
    item.className = 'tg-card' + (card && ['♥','♦'].includes(card.suit) ? ' red' : '') + (!card ? ' back' : '');
    item.textContent = card ? card.rank + card.suit : '♠';
    parent.append(item);
  }
  function panelFor(table) {
    const room = document.querySelector('#detail:not([hidden]) .room');
    if (!room) return null;
    let panel = room.querySelector('.tg-round');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'tg-round';
      panel.setAttribute('aria-live', 'polite');
      room.insertBefore(panel, room.querySelector('.leave-btn'));
    }
    return panel;
  }
  function makeButton(parent, text, action, table, danger = false, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (danger) b.classList.add('danger');
    b.disabled = busy || disabled;
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      b.disabled = true;
      try {
        const state = await apiPost('/api/game', { action, table });
        errorMessage = '';
        render(table, state);
      } catch (e) { errorMessage = e.message || 'Помилка дії'; }
      finally { busy = false; refresh(); }
    };
    parent.append(b);
  }
  function render(table, data) {
    const panel = panelFor(table);
    if (!panel) return;
    panel.replaceChildren();
    const header = document.createElement('div');
    header.className = 'tg-round-head';
    const h1 = document.createElement('span'); h1.textContent = '♠ ЖИВА РОЗДАЧА';
    const h2 = document.createElement('span'); h2.textContent = data.status === 'playing' ? 'Банк: ' + data.pot + ' тестових фішок' : '2–4 гравці';
    header.append(h1, h2); panel.append(header);
    const title = document.createElement('div'); title.className = 'tg-round-title';
    const controls = document.createElement('div'); controls.className = 'tg-round-buttons';
    const line = document.createElement('div'); line.className = 'tg-round-line';
    if (errorMessage) {
      const err = document.createElement('div'); err.className = 'tg-round-line'; err.style.color = '#ffaaa0'; err.textContent = errorMessage; panel.append(err);
    }
    if (data.status === 'waiting') {
      title.textContent = 'Очікуємо гравців'; panel.append(title);
      line.textContent = 'За столом: ' + data.seated + '. Перші 4 гравці можуть зіграти тестову роздачу. Для початку потрібно хоча б двоє.';
      panel.append(line);
      makeButton(controls, '🃏 Роздати карти', 'start', table, false, data.seated < 2);
      panel.append(controls);
      return;
    }
    if (data.status === 'playing') {
      title.textContent = data.myTurn ? 'Ваш хід!' : 'Хід гравця на місці №' + data.turnSeat;
      panel.append(title);
      const seconds = Math.max(0, Math.ceil((data.turnEndsAt - Date.now()) / 1000));
      line.textContent = 'До завершення ходу: ' + seconds + ' с · ставка: ' + data.stake + ' тестових фішок';
      panel.append(line);
    } else {
      title.textContent = data.winners?.length ? '🏆 Переможець — місце №' + data.winners.join(', №') : 'Роздачу завершено';
      panel.append(title);
      line.textContent = data.reason || 'Партія закінчилась';
      panel.append(line);
    }
    for (const p of data.players || []) {
      const row = document.createElement('div'); row.className = 'tg-player-row';
      const name = document.createElement('span'); name.textContent = (p.winner ? '🏆 ' : '') + p.name + ' · №' + p.seat;
      const status = document.createElement('span'); status.textContent = p.folded ? 'Впав' : p.result || (data.status === 'playing' && p.seat === data.turnSeat ? 'Ходить' : p.acted ? 'Дав' : 'Чекає');
      row.append(name, status); panel.append(row);
      if (p.cards) {
        const hand = document.createElement('div'); hand.className = 'tg-hand';
        p.cards.forEach(card => addCard(hand, card)); panel.append(hand);
      }
    }
    if (data.status === 'playing' && data.myTurn) {
      makeButton(controls, 'ДАВ', 'call', table);
      makeButton(controls, 'ВПАВ', 'fold', table, true);
      makeButton(controls, 'ВСКРИВСЯ', 'reveal', table);
      panel.append(controls);
    } else if (data.status === 'finished') {
      const left = Math.max(0, Math.ceil((data.nextRoundAt - Date.now()) / 1000));
      makeButton(controls, left ? 'Наступна через ' + left + ' с' : '🃏 Нова роздача', 'start', table, false, left > 0);
      panel.append(controls);
    }
    const note = document.createElement('div'); note.className = 'tg-round-line';
    note.textContent = 'Тестовий режим: банк не списується й не зараховується на баланс.';
    panel.append(note);
  }
  async function refresh() {
    const table = window.trynkaTelegramGameBridge?.()?.table;
    if (!table || !tg?.initData || busy) { requestedTable = null; return; }
    if (requestedTable === table) return;
    requestedTable = table;
    try {
      const data = await apiPost('/api/game', { action:'state', table });
      if (window.trynkaTelegramGameBridge?.()?.table === table) render(table, data);
      errorMessage = '';
    } catch(e) {
      errorMessage = e.message || 'Не вдалося отримати стан гри';
      const panel = panelFor(table);
      if (panel) { panel.textContent = errorMessage; }
    } finally { requestedTable = null; }
  }
  setInterval(refresh, 2000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();
