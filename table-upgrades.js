import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg)throw new Error('TRYNKA config missing');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);

let me=null,lastRoundId=null,lastActionId=null,lastRoomStatus=null,lastWinnerKey='',audioCtx=null,pollBusy=false,offlineAt=0;

function soundEnabled(){return localStorage.getItem('trynkaSound')!=='off'}
function primeAudio(){
  if(!soundEnabled())return;
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return;
    if(!audioCtx)audioCtx=new A();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }catch{}
}
function tone(freq=620,dur=.08,gain=.035,type='sine',delay=0){
  if(!soundEnabled())return;
  try{
    primeAudio();if(!audioCtx)return;
    const now=audioCtx.currentTime+delay;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,now);
    g.gain.setValueAtTime(.0001,now);
    g.gain.exponentialRampToValueAtTime(gain,now+.012);
    g.gain.exponentialRampToValueAtTime(.0001,now+dur);
    o.connect(g);g.connect(audioCtx.destination);
    o.start(now);o.stop(now+dur+.02);
  }catch{}
}
function playActionSound(action){
  if(action==='call'){tone(760,.07,.028,'triangle');tone(980,.06,.02,'triangle',.055)}
  else if(action==='raise'){tone(620,.08,.03,'triangle');tone(820,.08,.03,'triangle',.07);tone(1080,.09,.025,'triangle',.14)}
  else if(action==='fold'){tone(240,.12,.025,'sine')}
  else if(action==='reveal'){tone(520,.12,.03,'triangle');tone(760,.13,.035,'triangle',.09);tone(1040,.16,.03,'triangle',.18)}
}
function playDealSound(){
  [0,.26,.52].forEach((d,i)=>{tone(340+i*40,.11,.018,'triangle',d);tone(520+i*45,.08,.012,'sine',d+.045)});
}
function playWinSound(){
  tone(523,.13,.03,'triangle');tone(659,.13,.03,'triangle',.12);tone(784,.18,.035,'triangle',.24);
}

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}
function currentRoomId(){
  try{
    const s=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');
    if(s.view==='game'&&s.roomId)return Number(s.roomId);
  }catch{}
  return null;
}
function ensureNetToast(){
  let x=$('networkToast');
  if(x)return x;
  x=document.createElement('div');
  x.id='networkToast';
  x.className='networkToast hide';
  document.body.appendChild(x);
  return x;
}
function showNet(text,kind='ok'){
  const x=ensureNetToast();
  x.textContent=text;
  x.className='networkToast '+kind;
  clearTimeout(showNet.t);
  showNet.t=setTimeout(()=>x.classList.add('hide'),2600);
}
function ensureOutcome(){
  let x=$('roundOutcomeToast');
  const table=document.querySelector('#game .table');
  if(!table)return null;
  if(x&&x.parentElement!==table){x.remove();x=null}
  if(!x){
    x=document.createElement('div');
    x.id='roundOutcomeToast';
    x.className='roundOutcomeToast hide';
    table.appendChild(x);
  }
  return x;
}
function showOutcome(text,win=false){
  const x=ensureOutcome();if(!x)return;
  x.innerHTML='<span>♠</span><b>'+String(text||'')+'</b>';
  x.className='roundOutcomeToast '+(win?'win':'');
  clearTimeout(showOutcome.t);
  showOutcome.t=setTimeout(()=>x.classList.add('hide'),2900);
}
function clearDecor(){
  document.querySelectorAll('#seats .dealerSeatMarker,#seats .liveSeatStatus').forEach(x=>x.remove());
  document.querySelectorAll('#seats .seat').forEach(x=>x.classList.remove('dealerSeat'));
}
function addDealerMarker(ps,dealerUserId){
  if(!dealerUserId)return;
  const p=(ps||[]).find(x=>x.user_id===dealerUserId);if(!p)return;
  const seat=document.querySelector('#seats .seat.s'+p.seat_no);if(!seat)return;
  seat.classList.add('dealerSeat');
  const m=document.createElement('span');
  m.className='dealerSeatMarker';m.textContent='D';
  m.title='Дилер';
  seat.appendChild(m);
}
function statusLabel(action){
  return action==='call'?'ДАВ':action==='raise'?'ПІДНЯВ':action==='fold'||action==='timeout'?'ВПАВ':action==='reveal'?'ВСКРИВСЯ':'';
}
function paintStatuses(ps,gr,actions){
  const latest=new Map();
  for(const a of actions||[]){
    if(a.action==='ante')continue;
    if(!latest.has(a.user_id))latest.set(a.user_id,a);
  }
  for(const p of ps||[]){
    const seat=document.querySelector('#seats .seat.s'+p.seat_no);if(!seat)continue;
    const s=document.createElement('span');
    s.className='liveSeatStatus';
    if(p.folded){s.textContent='ВПАВ';s.classList.add('folded')}
    else if(gr?.status==='playing'&&gr.turn_user_id===p.user_id){s.textContent='ХІД';s.classList.add('turn')}
    else{
      const a=latest.get(p.user_id);
      s.textContent=statusLabel(a?.action);
      if(a?.action)s.classList.add(a.action);
    }
    if(s.textContent)seat.appendChild(s);
  }
}
function animateChip(ps,action){
  if(!action||!['call','raise'].includes(action.action)||Number(action.amount||0)<=0)return;
  const p=(ps||[]).find(x=>x.user_id===action.user_id);
  const seat=p&&document.querySelector('#seats .seat.s'+p.seat_no);
  const target=document.querySelector('#game .potPile');
  const table=document.querySelector('#game .table');
  if(!seat||!target||!table)return;
  const sr=seat.getBoundingClientRect(),tr=target.getBoundingClientRect(),br=table.getBoundingClientRect();
  const chip=document.createElement('i');
  chip.className='flyingBetChip';
  chip.textContent='◉';
  chip.style.left=(sr.left+sr.width/2-br.left-14)+'px';
  chip.style.top=(sr.top+sr.height/2-br.top-14)+'px';
  chip.style.setProperty('--chip-x',(tr.left+tr.width/2-(sr.left+sr.width/2))+'px');
  chip.style.setProperty('--chip-y',(tr.top+tr.height/2-(sr.top+sr.height/2))+'px');
  table.appendChild(chip);
  requestAnimationFrame(()=>chip.classList.add('fly'));
  setTimeout(()=>chip.remove(),780);
}
function updateCompactHistory(actions,profiles){
  const host=$('tableActionLog');if(!host)return;
  const names=new Map((profiles||[]).map(x=>[x.id,x.nickname]));
  const labels={call:'дав',raise:'підняв',fold:'впав',reveal:'вскрився',timeout:'час вийшов',ante:'ставка'};
  host.innerHTML=(actions||[]).slice(0,5).map(a=>
    '<div class="actionLogRow compact"><b>'+escapeHtml(names.get(a.user_id)||'Гравець')+'</b><span>'+escapeHtml(labels[a.action]||a.action)+(Number(a.amount||0)>0?' · '+Number(a.amount)+' ◉':'')+'</span></div>'
  ).join('')||'<div class="sideHistoryEmpty">Ходів ще немає</div>';
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function poll(){
  if(pollBusy||$('game')?.classList.contains('hide'))return;
  const roomId=currentRoomId();if(!roomId)return;
  pollBusy=true;
  try{
    await getMe();
    const [{data:room},{data:gr},{data:ps}]=await Promise.all([
      sb.from('rooms').select('id,game_status,countdown_started_at').eq('id',roomId).maybeSingle(),
      sb.from('game_rounds').select('id,status,turn_user_id,dealer_user_id,dealer_seat,winner_id,result_note,pot,dealer_fee,finished_at,created_at').eq('room_id',roomId).order('id',{ascending:false}).limit(1).maybeSingle(),
      sb.from('room_players').select('user_id,seat_no').eq('room_id',roomId).not('seat_no','is',null)
    ]);
    if(!room)return;

    if(room.game_status==='playing'&&lastRoomStatus&&lastRoomStatus!=='playing')playDealSound();
    lastRoomStatus=room.game_status;

    if(!gr){clearDecor();return}
    const [{data:rps},{data:actions}]=await Promise.all([
      sb.from('round_players').select('user_id,seat_no,folded').eq('round_id',gr.id),
      sb.from('round_actions').select('id,user_id,action,amount,created_at').eq('round_id',gr.id).order('id',{ascending:false}).limit(12)
    ]);

    const activeRps=(rps||[]).filter(rp=>(ps||[]).some(cur=>cur.user_id===rp.user_id&&cur.seat_no===rp.seat_no));
    clearDecor();
    if(gr.status==='playing'){
      addDealerMarker(activeRps,gr.dealer_user_id);
      paintStatuses(activeRps,gr,actions||[]);
    }

    const newest=(actions||[])[0];
    if(lastRoundId!==gr.id){
      lastRoundId=gr.id;
      lastActionId=newest?.id||null;
    }else if(newest?.id&&newest.id!==lastActionId){
      lastActionId=newest.id;
      animateChip(activeRps,newest);
      playActionSound(newest.action);
    }

    const ids=[...new Set((actions||[]).map(a=>a.user_id))];
    let profiles=[];
    if(ids.length){
      const {data}=await sb.from('profiles').select('id,nickname').in('id',ids);
      profiles=data||[];
    }
    updateCompactHistory(actions||[],profiles);

    if(gr.status==='finished'&&gr.finished_at){
      const age=Date.now()-new Date(gr.finished_at).getTime();
      const key=gr.id+':'+gr.finished_at;
      if(age<6000&&key!==lastWinnerKey){
        lastWinnerKey=key;
        let text=gr.result_note==='Свара'?'СВАРА · БАНК '+Number(gr.pot||0)+' ◉ ПЕРЕХОДИТЬ ДАЛІ':(gr.result_note||'Роздачу завершено');
        let win=false;
        if(gr.winner_id){
          const {data:w}=await sb.from('profiles').select('nickname').eq('id',gr.winner_id).maybeSingle();
          const payout=Math.max(0,Number(gr.pot||0)-Number(gr.dealer_fee||0));
          text=(gr.winner_id===me?.id?'ВИ ПЕРЕМОГЛИ!':'ПЕРЕМІГ '+String(w?.nickname||'ГРАВЕЦЬ').toUpperCase())+' · +'+payout+' ◉';
          win=gr.winner_id===me?.id;
        }
        showOutcome(text,win);
        if(win)playWinSound();
      }
    }
  }catch(e){
    console.error('table upgrades',e);
  }finally{pollBusy=false}
}

window.addEventListener('offline',()=>{
  offlineAt=Date.now();
  showNet('Немає з’єднання. Повертаємо вас у гру…','bad');
});
window.addEventListener('online',async()=>{
  if(!offlineAt)return;
  showNet('З’єднання відновлено. Повертаємось у гру…','ok');
  offlineAt=0;
  try{
    await sb.auth.refreshSession();
    await poll();
    document.dispatchEvent(new CustomEvent('trynka:reconnected'));
  }catch(e){
    console.warn('Reconnect refresh failed',e);
    showNet('З’єднання є. Оновлюємо стан столу…','ok');
    setTimeout(poll,800);
  }
});
document.addEventListener('pointerdown',primeAudio,{once:true,passive:true});

setInterval(poll,1800);
poll();
