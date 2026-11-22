import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreHand,createGameApi} from '../telegram/game.mjs';

test('валет піки працює як джокер і 666 старший за тузів та 31',()=>{
  const six=scoreHand([{rank:'6',suit:'♥'},{rank:'6',suit:'♦'},{rank:'J',suit:'♠'}]);
  const aces=scoreHand([{rank:'A',suit:'♥'},{rank:'A',suit:'♣'},{rank:'J',suit:'♠'}]);
  const points=scoreHand([{rank:'A',suit:'♥'},{rank:'K',suit:'♥'},{rank:'Q',suit:'♥'}]);
  assert.equal(six.value,1000);
  assert.equal(aces.value,990);
  assert.ok(six.value>aces.value&&aces.value>points.value);
  assert.match(six.label,/джокер J♠/);
});

test('Готово: лише власна готовність, 5 с та приватні карти',async()=>{
  const seats=new Map([
    ['101',{table:1,seat:1,name:'А'}],
    ['102',{table:1,seat:2,name:'Б'}],
    ['103',{table:1,seat:3,name:'В'}]
  ]);
  const api=createGameApi({
    seats,stakes:[2],validate:value=>({id:Number(value)}),
    readPayload:async req=>req.body,
    json:(res,status,body)=>{res.status=status;res.body=body;}
  });
  const act=async(id,action)=>{
    const res={};
    await api({body:{initData:String(id),table:1,action}},res);
    assert.equal(res.status,200,JSON.stringify(res.body));
    return res.body;
  };
  const now=Date.now;
  let clock=1700000000000;
  Date.now=()=>clock;
  try{
    const first=await act(101,'ready');
    assert.equal(first.status,'waiting');
    assert.equal(first.readyCount,1);
    assert.equal(first.myReady,true);
    assert.equal((await act(102,'state')).myReady,false);
    const second=await act(102,'ready');
    assert.equal(second.readyCount,2);
    assert.equal(second.readyEndsAt,clock+5000);
    clock+=4999;
    assert.equal((await act(101,'state')).status,'waiting');
    clock++;
    const started=await act(101,'state');
    assert.equal(started.status,'playing');
    assert.equal(started.players.length,2);
    assert.equal(started.players[0].cards.length,3);
    assert.equal(started.players[1].cards,null);
    const other=await act(102,'state');
    assert.equal(other.players[0].cards,null);
    assert.equal(other.players[1].cards.length,3);
  }finally{Date.now=now;}
});

test('скасування Готово відміняє відлік',async()=>{
  const seats=new Map([['1',{table:1,seat:1}],['2',{table:1,seat:2}]]);
  const api=createGameApi({seats,stakes:[2],validate:value=>({id:Number(value)}),readPayload:async req=>req.body,json:(res,status,body)=>{res.status=status;res.body=body}});
  const action=async(id,act)=>{const r={};await api({body:{initData:id,table:1,action:act}},r);return r.body};
  await action('1','ready');
  await action('2','ready');
  const cancelled=await action('2','ready');
  assert.equal(cancelled.readyCount,1);
  assert.equal(cancelled.readyEndsAt,null);
});