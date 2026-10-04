import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
let me=null,lastRecapRound=null,lastProfileExtras=0;
window.TRYNKA_BLOCKED_USERS=window.TRYNKA_BLOCKED_USERS||new Set();

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rid(){try{const x=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');return x.view==='game'&&x.roomId?Number(x.roomId):null}catch{return null}}
function shareUrl(param,value){const u=new URL(location.origin+location.pathname);u.searchParams.set(param,value);return u.toString()}
async function copy(v){try{await navigator.clipboard.writeText(v);return true}catch{return false}}

async function loadBlocks(){
  if(!me)return;
  const {data}=await sb.from('player_blocks').select('blocked_user_id').eq('blocker_id',me.id);
  window.TRYNKA_BLOCKED_USERS=new Set((data||[]).map(x=>x.blocked_user_id));
  document.querySelectorAll('#messages [data-user-id]').forEach(x=>{if(window.TRYNKA_BLOCKED_USERS.has(x.dataset.userId))x.remove()});
}
async function setBlock(uid,block){
  const {error}=await sb.rpc('set_player_block',{p_user:uid,p_block:block});
  if(error)return alert(error.message);
  await loadBlocks();await renderProfileExtras();await syncBlockButton(uid);
}
async function syncBlockButton(uid){
  const host=document.querySelector('.publicProfileActions');if(!host||!uid||uid===me?.id)return;
  let b=$('publicProfileBlock');if(!b){b=document.createElement('button');b.id='publicProfileBlock';b.className='ignorePlayerBtn';host.prepend(b)}
  const blocked=window.TRYNKA_BLOCKED_USERS.has(uid);
  b.textContent=blocked?'✓ Не ігнорувати':'🚫 Ігнорувати';
  b.onclick=()=>setBlock(uid,!blocked);
}
function wrapProfile(){
  if(!window.TRYNKA_OPEN_PLAYER_PROFILE||window.TRYNKA_OPEN_PLAYER_PROFILE._communityWrapped)return;
  const old=window.TRYNKA_OPEN_PLAYER_PROFILE;
  const wrapped=async uid=>{await old(uid);await syncBlockButton(uid)};
  wrapped._communityWrapped=true;window.TRYNKA_OPEN_PLAYER_PROFILE=wrapped;
}

async function renderProfileExtras(){
  if(!me||Date.now()-lastProfileExtras<2500)return;lastProfileExtras=Date.now();
  const host=document.querySelector('#profile .profileHistoryGrid');if(!host)return;
  let recent=$('recentOpponentsPanel'),blocked=$('blockedPlayersPanel');
  if(!recent){recent=document.createElement('div');recent.id='recentOpponentsPanel';recent.className='panel communityPanel';recent.innerHTML='<h2>Останні суперники</h2><div id="recentOpponents"></div>';host.appendChild(recent)}
  if(!blocked){blocked=document.createElement('div');blocked.id='blockedPlayersPanel';blocked.className='panel communityPanel';blocked.innerHTML='<h2>Ігноровані гравці</h2><div id="blockedPlayers"></div>';host.appendChild(blocked)}
  const {data:opp}=await sb.rpc('get_recent_opponents',{p_limit:10});
  $('recentOpponents').innerHTML=(opp||[]).map(x=>'<button class="opponentRow" '+(x.user_id?'data-profile="'+x.user_id+'"':'disabled')+'><span><b>'+esc(x.nickname)+'</b><small>'+Number(x.games_together||0)+' спільних ігор</small></span><em>'+new Date(x.last_played).toLocaleDateString('uk-UA')+'</em></button>').join('')||'<p class="muted">Суперників ще немає.</p>';
  $('recentOpponents').querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>window.TRYNKA_OPEN_PLAYER_PROFILE?.(b.dataset.profile));

  const ids=[...window.TRYNKA_BLOCKED_USERS];
  let profiles=[];
  if(ids.length){const {data}=await sb.from('profiles').select('id,nickname').in('id',ids);profiles=data||[]}
  $('blockedPlayers').innerHTML=profiles.map(p=>'<div class="blockedRow"><b>'+esc(p.nickname)+'</b><button data-unblock="'+p.id+'">Не ігнорувати</button></div>').join('')||'<p class="muted">Список порожній.</p>';
  $('blockedPlayers').querySelectorAll('[data-unblock]').forEach(b=>b.onclick=()=>setBlock(b.dataset.unblock,false));
}

function mountRulesAtTable(){
  const host=$('tableExtras');if(!host||$('tableRulesBtn'))return;
  const b=document.createElement('button');b.id='tableRulesBtn';b.className='tableRulesBtn';b.textContent='? Правила';b.onclick=()=>$('rulesDialog')?.showModal();host.appendChild(b);
}

async function mountTemplates(){
  const form=$('createForm');if(!form||$('roomTemplateBar')||!me)return;
  const bar=document.createElement('div');bar.id='roomTemplateBar';bar.className='roomTemplateBar';
  bar.innerHTML='<select id="roomTemplateSelect"><option value="">Шаблон столу…</option></select><button type="button" id="saveRoomTemplate">Зберегти шаблон</button><button type="button" id="deleteRoomTemplate" class="ghostTemplate">Видалити</button>';
  form.prepend(bar);
  await refreshTemplates();
  $('roomTemplateSelect').onchange=async()=>{
    const id=Number($('roomTemplateSelect').value);if(!id)return;
    const {data}=await sb.from('room_templates').select('*').eq('id',id).maybeSingle();if(!data)return;
    $('roomName').value=data.room_name;$('maxPlayers').value=String(data.max_players);$('turnTime').value=String(data.turn_seconds);$('ante').value=String(data.ante);if($('privateRoomToggle'))$('privateRoomToggle').checked=!!data.is_private;
  };
  $('saveRoomTemplate').onclick=async()=>{
    const name=prompt('Назва шаблону:','Мій стандартний стіл');if(!name)return;
    const row={user_id:me.id,name:name.trim().slice(0,40),room_name:$('roomName').value.trim()||'Мій стіл',max_players:Number($('maxPlayers').value),turn_seconds:Number($('turnTime').value),ante:Number($('ante').value),is_private:!!$('privateRoomToggle')?.checked,updated_at:new Date().toISOString()};
    const {error}=await sb.from('room_templates').insert(row);if(error)return alert(error.message);await refreshTemplates();alert('Шаблон збережено ✓');
  };
  $('deleteRoomTemplate').onclick=async()=>{const id=Number($('roomTemplateSelect').value);if(!id)return;await sb.from('room_templates').delete().eq('id',id);await refreshTemplates()};
}
async function refreshTemplates(){
  const s=$('roomTemplateSelect');if(!s||!me)return;
  const current=s.value;const {data}=await sb.from('room_templates').select('id,name').eq('user_id',me.id).order('updated_at',{ascending:false});
  s.innerHTML='<option value="">Шаблон столу…</option>'+(data||[]).map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('');if([...s.options].some(o=>o.value===current))s.value=current;
}

window.TRYNKA_INVITE_SEAT=async(room,seat)=>{
  const {data,error}=await sb.rpc('create_seat_invite',{p_room:Number(room),p_seat:Number(seat)});if(error)return alert(error.message);
  const url=shareUrl('seatInvite',String(data));
  if(navigator.share){try{await navigator.share({title:'TRYNKA ONLINE',text:'Заходь саме на це місце за моїм столом.',url});return}catch{}}
  await copy(url);alert('Посилання на місце скопійовано ✓');
};
async function handleSeatInvite(){
  const u=new URL(location.href),from=u.searchParams.get('seatInvite'),token=(from||sessionStorage.getItem('trynka_pending_seat_invite')||'').trim();if(!token)return;
  if(from)sessionStorage.setItem('trynka_pending_seat_invite',token);
  if(!me)return;
  const {data:info,error}=await sb.rpc('get_seat_invite_info',{p_token:token});if(error){sessionStorage.removeItem('trynka_pending_seat_invite');if(from)alert(error.message);return}
  const amount=Number(prompt('Запрошення за стіл «'+info.room_name+'», місце '+(Number(info.seat_no)+1)+'.\nСкільки фішок взяти? Мінімум '+info.ante+':',String(Math.max(Number(info.ante),100))));
  if(!amount)return;
  const {data,error:e}=await sb.rpc('redeem_seat_invite',{p_token:token,p_buyin:amount});if(e)return alert(e.message);
  sessionStorage.removeItem('trynka_pending_seat_invite');u.searchParams.delete('seatInvite');history.replaceState({},'',u.pathname+(u.search||'')+u.hash);
  if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(Number(data.room_id));
}

async function roundRecap(){
  const room=rid();if(!room||$('game')?.classList.contains('hide'))return;
  const {data:g}=await sb.from('game_rounds').select('id,status,winner_id,result_note,pot,dealer_fee,finished_at').eq('room_id',room).order('id',{ascending:false}).limit(1).maybeSingle();
  if(!g||g.status!=='finished'||g.id===lastRecapRound)return;lastRecapRound=g.id;
  let winner='';if(g.winner_id){const {data:p}=await sb.from('profiles').select('nickname').eq('id',g.winner_id).maybeSingle();winner=p?.nickname||'Гравець'}
  const {data:rps}=await sb.from('round_players').select('revealed').eq('round_id',g.id);
  const revealed=(rps||[]).filter(x=>x.revealed).length;
  let box=$('roundRecap');if(!box){box=document.createElement('div');box.id='roundRecap';box.className='roundRecap';document.querySelector('#game .table')?.appendChild(box)}
  const payout=Math.max(0,Number(g.pot||0)-Number(g.dealer_fee||0));
  box.innerHTML=g.result_note==='Свара'?'<b>🤝 СВАРА</b><span>Банк '+Number(g.pot||0)+' ◉ переходить далі</span>':'<b>🏆 '+esc(winner||'Роздачу завершено')+'</b><span>Банк '+payout+' ◉'+(revealed?' · вскрились: '+revealed:'')+'</span>';
  box.classList.add('show');setTimeout(()=>box.classList.remove('show'),4500);
}

async function init(){
  const {data:{user}}=await sb.auth.getUser();me=user||null;
  if(!me)return;
  await loadBlocks();wrapProfile();mountRulesAtTable();await mountTemplates();await renderProfileExtras();await handleSeatInvite();await roundRecap();
  setInterval(()=>{wrapProfile();mountRulesAtTable();mountTemplates();renderProfileExtras();roundRecap()},1800);
  sb.auth.onAuthStateChange((_,session)=>{me=session?.user||null;if(me)setTimeout(()=>{loadBlocks();handleSeatInvite()},250)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
