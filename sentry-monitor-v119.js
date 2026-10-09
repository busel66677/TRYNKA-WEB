const cfg=window.TRYNKA_CONFIG||{};
const dsn=String(cfg.sentryDsn||'').trim();
const RELEASE='trynka-web@v119';
const slowLast=new Map();
const queued=[];
let sdk=null;

function cleanUrl(value){
  try{
    const u=new URL(String(value||''),location.href);
    return u.origin+u.pathname;
  }catch{return String(value||'').split(/[?#]/)[0]}
}
function safeExtra(extra={}){
  const out={};
  for(const [k,v] of Object.entries(extra||{})){
    if(v==null||['string','number','boolean'].includes(typeof v))out[k]=v;
  }
  return out;
}
function applyGameContext(snapshot){
  if(!sdk||!snapshot?.room)return;
  const round=snapshot.round||null;
  sdk.setContext('trynka_game',{
    room_id:Number(snapshot.room.id||0)||null,
    room_status:String(snapshot.room.game_status||''),
    round_id:Number(round?.id||0)||null,
    round_status:String(round?.status||''),
    round_no:Number(round?.round_no||0)||null,
    is_svara:!!round?.is_svara,
    seated_players:(snapshot.players||[]).filter(x=>x.seat_no!=null).length,
    connection:navigator.onLine?'online':'offline'
  });
}
function sendQueued(){
  if(!sdk)return;
  while(queued.length){
    const item=queued.shift();
    if(item.kind==='exception')sdk.captureException(item.value,{extra:item.extra});
    else sdk.captureMessage(item.value,{level:item.level||'warning',extra:item.extra});
  }
}
const monitor={
  enabled:!!dsn,
  ready:false,
  captureException(error,extra={}){
    const err=error instanceof Error?error:new Error(String(error||'Unknown error'));
    const safe=safeExtra(extra);
    if(sdk)sdk.captureException(err,{extra:safe});
    else if(dsn&&queued.length<20)queued.push({kind:'exception',value:err,extra:safe});
  },
  captureMessage(message,level='warning',extra={}){
    const safe=safeExtra(extra);
    if(sdk)sdk.captureMessage(String(message||'TRYNKA event'),{level,extra:safe});
    else if(dsn&&queued.length<20)queued.push({kind:'message',value:String(message||'TRYNKA event'),level,extra:safe});
  },
  breadcrumb(message,data={}){
    if(sdk)sdk.addBreadcrumb({category:'trynka',message:String(message||''),level:'info',data:safeExtra(data)});
  },
  timing(name,ms,extra={}){
    const duration=Math.round(Number(ms)||0);
    if(!duration)return;
    if(sdk)sdk.addBreadcrumb({category:'performance',message:String(name),level:duration>=1500?'warning':'info',data:{duration_ms:duration,...safeExtra(extra)}});
    if(duration<1800)return;
    const key=String(name);
    const now=Date.now();
    if(now-(slowLast.get(key)||0)<120000)return;
    slowLast.set(key,now);
    this.captureMessage('Slow '+key,'warning',{duration_ms:duration,...safeExtra(extra)});
  },
  setGameContext:applyGameContext
};
window.TRYNKA_MONITOR=monitor;

document.addEventListener('trynka:room-snapshot',e=>applyGameContext(e.detail));
document.addEventListener('trynka:game-state',e=>applyGameContext(e.detail));
window.addEventListener('offline',()=>monitor.breadcrumb('browser offline'));
window.addEventListener('online',()=>monitor.breadcrumb('browser online'));

if('PerformanceObserver' in window){
  try{
    const longTaskObserver=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(entry.duration>=120)monitor.timing('main_thread_long_task',entry.duration,{entry_type:entry.entryType});
      }
    });
    longTaskObserver.observe({type:'longtask',buffered:true});
  }catch{}
}

if(dsn){
  import('https://cdn.jsdelivr.net/npm/@sentry/browser@11.5.0/+esm').then(Sentry=>{
    sdk=Sentry;
    const build=document.querySelector('meta[name="trynka-build"]')?.content||RELEASE;
    Sentry.init({
      dsn,
      release:build,
      environment:location.hostname==='trinka.pp.ua'?'production':'preview',
      sendDefaultPii:false,
      integrations:[Sentry.browserTracingIntegration()],
      tracesSampleRate:Math.max(0,Math.min(1,Number(cfg.sentryTracesSampleRate??0.05))),
      tracePropagationTargets:[/^https:\/\/trinka\.pp\.ua(?:\/|$)/],
      beforeBreadcrumb(crumb){
        if(crumb?.data?.url)crumb.data.url=cleanUrl(crumb.data.url);
        return crumb;
      },
      beforeSend(event){
        event.user=undefined;
        if(event.request){
          if(event.request.url)event.request.url=cleanUrl(event.request.url);
          event.request.cookies=undefined;
          event.request.data=undefined;
          event.request.headers=undefined;
        }
        const frames=event.exception?.values?.flatMap(v=>v.stacktrace?.frames||[])||[];
        if(frames.length&&frames.every(f=>/^(chrome|moz)-extension:\/\//.test(String(f.filename||''))))return null;
        return event;
      }
    });
    monitor.ready=true;
    Sentry.setTag('app','trynka-web');
    Sentry.setTag('device_memory',String(navigator.deviceMemory||'unknown'));
    Sentry.setTag('cpu_threads',String(navigator.hardwareConcurrency||'unknown'));
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(conn)Sentry.setContext('network',{effective_type:conn.effectiveType||null,downlink:conn.downlink||null,save_data:!!conn.saveData});
    if(window.TRYNKA_GAME_STATE)applyGameContext(window.TRYNKA_GAME_STATE);
    sendQueued();
    monitor.breadcrumb('Sentry initialized',{release:build});
  }).catch(error=>{
    console.warn('TRYNKA Sentry init failed',error);
  });
}
