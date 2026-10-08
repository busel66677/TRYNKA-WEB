import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateActionSnapshot, uncertainActionError, actionResolvedBySnapshot,
  pendingActionStorage
} from '../action-safety-v113.js';

const user='player-one', enemy='player-two';
const playing={
  room:{id:42,game_status:'playing'},
  round:{id:123,status:'playing',round_no:2,turn_user_id:user,turn_started_at:'2026-10-08T10:00:00Z'},
  round_players:[{user_id:user,folded:false},{user_id:enemy,folded:false}]
};
const action={roomId:42,roundId:123,turnStartedAt:'2026-10-08T10:00:00Z',nonce:'16b2fcf1-7cec-48a6-9bee-dba6705d12b0',userId:user,action:'call'};
test('server snapshot, room, membership and turn must authorize local button',()=>{
  assert.equal(validateActionSnapshot(playing,42,user,'call'),null);
  assert.match(validateActionSnapshot(null,42,user,'call'),/стіл/);
  assert.match(validateActionSnapshot(playing,55,user,'call'),/стіл/);
  assert.match(validateActionSnapshot({...playing,round:{...playing.round,turn_user_id:enemy}},42,user,'call'),/іншого/);
  assert.match(validateActionSnapshot({...playing,round_players:[{user_id:user,folded:true}]},42,user,'call'),/не можете/);
  assert.match(validateActionSnapshot({...playing,round:{...playing.round,status:'finished'}},42,user,'call'),/закінчилась/);
});
test('reveal prohibited in round 1, allowed in round 2; unknown actions denied',()=>{
  assert.match(validateActionSnapshot({...playing,round:{...playing.round,round_no:1}},42,user,'reveal'),/другого/);
  assert.equal(validateActionSnapshot(playing,42,user,'reveal'),null);
  assert.match(validateActionSnapshot(playing,42,user,'dark'),/Невідома/);
});
test('ambiguous network failure must not be treated as rejected bet',()=>{
  assert.equal(uncertainActionError(new TypeError('Failed to fetch')),true);
  assert.equal(uncertainActionError({status:503,message:'Gateway Timeout'}),true);
  assert.equal(uncertainActionError({status:0,message:'Network request failed'}),true);
  assert.equal(uncertainActionError({status:400,code:'P0001',message:'Not your turn'}),false);
  assert.equal(uncertainActionError({status:403,message:'Not authorized'}),false);
  assert.equal(uncertainActionError(null),false);
});
test('same stale snapshot never unlocks an unknown bet',()=>{
  assert.equal(actionResolvedBySnapshot(action,playing,user),false);
  assert.equal(actionResolvedBySnapshot(action,{...playing,room:{...playing.room,id:99}},user),false);
  assert.equal(actionResolvedBySnapshot(action,null,user),false);
});
test('only authoritative server turn change, fold, or completion releases uncertainty',()=>{
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:{...playing.round,turn_user_id:enemy}},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:{...playing.round,turn_started_at:'2026-10-08T10:00:12Z'}},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:{...playing.round,id:124}},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:{...playing.round,status:'finished'}},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round_players:[{user_id:user,folded:true}]},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:null,room:{id:42,game_status:'waiting'}},user),true);
  assert.equal(actionResolvedBySnapshot(action,{...playing,round:null,room:{id:42,game_status:'playing'}},user),false);
});
test('pending nonce persists across page reload and is never silently reset',()=>{
  const entries=new Map();
  const storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const store=pendingActionStorage(storage);
  store.write(action);
  assert.equal(store.read().nonce,action.nonce);
  assert.equal(store.read().uncertain,true);
  store.clear();
  assert.equal(store.read(),null);
});
test('malformed or unavailable storage cannot accidentally authorize any action',()=>{
  const entries=new Map([['trynka_action_pending_v1','{bad-json']]);
  const storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  assert.equal(pendingActionStorage(storage).read(),null);
  entries.set('trynka_action_pending_v1',JSON.stringify({...action,nonce:'not-a-uuid'}));
  assert.equal(pendingActionStorage(storage).read(),null);
  const unavailable={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  assert.equal(pendingActionStorage(unavailable).read(),null);
  assert.doesNotThrow(()=>pendingActionStorage(unavailable).write(action));
  assert.doesNotThrow(()=>pendingActionStorage(unavailable).clear());
});
