import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;
if(!cfg) throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
let me=null, standing=false;
const $=id=>document.getElementById(id);

async function getMe(){if(me)return me;const {data}=await sb.auth.getSession();me=data.session?.user||null;return me}
async function seatedRoom(){const u=await getMe();if(!u)return null;const {data}=await sb.from('room_players').select('room_id,seat_no').eq('user_id',u.id).not('seat_no','is',null).order('joined_at',{ascending:false}).limit(1).maybeSingle();return data||null}
async function syncButtons(){const leave=$('leaveRoom'),stand=$('standUpBtn');if(!leave||!stand)return;const rp=await seatedRoom();const seated=!!rp;stand.classList.toggle('hide',!seated);leave.classList.toggle('lobbyLocked',seated);leave.textContent=seated?'🔒 Спочатку встаньте':'← Лобі';leave.title=seated?'Щоб вийти в лобі, спочатку встаньте зі столу':''}
function mount(){const actions=document.querySelector('.gameTopActions');if(!actions||$('standUpBtn'))return;const b=document.createElement('button');b.id='standUpBtn';b.className='standUpBtn hide';b.textContent='↑ Встати зі столу';actions.prepend(b);b.addEventListener('click',async()=>{if(standing)return;const rp=await seatedRoom();if(!rp)return syncButtons();standing=true;b.disabled=true;b.textContent='Встаємо…';const {error}=await sb.rpc('stand_up_from_table',{p_room:rp.room_id});standing=false;b.disabled=false;if(error){b.textContent='↑ Встати зі столу';alert(error.message);return}b.classList.add('hide');const leave=$('leaveRoom');if(leave){leave.classList.remove('lobbyLocked');leave.textContent='← Лобі';leave.title=''};setTimeout(syncButtons,300)});}
// Capture the click before app.js can leave the room.
document.addEventListener('click',async e=>{const b=e.target.closest('#leaveRoom');if(!b)return;const rp=await seatedRoom();if(rp){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();alert('Спочатку натисніть «Встати зі столу», а потім можна вийти в лобі.')}},true);
async function init(){mount();await getMe();await syncButtons();setInterval(()=>{if(!$('game')?.classList.contains('hide'))syncButtons()},1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();