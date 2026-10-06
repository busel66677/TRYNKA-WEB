import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;
if(!cfg||cfg.supabaseUrl.includes('PASTE_')){document.body.innerHTML='<main><div class="panel"><h2>TRYNKA ONLINE</h2><p>Немає конфігурації Supabase.</p></div></main>';throw new Error('Supabase config missing')}
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
let user=null,profile=null,currentRoom=null,channel=null,lobbyChannel=null,countdownTimer=null,heartbeat=null,dealTimer=null,currentRound=null,turnTimer=null,nextDealTimer=null,lastActionId=null,spectatorMode=false;
let roomRenderVersion=0,lastSeatSignature='',messagesLoadedRoom=null,lastHandPaint='',handPullKey='',handPullY=[0,0,0],ownDealActive=false,ownDealtCount=3,buyInResolve=null,gameActionBusy=false;
let roomRefreshTimer=null,lobbyRefreshTimer=null,roomRenderBusy=false,roomRenderQueued=false,lastTableHistoryAt=0,lastHistoryRoundId=null;
const $=id=>document.getElementById(id), sections=['login','lobby','profile','create','game'];
window.addEventListener('trynka:deal-start',()=>{
  ownDealActive=true;ownDealtCount=0;lastHandPaint='';handPullY=[0,0,0];
  const h=$('myHand');if(h)h.innerHTML='';
  $('gameActions')?.classList.add('dealLocked');
});
window.addEventListener('trynka:own-card',e=>{
  ownDealActive=true;ownDealtCount=Math.max(0,Math.min(3,Number(e.detail?.count||0)));lastHandPaint='';
  renderHand();
});
window.addEventListener('trynka:deal-end',()=>{
  ownDealActive=false;ownDealtCount=3;lastHandPaint='';
  $('gameActions')?.classList.remove('dealLocked');
  renderHand();
});
const NAV_STATE_KEY='trynka_nav_state_v1';
function saveNavState(id){
  if(!user||!['lobby','profile','create','game'].includes(id))return;
  const state={view:id};
  if(id==='game'&&currentRoom){state.roomId=currentRoom;state.spectator=!!spectatorMode;}
  sessionStorage.setItem(NAV_STATE_KEY,JSON.stringify(state));
}
function clearNavState(){sessionStorage.removeItem(NAV_STATE_KEY)}
function readNavState(){
  try{return JSON.parse(sessionStorage.getItem(NAV_STATE_KEY)||'{}')||{}}
  catch{return {}}
}
function show(id){sections.forEach(x=>$(x)?.classList.add('hide'));$(id)?.classList.remove('hide');saveNavState(id)}
async function restoreNavState(){
  const state=readNavState();
  if(state.view==='game'&&state.roomId){
    const [{data:member},{data:watcher}]=await Promise.all([
      sb.from('room_players').select('room_id').eq('room_id',state.roomId).eq('user_id',user.id).maybeSingle(),
      sb.from('room_spectators').select('room_id').eq('room_id',state.roomId).eq('user_id',user.id).maybeSingle()
    ]);
    if(member||watcher){await openRoom(Number(state.roomId));return}
  }
  if(state.view==='profile'){await renderProfile();show('profile');return}
  if(state.view==='create'){show('create');return}
  show('lobby');
}
function authView(w){$('authLogin').classList.toggle('hide',w!=='login');$('authRegister').classList.toggle('hide',w!=='register')}
const LOGIN_GUARD_KEY='trynka_login_guard_v1';
function readLoginGuard(){
  try{
    const s=JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY)||'{}');
    if(!s.lastFail||Date.now()-Number(s.lastFail)>15*60*1000)return {fails:0,lastFail:0,blockedUntil:0};
    return {fails:Number(s.fails||0),lastFail:Number(s.lastFail||0),blockedUntil:Number(s.blockedUntil||0)};
  }catch{return {fails:0,lastFail:0,blockedUntil:0}}
}
function loginWaitSeconds(){
  const s=readLoginGuard();
  return Math.max(0,Math.ceil((s.blockedUntil-Date.now())/1000));
}
function noteLoginFailure(){
  const s=readLoginGuard();
  s.fails+=1;s.lastFail=Date.now();
  const wait=s.fails>=10?15*60:s.fails>=8?5*60:s.fails>=5?60:s.fails>=3?5:0;
  s.blockedUntil=Date.now()+wait*1000;
  localStorage.setItem(LOGIN_GUARD_KEY,JSON.stringify(s));
  return wait;
}
function clearLoginGuard(){localStorage.removeItem(LOGIN_GUARD_KEY)}
function strongPasswordError(password){
  if(password.length<10)return 'Пароль має містити щонайменше 10 символів.';
  if(!/[a-zа-яіїєґ]/i.test(password)||!/[A-ZА-ЯІЇЄҐ]/.test(password))return 'Додай до пароля великі й малі літери.';
  if(!/\d/.test(password))return 'Додай до пароля хоча б одну цифру.';
  const low=password.toLowerCase();
  if(['1234567890','qwerty12345','password123','пароль12345'].some(x=>low.includes(x)))return 'Цей пароль надто простий. Вигадай інший.';
  return '';
}
function ensureLoginSecurityNote(){
  const form=$('loginForm');
  if(!form||$('loginSecurityNote'))return;
  const note=document.createElement('small');
  note.id='loginSecurityNote';
  note.className='loginSecurityNote';
  note.textContent='Захист входу: обмеження повторних невдалих спроб.';
  form.appendChild(note);
}

const AVATAR_ICONS={spade:'♠',cards:'🃏',hat:'🎩',shield:'🛡️',trophy:'🏆',eagle:'🦅',fire:'🔥',star:'⭐',diamond:'💎',crown:'👑'};
const FRAME_NAMES={classic:'Класика',bronze:'Бронза',silver:'Срібло',gold:'Золото',fire:'Вогонь',emerald:'Смарагд',royal:'Королівська'};
function avatarIcon(key){return AVATAR_ICONS[key]||'♠'}
function frameClass(key){return 'frame-'+(FRAME_NAMES[key]?key:'classic')}
function paintProfileFrame(){
  const a=$('profileAvatar');if(!a)return;
  a.className='avatar playerFrame '+frameClass(profile?.frame_key||'classic');
}
async function chooseAvatar(key){
  const {error}=await sb.rpc('set_player_avatar',{p_avatar_key:key});
  if(error)return alert(error.message);
  profile.avatar_key=key;
  if($('profileAvatar'))$('profileAvatar').textContent=avatarIcon(key);
  await renderAchievements();
}
async function chooseFrame(key){
  const {error}=await sb.rpc('set_player_frame',{p_frame_key:key});
  if(error)return alert(error.message);
  profile.frame_key=key;
  paintProfileFrame();
  await renderAchievements();
}

function ensureLobbySupport(){
  const shell=document.querySelector('#lobby .lobbyShell');
  if(!shell||$('lobbySupportFooter'))return;
  const footer=document.createElement('div');
  footer.id='lobbySupportFooter';
  footer.className='lobbySupportFooter';
  footer.innerHTML='<div><span class="supportIcon">V</span><div><b>Потрібна допомога?</b><small>Адміністратор TRYNKA</small></div></div>'+
    '<a href="viber://chat?number=%2B380979802028" class="viberAdminLink"><span>Viber</span><b>097 980 20 28</b></a>';
  shell.appendChild(footer);
}

function ensureProgressUi(){
  const profileSection=$('profile');
  const statrow=profileSection?.querySelector('.statrow');
  if(!profileSection||!statrow)return;
  if(!$('playerProgress')){
    const card=document.createElement('div');
    card.id='playerProgress';
    card.className='playerProgress';
    card.innerHTML='<div class="levelBlock">'+
      '<div class="levelBadge"><span>LVL</span><b id="profileLevel">1</b></div>'+
      '<div class="xpBlock"><div><b id="profileXp">0 XP</b><span id="profileXpNext">до 2 рівня: 100 XP</span></div><div class="xpTrack"><i id="profileXpFill"></i></div></div>'+
    '</div>'+
    '<div class="avatarRewardHead"><div><span class="eyebrow">АВАТАРИ</span><h2>Відкривай за досягнення</h2></div><small>Обраний аватар видно за столом</small></div>'+
    '<div id="avatarPicker" class="avatarPicker"></div>'+
    '<div class="avatarRewardHead frameRewardHead"><div><span class="eyebrow">РАМКИ</span><h2>Стиль профілю</h2></div><small>Рамка також показується за столом</small></div>'+
    '<div id="framePicker" class="framePicker"></div>'+
    '<div class="achievementHead"><div><span class="eyebrow">ДОСЯГНЕННЯ</span><h2>Колекція гравця</h2></div><b id="achievementCount">0/0</b></div>'+
    '<div id="achievementGrid" class="achievementGrid"></div>';
    statrow.after(card);
  }
}

