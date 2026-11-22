/* TRYNKA v123 — small-screen viewport, read-only wallet formatting, overlay for chat/history.
   Existing app.js + card-pull-v109.js remain the ONLY owners of hand data and gestures. */
(() => {
  'use strict';
  const game = document.getElementById('game');
  if (!game) return;
  const mobile = window.matchMedia('(max-width:1100px)');
  const portrait = window.matchMedia('(orientation:portrait) and (max-width:700px)');
  const topActions = game.querySelector('.gameTopActions');
  const side = game.querySelector('.gameSide');
  const wallet = document.getElementById('gameBalance');
  if (!topActions || !side) return;
  let open = false;
  const toggle = document.createElement('button');
  toggle.id = 'compactDrawerBtn';
  toggle.type = 'button';
  toggle.textContent = '☰';
  toggle.title = 'Чат та історія';
  toggle.setAttribute('aria-label','Відкрити чат та історію гри');
  toggle.setAttribute('aria-expanded','false');
  const close = document.createElement('button');
  close.id = 'compactDrawerClose';
  close.type = 'button';
  close.textContent = '✕ Закрити';
  close.setAttribute('aria-label','Закрити чат та історію');
  topActions.appendChild(toggle);
  side.prepend(close);
  function setOpen(next){
    open = !!next && mobile.matches && !game.classList.contains('hide');
    game.classList.toggle('compactDrawerOpen',open);
    toggle.setAttribute('aria-expanded',String(open));
    if(open) close.focus({preventScroll:true});
    else if(document.activeElement === close)toggle.focus({preventScroll:true});
  }
  toggle.addEventListener('click',()=>setOpen(!open));
  close.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)setOpen(false)});
  document.addEventListener('pointerdown',e=>{
    if(open && !side.contains(e.target) && !toggle.contains(e.target))setOpen(false);
  });
  const observer = new MutationObserver(()=>{
    if(game.classList.contains('hide')&&open)setOpen(false);
  });
  observer.observe(game,{attributes:true,attributeFilter:['class']});
  function updateViewport(){
    const px = Math.round(window.visualViewport?.height || window.innerHeight);
    // Telegram browser and Android dynamic address bars change the usable height.
    document.documentElement.style.setProperty('--trynka-visible-height',px+'px');
    if(!mobile.matches && open)setOpen(false);
  }
  updateViewport();
  window.addEventListener('resize',updateViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
  window.addEventListener('orientationchange',updateViewport,{passive:true});
  // Display-only: backend amounts and the profile record are untouched.
  function paintBalance(){
    if(!wallet) return;
    const source=wallet.textContent.trim();
    if(!source || !(/[◉]|гаманець|баланс/i).test(source))return;
    const digits=source.replace(/[^\d.,\s]/g,'').replace(/\s/g,'');
    if(!digits)return;
    const amount=Number(digits.replace(/,/g,'.'));
    if(!Number.isFinite(amount))return;
    const next=amount.toLocaleString('uk-UA')+' грн';
    if(wallet.textContent!==next)wallet.textContent=next;
  }
  if(wallet){
    new MutationObserver(paintBalance).observe(wallet,{childList:true,characterData:true,subtree:true});
    paintBalance();
  }
  function decorateCards(){
    const dock=document.getElementById('cardDock');
    const label=dock?.querySelector('.cardDockLabel');
    if(label && portrait.matches)label.textContent='МОЇ КАРТИ · ТЯГНИ СОРОЧКУ ВНИЗ ↓';
    for(const card of game.querySelectorAll('#myHand .pullCard')){
      if(card.dataset.compactPullHint)continue;
      card.dataset.compactPullHint='1';
      card.setAttribute('aria-label','Потягни сорочку карти вниз, щоб підглянути');
      card.style.touchAction='none';
    }
  }
  const hand=document.getElementById('myHand');
  if(hand)new MutationObserver(decorateCards).observe(hand,{childList:true});
  document.addEventListener('trynka:game-state',decorateCards);
  window.addEventListener('resize',decorateCards,{passive:true});
  decorateCards();
})();