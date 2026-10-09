import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg) throw new Error('Missing TRYNKA config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let me=null,lastResultId=null,lastFairRound=null,lastCommitRound=null,installPrompt=null,resultTimer=null;

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}

function mountFilters(){
  const area=$('tablesArea'),rooms=$('rooms');
  if(!area||!rooms||$('roomFilters'))return;
  const filters=document.createElement('div');
  filters.id='roomFilters';
  filters.className='roomFilters';
  filters.innerHTML=`
    <label class="roomSearch">🔎 <input id="roomFilterSearch" placeholder="Назва столу"></label>
    <select id="roomFilterAnte">
      <option value="all">Будь-яка ставка</option>
      <option value="10">до 10 ◉</option>
      <option value="50">до 50 ◉</option>
      <option value="100">до 100 ◉</option>
      <option value="500">до 500 ◉</option>
      <option value="500+">500+ ◉</option>
    </select>
    <select id="roomFilterPlayers">
      <option value="all">Будь-яка кількість</option>
      <option value="1">1 гравець</option>
      <option value="2">2 гравці</option>
      <option value="3-4">3–4 гравці</option>
      <option value="5+">5+ гравців</option>
    </select>
    <select id="roomFilterTurn">
      <option value="all">Будь-який таймер</option>
      <option value="15">15 секунд</option>
      <option value="30">30 секунд</option>
      <option value="45">45 секунд</option>
      <option value="60">60 секунд</option>
    </select>
    <label class="freeOnly"><input id="roomFilterFree" type="checkbox"> Є вільне місце</label>
    <span id="roomFilterCount"></span>
  `;
  rooms.before(filters);

  ['roomFilterSearch','roomFilterAnte','roomFilterPlayers','roomFilterTurn','roomFilterFree'].forEach(id=>{
    $(id)?.addEventListener(id==='roomFilterSearch'?'input':'change',applyFilters);
  });

  new MutationObserver(applyFilters).observe(rooms,{childList:true,subtree:false});
  applyFilters();
}

function applyFilters(){
  const rooms=$('rooms');if(!rooms)return;
  const search=($('roomFilterSearch')?.value||'').trim().toLowerCase();
  const ante=String($('roomFilterAnte')?.value||'all');
  const playersFilter=String($('roomFilterPlayers')?.value||'all');
  const turn=String($('roomFilterTurn')?.value||'all');
  const free=!!$('roomFilterFree')?.checked;
  let shown=0,total=0;

  rooms.querySelectorAll('.roomCard').forEach(card=>{
    total++;
    const name=String(card.dataset.name||'');
    const a=Number(card.dataset.ante||0);
    const t=String(card.dataset.turn||'');
    const players=Number(card.dataset.players||0),max=Number(card.dataset.max||0);
    let ok=!search||name.includes(search);
    if(ante!=='all')ok=ok&&(ante==='500+'?a>=500:a<=Number(ante));
    if(playersFilter!=='all'){
      if(playersFilter==='1')ok=ok&&players===1;
      else if(playersFilter==='2')ok=ok&&players===2;
      else if(playersFilter==='3-4')ok=ok&&players>=3&&players<=4;
      else if(playersFilter==='5+')ok=ok&&players>=5;
    }
    if(turn!=='all')ok=ok&&t===turn;
    if(free)ok=ok&&players<max&&String(card.dataset.status||'waiting')!=='playing';
    card.classList.toggle('filterHidden',!ok);
    if(ok)shown++;
  });

  if($('roomFilterCount'))$('roomFilterCount').textContent=total?shown+' з '+total:'';
}

function mountResultDialog(){
  if($('roundResultDialog'))return;
  const d=document.createElement('dialog');
  d.id='roundResultDialog';
  d.className='roundResultDialog';
  d.innerHTML=`
    <div class="roundResultCard">
      <button id="roundResultClose" class="roundResultClose">×</button>
      <div id="roundResultBody"></div>
    </div>
  `;
  document.body.appendChild(d);
  $('roundResultClose').onclick=()=>d.close();
}

function cardHtml(cards){
  if(!cards?.length)return '';
  return '<div class="resultCards">'+cards.map(card=>'<b class="'+(/[♥♦]/.test(card)?'red':'')+'">'+esc(card)+'</b>').join('')+'</div>';
}

