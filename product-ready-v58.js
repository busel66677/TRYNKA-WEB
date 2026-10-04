import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
const BUILD=document.querySelector('meta[name="trynka-build"]')?.content||'unknown';
let hiddenDisconnectTimer=null;
let me=null,lastRankAt=0,lastAchievementAt=0,lastOwnerCheckAt=0,lastOwnerRoom=null;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function currentRoom(){try{const x=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');return x.view==='game'&&x.roomId?Number(x.roomId):null}catch{return null}}
function inviteUrl(code){return location.origin+location.pathname+'?invite='+encodeURIComponent(code)}
async function copyText(v){try{await navigator.clipboard.writeText(v);return true}catch{return false}}

function ensureInviteDialog(){
 let d=$('privateInviteDialog');if(d)return d;
 d=document.createElement('dialog');d.id='privateInviteDialog';d.className='privateInviteDialog';
 d.innerHTML='<div class="inviteHead"><div><span class="eyebrow">PRIVATE TABLE</span><h2>Запросити друзів</h2></div><button id="privateInviteClose">×</button></div><p>Надішли код або посилання другу.</p><div class="inviteCodeBox"><small>КОД СТОЛУ</small><b id="privateInviteCode">—</b></div><input id="privateInviteLink" readonly><div class="inviteActions"><button id="sharePrivateLink">Поділитися</button><button id="copyPrivateLink">Копіювати посилання</button><button id="copyPrivateCode" class="ghostInvite">Копіювати код</button></div>';
 document.body.appendChild(d);
 $('privateInviteClose').onclick=()=>d.close();
 $('copyPrivateLink').onclick=async()=>{await copyText($('privateInviteLink').value);$('copyPrivateLink').textContent='Скопійовано ✓';setTimeout(()=>$('copyPrivateLink').textContent='Копіювати посилання',1200)};
 $('copyPrivateCode').onclick=async()=>{await copyText($('privateInviteCode').textContent);$('copyPrivateCode').textContent='Скопійовано ✓';setTimeout(()=>$('copyPrivateCode').textContent='Копіювати код',1200)};
 $('sharePrivateLink').onclick=async()=>{const code=$('privateInviteCode').textContent,url=$('privateInviteLink').value;if(navigator.share){try{await navigator.share({title:'TRYNKA ONLINE',text:'Заходь за мій приватний стіл. Код: '+code,url});return}catch{}}await copyText(url);alert('Посилання скопійовано.')};
 return d;
}
window.TRYNKA_SHOW_PRIVATE_INVITE=(rid,code)=>{const d=ensureInviteDialog();$('privateInviteCode').textContent=code;$('privateInviteLink').value=inviteUrl(code);if(!d.open)d.showModal()};

async function handleInvite(){
 const u=new URL(location.href),fromUrl=u.searchParams.get('invite'),code=(fromUrl||sessionStorage.getItem('trynka_pending_invite')||'').trim();
 if(!code)return;
 if(fromUrl)sessionStorage.setItem('trynka_pending_invite',code);
 const {data:{user}}=await sb.auth.getUser();if(!user)return;
 const {data,error}=await sb.rpc('join_private_room',{p_code:code});
 if(error){if(fromUrl)alert(error.message);sessionStorage.removeItem('trynka_pending_invite');return}
 sessionStorage.removeItem('trynka_pending_invite');u.searchParams.delete('invite');history.replaceState({},'',u.pathname+(u.search||'')+u.hash);
 if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(Number(data));
}

async function mountShare(){
 const rid=currentRoom(),host=$('tableExtras');if(!rid||!host||$('game')?.classList.contains('hide'))return;
 let b=$('sharePrivateRoom');if(!b){b=document.createElement('button');b.id='sharePrivateRoom';b.className='sharePrivateRoom hide';b.textContent='🔗 Запросити';host.prepend(b)}
 if(b.dataset.roomId===String(rid))return;
 const {data,error}=await sb.rpc('get_private_room_invite',{p_room:rid});b.dataset.roomId=String(rid);
 if(error||!data){b.classList.add('hide');return}
 b.classList.remove('hide');b.onclick=()=>window.TRYNKA_SHOW_PRIVATE_INVITE(rid,String(data));
}

async function syncReadyButton(){
 const rid=currentRoom(),btn=$('readyBtn');if(!rid||!btn||$('game')?.classList.contains('hide'))return;
 const {data}=await sb.from('room_players').select('ready,seat_no').eq('room_id',rid).eq('user_id',me?.id).maybeSingle();
 if(!data||data.seat_no===null){btn.classList.add('hide');return}
 btn.classList.remove('hide');btn.textContent=data.ready?'✓ ГОТОВИЙ':'○ Я ГОТОВИЙ';btn.classList.toggle('readyOn',!!data.ready);
}

async function updateRank(){
 if(!me||Date.now()-lastRankAt<15000)return;lastRankAt=Date.now();
 const {data}=await sb.rpc('get_season_leaderboard',{p_limit:100});if(!data)return;
 const i=data.findIndex(x=>x.user_id===me.id),host=document.querySelector('#profile .profilecard>div:nth-child(2)');if(!host)return;
 let x=$('profileSeasonRank');if(!x){x=document.createElement('div');x.id='profileSeasonRank';x.className='profileSeasonRank';host.appendChild(x)}
 x.innerHTML=i>=0?'<span>СЕЗОН</span><b>#'+(i+1)+'</b><small>'+Number(data[i].score||0).toLocaleString('uk-UA')+' очок</small>':'<span>СЕЗОН</span><b>—</b><small>без рейтингу</small>';
}

async function watchAchievement(){
 if(!me||Date.now()-lastAchievementAt<12000)return;lastAchievementAt=Date.now();
 const {data}=await sb.from('player_achievements').select('achievement_key,unlocked_at,achievements(title,icon)').eq('user_id',me.id).order('unlocked_at',{ascending:false}).limit(1).maybeSingle();
 if(!data)return;const stamp=data.achievement_key+'|'+data.unlocked_at,key='trynka_seen_achievement_v1',seen=localStorage.getItem(key);
 if(!seen){localStorage.setItem(key,stamp);return}if(seen===stamp)return;localStorage.setItem(key,stamp);
 const t=document.createElement('div');t.className='achievementToast';t.innerHTML='<span>'+esc(data.achievements?.icon||'★')+'</span><div><small>НОВЕ ДОСЯГНЕННЯ</small><b>'+esc(data.achievements?.title||'Досягнення')+'</b></div>';document.body.appendChild(t);setTimeout(()=>t.remove(),4200);
}

function updateBanner(remote){
 if($('versionUpdateBanner'))return;const b=document.createElement('div');b.id='versionUpdateBanner';b.className='versionUpdateBanner';b.innerHTML='<div><b>Є нова версія TRYNKA</b><small>Онови сайт, щоб отримати останні виправлення.</small></div><button>Оновити</button>';b.querySelector('button').onclick=()=>location.href=location.pathname+'?v='+encodeURIComponent(remote)+location.hash;document.body.appendChild(b);
}
async function checkVersion(){try{const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const v=await r.json();if(v.build&&v.build!==BUILD)updateBanner(v.build);const reg=await navigator.serviceWorker?.getRegistration();await reg?.update()}catch{}}



const avatarIcons={spade:'♠',cards:'🃏',hat:'🎩',shield:'🛡️',trophy:'🏆',eagle:'🦅',fire:'🔥',star:'⭐',diamond:'💎',crown:'👑'};
function profileAvatar(k){return avatarIcons[k]||'♠'}

function ensurePlayerProfileDialog(){
  let d=$('playerPublicProfileDialog');if(d)return d;
  d=document.createElement('dialog');d.id='playerPublicProfileDialog';d.className='playerPublicProfileDialog';
  d.innerHTML='<div class="publicProfileHead"><div id="publicProfileAvatar" class="publicProfileAvatar">♠</div><div><span class="eyebrow">ПРОФІЛЬ ГРАВЦЯ</span><h2 id="publicProfileNick">Гравець</h2><small id="publicProfileRank"></small></div><button id="publicProfileClose">×</button></div><div id="publicProfileStats" class="publicProfileStats"></div><div><h3>Досягнення</h3><div id="publicProfileAchievements" class="publicProfileAchievements"></div></div><div class="publicProfileActions"><button id="publicProfileReport" class="dangerProfile">⚑ Поскаржитися</button></div>';
  document.body.appendChild(d);
  $('publicProfileClose').onclick=()=>d.close();
  return d;
}
window.TRYNKA_OPEN_PLAYER_PROFILE=async uid=>{
  if(!uid||!me)return;
  const d=ensurePlayerProfileDialog();
  $('publicProfileNick').textContent='Завантаження…';$('publicProfileStats').innerHTML='';$('publicProfileAchievements').innerHTML='';
  if(!d.open)d.showModal();
  const {data,error}=await sb.rpc('get_public_player_profile',{p_user:uid});
  if(error){$('publicProfileNick').textContent='Не вдалося завантажити';return}
  $('publicProfileAvatar').textContent=profileAvatar(data.avatar_key);
  $('publicProfileAvatar').className='publicProfileAvatar playerFrame frame-'+esc(data.frame_key||'classic');
  $('publicProfileNick').textContent=data.nickname||'Гравець';
  $('publicProfileRank').textContent=data.season_rank?'Сезонний рейтинг #'+data.season_rank+' · '+Number(data.season_score||0).toLocaleString('uk-UA')+' очок':'Сезон: без рейтингу';
  $('publicProfileStats').innerHTML='<div><b>'+Number(data.games||0)+'</b><span>ігор</span></div><div><b>'+Number(data.wins||0)+'</b><span>перемог</span></div><div><b>'+Number(data.win_rate||0)+'%</b><span>перемог</span></div><div><b>'+Number(data.best_win_streak||0)+'</b><span>краща серія</span></div><div><b>'+Number(data.xp||0)+'</b><span>XP</span></div><div><b>LVL '+Number(data.level||1)+'</b><span>рівень</span></div>';
  const ach=Array.isArray(data.achievements)?data.achievements:[];
  $('publicProfileAchievements').innerHTML=ach.length?ach.map(a=>'<span><i>'+esc(a.icon||'★')+'</i><b>'+esc(a.title||'Досягнення')+'</b></span>').join(''):'<small>Досягнень ще немає.</small>';
  const report=$('publicProfileReport');
  report.classList.toggle('hide',uid===me.id||!!data.is_bot);
  report.onclick=async()=>{const reason=prompt('Причина скарги на '+(data.nickname||'гравця')+':');if(!reason)return;const {error:e}=await sb.rpc('report_player',{p_reported:uid,p_room:currentRoom(),p_reason:reason});alert(e?e.message:'Скаргу надіслано адміну ✓')};
};

function ensureOwnerDialog(){
  let d=$('ownerTableDialog');if(d)return d;
  d=document.createElement('dialog');d.id='ownerTableDialog';d.className='ownerTableDialog';
  d.innerHTML='<div class="ownerHead"><div><span class="eyebrow">ВЛАСНИК СТОЛУ</span><h2>Керування столом</h2></div><button id="ownerDialogClose">×</button></div><div class="ownerSettings"><label>Ставка<input id="ownerAnte" type="number" min="1" max="100000"></label><label>Час на хід<select id="ownerTurn"><option value="15">15 сек</option><option value="30">30 сек</option><option value="45">45 сек</option><option value="60">60 сек</option></select></label><label class="ownerLock"><span><b>Закрити набір</b><small>Нові гравці не зможуть зайти, ті хто вже за столом залишаться.</small></span><input id="ownerJoinLocked" type="checkbox"></label></div><div id="ownerPlayingHint" class="ownerPlayingHint hide">Під час роздачі можна змінити тільки набір гравців. Ставка та час — між роздачами.</div><div class="ownerActions"><button id="ownerSave">Зберегти</button><button id="ownerFinish" class="ownerFinish">Завершити стіл</button></div>';
  document.body.appendChild(d);
  $('ownerDialogClose').onclick=()=>d.close();
  return d;
}
async function loadOwnerControls(force=false){
  const rid=currentRoom(),host=$('tableExtras');if(!rid||!host||!me||$('game')?.classList.contains('hide'))return;
  if(!force&&lastOwnerRoom===rid&&Date.now()-lastOwnerCheckAt<5000)return;
  lastOwnerRoom=rid;lastOwnerCheckAt=Date.now();
  const {data:r}=await sb.from('rooms').select('id,owner_id,ante,turn_seconds,join_locked,game_status').eq('id',rid).maybeSingle();
  let b=$('ownerTableBtn');
  if(!r||r.owner_id!==me.id){b?.remove();return}
  if(!b){b=document.createElement('button');b.id='ownerTableBtn';b.className='ownerTableBtn';b.textContent='⚙ Керування';host.prepend(b)}
  b.dataset.roomId=String(rid);
  b.onclick=async()=>{
    const d=ensureOwnerDialog();
    const {data:room,error}=await sb.from('rooms').select('id,ante,turn_seconds,join_locked,game_status').eq('id',rid).maybeSingle();
    if(error||!room)return alert('Не вдалося завантажити налаштування столу.');
    $('ownerAnte').value=room.ante;$('ownerTurn').value=String(room.turn_seconds);$('ownerJoinLocked').checked=!!room.join_locked;
    const playing=room.game_status==='playing';$('ownerAnte').disabled=playing;$('ownerTurn').disabled=playing;$('ownerPlayingHint').classList.toggle('hide',!playing);
    $('ownerSave').onclick=async()=>{
      const {error:e}=await sb.rpc('owner_update_room_settings',{p_room:rid,p_ante:Number($('ownerAnte').value),p_turn_seconds:Number($('ownerTurn').value),p_join_locked:$('ownerJoinLocked').checked});
      if(e)return alert(e.message);d.close();alert('Налаштування столу збережено ✓');
    };
    $('ownerFinish').onclick=async()=>{
      if(!confirm('Завершити цей стіл? Активні ставки поточної роздачі буде повернено гравцям.'))return;
      const {error:e}=await sb.rpc('owner_finish_room',{p_room:rid});if(e)return alert(e.message);
      sessionStorage.removeItem('trynka_nav_state_v1');location.href=location.pathname+'?v='+Date.now();
    };
    if(!d.open)d.showModal();
  };
}

async function markDisconnected(){
  const rid=currentRoom();if(!rid||!me||$('game')?.classList.contains('hide'))return;
  try{await sb.rpc('mark_room_disconnected',{p_room:rid})}catch{}
}
async function restorePresence(){
  const rid=currentRoom();if(!rid||!me||$('game')?.classList.contains('hide'))return;
  try{await sb.rpc('touch_room_presence',{p_room:rid})}catch{}
}
function bindConnectionGrace(){
  document.addEventListener('visibilitychange',()=>{
    clearTimeout(hiddenDisconnectTimer);
    if(document.hidden){
      hiddenDisconnectTimer=setTimeout(markDisconnected,12000);
    }else{
      restorePresence();
    }
  });
  window.addEventListener('pagehide',()=>{markDisconnected()});
  window.addEventListener('online',restorePresence);
}

async function init(){
 ensureInviteDialog();const {data:{user}}=await sb.auth.getUser();me=user||null;await handleInvite();
 bindConnectionGrace();await Promise.all([mountShare(),syncReadyButton(),updateRank(),watchAchievement(),checkVersion(),loadOwnerControls()]);
 setInterval(()=>{mountShare();syncReadyButton();loadOwnerControls()},1000);setInterval(()=>{updateRank();watchAchievement()},5000);setInterval(checkVersion,60000);
 sb.auth.onAuthStateChange((event,session)=>{me=session?.user||null;setTimeout(()=>{handleInvite();loadOwnerControls(true);syncReadyButton()},300)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
