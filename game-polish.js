// TRYNKA dealer animation v71 — central-state driven, one card at a time.
const $=id=>document.getElementById(id);
let dealRunning=false,lastDealRound=null;
const animFactor=()=>({slow:1.45,normal:1,fast:.65,off:.08}[localStorage.getItem('trynkaAnimSpeed')||'normal']||1);
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(1,Math.round(ms*animFactor()))));

function targets(state){
  const ids=new Set((state?.round_players||[]).map(x=>x.user_id));
  return [...document.querySelectorAll('#seats .seat.roundEligible:not(.free)')]
    .filter(x=>ids.has(x.dataset.userId))
    .sort((a,b)=>+(a.className.match(/s(\d+)/)?.[1]||0)-+(b.className.match(/s(\d+)/)?.[1]||0));
}
function freshTarget(oldTarget){
  const seatClass=[...oldTarget.classList].find(x=>/^s\d+$/.test(x));
  return seatClass?document.querySelector('#seats .seat.'+seatClass):oldTarget;
}
async function throwCard(target,index){
  target=freshTarget(target);
  const table=document.querySelector('#game .table'),deck=document.querySelector('#game .deckStack');
  if(!table||!deck||!target||!document.body.contains(target))return false;
  const tr=table.getBoundingClientRect(),dr=deck.getBoundingClientRect(),rr=target.getBoundingClientRect();
  const c=document.createElement('div');
  c.className='dealerFlyingCard';c.innerHTML='<i></i>';
  c.style.setProperty('--deal-duration',Math.max(70,Math.round(330*animFactor()))+'ms');
  const sx=dr.left-tr.left+dr.width/2-22,sy=dr.top-tr.top+dr.height/2-31;
  const ex=rr.left-tr.left+rr.width/2-22,ey=rr.top-tr.top+rr.height/2-31;
  c.style.left=sx+'px';c.style.top=sy+'px';
  c.style.setProperty('--dx',(ex-sx)+'px');c.style.setProperty('--dy',(ey-sy)+'px');
  c.style.setProperty('--rot',(index%2?'-7deg':'7deg'));
  table.appendChild(c);
  await sleep(20);c.classList.add('fly');
  await sleep(390);c.remove();await sleep(95);
  return true;
}
async function playDeal(state){
  if(dealRunning)return;
  let ts=targets(state);
  if(ts.length<2){
    await sleep(160);ts=targets(state);
    if(ts.length<2)return;
  }
  dealRunning=true;lastDealRound=state.round?.id||lastDealRound;
  document.querySelectorAll('.dealerFlyingCard').forEach(x=>x.remove());
  window.dispatchEvent(new CustomEvent('trynka:deal-start'));
  let mineCount=0;
  try{
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<ts.length;i++){
        const target=freshTarget(ts[i]);
        const ok=await throwCard(target,pass*ts.length+i);
        if(ok&&target?.classList.contains('mine')){
          mineCount++;
          window.dispatchEvent(new CustomEvent('trynka:own-card',{detail:{count:mineCount}}));
        }
      }
    }
  }finally{
    dealRunning=false;window.dispatchEvent(new CustomEvent('trynka:deal-end'));
  }
}
function onState(state){
  const g=state?.round;if(!g||g.status!=='playing'||!g.id)return;
  const age=g.created_at?Date.now()-new Date(g.created_at).getTime():0;
  if(g.id===lastDealRound||age>9000)return;
  setTimeout(()=>playDeal(state),80);
}
document.addEventListener('trynka:game-state',e=>onState(e.detail));

setTimeout(()=>{if(window.TRYNKA_GAME_STATE)onState(window.TRYNKA_GAME_STATE)},0);