function achievementMetricValue(a,p){
  if(a.metric==='games')return Number(p.games_played||0);
  if(a.metric==='wins')return Number(p.wins||0);
  if(a.metric==='streak')return Number(p.best_win_streak||0);
  if(a.metric==='xp')return Number(p.xp||0);
  if(a.metric==='level')return Number(p.level||1);
  return 0;
}

async function renderAchievements(){
  ensureProgressUi();
  const [{data:defs},{data:unlocks}]=await Promise.all([
    sb.from('achievements').select('key,title,description,icon,metric,target,sort_order,avatar_key,avatar_icon,frame_key,frame_label').order('sort_order'),
    sb.from('player_achievements').select('achievement_key,unlocked_at').eq('user_id',user.id)
  ]);

  const unlocked=new Map((unlocks||[]).map(x=>[x.achievement_key,x]));
  const grid=$('achievementGrid');
  const picker=$('avatarPicker');
  if(!grid)return;

  if(picker){
    const unlockedAvatars=(defs||[]).filter(a=>unlocked.has(a.key)&&a.avatar_key);
    const choices=[{avatar_key:'spade',avatar_icon:'♠',title:'Класика'},...unlockedAvatars];
    picker.innerHTML=choices.map(a=>{
      const selected=(profile.avatar_key||'spade')===a.avatar_key;
      return '<button type="button" class="avatarChoice '+(selected?'selected':'')+'" data-avatar-key="'+esc(a.avatar_key)+'" title="'+esc(a.title||'Аватар')+'">'+
        '<span>'+esc(a.avatar_icon||avatarIcon(a.avatar_key))+'</span><small>'+(selected?'ОБРАНО':'ВИБРАТИ')+'</small>'+
      '</button>';
    }).join('');
    picker.querySelectorAll('[data-avatar-key]').forEach(b=>b.onclick=()=>chooseAvatar(b.dataset.avatarKey));
  }

  const framePicker=$('framePicker');
  if(framePicker){
    const unlockedFrames=(defs||[]).filter(a=>unlocked.has(a.key)&&a.frame_key);
    const frames=[{frame_key:'classic',frame_label:'Класика'},...unlockedFrames];
    const unique=[];
    const seen=new Set();
    for(const a of frames){if(!seen.has(a.frame_key)){seen.add(a.frame_key);unique.push(a)}}
    framePicker.innerHTML=unique.map(a=>{
      const selected=(profile.frame_key||'classic')===a.frame_key;
      return '<button type="button" class="frameChoice '+frameClass(a.frame_key)+' '+(selected?'selected':'')+'" data-frame-key="'+esc(a.frame_key)+'">'+
        '<span class="frameDemo">♠</span><small>'+(selected?'ОБРАНО':esc(a.frame_label||FRAME_NAMES[a.frame_key]||'Рамка'))+'</small>'+
      '</button>';
    }).join('');
    framePicker.querySelectorAll('[data-frame-key]').forEach(b=>b.onclick=()=>chooseFrame(b.dataset.frameKey));
  }

  grid.innerHTML=(defs||[]).map(a=>{
    const done=unlocked.has(a.key);
    const val=achievementMetricValue(a,profile);
    const progress=Math.min(100,Math.round((val/Math.max(1,Number(a.target||1)))*100));
    return '<div class="achievementCard '+(done?'unlocked':'locked')+'">'+
      '<div class="achievementIcon">'+esc(a.icon||'★')+'</div>'+
      '<div class="achievementText"><b>'+esc(a.title)+'</b><span>'+esc(a.description)+'</span>'+
      (a.avatar_key?'<div class="achievementAvatarReward"><span>'+esc(a.avatar_icon||avatarIcon(a.avatar_key))+'</span> Аватар у нагороду</div>':'')+
      (a.frame_key?'<div class="achievementAvatarReward frameRewardMini"><span>◈</span> '+esc(a.frame_label||'Рамка у нагороду')+'</div>':'')+
      '<div class="achievementProgress"><i style="width:'+progress+'%"></i></div>'+
      '<small>'+(done?'ВІДКРИТО ✓':Math.min(val,a.target)+' / '+a.target)+'</small></div>'+
    '</div>';
  }).join('')||'<p class="emptyHistory">Досягнення готуються.</p>';

  if($('achievementCount'))$('achievementCount').textContent=unlocked.size+'/'+(defs||[]).length;
}

function ensureBuyInDialog(){
  if($('buyInDialog'))return;
  const d=document.createElement('dialog');
  d.id='buyInDialog';
  d.className='buyInDialog';
  d.innerHTML='<form method="dialog" class="buyInCard">'+
    '<div class="buyInHead"><div><span class="eyebrow">TABLE BUY-IN</span><h3>Сісти за стіл</h3></div><button type="button" id="buyInClose" class="buyInClose">×</button></div>'+
    '<div class="buyInWallet"><span>У гаманці</span><b id="buyInWallet">0 ◉</b></div>'+
    '<label>Скільки монет взяти за стіл?<input id="buyInAmount" type="number" inputmode="numeric" min="1" step="1"></label>'+
    '<div class="buyInQuick"><button type="button" data-buyin-part="0.25">25%</button><button type="button" data-buyin-part="0.5">50%</button><button type="button" data-buyin-part="1">ВСЕ</button></div>'+
    '<small id="buyInHint">Мінімум: 1 ◉</small>'+
    '<div class="buyInActions"><button type="button" id="buyInCancel">Скасувати</button><button type="button" id="buyInConfirm">Сісти за стіл</button></div>'+
  '</form>';
  document.body.appendChild(d);

  const cancel=()=>{if(buyInResolve){const r=buyInResolve;buyInResolve=null;r(null)};d.close()};
  $('buyInClose').onclick=cancel;
  $('buyInCancel').onclick=cancel;
  d.addEventListener('cancel',e=>{e.preventDefault();cancel()});

  d.querySelectorAll('[data-buyin-part]').forEach(b=>b.onclick=()=>{
    const max=Number($('buyInAmount').max||0),min=Number($('buyInAmount').min||1),part=Number(b.dataset.buyinPart||1);
    $('buyInAmount').value=String(Math.max(min,Math.floor(max*part)));
  });

  $('buyInConfirm').onclick=()=>{
    const input=$('buyInAmount'),v=Math.trunc(Number(input.value||0)),min=Number(input.min||1),max=Number(input.max||0);
    if(v<min||v>max){$('buyInHint').textContent='Вкажи суму від '+min+' до '+max+' ◉';$('buyInHint').classList.add('bad');return}
    if(buyInResolve){const r=buyInResolve;buyInResolve=null;d.close();r(v)}
  };
}
async function askBuyIn(room){
  ensureBuyInDialog();
  const {data:p}=await sb.from('profiles').select('chips').eq('id',user.id).single();
  const wallet=Number(p?.chips||0),min=Math.max(1,Number(room?.ante||1));
  if(wallet<min){alert('Недостатньо монет. Для цього столу потрібно мінімум '+min+' ◉');return null}
  $('buyInWallet').textContent=wallet.toLocaleString('uk-UA')+' ◉';
  $('buyInAmount').min=String(min);
  $('buyInAmount').max=String(wallet);
  $('buyInAmount').value=String(Math.min(wallet,Math.max(min,Math.floor(wallet/2))));
  $('buyInHint').textContent='Мінімум для цього столу: '+min+' ◉ · максимум: '+wallet.toLocaleString('uk-UA')+' ◉';
  $('buyInHint').classList.remove('bad');
  const d=$('buyInDialog');
  d.showModal();
  return await new Promise(resolve=>{buyInResolve=resolve});
}

