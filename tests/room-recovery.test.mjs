import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomRecovery} from '../room-recovery-v110.js';

function clock(){
  let n=0, id=0;
  const jobs=new Map();
  return {
    jobs,
    setTimer(fn,ms){const key=++id;jobs.set(key,{at:n+ms,fn});return key;},
    clearTimer(key){jobs.delete(key);},
    async next(){
      const item=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!item)return null;
      const [key,{at,fn}]=item;
      jobs.delete(key);n=at;
      await fn();
      await Promise.resolve();await Promise.resolve();
      return at;
    },
    peek(){return [...jobs.values()].map(x=>x.at-n).sort((a,b)=>a-b)[0]}
  };
}
test('channel failures coalesce into one scheduled retry',async()=>{
  const c=clock(),called=[];
  const ctrl=createRoomRecovery({onRetry:async(id,token)=>called.push([id,token]),setTimer:c.setTimer,clearTimer:c.clearTimer});
  const token=ctrl.activate(33);
  ctrl.onStatus(33,token,'CHANNEL_ERROR');
  ctrl.onStatus(33,token,'TIMED_OUT');
  ctrl.onStatus(33,token,'CLOSED');
  assert.equal(c.jobs.size,1);
  assert.equal(c.peek(),750);
  await c.next();
  assert.deepEqual(called,[[33,token]]);
});
test('subscribed status cancels scheduled retry, clears backoff',async()=>{
  const c=clock(),calls=[];
  const ctrl=createRoomRecovery({onRetry:async(...x)=>calls.push(x),setTimer:c.setTimer,clearTimer:c.clearTimer});
  const token=ctrl.activate(41);
  ctrl.onStatus(41,token,'CHANNEL_ERROR');
  assert.equal(ctrl.onStatus(41,token,'SUBSCRIBED'),true);
  assert.equal(ctrl.pending,false);
  assert.equal(await c.next(),null);
  ctrl.onStatus(41,token,'CLOSED');
  assert.equal(c.peek(),750);
  await c.next();
  assert.equal(calls.length,1);
});
test('stale callbacks never recover a different room or a left table',async()=>{
  const c=clock(),calls=[];
  const ctrl=createRoomRecovery({onRetry:async(...x)=>calls.push(x),setTimer:c.setTimer,clearTimer:c.clearTimer});
  const previous=ctrl.activate(1);
  ctrl.onStatus(1,previous,'CHANNEL_ERROR');
  const current=ctrl.activate(2);
  assert.notEqual(previous,current);
  assert.equal(ctrl.onStatus(1,previous,'SUBSCRIBED'),false);
  assert.equal(ctrl.onStatus(1,previous,'CLOSED'),false);
  assert.equal(c.jobs.size,0);
  ctrl.onStatus(2,current,'TIMED_OUT');
  ctrl.stop();
  assert.equal(c.jobs.size,0);
  assert.equal(ctrl.retryNow(),false);
  await c.next();
  assert.equal(calls.length,0);
});
test('offline suppresses retries and online can request immediate reconnect',async()=>{
  let online=false;const c=clock(),calls=[];
  const ctrl=createRoomRecovery({onRetry:async(id)=>calls.push(id),isOnline:()=>online,setTimer:c.setTimer,clearTimer:c.clearTimer});
  const token=ctrl.activate(50);
  ctrl.onStatus(50,token,'CHANNEL_ERROR');
  assert.equal(c.jobs.size,0);
  online=true;
  assert.equal(ctrl.retryNow(),true);
  assert.equal(c.peek(),0);
  await c.next();
  assert.deepEqual(calls,[50]);
});
test('failed retry backs off exponentially and caps delay',async()=>{
  const c=clock();
  let failures=0;
  const ctrl=createRoomRecovery({
    onRetry:async()=>{failures++;throw new Error('transport down')},
    setTimer:c.setTimer,clearTimer:c.clearTimer,baseDelay:500,maxDelay:2000
  });
  const token=ctrl.activate(123);
  ctrl.onStatus(123,token,'CHANNEL_ERROR');
  assert.equal(c.peek(),500);
  await c.next();assert.equal(c.peek(),1000);
  await c.next();assert.equal(c.peek(),2000);
  await c.next();assert.equal(c.peek(),2000);
  ctrl.stop();
  assert.equal(c.jobs.size,0);
  assert.equal(failures,3);
});
test('successful replacement generation ignores callbacks from old socket',async()=>{
  const c=clock(),calls=[];
  let ctrl;
  ctrl=createRoomRecovery({
    onRetry:async(id,token)=>{
      calls.push([id,token]);
      const fresh=ctrl.activate(id);
      ctrl.onStatus(id,fresh,'SUBSCRIBED');
    },
    setTimer:c.setTimer,clearTimer:c.clearTimer
  });
  const t=ctrl.activate(99);ctrl.onStatus(99,t,'CLOSED');
  await c.next();
  assert.equal(calls.length,1);
  assert.equal(ctrl.pending,false);
  ctrl.onStatus(99,t,'CHANNEL_ERROR');
  assert.equal(c.jobs.size,0);
});
