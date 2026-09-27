// TRYNKA V2 compatibility + table seat controls.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);

function ensureStandButton(){
  const leave=document.getElementById('leaveRoom');
  if(!leave||document.getElementById('standUpBtn'))return;
  const b=document.createElement('button');
  b.id='standUpBtn';
  b.className='ghostBtn';
  b.textContent='↑ Встати зі столу';
  b.title='Звільнити місце, але залишитися за столом';
  leave.insertAdjacentElement('afterend',b);
  b.onclick=async()=>{
    b.disabled=true;
    const roomId=getRoomId();
    if(!roomId){b.disabled=false;return;}
    const {error}=await sb.rpc('stand_up_from_table',{p_room:roomId});
    if(error){alert(error.message);b.disabled=false;return;}
    b.textContent='✓ Ви встали';
    setTimeout(()=>{b.textContent='↑ Встати зі столу';b.disabled=false},1200);
  };
}
function getRoomId(){
  const m=location.hash.match(/room[=:/-]?(\d+)/i)||location.search.match(/[?&]room=(\d+)/i);
  if(m)return Number(m[1]);
  const leave=document.getElementById('leaveRoom');
  return Number(leave?.dataset?.room||window.currentRoom||0)||null;
}
// app.js keeps currentRoom private, so resolve the active room from the signed-in player's membership.
async function activeRoom(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user)return null;
  const {data}=await sb.from('room_players').select('room_id,seat_no').eq('user_id',user.id).order('room_id',{ascending:false}).limit(1).maybeSingle();
  return data?.room_id||null;
}
const oldGet=getRoomId;
getRoomId=()=>{const direct=oldGet();if(direct)return direct;return null};

document.addEventListener('click',async e=>{
  const b=e.target.closest('#standUpBtn');
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  b.disabled=true;
  const roomId=await activeRoom();
  if(!roomId){b.disabled=false;return alert('Активний стіл не знайдено');}
  const {error}=await sb.rpc('stand_up_from_table',{p_room:roomId});
  if(error){b.disabled=false;return alert(error.message);}
  b.textContent='✓ Ви встали';
  setTimeout(()=>{b.textContent='↑ Встати зі столу';b.disabled=false},1000);
},true);

ensureStandButton();
new MutationObserver(ensureStandButton).observe(document.body,{childList:true,subtree:true});