import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
let me=null,lastRoundId=null,lastActionId=null,lastPot=null,lastResultKey='',lastRevealKey='',revealTimer=null;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seatFor=(state,uid)=>{
  const p=(state?.players||[]).find(x=>x.user_id===uid);
  return p?document.querySelector('#seats .seat.s'+p.seat_no):null;
};

function ensureResultBanner(){
  const table=document.querySelector('#game .table');if(!table)return null;
  let x=$('uxRoundResult');
  if(!x){
    x=document.createElement('div');
    x.id='uxRoundResult';
    x.className='uxRoundResult hide';
    table.appendChild(x);
  }
  return x;
}
function showResult(state){
  const g=state?.round;if(!g||g.status!=='finished'||!g.finished_at)return;
  const key=g.id+'|'+g.finished_at;if(key===lastResultKey)return;
  lastResultKey=key;
  const x=ensureResultBanner();if(!x)return;
  const payout=Math.max(0,Number(g.pot||0)-Number(g.dealer_fee||0));
  let title='Роздачу завершено',sub='Банк '+Number(g.pot||0)+' ◉',cls='';
  if(g.result_note==='Свара'){
    title='🔥 СВАРА';
    sub=state?.svara?'Банк '+Number(state.room?.carried_pot||g.pot||0)+' ◉ · вхід '+Number(state.svara.entry_fee||0)+' ◉':'Банк '+Number(g.pot||0)+' ◉ переходить далі';
    cls='svara';
  }else if(g.winner_id){
    const w=(state.players||[]).find(p=>p.user_id===g.winner_id);
    title=g.winner_id===me?.id?'🏆 ВИ ВИГРАЛИ':'🏆 '+String(w?.nickname||'Гравець').toUpperCase()+' ВИГРАВ';
    sub='+'+payout.toLocaleString('uk-UA')+' ◉';
    cls=g.winner_id===me?.id?'win':'';
  }
  x.innerHTML='<b>'+esc(title)+'</b><span>'+esc(sub)+'</span>';
  x.className='uxRoundResult '+cls;
  clearTimeout(showResult.t);
  showResult.t=setTimeout(()=>x.classList.add('hide'),4200);
}
function paintTurn(state){
  document.querySelectorAll('#seats .seat.uxTurn').forEach(x=>x.classList.remove('uxTurn'));
  const g=state?.round;if(!g||g.status!=='playing')return;
  const seat=seatFor(state,g.turn_user_id);
  if(seat)seat.classList.add('uxTurn');
}
function paintDealer(state){
  document.querySelectorAll('#seats .uxDealer').forEach(x=>x.remove());
  const g=state?.round;if(!g?.dealer_user_id)return;
  const seat=seatFor(state,g.dealer_user_id);if(!seat)return;
  const d=document.createElement('span');d.className='uxDealer';d.textContent='D';seat.appendChild(d);
}
function paintPot(state,pulse=true){
  const pile=document.querySelector('#game .potPile');if(!pile)return;
  const amount=Number(state?.svara?state.room?.carried_pot:state?.round?.pot||0);
  const ante=Math.max(1,Number(state?.room?.ante||10));
  const count=Math.max(3,Math.min(12,3+Math.round(Math.log2(1+amount/ante)*2)));
  if(pile.dataset.count!==String(count)){
    pile.dataset.count=String(count);pile.innerHTML='';
    for(let i=0;i<count;i++){
      const chip=document.createElement('i');chip.className='uxPotChip';
      const col=i%4,row=Math.floor(i/4);
      chip.style.setProperty('--ux-x',(9+col*19+(row%2)*7)+'px');
      chip.style.setProperty('--ux-y',(22-row*8+(col%2)*2)+'px');
      chip.style.setProperty('--ux-r',((-6+((i*7)%13)))+'deg');
      pile.appendChild(chip);
    }
  }
  if(lastPot!==null&&amount!==lastPot&&pulse){
    pile.classList.remove('uxPotPulse');void pile.offsetWidth;pile.classList.add('uxPotPulse');
  }
  lastPot=amount;
}
function animateChip(state,action){
  if(!action||!['call','raise'].includes(action.action)||Number(action.amount||0)<=0)return;
  const seat=seatFor(state,action.user_id),target=document.querySelector('#game .potPile'),table=document.querySelector('#game .table');
  if(!seat||!target||!table)return;
  const sr=seat.getBoundingClientRect(),tr=target.getBoundingClientRect(),br=table.getBoundingClientRect();
  const chip=document.createElement('div');chip.className='uxFlyingChip';
  chip.innerHTML='<i>◉</i><b>'+Number(action.amount||0)+' ◉</b>';
  chip.style.left=(sr.left+sr.width/2-br.left-16)+'px';
  chip.style.top=(sr.top+sr.height/2-br.top-16)+'px';
  chip.style.setProperty('--ux-dx',(tr.left+tr.width/2-(sr.left+sr.width/2))+'px');
  chip.style.setProperty('--ux-dy',(tr.top+tr.height/2-(sr.top+sr.height/2))+'px');
  table.appendChild(chip);
  requestAnimationFrame(()=>chip.classList.add('fly'));
  setTimeout(()=>chip.remove(),760);
}
function clearReveal(){
  clearTimeout(revealTimer);
  document.querySelectorAll('#seats .uxRevealHand').forEach(x=>x.remove());
  document.querySelectorAll('#seats .uxRevealSeat').forEach(x=>x.classList.remove('uxRevealSeat','uxRevealWinner','uxRevealLoser','uxRevealTie'));
}
async function paintReveal(state){
  const g=state?.round;if(!g?.reveal_actor||!g?.reveal_target)return;
  const revealAction=(state.latest_actions||[]).find(a=>a.action==='reveal');
  const key=g.id+'|'+g.reveal_actor+'|'+g.reveal_target+'|'+(revealAction?.id||'');
  if(key===lastRevealKey)return;
  lastRevealKey=key;clearReveal();

  const actorSeat=seatFor(state,g.reveal_actor),targetSeat=seatFor(state,g.reveal_target);
  actorSeat?.classList.add('uxRevealSeat');targetSeat?.classList.add('uxRevealSeat');

  const rp=new Map((state.round_players||[]).map(x=>[x.user_id,x]));
  if(g.result_note==='Свара'){
    actorSeat?.classList.add('uxRevealTie');targetSeat?.classList.add('uxRevealTie');
  }else{
    const aFold=!!rp.get(g.reveal_actor)?.folded,tFold=!!rp.get(g.reveal_target)?.folded;
    if(aFold&&!tFold){actorSeat?.classList.add('uxRevealLoser');targetSeat?.classList.add('uxRevealWinner')}
    if(tFold&&!aFold){targetSeat?.classList.add('uxRevealLoser');actorSeat?.classList.add('uxRevealWinner')}
  }

  // The single seat-bound renderer in revealed-hands-v99.js owns the cards.
  // Keep only turn/win/tie highlighting here; no second overlay or RPC.
  revealTimer=setTimeout(clearReveal,g.status==='finished'?6500:4300);
}
function paintSvaraTheme(state){
  document.querySelector('#game .table')?.classList.toggle('uxSvaraTable',!!(state?.svara||state?.round?.is_svara));
}
function handleAction(state){
  const newest=(state?.latest_actions||[])[0];
  if(!newest)return;
  if(lastRoundId!==state.round?.id){
    lastRoundId=state.round?.id||null;
    lastActionId=newest.id||null;
    return;
  }
  if(newest.id&&newest.id!==lastActionId){
    lastActionId=newest.id;
    animateChip(state,newest);
  }
}
async function renderState(state){
  if(!state?.room)return;
  paintTurn(state);paintDealer(state);paintPot(state);paintSvaraTheme(state);handleAction(state);showResult(state);
  await paintReveal(state);
}
async function init(){
  const {data:{user}}=await sb.auth.getUser();me=user||null;
  window.TRYNKA_STABLE_TURN_UI=true;
  document.addEventListener('trynka:game-state',e=>renderState(e.detail));
  if(window.TRYNKA_GAME_STATE)await renderState(window.TRYNKA_GAME_STATE);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
