import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg) throw new Error('Missing TRYNKA config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let me=null,lastRoomId=null,lastActionsSig='',lastSeatMetaSig='',favoriteIds=new Set(),favLoadedAt=0,profileExtrasLoadedAt=0;

function navState(){
  try{return JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}')||{}}
  catch{return {}}
}
function visible(id){return !!$(id)&&!$(id).classList.contains('hide')}
function currentRoomId(){
  const s=navState();
  return s.view==='game'&&s.roomId?Number(s.roomId):null;
}

function applyUiScale(){
  document.body.classList.remove('trynkaCompact','trynkaLarge');
  const v=localStorage.getItem('trynkaUiScale')||'normal';
  if(v==='compact')document.body.classList.add('trynkaCompact');
  if(v==='large')document.body.classList.add('trynkaLarge');
}

function mountPrivateControls(){
  const form=$('createForm');
  if(form&&!$('privateRoomToggle')){
    const label=document.createElement('label');
    label.className='privateRoomToggleRow';
    label.innerHTML='<span><b>🔒 Приватний стіл</b><small>Друг зайде тільки за 6-значним кодом</small></span><input id="privateRoomToggle" type="checkbox">';
    const submit=form.querySelector('button');
    form.insertBefore(label,submit);
  }

  const area=$('tablesArea');
  if(area&&!$('privateJoinBar')){
    const bar=document.createElement('div');
    bar.id='privateJoinBar';
    bar.className='privateJoinBar';
    bar.innerHTML='<div><span class="eyebrow">PRIVATE TABLE</span><b>Приватний стіл</b><small>Введи код від друга</small></div><div class="privateCodeEntry"><input id="privateCodeInput" maxlength="6" autocomplete="off" placeholder="ABC123"><button id="privateCodeJoin">Увійти</button></div>';
    const rooms=$('rooms');
    area.insertBefore(bar,rooms);
    $('privateCodeJoin').onclick=joinPrivateByCode;
    $('privateCodeInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
    $('privateCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();joinPrivateByCode()}});
  }
}

async function joinPrivateByCode(){
  const input=$('privateCodeInput');
  const code=(input?.value||'').trim().toUpperCase();
  if(code.length!==6)return alert('Введи 6-значний код столу.');
  const {data,error}=await sb.rpc('join_room_by_code',{p_code:code});
  if(error)return alert(error.message);
  sessionStorage.setItem('trynka_nav_state_v1',JSON.stringify({view:'game',roomId:Number(data),spectator:false}));
  location.reload();
}

async function showPrivateCodeBadge(){
  const rid=currentRoomId();
  const host=document.querySelector('#game .gameIdentity');
  if(!rid||!host)return;
  let badge=$('privateRoomCodeBadge');
  const {data:r}=await sb.from('rooms').select('is_private,invite_code').eq('id',rid).maybeSingle();
  if(!r?.is_private||!r.invite_code){badge?.remove();return}
  if(!badge){
    badge=document.createElement('button');
    badge.id='privateRoomCodeBadge';
    badge.className='privateRoomCodeBadge';
    host.appendChild(badge);
  }
  badge.textContent='🔒 КОД '+r.invite_code;
  badge.title='Натисни, щоб скопіювати код';
  badge.onclick=async()=>{
    try{await navigator.clipboard.writeText(r.invite_code);badge.textContent='✓ СКОПІЙОВАНО';setTimeout(()=>badge.textContent='🔒 КОД '+r.invite_code,1300)}
    catch{alert('Код столу: '+r.invite_code)}
  };
}

async function loadFavorites(force=false){
  if(!me)return;
  if(!force&&Date.now()-favLoadedAt<5000)return;
  const {data}=await sb.from('room_favorites').select('room_id').eq('user_id',me.id);
  favoriteIds=new Set((data||[]).map(x=>Number(x.room_id)));
  favLoadedAt=Date.now();
}

async function toggleFavorite(roomId,btn){
  const {data,error}=await sb.rpc('toggle_room_favorite',{p_room:roomId});
  if(error)return alert(error.message);
  if(data)favoriteIds.add(roomId);else favoriteIds.delete(roomId);
  btn?.classList.toggle('on',!!data);
  btn?.setAttribute('aria-label',data?'Прибрати з улюблених':'Додати в улюблені');
  decorateRoomCards(true);
}

async function decorateRoomCards(force=false){
  if(!visible('lobby'))return;
  await loadFavorites(force);
  const rooms=$('rooms');if(!rooms)return;

  const cards=[...rooms.querySelectorAll('.roomCard')];
  for(const card of cards){
    const rid=Number(card.dataset.roomId||0);
    if(!rid)continue;
    let star=card.querySelector('.favoriteRoomBtn');
    if(!star){
      star=document.createElement('button');
      star.type='button';
      star.className='favoriteRoomBtn';
      star.innerHTML='★';
      star.onclick=e=>{e.preventDefault();e.stopPropagation();toggleFavorite(rid,star)};
      card.appendChild(star);
    }
    star.classList.toggle('on',favoriteIds.has(rid));
    star.title=favoriteIds.has(rid)?'Улюблений стіл':'Додати в улюблені';
    card.classList.toggle('favoriteRoom',favoriteIds.has(rid));
  }

  const current=[...rooms.querySelectorAll('.roomCard')];
  const sorted=[...current].sort((a,b)=>{
    const af=favoriteIds.has(Number(a.dataset.roomId||0))?1:0;
    const bf=favoriteIds.has(Number(b.dataset.roomId||0))?1:0;
    return bf-af;
  });
  const changed=current.some((x,i)=>x!==sorted[i]);
  if(changed)sorted.forEach(x=>rooms.appendChild(x));
}

function actionLabel(a){
  const amount=Number(a?.amount||0);
  if(a?.action==='call')return amount>0?'ПІДТРИМАВ +'+amount+' ◉':'ПІДТРИМАВ';
  if(a?.action==='raise')return 'ПІДНЯВ +'+amount+' ◉';
  if(a?.action==='reveal')return 'ВСКРИВСЯ';
  if(a?.action==='fold')return 'ВПАВ';
  if(a?.action==='timeout')return 'АВТО-ВПАВ';
  if(a?.action==='ante')return 'СТАВКА '+amount+' ◉';
  return String(a?.action||'').toUpperCase();
}
function actionClass(a){
  return ['raise','reveal','fold','timeout','call'].includes(a)?a:'other';
}

function mountActionStrip(){
  const wrap=document.querySelector('#game .tableWrap');
  if(!wrap||$('v35ActionStrip'))return;
  const strip=document.createElement('div');
  strip.id='v35ActionStrip';
  strip.className='v35ActionStrip';
  strip.innerHTML='<div class="v35ActionHead"><b>Останні ходи</b><span>останні 7 дій</span></div><div id="v35ActionRows"></div>';
  wrap.appendChild(strip);
}

async function syncActions(){
  const rid=currentRoomId();
  if(!rid||!visible('game'))return;
  mountActionStrip();

  const {data:gr}=await sb.from('game_rounds').select('id,status').eq('room_id',rid).order('id',{ascending:false}).limit(1).maybeSingle();
  if(!gr){$('v35ActionRows').innerHTML='<span class="v35NoActions">Роздача ще не почалась</span>';return}

  const {data:actions}=await sb.from('round_actions')
    .select('id,user_id,action,amount,created_at,profiles(nickname)')
    .eq('round_id',gr.id)
    .order('id',{ascending:false})
    .limit(30);

  const list=actions||[];
  const sig=list.slice(0,10).map(x=>x.id).join(',');
  lastActionsSig=sig;

  const meaningful=list.filter(a=>a.action!=='ante').slice(0,7);
  const rows=$('v35ActionRows');
  if(rows)rows.innerHTML=meaningful.length?meaningful.map(a=>
    '<div class="v35ActionRow '+actionClass(a.action)+'"><b>'+esc(a.profiles?.nickname||'Гравець')+'</b><span>'+esc(actionLabel(a))+'</span></div>'
  ).join(''):'<span class="v35NoActions">Ще немає ходів</span>';

  const latestByUser=new Map();
  for(const a of list){
    if(a.action==='ante'||latestByUser.has(a.user_id))continue;
    latestByUser.set(a.user_id,a);
  }

  const {data:players}=await sb.from('room_players').select('user_id,seat_no').eq('room_id',rid).not('seat_no','is',null);
  for(const p of players||[]){
    const seat=document.querySelector('#seats .seat.s'+p.seat_no);
    if(!seat)continue;
    let tag=seat.querySelector('.lastActionTag');
    const a=latestByUser.get(p.user_id);
    if(!a){tag?.remove();continue}
    if(!tag){tag=document.createElement('div');tag.className='lastActionTag';seat.appendChild(tag)}
    tag.className='lastActionTag '+actionClass(a.action);
    tag.textContent=actionLabel(a);
  }
}

function badgeFor(p){
  if(p.is_admin)return {key:'admin',text:'♛ АДМІН'};
  if(Number(p.xp||0)>=5000)return {key:'legend',text:'👑 ЛЕГЕНДА'};
  if(Number(p.wins||0)>=50)return {key:'champion',text:'🏅 ЧЕМПІОН'};
  if(Number(p.games_played||0)>=100)return {key:'veteran',text:'◆ ВЕТЕРАН'};
  return null;
}

async function syncSeatMeta(){
  const rid=currentRoomId();
  if(!rid||!visible('game'))return;
  const {data:players}=await sb.from('room_players')
    .select('user_id,seat_no,profiles(nickname,xp,level,wins,games_played,is_admin)')
    .eq('room_id',rid)
    .not('seat_no','is',null);

  const sig=JSON.stringify((players||[]).map(p=>[p.user_id,p.seat_no,p.profiles?.xp,p.profiles?.wins,p.profiles?.games_played,p.profiles?.level]));
  lastSeatMetaSig=sig;

  for(const p of players||[]){
    const seat=document.querySelector('#seats .seat.s'+p.seat_no);
    if(!seat)continue;
    seat.dataset.playerId=p.user_id;
    const body=seat.querySelector('.seatBody');
    if(!body)continue;
    body.querySelector('.playerTitleBadge')?.remove();
    const badge=badgeFor(p.profiles||{});
    if(badge){
      const el=document.createElement('div');
      el.className='playerTitleBadge '+badge.key;
      el.textContent=badge.text;
      const name=body.querySelector('.seatName');
      if(name)name.after(el);else body.prepend(el);
    }
  }
}

function avatarIcon(key){
  return ({spade:'♠',cards:'🃏',hat:'🎩',shield:'🛡️',trophy:'🏆',eagle:'🦅',fire:'🔥',star:'⭐',diamond:'💎',crown:'👑'})[key]||'♠';
}

function mountPlayerDialog(){
  if($('playerCardDialog'))return;
  const d=document.createElement('dialog');
  d.id='playerCardDialog';
  d.className='playerCardDialog';
  d.innerHTML='<div class="playerCardBox"><button id="playerCardClose" class="playerCardClose">×</button><div id="playerCardBody"></div></div>';
  document.body.appendChild(d);
  $('playerCardClose').onclick=()=>d.close();
  document.addEventListener('click',e=>{
    const avatar=e.target.closest('#game .seatAvatar');
    if(!avatar)return;
    const seat=avatar.closest('.seat');
    const uid=seat?.dataset.playerId;
    if(uid)openPlayerCard(uid);
  });
}

async function openPlayerCard(uid){
  const {data,error}=await sb.rpc('get_player_card',{p_user:uid});
  if(error)return alert(error.message);
  const p=data||{};
  const d=$('playerCardDialog'),body=$('playerCardBody');
  if(!d||!body)return;
  body.innerHTML='<div class="playerCardHero"><div class="playerCardAvatar frame-'+esc(p.frame_key||'classic')+'">'+esc(avatarIcon(p.avatar_key))+'</div><div><span class="eyebrow">ПРОФІЛЬ ГРАВЦЯ</span><h2>'+esc(p.nickname||'Гравець')+'</h2>'+(p.badge?'<b class="publicBadge">'+esc(p.badge)+'</b>':'')+'</div></div>'+
    '<div class="playerCardStats">'+
      '<div><b>'+Number(p.level||1)+'</b><span>Рівень</span></div>'+
      '<div><b>'+Number(p.xp||0).toLocaleString('uk-UA')+'</b><span>XP</span></div>'+
      '<div><b>'+Number(p.games||0)+'</b><span>Ігор</span></div>'+
      '<div><b>'+Number(p.wins||0)+'</b><span>Перемог</span></div>'+
      '<div><b>'+Number(p.win_rate||0)+'%</b><span>Вінрейт</span></div>'+
      '<div><b>🔥 '+Number(p.best_streak||0)+'</b><span>Краща серія</span></div>'+
    '</div>'+
    '<div class="playerRecordsMini"><span>🏦 Найбільший банк <b>'+Number(p.best_pot||0).toLocaleString('uk-UA')+' ◉</b></span><span>💰 Найбільший виграш <b>'+Number(p.best_win||0).toLocaleString('uk-UA')+' ◉</b></span><span>🏅 Досягнень <b>'+Number(p.achievements||0)+'</b></span></div>';
  d.showModal();
}

function mountSettings(){
  const profile=$('profile');
  if(!profile||$('gameSettingsV35'))return;
  const history=profile.querySelector('.profileHistoryGrid');
  const box=document.createElement('section');
  box.id='gameSettingsV35';
  box.className='gameSettingsV35 panel';
  box.innerHTML='<div class="settingsHead"><div><span class="eyebrow">НАЛАШТУВАННЯ</span><h2>Гра та сповіщення</h2></div></div>'+
    '<div class="settingsGrid">'+
      '<label><span>🔊 Звук ходу<small>Короткий сигнал, коли твій хід</small></span><input id="settingSound" type="checkbox"></label>'+
      '<label><span>📳 Вібрація<small>Вібрація на телефоні при ході</small></span><input id="settingVibrate" type="checkbox"></label>'+
      '<label><span>🔔 Системні сповіщення<small>Коли вкладка неактивна</small></span><input id="settingNotify" type="checkbox"></label>'+
      '<label><span>📐 Розмір інтерфейсу<small>Компактний / звичайний / великий</small></span><select id="settingUiScale"><option value="compact">Компактний</option><option value="normal">Звичайний</option><option value="large">Великий</option></select></label>'+
    '</div>';
  if(history)profile.insertBefore(box,history);else profile.appendChild(box);

  const sound=localStorage.getItem('trynkaSound')!=='off';
  const vibrate=localStorage.getItem('trynkaVibrate')!=='off';
  const notify=localStorage.getItem('trynkaNotify')!=='off';
  $('settingSound').checked=sound;
  $('settingVibrate').checked=vibrate;
  $('settingNotify').checked=notify;
  $('settingUiScale').value=localStorage.getItem('trynkaUiScale')||'normal';

  $('settingSound').onchange=e=>localStorage.setItem('trynkaSound',e.target.checked?'on':'off');
  $('settingVibrate').onchange=e=>localStorage.setItem('trynkaVibrate',e.target.checked?'on':'off');
  $('settingNotify').onchange=async e=>{
    if(e.target.checked&&'Notification'in window&&Notification.permission!=='granted'){
      const p=await Notification.requestPermission();
      if(p!=='granted'){e.target.checked=false;localStorage.setItem('trynkaNotify','off');return}
    }
    localStorage.setItem('trynkaNotify',e.target.checked?'on':'off');
  };
  $('settingUiScale').onchange=e=>{localStorage.setItem('trynkaUiScale',e.target.value);applyUiScale()};
}

function questCard(q){
  const progress=Math.min(Number(q.progress||0),Number(q.target||1));
  const pct=Math.min(100,Math.round(progress*100/Math.max(1,Number(q.target||1))));
  const ready=progress>=Number(q.target||1)&&!q.claimed;
  return '<div class="questCard '+(q.claimed?'claimed':ready?'ready':'')+'">'+
    '<div><b>'+esc(q.title)+'</b><small>'+(q.period==='daily'?'Щоденне':'Щотижневе')+' · +'+Number(q.xp_reward||0)+' XP</small></div>'+
    '<div class="questProgress"><i style="width:'+pct+'%"></i></div>'+
    '<span>'+progress+' / '+q.target+'</span>'+
    (q.claimed?'<em>ОТРИМАНО ✓</em>':ready?'<button data-claim-quest="'+esc(q.quest_key)+'">Забрати XP</button>':'')+
  '</div>';
}

async function syncProfileExtras(force=false){
  if(!visible('profile')||!me)return;
  if(!force&&Date.now()-profileExtrasLoadedAt<5000)return;
  profileExtrasLoadedAt=Date.now();
  mountSettings();

  const progress=$('playerProgress');
  if(!progress)return;
  let extras=$('profileExtrasV35');
  if(!extras){
    extras=document.createElement('div');
    extras.id='profileExtrasV35';
    extras.className='profileExtrasV35';
    progress.after(extras);
  }

  const [{data:quests},{data:p},{data:wins},{count:achCount}]=await Promise.all([
    sb.rpc('get_my_quests'),
    sb.from('profiles').select('best_win_streak,win_streak,xp,level').eq('id',me.id).single(),
    sb.from('game_history').select('pot,chip_change').eq('player_id',me.id).eq('result','win').order('pot',{ascending:false}).limit(100),
    sb.from('player_achievements').select('*',{count:'exact',head:true}).eq('user_id',me.id)
  ]);

  const bestPot=(wins||[]).reduce((m,x)=>Math.max(m,Number(x.pot||0)),0);
  const bestWin=(wins||[]).reduce((m,x)=>Math.max(m,Number(x.chip_change||0)),0);

  extras.innerHTML='<section class="profileRecords panel"><div class="extrasHead"><div><span class="eyebrow">РЕКОРДИ</span><h2>Особисті рекорди</h2></div></div><div class="recordGrid">'+
      '<div><span>🏦</span><b>'+bestPot.toLocaleString('uk-UA')+' ◉</b><small>Найбільший банк</small></div>'+
      '<div><span>💰</span><b>'+bestWin.toLocaleString('uk-UA')+' ◉</b><small>Найбільший виграш</small></div>'+
      '<div><span>🔥</span><b>×'+Number(p?.best_win_streak||0)+'</b><small>Краща серія</small></div>'+
      '<div><span>🏅</span><b>'+Number(achCount||0)+'</b><small>Досягнень</small></div>'+
    '</div></section>'+
    '<section class="questSection panel"><div class="extrasHead"><div><span class="eyebrow">QUESTS</span><h2>Завдання</h2></div><span>Нагорода тільки XP</span></div><div class="questGrid">'+(quests||[]).map(questCard).join('')+'</div></section>';

  extras.querySelectorAll('[data-claim-quest]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const {data,error}=await sb.rpc('claim_quest',{p_quest_key:b.dataset.claimQuest});
    if(error){b.disabled=false;return alert(error.message)}
    alert('Нагорода отримана. Тепер у тебе '+Number(data||0).toLocaleString('uk-UA')+' XP.');
    profileExtrasLoadedAt=0;
    await syncProfileExtras(true);
  });
}

async function tick(){
  if(!me)return;
  mountPrivateControls();
  mountPlayerDialog();
  applyUiScale();

  if(visible('lobby'))await decorateRoomCards();
  if(visible('profile'))await syncProfileExtras();

  if(visible('game')){
    const rid=currentRoomId();
    if(rid!==lastRoomId){lastRoomId=rid;lastActionsSig='';lastSeatMetaSig=''}
    await Promise.all([syncActions(),syncSeatMeta(),showPrivateCodeBadge()]);
  }
}

async function start(){
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  if(!me)return;
  applyUiScale();
  mountPrivateControls();
  mountPlayerDialog();
  await tick();
  setInterval(tick,2500);
  const rooms=$('rooms');
  if(rooms)new MutationObserver(()=>decorateRoomCards(false)).observe(rooms,{childList:true});
}

sb.auth.onAuthStateChange((_e,session)=>{
  me=session?.user||null;
  if(me)setTimeout(start,0);
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
