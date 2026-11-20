import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameApi } from '../telegram/game.mjs';

test('test game exposes synchronized deal and reveal timestamps without leaking cards', async () => {
  const seats=new Map([
    ['1001',{table:1,seat:1,name:'Перший'}],
    ['1002',{table:1,seat:2,name:'Другий'}]
  ]);
  const api=createGameApi({
    seats,stakes:[2,5],
    validate:raw=>({id:Number(raw)}),
    readPayload:async req=>req.body,
    json:(res,code,body)=>{res.code=code;res.body=body;}
  });
  const call=async (id,action)=>{
    const response={};
    await api({body:{initData:String(id),table:1,action}},response);
    assert.equal(response.code,200);
    return response.body;
  };
  const started=await call(1001,'start');
  assert.equal(started.status,'playing');
  assert.ok(Number.isFinite(started.dealStartedAt));
  assert.ok(Date.now()-started.dealStartedAt<5000);
  assert.equal(started.players[0].cards.length,3);
  assert.equal(started.players[1].cards,null);
  const opponent=await call(1002,'state');
  assert.equal(opponent.dealStartedAt,started.dealStartedAt);
  assert.equal(opponent.players[0].cards,null);
  assert.equal(opponent.players[1].cards.length,3);
  await call(1001,'call');
  const finished=await call(1002,'reveal');
  assert.equal(finished.status,'finished');
  assert.ok(Number.isFinite(finished.finishedAt));
  assert.ok(finished.finishedAt>=finished.dealStartedAt);
  assert.equal(finished.players[0].cards.length,3);
  assert.equal(finished.players[1].cards.length,3);
  assert.ok(finished.winners.length>=1);
});
test('Telegram UI includes stateful animations and persistent seat highlights',()=>{
  const js=readFileSync(new URL('../telegram/game-client.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../telegram/standalone.html',import.meta.url),'utf8');
  assert.match(js,/@keyframes tg-deal/);
  assert.match(js,/@keyframes tg-flip/);
  assert.match(js,/@keyframes tg-showdown-pop/);
  assert.match(js,/lastKey=/);
  assert.match(js,/if\(key!==lastKey/);
  assert.match(js,/window\.trynkaSyncGameHighlights/);
  assert.match(html,/el\.dataset\.seat=String\(seatNo\)/);
  assert.match(html,/if\(savedPanel\)room\.append\(savedPanel\)/);
});
