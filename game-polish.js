// TRYNKA dealer animation v5 — dealer and local hand stay synchronized.
const $=id=>document.getElementById(id);
let dealPlayed=false,dealRunning=false,lastCountdown='';
const animFactor=()=>({slow:1.45,normal:1,fast:.65,off:.08}[localStorage.getItem('trynkaAnimSpeed')||'normal']||1);
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(1,Math.round(ms*animFactor()))));

function targets(){
  return [...document.querySelectorAll('#seats .seat:not(.free)')]
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
  c.style.setProperty('--deal-duration',Math.max(40,Math.round(640*animFactor()))+'ms');
  const sx=dr.left-tr.left+dr.width/2-22,sy=dr.top-tr.top+dr.height/2-31;
  const ex=rr.left-tr.left+rr.width/2-22,ey=rr.top-tr.top+rr.height/2-31;
  c.style.left=sx+'px';c.style.top=sy+'px';
  c.style.setProperty('--dx',(ex-sx)+'px');c.style.setProperty('--dy',(ey-sy)+'px');
  c.style.setProperty('--rot',(index%2?'-7deg':'7deg'));
  table.appendChild(c);
  await sleep(25);c.classList.add('fly');
  await sleep(360);
  c.remove();
  await sleep(85);
  return true;
}
async function playDeal(){
  if(dealPlayed||dealRunning)return;
  const ts=targets();if(ts.length<2)return;
  dealPlayed=true;dealRunning=true;
  document.querySelectorAll('.dealerFlyingCard').forEach(x=>x.remove());
  window.dispatchEvent(new CustomEvent('trynka:deal-start'));
  let mineCount=0;
  try{
    for(let round=0;round<3;round++){
      for(let i=0;i<ts.length;i++){
        const target=freshTarget(ts[i]);
        const ok=await throwCard(target,round*ts.length+i);
        if(ok&&target?.classList.contains('mine')){
          mineCount++;
          window.dispatchEvent(new CustomEvent('trynka:own-card',{detail:{count:mineCount}}));
        }
      }
    }
  }finally{
    dealRunning=false;
    window.dispatchEvent(new CustomEvent('trynka:deal-end'));
  }
}
setInterval(()=>{
  const game=$('game');if(!game||game.classList.contains('hide'))return;
  const countdown=($('countdown')?.textContent||'').trim();
  const status=($('turnStatus')?.textContent||'').trim();
  if(countdown.startsWith('Старт через')&&!lastCountdown.startsWith('Старт через')){
    dealPlayed=false;
    document.querySelectorAll('.dealerFlyingCard').forEach(x=>x.remove());
  }
  lastCountdown=countdown;
  if(!dealPlayed&&(status.includes('Карти роздаються')||countdown==='Гра почалась'))playDeal();
},220);
