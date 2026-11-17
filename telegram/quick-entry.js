// Telegram-only main menu. Reuse the existing game actions and keep web unchanged.
(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  document.documentElement.classList.add('trynka-telegram');
  const authInfo = document.createElement('div');
  authInfo.id='tg-auth-status';
  authInfo.style.cssText='position:fixed;z-index:999999;bottom:12px;left:12px;right:12px;padding:12px;border-radius:12px;background:#143b2f;color:#f6e8c6;font:13px system-ui;text-align:center;box-shadow:0 5px 25px #0008';
  authInfo.textContent=tg.initData?'Telegram: перевіряємо вхід…':'Telegram не передав дані входу. Відкрий гру кнопкою «Грати» всередині бота.';
  document.addEventListener('DOMContentLoaded',()=>{if(document.getElementById('login')&&!document.getElementById('login').classList.contains('hide'))document.body.appendChild(authInfo);});
  window.addEventListener('trynka:telegram-auth-error',e=>{authInfo.textContent='Вхід Telegram: '+(e.detail||'помилка авторизації');document.body.appendChild(authInfo);});
  window.addEventListener('trynka:telegram-auth-ok',()=>authInfo.remove());
  window.addEventListener('error',e=>{if(authInfo.isConnected)authInfo.textContent='Помилка JavaScript: '+String(e.message||'невідома').slice(0,100);});
  window.addEventListener('unhandledrejection',e=>{if(authInfo.isConnected)authInfo.textContent='Помилка запуску: '+String(e.reason?.message||e.reason||'невідома').slice(0,100);});
  setTimeout(()=>{if(authInfo.isConnected&&authInfo.textContent.includes('перевіряємо'))authInfo.textContent='Вхід не завершився. Перевірка запуску гри не пройшла.';},9000);
  try { tg.ready(); tg.expand(); } catch {}
  const css = document.createElement('style');
  css.textContent = `
    .trynka-telegram body:has(#lobby:not(.hide)) { background:#07120f!important; }
    .trynka-telegram body:has(#lobby:not(.hide)) > header { display:none!important; }
    .trynka-telegram #lobby:not(.hide) > .lobbyShell { display:none!important; }
    .trynka-telegram #installAppBtn { display:none!important; }
    .trynka-telegram #lobby { min-height:100dvh; padding:0!important; margin:0!important; }
    .trynka-telegram .tg-menu { min-height:100dvh; box-sizing:border-box; color:#f6efd9; padding: max(26px,env(safe-area-inset-top)) 20px max(30px,env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 50% 12%,#1e4b36 0%,#0d241b 44%,#07120f 100%); font-family:system-ui,-apple-system,sans-serif; }
    .trynka-telegram .tg-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .trynka-telegram .tg-brand { font-weight:900; letter-spacing:3px; font-size:23px; color:#f5d67c; }
    .trynka-telegram .tg-brand small { display:block; color:#a5b8a7; letter-spacing:2px; font-size:9px; margin-top:2px; }
    .trynka-telegram .tg-avatar { border:1px solid #cba75b70; background:#163c2b; border-radius:50%; height:43px; width:43px; color:#f7d88a; font-size:20px; }
    .trynka-telegram .tg-hero { text-align:center; padding:42px 0 28px; }
    .trynka-telegram .tg-suits { font-size:49px; letter-spacing:10px; color:#e6c36e; text-shadow:0 8px 28px #e7ba5266; }
    .trynka-telegram .tg-hero h1 { margin:17px 0 7px; font-size:34px; font-weight:900; letter-spacing:2px; color:#fff5d8; }
    .trynka-telegram .tg-hero p { color:#a9b9ac; margin:0; font-size:14px; }
    .trynka-telegram .tg-menu button { cursor:pointer; }
    .trynka-telegram .tg-play { display:block; width:100%; border:0; border-radius:18px; background:linear-gradient(130deg,#f7df92,#c79537); color:#221b0c; font-size:21px; font-weight:900; padding:21px 14px; box-shadow:0 10px 30px #c99a3b35; }
    .trynka-telegram .tg-play span { display:block; font-size:11px; font-weight:600; margin-top:5px; letter-spacing:1px; }
    .trynka-telegram .tg-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; }
    .trynka-telegram .tg-action { border:1px solid #bfa56a45; border-radius:17px; background:linear-gradient(145deg,#1a3b2b,#10261d); color:#f6eacb; padding:21px 8px; min-height:113px; font-size:15px; font-weight:750; }
    .trynka-telegram .tg-action span { display:block; font-size:29px; margin-bottom:9px; }
    .trynka-telegram .tg-footer { text-align:center; margin-top:31px; font-size:11px; color:#7d9989; letter-spacing:1px; }
    .trynka-telegram .tg-menu button:active { transform:scale(.98); }
    @media(min-width:600px){.trynka-telegram .tg-menu{max-width:560px;margin:auto}.trynka-telegram .tg-hero{padding-top:65px}}
  `;
  document.head.appendChild(css);
  const setup = () => {
    const lobby = document.getElementById('lobby');
    if (!lobby || document.getElementById('tg-main-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'tg-main-menu';
    menu.className = 'tg-menu';
    menu.innerHTML = `
      <div class="tg-top"><div class="tg-brand">♠ TRYNKA<small>TELEGRAM CARD CLUB</small></div><button class="tg-avatar" data-go="homeCabinet" aria-label="Профіль">♛</button></div>
      <div class="tg-hero"><div class="tg-suits">♠ ♥ ♣</div><h1>Тринька</h1><p>Твоя гра. Твій стіл. Твоя перемога.</p></div>
      <button class="tg-play" data-go="quickPlay">▶ ГРАТИ ЗАРАЗ<span>Швидкий пошук столу</span></button>
      <div class="tg-actions">
        <button class="tg-action" data-go="newRoom"><span>＋</span>Створити стіл</button>
        <button class="tg-action" data-go="browseTables"><span>♠</span>Знайти стіл</button>
        <button class="tg-action" data-go="homeFriends"><span>♧</span>Друзі</button>
        <button class="tg-action" data-go="homeCabinet"><span>♛</span>Профіль</button>
      </div><div class="tg-footer">TRYNKA ONLINE · УКРАЇНСЬКА КАРТКОВА ГРА</div>`;
    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-go]');
      if (!button) return;
      const original = document.getElementById(button.dataset.go);
      if (original) original.click();
    });
    lobby.prepend(menu);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
