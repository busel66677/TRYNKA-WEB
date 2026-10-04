import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const $=id=>document.getElementById(id);

let me=null,currentRoom=null,socialChannel=null,seatMap=new Map(),seatMapAt=0,lastThemeKey='',themeBusy=false;

async function getMe(){
  if(me)return me;
  const {data}=await sb.auth.getSession();
  me=data.session?.user||null;
  return me;
}
function navRoom(){
  try{
    const s=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');
    return s.view==='game'&&s.roomId?Number(s.roomId):null;
  }catch{return null}
}
function gameVisible(){return !!$('game')&&!$('game').classList.contains('hide')}

async function refreshSeatMap(force=false){
  if(!currentRoom)return;
  if(!force&&Date.now()-seatMapAt<3500)return;
  const {data}=await sb.from('room_players')
    .select('user_id,seat_no,profiles(nickname)')
    .eq('room_id',currentRoom)
    .not('seat_no','is',null);
  seatMap=new Map((data||[]).map(x=>[x.user_id,{seat_no:x.seat_no,nickname:x.profiles?.nickname||'Гравець'}]));
  seatMapAt=Date.now();
}

async function showSocialEvent(ev){
  if(!ev||Number(ev.room_id)!==Number(currentRoom))return;
  await refreshSeatMap();
  let who=seatMap.get(ev.user_id);
  if(!who){
    const {data}=await sb.from('room_players')
      .select('seat_no,profiles(nickname)')
      .eq('room_id',currentRoom)
      .eq('user_id',ev.user_id)
      .not('seat_no','is',null)
      .maybeSingle();
    if(data){
      who={seat_no:data.seat_no,nickname:data.profiles?.nickname||'Гравець'};
      seatMap.set(ev.user_id,who);
    }
  }
  if(!who)return;
  const seat=document.querySelector('#seats .seat.s'+who.seat_no);
  if(!seat)return;

  seat.querySelectorAll('.socialPop').forEach(x=>x.remove());
  const pop=document.createElement('div');
  pop.className='socialPop '+(ev.kind==='emoji'?'emoji':'phrase');
  pop.innerHTML=ev.kind==='emoji'
    ? '<b>'+ev.payload+'</b>'
    : '<small>'+who.nickname+'</small><b>'+ev.payload+'</b>';
  seat.appendChild(pop);
  requestAnimationFrame(()=>pop.classList.add('show'));
  setTimeout(()=>{pop.classList.remove('show');setTimeout(()=>pop.remove(),220)},1700);
}

async function bindSocial(roomId){
  if(socialChannel){try{await sb.removeChannel(socialChannel)}catch{};socialChannel=null}
  currentRoom=roomId;
  seatMapAt=0;
  await refreshSeatMap(true);
  if(!roomId)return;

  socialChannel=sb.channel('table-social-'+roomId+'-'+(me?.id||'guest'))
    .on('postgres_changes',{
      event:'INSERT',
      schema:'public',
      table:'table_social_events',
      filter:'room_id=eq.'+roomId
    },payload=>showSocialEvent(payload.new))
    .subscribe();
}

async function sendSocial(kind,payload){
  const roomId=navRoom();
  if(!roomId)return;
  const {error}=await sb.rpc('send_table_social',{p_room:roomId,p_kind:kind,p_payload:payload});
  if(error)alert(error.message);
}

function mountSocialBar(){
  const wrap=document.querySelector('#game .tableWrap');
  if(!wrap||$('socialQuickBar'))return;
  const bar=document.createElement('div');
  bar.id='socialQuickBar';
  bar.className='socialQuickBar';
  bar.innerHTML=`
    <div class="socialBarLabel"><span>⚡</span><b>Швидко</b></div>
    <div class="emojiQuick">
      <button type="button" data-social-kind="emoji" data-social-value="👍">👍</button>
      <button type="button" data-social-kind="emoji" data-social-value="😂">😂</button>
      <button type="button" data-social-kind="emoji" data-social-value="😎">😎</button>
      <button type="button" data-social-kind="emoji" data-social-value="👏">👏</button>
    </div>
    <div class="phraseQuick">
      <button type="button" data-social-kind="phrase" data-social-value="Гарна гра">Гарна гра</button>
      <button type="button" data-social-kind="phrase" data-social-value="Давай">Давай</button>
      <button type="button" data-social-kind="phrase" data-social-value="Ого 😄">Ого 😄</button>
      <button type="button" data-social-kind="phrase" data-social-value="Ще одну">Ще одну</button>
    </div>
    <span id="socialWatchNote" class="socialWatchNote hide">👁 Спостерігач · закриті карти недоступні</span>
  `;
  wrap.prepend(bar);
  bar.querySelectorAll('[data-social-kind]').forEach(b=>b.onclick=()=>sendSocial(b.dataset.socialKind,b.dataset.socialValue));
}

