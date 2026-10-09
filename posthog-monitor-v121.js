const cfg=window.TRYNKA_CONFIG||{};
const token=String(cfg.posthogToken||'').trim();
const host=String(cfg.posthogHost||'https://eu.i.posthog.com').replace(/\/$/,'');
const queue=[];
const recent=new Map();
let flushTimer=0;
let flushing=false;

function anonymousId(){
  const key='trynka_analytics_id_v1';
  try{
    let id=localStorage.getItem(key);
    if(!id){
      id='anon_'+(crypto.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
      localStorage.setItem(key,id);
    }
    return id.slice(0,190);
  }catch{
    return 'anon_'+(crypto.randomUUID?.()||Date.now().toString(36));
  }
}
const distinctId=anonymousId();

const baseProps=()=>({
  $process_person_profile:false,
  source:'trynka-web-direct',
  build:document.querySelector('meta[name="trynka-build"]')?.content||'unknown',
  online:navigator.onLine,
  visibility:document.visibilityState,
  viewport_width:window.innerWidth,
  viewport_height:window.innerHeight,
  device_memory:navigator.deviceMemory||null,
  cpu_threads:navigator.hardwareConcurrency||null,
  connection_type:navigator.connection?.effectiveType||null,
  save_data:!!navigator.connection?.saveData
});

function safeProps(input={}){
  const out=baseProps();
  for(const [k,v] of Object.entries(input||{})){
    if(v==null||['string','number','boolean'].includes(typeof v))out[k]=v;
  }
  return out;
}

function scheduleFlush(delay=1200){
  if(flushTimer||!token)return;
  flushTimer=setTimeout(()=>{flushTimer=0;flush();},delay);
}

function enqueue(name,props={}){
  if(!token||!name)return;
  if(queue.length>=60)queue.shift();
  queue.push({
    event:String(name),
    distinct_id:distinctId,
    properties:{distinct_id:distinctId,...safeProps(props)},
    timestamp:new Date().toISOString()
  });
  if(queue.length>=12)flush();
  else scheduleFlush();
}

async function flush(){
  if(!token||flushing||!queue.length)return;
  if(flushTimer){clearTimeout(flushTimer);flushTimer=0;}
  const batch=queue.splice(0,20);
  flushing=true;
  try{
    const res=await fetch(host+'/batch/',{
      method:'POST',
      mode:'cors',
      credentials:'omit',
      keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({api_key:token,historical_migration:false,batch})
    });
    if(!res.ok)throw new Error('PostHog HTTP '+res.status);
  }catch(err){
    queue.unshift(...batch);
    if(queue.length>60)queue.length=60;
    if(navigator.onLine)setTimeout(()=>scheduleFlush(5000),1000);
    console.warn('TRYNKA analytics flush failed',err);
  }finally{
    flushing=false;
    if(queue.length&&navigator.onLine)scheduleFlush(1500);
  }
}

function once(name,key,ttlMs,props={}){
  const sig=name+'|'+String(key||'');
  const now=Date.now();
  if(now-(recent.get(sig)||0)<ttlMs)return;
  recent.set(sig,now);
  enqueue(name,props);
}

window.TRYNKA_ANALYTICS={
  enabled:!!token,
  mode:'direct-batch',
  capture:enqueue,
  once,
  flush,
  timing(name,ms,props={}){
    const duration=Math.round(Number(ms)||0);
    if(!duration)return;
    // Fast snapshots are heavily sampled; slow ones are always kept.
    if(name==='room_snapshot_perf'&&duration<300&&Math.random()>0.03)return;
    enqueue(name,{duration_ms:duration,...props});
  },
  gameplay(action,props={}){
    enqueue('game_action',{action:String(action||''),...props});
  }
};

document.addEventListener('trynka:room-snapshot',e=>{
  const s=e.detail||{};
  const r=s.room||{};
  const g=s.round||{};
  once('room_snapshot_state',
    [r.id,r.game_status,g.id,g.status,g.turn_user_id,g.round_no,g.current_bet,g.pot].join('|'),
    2000,{
      room_id:Number(r.id||0)||null,
      room_status:String(r.game_status||''),
      round_id:Number(g.id||0)||null,
      round_status:String(g.status||''),
      round_no:Number(g.round_no||0)||null,
      current_bet:Number(g.current_bet||0),
      pot:Number(g.pot||0),
      seated_players:(s.players||[]).filter(x=>x.seat_no!=null).length,
      is_svara:!!g.is_svara
    });
});

document.addEventListener('trynka:stand-up',e=>{
  enqueue('stand_up',{room_id:Number(e.detail?.roomId||0)||null});
});
document.addEventListener('trynka:room-render-error',e=>{
  enqueue('client_error',{
    context:'room_render',
    room_id:Number(e.detail?.roomId||0)||null,
    message:String(e.detail?.message||'').slice(0,180)
  });
});
window.addEventListener('offline',()=>enqueue('connection_state',{state:'offline'}));
window.addEventListener('online',()=>{enqueue('connection_state',{state:'online'});scheduleFlush(50);});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)flush();
});
window.addEventListener('pagehide',()=>flush());

if('PerformanceObserver' in window){
  try{
    const po=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(entry.duration>=150){
          once('main_thread_long_task','long-task',60000,{duration_ms:Math.round(entry.duration)});
        }
      }
    });
    po.observe({type:'longtask',buffered:true});
  }catch{}
}

if(token){
  enqueue('analytics_ready',{transport:'direct-batch'});
  scheduleFlush(50);
}
