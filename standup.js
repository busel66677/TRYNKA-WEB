import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);
let me=null,busy=false,standing=false,currentRoom=null,lastRoundKey='',timerText='';

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}
async function myRoom(){
  const u=await getMe(); if(!u)return null;
  const {data}=await sb.from('room_players').select('room_id,seat_no').eq('user_id',u.id).order('joined_at',{ascending:false}).limit(1).maybeSingle();
  return data||null;
}
function mountStand(){
  const actions=document.querySelector('.gameTopActions');
  if(!actions||$('standUpBtn'))return;
  const b=document.createElement('button');
  b.id='standUpBtn'; b.className='standUpBtn hide'; b.textContent='↑ Встати';
  actions.prepend(b);
  b.onclick=async()=>{
    if(standing)return;
    const rp=await myRoom(); if(!rp||rp.seat_no==null)return;
    standing=true;b.disabled=true;b.textContent='Встаємо…';
    const {error}=await sb.rpc('stand_up_from_table',{p_room:rp.room_id});
    standing=false;b.disabled=false;b.textContent='↑ Встати';
    if(error)return alert(error.message);
    await syncUi();
  };
}
async function syncStand(){
  const rp=await myRoom(),leave=$('leaveRoom'),stand=$('standUpBtn');
  const seated=rp?.seat_no!=null;
  if(stand)stand.classList.toggle('hide',!seated);
  if(leave){
    leave.classList.toggle('lobbyLocked',seated);
    leave.textContent=seated?'🔒 Спочатку встаньте':'← Лобі';
  }
}
function cleanSeatUi(){
  document.querySelectorAll('#seats .seat').forEach(s=>{
    s.classList.remove('turnActive','foldedSeat');
    s.querySelector('.openHand')?.remove();
  });
}
function setSeatMeta(seatNo,text){
  const seat=document.querySelector('#seats .seat.s'+seatNo);
  const meta=seat?.querySelector('.seatMeta');
  if(meta)meta.textContent=text;
}
function paintOpenHands(rows){
  document.querySelectorAll('.openHand').forEach(x=>x.remove());
  for(const r of rows||[]){
    const seat=document.querySelector('#seats .seat.s'+r.seat_no);
    if(!seat||!r.cards?.length)continue;
    const box=document.createElement('div'); box.className='openHand';
    for(const card of r.cards){
      const c=document.createElement('b'); c.textContent=card;
      if(card.includes('♥')||card.includes('♦'))c.classList.add('red');
      box.appendChild(c);
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
    await syncStand();
    if(!currentRoom){cleanSeatUi();return}

    const [{data:r},{data:g}]=await Promise.all([
      sb.from('rooms').select('turn_seconds,ante,game_status').eq('id',currentRoom).maybeSingle(),
      sb.from('game_rounds').select('id,status,pot,current_bet,round_no,turn_user_id,turn_started_at,created_at,result_note').eq('room_id',currentRoom).order('id',{ascending:false}).limit(1).maybeSingle()
    ]);

    if(!g){
      cleanSeatUi();
      if($('potBig'))$('potBig').textContent='БАНК: 0 ◉';
      return;
    }

    const {data:ps}=await sb.from('round_players').select('user_id,seat_no,contributed,folded,revealed').eq('round_id',g.id);
    cleanSeatUi();

    for(const p of ps||[]){
      const seat=document.querySelector('#seats .seat.s'+p.seat_no);
      if(!seat)continue;
      if(p.folded)seat.classList.add('foldedSeat');
      setSeatMeta(p.seat_no,(p.folded?'ВПАВ · ':'ДАВ: ')+Number(p.contributed||0)+' ◉');
    }

    if(g.status==='playing'){
      const turnPlayer=(ps||[]).find(p=>p.user_id===g.turn_user_id);
      const turnSeat=turnPlayer?.seat_no;
      const seat=turnSeat==null?null:document.querySelector('#seats .seat.s'+turnSeat);
      if(seat)seat.classList.add('turnActive');

      let nick='Гравець';
      if(g.turn_user_id===me?.id)nick='Ви';
      else{
        const {data:p}=await sb.from('profiles').select('nickname').eq('id',g.turn_user_id).maybeSingle();
        nick=p?.nickname||'Гравець';
      }
      const seconds=Number(r?.turn_seconds||30);
      const started=new Date(g.turn_started_at||g.created_at).getTime();
      const left=Math.max(0,seconds-Math.floor((Date.now()-started)/1000));
      timerText=(g.turn_user_id===me?.id?'ВАШ ХІД':'ХІД: '+nick.toUpperCase())+' · '+left+'с';

      if($('roundTurn'))$('roundTurn').textContent=timerText;
      if($('potBig'))$('potBig').textContent='БАНК: '+Number(g.pot||0)+' ◉';
      if($('bankInfo'))$('bankInfo').textContent='Поточна ставка: '+Number(g.current_bet||r?.ante||0)+' ◉';
      if($('countdown'))$('countdown').textContent='КОЛО '+Number(g.round_no||1);
      if($('turnStatus'))$('turnStatus').textContent='';
    }else{
      if($('potBig'))$('potBig').textContent='БАНК: '+Number(g.pot||0)+' ◉';
    }

    const {data:opened}=await sb.rpc('get_revealed_hands',{p_room:currentRoom});
    paintOpenHands(opened||[]);
    const mine=(ps||[]).find(p=>p.user_id===me?.id);
    $('myHand')?.classList.toggle('handRevealed',!!mine?.revealed);
    lastRoundKey=g.id+':'+g.status+':'+g.turn_user_id+':'+g.turn_started_at;
  }finally{busy=false}
}
function tickTimer(){
  if(!$('roundTurn')||!timerText)return;
  if($('roundTurn').textContent!==timerText)$('roundTurn').textContent=timerText;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('#leaveRoom'); if(!b)return;
  const rp=await myRoom();
  if(rp?.seat_no!=null){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    alert('Спочатку натисніть «Встати», а потім можна вийти в лобі.');
  }
},true);

async function init(){
  mountStand(); await getMe(); await syncUi();
  new MutationObserver(()=>{mountStand();syncUi()}).observe($('seats')||document.body,{childList:true,subtree:true});
  setInterval(syncUi,700);
  setInterval(tickTimer,150);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