async function syncSocialBar(){
  if(!gameVisible())return;
  mountSocialBar();
  const roomId=navRoom();
  if(!roomId)return;
  if(roomId!==currentRoom)await bindSocial(roomId);

  const {data:seat}=await sb.from('room_players')
    .select('seat_no')
    .eq('room_id',roomId)
    .eq('user_id',me.id)
    .maybeSingle();

  const seated=seat?.seat_no!=null;
  $('socialQuickBar')?.classList.toggle('spectator',!seated);
  $('socialQuickBar')?.querySelectorAll('[data-social-kind]').forEach(b=>b.disabled=!seated);
  $('socialWatchNote')?.classList.toggle('hide',seated);
  await refreshSeatMap();
}

const THEMES=[
  {key:'classic',title:'Класичний зелений',note:'Доступна завжди',open:p=>true},
  {key:'midnight',title:'Чорний',note:'Від рівня 3',open:p=>Number(p.level||1)>=3},
  {key:'ocean',title:'Темно-синій',note:'Від рівня 5',open:p=>Number(p.level||1)>=5},
  {key:'gold',title:'Золотий',note:'Досягнення «Переможець»',open:(p,a)=>a.has('wins_25')}
];

function applyTheme(key){
  const game=$('game');if(!game)return;
  for(const t of THEMES)game.classList.remove('theme-'+t.key);
  const valid=THEMES.some(t=>t.key===key)?key:'classic';
  game.classList.add('theme-'+valid);
  lastThemeKey=valid;
}

async function chooseTheme(key){
  if(themeBusy)return;
  themeBusy=true;
  try{
    const {error}=await sb.rpc('set_player_theme',{p_theme_key:key});
    if(error)return alert(error.message);
    applyTheme(key);
    await mountThemePicker(true);
  }finally{themeBusy=false}
}

async function mountThemePicker(force=false){
  const progress=$('playerProgress');
  if(!progress)return;

  let section=$('themeRewardSection');
  if(!section){
    section=document.createElement('div');
    section.id='themeRewardSection';
    section.className='themeRewardSection';
    const ach=progress.querySelector('.achievementHead');
    if(ach)progress.insertBefore(section,ach);else progress.appendChild(section);
  }
  if(!force&&section.dataset.loaded==='1')return;

  const [{data:p},{data:unlocks}]=await Promise.all([
    sb.from('profiles').select('level,wins,theme_key').eq('id',me.id).single(),
    sb.from('player_achievements').select('achievement_key').eq('user_id',me.id)
  ]);
  if(!p)return;
  const set=new Set((unlocks||[]).map(x=>x.achievement_key));
  applyTheme(p.theme_key||'classic');

  section.innerHTML=`
    <div class="avatarRewardHead themeRewardHead">
      <div><span class="eyebrow">ТЕМИ СТОЛУ</span><h2>Вигляд гри</h2></div>
      <small>Лише косметика · без переваг</small>
    </div>
    <div class="themePicker">
      ${THEMES.map(t=>{
        const open=t.open(p,set),selected=(p.theme_key||'classic')===t.key;
        return `<button type="button" class="themeChoice themePreview-${t.key} ${selected?'selected':''} ${open?'':'locked'}" data-theme="${t.key}" ${open?'':'disabled'}>
          <span class="themeSwatch"><i></i></span>
          <b>${t.title}</b>
          <small>${selected?'ОБРАНО':open?'ВИБРАТИ':'🔒 '+t.note}</small>
        </button>`;
      }).join('')}
    </div>
  `;
  section.querySelectorAll('[data-theme]:not(:disabled)').forEach(b=>b.onclick=()=>chooseTheme(b.dataset.theme));
  section.dataset.loaded='1';
}

async function refreshThemeFromProfile(){
  if(!me)return;
  const {data:p}=await sb.from('profiles').select('theme_key').eq('id',me.id).maybeSingle();
  if(p?.theme_key&&p.theme_key!==lastThemeKey)applyTheme(p.theme_key);
}

async function tick(){
  if(!me)return;
  if(gameVisible())await syncSocialBar();
  if(!$('profile')?.classList.contains('hide'))await mountThemePicker();
}

async function init(){
  await getMe();
  if(!me)return;
  await refreshThemeFromProfile();
  await tick();
  setInterval(tick,1200);
  setInterval(refreshThemeFromProfile,12000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
