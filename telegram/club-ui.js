// Telegram-only lobby, shared chat and administrator dashboard.
// Runs after standalone.html's inline controller; uses its verified API helper.
(() => {
  const home = document.getElementById('home');
  const detail = document.getElementById('detail');
  const panel = document.getElementById('table-list');
  const back = document.getElementById('back');
  const status = document.getElementById('status');
  if (!home || !detail || !panel || typeof apiPost !== 'function') return;

  let chatOpen = false, chatBusy = false, chatRequest = false, isModerator = false;
  let signature = '', chatLog, chatHint, chatError, chatInput, sendButton;
  const showError = text => { if(chatError) chatError.textContent = text || ''; };

  const play = document.createElement('button');
  play.className = 'club-play';
  play.type = 'button';
  play.innerHTML = '⚡ ГРАТИ ЗАРАЗ <small>ШВИДКИЙ ПОШУК СТОЛУ</small>';
  play.onclick = async () => {
    if (play.disabled) return;
    if (typeof window.trynkaQuickJoin !== 'function') {
      status.textContent = 'Не вдалося запустити швидкий вхід';
      return;
    }
    play.disabled = true;
    play.innerHTML = '⌛ ШУКАЄМО СТІЛ <small>ПЕРЕВІРЯЄМО ВІЛЬНІ МІСЦЯ</small>';
    try { await window.trynkaQuickJoin(); }
    catch (e) { status.textContent = 'Швидкий вхід: ' + (e.message || 'помилка'); }
    finally {
      play.disabled = false;
      play.innerHTML = '⚡ ГРАТИ ЗАРАЗ <small>ШВИДКИЙ ПОШУК СТОЛУ</small>';
    }
  };
  home.insertBefore(play, home.querySelector('.grid'));

  function entry(icon, title, hint, extraClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'club-chat-entry' + (extraClass ? ' ' + extraClass : '');
    const emoji = document.createElement('span'); emoji.textContent = icon; emoji.style.fontSize = '29px';
    const label = document.createElement('span'); label.className = 'club-chat-label'; label.textContent = title;
    const note = document.createElement('span'); note.className = 'club-chat-desc'; note.textContent = hint;
    label.append(note);
    const arrow = document.createElement('span'); arrow.textContent = '❯'; arrow.style.color = '#ffe0a0';
    b.append(emoji, label, arrow);
    return b;
  }
  const chatButton = entry('💬', 'СПІЛЬНИЙ ЧАТ', 'Спілкуйся з усіма гравцями');
  chatButton.onclick = openChat;
  home.insertBefore(chatButton, home.querySelector('#referral-open'));
  const adminButton = entry('👑', 'АДМІН-ПАНЕЛЬ', 'Гравці · фішки · модерація', 'club-admin-entry');
  adminButton.hidden = true;
  adminButton.onclick = () => window.openPage?.('profile');
  home.insertBefore(adminButton, home.querySelector('#referral-open'));
  window.clubRoleChanged = function(admin) { adminButton.hidden = !admin; };
  if (typeof isAdmin !== 'undefined') window.clubRoleChanged(isAdmin);

  function actionButton(text, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.onclick = fn; return b;
  }
  function renderMessage(row, canModerate) {
    const bubble = document.createElement('article');
    bubble.className = 'club-chat-message' + (row.mine ? ' mine' : '') + (row.admin ? ' moderator' : '');
    const by = document.createElement('div'); by.className = 'by';
    by.textContent = (row.admin ? '👑 ' : '') + row.name + (row.mine ? ' · Ви' : '');
    const body = document.createElement('div'); body.className = 'body'; body.textContent = row.text;
    const clock = document.createElement('div'); clock.className = 'time';
    const t = new Date(row.at);
    clock.textContent = Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('uk-UA', { hour:'2-digit', minute:'2-digit' });
    bubble.append(by, body, clock);
    if (canModerate) {
      const more = actionButton('⋯ Модерація', () => {
        tools.hidden = !tools.hidden;
      });
      more.style.cssText = 'border:0;background:none;color:#ffe0a0;font-size:11px;padding:6px 0';
      const tools = document.createElement('div'); tools.className = 'club-chat-tools'; tools.hidden = true;
      more.setAttribute('aria-label', 'Модерація повідомлення');
      tools.append(actionButton('🗑 Видалити', () => moderate({ action:'delete', messageId: row.id })));
      if (row.senderId && !row.admin) {
        tools.append(actionButton('🔇 10 хв', () => moderate({ action:'mute', targetId: row.senderId, seconds: 600 })));
        tools.append(actionButton('🔇 1 год', () => moderate({ action:'mute', targetId: row.senderId, seconds: 3600 })));
        tools.append(actionButton('🔇 1 день', () => moderate({ action:'mute', targetId: row.senderId, seconds: 86400 })));
        tools.append(actionButton('🔊 Розмутити', () => moderate({ action:'unmute', targetId: row.senderId })));
      }
      bubble.append(more, tools);
    }
    return bubble;
  }
  async function moderate(data) {
    if (!isModerator) return;
    if (data.action === 'delete' && !window.confirm('Приховати це повідомлення для всіх?')) return;
    try {
      await apiPost('/api/chat', data);
      showError('✓ Зміну застосовано');
      signature = '';
      await refreshChat();
    } catch(e) { showError(e.message || 'Помилка модерації'); }
  }
  function renderChat(data) {
    if (!chatOpen) return;
    const muted = data.mutedUntil && Date.parse(data.mutedUntil) > Date.now();
    isModerator = Boolean(data.moderator);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const nextSignature = messages.map(m => m.id).join(',');
    if (signature !== nextSignature) {
      const stickToBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 70;
      const first = signature === '';
      chatLog.replaceChildren();
      if (!messages.length) {
        const empty = document.createElement('p'); empty.className = 'club-chat-info';
        empty.textContent = 'Поки немає повідомлень. Напиши першим!';
        chatLog.append(empty);
      } else {
        for (const msg of messages) chatLog.append(renderMessage(msg, isModerator));
      }
      signature = nextSignature;
      if (stickToBottom || first) chatLog.scrollTop = chatLog.scrollHeight;
    }
    chatHint.textContent = muted
      ? '🔇 Ви не можете писати до ' + new Date(data.mutedUntil).toLocaleString('uk-UA')
      : isModerator ? '👑 Ви адміністратор. Натисни «Модерація» біля повідомлення, щоб керувати чатом.' : '🌍 Повідомлення бачать усі гравці Триньки. Без образ і спаму.';
    chatInput.disabled = Boolean(muted);
    sendButton.disabled = Boolean(muted) || chatBusy;
  }
  async function refreshChat() {
    if (!chatOpen || chatRequest) return;
    chatRequest = true;
    try {
      const data = await apiPost('/api/chat', { action:'list' });
      renderChat(data);
      if (chatError.textContent.includes('з’єднання')) showError('');
    } catch(e) { showError('Помилка з’єднання з чатом: ' + (e.message || 'невідомо')); }
    finally { chatRequest = false; }
  }
  async function sendMessage(ev) {
    ev.preventDefault();
    if (chatBusy || !chatInput.value.trim()) return;
    chatBusy = true; sendButton.disabled = true;
    const text = chatInput.value.trim();
    try {
      await apiPost('/api/chat', { action:'send', text });
      chatInput.value = '';
      showError('');
      signature = '';
      await refreshChat();
    } catch(e) { showError(e.message || 'Повідомлення не відправлено'); }
    finally { chatBusy = false; if (chatOpen) sendButton.disabled = chatInput.disabled; }
  }
  function openChat() {
    chatOpen = true; signature = ''; isModerator = false;
    home.hidden = true; detail.hidden = false;
    document.getElementById('heading').textContent = '💬 Спільний чат';
    document.getElementById('description').textContent = 'Єдиний чат для всіх гравців Telegram-версії';
    panel.replaceChildren();
    const root = document.createElement('div'); root.className = 'club-chat-panel';
    chatHint = document.createElement('div'); chatHint.className = 'club-chat-info'; chatHint.textContent = 'Підключаємо чат…';
    chatLog = document.createElement('div'); chatLog.className = 'club-chat-log'; chatLog.setAttribute('aria-label', 'Спільні повідомлення');
    const form = document.createElement('form'); form.className = 'club-chat-compose'; form.onsubmit = sendMessage;
    chatInput = document.createElement('textarea');
    chatInput.maxLength = 300; chatInput.rows = 2;
    chatInput.placeholder = 'Твоє повідомлення…';
    chatInput.setAttribute('aria-label', 'Написати в чат');
    sendButton = document.createElement('button'); sendButton.type='submit'; sendButton.textContent='Надіслати';
    form.append(chatInput, sendButton);
    chatError = document.createElement('div'); chatError.className='club-chat-error'; chatError.setAttribute('aria-live','polite');
    root.append(chatHint, chatLog, form, chatError); panel.append(root);
    refreshChat();
  }
  back.addEventListener('click', () => { chatOpen = false; signature = ''; }, {capture:true});
  document.getElementById('avatar')?.addEventListener('click', () => { chatOpen = false; signature = ''; }, {capture:true});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshChat(); });
  window.setInterval(() => { if (chatOpen && !document.hidden) refreshChat(); }, 4500);

  window.trynkaAdminEnhance = async function() {
    const list = document.getElementById('table-list');
    const overview = document.createElement('div');
    overview.className='club-admin-loading'; overview.textContent='Завантажуємо статистику клубу…';
    list.prepend(overview);
    const chatLink = actionButton('💬 Відкрити чат для модерації', openChat);
    chatLink.className='admin-button';
    list.append(chatLink);
    try {
      const d = await apiPost('/api/admin', { action:'stats' });
      if (!overview.isConnected) return;
      overview.className = '';
      overview.replaceChildren();
      const grid = document.createElement('div'); grid.className = 'club-admin-statgrid';
      for (const [value, label] of [[d.playersTotal, 'Telegram гравців'], [d.onlineNow, 'За столами'], [d.tablesActive, 'Активних столів']]) {
        const item = document.createElement('div'); item.className='club-admin-stat';
        const num=document.createElement('strong');num.textContent=Number(value||0).toLocaleString('uk-UA');
        const sub=document.createElement('small');sub.textContent=label;item.append(num,sub);grid.append(item);
      }
      overview.append(grid);
      const recent=document.createElement('section');recent.className='club-admin-recent';
      const h=document.createElement('h3');h.textContent='👥 Останні зареєстровані гравці';recent.append(h);
      const people=Array.isArray(d.recentPlayers)?d.recentPlayers:[];
      if (!people.length) {const p=document.createElement('p');p.className='note';p.textContent='Поки немає Telegram-профілів';recent.append(p);}
      for (const p of people) {
        const row=actionButton('',()=> {
          const field=document.getElementById('admin-target');
          if (field){field.value=String(p.telegramId);field.scrollIntoView({behavior:'smooth',block:'center'});}
        });
        row.className='club-admin-player';
        const title=document.createElement('span');title.textContent=p.name || 'Гравець';
        const side=document.createElement('small');side.textContent='ID '+p.telegramId+' · '+Number(p.chips||0).toLocaleString('uk-UA')+' ◉';
        row.append(title,side);recent.append(row);
      }
      overview.append(recent);
    } catch(e) {overview.textContent='Не вдалося завантажити статистику: '+(e.message||'помилка');}
  };
})();
