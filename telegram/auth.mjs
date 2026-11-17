import { createHmac, timingSafeEqual } from 'node:crypto';

const supabaseUrl = 'https://oqyjypzltncbruzaxetp.supabase.co';
const publicKey = 'sb_publishable_PUAdJ6qJ6U8nf0UrK1FmKQ_PcyMEjIZ';

export function validateTelegram(initData, token) {
  if (typeof initData !== 'string' || initData.length > 8192) throw Error('Invalid Telegram payload');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw Error('Missing Telegram signature');
  const entries = [...params.entries()].filter(([key]) => key !== 'hash');
  if (new Set(entries.map(([key])=>key)).size !== entries.length) throw Error('Duplicate Telegram fields');
  const data = entries.map(([k,v]) => k+'='+v).sort().join('\n');
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  const expected = createHmac('sha256',secret).update(data).digest();
  if (!timingSafeEqual(expected,Buffer.from(hash,'hex'))) throw Error('Telegram signature mismatch');
  const timestamp = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now()/1000-timestamp)>300) throw Error('Telegram session expired');
  const user = JSON.parse(params.get('user') || 'null');
  if (!user || !Number.isSafeInteger(user.id) || user.id<=0) throw Error('Invalid Telegram user');
  return user;
}
async function authRequest(path, options, key) {
  const res=await fetch(supabaseUrl+path,{
    ...options, headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(12000)
  });
  const body=await res.json().catch(()=>({}));
  return {ok:res.ok,status:res.status,body};
}
export async function telegramAuth(req,res) {
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const adminKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const loginSecret=process.env.TELEGRAM_AUTH_SECRET;
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(!token||!adminKey||!loginSecret||loginSecret.length<32) return send(503,{error:'Telegram sign-in not configured'});
  let raw='';
  try {
    for await (const chunk of req) {raw+=chunk;if(raw.length>12000) return send(413,{error:'Payload too large'});}
    const user=validateTelegram(JSON.parse(raw).initData,token);
    const email='telegram-'+user.id+'@users.trynka.invalid';
    const password=createHmac('sha256',loginSecret).update('trynka-telegram:'+user.id).digest('hex')+'Aa1!';
    const credentials={email,password};
    let login=await authRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify(credentials)},publicKey);
    if(!login.ok){
      const nick=(String(user.first_name||user.username||'Гравець').trim()||'Гравець').slice(0,20);
      const created=await authRequest('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true,user_metadata:{nickname:nick,telegram_id:user.id}})},adminKey);
      if(!created.ok && created.status!==422) return send(502,{error:'Could not create player'});
      login=await authRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify(credentials)},publicKey);
    }
    if(!login.ok||!login.body.access_token||!login.body.refresh_token) return send(401,{error:'Could not sign in player'});
    return send(200,{access_token:login.body.access_token,refresh_token:login.body.refresh_token});
  } catch(e) {return send(401,{error:'Telegram authentication failed'});}
}
