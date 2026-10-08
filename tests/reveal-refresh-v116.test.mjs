import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedReveals} from '../authorized-reveals-v116.js';
import {createCoalescedRefresh} from '../room-refresh-v116.js';

const person={id:'player-1'},enemy={id:'player-2'};
const duel={
  round:{id:42,status:'finished',reveal_actor:person.id,reveal_target:enemy.id,
    reveal_actor_cards:['A♠','K♠','6♠'],reveal_cards:['10♦','J♣','7♦']},
  round_players:[{user_id:person.id},{user_id:enemy.id}],
  my_hand:['A♠','K♠','6♠']
};
test('each authorized reveal participant sees both complete valid hands',()=>{
 for(const p of [person.id,enemy.id]){
   const rows=authorizedReveals(duel,p);
   assert.deepEqual(rows.map(x=>x.user_id),[person.id,enemy.id]);
   assert.deepEqual(rows[1].cards,duel.round.reveal_cards);
 }
});
test('unrelated viewers, spectators and missing viewer ID NEVER receive hidden cards',()=>{
 for(const viewer of ['watcher',null,undefined,'']){
   assert.deepEqual(authorizedReveals(duel,viewer),[]);
 }
});
test('no reveal during playing round unless server marks both participants',()=>{
 const s=structuredClone(duel);
 s.round.reveal_actor=null;
 assert.deepEqual(authorizedReveals(s,person.id),[]);
 s.round.reveal_actor=person.id;
 s.round.status='waiting';
 assert.deepEqual(authorizedReveals(s,person.id),[]);
});
test('fallback only to own hand; never infer the opponent private hand',()=>{
 const s=structuredClone(duel);
 s.round.reveal_actor_cards=null;
 s.round.reveal_cards=null;
 assert.deepEqual(authorizedReveals(s,person.id),[{user_id:person.id,cards:s.my_hand}]);
 s.my_hand=['9♥'];
 assert.deepEqual(authorizedReveals(s,person.id),[]);
 s.my_hand=['A♠','K♠','6♠'];
 assert.deepEqual(authorizedReveals(s,enemy.id),[], 'must not attribute actor hand to target');
});
test('malformed, partial or absent participant seats cannot expose cards',()=>{
 const s=structuredClone(duel);
 s.round.reveal_cards=['6♥'];
 assert.deepEqual(authorizedReveals(s,person.id).map(x=>x.user_id),[person.id]);
 s.round.reveal_cards=duel.round.reveal_cards;
 s.round_players=[{user_id:person.id}];
 assert.deepEqual(authorizedReveals(s,person.id).map(x=>x.user_id),[person.id]);
});
function scheduler(){
 let next=0;const pending=new Map();
 return{
   pending,
   setTimer(fn,ms){const id=++next;pending.set(id,{fn,ms});return id},
   clearTimer(id){pending.delete(id)},
   run(){const arr=[...pending.values()];pending.clear();for(const a of arr)a.fn()}
 };
}
test('hundreds of room changes schedule exactly ONE repaint, without starvation',()=>{
 const t=scheduler(),calls=[];
 const q=createCoalescedRefresh({onRefresh:()=>calls.push(1),setTimer:t.setTimer,clearTimer:t.clearTimer});
 for(let i=0;i<500;i++)q.request(i%2?80:1800);
 assert.equal(t.pending.size,1);
 assert.equal([...t.pending.values()][0].ms,1200);
 t.run();
 assert.equal(calls.length,1);
 assert.equal(q.pending,false);
 q.request(200);
 t.run();
 assert.equal(calls.length,2);
});
test('pending refresh is canceled on room exit and delay is bounded',()=>{
 const t=scheduler();let calls=0;
 const q=createCoalescedRefresh({onRefresh:()=>calls++,setTimer:t.setTimer,clearTimer:t.clearTimer});
 q.request(0);
 assert.equal([...t.pending.values()][0].ms,90);
 q.cancel();
 t.run();
 assert.equal(calls,0);
 q.request(99999);
 assert.equal([...t.pending.values()][0].ms,1200);
 t.run();
 assert.equal(calls,1);
});
