import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg) throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let me=null,isAdmin=false,players=[],selectedId=null,currentTab='players',refreshTimer=null,mfaResolve=null,mfaFactorId=null,mfaChallengeId=null;
const cutoffMs=70000;

function mount(){
  if(!$('adminCabinetBtn')){
    const host=document.querySelector('header>div');
    if(host){
      const b=document.createElement('button');
      b.id='adminCabinetBtn';
      b.className='adminCabinetBtn hide';
      b.textContent='♛ Адмін';
      host.insertBefore(b,$('profileBtn')||null);
    }
  }
  if(!$('adminCabinet')){
    const s=document.createElement('section');
    s.id='adminCabinet';
    s.className='hide adminCabinet';
    s.innerHTML=`
      <div class="adminCabinetTop">
        <button id="adminBack" class="ghostBtn">← Головна</button>
        <div>
          <span class="eyebrow">TRYNKA CONTROL</span>
          <h1>Кабінет адміністратора</h1>
          <p>Гравці, монети, столи та безпека</p>
        </div>
        <button id="adminRefresh" class="adminRefresh">↻ Оновити</button>
      </div>

      <div id="adminStats" class="adminStats"></div>
      <div id="adminAnalytics" class="adminAnalytics"></div>

      <div class="adminTabs">
        <button data-admin-tab="players" class="active">👤 Гравці</button>
        <button data-admin-tab="rooms">♠ Столи</button>
        <button data-admin-tab="security">⚑ Безпека</button>
      </div>

      <div id="adminPlayersTab" class="adminTabPanel">
        <div class="adminPlayersLayout">
          <div class="adminPlayersListCard">
            <div class="adminListHead">
              <div><h2>Гравці</h2><small>Натисни на гравця, щоб керувати ним</small></div>
              <input id="adminPlayerFilter" placeholder="Пошук за ніком">
            </div>
            <div class="adminPlayerColumns"><span>Гравець</span><span>Монети</span><span>Статус</span></div>
            <div id="adminPlayerList" class="adminPlayerList"></div>
          </div>

          <div id="adminPlayerDetail" class="adminPlayerDetail">
            <div class="adminEmptySelect">
              <span>👤</span>
              <b>Вибери гравця</b>
              <small>Тут можна вручну зарахувати або списати монети.</small>
            </div>
          </div>
        </div>
      </div>

      <div id="adminRoomsTab" class="adminTabPanel hide">
        <div class="adminPanelCard">
          <div class="adminListHead"><div><h2>Активні столи</h2><small>Перегляд і закриття столів</small></div></div>
          <div id="adminCabinetRooms"></div>
        </div>
      </div>

      <div id="adminSecurityTab" class="adminTabPanel hide">
        <div class="adminSecurityGrid">
          <div class="adminPanelCard"><h2>Скарги</h2><div id="adminCabinetReports"></div></div>
          <div class="adminPanelCard"><h2>Журнал подій</h2><div id="adminCabinetEvents"></div></div>
        </div>
      </div>
    `;
    document.querySelector('main')?.appendChild(s);
  }

  if(!$('adminMfaDialog')){
    const d=document.createElement('dialog');
    d.id='adminMfaDialog';
    d.className='adminMfaDialog';
    d.innerHTML=`
      <div class="adminMfaCard">
        <div class="adminMfaHead">
          <div><span class="eyebrow">ADMIN SECURITY</span><h2 id="adminMfaTitle">Двофакторний захист</h2></div>
          <button type="button" id="adminMfaClose">×</button>
        </div>
        <p id="adminMfaText">Для входу в адмін-кабінет потрібен одноразовий код.</p>
        <div id="adminMfaSetup" class="adminMfaSetup hide">
          <img id="adminMfaQr" alt="QR для 2FA">
          <div>
            <b>1. Відскануй QR-код</b>
            <span>Google Authenticator, Microsoft Authenticator або інший TOTP-додаток.</span>
            <small>Ключ: <code id="adminMfaSecret"></code></small>
          </div>
        </div>
        <label class="adminMfaCodeLabel">Код із додатка
          <input id="adminMfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
        </label>
        <div id="adminMfaError" class="adminMfaError"></div>
        <button type="button" id="adminMfaVerify" class="adminMfaVerify">Підтвердити код</button>
        <small class="adminMfaNote">Без другого фактора зміна монет, блокування гравців та інші адмін-дії сервером заборонені.</small>
      </div>
    `;
    document.body.appendChild(d);

    const cancel=()=>{
      if(mfaResolve){const done=mfaResolve;mfaResolve=null;done(false)}
      d.close();
    };
    $('adminMfaClose').onclick=cancel;
    d.addEventListener('cancel',e=>{e.preventDefault();cancel()});
    $('adminMfaVerify').onclick=verifyAdminMfa;
    $('adminMfaCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verifyAdminMfa()}});
  }
}


async function beginAdminMfa(){
  const d=$('adminMfaDialog');
  const err=$('adminMfaError');
  const setup=$('adminMfaSetup');
  const code=$('adminMfaCode');
  if(!d)return false;

  err.textContent='';
  code.value='';
  mfaFactorId=null;
  mfaChallengeId=null;

  const aal=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal.error){
    err.textContent=aal.error.message;
    d.showModal();
    return await new Promise(resolve=>{mfaResolve=resolve});
  }
  if(aal.data?.currentLevel==='aal2')return true;

  const factors=await sb.auth.mfa.listFactors();
  if(factors.error){
    err.textContent=factors.error.message;
    d.showModal();
    return await new Promise(resolve=>{mfaResolve=resolve});
  }

  const verified=(factors.data?.totp||[]).find(x=>x.status==='verified');

  if(verified){
    $('adminMfaTitle').textContent='Підтверди вхід адміністратора';
    $('adminMfaText').textContent='Введи 6-значний код із твого Authenticator.';
    setup.classList.add('hide');
    mfaFactorId=verified.id;

    const challenge=await sb.auth.mfa.challenge({factorId:mfaFactorId});
    if(challenge.error){
      err.textContent=challenge.error.message;
    }else{
      mfaChallengeId=challenge.data.id;
    }
  }else{
    $('adminMfaTitle').textContent='Увімкни 2FA для адміністратора';
    $('adminMfaText').textContent='Це одноразове налаштування. Після нього адмін-дії вимагатимуть код із Authenticator.';
    setup.classList.remove('hide');

    for(const factor of (factors.data?.totp||[]).filter(x=>x.status!=='verified')){
      try{await sb.auth.mfa.unenroll({factorId:factor.id})}catch{}
    }

    const enroll=await sb.auth.mfa.enroll({factorType:'totp',friendlyName:'TRYNKA Admin'});
    if(enroll.error){
      err.textContent=enroll.error.message;
    }else{
      mfaFactorId=enroll.data.id;
      $('adminMfaQr').src=enroll.data.totp.qr_code;
      $('adminMfaSecret').textContent=enroll.data.totp.secret||'';
      const challenge=await sb.auth.mfa.challenge({factorId:mfaFactorId});
      if(challenge.error)err.textContent=challenge.error.message;
      else mfaChallengeId=challenge.data.id;
    }
  }

  d.showModal();
  setTimeout(()=>code.focus(),120);
  return await new Promise(resolve=>{mfaResolve=resolve});
}

