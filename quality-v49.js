import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing TRYNKA config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
let me=null,isAdmin=false,lastStrengthKey='',lastLoggedError='',lastErrorAt=0;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function currentRoomId(){
  try{const x=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');return x.view==='game'&&x.roomId?Number(x.roomId):null}catch{return null}
}
function mountDialogs(){
  if(!$('rulesDialog')){
    const d=document.createElement('dialog');d.id='rulesDialog';d.className='qualityDialog';
    d.innerHTML='<div class="qualityDialogHead"><div><span class="eyebrow">TRYNKA ONLINE</span><h2>Правила гри</h2></div><button data-close-rules>×</button></div>'+
      '<div class="rulesGrid">'+
      '<section><h3>🃏 Колода</h3><p>36 карт: 6, 7, 8, 9, 10, J, Q, K, A — по 4 масті.</p></section>'+
      '<section><h3>🔢 Очки</h3><p>Туз = 11. K, Q, J і 10 = 10. 9–6 — за номіналом.</p></section>'+
      '<section class="rulesWide"><h3>🏆 Сила комбінацій</h3><p><b>666</b> — найсильніша. Далі <b>AAA → KKK → QQQ → JJJ → 10-10-10 → 999 → 888 → 777</b>. Після всіх трійок ідуть звичайні суми: 31, 30, 29…</p></section>'+
      '<section><h3>♠ Підрахунок</h3><p>Рахується найкраща сума карт <b>однієї масті</b>. Наприклад A♠ + K♠ + Q♠ = 31.</p></section>'+
      '<section><h3>✨ Два тузи</h3><p>Два тузи однієї масті дають <b>22</b>.</p></section>'+
      '<section><h3>🎴 Різні масті</h3><p>Якщо всі три карти різних мастей — рахується лише найстарша карта.</p></section>'+
      '<section><h3>👁 Вскриття</h3><p>Вскриватися можна з другого кола. Карти двох гравців відкриваються біля їхніх місць.</p></section>'+
      '<section class="rulesWide"><h3>🤝 Свара</h3><p>Якщо найкращі комбінації однакові — <b>СВАРА</b>. Банк переходить у наступну роздачу, а новий раунд починається після 5-секундного відліку.</p></section>'+
      '</div><button class="qualityPrimary" data-close-rules>Зрозуміло</button>';
    document.body.appendChild(d);
    d.querySelectorAll('[data-close-rules]').forEach(b=>b.onclick=()=>d.close());
  }

  if(!$('settingsDialog')){
    const d=document.createElement('dialog');d.id='settingsDialog';d.className='qualityDialog';
    d.innerHTML='<div class="qualityDialogHead"><div><span class="eyebrow">ГРА</span><h2>Налаштування</h2></div><button data-close-settings>×</button></div>'+
      '<div class="settingRows">'+
      '<label><span><b>🔊 Звуки</b><small>Карти, ставки, перемога</small></span><input id="settingSound" type="checkbox"></label>'+
      '<label><span><b>📳 Вібрація</b><small>Коли настає ваш хід</small></span><input id="settingVibrate" type="checkbox"></label>'+
      '<label><span><b>🔔 Сповіщення</b><small>Коли вкладка неактивна</small></span><input id="settingNotify" type="checkbox"></label>'+
      '<label><span><b>🎴 Швидкість роздачі</b><small>Повільно, нормально, швидко або без анімації</small></span><select id="settingAnimSpeed"><option value="slow">Повільно</option><option value="normal">Нормально</option><option value="fast">Швидко</option><option value="off">Без анімації</option></select></label>'+
      '</div><button id="requestNotifyPermission" class="qualitySecondary">Дозволити сповіщення браузера</button><button class="qualityPrimary" data-close-settings>Готово</button>';
    document.body.appendChild(d);
    d.querySelectorAll('[data-close-settings]').forEach(b=>b.onclick=()=>d.close());
    const bind=(id,key)=>{const x=$(id);x.checked=localStorage.getItem(key)!=='off';x.onchange=()=>localStorage.setItem(key,x.checked?'on':'off')};
    bind('settingSound','trynkaSound');bind('settingVibrate','trynkaVibrate');bind('settingNotify','trynkaNotify');
    const speed=$('settingAnimSpeed');speed.value=localStorage.getItem('trynkaAnimSpeed')||'normal';speed.onchange=()=>localStorage.setItem('trynkaAnimSpeed',speed.value);
    $('requestNotifyPermission').onclick=async()=>{
      if(!('Notification'in window))return alert('Цей браузер не підтримує сповіщення.');
      const p=await Notification.requestPermission();
      alert(p==='granted'?'Сповіщення увімкнено.':'Дозвіл на сповіщення не надано.');
    };
  }
}
function mountUtilities(){
  const tiles=document.querySelector('#lobby .menuTiles');if(!tiles)return;
  let bar=$('homeUtilityBar');
  if(!bar){
    bar=document.createElement('div');bar.id='homeUtilityBar';bar.className='homeUtilityBar';
    bar.innerHTML='<button id="openRules"><span>?</span><b>Правила</b><small>Комбінації та хід гри</small></button>'+
      '<button id="openSettings"><span>⚙</span><b>Налаштування</b><small>Звук, вібрація, сповіщення</small></button>';
    tiles.insertAdjacentElement('afterend',bar);
    $('openRules').onclick=()=>$('rulesDialog').showModal();
    $('openSettings').onclick=()=>$('settingsDialog').showModal();
  }
}
function ensureStrength(){
  const old=document.getElementById('handStrengthBadge');
  if(old)old.remove();
  return null;
}
async function updateStrength(){
  const old=document.getElementById('handStrengthBadge');
  if(old)old.remove();
}
async function enhanceSvara(){
  if($('game')?.classList.contains('hide'))return;
  const room=currentRoomId();if(!room)return;
  const {data:g}=await sb.from('game_rounds').select('id,status,result_note,pot').eq('room_id',room).order('id',{ascending:false}).limit(1).maybeSingle();
  if(g?.status==='finished'&&g.result_note==='Свара'){
    if($('countdown')&&!String($('countdown').textContent).startsWith('Старт через'))$('countdown').textContent='СВАРА — БАНК '+Number(g.pot||0)+' ◉ ПЕРЕХОДИТЬ ДАЛІ';
    if($('turnStatus'))$('turnStatus').textContent='Наступна роздача через 5 секунд';
  }
}
async function logClientError(message,context='window'){
  const now=Date.now(),msg=String(message||'unknown').slice(0,450);
  if(msg===lastLoggedError&&now-lastErrorAt<15000)return;
  lastLoggedError=msg;lastErrorAt=now;
  try{await sb.rpc('log_client_error',{p_message:msg,p_context:context,p_room:currentRoomId()})}catch{}
}
function mountErrorLogging(){
  window.addEventListener('error',e=>logClientError(e.message||'JavaScript error','window.error'));
  window.addEventListener('unhandledrejection',e=>logClientError(e.reason?.message||String(e.reason||'Unhandled promise'),'unhandledrejection'));
}
async function mountAdminErrors(){
  if(!isAdmin)return;
  const host=$('adminSecurityTab');if(!host)return;
  let card=$('adminClientErrorsCard');
  if(!card){
    card=document.createElement('section');card.id='adminClientErrorsCard';card.className='adminPanelCard adminClientErrorsCard';
    card.innerHTML='<div class="adminAnalyticsHead"><div><span class="eyebrow">CLIENT</span><h2>Останні помилки сайту</h2></div></div><div id="adminClientErrorsList"></div>';
    host.prepend(card);
  }
  if(host.classList.contains('hide'))return;
  const {data}=await sb.from('security_events').select('detail,created_at,room_id,profiles(nickname)').eq('event_type','client_error').order('created_at',{ascending:false}).limit(20);
  const list=$('adminClientErrorsList');if(!list)return;
  list.innerHTML=(data||[]).map(x=>'<div class="adminSecurityRow clientError"><b>'+esc(x.profiles?.nickname||'Гравець')+(x.room_id?' · стіл '+x.room_id:'')+'</b><span>'+esc(x.detail||'')+'</span><small>'+new Date(x.created_at).toLocaleString('uk-UA')+'</small></div>').join('')||'<p class="adminMuted">Клієнтських помилок ще немає.</p>';
}
async function init(){
  mountDialogs();mountUtilities();mountErrorLogging();
  const {data:{user}}=await sb.auth.getUser();me=user||null;
  if(me){const {data:p}=await sb.from('profiles').select('is_admin').eq('id',me.id).maybeSingle();isAdmin=!!p?.is_admin}
  await updateStrength();await enhanceSvara();await mountAdminErrors();
  setInterval(()=>{mountUtilities();updateStrength();enhanceSvara();mountAdminErrors()},6000);
  document.addEventListener('trynka:reconnected',()=>{updateStrength();enhanceSvara()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