async function hashFair(deck,nonce){
  if(!crypto?.subtle)return null;
  const raw=new TextEncoder().encode((deck||[]).join('|')+'|'+nonce);
  const buf=await crypto.subtle.digest('SHA-256',raw);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function verifyFairness(roundId){
  try{
    const {data,error}=await sb.rpc('get_round_fairness',{p_round:roundId});
    if(error||!data?.length)return {ok:false,label:'Перевірка недоступна'};
    const f=data[0],hash=await hashFair(f.deck_order,f.nonce);
    if(!hash)return {ok:false,label:'Браузер не підтримує перевірку'};
    return {
      ok:hash===f.commitment,
      label:hash===f.commitment?'Роздачу перевірено ✓':'Помилка перевірки роздачі',
      commitment:f.commitment
    };
  }catch{
    return {ok:false,label:'Перевірка недоступна'};
  }
}

async function showRoundResult(gr,roomId){
  mountResultDialog();
  const d=$('roundResultDialog'),body=$('roundResultBody');
  if(!d||!body)return;

  const [{data:players},{data:stacks},{data:opened},{data:ownHand},fair]=await Promise.all([
    sb.from('round_players')
      .select('user_id,seat_no,contributed,folded,revealed,profiles(nickname,avatar_key,frame_key)')
      .eq('round_id',gr.id)
      .order('seat_no'),
    sb.from('room_players').select('user_id,table_chips').eq('room_id',roomId),
    sb.rpc('get_revealed_hands',{p_room:roomId}).then(x=>x.error?{data:[]} : x),
    sb.from('room_hands').select('user_id,cards').eq('room_id',roomId).eq('user_id',me.id).maybeSingle(),
    verifyFairness(gr.id)
  ]);

  const stackMap=new Map((stacks||[]).map(x=>[x.user_id,Number(x.table_chips||0)]));
  const cardMap=new Map((opened||[]).map(x=>[x.user_id,x.cards]));
  if(ownHand?.user_id)cardMap.set(ownHand.user_id,ownHand.cards);

  const winner=(players||[]).find(p=>p.user_id===gr.winner_id);
  const mineWin=gr.winner_id===me.id;
  const draw=!gr.winner_id;
  const payout=Math.max(0,Number(gr.pot||0)-Number(gr.dealer_fee||0));

  const title=draw?'СВАРА':mineWin?'ВИ ПЕРЕМОГЛИ!':'ПЕРЕМІГ '+String(winner?.profiles?.nickname||'ГРАВЕЦЬ').toUpperCase();
  const icon=draw?'⚔️':mineWin?'🏆':'♠';

  const rows=(players||[]).map(p=>{
    const win=p.user_id===gr.winner_id;
    const cards=cardMap.get(p.user_id);
    return `<div class="resultPlayer ${win?'winner':''}">
      <div class="resultIdentity">
        <span class="resultAvatar playerFrame frame-${esc(p.profiles?.frame_key||'classic')}">${esc((window.TRYNKA_AVATAR_ICONS||{})[p.profiles?.avatar_key]||'♠')}</span>
        <div><b>${esc(p.profiles?.nickname||'Гравець')}${win?' <em>ПЕРЕМОЖЕЦЬ</em>':''}</b><small>Вніс: ${Number(p.contributed||0)} ◉ · залишок: ${stackMap.get(p.user_id)||0} ◉</small></div>
      </div>
      ${cards?cardHtml(cards):'<span class="cardsHidden">карти приховані</span>'}
    </div>`;
  }).join('');

  body.innerHTML=`
    <div class="resultHero">
      <span class="resultIcon">${icon}</span>
      <span class="eyebrow">РЕЗУЛЬТАТ РОЗДАЧІ</span>
      <h2>${esc(title)}</h2>
      <div class="resultMoney">
        <div><span>Банк</span><b>${Number(gr.pot||0)} ◉</b></div>
        <div><span>${draw?'Переноситься':'Виграш'}</span><b>${draw?Number(gr.pot||0):payout} ◉</b></div>
      </div>
    </div>
    <div class="resultPlayers">${rows}</div>
    <div class="fairResult ${fair.ok?'ok':'bad'}"><b>${fair.ok?'🔐':'⚠️'} ${esc(fair.label)}</b>${fair.commitment?'<small>hash '+esc(fair.commitment.slice(0,16))+'…</small>':''}</div>
  `;

  clearTimeout(resultTimer);
  if(!d.open)d.showModal();
  resultTimer=setTimeout(()=>{if(d.open)d.close()},4500);
}

function mountFairBadge(){
  const center=document.querySelector('#game .centerInfo');
  if(!center||$('fairDealBadge'))return;
  const b=document.createElement('button');
  b.id='fairDealBadge';
  b.className='fairDealBadge';
  b.type='button';
  b.textContent='🔒 Чесна роздача';
  b.onclick=()=>alert(b.title||'Сервер фіксує хеш колоди до початку роздачі, а після завершення браузер перевіряє його.');
  center.appendChild(b);
}

async function updateFairBadge(gr){
  mountFairBadge();
  const b=$('fairDealBadge');if(!b||!gr)return;
  if(gr.status==='finished'){
    if(lastFairRound===gr.id&&b.dataset.verified==='1')return;
    const fair=await verifyFairness(gr.id);
    b.classList.toggle('verified',fair.ok);
    b.classList.toggle('failed',!fair.ok);
    b.textContent=fair.ok?'✓ Чесна роздача':'⚠ Не вдалося перевірити';
    b.title=fair.ok?'Колоду було зафіксовано до роздачі й перевірено після завершення.':fair.label;
    b.dataset.verified=fair.ok?'1':'0';
    lastFairRound=gr.id;
    return;
  }

  if(lastCommitRound===gr.id)return;
  const {data,error}=await sb.rpc('get_round_commitment',{p_round:gr.id});
  if(!error&&data){
    b.classList.remove('verified','failed');
    b.dataset.verified='0';
    b.textContent='🔒 Чесна роздача · '+String(data).slice(0,8);
    b.title='Хеш колоди зафіксований до гри: '+data;
    lastCommitRound=gr.id;
  }
}

async function activeRoomId(){
  try{
    const saved=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');
    if(saved.view==='game'&&saved.roomId)return Number(saved.roomId);
  }catch{}
  const u=await getMe();if(!u)return null;
  const {data}=await sb.from('room_players').select('room_id').eq('user_id',u.id).order('joined_at',{ascending:false}).limit(1).maybeSingle();
  return data?.room_id||null;
}

async function experienceTick(state=null){
  const staleResult=$('roundResultDialog');
  if(staleResult?.open)staleResult.close();
  if(!$('game')||$('game').classList.contains('hide'))return;
  const u=await getMe();if(!u)return;
  const snap=state||window.TRYNKA_GAME_STATE;
  const gr=snap?.round;
  if(!gr)return;
  await updateFairBadge(gr);
  if(gr.status==='finished'&&gr.id!==lastResultId)lastResultId=gr.id;
}

function mountNotifyButton(){
  const host=document.querySelector('#game .gameTopActions');
  if(!host||$('turnNotifyBtn')||!('Notification'in window))return;
  const b=document.createElement('button');
  b.id='turnNotifyBtn';
  b.className='turnNotifyBtn';
  b.textContent=Notification.permission==='granted'?'🔔 Хід':'🔕 Хід';
  b.title='Сповіщення, коли настане ваш хід';
  b.onclick=async()=>{
    const p=await Notification.requestPermission();
    b.textContent=p==='granted'?'🔔 Хід':'🔕 Хід';
  };
  host.prepend(b);
}

function mountInstallButton(){
  const tiles=document.querySelector('#lobby .menuTiles');
  if(!tiles||$('installAppBtn'))return;
  const b=document.createElement('button');
  b.id='installAppBtn';
  b.className='installAppBtn hide';
  b.innerHTML='<span>⬇</span><b>Встановити</b><small>TRYNKA як застосунок</small>';
  b.onclick=async()=>{
    if(!installPrompt)return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt=null;
    b.classList.add('hide');
  };
  tiles.appendChild(b);
}

function setupPwa(){
  if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./sw.js?v=118').catch(()=>{});
  }
  mountInstallButton();
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    installPrompt=e;
    mountInstallButton();
    $('installAppBtn')?.classList.remove('hide');
  });
  window.addEventListener('appinstalled',()=>{$('installAppBtn')?.classList.add('hide')});
}

async function init(){
  window.TRYNKA_AVATAR_ICONS={spade:'♠',cards:'🃏',hat:'🎩',shield:'🛡️',trophy:'🏆',eagle:'🦅',fire:'🔥',star:'⭐',diamond:'💎',crown:'👑'};
  await getMe();
  mountFilters();
  mountResultDialog();
  mountFairBadge();
  mountNotifyButton();
  setupPwa();
  document.addEventListener('trynka:game-state',e=>experienceTick(e.detail));
  setInterval(()=>{mountFilters();mountFairBadge();mountNotifyButton();experienceTick()},30000);
  experienceTick();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
