import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);
const dockEsc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

let me=null,busy=false,standing=false,currentRoom=null;
let timerState=null,lastSeatState='',lastOpenState='',lastTimerText='',lastSeated=null,lastTurnNoticeKey='',audioCtx=null;

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}
function primeTurnAudio(){
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return;
    if(!audioCtx)audioCtx=new A();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }catch{}
}
function beepTurn(){
  if(localStorage.getItem('trynkaSound')==='off')return;
  try{
    primeTurnAudio();
    if(!audioCtx)return;
    const now=audioCtx.currentTime;
    [720,940].forEach((f,i)=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.frequency.value=f;o.type='sine';
      g.gain.setValueAtTime(.0001,now+i*.11);
      g.gain.exponentialRampToValueAtTime(.05,now+i*.11+.015);
      g.gain.exponentialRampToValueAtTime(.0001,now+i*.11+.1);
      o.connect(g);g.connect(audioCtx.destination);
      o.start(now+i*.11);o.stop(now+i*.11+.11);
    });
  }catch{}
}
function notifyMyTurn(g){
  if(!g||g.status!=='playing'||g.turn_user_id!==me?.id)return;
  const key=g.id+':'+String(g.turn_started_at||'');
  if(key===lastTurnNoticeKey)return;
  lastTurnNoticeKey=key;
  beepTurn();
  if(localStorage.getItem('trynkaVibrate')!=='off'){try{navigator.vibrate?.([140,70,140])}catch{}}
  if(localStorage.getItem('trynkaNotify')!=='off'&&document.hidden&&'Notification'in window&&Notification.permission==='granted'){
    try{new Notification('TRYNKA — ваш хід',{body:'Час зробити хід за столом.',tag:'trynka-turn',renotify:true})}catch{}
  }
  document.title='● ВАШ ХІД — TRYNKA';
  setTimeout(()=>{if(document.title.includes('ВАШ ХІД'))document.title='TRYNKA ONLINE'},3500);
}
async function touchPresence(){
  if(!currentRoom||$('game')?.classList.contains('hide'))return;
  const rp=await myRoom();
  if(rp?.spectator)return;
  try{await sb.rpc('touch_room_presence',{p_room:currentRoom})}catch{}
}

