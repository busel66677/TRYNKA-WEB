import http from 'node:http';
import { telegramAuth, validateTelegram } from './auth.mjs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
const telegramBootstrap = '<script src="https://telegram.org/js/telegram-web-app.js"></script><script>try{if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand();}}catch(e){console.warn(e)}</script><script defer src="/telegram/quick-entry.js?v=4"></script>';
const stakes=[2,5,10,20,50,100,200,500,1000];
const seats=new Map();
function cleanup(){const now=Date.now();for(const [id,entry] of seats){if(now-entry.lastSeen>90000)seats.delete(id)}}
function players(table){cleanup();return [...seats.entries()].filter(([id,x])=>x.table===table).map(([id,x])=>({seat:x.seat,name:x.name,photo:x.photo||null})).sort((a,b)=>a.seat-b.seat)}
function counts(){cleanup();return stakes.map((stake,i)=>({id:i+1,stake,maxBet:stake*100,capacity:11,occupied:[...seats.values()].filter(x=>x.table===i+1).length}))}
function json(res,code,body){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
async function tablePresence(req,res){
 let raw='';try{
  for await(const chunk of req){raw+=chunk;if(raw.length>12000)return json(res,413,{error:'Too large'})}
  const data=JSON.parse(raw);const user=validateTelegram(data.initData,process.env.TELEGRAM_BOT_TOKEN||'');
  cleanup();const id=String(user.id);const table=Number(data.table);
  if(data.action==='leave'){seats.delete(id);return json(res,200,{tables:counts(),joined:null})}
  if(!Number.isInteger(table)||table<1||table>9)return json(res,400,{error:'Invalid table'});
  if(data.action!=='join'&&data.action!=='heartbeat')return json(res,400,{error:'Invalid action'});
  const existing=seats.get(id);
  if(data.action==='heartbeat'&&(!existing||existing.table!==table))return json(res,409,{error:'Not seated',tables:counts()});
  const occupied=[...seats.entries()].filter(([uid,x])=>uid!==id&&x.table===table).length;
  if(occupied>=11)return json(res,409,{error:'Table full',tables:counts()});
  const used=new Set([...seats.entries()].filter(([uid,x])=>uid!==id&&x.table===table).map(([uid,x])=>x.seat));
  const seat=existing?.table===table?existing.seat:Array.from({length:11},(_,i)=>i+1).find(n=>!used.has(n));
  if(!seat)return json(res,409,{error:'Table full',tables:counts()});
  seats.set(id,{table,seat,name:String(user.first_name||user.username||'Гравець').slice(0,22),photo:typeof user.photo_url==='string'&&user.photo_url.startsWith('https://')?user.photo_url:null,lastSeen:Date.now()});
  return json(res,200,{tables:counts(),joined:table,seat,players:players(table)});
 }catch(e){return json(res,401,{error:'Telegram verification failed'})}
}

const ADMIN_TELEGRAM_ID=806877187;
const SUPABASE_URL='https://oqyjypzltncbruzaxetp.supabase.co';
async function sb(path,options={}){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw Error('Database not configured');
 const r=await fetch(SUPABASE_URL+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(12000)});
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw Error(data?.message||data?.error||'Database error');
 return data;
}
async function readPayload(req){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)throw Error('Payload too large')}
 return JSON.parse(raw);
}
async function accountInfo(req,res){
 try{
  const data=await readPayload(req),user=validateTelegram(data.initData,process.env.TELEGRAM_BOT_TOKEN||'');
  const email='telegram-'+user.id+'@users.trynka.invalid';
  const users=await sb('/auth/v1/admin/users?per_page=1000');
  const target=users.users?.find(x=>x.email===email);
  const profile=target?await sb('/rest/v1/profiles?id=eq.'+encodeURIComponent(target.id)+'&select=id,chips,nickname'):null;
  return json(res,200,{admin:user.id===ADMIN_TELEGRAM_ID,balance:profile?.[0]?.chips??null,name:profile?.[0]?.nickname||user.first_name||'Гравець'});
 }catch(e){return json(res,401,{error:'Не вдалося отримати профіль'})}
}
async function adminApi(req,res){
 try{
  const data=await readPayload(req),user=validateTelegram(data.initData,process.env.TELEGRAM_BOT_TOKEN||'');
  if(user.id!==ADMIN_TELEGRAM_ID)return json(res,403,{error:'Доступ лише адміністратору'});
  const targetId=Number(data.targetId);
  if(!Number.isSafeInteger(targetId)||targetId<=0)return json(res,400,{error:'Вкажіть Telegram ID гравця'});
  const users=await sb('/auth/v1/admin/users?per_page=1000');
  const found=users.users?.find(x=>x.email==='telegram-'+targetId+'@users.trynka.invalid');
  if(!found)return json(res,404,{error:'Гравець ще не входив у Триньку'});
  const profile=(await sb('/rest/v1/profiles?id=eq.'+encodeURIComponent(found.id)+'&select=id,chips,nickname'))?.[0];
  if(!profile)return json(res,404,{error:'Профіль гравця не знайдено'});
  if(data.action==='lookup')return json(res,200,{player:{name:profile.nickname||'Гравець',balance:profile.chips,id:targetId}});
  if(data.action!=='adjust')return json(res,400,{error:'Невідома дія'});
  const amount=Number(data.amount);
  if(!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>100000)return json(res,400,{error:'Сума від 1 до 100 000 фішок'});
  const result=await sb('/rest/v1/rpc/telegram_admin_adjust_chips',{method:'POST',body:JSON.stringify({p_target:profile.id,p_amount:amount,p_actor:String(user.id)})});
  return json(res,200,{player:{name:profile.nickname||'Гравець',balance:result,id:targetId}});
 }catch(e){return json(res,400,{error:String(e.message||e).slice(0,160)})}
}

