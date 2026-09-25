// TRYNKA table polish: visual one-card-at-a-time dealer animation + flicker guards.
// This layer is intentionally UI-only; game rules remain server authoritative.
const $=id=>document.getElementById(id);
let lastDealKey='', dealing=false, lastTurnText='';

function seatedTargets(){
  return [...document.querySelectorAll('#seats .seat:not(.free)')];
}
function flyCardTo(target, delay, round){
  setTimeout(()=>{
    const table=document.querySelector('.table'), deck=document.querySelector('.deckStack');
    if(!table||!deck||!target)return;
    const tr=table.getBoundingClientRect(), dr=deck.getBoundingClientRect(), rr=target.getBoundingClientRect();
    const card=document.createElement('div');
    card.className='dealerFlyingCard';
    card.style.left=(dr.left-tr.left+dr.width/2-18)+'px';
    card.style.top=(dr.top-tr.top+dr.height/2-25)+'px';
    table.appendChild(card);
    requestAnimationFrame(()=>{
      card.style.transform=`translate(${rr.left-tr.left+rr.width/2-(dr.left-tr.left+dr.width/2)}px,${rr.top-tr.top+rr.height/2-(dr.top-tr.top+dr.height/2)}px) rotate(${round%2?'-8':'8'}deg)`;
      card.style.opacity='.25';
    });
    setTimeout(()=>card.remove(),700);
  },delay);
}
function startDealerSequence(){
  if(dealing)return;
  const targets=seatedTargets();
  if(targets.length<2)return;
  const key=targets.map(x=>x.textContent.trim()).join('|')+'|'+Date.now().toString().slice(0,-4);
  if(key===lastDealKey)return;
  lastDealKey=key; dealing=true;
  let n=0;
  for(let round=0;round<3;round++) for(const target of targets) flyCardTo(target,n++*650,round);
  setTimeout(()=>{dealing=false},n*650+800);
}

// Keep timer text visually stable. Replacing identical text is skipped by the browser naturally;
// this observer also marks the turn display so layout width never collapses between realtime refreshes.
const observer=new MutationObserver(()=>{
  const rt=$('roundTurn');
  if(rt){
    rt.classList.add('stableTurn');
    const t=rt.textContent;
    if(t)lastTurnText=t; else if(lastTurnText)rt.textContent=lastTurnText;
  }
  const status=$('turnStatus'), countdown=$('countdown');
  if(status&&countdown && (status.textContent.includes('Карти роздаються')||countdown.textContent.includes('Гра почалась'))){
    startDealerSequence();
  }
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