async function verifyAdminMfa(){
  const err=$('adminMfaError');
  const code=($('adminMfaCode')?.value||'').trim().replace(/\s+/g,'');
  if(!mfaFactorId||!mfaChallengeId){
    err.textContent='Не вдалося створити перевірку. Закрий вікно та відкрий адмін-кабінет ще раз.';
    return;
  }
  if(!/^\d{6,8}$/.test(code)){
    err.textContent='Введи код із Authenticator.';
    return;
  }

  $('adminMfaVerify').disabled=true;
  err.textContent='Перевіряю…';
  const verify=await sb.auth.mfa.verify({
    factorId:mfaFactorId,
    challengeId:mfaChallengeId,
    code
  });
  $('adminMfaVerify').disabled=false;

  if(verify.error){
    err.textContent='Невірний або прострочений код.';
    const challenge=await sb.auth.mfa.challenge({factorId:mfaFactorId});
    if(!challenge.error)mfaChallengeId=challenge.data.id;
    $('adminMfaCode').select();
    return;
  }

  err.textContent='';
  $('adminMfaDialog').close();
  if(mfaResolve){const done=mfaResolve;mfaResolve=null;done(true)}
}

function online(p){return !!p.online_at && Date.now()-new Date(p.online_at).getTime()<cutoffMs}
function fmt(n){return Number(n||0).toLocaleString('uk-UA')}

