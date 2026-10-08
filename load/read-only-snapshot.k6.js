/* Read-only k6 staging snapshot load test. NEVER use against production.
   Separate staging user tokens must be created through regular test auth flows.
   No auth secrets, room IDs or response bodies are printed to reports. */
import http from 'k6/http';
import {check,sleep} from 'k6';
import {requireStagingSupabaseUrl,requireVirtualUsers} from './staging-guard.js';

const HOST=requireStagingSupabaseUrl(__ENV.STAGING_SUPABASE_URL,__ENV.STAGING_CONFIRM);
const VUS=requireVirtualUsers(__ENV.LOAD_VUS||'10');
const duration=__ENV.LOAD_DURATION||'1m';
if(!/^[1-5]m$/.test(duration))
  throw new Error('LOAD_DURATION must be 1m to 5m (staging only)');
const id=Number(__ENV.STAGING_ROOM_ID);
if(!Number.isSafeInteger(id)||id<=0)
  throw new Error('A numeric STAGING_ROOM_ID with 1–150 seated test users is required');
const publishable=(__ENV.STAGING_PUBLISHABLE_KEY||'').trim();
if(publishable.length<10)throw new Error('STAGING_PUBLISHABLE_KEY is required');
const tokens=String(__ENV.STAGING_JWTS||'').split(',').map(s=>s.trim()).filter(Boolean);
if(new Set(tokens).size<VUS)
  throw new Error('Provide at least LOAD_VUS DISTINCT staging account JWTs via STAGING_JWTS');
if(tokens.length<VUS)throw new Error('Not enough staging JWTs for all virtual users');

export const options={
  scenarios:{
    stage_snapshots:{executor:'constant-vus',vus:VUS,duration,gracefulStop:'10s'}
  },
  thresholds:{
    http_req_failed:['rate<0.02'],
    http_req_duration:['p(95)<1500'],
    checks:['rate>0.98']
  }
};
const endpoint=HOST+'/rest/v1/rpc/get_room_game_snapshot';
export default function(){
  const response=http.post(endpoint,JSON.stringify({p_room:id}),{
    headers:{
      apikey:publishable,
      Authorization:'Bearer '+tokens[(__VU-1)%VUS],
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    timeout:'8s',
    tags:{endpoint:'game_snapshot_readonly'}
  });
  check(response,{
    'authorized room snapshot received':r=>{
      if(r.status!==200)return false;
      try{return Number(r.json('room.id'))===id}catch{return false}
    }
  });
  sleep(2);
}
