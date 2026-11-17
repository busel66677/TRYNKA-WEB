// Telegram-only shortcut. Existing website navigation remains unchanged.
// This is NOT Telegram authentication: existing Supabase login is still required.
(() => {
  const webApp=window.Telegram?.WebApp;
  if (!webApp?.initData) return;
  document.documentElement.classList.add('trynka-telegram');
  const style=document.createElement('style');
  style.textContent='.trynka-telegram header,.trynka-telegram #installAppBtn{display:none!important}.trynka-telegram #lobby .welcomeBar,.trynka-telegram #lobby .menuTiles,.trynka-telegram #lobby .homeStats,.trynka-telegram #lobby .mainPlayCard{display:none!important}';
  document.head.appendChild(style);
  let started=false;
  const check=()=>{
    if(started)return;
    const game=document.getElementById('game');
    const lobby=document.getElementById('lobby');
    if(game&&!game.classList.contains('hide')){started=true;return;}
    if(lobby&&!lobby.classList.contains('hide')){
      const quick=document.getElementById('quickPlay');
      if(quick){started=true;quick.click();}
    }
  };
  const observer=new MutationObserver(check);
  observer.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
  check();
  // Keep observing while the user logs in; stop after the first navigation.
  const stop=new MutationObserver(()=>{if(started){observer.disconnect();stop.disconnect();}});
  stop.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
})();