function showOnly(id){
  ['login','lobby','profile','create','game','adminCabinet'].forEach(x=>$(x)?.classList.add('hide'));
  $(id)?.classList.remove('hide');
}

async function openAdmin(){
  if(!isAdmin)return;
  const ok=await beginAdminMfa();
  if(!ok)return;
  showOnly('adminCabinet');
  await refreshAll();
  clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>{if(!$('adminCabinet')?.classList.contains('hide'))refreshAll(false)},20000);
}

function closeAdmin(){
  clearInterval(refreshTimer);
  showOnly('lobby');
}

async function loadPlayers(){
  const {data,error}=await sb.from('profiles')
    .select('id,nickname,chips,online_at,games_played,wins,is_admin,is_bot,created_at')
    .eq('is_bot',false)
    .order('nickname',{ascending:true})
    .limit(500);
  if(error)throw error;
  players=data||[];
  renderPlayers();
}

function renderPlayers(){
  const q=($('adminPlayerFilter')?.value||'').trim().toLowerCase();
  const list=players
    .filter(p=>!q||String(p.nickname||'').toLowerCase().includes(q))
    .sort((a,b)=>Number(online(b))-Number(online(a))||Number(b.chips||0)-Number(a.chips||0));

  const box=$('adminPlayerList');
  if(!box)return;
  box.innerHTML=list.map(p=>`
    <button class="adminPlayerRow ${p.id===selectedId?'selected':''}" data-player-id="${p.id}">
      <div class="adminPlayerIdentity">
        <span class="adminAvatar">♠</span>
        <div>
          <b>${esc(p.nickname)} ${p.is_admin?'<em>ADMIN</em>':''}</b>
          <small>${p.wins||0} перемог · ${p.games_played||0} ігор</small>
        </div>
      </div>
      <strong>${fmt(p.chips)} ◉</strong>
      <span class="adminOnlineState ${online(p)?'on':''}"><i></i>${online(p)?'ОНЛАЙН':'ОФЛАЙН'}</span>
    </button>
  `).join('')||'<p class="adminMuted">Нічого не знайдено.</p>';

  box.querySelectorAll('[data-player-id]').forEach(b=>b.onclick=()=>selectPlayer(b.dataset.playerId));
}

function selectPlayer(id){
  selectedId=id;
  renderPlayers();
  const p=players.find(x=>x.id===id);
  if(!p)return;
  const d=$('adminPlayerDetail');
  d.innerHTML=`
    <div class="adminSelectedHead">
      <div class="adminBigAvatar">♠</div>
      <div>
        <span class="adminOnlineState ${online(p)?'on':''}"><i></i>${online(p)?'ОНЛАЙН':'ОФЛАЙН'}</span>
        <h2>${esc(p.nickname)}</h2>
        <small>${p.is_admin?'Адміністратор':'Гравець'}</small>
      </div>
    </div>
    <div class="adminSelectedStats">
      <div><span>Баланс</span><b id="selectedBalance">${fmt(p.chips)} ◉</b></div>
      <div><span>Ігор</span><b>${p.games_played||0}</b></div>
      <div><span>Перемог</span><b>${p.wins||0}</b></div>
    </div>

    <div class="adminCoinBox">
      <h3>Монети</h3>
      <p>Вкажи суму й зарахуй її напряму на баланс.</p>
      <div class="adminQuickCoins">
        <button data-coin="100">+100</button>
        <button data-coin="500">+500</button>
        <button data-coin="1000">+1000</button>
        <button data-coin="5000">+5000</button>
      </div>
      <label>Сума<input id="adminCoinAmount" type="number" min="1" max="100000" value="1000"></label>
      <label>Примітка<input id="adminCoinReason" maxlength="150" value="Ручне нарахування адміном"></label>
      <div class="adminCoinActions">
        <button id="adminAddCoins">＋ Зарахувати</button>
        <button id="adminRemoveCoins" class="dangerAdmin">− Списати</button>
      </div>
      <div id="adminCoinResult" class="adminCoinResult"></div>
    </div>

    ${p.id!==me?.id?`<div class="adminModerationBox">
      <h3>Модерація</h3>
      <div>
        <button data-mod="mute">Мут 1 год</button>
        <button data-mod="ban">Бан 24 год</button>
        <button data-mod="unmute">Зняти мут</button>
        <button data-mod="unban">Розбанити</button>
      </div>
    </div>`:''}
  `;

  d.querySelectorAll('[data-coin]').forEach(b=>b.onclick=()=>{$('adminCoinAmount').value=b.dataset.coin});
  $('adminAddCoins').onclick=()=>adjustCoins(1);
  $('adminRemoveCoins').onclick=()=>adjustCoins(-1);
  d.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>moderate(p.id,b.dataset.mod));
}