async function referralApi(req,res){
 try{
  const data=await readPayload(req),user=validateTelegram(data.initData,process.env.TELEGRAM_BOT_TOKEN||'');
  const me=Number(user.id),start=String(data.startParam||'');
  const match=/^ref_([1-9][0-9]{0,15})$/.exec(start);
  if(match){
   const inviter=Number(match[1]);
   if(Number.isSafeInteger(inviter)&&inviter!==me){
    const existing=await sb('/rest/v1/telegram_referrals?invited_id=eq.'+me+'&select=invited_id');
    if(existing.length===0){
     try{await sb('/rest/v1/telegram_referrals',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({invited_id:me,inviter_id:inviter})})}catch(e){console.warn('Referral registration',e.message)}
    }
   }
  }
  const rows=await sb('/rest/v1/telegram_referrals?inviter_id=eq.'+me+'&select=invited_id,rewarded_at');
  return json(res,200,{link:'https://t.me/TrynkaGameBot?startapp=ref_'+me,invited:rows.length,rewarded:rows.filter(x=>x.rewarded_at).length,bonusChips:rows.filter(x=>x.rewarded_at).length*50});
 }catch(e){return json(res,400,{error:'Реферальні дані тимчасово недоступні'})}
}
http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.url?.split('?')[0] === '/health') { res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,app:'trynka-telegram',mode:'frontend-preview'})); }
  if(req.url?.split('?')[0] === '/api/telegram-auth' && req.method === 'POST') return telegramAuth(req,res);
  if(req.url?.split('?')[0] === '/api/account' && req.method === 'POST') return accountInfo(req,res);
  if(req.url?.split('?')[0] === '/api/referrals' && req.method === 'POST') return referralApi(req,res);
  if(req.url?.split('?')[0] === '/api/admin' && req.method === 'POST') return adminApi(req,res);
  if(req.url?.split('?')[0] === '/api/tables' && req.method === 'GET') return json(res,200,{tables:counts()});
  if(req.url?.split('?')[0] === '/api/table-presence' && req.method === 'POST') return tablePresence(req,res);
  if(req.method !== 'GET' && req.method !== 'HEAD'){res.writeHead(405);return res.end();}
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);return res.end();}
  if(pathname === '/' || pathname === '/telegram') pathname='/telegram/standalone.html';
  const file = path.resolve(root, '.'+pathname);
  if(!file.startsWith(root+path.sep) || pathname.includes('\\') || pathname.split('/').some(s=>s.startsWith('.')) || /\.(env|map|md|lock)$/i.test(pathname) || (pathname.startsWith('/telegram/') && !['/telegram/quick-entry.js','/telegram/standalone.html'].includes(pathname))){res.writeHead(404);return res.end();}
  try {
    const info=await stat(file);
    if(!info.isFile()){res.writeHead(404);return res.end();}
    let body=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'no-cache'});
    if(req.method==='HEAD') return res.end();
    res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('TRYNKA Telegram preview listening on '+port));
