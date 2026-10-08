/* TRYNKA v102 — reference-table presentation; no database requests, no card data. */
(function(){
  'use strict';
  const game=()=>document.getElementById('game');
  let lastSnapshot=null;
  function paintBacks(){
    const g=game(),s=document.getElementById('seats');
    if(!g||!s)return;
    const state=lastSnapshot||window.TRYNKA_GAME_STATE;
    const playing=state?.round?.status==='playing';
    const activeMap=new Map((state?.round_players||[]).map(p=>[String(p.user_id),p]));
    for(const seat of s.querySelectorAll('.seat')){
      let backs=seat.querySelector(':scope > .seatBacks');
      const uid=seat.dataset.userId;
      const player=uid?activeMap.get(uid):null;
      const shouldShow=playing&&!!uid&&!seat.classList.contains('mine')&&
        !seat.classList.contains('showdownSeat')&&!seat.classList.contains('foldedSeat')&&
        (!player||!player.folded);
      if(!shouldShow){backs?.remove();continue}
      if(!backs){
        backs=document.createElement('div');
        backs.className='seatBacks';
        backs.setAttribute('aria-hidden','true');
        for(let n=0;n<3;n++)backs.appendChild(document.createElement('i'));
        seat.appendChild(backs);
      }
    }
  }
  function mountMenuButtons(){
    const g=game(),top=g?.querySelector('.gameTop');
    const menu=document.getElementById('premiumGameMenu');
    if(!g||!top||!menu)return;
    function add(id,label,handler){
      if(document.getElementById(id))return;
      const b=document.createElement('button');
      b.id=id;b.type='button';b.textContent=label;b.setAttribute('aria-expanded','false');
      b.addEventListener('click',()=>{
        const value=handler(g);
        b.setAttribute('aria-expanded',String(value));
        menu.classList.add('hide');
      });
      menu.appendChild(b);
    }
    add('casinoToggleSocial','🎭 Реакції', g=>{
      const open=g.classList.toggle('casinoSocialOpen');
      if(!open)return false;
      g.classList.remove('casinoChatOpen');
      return open;
    });
    add('casinoToggleChat','💬 Чат і події',g=>{
      const open=g.classList.toggle('casinoChatOpen');
      if(open)g.classList.remove('casinoSocialOpen');
      if(open)requestAnimationFrame(()=>g.querySelector('.gameSide')?.scrollIntoView({behavior:'smooth',block:'nearest'}));
      return open;
    });
  }
  function init(){
    const g=game(),s=document.getElementById('seats');
    if(!g||!s)return;
    mountMenuButtons();
    const header=g.querySelector('.gameTop');
    if(header)new MutationObserver(mountMenuButtons).observe(header,{childList:true,subtree:true});
    new MutationObserver(paintBacks).observe(s,{childList:true});
    document.addEventListener('trynka:game-state',e=>{lastSnapshot=e.detail;paintBacks();mountMenuButtons()});
    document.addEventListener('trynka:room-snapshot',e=>{lastSnapshot=e.detail;paintBacks();mountMenuButtons()});
    document.addEventListener('click',e=>{
      if(e.target.closest('#socialQuickBar [data-social-kind]')){
        g.classList.remove('casinoSocialOpen');
        document.getElementById('casinoToggleSocial')?.setAttribute('aria-expanded','false');
      }
    });
    paintBacks();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();