async function adjustCoins(sign){
  const p=players.find(x=>x.id===selectedId);if(!p)return;
  const amount=Math.trunc(Number($('adminCoinAmount')?.value||0));
  const reason=($('adminCoinReason')?.value||'Ручне коригування адміном').trim();
  if(!amount||amount<1||amount>100000)return showCoinResult('Вкажи суму від 1 до 100000',true);
  const signed=amount*sign;
  const {error}=await sb.rpc('admin_adjust_virtual_chips',{p_user:p.id,p_amount:signed,p_reason:reason});
  if(error)return showCoinResult(error.message,true);
  showCoinResult(sign>0?`Зараховано +${fmt(amount)} ◉`:`Списано -${fmt(amount)} ◉`,false);
  await loadPlayers();
  const fresh=players.find(x=>x.id===p.id);
  if(fresh){
    selectedId=fresh.id;
    selectPlayer(fresh.id);
  }
  await renderStats();
}

function showCoinResult(text,bad){
  const el=$('adminCoinResult');if(!el)return;
  el.textContent=text;el.classList.toggle('bad',!!bad);
}

async function moderate(id,action){
  let minutes=0,reason='Адмін-модерація';
  if(action==='mute'){minutes=60;reason='Мут на 1 годину'}
  if(action==='ban'){minutes=1440;reason='Бан на 24 години'}
  if((action==='mute'||action==='ban')&&!confirm(reason+'?'))return;
  const {error}=await sb.rpc('admin_set_moderation',{p_user:id,p_action:action,p_minutes:minutes,p_reason:reason});
  alert(error?error.message:'Готово ✓');
}

async function loadRooms(){
  const {data,error}=await sb.from('rooms')
    .select('id,name,max_players,ante,turn_seconds,game_status,created_at,room_players(count)')
    .order('created_at',{ascending:false})
    .limit(100);
  if(error)throw error;
  const box=$('adminCabinetRooms');if(!box)return;
  box.innerHTML=(data||[]).map(r=>`
    <div class="adminRoomRow">
      <div><b>${esc(r.name)}</b><small>${r.game_status==='playing'?'🟢 Гра':'🟡 Очікує'} · ${r.room_players?.[0]?.count||0}/${r.max_players} · ставка ${r.ante} ◉ · ${r.turn_seconds}с</small></div>
      <button data-close-room="${r.id}">Закрити</button>
    </div>
  `).join('')||'<p class="adminMuted">Столів немає.</p>';
  box.querySelectorAll('[data-close-room]').forEach(b=>b.onclick=()=>closeRoom(Number(b.dataset.closeRoom)));
}

async function closeRoom(id){
  if(!confirm('Закрити цей стіл? Активні внески буде повернено.'))return;
  const {error}=await sb.rpc('admin_close_room',{p_room:id});
  if(error)return alert(error.message);
  await loadRooms();await renderStats();
}

async function loadSecurity(){
  const [{data:reports},{data:events}]=await Promise.all([
    sb.from('player_reports')
      .select('id,reported_id,reason,status,created_at,profiles!player_reports_reported_id_fkey(nickname)')
      .eq('status','open')
      .order('created_at',{ascending:false}).limit(30),
    sb.from('security_events')
      .select('event_type,detail,created_at')
      .order('created_at',{ascending:false}).limit(50)
  ]);

  const rbox=$('adminCabinetReports');
  if(rbox)rbox.innerHTML=(reports||[]).map(r=>`
    <div class="adminSecurityRow">
      <b>${esc(r.profiles?.nickname||'Гравець')}</b>
      <span>${esc(r.reason||'Без причини')}</span>
      <small>${new Date(r.created_at).toLocaleString('uk-UA')}</small>
    </div>
  `).join('')||'<p class="adminMuted">Відкритих скарг немає.</p>';

  const ebox=$('adminCabinetEvents');
  if(ebox)ebox.innerHTML=(events||[]).map(e=>`
    <div class="adminSecurityRow ${e.event_type==='collusion_signal'?'collusion':''}">
      <b>${e.event_type==='collusion_signal'?'⚠ МОЖЛИВА ЗМОВА':esc(e.event_type)}</b>
      <span>${esc(e.detail||'')}</span>
      <small>${new Date(e.created_at).toLocaleString('uk-UA')}</small>
    </div>
  `).join('')||'<p class="adminMuted">Подій немає.</p>';
}