async function myRoom(){
  const u=await getMe();if(!u)return null;
  const central=window.TRYNKA_GAME_STATE;
  if(currentRoom&&central?.room?.id&&Number(central.room.id)===Number(currentRoom)){
    const mine=(central.players||[]).find(x=>x.user_id===u.id);
    if(mine)return {room_id:Number(currentRoom),seat_no:mine.seat_no,table_chips:Number(mine.table_chips||0)};
  }
  try{
    const saved=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');
    if(saved.view==='game'&&saved.roomId){
      const roomId=Number(saved.roomId);
      const [{data},{data:watcher}]=await Promise.all([
        sb.from('room_players')
          .select('room_id,seat_no,table_chips')
          .eq('room_id',roomId)
          .eq('user_id',u.id)
          .maybeSingle(),
        sb.from('room_spectators')
          .select('room_id')
          .eq('room_id',roomId)
          .eq('user_id',u.id)
          .maybeSingle()
      ]);
      if(data)return data;
      if(watcher)return {room_id:roomId,seat_no:null,table_chips:0,spectator:true};
    }
  }catch{}
  const {data}=await sb.from('room_players').select('room_id,seat_no,table_chips').eq('user_id',u.id).order('joined_at',{ascending:false}).limit(1).maybeSingle();
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
    const rid=Number(currentRoom||window.TRYNKA_GAME_STATE?.room?.id||0);
    if(!rid){
      alert('Не вдалося визначити стіл. Оновіть сторінку.');
      return;
    }
    standing=true;
    b.disabled=true;
    b.textContent='Встаємо…';
    try{
      const {error}=await sb.rpc('stand_up_from_table',{p_room:rid});
      if(error){
        alert(error.message);
        return;
      }
      lastSeatState='';
      lastOpenState='';
      lastSeated=false;
      syncStand(false);
      paintOpenHands([]);
      const central=window.TRYNKA_GAME_STATE;
      if(central?.room?.id&&Number(central.room.id)===rid&&Array.isArray(central.players)){
        const mine=central.players.find(x=>x.user_id===me?.id);
        if(mine){mine.seat_no=null;mine.table_chips=0}
      }
      document.dispatchEvent(new CustomEvent('trynka:stand-up',{detail:{roomId:rid}}));
      try{await window.TRYNKA_FORCE_RENDER?.()}catch{}
      await syncUi();
    }catch(e){
      alert(e?.message||'Не вдалося встати зі столу');
    }finally{
      standing=false;
      b.disabled=false;
      b.textContent='↑ Встати';
    }
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
function paintSeats(ps,turnUser,lastAction=null,presence=[]){
  const actionSig=lastAction?[lastAction.id,lastAction.user_id,lastAction.action,Number(lastAction.amount||0)]:[];
  const now=Date.now();
  const pmap=new Map((presence||[]).map(x=>[x.user_id,x]));
  const statusOf=userId=>{
    const x=pmap.get(userId);
    if(!x?.last_seen_at)return 'off';
    const age=now-new Date(x.last_seen_at).getTime();
    if(age<=22000)return 'on';
    if(age<=55000)return 'reconnecting';
    return 'off';
  };
  const sig=JSON.stringify((ps||[]).map(p=>[p.user_id,p.seat_no,Number(p.contributed||0),!!p.folded,statusOf(p.user_id)]).sort((a,b)=>a[1]-b[1]))+'|'+(turnUser||'')+'|'+JSON.stringify(actionSig);
  if(sig===lastSeatState)return;
  lastSeatState=sig;

  document.querySelectorAll('#seats .seat').forEach(s=>{
    s.classList.remove('turnActive','foldedSeat','lastRaiser','revealPairSeat');
    s.querySelector('.seatActionPop')?.remove();
    s.querySelector('.seatContribution')?.remove();
    s.querySelector('.connectionState')?.remove();
    const state=s.querySelector('.seatState');
    if(state)state.textContent='';
  });

  for(const p of ps||[]){
    const seat=document.querySelector('#seats .seat[data-seat-no="'+p.seat_no+'"]');
    if(!seat)continue;
    if(p.folded)seat.classList.add('foldedSeat');
    if(p.user_id===turnUser&&!p.folded)seat.classList.add('turnActive');

    const body=seat.querySelector('.seatBody')||seat;
    let contribution=seat.querySelector('.betBadge');
    if(!contribution){
      contribution=document.createElement('div');
      contribution.className='betBadge hide';
      const state=seat.querySelector('.seatState');
      if(state&&state.parentNode===body)body.insertBefore(contribution,state);else body.appendChild(contribution);
    }
    const paid=Number(p.contributed||0);
    contribution.innerHTML=(p.folded?'ВПАВ · ДАВ ':'ДАВ ')+'<b>'+paid+'</b> ◉';
    contribution.classList.toggle('hide',paid<=0);
    contribution.classList.toggle('foldedBet',!!p.folded);

    let connection=seat.querySelector('.connectionState');
    if(!connection){
      connection=document.createElement('div');
      connection.className='connectionState';
      body.appendChild(connection);
    }
    const cs=statusOf(p.user_id);
    connection.className='connectionState '+cs;
    connection.textContent=cs==='on'?'● онлайн':cs==='reconnecting'?'◐ перепідключення':'○ офлайн';

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

function updateSupportUi(g,ps,r,mySeat){
  mountGameInfo();
  const box=$('supportSummary');
  const mine=(ps||[]).find(p=>p.user_id===me?.id);
  const contributed=Number(mine?.contributed||0);
  const currentBet=Number(g?.current_bet||0);
  const need=Math.max(1,currentBet||Number(r?.ante||1));
  const tableStack=Number(mySeat?.table_chips||0);
  const maxBet=Math.max(1,Number(r?.ante||1)*100);
  const myTurn=g?.status==='playing'&&g.turn_user_id===me?.id&&!mine?.folded;
  const short=myTurn&&need>tableStack;

  if(box){
    box.innerHTML='<span>Банк: <b>'+Number(g?.pot||0)+' ◉</b></span>'+
      '<span>Ви дали: <b>'+contributed+' ◉</b></span>'+
      '<span class="supportNeed '+(myTurn&&need>0?'urgent ':'')+(short?'short':'')+'">Мінімум підтримати: <b>'+need+' ◉</b>'+(short?'<small>На столі '+tableStack+' ◉ — можна вскритися</small>':'')+'</span>'+
      '<span>Макс. ставка: <b>'+maxBet+' ◉</b></span>';
  }

  const call=document.querySelector('#gameActions button[data-action="call"]');
  if(call){
    call.textContent='ПІДТРИМАТИ '+need+' ◉';
    call.dataset.need=String(need);
    call.title=short?'Не вистачає '+(need-tableStack)+' ◉. Для повної підтримки монет недостатньо.':'';
  }

  const raise=document.querySelector('#gameActions button[data-action="raise"]');
  if(raise){
    raise.title='Максимальна ставка: '+maxBet+' ◉';
  }

  if($('bankInfo')){
    // Keep this line stable between realtime renders; turn-specific amount is already shown below.
    $('bankInfo').textContent='Ставка: '+currentBet+' ◉ · Макс: '+maxBet+' ◉';
  }
}

function paintOpenHands(rows){
  const dock=$('revealDock');
  const cardDock=$('cardDock');
  document.querySelectorAll('#seats .openHand').forEach(x=>x.remove());
  document.querySelectorAll('#seats .seat.revealPairSeat').forEach(x=>x.classList.remove('revealPairSeat'));
  if(!dock)return;

  const clean=(rows||[]).filter(r=>Array.isArray(r.cards)&&r.cards.length);
  const sig=JSON.stringify(clean.map(r=>[r.user_id,r.nickname,r.cards]));
  if(clean.length&&sig===lastOpenState&&dock.querySelectorAll('.revealDockRow').length===clean.length)return;
  lastOpenState=sig;

  if(!clean.length){
    dock.innerHTML='';
    dock.classList.add('hide');
    cardDock?.classList.remove('revealMode');
    return;
  }

  dock.innerHTML=clean.map(r=>
    '<div class="revealDockRow">'+
      '<span>'+dockEsc(r.user_id===me?.id?'ВИ':(r.nickname||'СУПЕРНИК'))+'</span>'+
      '<div class="revealDockCards">'+r.cards.map(card=>
        '<b class="'+((card.includes('♥')||card.includes('♦'))?'red':'')+'">'+dockEsc(card)+'</b>'
      ).join('')+'</div>'+
    '</div>'
  ).join('');
  dock.classList.remove('hide');
  cardDock?.classList.remove('hide');
  cardDock?.classList.add('revealMode');
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

    const central=window.TRYNKA_GAME_STATE;
    if(central?.room?.id&&Number(central.room.id)===Number(currentRoom)){
      applyCentralState(central);
      return;
    }

    // The protected room snapshot is the single source of truth.
    // If it is not available yet, leave the last known UI intact instead of
    // rebuilding the table from several independently-timed direct queries.
    return;
  }finally{busy=false}
}
function tickTimer(){
  const el=$('roundTurn');
  if(!el||!timerState)return;
  const left=Math.max(0,timerState.seconds-Math.floor((Date.now()-timerState.started)/1000));
  const text=(timerState.turnUser===me?.id?'ВАШ ХІД':'ХІД: '+timerState.nick.toUpperCase())+' · '+left+'с';
  if(text!==lastTimerText||el.textContent!==text){lastTimerText=text;el.textContent=text}
}
function applyCentralState(state){
  const r=state?.room,g=state?.round;
  if(!r)return;
  currentRoom=Number(r.id);
  mountStand();mountGameInfo();

  const presence=state.players||[];
  const ps=state.round_players||[];
  const mySeat=presence.find(x=>x.user_id===me?.id);
  const seated=mySeat?.seat_no!=null;
  const seatedCount=presence.filter(x=>x.seat_no!=null).length;
  if(lastSeated!==seated){lastSeated=seated;syncStand(seated)}

  if(r.game_status==='waiting'&&seatedCount<2){
    timerState=null;
    lastTurnNoticeKey='';
    paintOpenHands([]);
    paintSeats([],null,null,presence);
    if($('supportSummary'))$('supportSummary').innerHTML='';
    $('myHand')?.classList.remove('handRevealed');
    $('cardDock')?.classList.add('hide');
    return;
  }

  if(!g){
    timerState=null;
    paintOpenHands([]);
    return;
  }

  const lastAction=(state.latest_actions||[])[0]||null;
  const tablePs=g.status==='playing'?ps:[];
  paintSeats(tablePs,g.status==='playing'?g.turn_user_id:null,lastAction,presence);
  updateSupportUi(g,ps,r,mySeat);

  if(g.status==='playing'){
    notifyMyTurn(g);
    const turnP=presence.find(x=>x.user_id===g.turn_user_id);
    timerState={
      turnUser:g.turn_user_id,
      nick:g.turn_user_id===me?.id?'Ви':(turnP?.nickname||'Гравець'),
      started:new Date(g.turn_started_at||g.created_at).getTime(),
      seconds:Number(r.turn_seconds||30)
    };
  }else{
    timerState=null;
  }

  const openRows=[];
  const actor=ps.find(p=>p.user_id===g.reveal_actor);
  const target=ps.find(p=>p.user_id===g.reveal_target);
  const amRevealPlayer=me?.id===g.reveal_actor||me?.id===g.reveal_target;
  if(amRevealPlayer){
    const actorCards=Array.isArray(g.reveal_actor_cards)&&g.reveal_actor_cards.length
      ?g.reveal_actor_cards
      :(me?.id===g.reveal_actor&&Array.isArray(state.my_hand)?state.my_hand:[]);
    const targetCards=Array.isArray(g.reveal_cards)&&g.reveal_cards.length
      ?g.reveal_cards
      :(me?.id===g.reveal_target&&Array.isArray(state.my_hand)?state.my_hand:[]);
    const actorPresence=presence.find(p=>p.user_id===actor?.user_id);
    const targetPresence=presence.find(p=>p.user_id===target?.user_id);
    if(actor&&actorCards.length)openRows.push({user_id:actor.user_id,nickname:actorPresence?.nickname||'',cards:actorCards});
    if(target&&targetCards.length)openRows.push({user_id:target.user_id,nickname:targetPresence?.nickname||'',cards:targetCards});
  }
  paintOpenHands(openRows);

  const mine=ps.find(p=>p.user_id===me?.id);
  $('myHand')?.classList.toggle('handRevealed',amRevealPlayer&&openRows.some(x=>x.user_id===me?.id));
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
  mountStand();mountGameInfo();await getMe();
  document.addEventListener('pointerdown',primeTurnAudio,{once:true,passive:true});
  await syncUi();
  await touchPresence();
  document.addEventListener('trynka:game-state',e=>applyCentralState(e.detail));
  setInterval(syncUi,15000);
  setInterval(tickTimer,200);
  setInterval(touchPresence,10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)touchPresence()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
