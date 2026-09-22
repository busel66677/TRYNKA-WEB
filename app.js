import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;
if(!cfg||cfg.supabaseUrl.includes('PASTE_')){document.body.innerHTML='<main><div class="panel"><h2>TRYNKA ONLINE майже готова</h2><p>Спочатку треба підключити безкоштовний Supabase-проєкт. Встав URL і anon key у <b>config.js</b>.</p></div></main>';throw new Error('Supabase config missing')}
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
let user=null,profile=null,currentRoom=null,channel=null;
const $=id=>document.getElementById(id), sections=['login','lobby','create','game'];
function show(id){sections.forEach(x=>$(x).classList.add('hide'));$(id).classList.remove('hide')}
function authView(which){$('authLogin').classList.toggle('hide',which!=='login');$('authRegister').classList.toggle('hide',which!=='register')}
$('showRegister').onclick=()=>authView('register');
$('showLogin').onclick=()=>authView('login');

async function boot(){const {data}=await sb.auth.getSession();if(data.session){user=data.session.user;await loadProfile()}else{show('login');authView('login')}}
$('registerForm').onsubmit=async e=>{
 e.preventDefault();
 const email=$('regEmail').value.trim().toLowerCase(),nickname=$('regNick').value.trim(),password=$('regPassword').value,password2=$('regPassword2').value;
 if(password!==password2)return alert('Паролі не співпадають');
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{nickname}}});
 if(error)return alert(error.message);
 if(data.session){
   user=data.user;
   await sb.from('profiles').upsert({id:user.id,nickname});
   await loadProfile();
 }else{
   alert('Акаунт створено ✓ Перевір свою електронну пошту та підтвердь реєстрацію. Після цього повернись і увійди.');
   authView('login');
   $('loginEmail').value=email;
 }
};
$('loginForm').onsubmit=async e=>{
 e.preventDefault();
 const email=$('loginEmail').value.trim().toLowerCase(),password=$('loginPassword').value;
 const {data,error}=await sb.auth.signInWithPassword({email,password});
 if(error)return alert('Не вдалося увійти. Перевір email, пароль і чи підтверджена пошта.');
 user=data.user;
 let {data:p}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
 if(!p){
   const nickname=user.user_metadata?.nickname||email.split('@')[0].slice(0,20);
   await sb.from('profiles').upsert({id:user.id,nickname});
 }
 await loadProfile();
};
$('logoutBtn').onclick=async()=>{if(currentRoom)await leaveRoom();await sb.auth.signOut();user=null;profile=null;$('logoutBtn').classList.add('hide');$('me').textContent='Гість';show('login');authView('login')};
async function loadProfile(){const {data}=await sb.from('profiles').select('*').eq('id',user.id).single();profile=data;if(!profile){await sb.auth.signOut();return alert('Профіль не знайдено')} $('me').textContent=profile.nickname||'Гравець';$('logoutBtn').classList.remove('hide');show('lobby');await refreshLobby();await refreshAdminPanel();subscribeLobby()}
$('newRoom').onclick=()=>show('create');document.querySelectorAll('.back').forEach(b=>b.onclick=()=>leaveRoom());
$('createForm').onsubmit=async e=>{e.preventDefault();const room={owner_id:user.id,name:$('roomName').value.trim()||'Мій стіл',max_players:+$('maxPlayers').value,turn_seconds:+$('turnTime').value,ante:+$('ante').value};const {data,error}=await sb.from('rooms').insert(room).select().single();if(error)return alert(error.message);await sb.from('room_players').insert({room_id:data.id,user_id:user.id});openRoom(data.id)}
async function refreshLobby(){const {data:rooms}=await sb.from('rooms').select('*,room_players(count)').order('created_at',{ascending:false});$('rooms').innerHTML='';(rooms||[]).filter(r=>(r.room_players?.[0]?.count||0)>0).forEach(r=>{let d=document.createElement('div');d.className='room';d.innerHTML=`<div><b>${esc(r.name)}</b><p>${r.room_players[0].count}/${r.max_players} • ${r.turn_seconds} сек • ставка ${r.ante} ◉</p></div><button>Зайти</button>`;d.querySelector('button').onclick=()=>joinRoom(r);$('rooms').appendChild(d)});if(!$('rooms').children.length)$('rooms').innerHTML='<p>Активних столів поки немає. Створи перший.</p>';await refreshFriends();await refreshInvites()}
async function joinRoom(r){const {count}=await sb.from('room_players').select('*',{count:'exact',head:true}).eq('room_id',r.id);if(count>=r.max_players)return alert('Стіл заповнений');await sb.from('room_players').upsert({room_id:r.id,user_id:user.id});openRoom(r.id)}
async function openRoom(id){currentRoom=id;show('game');await renderRoom();if(channel)sb.removeChannel(channel);channel=sb.channel('room-'+id).on('postgres_changes',{event:'*',schema:'public',table:'room_players',filter:`room_id=eq.${id}`},renderRoom).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${id}`},p=>addMessage(p.new)).subscribe()}
async function renderRoom(){const {data:r}=await sb.from('rooms').select('*').eq('id',currentRoom).single();if(!r)return leaveRoom();$('roomTitle').textContent=r.name;const {data:ps}=await sb.from('room_players').select('user_id,profiles(nickname)').eq('room_id',currentRoom);$('players').innerHTML=(ps||[]).map(x=>`<div class="seat">${esc(x.profiles?.nickname||'Гравець')}</div>`).join('');$('pot').textContent=(r.ante*(ps?.length||1))+' ◉';const {data:ms}=await sb.from('messages').select('*,profiles(nickname)').eq('room_id',currentRoom).order('created_at').limit(50);$('messages').innerHTML='';(ms||[]).forEach(addMessage)}
async function leaveRoom(){if(currentRoom){await sb.from('room_players').delete().eq('room_id',currentRoom).eq('user_id',user.id);const {count}=await sb.from('room_players').select('*',{count:'exact',head:true}).eq('room_id',currentRoom);if(count===0)await sb.from('rooms').delete().eq('id',currentRoom);currentRoom=null}if(channel){sb.removeChannel(channel);channel=null}show('lobby');refreshLobby()}
$('chatForm').onsubmit=async e=>{e.preventDefault();let body=$('chatInput').value.trim();if(!body)return;await sb.from('messages').insert({room_id:currentRoom,user_id:user.id,body});$('chatInput').value=''}
function addMessage(m){let p=document.createElement('p');p.textContent=(m.profiles?.nickname||profile?.nickname||'Гравець')+': '+m.body;$('messages').appendChild(p);$('messages').scrollTop=$('messages').scrollHeight}
$('friendForm').onsubmit=async e=>{e.preventDefault();const n=$('friendNick').value.trim();const {data:p}=await sb.from('profiles').select('id,nickname').eq('nickname',n).maybeSingle();if(!p)return alert('Гравця не знайдено');if(p.id===user.id)return;await sb.from('friends').upsert({user_id:user.id,friend_id:p.id});$('friendNick').value='';refreshFriends()}
async function refreshFriends(){const {data}=await sb.from('friends').select('friend_id,profiles!friends_friend_id_fkey(nickname)').eq('user_id',user.id);$('friends').innerHTML=(data||[]).map(f=>`<div class="friend">🟢 <b>${esc(f.profiles.nickname)}</b></div>`).join('')||'<p>Друзів ще немає.</p>'}
$('inviteBtn').onclick=async()=>{const {data}=await sb.from('friends').select('friend_id,profiles!friends_friend_id_fkey(nickname)').eq('user_id',user.id);$('inviteFriends').innerHTML='';(data||[]).forEach(f=>{let b=document.createElement('button');b.textContent='Запросити '+f.profiles.nickname;b.onclick=async()=>{await sb.from('invites').insert({room_id:currentRoom,from_user:user.id,to_user:f.friend_id});b.textContent='Запрошено ✓';b.disabled=true};$('inviteFriends').appendChild(b)});inviteDialog.showModal()}
async function refreshInvites(){const {data}=await sb.from('invites').select('id,room_id,profiles!invites_from_user_fkey(nickname),rooms(name)').eq('to_user',user.id).eq('status','pending');$('invites').innerHTML='';(data||[]).forEach(i=>{let d=document.createElement('div');d.className='invite';d.innerHTML=`<b>${esc(i.profiles.nickname)}</b> запрошує: ${esc(i.rooms?.name||'стіл')} `;let b=document.createElement('button');b.textContent='Прийняти';b.onclick=async()=>{await sb.from('invites').update({status:'accepted'}).eq('id',i.id);await sb.from('room_players').upsert({room_id:i.room_id,user_id:user.id});openRoom(i.room_id)};d.appendChild(b);$('invites').appendChild(d)});if(!$('invites').children.length)$('invites').innerHTML='<p>Немає нових.</p>'}
function subscribeLobby(){sb.channel('lobby').on('postgres_changes',{event:'*',schema:'public',table:'rooms'},refreshLobby).on('postgres_changes',{event:'*',schema:'public',table:'room_players'},refreshLobby).on('postgres_changes',{event:'INSERT',schema:'public',table:'invites',filter:`to_user=eq.${user.id}`},refreshInvites).subscribe()}
document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{$('turnStatus').textContent=b.textContent.trim()});
document.querySelectorAll('.card').forEach(card=>{let c=card.querySelector('.cover'),sy=0,base=0,drag=false;card.onpointerdown=e=>{drag=true;sy=e.clientY;base=+(c.dataset.y||0);card.setPointerCapture(e.pointerId)};card.onpointermove=e=>{if(!drag)return;let y=Math.max(0,Math.min(card.clientHeight,base+e.clientY-sy));c.dataset.y=y;c.style.transform=`translateY(${y}px)`};card.onpointerup=()=>drag=false});

// Admin requests for virtual chips. Admin access is enforced in SQL, not by nickname.
if($('contactAdmin'))$('contactAdmin').onclick=()=>$('adminDialog').showModal();
if($('closeAdminDialog'))$('closeAdminDialog').onclick=()=>$('adminDialog').close();
if($('adminRequestForm'))$('adminRequestForm').onsubmit=async e=>{e.preventDefault();const amount=+$('chipAmount').value,message=$('adminRequestText').value.trim();const {error}=await sb.from('chip_requests').insert({user_id:user.id,amount,message,status:'pending'});if(error)return alert(error.message);$('adminDialog').close();alert('Заявку надіслано адміну ✓')};
async function refreshAdminPanel(){
 if(!profile||!$('adminPanel'))return;
 const {data:isAdmin}=await sb.rpc('is_admin');
 if(!isAdmin){$('adminPanel').classList.add('hide');return}
 $('adminPanel').classList.remove('hide');
 const {data,error}=await sb.from('chip_requests').select('id,user_id,amount,message,profiles(nickname)').eq('status','pending').order('created_at');
 if(error){$('chipRequests').textContent='Помилка завантаження заявок';return}
 $('chipRequests').innerHTML='';
 (data||[]).forEach(r=>{let d=document.createElement('div');d.className='invite';d.innerHTML=`<b>${esc(r.profiles?.nickname||'Гравець')}</b> — ${r.amount} ◉${r.message?' — '+esc(r.message):''} `;let b=document.createElement('button');b.textContent='Нарахувати';b.onclick=async()=>{const {error}=await sb.rpc('grant_virtual_chips',{target_user:r.user_id,chip_amount:r.amount,request_id:r.id});if(error)return alert(error.message);await refreshAdminPanel();alert('Фішки нараховано ✓')};d.appendChild(b);$('chipRequests').appendChild(d)});
 if(!$('chipRequests').children.length)$('chipRequests').innerHTML='<p>Нових заявок немає.</p>';
}

function esc(s=''){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}boot();
