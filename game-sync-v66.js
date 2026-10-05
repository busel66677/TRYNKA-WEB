import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
window.TRYNKA_STABLE_TURN_UI=true;
let me=null,lastRoom=null,lastSig='',mismatch=0,channel=null,lastHeartbeat=0,lastForced=0,busy=false,lastSuccessAt=0,reconnecting=false,syncQueued=false,consecutiveErrors=0;

function roomId(){try{const s=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');return s.view==='game'&&s.roomId?Number(s.roomId):null}catch{return null}}
function mount(){
  const host=document.querySelector('#game .gameTopActions');if(!host)return;
  if(!$('netQualityBadge')){const x=document.createElement('span');x.id='netQualityBadge';x.className='netQualityBadge';x.textContent='● sync';host.prepend(x)}
  if(!$('diagTableBtn')){const b=document.createElement('button');b.id='diagTableBtn';b.className='diagTableBtn hide';b.textContent='🩺 Діагностика';host.prepend(b);b.onclick=openDiag}
  const table=document.querySelector('#game .table');
  if(table&&!$('reconnectShield')){
    const x=document.createElement('div');x.id='reconnectShield';x.className='reconnectShield hide';
    x.innerHTML='<b>↻ Відновлюємо гру…</b><span>Стан столу синхронізується із сервером</span>';
    table.appendChild(x);
  }
}
function setConnectionState(ok,label='',blocking=false){
  const shield=$('reconnectShield'),was=reconnecting;
  reconnecting=!ok;
  document.body.classList.toggle('gameReconnecting',!ok);
  if(shield){
    if(!ok&&label)shield.querySelector('b').textContent=label;
    shield.classList.toggle('hide',ok||!blocking);
  }
  if(!ok){
    document.querySelectorAll('#gameActions button[data-action]').forEach(b=>b.disabled=true);
  }else if(was){
    document.dispatchEvent(new CustomEvent('trynka:reconnected'));
  }
}
function renderLatency(ms){
  const b=$('netQualityBadge');if(!b)return;
  b.className='netQualityBadge '+(ms<400?'good':ms<1200?'mid':'bad');
  b.textContent=(ms<400?'● ':'◐ ')+Math.round(ms)+' мс';
}
function expectedTurnText(s){
  const g=s?.round;if(!g||g.status!=='playing')return '';
  const p=(s.players||[]).find(x=>x.user_id===g.turn_user_id);
  return g.turn_user_id===me?.id?'ВАШ ХІД':'ХІД: '+String(p?.nickname||'ГРАВЕЦЬ').toUpperCase();
}
function ensureSvaraBar(){
  const host=document.querySelector('#game .centerInfo');if(!host)return null;
  let bar=$('svaraJoinBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='svaraJoinBar';
    bar.className='svaraJoinBar hide';
    host.appendChild(bar);
  }
  return bar;
}
async function joinSvara(){
  const rid=roomId(),bar=$('svaraJoinBar');if(!rid)return;
  const b=bar?.querySelector('button');if(b)b.disabled=true;
  try{
    const {error}=await sb.rpc('join_svara',{p_room:rid});
    if(error)throw error;
    await sync(true);
  }catch(e){
    alert(e?.message||'Не вдалося увійти у свару');
    if(b)b.disabled=false;
  }
}
function patchSvara(s){
  const bar=ensureSvaraBar();if(!bar)return;
  const sv=s?.svara,r=s?.room,g=s?.round;
  if(!sv){
    bar.classList.add('hide');bar.innerHTML='';
    return;
  }
  const mePlayer=(s.players||[]).find(x=>x.user_id===me?.id);
  const myMember=(sv.members||[]).find(x=>x.user_id===me?.id);
  const fee=Number(sv.entry_fee||0);
  const bank=Number(r?.carried_pot||sv.original_pot||0);
  const left=Math.max(0,Math.ceil((new Date(sv.closes_at).getTime()-Date.now())/1000));
  const enough=Number(mePlayer?.table_chips||0)>=fee;

  if(myMember){
    bar.className='svaraJoinBar joined';
    bar.innerHTML='<b>🔥 СВАРА</b><span>'+(myMember.auto_member?'Ви залишаєтесь у сварі':'Ви зайшли у свару')+'</span><small>Банк '+bank+' ◉ · старт через '+left+'с</small>';
  }else{
    bar.className='svaraJoinBar';
    bar.innerHTML='<b>🔥 СВАРА</b><span>Вхід: '+fee+' ◉</span><button '+(enough?'':'disabled')+'>'+(enough?'УВІЙТИ У СВАРУ — '+fee+' ◉':'НЕ ВИСТАЧАЄ ФІШОК')+'</button><small>Банк '+bank+' ◉ · залишилось '+left+'с</small>';
    const b=bar.querySelector('button');if(b&&!b.disabled)b.onclick=joinSvara;
  }

  if($('potBig'))$('potBig').textContent='БАНК СВАРИ: '+bank+' ◉';
  if($('countdown'))$('countdown').textContent='СВАРА · '+left+'с';
  if($('turnStatus'))$('turnStatus').textContent=myMember?'Ви у сварі':'Можна зайти за половину банку';
}
function patchCritical(s){
  const g=s?.round,r=s?.room;if(!r)return;
  patchSvara(s);
  if(!g)return;
  if(!s?.svara&&$('potBig'))$('potBig').textContent='БАНК: '+Number(g.pot||0)+' ◉';
  if($('roundPot'))$('roundPot').textContent='Банк: '+Number(g.pot||0)+' ◉';
  if($('roundBet'))$('roundBet').textContent='Ставка: '+Number(g.current_bet||r.ante||0)+' ◉';
  if($('tableRoundLabel'))$('tableRoundLabel').textContent=(g.is_svara?'СВАРА · ':'Коло ')+Number(g.round_no||1);
  const mine=(s.round_players||[]).find(x=>x.user_id===me?.id);
  const canPlay=g.status==='playing'&&mine&&!mine.folded;
  const box=$('gameActions');if(box)box.classList.toggle('hide',!canPlay);
  if(canPlay){
    const myTurn=g.turn_user_id===me?.id,maxBet=Math.max(1,Number(r.ante||1)*100);
    document.querySelectorAll('#gameActions button[data-action]').forEach(b=>{
      let dis=!myTurn||b.classList.contains('actionLocked');
      if(b.dataset.action==='reveal'&&Number(g.round_no||1)<2)dis=true;
      if(b.dataset.action==='raise'&&Number(g.current_bet||0)>=maxBet)dis=true;
      b.disabled=dis;
    });
  }
  if(s.balance_check&&s.balance_check.ok===false){
    document.body.classList.add('chipBalanceWarning');
  }else document.body.classList.remove('chipBalanceWarning');
}
function sig(s){const g=s?.round||{},sv=s?.svara||{};return [g.id,g.status,g.turn_user_id,g.turn_started_at,g.round_no,g.current_bet,g.pot,g.is_svara,s?.room?.game_status,s?.room?.carried_pot,sv.source_round_id,sv.entry_fee,sv.closes_at,sv.joined,(sv.members||[]).length].join('|')}
async function sync(force=false){
  if($('game')?.classList.contains('hide'))return;
  if(busy){if(force)syncQueued=true;return}
  const rid=roomId();if(!rid||!me)return;
  busy=true;
  const t=performance.now();
  try{
    let timeoutId;
    const timeout=new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('snapshot timeout')),7000)});
    const result=await Promise.race([sb.rpc('get_room_game_snapshot',{p_room:rid}),timeout]);
    clearTimeout(timeoutId);
    const {data,error}=result||{};
    const ms=performance.now()-t;renderLatency(ms);
    if(error)throw error;
    if(roomId()!==rid)return;
    consecutiveErrors=0;
    lastSuccessAt=Date.now();
    setConnectionState(true);
    patchCritical(data);
    window.TRYNKA_GAME_STATE=data;
    const s=sig(data);
    if(s!==lastSig){lastSig=s;document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:data}))}
    const expected=expectedTurnText(data),actual=($('roundTurn')?.textContent||'').replace(/ · \d+с$/,'');
    const potExpected=data?.svara
      ?'БАНК СВАРИ: '+Number(data?.room?.carried_pot||data?.round?.pot||0)+' ◉'
      :'БАНК: '+Number(data?.round?.pot||0)+' ◉';
    const bad=(expected&&actual&&!actual.includes(expected))||($('potBig')&&$('potBig').textContent!==potExpected);
    mismatch=bad?mismatch+1:0;
    if((force||mismatch>=2)&&Date.now()-lastForced>2500){
      lastForced=Date.now();mismatch=0;await window.TRYNKA_FORCE_RENDER?.();
    }
    if(Date.now()-lastHeartbeat>9000){
      lastHeartbeat=Date.now();sb.rpc('touch_game_heartbeat',{p_room:rid}).catch(()=>{});
    }
    await maybeDiagButton(rid);
  }catch(e){
    consecutiveErrors++;
    renderLatency(9999);
    const offline=!navigator.onLine;
    const staleFor=lastSuccessAt?Date.now()-lastSuccessAt:Infinity;
    const blocking=offline||consecutiveErrors>=2||staleFor>10000;
    setConnectionState(false,offline?'⚠ Немає з’єднання':'↻ Відновлюємо гру…',blocking);
    try{await sb.rpc('log_client_error',{p_message:e?.message||String(e),p_context:'central-sync',p_room:rid})}catch{}
  }finally{
    busy=false;
    if(syncQueued){syncQueued=false;setTimeout(()=>sync(true),0)}
  }
}
async function maybeDiagButton(rid){
  const b=$('diagTableBtn');if(!b||b.dataset.room===String(rid))return;
  const [{data:r},{data:p}]=await Promise.all([
    sb.from('rooms').select('owner_id').eq('id',rid).maybeSingle(),
    sb.from('profiles').select('is_admin').eq('id',me.id).maybeSingle()
  ]);
  b.dataset.room=String(rid);b.classList.toggle('hide',!(r?.owner_id===me.id||p?.is_admin));
}
async function openDiag(){
  const rid=roomId();if(!rid)return;
  const {data,error}=await sb.rpc('get_room_diagnostics',{p_room:rid});if(error)return alert(error.message);
  let d=$('gameDiagDialog');
  if(!d){d=document.createElement('dialog');d.id='gameDiagDialog';d.className='gameDiagDialog';d.innerHTML='<div class="diagHead"><h2>Діагностика столу</h2><button id="diagClose">×</button></div><pre id="diagBody"></pre>';document.body.appendChild(d);$('diagClose').onclick=()=>d.close()}
  const g=data?.round||{},bc=data?.balance_check;
  const players=(data?.players||[]).map(p=>`${p.seat_no+1}. ${p.nickname} · ${p.table_chips} ◉ · heartbeat ${p.game_heartbeat_at?new Date(p.game_heartbeat_at).toLocaleTimeString('uk-UA'):'—'}`).join('\n');
  const logs=(data?.state_log||[]).slice(0,10).map(x=>`${new Date(x.created_at).toLocaleTimeString('uk-UA')} · ${x.event} · коло ${x.round_no} · банк ${x.pot}`).join('\n');
  $('diagBody').textContent=`Раунд: ${g.id||'—'}\nСтатус: ${g.status||'—'}\nХід: ${g.turn_user_id||'—'}\nКоло: ${g.round_no||'—'}\nБанк: ${g.pot||0}\nСтавка: ${g.current_bet||0}\nБаланс фішок: ${bc?(bc.ok?'OK':'ПОМИЛКА Δ '+bc.delta):'ще не перевірено'}\n\nГРАВЦІ\n${players}\n\nОСТАННІ СТАНИ\n${logs}`;
  d.showModal();
}
async function bindRealtime(rid){
  if(lastRoom===rid)return;lastRoom=rid;
  if(channel)await sb.removeChannel(channel);
  channel=sb.channel('central-'+rid)
    .on('postgres_changes',{event:'*',schema:'public',table:'game_rounds',filter:'room_id=eq.'+rid},()=>sync(true))
    .on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:'id=eq.'+rid},()=>sync(true))
    .subscribe();
}
async function tick(){
  mount();
  const rid=roomId();
  if(rid){
    const staleFor=lastSuccessAt?Date.now()-lastSuccessAt:0;
    if(staleFor>9000&&!busy)setConnectionState(false,'↻ Відновлюємо гру…',staleFor>14000);
    await bindRealtime(rid);
    await sync(false);
  }else if(reconnecting){
    setConnectionState(true);
  }
}
async function init(){
  const {data:{user}}=await sb.auth.getUser();me=user||null;if(!me)return;
  mount();await tick();setInterval(tick,1200);
  window.addEventListener('offline',()=>setConnectionState(false,'⚠ Немає з’єднання',true));
  window.addEventListener('online',()=>{setConnectionState(false,'↻ Відновлюємо гру…',false);sync(true)});
  document.addEventListener('trynka:reconnected',()=>sync(true));
  document.addEventListener('trynka:room-render-error',()=>sync(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync(true)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
