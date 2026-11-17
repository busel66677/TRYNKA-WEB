// Telegram-specific presentation: keep the lobby as the main menu.
// Existing website remains untouched; Telegram authentication is a separate task.
(() => {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) return;
  document.documentElement.classList.add('trynka-telegram');
  const style = document.createElement('style');
  style.textContent = `
    .trynka-telegram #installAppBtn { display: none !important; }
    .trynka-telegram #lobby .welcomeBar { padding-top: 12px; }
    .trynka-telegram #lobby .menuTiles { display: grid !important; }
    .trynka-telegram #lobby .mainPlayCard { display: flex !important; }
  `;
  document.head.appendChild(style);
  try { webApp.ready(); webApp.expand(); } catch {}
})();
