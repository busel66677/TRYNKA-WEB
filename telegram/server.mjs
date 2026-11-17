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
  seats.set(id,{table,lastSeen:Date.now()});return json(res,200,{tables:counts(),joined:table});
 }catch(e){return json(res,401,{error:'Telegram verification failed'})}
}
http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.url?.split('?')[0] === '/health') { res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,app:'trynka-telegram',mode:'frontend-preview'})); }
  if(req.url?.split('?')[0] === '/api/telegram-auth' && req.method === 'POST') return telegramAuth(req,res);
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
