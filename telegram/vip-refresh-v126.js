/* TRYNKA Telegram VIP v126: visible version flag and force-reload control.
   A room can be replaced by a presence update; reattach actions to the new room. */
(() => {
  'use strict';
  const build='v126';
  const $ = id => document.getElementById(id);
  const apply = () => {
    const head=document.querySelector('#detail:not([hidden]) .room-head');
    if(!head || !document.body.classList.contains('trynka-in-table'))return;
    if(!head.querySelector('.vip-version-pill')){
      const badge=document.createElement('span');
      badge.className='vip-version-pill';
      badge.textContent='♛ VIP '+build;
      badge.setAttribute('aria-label','VIP дизайн Триньки, версія 126');
      head.insertBefore(badge,head.querySelector('.tg-room-tools')||null);
    }
    const tools=head.querySelector('.tg-room-tools');
    if(!tools||tools.querySelector('.vip-refresh-btn'))return;
    const btn=document.createElement('button');
    btn.className='vip-refresh-btn';
    btn.type='button';
    btn.textContent='↻';
    btn.setAttribute('aria-label','Оновити дизайн столу');
    btn.title='Оновити VIP-стіл';
    btn.addEventListener('click',()=>{
      const table=Number(window.trynkaTelegramGameBridge?.()?.table||0);
      const next=new URL(window.location.href);
      next.searchParams.set('ui',build);
      next.searchParams.set('refresh',String(Date.now()));
      if(Number.isInteger(table)&&table>=1&&table<=9){
        next.searchParams.set('resume','table_'+table);
      }
      window.location.replace(next.toString());
    });
    tools.append(btn);
  };
  const init=()=>{
    const tables=$('table-list');
    if(!tables)return;
    new MutationObserver(apply).observe(tables,{childList:true});
    apply();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();