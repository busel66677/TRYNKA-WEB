import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloBotSession} from '../bot-test-session-v114.js';

function mockTimer(){
  let next=0;const intervals=new Map();
  return {intervals,
    setIntervalFn(fn,delay){const id=++next;intervals.set(id,{fn,delay});return id},
    clearIntervalFn(id){intervals.delete(id)}
  };
}
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}

test('BOT test remains dormant until the +BOT button opts in',async()=>{
 const t=mockTimer(),calls=[];
 const bot=createSoloBotSession({
   resolveRoom:async()=>42,runBotCycle:async id=>calls.push(id),
   ...t
 });
 assert.equal(bot.active,false);
 assert.equal(t.intervals.size,0);
 await bot.tick();
 assert.deepEqual(calls,[]);
});

test('start creates ONE scheduler, cycles the same active room and prevents concurrent loops',async()=>{
 const t=mockTimer();let unblock;
 const calls=[];
 const bot=createSoloBotSession({
   resolveRoom:async()=>42,
   runBotCycle:id=>{calls.push(id);return new Promise(r=>{unblock=r})},
   ...t
 });
 bot.start(42);
 await flush();
 assert.equal(t.intervals.size,1);
 assert.deepEqual(calls,[42]);
 bot.start(42);
 assert.equal(t.intervals.size,1);
 await bot.tick();await bot.tick();
 assert.deepEqual(calls,[42],'one cycle cannot be duplicated by rapid scheduling');
 unblock();
 await flush();
 const fn=[...t.intervals.values()][0].fn;
 fn();
 await flush();
 assert.deepEqual(calls,[42,42]);
 unblock();await flush();
 bot.stop();
 assert.equal(t.intervals.size,0);
});

test('leaving or moving to a different table cancels BOT without acting elsewhere',async()=>{
 const t=mockTimer();let room=7;const calls=[];
 const bot=createSoloBotSession({
   resolveRoom:async()=>room,runBotCycle:async id=>calls.push(id),
   ...t
 });
 bot.start(7);await flush();
 assert.deepEqual(calls,[7]);
 room=9;await bot.tick();
 assert.equal(bot.active,false);
 assert.deepEqual(calls,[7]);
 bot.start(9);await flush();
 assert.deepEqual(calls,[7,9]);
 bot.stop();await bot.tick();
 assert.equal(t.intervals.size,0);
 assert.deepEqual(calls,[7,9]);
});

test('closing the game or hiding the tab disables automated BOT gameplay',async()=>{
 const t=mockTimer();let visible=true;const calls=[];
 const bot=createSoloBotSession({
   isVisible:()=>visible,resolveRoom:async()=>3,runBotCycle:async id=>calls.push(id),
   ...t
 });
 bot.start(3);await flush();
 visible=false;
 await bot.tick();
 assert.equal(bot.active,false);
 assert.deepEqual(calls,[3]);
});

test('room switches invalidate a previous slow server membership response',async()=>{
 const t=mockTimer();let unlock;
 const calls=[];
 let waiting=false;
 const bot=createSoloBotSession({
   resolveRoom:()=>new Promise(r=>{if(!waiting){waiting=true;unlock=r}else r(11)}),
   runBotCycle:async id=>calls.push(id),
   ...t
 });
 bot.start(10);await flush();
 bot.stop();
 bot.start(11);await flush();
 unlock(10);await flush();
 assert.deepEqual(calls,[], 'stale result must not trigger old or wrong BOT action');
 bot.stop();
});

test('rejects invalid room IDs and malformed handlers',()=>{
 assert.throws(()=>createSoloBotSession({runBotCycle:async()=>{}}));
 const bot=createSoloBotSession({resolveRoom:async()=>1,runBotCycle:async()=>{}});
 for(const bad of [0,-1,NaN,'not-a-number',1.5]){
   assert.throws(()=>bot.start(bad));
 }
 assert.equal(bot.active,false);
});
