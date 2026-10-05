import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.TRYNKA_CONFIG;
if(!cfg)throw new Error('TRYNKA config missing');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);

let me=null,audioCtx=null,lastRoundId=null,lastActionId=null,lastFinishKey='',offlineAt=0;

function soundEnabled(){return localStorage.getItem('trynkaSound')!=='off'}
function primeAudio(){
  if(!soundEnabled())return;
  try{
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return;
    if(!audioCtx)audioCtx=new A();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  }catch{}
}
function tone(freq=620,dur=.08,gain=.035,type='sine',delay=0){
  if(!soundEnabled())return;
  try{
    primeAudio();if(!audioCtx)return;
    const now=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,now);
    g.gain.setValueAtTime(.0001,now);
    g.gain.exponentialRampToValueAtTime(gain,now+.012);
    g.gain.exponentialRampToValueAtTime(.0001,now+dur);
    o.connect(g);g.connect(audioCtx.destination);o.start(now);o.stop(now+dur+.02);
  }catch{}
}
function playActionSound(action){
  if(action==='call'){tone(760,.07,.028,'triangle');tone(980,.06,.02,'triangle',.055)}
  else if(action==='raise'){tone(620,.08,.03,'triangle');tone(820,.08,.03,'triangle',.07);tone(1080,.09,.025,'triangle',.14)}
  else if(action==='fold'||action==='timeout'){tone(240,.12,.025,'sine')}
  else if(action==='reveal'){tone(520,.12,.03,'triangle');tone(760,.13,.035,'triangle',.09);tone(1040,.16,.03,'triangle',.18)}
}
function playDealSound(){
  [0,.26,.52].forEach((d,i)=>{tone(340+i*40,.11,.018,'triangle',d);tone(520+i*45,.08,.012,'sine',d+.045)});
}
function playWinSound(){
  tone(523,.13,.03,'triangle');tone(659,.13,.03,'triangle',.12);tone(784,.18,.035,'triangle',.24);
}
function ensureNetToast(){
  let x=$('networkToast');
  if(!x){x=document.createElement('div');x.id='networkToast';x.className='networkToast hide';document.body.appendChild(x)}
  return x;
}
function showNet(text,kind='ok'){
  const x=ensureNetToast();x.textContent=text;x.className='networkToast '+kind;
  clearTimeout(showNet.t);showNet.t=setTimeout(()=>x.classList.add('hide'),2600);
}
function onState(state){
  const g=state?.round;if(!g)return;
  if(lastRoundId!==g.id){
    lastRoundId=g.id;
    lastActionId=(state.latest_actions||[])[0]?.id||null;
    if(g.status==='playing')playDealSound();
  }else{
    const newest=(state.latest_actions||[])[0];
    if(newest?.id&&newest.id!==lastActionId){
      lastActionId=newest.id;playActionSound(newest.action);
    }
  }
  if(g.status==='finished'&&g.finished_at){
    const key=g.id+'|'+g.finished_at;
    if(key!==lastFinishKey){
      lastFinishKey=key;
      if(g.winner_id&&g.winner_id===me?.id)playWinSound();
    }
  }
}
window.addEventListener('offline',()=>{
  offlineAt=Date.now();showNet('Немає з’єднання. Повертаємо вас у гру…','bad');
});
window.addEventListener('online',async()=>{
  if(!offlineAt)return;
  showNet('З’єднання відновлено. Оновлюємо стіл…','ok');offlineAt=0;
  try{await sb.auth.refreshSession();document.dispatchEvent(new CustomEvent('trynka:reconnected'))}catch{}
});
document.addEventListener('pointerdown',primeAudio,{once:true,passive:true});
document.addEventListener('trynka:game-state',e=>onState(e.detail));

(async()=>{
  try{const {data:{user}}=await sb.auth.getUser();me=user||null}catch{}
})();