async function renderStats(){
  const box=$('adminStats');if(!box)return;

  const {data:stats,error}=await sb.rpc('get_admin_dashboard_stats');
  if(error){
    box.innerHTML='<div><span>Статистика</span><b>—</b></div>';
    if($('adminAnalytics'))$('adminAnalytics').innerHTML='<div class="adminPanelCard"><p class="adminMuted">Не вдалося завантажити аналітику.</p></div>';
    return;
  }

  const s=stats||{};
  box.innerHTML=`
    <div><span>Гравців</span><b>${fmt(s.players_total)}</b></div>
    <div><span>Онлайн</span><b class="green">${fmt(s.online)}</b></div>
    <div><span>Активних ігор</span><b>${fmt(s.active_games)}</b></div>
    <div><span>Ігор сьогодні</span><b>${fmt(s.games_today)}</b></div>
    <div><span>Середній банк</span><b>${fmt(s.avg_pot_today)} ◉</b></div>
    <div><span>Нових сьогодні</span><b>${fmt(s.new_players_today)}</b></div>
    <div><span>Подій безпеки</span><b>${fmt(s.security_events_today)}</b></div>
    <div><span>Підозрілих</span><b class="${Number(s.suspicious_today||0)>0?'warn':''}">${fmt(s.suspicious_today)}</b></div>
    <div><span>Сигнали змови</span><b class="${Number(s.collusion_today||0)>0?'warn':''}">${fmt(s.collusion_today)}</b></div>
  `;

  const top=Array.isArray(s.top_players)?s.top_players:[];
  const analytics=$('adminAnalytics');
  if(analytics)analytics.innerHTML=`
    <div class="adminPanelCard adminTodayCard">
      <div class="adminAnalyticsHead">
        <div><span class="eyebrow">TODAY</span><h2>Найактивніші гравці</h2></div>
        <div class="adminAnalyticsBadges"><span class="adminErrorBadge">Помилок: <b>${fmt(s.errors_today)}</b></span><span class="adminCollusionBadge">Змова: <b>${fmt(s.collusion_today)}</b></span></div>
      </div>
      <div class="adminTopPlayers">
        ${top.length?top.map((p,i)=>`<div><span>#${i+1}</span><b>${esc(p.nickname)}</b><small>${fmt(p.games)} ігор · ${fmt(p.wins)} перемог</small></div>`).join(''):'<p class="adminMuted">Сьогодні ще не було завершених ігор.</p>'}
      </div>
    </div>
  `;
}

function switchTab(tab){
  currentTab=tab;
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===tab));
  $('adminPlayersTab')?.classList.toggle('hide',tab!=='players');
  $('adminRoomsTab')?.classList.toggle('hide',tab!=='rooms');
  $('adminSecurityTab')?.classList.toggle('hide',tab!=='security');
  if(tab==='rooms')loadRooms();
  if(tab==='security')loadSecurity();
}

async function refreshAll(withRooms=true){
  await loadPlayers();
  await renderStats();
  if(selectedId&&players.some(p=>p.id===selectedId))selectPlayer(selectedId);
  if(withRooms&&currentTab==='rooms')await loadRooms();
  if(currentTab==='security')await loadSecurity();
}

async function init(){
  mount();
  const {data:{user}}=await sb.auth.getUser();
  me=user||null;
  if(!me)return;
  const {data:p}=await sb.from('profiles').select('is_admin').eq('id',me.id).maybeSingle();
  isAdmin=!!p?.is_admin;
  if(!isAdmin)return;

  $('adminCabinetBtn')?.classList.remove('hide');
  $('adminCabinetBtn').onclick=openAdmin;
  $('adminBack').onclick=closeAdmin;
  $('adminRefresh').onclick=()=>refreshAll();
  $('adminPlayerFilter').addEventListener('input',renderPlayers);
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.adminTab));

  // Legacy admin blocks/requests no longer belong on the home screen.
  $('adminPanel')?.classList.add('legacyAdminHidden');
  $('contactAdmin')?.classList.add('legacyAdminHidden');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
