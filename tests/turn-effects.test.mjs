import test from 'node:test';
import assert from 'node:assert/strict';
import {turnProgress} from '../turn-effects-v111.js';

const begin='2026-10-08T12:00:00.000Z';
const room={turn_seconds:30};
const playing={status:'playing',turn_user_id:'player-1',turn_started_at:begin};
test('timer derives from server turn time, not the UI countdown',()=>{
 const value=turnProgress(playing,room,Date.parse(begin)+10000);
 assert.equal(value.userId,'player-1');
 assert.equal(value.seconds,20);
 assert.ok(Math.abs(value.fraction-2/3)<.00001);
});
test('turn progress is clamped and does not authorize an automatic fold',()=>{
 assert.deepEqual(turnProgress(playing,room,Date.parse(begin)-5000),{userId:'player-1',seconds:30,fraction:1});
 assert.deepEqual(turnProgress(playing,room,Date.parse(begin)+35000),{userId:'player-1',seconds:0,fraction:0});
});
test('finished, idle and malformed rounds show no progress',()=>{
 assert.equal(turnProgress({...playing,status:'finished'},room,Date.parse(begin)),null);
 assert.equal(turnProgress({...playing,turn_user_id:null},room,Date.parse(begin)),null);
 assert.equal(turnProgress({...playing,turn_started_at:'bad'},room,Date.parse(begin)),null);
 assert.equal(turnProgress(playing,{turn_seconds:0},Date.parse(begin)),null);
});
test('server/client clock skew is removed by supplied server-now timestamp',()=>{
 const localClock=Date.parse(begin)+62000;
 const serverClock=Date.parse(begin)+15000;
 const skew=-47000;
 assert.equal(turnProgress(playing,room,localClock+skew).seconds,15);
 assert.equal(turnProgress(playing,room,serverClock).seconds,15);
});
