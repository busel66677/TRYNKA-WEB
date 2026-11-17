import http from 'node:http';
import { telegramAuth } from './auth.mjs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
const telegramBootstrap = '<script src="https://telegram.org/js/telegram-web-app.js"></script><script>try{if(window.Telegram?.WebApp){Telegram.WebApp.ready();Telegram.WebApp.expand();}}catch(e){console.warn(e)}</script><script defer src="/telegram/quick-entry.js?v=4"></script>';
http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.url?.split('?')[0] === '/health') { res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,app:'trynka-telegram',mode:'frontend-preview'})); }
  if(req.url?.split('?')[0] === '/api/telegram-auth' && req.method === 'POST') return telegramAuth(req,res);
  if(req.method !== 'GET' && req.method !== 'HEAD'){res.writeHead(405);return res.end();}
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);return res.end();}
  if(pathname === '/' || pathname === '/telegram') pathname='/index.html';
  const file = path.resolve(root, '.'+pathname);
  if(!file.startsWith(root+path.sep) || pathname.includes('\\') || pathname.split('/').some(s=>s.startsWith('.')) || /\.(env|map|md|lock)$/i.test(pathname) || (pathname.startsWith('/telegram/') && pathname !== '/telegram/quick-entry.js')){res.writeHead(404);return res.end();}
  try {
    const info=await stat(file);
    if(!info.isFile()){res.writeHead(404);return res.end();}
    let body=await readFile(file);
    if(path.extname(file)==='.html') body=Buffer.from(body.toString('utf8').replace(/<head([^>]*)>/i, '<head$1>'+telegramBootstrap));
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'no-cache'});
    if(req.method==='HEAD') return res.end();
    res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('TRYNKA Telegram preview listening on '+port));
