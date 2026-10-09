const cfg=window.TRYNKA_CONFIG||{};
const token=String(cfg.posthogToken||'').trim();
const host=String(cfg.posthogHost||'https://eu.i.posthog.com').trim();
let ph=null;
let ready=false;
const queue=[];
const recent=new Map();

const baseProps=()=>({
  build:document.querySelector('meta[name="trynka-build"]')?.content||'unknown',
  online:navigator.onLine,
  viewport_width:window.innerWidth,
  viewport_height:window.innerHeight,
  device_memory:navigator.deviceMemory||null,
  cpu_threads:navigator.hardwareConcurrency||null
});

function safeProps(input={}){
  const out={...baseProps()};
  for(const [k,v] of Object.entries(input||{})){
    if(v==null||['string','number','boolean'].includes(typeof v))out[k]=v;
  }
  return out;
}

function send(name,props={}){
  if(!token)return;
  const payload=safeProps(props);
  if(ready&&ph)ph.capture(String(name),payload);
  else if(queue.length<100)queue.push([String(name),payload]);
}

function once(name,key,ttlMs,props={}){
  const sig=name+'|'+String(key||'');
  const now=Date.now();
  if(now-(recent.get(sig)||0)<ttlMs)return;
  recent.set(sig,now);
  send(name,props);
}

window.TRYNKA_ANALYTICS={
  enabled:!!token,
  capture:send,
  once,
  timing(name,ms,props={}){
    const duration=Math.round(Number(ms)||0);
    if(!duration)return;
    send(name,{duration_ms:duration,...props});
  },
  gameplay(action,props={}){
    send('game_action',{action:String(action||''),...props});
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
  send('stand_up',{room_id:Number(e.detail?.roomId||0)||null});
});
document.addEventListener('trynka:room-render-error',e=>{
  send('client_error',{context:'room_render',room_id:Number(e.detail?.roomId||0)||null,message:String(e.detail?.message||'').slice(0,180)});
});
window.addEventListener('offline',()=>send('connection_state',{state:'offline'}));
window.addEventListener('online',()=>send('connection_state',{state:'online'}));

if(token){
  import('https://cdn.jsdelivr.net/npm/posthog-js@1/+esm').then(mod=>{
    ph=mod.default||mod.posthog||mod;
    ph.init(token,{
      api_host:host,
      defaults:'2026-05-30',
      autocapture:false,
      capture_pageview:false,
      capture_pageleave:false,
      disable_session_recording:true,
      person_profiles:'identified_only',
      persistence:'localStorage+cookie',
      mask_all_text:true,
      mask_all_element_attributes:true,
      sanitize_properties:(properties,event)=>{
        const p={...properties};
        delete p.$current_url;
        delete p.$referrer;
        delete p.$referring_domain;
        delete p.$pathname;
        delete p.$host;
        return p;
      },
      loaded(client){
        ready=true;
        client.register(baseProps());
        while(queue.length){
          const [name,props]=queue.shift();
          client.capture(name,props);
        }
        client.capture('analytics_ready',baseProps());
      }
    });
    window.TRYNKA_POSTHOG=ph;
  }).catch(err=>console.warn('PostHog init failed',err));
}