$('showRegister').onclick=()=>authView('register'); $('showLogin').onclick=()=>authView('login');ensureLoginSecurityNote();
let authRestoring=false,lastAuthUserId=null;
async function acceptSession(session,{restore=true}={}){
  if(!session?.user)return false;
  if(lastAuthUserId===session.user.id&&profile){
    user=session.user;
    return true;
  }
  if(authRestoring)return true;
  authRestoring=true;
  try{
    user=session.user;
    lastAuthUserId=user.id;
    await loadProfile();
    if(restore)await restoreNavState();
    return true;
  }finally{authRestoring=false}
}
async function boot(){
  const {data,error}=await sb.auth.getSession();
  if(!error&&data?.session){await acceptSession(data.session,{restore:true});return}
  // Do not erase navigation state here: INITIAL_SESSION can arrive just after page load.
  show('login');authView('login');
}
sb.auth.onAuthStateChange((event,session)=>{
  if(session?.user&&(event==='INITIAL_SESSION'||event==='SIGNED_IN'||event==='TOKEN_REFRESHED')){
    setTimeout(()=>acceptSession(session,{restore:true}),0);
    return;
  }
  if(event==='SIGNED_OUT'&&!session){
    lastAuthUserId=null;user=null;profile=null;
    $('logoutBtn')?.classList.add('hide');$('profileBtn')?.classList.add('hide');
    $('me').textContent='Гість';show('login');authView('login');
  }
});
$('registerForm').onsubmit=async e=>{e.preventDefault();const email=$('regEmail').value.trim().toLowerCase(),nickname=$('regNick').value.trim(),password=$('regPassword').value,password2=$('regPassword2').value;if(password!==password2)return alert('Паролі не співпадають');const pwErr=strongPasswordError(password);if(pwErr)return alert(pwErr);const {data,error}=await sb.auth.signUp({email,password,options:{data:{nickname}}});if(error)return alert('Не вдалося створити акаунт. Перевір дані та спробуй ще раз.');if(data.session){user=data.user;await sb.from('profiles').upsert({id:user.id,nickname});await loadProfile()}else{alert('Перевір пошту та підтвердь реєстрацію.');authView('login');$('loginEmail').value=email}};
$('loginForm').onsubmit=async e=>{e.preventDefault();const wait=loginWaitSeconds();if(wait>0)return alert('Забагато невдалих спроб. Спробуй ще раз через '+wait+' с.');const email=$('loginEmail').value.trim().toLowerCase(),password=$('loginPassword').value;const {data,error}=await sb.auth.signInWithPassword({email,password});if(error){const delay=noteLoginFailure();await new Promise(r=>setTimeout(r,700));return alert('Не вдалося увійти. Перевір дані та підтвердження пошти.'+(delay?' Наступна спроба через '+delay+' с.':''))}clearLoginGuard();user=data.user;let {data:p}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();if(!p)await sb.from('profiles').upsert({id:user.id,nickname:user.user_metadata?.nickname||email.split('@')[0].slice(0,20)});await acceptSession(data.session,{restore:false})};
$('logoutBtn').onclick=async()=>{if(currentRoom)await leaveRoom();clearInterval(heartbeat);clearNavState();await sb.auth.signOut();user=profile=null;$('logoutBtn').classList.add('hide');$('profileBtn').classList.add('hide');$('me').textContent='Гість';show('login')};
async function loadProfile(){const {data}=await sb.from('profiles').select('*').eq('id',user.id).single();profile=data;if(!profile)return;const {data:mod}=await sb.from('player_moderation').select('banned_until,reason').eq('user_id',user.id).maybeSingle();if(mod?.banned_until&&new Date(mod.banned_until)>new Date()){await sb.auth.signOut();alert('Акаунт тимчасово заблоковано'+(mod.reason?'\nПричина: '+mod.reason:''));show('login');return;} $('me').textContent=profile.nickname;$('logoutBtn').classList.remove('hide');$('profileBtn').classList.remove('hide');await pingOnline();clearInterval(heartbeat);heartbeat=setInterval(pingOnline,30000);show('lobby');ensureLobbySupport();await refreshLobby();await Promise.all([refreshFriends(),refreshInvites()]);await refreshAdminPanel();subscribeLobby()}
async function pingOnline(){if(user)await sb.from('profiles').update({online_at:new Date().toISOString()}).eq('id',user.id)}
$('profileBtn').onclick=async()=>{await renderProfile();show('profile')};document.querySelectorAll('.toLobby').forEach(b=>b.onclick=async()=>{
  const {data:activeSeat}=await sb.from('room_players')
    .select('room_id,seat_no')
    .eq('user_id',user.id)
    .not('seat_no','is',null)
    .limit(1)
    .maybeSingle();

  if(activeSeat?.room_id){
    const {error}=await sb.rpc('stand_up_from_table',{p_room:activeSeat.room_id});
    if(error){
      alert('Ви ще граєте за столом. Спочатку завершіть роздачу або впадіть.');
      await openRoom(activeSeat.room_id);
      return;
    }
  }

  show('lobby');
  await refreshLobby();
});
async function renderProfile(){
  ensureLobbySupport();
  ensureProgressUi();

  const {data:fresh}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(fresh)profile=fresh;

  $('profileNick').textContent=profile.nickname;
  $('profileEmail').textContent=user.email||'';
  if($('profileAvatar')){$('profileAvatar').textContent=avatarIcon(profile.avatar_key);paintProfileFrame();}
  $('profileChips').textContent=profile.chips??0;
  $('profileGames').textContent=profile.games_played??0;
  $('profileWins').textContent=profile.wins??0;
  $('profileWinRate').textContent=(profile.games_played?Math.round((profile.wins||0)*100/profile.games_played):0)+'%';

  const xp=Number(profile.xp||0);
  const level=Number(profile.level||1);
  const inLevel=xp%100;
  if($('profileLevel'))$('profileLevel').textContent=level;
  if($('profileXp'))$('profileXp').textContent=xp.toLocaleString('uk-UA')+' XP';
  if($('profileXpNext'))$('profileXpNext').textContent='до '+(level+1)+' рівня: '+(100-inLevel)+' XP';
  if($('profileXpFill'))$('profileXpFill').style.width=inLevel+'%';

  const [{data:l},{data:g}]=await Promise.all([
    sb.from('chip_ledger').select('amount,balance_after,reason,created_at').order('created_at',{ascending:false}).limit(20),
    sb.from('game_history').select('room_name,result,pot,chip_change,opponents,finished_at').order('finished_at',{ascending:false}).limit(30)
  ]);

  $('profileBestPot').textContent=((g||[]).filter(x=>x.result==='win').reduce((m,x)=>Math.max(m,Number(x.pot||0)),0))+' ◉';

  $('chipHistory').innerHTML=(l||[]).map(x=>
    '<div class="historyRow"><b>'+(x.amount>0?'+':'')+x.amount+' ◉</b><span>'+esc(x.reason)+' · баланс '+x.balance_after+'</span><small>'+new Date(x.created_at).toLocaleString('uk-UA')+'</small></div>'
  ).join('')||'<p class="emptyHistory">Операцій ще немає.</p>';

  $('gameHistory').innerHTML=(g||[]).map(x=>{
    const label=x.result==='win'?'ПЕРЕМОГА':x.result==='loss'?'ПОРАЗКА':x.result==='draw'?'СВАРА':'СКАСОВАНО';
    const cls=x.result==='win'?'win':x.result==='loss'?'loss':'draw';
    return '<div class="gameHistoryRow"><div><span class="resultTag '+cls+'">'+label+'</span><b>'+esc(x.room_name||'TRYNKA')+'</b><small>'+new Date(x.finished_at).toLocaleString('uk-UA')+'</small></div><div class="historyMoney '+(x.chip_change>0?'plus':x.chip_change<0?'minus':'')+'">'+(x.chip_change>0?'+':'')+x.chip_change+' ◉<small>Банк '+x.pot+' ◉</small></div></div>';
  }).join('')||'<div class="emptyHistory">Історія поки порожня.<br><small>Завершені ігри з’являтимуться тут.</small></div>';

  await renderAchievements();
}
$('newRoom').onclick=()=>show('create');
$('browseTables').onclick=()=>document.getElementById('tablesArea')?.scrollIntoView({behavior:'smooth'});
$('homeFriends').onclick=()=>document.getElementById('socialArea')?.scrollIntoView({behavior:'smooth'});
$('homeCabinet').onclick=async()=>{await renderProfile();show('profile')};
$('quickPlay').onclick=async()=>{const {data:rooms}=await sb.from('rooms').select('*,room_players(user_id,seat_no)').order('created_at',{ascending:true});const open=(rooms||[]).find(r=>{const seated=(r.room_players||[]).filter(p=>p.seat_no!==null).length;return !r.is_private&&seated>0&&seated<r.max_players&&r.game_status!=='playing'});if(open)return joinRoom(open);show('create')};
$('createForm').onsubmit=async e=>{e.preventDefault();const isPrivate=!!$('privateRoomToggle')?.checked;const {data,error}=await sb.rpc('create_secure_room_v2',{p_name:$('roomName').value.trim()||'Мій стіл',p_max_players:+$('maxPlayers').value,p_turn_seconds:+$('turnTime').value,p_ante:+$('ante').value,p_private:isPrivate});if(error)return alert(error.message);const rid=Number(data?.room_id||0),code=data?.invite_code||'';if(rid)await openRoom(rid);if(isPrivate&&code){if(window.TRYNKA_SHOW_PRIVATE_INVITE)window.TRYNKA_SHOW_PRIVATE_INVITE(rid,code);else alert('Код столу: '+code)}}
async function refreshLobby(){
  const cutoff=new Date(Date.now()-70000).toISOString();
  const [{count:online},{data:rooms},{data:p}]=await Promise.all([
    sb.from('profiles').select('*',{count:'exact',head:true}).gt('online_at',cutoff),
    sb.from('rooms').select('*,room_players(user_id,seat_no)').order('created_at',{ascending:false}),
    sb.from('profiles').select('*').eq('id',user.id).single()
  ]);

  if(p)profile=p;
  if($('gameBalance'))$('gameBalance').textContent='Гаманець: ◉ '+Number(profile?.chips||0).toLocaleString('uk-UA');

  const n=online||0;
  $('onlineBadge').textContent='● '+n+' онлайн';
  $('onlineCount').textContent=n;
  $('onlineStat').textContent=n;
  $('myChips').textContent=profile?.chips??0;

  const active=(rooms||[]).filter(r=>!r.is_private);
  $('tablesStat').textContent=active.length;
  $('rooms').innerHTML='';

  active.forEach(r=>{
    const count=(r.room_players||[]).filter(p=>p.seat_no!==null).length;
    const playing=r.game_status==='playing';
    const locked=!!r.join_locked;
    const mine=(r.room_players||[]).some(p=>p.user_id===user.id);
    const mineSeated=(r.room_players||[]).some(p=>p.user_id===user.id&&p.seat_no!==null);
    const d=document.createElement('div');
    d.className='roomCard';
    d.dataset.roomId=String(r.id);
    d.dataset.name=String(r.name||'').toLowerCase();
    d.dataset.ante=String(r.ante||0);
    d.dataset.turn=String(r.turn_seconds||0);
    d.dataset.players=String(count);
    d.dataset.max=String(r.max_players||0);
    d.dataset.status=String(r.game_status||'waiting');

    d.innerHTML=
      '<div><div class="ownerLine"><span class="miniAvatar">♠</span><span>'+(locked?'🔒 Набір закрито':'Відкритий стіл')+'</span></div>'+
      '<h3>'+esc(r.name)+'</h3>'+
      '<div class="roomMeta">'+
        '<span class="pill '+(playing?'playing':'live')+'">'+(playing?'● Грають':'● Очікує')+'</span>'+
        '<span class="pill">👥 '+count+'/'+r.max_players+'</span>'+

        '<span class="pill">◉ '+r.ante+'</span>'+
        '<span class="pill">⏱ '+r.turn_seconds+'с</span>'+(locked?'<span class="pill lockedPill">🔒 Закрито</span>':'')+
      '</div></div>'+
      '<button '+((!mine&&!playing&&locked)?'disabled':'')+'>'+(mine?(mineSeated?'↩ Повернутися':'Увійти'):(playing?'👁 Дивитися':locked?'🔒 Закрито':'Сісти'))+'</button>';

    d.querySelector('button').onclick=()=>mine?openRoom(r.id):(playing?watchRoom(r):(locked?null:joinRoom(r)));
    $('rooms').appendChild(d);
  });

  if(!active.length)$('rooms').innerHTML='<p>Активних столів поки немає. Створи перший.</p>';
}
async function joinRoom(r){const {error}=await sb.rpc('secure_join_room',{p_room:r.id});if(error)return alert(error.message);await openRoom(r.id)}
async function watchRoom(r){
  const {error}=await sb.rpc('watch_room',{p_room:r.id});
  if(error)return alert(error.message);
  await openRoom(r.id);
}
function syncSpectatorUi(){
  let badge=$('spectatorModeBadge');
  const host=document.querySelector('#game .gameIdentity');
  if(host&&!badge){
    badge=document.createElement('span');
    badge.id='spectatorModeBadge';
    badge.className='spectatorModeBadge';
    host.appendChild(badge);
  }
  if(badge){badge.textContent=spectatorMode?'👁 СПОСТЕРІГАЧ':'';badge.classList.toggle('hide',!spectatorMode)}
  $('game')?.classList.toggle('spectatorMode',spectatorMode);
  $('inviteBtn')?.classList.toggle('hide',spectatorMode);
  $('chatForm')?.classList.toggle('hide',spectatorMode);
  if(!spectatorMode)$('spectatorNotice')?.remove();
}
function setSpectatorMode(next,{persist=true}={}){
  const changed=spectatorMode!==!!next;
  spectatorMode=!!next;
  syncSpectatorUi();
  if($('gameBalance'))$('gameBalance').textContent=spectatorMode?'Режим перегляду':'Гаманець: ◉ '+Number(profile?.chips||0).toLocaleString('uk-UA');
  if(changed&&persist&&currentRoom&&!$('game')?.classList.contains('hide'))saveNavState('game');
}
function scheduleRoomRefresh(delay=120){
  if(!currentRoom||$('game')?.classList.contains('hide'))return;
  clearTimeout(roomRefreshTimer);
  roomRefreshTimer=setTimeout(()=>renderRoom(),delay);
}
async function openRoom(id){
  id=Number(id);
  currentRoom=id;messagesLoadedRoom=null;lastSeatSignature='';lastHandPaint='';lastTableHistoryAt=0;lastHistoryRoundId=null;
  clearTimeout(roomRefreshTimer);
  const [memberRes,watcherRes]=await Promise.all([
    sb.from('room_players').select('room_id,seat_no').eq('room_id',id).eq('user_id',user.id).maybeSingle(),
    sb.from('room_spectators').select('room_id').eq('room_id',id).eq('user_id',user.id).maybeSingle()
  ]);
  if(currentRoom!==id)return;
  if(memberRes.error&&watcherRes.error){
    console.warn('TRYNKA membership check failed',memberRes.error,watcherRes.error);
  }
  setSpectatorMode(!memberRes.data&&!!watcherRes.data,{persist:false});
  show('game');
  setSpectatorMode(spectatorMode);
  if(channel)await sb.removeChannel(channel);
  if(currentRoom!==id)return;
  channel=sb.channel('room-'+id)
    .on('postgres_changes',{event:'*',schema:'public',table:'room_players',filter:'room_id=eq.'+id},()=>scheduleRoomRefresh(120))
    .on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:'id=eq.'+id},()=>scheduleRoomRefresh(120))
    .on('postgres_changes',{event:'*',schema:'public',table:'room_hands',filter:'room_id=eq.'+id},()=>scheduleRoomRefresh(80))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'room_id=eq.'+id},p=>addMessage(p.new))
    .on('postgres_changes',{event:'*',schema:'public',table:'game_rounds',filter:'room_id=eq.'+id},()=>scheduleRoomRefresh(80))
    .subscribe();
  await renderRoom();
}
async function renderRoom(){
  if(!currentRoom||!user)return;
  if(roomRenderBusy){roomRenderQueued=true;return}
  roomRenderBusy=true;
  const roomId=currentRoom,version=++roomRenderVersion;
  try{
    const {data:snapshot,error}=await sb.rpc('get_room_game_snapshot',{p_room:roomId});
    if(version!==roomRenderVersion||currentRoom!==roomId)return;
    if(error||!snapshot?.room){
      console.warn('TRYNKA room snapshot skipped',error);
      document.dispatchEvent(new CustomEvent('trynka:room-render-error',{detail:{roomId,message:error?.message||'snapshot failed'}}));
      return;
    }

    const r=snapshot.room;
    const ps=(snapshot.players||[]).map(p=>({
      user_id:p.user_id,
      seat_no:p.seat_no,
      table_chips:p.table_chips,
      ready:p.ready,
      last_seen_at:p.last_seen_at,
      game_heartbeat_at:p.game_heartbeat_at,
      disconnected_at:p.disconnected_at,
      profiles:{
        nickname:p.nickname,
        chips:p.chips,
        avatar_key:p.avatar_key,
        frame_key:p.frame_key,
        win_streak:p.win_streak,
        is_bot:p.is_bot
      }
    }));

    window.TRYNKA_GAME_STATE=snapshot;
    document.dispatchEvent(new CustomEvent('trynka:room-snapshot',{detail:snapshot}));

    const mineMember=ps.some(p=>p.user_id===user.id);
    if(mineMember&&spectatorMode)setSpectatorMode(false);
    $('roomTitle').textContent=r.name||'Стіл';
    renderSeats(r,ps);
    renderGameState(r,ps);
    await renderRound(r,ps,version,snapshot);
    if(version!==roomRenderVersion||currentRoom!==roomId)return;

    if(messagesLoadedRoom!==currentRoom){
      const {data:ms}=await sb.from('messages')
        .select('*,profiles(nickname)')
        .eq('room_id',currentRoom)
        .order('created_at',{ascending:false})
        .limit(50);
      if(version!==roomRenderVersion||currentRoom!==roomId)return;
      $('messages').innerHTML='';
      [...(ms||[])].reverse().forEach(addMessage);
      messagesLoadedRoom=currentRoom;
    }

    await renderHand(r,snapshot);
    if(version!==roomRenderVersion||currentRoom!==roomId)return;

    const finishedRoundId=snapshot.round?.status==='finished'?snapshot.round?.id:null;
    const forceHistory=!!finishedRoundId&&finishedRoundId!==lastHistoryRoundId;
    if(finishedRoundId)lastHistoryRoundId=finishedRoundId;
    await renderTableHistory(forceHistory);
  }finally{
    roomRenderBusy=false;
    if(roomRenderQueued){
      roomRenderQueued=false;
      if(currentRoom===roomId)setTimeout(()=>renderRoom(),0);
    }
  }
}
window.TRYNKA_FORCE_RENDER=renderRoom;
function positionOwnHandNearSeat(){
  const table=document.querySelector('#game .table');
  const seat=document.querySelector('#seats .seat.mine');
  const hand=$('myHand');
  if(!table||!seat||!hand)return;

  const tr=table.getBoundingClientRect();
  const sr=seat.getBoundingClientRect();
  if(!tr.width||!tr.height||!sr.width||!sr.height)return;

  const tableCx=tr.left+tr.width/2;
  const tableCy=tr.top+tr.height/2;
  const seatCx=sr.left+sr.width/2;
  const seatCy=sr.top+sr.height/2;

  let dx=seatCx-tableCx,dy=seatCy-tableCy;
  const len=Math.hypot(dx,dy)||1;
  dx/=len;dy/=len;

  const inward=window.innerWidth<=650?48:Math.min(120,Math.max(82,Math.min(tr.width,tr.height)*0.18));
  const x=seatCx-tr.left-dx*inward;
  const y=seatCy-tr.top-dy*inward;

  hand.style.setProperty('left',x+'px','important');
  hand.style.setProperty('top',y+'px','important');
  hand.style.setProperty('right','auto','important');
  hand.style.setProperty('bottom','auto','important');
  hand.style.setProperty('transform','translate(-50%,-50%)','important');
}
function visualSeatSlot(seatNo,maxPlayers,mineSeat=null){
  const max=Math.max(2,Math.min(8,Number(maxPlayers)||8));
  const maps={
    2:[0,4],
    3:[0,3,5],
    4:[0,2,4,6],
    5:[0,1,3,5,7],
    6:[0,1,3,4,5,7],
    7:[0,1,2,3,5,6,7],
    8:[0,1,2,3,4,5,6,7]
  };
  const rel=mineSeat===null?Number(seatNo):(Number(seatNo)-Number(mineSeat)+max)%max;
  return (maps[max]||maps[8])[rel]??rel;
}
function renderSeats(r,ps){
  const mine=ps.find(p=>p.user_id===user.id&&p.seat_no!==null);
  const mineSeat=mine?.seat_no??null;
  const canChooseSeat=!spectatorMode&&!mine&&r.game_status!=='playing';
  const hand=$('myHand');
  if(hand){
    [...hand.classList].filter(c=>/^handSeat\d$/.test(c)).forEach(c=>hand.classList.remove(c));
    if(mine)hand.classList.add('handSeat'+visualSeatSlot(mine.seat_no,r.max_players,mineSeat));
  }
  const occupied=ps.filter(p=>p.seat_no!==null).map(p=>[p.seat_no,p.user_id,p.profiles?.nickname||'',Number(p.table_chips||0),p.profiles?.avatar_key||'spade',p.profiles?.frame_key||'classic',Number(p.profiles?.win_streak||0),!!p.ready,!!p.profiles?.is_bot]).sort((a,b)=>a[0]-b[0]);
  const sig=JSON.stringify([r.id,r.max_players,r.game_status,!!spectatorMode,user?.id||'',mineSeat,occupied]);
  if(sig===lastSeatSignature&&$('seats')?.children.length===r.max_players)return;
  lastSeatSignature=sig;
  const bySeat=new Map(ps.filter(p=>p.seat_no!==null).map(p=>[p.seat_no,p]));
  $('seats').innerHTML='';
  for(let i=0;i<r.max_players;i++){
    const p=bySeat.get(i),d=document.createElement('div');
    const visualSlot=visualSeatSlot(i,r.max_players,mineSeat);
    d.className='seat s'+visualSlot+' p'+visualSlot+(p?.user_id===user.id?' mine':!p?' free':'')+(p?' roundEligible':'');
    d.dataset.seatNo=String(i);
    if(p)d.dataset.userId=p.user_id;
    d.innerHTML=p?'<div class="seatAvatar playerFrame '+frameClass(p.profiles?.frame_key||'classic')+'">'+avatarIcon(p.profiles?.avatar_key)+'</div><div class="seatBody"><div class="seatName">'+esc(p.profiles?.nickname||'Гравець')+((p.profiles?.nickname||'')==='Адмін'?'<span class="adminTag">ADMIN</span>':'')+(p.user_id===user.id?'<span class="youTag">ВИ</span>':'')+'</div>'+(Number(p.profiles?.win_streak||0)>=2?'<div class="streakTag">🔥 ×'+Number(p.profiles.win_streak)+'</div>':'')+'<div class="seatStack">СТІЛ: ◉ '+Number(p.table_chips||0).toLocaleString('uk-UA')+'</div><div class="seatState"></div></div>':'<div class="seatFreePlus">＋</div><div class="seatBody"><div class="seatName">Сісти</div><div class="seatStack">Вільне місце</div></div>';
    if(p&&p.disconnected_at){
      const away=document.createElement('span');away.className='awayBadge';away.textContent='ВІДІЙШОВ';d.appendChild(away);
    }
    if(!p&&canChooseSeat){
      d.onclick=()=>takeSeat(i,r);
    }
    if(!p&&!spectatorMode&&r.game_status!=='playing'){
      const inv=document.createElement('button');inv.className='inviteSeatMini';inv.title='Запросити друга саме на це місце';inv.textContent='↗';
      inv.onclick=e=>{e.preventDefault();e.stopPropagation();window.TRYNKA_INVITE_SEAT?.(r.id,i)};
      d.appendChild(inv);
    }
    if(p){d.title='Відкрити профіль гравця';d.onclick=()=>{if(window.TRYNKA_OPEN_PLAYER_PROFILE)window.TRYNKA_OPEN_PLAYER_PROFILE(p.user_id);else if(p.user_id!==user.id)reportPlayer(p.user_id,p.profiles?.nickname||'Гравець')}}
    $('seats').appendChild(d)
  }
  requestAnimationFrame(positionOwnHandNearSeat);
}
async function takeSeat(i,r){
  const buyin=await askBuyIn(r);
  if(!buyin)return;
  const {error}=await sb.rpc('take_room_seat',{p_room:currentRoom,p_seat:i,p_buyin:buyin});
  if(error)return alert(error.message);
  const {data:p}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(p)profile=p;
  if($('gameBalance'))$('gameBalance').textContent='Гаманець: ◉ '+Number(profile?.chips||0).toLocaleString('uk-UA');
  await sb.rpc('try_start_countdown',{p_room:currentRoom});
  await renderRoom();
}
function renderGameState(r,ps){
  clearInterval(countdownTimer);
  const seated=ps.filter(p=>p.seat_no!==null).length;
  const mineSeated=ps.some(p=>p.user_id===user.id&&p.seat_no!==null);
  if(r.game_status==='waiting'){
    if(seated>=2){
      $('countdown').textContent='Готуємо роздачу…';
      $('turnStatus').textContent='Старт автоматично';
    }else if(mineSeated){
      $('countdown').textContent='Очікуємо суперника';
      $('turnStatus').textContent='Гра почнеться, коли сяде ще один гравець';
    }else if(spectatorMode){
      $('countdown').textContent='Очікуємо гравців';
      $('turnStatus').textContent='Ви спостерігаєте за столом';
    }else{
      $('countdown').textContent='Оберіть місце';
      $('turnStatus').textContent='Сядьте за стіл, щоб почати гру';
    }
    return;
  }
  if(r.game_status==='countdown'){
    const tick=()=>{
      const start=new Date(r.countdown_started_at).getTime(),left=Math.max(0,5-Math.floor((Date.now()-start)/1000));
      if(left>0){$('countdown').textContent='Старт через '+left;$('turnStatus').textContent='Готуємо карти…';return}
      $('countdown').textContent='РОЗДАЄМО…';$('turnStatus').textContent='Сервер готує карти…';
    };
    tick();countdownTimer=setInterval(tick,700);return;
  }
  $('countdown').textContent='Гра почалась';
  $('turnStatus').textContent='Карти роздаються по одній';
}
async function renderRound(r,ps,version=roomRenderVersion,snapshot=null){
  const valid=()=>version===roomRenderVersion&&currentRoom===r.id;
  if(!valid()||!$('gameActions'))return;
  const gr=snapshot?.round||null;
  currentRound=gr;
  clearInterval(turnTimer);
  if($('potBig'))$('potBig').textContent=(gr?.result_note==='Свара'&&r.game_status!=='playing'?'БАНК СВАРИ: '+Number(r.carried_pot||gr?.pot||0):'БАНК: '+Number(gr?.pot||0))+' ◉';
  if($('bankInfo')){
    const maxBet=Math.max(1,Number(r.ante||1)*100);
    $('bankInfo').textContent='Ставка: '+Number(gr?.current_bet||r.ante||0)+' ◉ · Макс: '+maxBet+' ◉';
  }
  await renderContributions(gr,ps,snapshot?.round_players||[]);
  if(!valid())return;
  renderRevealShowdown(gr,ps);
  if(!gr){$('gameActions').classList.add('hide');return}
  if($('tableRoundLabel'))$('tableRoundLabel').textContent=(gr.is_svara?'СВАРА · ':'Коло ')+(gr.round_no||1);
  await renderActionLog(gr.id,ps,snapshot?.latest_actions||[]);
  if(!valid())return;
  clearInterval(turnTimer);
  if(gr.status!=='playing'){
    $('gameActions').classList.add('hide');
    if(gr.status==='finished'){
      const winner=ps.find(p=>p.user_id===gr.winner_id);
      if(r.game_status!=='countdown')$('countdown').textContent=gr.result_note==='Свара'?'СВАРА — ВХІД ЗА ½ БАНКУ':gr.winner_id?(gr.winner_id===user.id?'ВИ ПЕРЕМОГЛИ!':'ПЕРЕМІГ '+(winner?.profiles?.nickname||'ГРАВЕЦЬ')):(gr.result_note||'Роздачу завершено');
      $('turnStatus').textContent=gr.result_note==='Свара'?'Очікуємо учасників свари':(r.game_status==='countdown'?'Готуємо наступну роздачу':'Очікуємо наступну роздачу');
    }
    return;
  }
  $('gameActions').classList.remove('hide');
  const turn=ps.find(p=>p.user_id===gr.turn_user_id);
  $('roundPot').textContent='Банк: '+gr.pot+' ◉';
  $('roundBet').textContent='Ставка: '+gr.current_bet+' ◉';
  const mine=gr.turn_user_id===user.id;
  if(!window.TRYNKA_STABLE_TURN_UI&&$('roundTurn'))$('roundTurn').textContent=mine?'ВАШ ХІД':'ХІД: '+(turn?.profiles?.nickname||'ГРАВЕЦЬ').toUpperCase();
  document.querySelectorAll('#gameActions button[data-action]').forEach(b=>{
    let disabled=!mine;
    const maxBet=Math.max(1,Number(r.ante||1)*100);
    if(b.dataset.action==='reveal'&&Number(gr.round_no||1)<2)disabled=true;
    if(b.dataset.action==='raise'&&Number(gr.current_bet||0)>=maxBet)disabled=true;
    if(b.dataset.action==='dark'&&Number(gr.round_no||1)>2)disabled=true;
    if(b.dataset.action==='boil'&&ps.filter(p=>p.seat_no!==null).length<2)disabled=true;
    b.disabled=disabled;
    if(b.dataset.action==='reveal')b.title=Number(gr.round_no||1)<2?'Вскриття доступне з другого кола':'Якщо не вистачає на повну підтримку, вскриття піде на весь доступний стек, а зайве супернику повернеться';
    if(b.dataset.action==='raise')b.title='Максимум: '+maxBet+' ◉';
  });
}
async function renderContributions(gr,ps,rps=[]){if(!$('contributionBoard')||!gr){if($('contributionBoard'))$('contributionBoard').innerHTML='';return}$('contributionBoard').innerHTML=(rps||[]).map(x=>{const p=ps.find(v=>v.user_id===x.user_id);return '<span class="'+(x.folded?'folded':'')+'">'+esc(p?.profiles?.nickname||'Гравець')+' <b>'+x.contributed+' ◉</b></span>'}).join('')}
function renderRevealShowdown(gr,ps){
  const box=$('revealShowdown');
  if(!box)return;
  box.classList.add('hide');
  box.innerHTML='';
}
async function renderActionLog(roundId,ps,a=[]){if(!$('tableActionLog'))return;const rows=(a||[]).slice(0,5);const names={ante:'вніс ставку',call:'дав',raise:'підняв',fold:'впав',reveal:'вскрився',dark:'грає в темну',boil:'запропонував варити',timeout:'час вийшов — автоматично впав'};$('tableActionLog').innerHTML=rows.map(x=>'<div class="actionLogRow"><b>'+esc(x.nickname||x.profiles?.nickname||'Гравець')+'</b><span>'+esc(names[x.action]||x.action)+(x.amount?' · '+x.amount+' ◉':'')+'</span></div>').join('')||'<div class="sideHistoryEmpty">Ходів ще немає</div>';const x=rows[0],flash=$('lastActionFlash');if(x&&flash&&x.action!=='ante'){const paid=x.action==='call'||x.action==='raise';flash.innerHTML='<b>'+esc(x.nickname||x.profiles?.nickname||'Гравець')+'</b><strong>'+(paid?(x.action==='raise'?'ПІДНЯВ':'ДАВ')+' '+Number(x.amount||0)+' ◉':esc(names[x.action]||x.action).toUpperCase())+'</strong>';flash.classList.remove('hide');if(lastActionId!==x.id){lastActionId=x.id;flash.classList.remove('pop');void flash.offsetWidth;flash.classList.add('pop')}}}
async function doGameAction(action){
  if(!currentRoom||spectatorMode||gameActionBusy)return;
  let raiseTo=null;

  if(action==='raise'){
    const cachedRoom=window.TRYNKA_GAME_STATE?.room;
    const r=cachedRoom||((await sb.from('rooms').select('ante').eq('id',currentRoom).single()).data);
    const current=Number(currentRound?.current_bet||r?.ante||0);
    const maxBet=Math.max(1,Number(r?.ante||1)*100);
    const suggested=Math.min(maxBet,Math.max(current+1,current*2));
    const raw=prompt('До якої ЗАГАЛЬНОЇ ставки підняти?\nПоточна: '+current+' ◉\nМаксимум: '+maxBet+' ◉',String(suggested));
    if(raw===null)return;
    raiseTo=Math.trunc(Number(raw));
    if(!raiseTo||raiseTo<=current)return alert('Ставка має бути більшою за '+current+' ◉');
    if(raiseTo>maxBet)return alert('Максимальна ставка за цим столом: '+maxBet+' ◉');
  }

  gameActionBusy=true;
  const actionStarted=Date.now();
  document.querySelectorAll('#gameActions button[data-action]').forEach(b=>{b.disabled=true;b.classList.add('actionLocked')});
  try{
    const actionNonce=crypto.randomUUID();const {error}=await sb.rpc('play_round_action_safe',{p_room:currentRoom,p_action:action,p_raise_to:raiseTo,p_nonce:actionNonce});
    if(error){
      try{await sb.rpc('log_client_error',{p_message:error.message||String(error),p_context:'round='+(currentRound?.id||'?')+' action='+action,p_room:currentRoom})}catch{}
      alert(error.message);
    }
  }catch(e){
    try{await sb.rpc('log_client_error',{p_message:e?.message||String(e),p_context:'round='+(currentRound?.id||'?')+' action='+action+' exception',p_room:currentRoom})}catch{}
    throw e;
  }finally{
    const wait=Math.max(0,450-(Date.now()-actionStarted));if(wait)await new Promise(r=>setTimeout(r,wait));
    gameActionBusy=false;
    document.querySelectorAll('#gameActions button[data-action]').forEach(b=>b.classList.remove('actionLocked'));
    await renderRoom();
  }
}
document.querySelectorAll('#gameActions button[data-action]').forEach(b=>b.onclick=()=>doGameAction(b.dataset.action));
async function renderHand(roomArg,snapshotArg=null){
  if(!currentRoom)return;
  if(spectatorMode){$('myHand').innerHTML='';lastHandPaint='';return;}
  const snapshot=snapshotArg||window.TRYNKA_GAME_STATE||null;
  const r=roomArg?.id?roomArg:snapshot?.room||((await sb.from('rooms').select('*').eq('id',currentRoom).single()).data);
  if(!r||r.game_status!=='playing'){
    $('myHand').innerHTML='';
    lastHandPaint='';handPullKey='';handPullY=[0,0,0];
    ownDealActive=false;ownDealtCount=3;
    clearInterval(dealTimer);
    return;
  }

  let cards=Array.isArray(snapshot?.my_hand)?snapshot.my_hand:null;
  if(!cards){
    const {data:h}=await sb.from('room_hands').select('cards').eq('room_id',currentRoom).eq('user_id',user.id).maybeSingle();
    cards=h?.cards||[];
  }
  if(!cards?.length)return;
  clearInterval(dealTimer);

  const dealKey=currentRoom+'|'+(r.deal_started_at||'')+'|'+cards.join('|');
  if(dealKey!==handPullKey){
    handPullKey=dealKey;
    handPullY=[0,0,0];
    lastHandPaint='';
  }

  const visible=ownDealActive?ownDealtCount:3;
  const paintKey=dealKey+'|'+visible;
  if(visible<=0){
    if($('myHand').children.length)$('myHand').innerHTML='';
    lastHandPaint=paintKey;
    return;
  }
  if(lastHandPaint===paintKey&&$('myHand')?.querySelectorAll('.pullCard').length===visible)return;
  lastHandPaint=paintKey;

  $('myHand').innerHTML=cards.slice(0,visible).map((c,i)=>
    '<div class="card pullCard '+(/[♠♣]/.test(c)?'black ':'')+'" data-card-index="'+i+'">'+
      '<span class="cardFace">'+esc(c)+'</span>'+
      '<div class="cardCover"><i>♠</i><small>ПОТЯГНИ КАРТУ</small></div>'+
    '</div>'
  ).join('');

  requestAnimationFrame(positionOwnHandNearSeat);
  $('myHand').querySelectorAll('.pullCard').forEach(card=>{
    const cover=card.querySelector('.cardCover');
    const idx=Number(card.dataset.cardIndex);
    let dragging=false,startY=0,startOffset=Number(handPullY[idx]||0),moved=false;

    const apply=y=>{
      const max=Math.max(0,card.clientHeight-13);
      const next=Math.max(0,Math.min(max,y));
      handPullY[idx]=next;
      cover.style.transform='translate3d(0,'+next+'px,0)';
      card.classList.toggle('peeked',next>7);
      card.classList.toggle('mostlyOpen',next>max*.70);
    };
    apply(startOffset);

    const begin=(clientY)=>{
      dragging=true;moved=false;startY=clientY;startOffset=Number(handPullY[idx]||0);
      card.classList.add('pulling');
    };
    const move=(clientY)=>{
      if(!dragging)return;
      const dy=clientY-startY;
      if(Math.abs(dy)>2)moved=true;
      apply(startOffset+dy);
    };
    const end=()=>{
      if(!dragging)return;
      dragging=false;card.classList.remove('pulling');
    };

    card.addEventListener('pointerdown',e=>{
      begin(e.clientY);
      try{card.setPointerCapture(e.pointerId)}catch{}
      e.preventDefault();
    });
    card.addEventListener('pointermove',e=>{
      if(!dragging)return;
      move(e.clientY);e.preventDefault();
    });
    card.addEventListener('pointerup',e=>{end();try{card.releasePointerCapture(e.pointerId)}catch{};e.preventDefault()});
    card.addEventListener('pointercancel',end);

    card.addEventListener('mousedown',e=>{if(e.pointerType)return;begin(e.clientY);e.preventDefault()});
    const mouseMove=e=>{if(dragging)move(e.clientY)};
    const mouseUp=()=>end();
    window.addEventListener('mousemove',mouseMove);
    window.addEventListener('mouseup',mouseUp);

    card.addEventListener('touchstart',e=>{
      if(!e.touches?.[0])return;
      begin(e.touches[0].clientY);e.preventDefault();
    },{passive:false});
    card.addEventListener('touchmove',e=>{
      if(!dragging||!e.touches?.[0])return;
      move(e.touches[0].clientY);e.preventDefault();
    },{passive:false});
    card.addEventListener('touchend',end,{passive:false});

    card.addEventListener('click',()=>{
      if(moved)return;
      const max=Math.max(0,card.clientHeight-13);
      apply(Number(handPullY[idx]||0)>max*.55?0:max*.78);
    });
    card.ondragstart=()=>false;
  });

  const trail=$('dealTrail');
  if(trail){trail.classList.remove('dealing');trail.innerHTML=''}
}
async function renderTableHistory(force=false){if(!$('tableGameHistory')||!user)return;if(!force&&Date.now()-lastTableHistoryAt<30000)return;lastTableHistoryAt=Date.now();const {data:g}=await sb.from('game_history').select('room_name,result,pot,chip_change,finished_at').eq('player_id',user.id).order('finished_at',{ascending:false}).limit(8);$('tableGameHistory').innerHTML=(g||[]).map(x=>{const label=x.result==='win'?'Перемога':x.result==='loss'?'Поразка':x.result==='draw'?'Свара':'Скасовано',cls=x.result==='win'?'win':x.result==='loss'?'loss':'draw';return '<div class="sideHistoryRow"><span class="resultDot '+cls+'"></span><div><b>'+label+'</b><small>'+new Date(x.finished_at).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</small></div><strong class="'+(x.chip_change>0?'plus':x.chip_change<0?'minus':'')+'">'+(x.chip_change>0?'+':'')+x.chip_change+' ◉</strong></div>'}).join('')||'<div class="sideHistoryEmpty">Зіграні партії<br>з’являться тут</div>'}
async function leaveRoom(){++roomRenderVersion;clearInterval(turnTimer);clearTimeout(nextDealTimer);clearInterval(countdownTimer);clearInterval(dealTimer);if(currentRoom&&user){const rid=currentRoom;if(spectatorMode)await sb.rpc('unwatch_room',{p_room:rid});else await sb.rpc('secure_leave_room',{p_room:rid});currentRoom=null;spectatorMode=false}if(channel){await sb.removeChannel(channel);channel=null}syncSpectatorUi();show('lobby');await refreshLobby()}
$('leaveRoom').onclick=leaveRoom;
$('chatForm').onsubmit=async e=>{e.preventDefault();const body=$('chatInput').value.trim();if(!body)return;const {error}=await sb.rpc('send_chat_message',{p_room:currentRoom,p_body:body});if(error)return alert(error.message);$('chatInput').value=''}
function addMessage(m){if(window.TRYNKA_BLOCKED_USERS?.has?.(m.user_id))return;const p=document.createElement('p');p.dataset.userId=m.user_id||'';p.textContent=(m.profiles?.nickname||profile?.nickname||'Гравець')+': '+m.body;$('messages').appendChild(p);$('messages').scrollTop=$('messages').scrollHeight}
$('friendForm').onsubmit=async e=>{e.preventDefault();const n=$('friendNick').value.trim();const {data:p}=await sb.from('profiles').select('id,nickname').eq('nickname',n).maybeSingle();if(!p)return alert('Гравця не знайдено');if(p.id!==user.id)await sb.from('friends').upsert({user_id:user.id,friend_id:p.id});$('friendNick').value='';refreshFriends()}
async function refreshFriends(){const {data}=await sb.from('friends').select('friend_id,profiles!friends_friend_id_fkey(nickname)').eq('user_id',user.id);const list=(data||[]).filter(f=>!window.TRYNKA_BLOCKED_USERS?.has?.(f.friend_id));$('friends').innerHTML=list.map(f=>'<div class="friend">● <b>'+esc(f.profiles.nickname)+'</b></div>').join('')||'<p>Друзів ще немає.</p>'}
$('inviteBtn').onclick=async()=>{const {data}=await sb.from('friends').select('friend_id,profiles!friends_friend_id_fkey(nickname)').eq('user_id',user.id);$('inviteFriends').innerHTML='';(data||[]).filter(f=>!window.TRYNKA_BLOCKED_USERS?.has?.(f.friend_id)).forEach(f=>{const b=document.createElement('button');b.textContent='Запросити '+f.profiles.nickname;b.onclick=async()=>{await sb.from('invites').insert({room_id:currentRoom,from_user:user.id,to_user:f.friend_id});b.disabled=true;b.textContent='Запрошено ✓'};$('inviteFriends').appendChild(b)});$('inviteDialog').showModal()}
async function refreshInvites(){const {data}=await sb.from('invites').select('id,room_id,from_user,profiles!invites_from_user_fkey(nickname),rooms(name)').eq('to_user',user.id).eq('status','pending');$('invites').innerHTML='';(data||[]).filter(i=>!window.TRYNKA_BLOCKED_USERS?.has?.(i.from_user)).forEach(i=>{const d=document.createElement('div');d.className='invite';d.innerHTML='<b>'+esc(i.profiles.nickname)+'</b> запрошує: '+esc(i.rooms?.name||'стіл')+' ';const b=document.createElement('button');b.textContent='Прийняти';b.onclick=async()=>{await sb.from('invites').update({status:'accepted'}).eq('id',i.id);const {error}=await sb.rpc('secure_join_room',{p_room:i.room_id});if(error)return alert(error.message);await openRoom(i.room_id)};d.appendChild(b);$('invites').appendChild(d)});if(!$('invites').children.length)$('invites').innerHTML='<p>Немає нових.</p>'}
function scheduleLobbyRefresh(){clearTimeout(lobbyRefreshTimer);lobbyRefreshTimer=setTimeout(()=>{if(!$('lobby')?.classList.contains('hide'))refreshLobby()},800)}
function subscribeLobby(){if(lobbyChannel)sb.removeChannel(lobbyChannel);lobbyChannel=sb.channel('lobby-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'rooms'},scheduleLobbyRefresh).on('postgres_changes',{event:'*',schema:'public',table:'room_players'},scheduleLobbyRefresh).on('postgres_changes',{event:'INSERT',schema:'public',table:'invites',filter:'to_user=eq.'+user.id},refreshInvites).subscribe()}
$('contactAdmin').onclick=()=>$('adminDialog').showModal();$('closeAdminDialog').onclick=()=>$('adminDialog').close();$('adminRequestForm').onsubmit=async e=>{e.preventDefault();const {error}=await sb.rpc('create_chip_request',{p_amount:+$('chipAmount').value,p_message:$('adminRequestText').value.trim()});if(error)return alert(error.message);$('adminDialog').close();alert('Заявку надіслано адміну ✓')}
async function refreshAdminPanel(){if(!profile)return;const {data:isAdmin}=await sb.rpc('is_admin');if(!isAdmin){$('adminPanel').classList.add('hide');return}$('adminPanel').classList.remove('hide');const {data}=await sb.from('chip_requests').select('id,user_id,amount,message,profiles(nickname)').eq('status','pending').order('created_at');$('chipRequests').innerHTML='';(data||[]).forEach(r=>{const d=document.createElement('div');d.className='invite';d.innerHTML='<b>'+esc(r.profiles?.nickname||'Гравець')+'</b> — '+r.amount+' ◉ ';const b=document.createElement('button');b.textContent='Нарахувати';b.onclick=async()=>{const {error}=await sb.rpc('grant_virtual_chips',{target_user:r.user_id,chip_amount:r.amount,request_id:r.id});if(error)return alert(error.message);refreshAdminPanel()};d.appendChild(b);$('chipRequests').appendChild(d)});if(!$('chipRequests').children.length)$('chipRequests').innerHTML='<p>Нових заявок немає.</p>';await refreshSecurityAdmin();await refreshAdminRooms()}
async function reportPlayer(id,nick){const reason=prompt('Причина скарги на '+nick+':');if(!reason)return;const {error}=await sb.rpc('report_player',{p_reported:id,p_room:currentRoom,p_reason:reason});alert(error?error.message:'Скаргу надіслано адміну ✓')}
async function refreshSecurityAdmin(){if(!$('securityAdmin'))return;const {data:reports}=await sb.from('player_reports').select('id,reported_id,reason,created_at,profiles!player_reports_reported_id_fkey(nickname)').eq('status','open').order('created_at',{ascending:false}).limit(20);$('securityAdmin').innerHTML='<h4>Скарги</h4>'+((reports||[]).map(r=>'<div class="historyRow"><b>'+esc(r.profiles?.nickname||'Гравець')+'</b><span>'+esc(r.reason)+'</span><div><button onclick="window.modPlayer(\''+r.reported_id+'\',\'mute\')">Мут 1 год</button> <button onclick="window.modPlayer(\''+r.reported_id+'\',\'ban\')">Бан 24 год</button> <button onclick="window.resolveReport('+r.id+')">Закрити</button></div></div>').join('')||'<p>Скарг немає.</p>')}
window.modPlayer=async(id,action)=>{const minutes=action==='mute'?60:1440;const reason=prompt('Причина:')||'Порушення правил';const {error}=await sb.rpc('admin_set_moderation',{p_user:id,p_action:action,p_minutes:minutes,p_reason:reason});alert(error?error.message:'Застосовано ✓');refreshSecurityAdmin()}
window.resolveReport=async id=>{const {error}=await sb.rpc('admin_resolve_report',{p_report:id,p_status:'closed'});if(error)alert(error.message);refreshSecurityAdmin()}
async function refreshAdminRooms(){if(!$('adminRooms'))return;const {data}=await sb.from('rooms').select('id,name,room_players(count)').order('created_at',{ascending:false}).limit(30);$('adminRooms').innerHTML=(data||[]).map(r=>'<div class="adminRow"><span><b>'+esc(r.name)+'</b> · '+(r.room_players?.[0]?.count||0)+' гравців</span><button onclick="window.closeRoom('+r.id+')">Закрити</button></div>').join('')||'<p>Столів немає.</p>'}
window.closeRoom=async id=>{if(!confirm('Закрити цей стіл? Активні віртуальні ставки буде повернено.'))return;const {error}=await sb.rpc('admin_close_room',{p_room:id});alert(error?error.message:'Стіл закрито ✓');refreshAdminRooms()}
$('adminFindPlayer').onclick=async()=>{const n=$('adminPlayerSearch').value.trim();if(!n)return;const {data:p}=await sb.from('profiles').select('id,nickname,chips,games_played,wins').eq('nickname',n).maybeSingle();if(!p){$('adminPlayerResult').innerHTML='<p>Не знайдено.</p>';return}$('adminPlayerResult').innerHTML='<div class="adminPlayer"><b>'+esc(p.nickname)+'</b><span>'+p.chips+' ◉ · '+p.games_played+' ігор · '+p.wins+' перемог</span><div><button onclick="window.adjustChips(\''+p.id+'\')">± Фішки</button> <button onclick="window.adminMod(\''+p.id+'\',\'mute\')">Мут</button> <button onclick="window.adminMod(\''+p.id+'\',\'ban\')">Бан</button> <button onclick="window.adminMod(\''+p.id+'\',\'unmute\')">Зняти мут</button> <button onclick="window.adminMod(\''+p.id+'\',\'unban\')">Розбан</button></div></div>'}
window.adjustChips=async id=>{const amount=Number(prompt('Зміна віртуальних фішок. Наприклад 500 або -500:'));if(!amount)return;const reason=prompt('Причина:')||'Адмін-коригування';const {error}=await sb.rpc('admin_adjust_virtual_chips',{p_user:id,p_amount:amount,p_reason:reason});alert(error?error.message:'Баланс змінено ✓')}
window.adminMod=async(id,action)=>{let mins=0;if(action==='mute'||action==='ban'){mins=Number(prompt('На скільки хвилин?',action==='mute'?'60':'1440'));if(!mins)return}const reason=prompt('Причина:')||'Адмін-модерація';const {error}=await sb.rpc('admin_set_moderation',{p_user:id,p_action:action,p_minutes:mins,p_reason:reason});alert(error?error.message:'Готово ✓')}
$('chatCollapse').onclick=()=>document.querySelector('#game .chat')?.classList.toggle('collapsed');
$('openSecurityLog').onclick=async()=>{const {data:e}=await sb.from('security_events').select('event_type,detail,created_at').order('created_at',{ascending:false}).limit(100);$('securityLogList').innerHTML=(e||[]).map(x=>'<div class="historyRow"><b>'+esc(x.event_type)+'</b><span>'+esc(x.detail||'')+'</span><small>'+new Date(x.created_at).toLocaleString('uk-UA')+'</small></div>').join('')||'<p>Подій немає.</p>';$('securityLogDialog').showModal()};
$('closeSecurityLog').onclick=()=>$('securityLogDialog').close();
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
boot();
window.TRYNKA_OPEN_ROOM=openRoom;
