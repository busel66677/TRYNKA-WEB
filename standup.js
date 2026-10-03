import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);

let me=null,busy=false,standing=false,currentRoom=null;
let timerState=null,lastSeatState='',lastOpenState='',lastTimerText='',lastSeated=null;

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}
async function myRoom(){
  const u=await getMe();if(!u)return null;
  const {data}=await sb.from('room_players').select('room_id,seat_no').eq('user_id',u.id).order('joined_at',{ascending:false}).limit(1).maybeSingle();
  return data||null;
}
function mountStand(){
  const actions=document.querySelector('.gameTopActions');
  if(!actions||$('standUpBtn'))return;
  const b=document.createElement('button');
  b.id='standUpBtn';b.className='standUpBtn hide';b.textContent='↑ Встати';
  actions.prepend(b);
  b.addEventListener('click',async()=>{
    if(standing)return;
    const rp=await myRoom();if(!rp||rp.seat_no==null)return;
    standing=true;b.disabled=true;b.textContent='Встаємо…';
    const {error}=await sb.rpc('stand_up_from_table',{p_room:rp.room_id});
    standing=false;b.disabled=false;b.textContent='↑ Встати';
    if(error)return alert(error.message);
    lastSeatState='';lastOpenState='';await syncUi();
  });
}
function mountGameInfo(){
  const actions=$('gameActions');
  if(!actions||$('supportSummary'))return;
  const box=document.createElement('div');
  box.id='supportSummary';
  box.className='supportSummary';
  box.innerHTML='<span>Банк: <b>0 ◉</b></span><span>Ви дали: <b>0 ◉</b></span><span class="supportNeed">Мінімум підтримати: <b>0 ◉</b></span>';
  const buttons=actions.querySelector('.actionButtons');
  if(buttons)actions.insertBefore(box,buttons);else actions.appendChild(box);
}
function syncStand(seated){
  const leave=$('leaveRoom'),stand=$('standUpBtn');
  if(stand)stand.classList.toggle('hide',!seated);
  if(leave){
    leave.classList.toggle('lobbyLocked',seated);
    leave.textContent=seated?'🔒 Спочатку встаньте':'← Лобі';
    leave.title=seated?'Щоб вийти в лобі, спочатку встаньте':'';
  }
}
function playerName(seat){
  return (seat?.querySelector('.seatName')?.textContent||'Гравець').replace('★','').replace('ADMIN','').trim();
}
function paintSeats(ps,turnUser,lastAction=null){
  const actionSig=lastAction?[lastAction.id,lastAction.user_id,lastAction.action,Number(lastAction.amount||0)]:[];
  const sig=JSON.stringify((ps||[]).map(p=>[p.user_id,p.seat_no,Number(p.contributed||0),!!p.folded]).sort((a,b)=>a[1]-b[1]))+'|'+(turnUser||'')+'|'+JSON.stringify(actionSig);
  if(sig===lastSeatState)return;
  lastSeatState=sig;

  document.querySelectorAll('#seats .seat').forEach(s=>{
    s.classList.remove('turnActive','foldedSeat','lastRaiser');
    s.querySelector('.betBadge')?.remove();
    s.querySelector('.seatActionPop')?.remove();
  });

  for(const p of ps||[]){
    const seat=document.querySelector('#seats .seat.s'+p.seat_no);
    if(!seat)continue;
    if(p.folded)seat.classList.add('foldedSeat');
    if(p.user_id===turnUser&&!p.folded)seat.classList.add('turnActive');

    const body=seat.querySelector('.seatBody')||seat;
    let contribution=seat.querySelector('.seatContribution');
    if(!contribution){
      contribution=document.createElement('div');
      contribution.className='seatContribution';
      const state=seat.querySelector('.seatState');
      if(state&&state.parentNode===body)body.insertBefore(contribution,state);else body.appendChild(contribution);
    }
    contribution.textContent='ДАВ: '+Number(p.contributed||0)+' ◉';
    contribution.classList.toggle('zero',Number(p.contributed||0)<=0);

    const state=seat.querySelector('.seatState');
    if(state)state.textContent=p.folded?'ВПАВ':'';

    if(lastAction?.action==='raise'&&lastAction.user_id===p.user_id){
      seat.classList.add('lastRaiser');
    }
    const actionAge=lastAction?.created_at?Date.now()-new Date(lastAction.created_at).getTime():999999;
    if(lastAction&&lastAction.user_id===p.user_id&&(lastAction.action==='call'||lastAction.action==='raise')&&Number(lastAction.amount||0)>0&&actionAge<4500){
      const pop=document.createElement('div');
      pop.className='seatActionPop';
      pop.textContent='+'+Number(lastAction.amount||0)+' ◉';
      seat.appendChild(pop);
      setTimeout(()=>pop.remove(),2200);
    }
  }
}

