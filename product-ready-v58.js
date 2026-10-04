import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
const BUILD=document.querySelector('meta[name="trynka-build"]')?.content||'unknown';
let me=null,lastRankAt=0,lastAchievementAt=0;

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

async function init(){
 ensureInviteDialog();const {data:{user}}=await sb.auth.getUser();me=user||null;await handleInvite();
 await Promise.all([mountShare(),syncReadyButton(),updateRank(),watchAchievement(),checkVersion()]);
 setInterval(()=>{mountShare();syncReadyButton()},1000);setInterval(()=>{updateRank();watchAchievement()},5000);setInterval(checkVersion,60000);
 sb.auth.onAuthStateChange(()=>setTimeout(handleInvite,300));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
