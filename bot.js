import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;
if(!cfg) throw new Error('TRYNKA config missing');
const botSb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let botBusy=false,lastBotRound=null,isAdmin=false;

async function refreshAdmin(){
  const {data:{user}}=await botSb.auth.getUser();
  if(!user){isAdmin=false;return false}
  const {data:p}=await botSb.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
  isAdmin=!!p?.is_admin;
  const btn=document.getElementById('addTestBot');
  if(btn){btn.classList.remove('hide');btn.style.display=isAdmin?'inline-flex':'none';}
  return isAdmin;
}
async function currentRoomId(){const {data:{user}}=await botSb.auth.getUser();if(!user)return null;const title=document.getElementById('roomTitle')?.textContent?.trim();const {data:mine}=await botSb.from('room_players').select('room_id').eq('user_id',user.id);const ids=[...new Set((mine||[]).map(x=>x.room_id))];if(!ids.length)return null;const {data:rooms}=await botSb.from('rooms').select('id,name,created_at').in('id',ids).order('created_at',{ascending:false});return ((rooms||[]).find(r=>r.name===title)||(rooms||[])[0])?.id||null}
async function ensureBot(){if(botBusy)return;botBusy=true;const btn=document.getElementById('addTestBot'),old=btn?.textContent;try{if(!await refreshAdmin())throw new Error('Кнопка BOT доступна тільки адміну');if(btn){btn.disabled=true;btn.textContent='Додаю BOT…'}const room_id=await currentRoomId();if(!room_id)throw new Error('Спочатку зайди за стіл і сядь на місце');const {data,error}=await botSb.rpc('add_test_bot',{p_room:room_id});if(error)throw error;if(!data)throw new Error('BOT не був доданий');if(btn)btn.textContent='✓ BOT за столом';await sleep(700);await botTick();location.reload()}catch(e){console.error('BOT add error',e);alert('BOT: '+(e?.message||e));if(btn){btn.disabled=false;btn.textContent=old||'＋ BOT'}}finally{botBusy=false}}
async function botTick(){try{const game=document.getElementById('game');if(!game||game.classList.contains('hide'))return;const room=await currentRoomId();if(!room)return;const {data:gr}=await botSb.from('game_rounds').select('id,status,turn_user_id,turn_started_at').eq('room_id',room).eq('status','playing').order('id',{ascending:false}).limit(1).maybeSingle();if(!gr?.turn_user_id)return;const {data:p}=await botSb.from('profiles').select('is_bot').eq('id',gr.turn_user_id).maybeSingle();if(!p?.is_bot)return;const key=gr.id+':'+gr.turn_started_at;if(lastBotRound===key)return;lastBotRound=key;await sleep(1600+Math.floor(Math.random()*1400));const {error}=await botSb.rpc('bot_take_turn',{p_room:room});if(error){console.error('BOT turn error',error);lastBotRound=null}}catch(e){console.error('BOT tick',e)}}
function wire(){const btn=document.getElementById('addTestBot');if(btn&&!btn.dataset.botWired){btn.dataset.botWired='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();ensureBot()},true)}refreshAdmin()}
setInterval(wire,1000);setInterval(botTick,1200);wire();