function updateSupportUi(g,ps){
  mountGameInfo();
  const box=$('supportSummary');
  const mine=(ps||[]).find(p=>p.user_id===me?.id);
  const contributed=Number(mine?.contributed||0);
  const currentBet=Number(g?.current_bet||0);
  const need=Math.max(0,currentBet-contributed);
  const myTurn=g?.status==='playing'&&g.turn_user_id===me?.id&&!mine?.folded;

  if(box){
    box.innerHTML='<span>Банк: <b>'+Number(g?.pot||0)+' ◉</b></span>'+
      '<span>Ви дали: <b>'+contributed+' ◉</b></span>'+
      '<span class="supportNeed '+(myTurn&&need>0?'urgent':'')+'">Мінімум підтримати: <b>'+need+' ◉</b></span>';
  }

  const call=document.querySelector('#gameActions button[data-action="call"]');
  if(call){
    call.textContent=need>0?'ДАВ '+need+' ◉':'ПІДТРИМАТИ';
    call.dataset.need=String(need);
  }

  if($('bankInfo')){
    $('bankInfo').textContent='Поточна ставка: '+currentBet+' ◉'+(myTurn?' · Вам додати: '+need+' ◉':'');
  }
}

function paintOpenHands(rows){
  const sig=JSON.stringify((rows||[]).map(r=>[r.user_id,r.seat_no,r.cards]).sort((a,b)=>a[1]-b[1]));
  const count=document.querySelectorAll('#seats .openHand').length;
  if(sig===lastOpenState&&count===(rows||[]).length)return;
  lastOpenState=sig;

  document.querySelectorAll('#seats .openHand').forEach(x=>x.remove());
  document.querySelectorAll('#seats .seat.revealPairSeat').forEach(x=>x.classList.remove('revealPairSeat'));

  for(const r of rows||[]){
    const seat=document.querySelector('#seats .seat.s'+r.seat_no);
    if(!seat||!r.cards?.length)continue;
    seat.classList.add('revealPairSeat');
    const box=document.createElement('div');
    box.className='openHand revealHand';
    box.setAttribute('aria-label','Відкриті карти');
    for(const card of r.cards){
      const cardEl=document.createElement('b');
      cardEl.textContent=card;
      if(card.includes('♥')||card.includes('♦'))cardEl.classList.add('red');
      box.appendChild(cardEl);
    }
    seat.appendChild(box);
  }
}
async function syncUi(){
  if(busy||$('game')?.classList.contains('hide'))return;
  busy=true;
  try{
    const rp=await myRoom();
    currentRoom=rp?.room_id||null;
    const seated=rp?.seat_no!=null;
    if(lastSeated!==seated){lastSeated=seated;syncStand(seated)}
    mountStand();
    mountGameInfo();

    if(!currentRoom){
      timerState=null;lastSeatState='';lastOpenState='';
      return;
    }

    const [{data:r},{data:g}]=await Promise.all([
      sb.from('rooms').select('turn_seconds,ante,game_status').eq('id',currentRoom).maybeSingle(),
      sb.from('game_rounds').select('id,status,pot,current_bet,round_no,turn_user_id,turn_started_at,created_at').eq('room_id',currentRoom).order('id',{ascending:false}).limit(1).maybeSingle()
    ]);

    if(!g){
      timerState=null;
      if($('potBig'))$('potBig').textContent='БАНК: 0 ◉';
      return;
    }

    const [{data:ps},{data:lastAction}]=await Promise.all([
      sb.from('round_players').select('user_id,seat_no,contributed,folded,revealed').eq('round_id',g.id),
      sb.from('round_actions').select('id,user_id,action,amount,created_at').eq('round_id',g.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    paintSeats(ps||[],g.status==='playing'?g.turn_user_id:null,lastAction||null);
    updateSupportUi(g,ps||[]);

    if(g.status==='playing'){
      let nick='Гравець';
      if(g.turn_user_id===me?.id)nick='Ви';
      else{
        const {data:p}=await sb.from('profiles').select('nickname').eq('id',g.turn_user_id).maybeSingle();
        nick=p?.nickname||'Гравець';
      }
      timerState={
        turnUser:g.turn_user_id,
        nick,
        started:new Date(g.turn_started_at||g.created_at).getTime(),
        seconds:Number(r?.turn_seconds||30)
      };
      if($('potBig'))$('potBig').textContent='БАНК: '+Number(g.pot||0)+' ◉';
      if($('bankInfo'))$('bankInfo').textContent='Поточна ставка: '+Number(g.current_bet||r?.ante||0)+' ◉';
      if($('countdown'))$('countdown').textContent='КОЛО '+Number(g.round_no||1);
    }else{
      timerState=null;
      if($('potBig'))$('potBig').textContent='БАНК: '+Number(g.pot||0)+' ◉';
    }

    const {data:opened,error}=await sb.rpc('get_revealed_hands',{p_room:currentRoom});
    if(!error)paintOpenHands(opened||[]);

    const mine=(ps||[]).find(p=>p.user_id===me?.id);
    $('myHand')?.classList.toggle('handRevealed',!!mine?.revealed);
  }finally{busy=false}
}
function tickTimer(){
  const el=$('roundTurn');
  if(!el||!timerState)return;
  const left=Math.max(0,timerState.seconds-Math.floor((Date.now()-timerState.started)/1000));
  const text=(timerState.turnUser===me?.id?'ВАШ ХІД':'ХІД: '+timerState.nick.toUpperCase())+' · '+left+'с';
  if(text!==lastTimerText||el.textContent!==text){lastTimerText=text;el.textContent=text}
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('#leaveRoom');if(!b)return;
  const rp=await myRoom();
  if(rp?.seat_no!=null){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    alert('Спочатку натисніть «Встати», а потім можна вийти в лобі.');
  }
},true);

async function init(){
  mountStand();mountGameInfo();await getMe();await syncUi();
  setInterval(syncUi,850);
  setInterval(tickTimer,200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
