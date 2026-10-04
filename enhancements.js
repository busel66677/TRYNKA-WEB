import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)return;const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const $=id=>document.getElementById(id);let soundOn=localStorage.getItem('trynkaSound')!=='off',me=null,lastReaction=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function tone(f=440,d=.05,v=.018){if(!soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext,a=new A(),o=a.createOscillator(),g=a.createGain();o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(a.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+d);o.stop(a.currentTime+d)}catch{}}
function sound(){const h=document.querySelector('header>div');if(!h||$('soundToggle'))return;const b=document.createElement('button');b.id='soundToggle';b.className='soundToggle';b.textContent=soundOn?'🔊':'🔇';b.onclick=()=>{soundOn=!soundOn;localStorage.setItem('trynkaSound',soundOn?'on':'off');b.textContent=soundOn?'🔊':'🔇'};h.prepend(b)}
async function session(){const {data}=await sb.auth.getSession();me=data.session?.user||null;return me}
function mount(){if(!$('v2Hub')&&$('tablesArea')){$('tablesArea').insertAdjacentHTML('afterend',`<section id="v2Hub" class="v2Hub"><div class="v2Card hot"><div class="v2Head"><div><span class="eyebrow">LIVE</span><h2>🔥 Зараз грають</h2></div><button id="refreshHot">Оновити</button></div><div id="hotTables"></div></div><div class="v2Card"><div class="v2Head"><div><span class="eyebrow">PRIVATE</span><h2>Приватний стіл</h2></div></div><div class="codeJoin"><input id="privateCode" maxlength="12" placeholder="Код столу"><button id="joinPrivate">Увійти</button></div><small>Введи код, який надіслав друг.</small></div><div class="v2Card"><div class="v2Head"><div><span class="eyebrow">RATING</span><h2>🏆 Ліга</h2></div></div><div id="leagueBox"></div></div><div class="v2Card"><div class="v2Head"><div><span class="eyebrow">ACHIEVEMENTS</span><h2>Досягнення</h2></div></div><div id="achievementsBox"></div></div><div class="v2Card wide"><div class="v2Head"><div><span class="eyebrow">TOURNAMENTS</span><h2>Турніри</h2></div></div><div id="tournamentsBox"></div></div></section>`)}
 if(!$('tableExtras')&&document.querySelector('.gameTopActions'))document.querySelector('.gameTopActions').insertAdjacentHTML('afterend',`<div id="tableExtras" class="tableExtras"><button id="readyBtn">✓ ГОТОВИЙ</button><button id="spectateBtn">👁 Спостерігати</button><div class="reactions"><button>👍</button><button>😂</button><button>😡</button><button>😎</button><button>👏</button></div></div>`);
}
function league(xp=0){if(xp>=5000)return['Майстер','♛'];if(xp>=2500)return['Золото','◆'];if(xp>=1000)return['Срібло','◇'];if(xp>=300)return['Бронза','●'];return['Новачок','○']}
async function loadHub(){if(!$('v2Hub')||!me)return;const cutoff=new Date(Date.now()-70000).toISOString();const [{data:rooms},{data:p},{data:achs},{data:mineA},{data:ts}]=await Promise.all([sb.from('rooms').select('id,name,max_players,ante,game_status,spectator_count,room_players(count)').order('created_at',{ascending:false}).limit(8),sb.from('profiles').select('xp,level,wins,games_played,best_win_streak').eq('id',me.id).single(),sb.from('achievements').select('*').order('title'),sb.from('player_achievements').select('achievement_key').eq('user_id',me.id),sb.from('tournaments').select('*,tournament_players(count)').order('created_at',{ascending:false}).limit(6)]);const hot=(rooms||[]).filter(r=>(r.room_players?.[0]?.count||0)>0).slice(0,5);$('hotTables').innerHTML=hot.map(r=>`<div class="hotRow"><div><b>${esc(r.name)}</b><small>${r.game_status==='playing'?'🟢 Грають':'🟡 Очікують'} · 👥 ${r.room_players?.[0]?.count||0}/${r.max_players} · 👁 ${r.spectator_count||0}</small></div><button data-watch="${r.id}">Дивитися</button></div>`).join('')||'<p class="muted">Поки немає активних столів.</p>';const [ln,icon]=league(p?.xp||0);$('leagueBox').innerHTML=`<div class="leagueHero"><span>${icon}</span><div><b>${ln}</b><small>Рівень ${p?.level||1} · ${p?.xp||0} XP</small></div></div><div class="miniStats"><span>🏆 ${p?.wins||0} перемог</span><span>🔥 серія ${p?.best_win_streak||0}</span></div>`;const unlocked=new Set((mineA||[]).map(x=>x.achievement_key));$('achievementsBox').innerHTML=(achs||[]).map(a=>`<div class="achievement ${unlocked.has(a.key)?'unlocked':''}"><span>${unlocked.has(a.key)?'★':'☆'}</span><div><b>${esc(a.title)}</b><small>${esc(a.description)}</small></div></div>`).join('')||'<p class="muted">Досягнення готуються.</p>';$('tournamentsBox').innerHTML=(ts||[]).map(t=>`<div class="tournamentRow"><div><b>${esc(t.name)}</b><small>${t.status==='registration'?'Реєстрація':'Статус: '+esc(t.status)} · ${t.tournament_players?.[0]?.count||0}/${t.max_players}</small></div>${t.status==='registration'?`<button data-tournament="${t.id}">Вступити</button>`:''}</div>`).join('')||'<p class="muted">Найближчих турнірів ще немає.</p>'}
const ratingAvatarIcons={spade:'♠',cards:'🃏',hat:'🎩',shield:'🛡️',trophy:'🏆',eagle:'🦅',fire:'🔥',star:'⭐',diamond:'💎',crown:'👑'};
function ratingAvatar(key){return ratingAvatarIcons[key]||'♠'}
async function leaderboard(){
  let box=$('leaderboardBox');
  if(!box&&$('tablesArea')){
    box=document.createElement('section');
    box.id='leaderboardBox';
    box.className='leaderboardBox';
    $('tablesArea').after(box);
  }
  if(!box)return;

  const {data,error}=await sb.rpc('get_season_leaderboard',{p_limit:50});
  if(error){
    box.innerHTML='<p class="muted">Рейтинг тимчасово недоступний.</p>';
    return;
  }

  const cutoff=Date.now()-70000;
  const month=new Intl.DateTimeFormat('uk-UA',{month:'long',year:'numeric'}).format(new Date());

  const rows=(data||[]).map((p,i)=>{
    const online=p.online_at&&new Date(p.online_at).getTime()>cutoff;
    const you=p.user_id===me?.id;
    const games=Number(p.season_games||0),wins=Number(p.season_wins||0);
    return `<div class="ratingRow seasonRow ${online?'online':''} ${you?'you':''}">
      <span class="ratingPos">${i+1}</span>
      <div class="ratingPlayer">
        <b><span class="ratingAvatar playerFrame frame-${esc(p.frame_key||'classic')}">${ratingAvatar(p.avatar_key)}</span>${esc(p.nickname)}${you?'<small>ВИ</small>':''}</b>
        <span>Сезон: ${wins} перемог / ${games} ігор · ${Number(p.win_rate||0)}%</span>
      </div>
      <strong class="seasonScore">${Number(p.score||0).toLocaleString('uk-UA')}<small> очок</small></strong>
      <span class="ratingXp">${Number(p.xp||0).toLocaleString('uk-UA')} XP<small>LVL ${p.level||1}</small></span>
      <span class="ratingStatus"><i></i>${online?'ОНЛАЙН':'ОФЛАЙН'}</span>
    </div>`;
  }).join('');

  const onlineCount=(data||[]).filter(p=>p.online_at&&new Date(p.online_at).getTime()>cutoff).length;

  box.innerHTML=`<div class="rankHead">
    <div><span class="eyebrow">SEASON RATING</span><h2>🏆 Сезонний рейтинг</h2><small class="seasonName">${esc(month)}</small></div>
    <span><b>${onlineCount}</b> онлайн</span>
  </div>
  <div class="ratingHeader seasonHeader"><span>№</span><span>Гравець</span><span>Очки</span><span>XP</span><span>Статус</span></div>
  <div class="ratingTable">${rows||'<p class="muted">Гравців ще немає.</p>'}</div>
  <p class="ratingExplain">Очки сезону: ігри + перемоги + відсоток перемог. XP і рівень показуються окремо.</p>`;
}
async function currentRoom(){if(!me)return null;let rid=null;try{const s=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');if(s.view==='game'&&s.roomId)rid=Number(s.roomId)}catch{}let q=sb.from('room_players').select('room_id,ready,seat_no').eq('user_id',me.id);if(rid)q=q.eq('room_id',rid);const {data}=await q.order('joined_at',{ascending:false}).limit(1).maybeSingle();return data}
async function watch(id){if(!me)return alert('Спочатку увійди');const {error}=await sb.rpc('watch_room',{p_room:+id});if(error)return alert(error.message);if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(+id)}
function bind(){document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='refreshHot'){await loadHub();return}if(b.dataset.watch){await watch(b.dataset.watch);return}if(b.dataset.tournament){const {error}=await sb.rpc('join_tournament',{p_tournament:+b.dataset.tournament});alert(error?error.message:'Ви зареєстровані на турнір ✓');await loadHub();return}if(b.id==='joinPrivate'){const code=$('privateCode').value.trim();if(!code)return;const {data,error}=await sb.rpc('join_private_room',{p_code:code});if(error)return alert(error.message);$('privateCode').value='';if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(Number(data));return}if(b.id==='readyBtn'){const rp=await currentRoom();if(!rp)return alert('Спочатку сядь за стіл');const next=!rp.ready;const {error}=await sb.rpc('set_player_ready',{p_room:rp.room_id,p_ready:next});if(error)return alert(error.message);b.textContent=next?'✓ ГОТОВИЙ':'○ НЕ ГОТОВИЙ';b.classList.toggle('readyOn',next);return}if(b.id==='spectateBtn'){const rp=await currentRoom();if(rp)return watch(rp.room_id);return}if(b.parentElement?.classList.contains('reactions')){const rp=await currentRoom();if(!rp)return;const now=Date.now();if(now-lastReaction<1200)return;lastReaction=now;const {error}=await sb.rpc('send_room_reaction',{p_room:rp.room_id,p_emoji:b.textContent.trim()});if(!error){tone(600);showReaction(b.textContent.trim())}}});}
function showReaction(x){const t=document.querySelector('.table');if(!t)return;const d=document.createElement('div');d.className='reactionPop';d.textContent=x;t.appendChild(d);setTimeout(()=>d.remove(),1800)}
async function autoReconnect(){
  if(!me)return;
  try{const saved=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');if(saved.view==='game'&&saved.roomId){if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(Number(saved.roomId));return}}catch{}
  const {data}=await sb.from('room_players').select('room_id,seat_no,rooms(name,game_status)').eq('user_id',me.id).not('seat_no','is',null).order('joined_at',{ascending:false}).limit(1).maybeSingle();
  if(data?.room_id&&data.seat_no!==null){
    sessionStorage.setItem('trynka_nav_state_v1',JSON.stringify({view:'game',roomId:Number(data.room_id)}));
    if(window.TRYNKA_OPEN_ROOM)await window.TRYNKA_OPEN_ROOM(Number(data.room_id));
  }
}
async function init(){sound();mount();bind();await session();await autoReconnect();await Promise.all([leaderboard(),loadHub()]);setInterval(()=>{if(!$('lobby')?.classList.contains('hide')){loadHub();leaderboard()}},30000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();