// TRYNKA table polish v2 — UI only. No MutationObserver: it caused repeated redraw/deal flashes.
const $=id=>document.getElementById(id);
let dealPlayed=false;
let dealRunning=false;
let lastCountdown='';

function seatedTargets(){
  return [...document.querySelectorAll('#seats .seat:not(.free)')];
}

function flyCardTo(target,delay,round){
  setTimeout(()=>{
    const table=document.querySelector('#game .table');
    const deck=document.querySelector('#game .deckStack');
    if(!table||!deck||!target||!document.body.contains(target)) return;
    const tr=table.getBoundingClientRect();
    const dr=deck.getBoundingClientRect();
    const rr=target.getBoundingClientRect();
    const card=document.createElement('div');
    card.className='dealerFlyingCard';
    const sx=dr.left-tr.left+dr.width/2-18;
    const sy=dr.top-tr.top+dr.height/2-25;
    const ex=rr.left-tr.left+rr.width/2-18;
    const ey=rr.top-tr.top+rr.height/2-25;
    card.style.left=sx+'px';
    card.style.top=sy+'px';
    table.appendChild(card);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      card.style.transform=`translate(${ex-sx}px,${ey-sy}px) rotate(${round%2?'-7':'7'}deg)`;
      card.style.opacity='.18';
    }));
    setTimeout(()=>card.remove(),820);
  },delay);
}

function playDealOnce(){
  if(dealPlayed||dealRunning) return;
  const targets=seatedTargets();
  if(targets.length<2) return;
  dealPlayed=true;
  dealRunning=true;
  let n=0;
  // Three real rounds: one card to every seated player, then repeat.
  for(let round=0;round<3;round++){
    for(const target of targets) flyCardTo(target,n++*780,round);
  }
  setTimeout(()=>{dealRunning=false},n*780+900);
}

// Lightweight state watcher. It reads the UI but never rewrites timer/status nodes,
// so realtime updates cannot create a feedback loop or timer flicker.
setInterval(()=>{
  const game=$('game');
  if(!game||game.classList.contains('hide')) return;
  const countdown=($('countdown')?.textContent||'').trim();
  const status=($('turnStatus')?.textContent||'').trim();

  // A new countdown means a new deal is coming.
  if(countdown.startsWith('Старт через') && !lastCountdown.startsWith('Старт через')){
    dealPlayed=false;
    document.querySelectorAll('.dealerFlyingCard').forEach(x=>x.remove());
  }
  lastCountdown=countdown;

  if(!dealPlayed && (status.includes('Карти роздаються') || countdown==='Гра почалась')){
    playDealOnce();
  }
},200);
