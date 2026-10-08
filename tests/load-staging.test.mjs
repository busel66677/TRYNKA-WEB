import test from 'node:test';
import assert from 'node:assert/strict';
import {requireStagingSupabaseUrl,requireVirtualUsers} from '../load/staging-guard.js';
import {createRoomRecovery} from '../room-recovery-v110.js';

const accepted='STAGING_ONLY_I_ACCEPT_THE_TEST_LOAD';

test('load runner absolutely refuses production, HTTP, arbitrary hosts and no confirmation',()=>{
  for(const url of [
    'https://oqyjypzltncbruzaxetp.supabase.co',
    'https://trinka.pp.ua',
    'http://dev.supabase.co',
    'https://dev.supabase.co.evil.example',
    'https://dev.supabase.co/rest/v1/rpc/play_round_action',
    'https://dev.supabase.co?apikey=abc'
  ])assert.throws(()=>requireStagingSupabaseUrl(url,accepted));
  assert.throws(()=>requireStagingSupabaseUrl('https://separate-staging.supabase.co',''));
  assert.equal(requireStagingSupabaseUrl('https://separate-staging.supabase.co/',accepted),
    'https://separate-staging.supabase.co');
});
test('load tool enforces small default / hard 150 VU ceiling',()=>{
  for(const n of [0,-1,151,'anything',2.5])assert.throws(()=>requireVirtualUsers(n));
  assert.equal(requireVirtualUsers('100'),100);
  assert.equal(requireVirtualUsers(150),150);
});
test('150 simulated room transports reconnect only once each and never after leave',async()=>{
  const queue=new Map(),calls=[];
  let seq=0;
  const setTimer=(fn,ms)=>{const id=++seq;queue.set(id,{fn,ms});return id};
  const clearTimer=id=>queue.delete(id);
  const controllers=Array.from({length:150},(_,i)=>createRoomRecovery({
    isOnline:()=>true,setTimer,clearTimer,
    onRetry:async(id,token)=>{calls.push([id,token])}
  }));
  for(let i=0;i<150;i++){
    const ctrl=controllers[i],token=ctrl.activate(i+1);
    ctrl.onStatus(i+1,token,'CHANNEL_ERROR');
    ctrl.onStatus(i+1,token,'TIMED_OUT');
    ctrl.onStatus(i+1,token,'CLOSED');
  }
  assert.equal(queue.size,150,'only one queued retry per user after failure burst');
  for(let i=0;i<50;i++)controllers[i].stop();
  assert.equal(queue.size,100,'50 departed sessions cancel all stale retries');
  const pending=[...queue.values()];
  queue.clear();
  await Promise.all(pending.map(x=>x.fn()));
  assert.equal(calls.length,100);
  assert.equal(new Set(calls.map(x=>x[0])).size,100);
  assert.equal(queue.size,0,'no reconnect loop after healthy callback');
});
