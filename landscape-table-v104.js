/* Landscape presentation for TRYNKA. Keeps original hand and game handlers intact.
   Browsers may forbid screen.orientation.lock() unless fullscreen/PWA. */
(function(){
  'use strict';
  const landscape=window.matchMedia('(orientation: landscape) and (max-height: 700px) and (max-width:1100px)');
  const game=()=>document.getElementById('game');
  function arrange(){
    const g=game(),table=g?.querySelector('.table'),top=g?.querySelector('.gameTop');
    const dock=document.getElementById('cardDock');
    if(!g||!table||!top||!dock)return;
    const wantInside=landscape.matches||window.matchMedia('(max-width:650px)').matches;
    if(wantInside){
      if(dock.parentElement!==table)table.appendChild(dock);
    }else if(dock.parentElement!==top){
      top.insertBefore(dock,top.querySelector('.gameTopActions'));
    }
  }
  async function requestLandscape(){
    const g=game();
    if(!g)return;
    const message=document.getElementById('rotateFeedback');
    if(message)message.textContent='Поверніть телефон на бік. Спробуємо увімкнути горизонтальний режим.';
    try{
      // Fullscreen and screen locking generally require a user tap.
      if(!document.fullscreenElement&&typeof g.requestFullscreen==='function')
        await g.requestFullscreen({navigationUI:'hide'});
      if(screen.orientation&&typeof screen.orientation.lock==='function')
        await screen.orientation.lock('landscape');
    }catch(_error){
      // Keep the rotate prompt: browsers can reject fullscreen/lock.
      if(message)message.textContent='Автоповорот недоступний. Увімкніть автоповорот Android і поверніть телефон горизонтально.';
    }
    arrange();
  }
  function setup(){
    const g=game(),actions=g?.querySelector('.gameTopActions');
    if(!g||!actions)return;
    if(!document.getElementById('trynkaRotateNotice')){
      const el=document.createElement('div');
      el.id='trynkaRotateNotice';
      el.setAttribute('role','region');
      el.setAttribute('aria-label','Горизонтальний режим TRYNKA');
      const symbol=document.createElement('span');symbol.className='rotateSymbol';symbol.textContent='↻';
      const title=document.createElement('h2');title.textContent='Поверніть телефон';
      const body=document.createElement('p');body.textContent='Новий ігровий стіл працює горизонтально — так карти, гравці та ставки не затуляють одне одного.';
      const full=document.createElement('button');full.type='button';full.textContent='⛶ Увімкнути горизонтальний екран';full.addEventListener('click',requestLandscape);
      const feedback=document.createElement('p');feedback.id='rotateFeedback';feedback.className='rotateFallback';
      feedback.textContent='За потреби ввімкніть автоповорот у швидких налаштуваннях Android.';
      const alternate=document.createElement('button');alternate.type='button';alternate.textContent='Продовжити вертикально';
      alternate.addEventListener('click',()=>{g.classList.add('portraitAllowed')});
      el.append(symbol,title,body,full,feedback,alternate);
      g.appendChild(el);
    }
    if(!document.getElementById('landscapeFullscreenBtn')){
      const btn=document.createElement('button');
      btn.id='landscapeFullscreenBtn';btn.type='button';btn.textContent='⛶';
      btn.title='Повний екран · горизонтально';btn.setAttribute('aria-label','Увімкнути повноекранний горизонтальний режим');
      btn.addEventListener('click',requestLandscape);
      actions.appendChild(btn);
    }
    arrange();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
  if(landscape.addEventListener)landscape.addEventListener('change',arrange);
  else if(landscape.addListener)landscape.addListener(arrange);
  window.addEventListener('resize',arrange,{passive:true});
  window.addEventListener('orientationchange',arrange,{passive:true});
  document.addEventListener('trynka:game-state',arrange);
  window.TRYNKA_ARRANGE_LANDSCAPE_TABLE=arrange;
})();