/* TRYNKA v108 — use the SAME live cards, now in a bottom-of-screen tray.
   Drag-to-peek handlers live on .pullCard and survive a DOM relocation. */
(()=>{
  'use strict';
  const portrait=window.matchMedia('(orientation:portrait) and (max-width:700px)');
  function arrange(){
    const game=document.getElementById('game');
    const table=game?.querySelector('.table');
    const wrapper=game?.querySelector('.tableWrap');
    const top=game?.querySelector('.gameTop');
    const actions=document.getElementById('gameActions');
    const dock=document.getElementById('cardDock');
    if(!game||!table||!wrapper||!top||!actions||!dock)return;
    let tray=document.getElementById('playerHandTray');
    if(!tray){
      tray=document.createElement('div');
      tray.id='playerHandTray';
      tray.className='playerHandTray';
      tray.setAttribute('aria-label','Мої три карти');
    }
    if(portrait.matches){
      // Seat, pot, buttons, and THEN large own cards. Keep this tray last.
      if(tray.parentElement!==wrapper || wrapper.lastElementChild!==tray)
        wrapper.appendChild(tray);
      if(dock.parentElement!==tray)tray.appendChild(dock);
      const label=dock.querySelector('.cardDockLabel');
      if(label)label.textContent='МОЇ КАРТИ  ·  ПОТЯГНИ ВНИЗ';
    }else{
      // Desktop and landscape retain the tested pre-v108 placement.
      const compactLandscape=matchMedia('(orientation:landscape) and (max-height:700px) and (max-width:1100px)').matches;
      const phone=matchMedia('(max-width:650px)').matches;
      const wanted=compactLandscape||phone?table:top;
      if(dock.parentElement!==wanted){
        if(wanted===top) top.insertBefore(dock,top.querySelector('.gameTopActions'));
        else wanted.appendChild(dock);
      }
      tray.remove();
      const label=dock.querySelector('.cardDockLabel');
      if(label)label.textContent='МОЇ КАРТИ';
    }
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',arrange,{once:true});
  else arrange();
  // Attach after earlier responsive listeners. Re-run after any built-in mover.
  if(portrait.addEventListener)portrait.addEventListener('change',arrange);
  else portrait.addListener(arrange);
  window.addEventListener('resize',arrange,{passive:true});
  window.addEventListener('orientationchange',arrange,{passive:true});
  document.addEventListener('trynka:game-state',arrange);
  window.TRYNKA_ARRANGE_BOTTOM_HAND_V108=arrange;
})();
