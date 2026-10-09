/* TRYNKA v111 — visual-only turn time and winner chips.
   Values come from trusted server snapshots; no betting calls or timer authority. */
export function turnProgress(round, room, serverNowMs) {
  const total=Number(room?.turn_seconds)*1000;
  const started=Date.parse(round?.turn_started_at||'');
  if(round?.status!=='playing'||!round?.turn_user_id||
     !Number.isFinite(total)||total<1000||!Number.isFinite(started)||
     !Number.isFinite(serverNowMs)) return null;
  const remaining=Math.max(0,Math.min(total,total-(serverNowMs-started)));
  return {
    userId:String(round.turn_user_id),
    seconds:Math.ceil(remaining/1000),
    fraction:remaining/total
  };
}
if(typeof document!=='undefined'){
  let latest=null,clockDelta=0,shownRoom=null,finishedKey='';
  const $=sel=>document.querySelector(sel);
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanup=()=>{
    document.querySelectorAll('#seats .trynkaTurnProgress').forEach(x=>x.remove());
    document.querySelectorAll('#seats .seat.turnAlmostOut').forEach(x=>x.classList.remove('turnAlmostOut'));
    const label=$('#roundTurn');
    if(label)label.removeAttribute('data-last-seconds');
  };
  function awardChips(state){
    const g=state?.round;
    if(!g||g.status!=='finished'||!g.winner_id||!g.finished_at)return;
    const key=String(state.room?.id)+'|'+String(g.id)+'|'+g.finished_at;
    if(key===finishedKey)return;
    finishedKey=key;
    if(reduced()||Math.abs(Date.now()+clockDelta-Date.parse(g.finished_at))>6500)return;
    const table=$('#game .table'),pot=$('#game .potPile');
    const seat=[...document.querySelectorAll('#seats .seat')]
      .find(x=>x.dataset.userId===String(g.winner_id));
    if(!table||!pot||!seat)return;
    const t=table.getBoundingClientRect(),p=pot.getBoundingClientRect(),s=seat.getBoundingClientRect();
    const startX=p.x+p.width/2-t.x-10,startY=p.y+p.height/2-t.y-10;
    const dx=s.x+s.width/2-(p.x+p.width/2),dy=s.y+s.height/2-(p.y+p.height/2);
    for(let i=0;i<3;i++){
      const chip=document.createElement('span');
      chip.className='trynkaWinnerChip';
      chip.setAttribute('aria-hidden','true');
      chip.style.left=startX+'px';chip.style.top=startY+'px';
      chip.style.setProperty('--win-dx',(dx+(i-1)*10)+'px');
      chip.style.setProperty('--win-dy',(dy-(i%2)*8)+'px');
      chip.style.setProperty('--win-delay',(i*90)+'ms');
      table.appendChild(chip);
      chip.addEventListener('animationend',()=>chip.remove(),{once:true});
      setTimeout(()=>chip.remove(),1400);
    }
  }
  function receive(state){
    if(!state?.room)return;
    if(shownRoom!==state.room.id){
      cleanup();finishedKey='';shownRoom=state.room.id;
    }
    latest=state;
    const serverDate=Date.parse(state.server_ts||'');
    if(Number.isFinite(serverDate))clockDelta=serverDate-Date.now();
    awardChips(state);
    tick();
  }
  function tick(){
    const game=$('#game');
    if(!game||game.classList.contains('hide')){cleanup();return}
    const g=latest?.round;
    const value=turnProgress(g,latest?.room,Date.now()+clockDelta);
    const existing=document.querySelectorAll('#seats .trynkaTurnProgress');
    if(!value){
      if(existing.length)cleanup();
      return;
    }
    const seat=[...document.querySelectorAll('#seats .seat')]
      .find(x=>x.dataset.userId===value.userId);
    for(const old of existing)if(old.parentElement!==seat)old.remove();
    document.querySelectorAll('#seats .seat.turnAlmostOut').forEach(x=>{
      if(x!==seat)x.classList.remove('turnAlmostOut');
    });
    if(!seat)return;
    let bar=seat.querySelector('.trynkaTurnProgress');
    if(!bar){
      bar=document.createElement('span');
      bar.className='trynkaTurnProgress';
      bar.setAttribute('aria-hidden','true');
      seat.appendChild(bar);
    }
    bar.style.width=(Math.round(value.fraction*1000)/10)+'%';
    seat.classList.toggle('turnAlmostOut',value.seconds<=5);
    const label=$('#roundTurn');
    if(label)label.dataset.lastSeconds=String(value.seconds);
  }
  document.addEventListener('trynka:room-snapshot',e=>receive(e.detail));
  document.addEventListener('trynka:game-state',e=>receive(e.detail));
  document.addEventListener('trynka:reconnected',()=>{if(window.TRYNKA_GAME_STATE)receive(window.TRYNKA_GAME_STATE)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  setInterval(tick,1000);
  if(window.TRYNKA_GAME_STATE)receive(window.TRYNKA_GAME_STATE);
}
