import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../telegram/chat.mjs';

test('global chat validates identity, limits spam, and masks user ids for non-admins', async () => {
  const messages = [];
  const mutes = new Map();
  let nextId = 0;
  const fakeDb = async (path, options={}) => {
    if(path.startsWith('/rest/v1/telegram_chat_mutes')) {
      const id = Number(/telegram_id=eq\.(\d+)/.exec(path)?.[1]);
      if(options.method==='POST') {
        const item=JSON.parse(options.body);mutes.set(Number(item.telegram_id),item.muted_until);return null;
      }
      if(options.method==='DELETE'){mutes.delete(id);return null;}
      return mutes.has(id)?[{muted_until:mutes.get(id)}]:[];
    }
    if(path.startsWith('/rest/v1/telegram_global_chat')) {
      if(options.method==='POST') {
        const row=JSON.parse(options.body);
        const entry={id:++nextId,...row,created_at:new Date().toISOString(),deleted_at:null};
        messages.push(entry);return [entry];
      }
      if(options.method==='PATCH'){
        const id=Number(/id=eq\.(\d+)/.exec(path)?.[1]);
        const row=messages.find(x=>x.id===id);if(row)row.deleted_at=new Date().toISOString();
        return null;
      }
      const sender=/sender_id=eq\.(\d+)/.exec(path)?.[1];
      let rows=messages.filter(x=>sender?x.sender_id===Number(sender):!x.deleted_at);
      return rows.sort((a,b)=>b.id-a.id).slice(0,sender?1:60);
    }
    throw new Error('Unexpected path '+path);
  };
  const api=createChatApi({
    readPayload:async req=>req.body,
    json:(res,status,body)=>{res.status=status;res.body=body;},
    validate:(initData)=> {
      if(initData==='bad')throw Error('Invalid signature');
      return {id:Number(initData),first_name:initData==='1'?'Адмін':'Гравець'};
    },
    sb:fakeDb, adminId:1
  });
  const call=async(id,action,extra={})=>{
    const res={};await api({body:{initData:String(id),action,...extra}},res);return res;
  };
  assert.equal((await call('bad','list')).status,401);
  assert.equal((await call(2,'send',{text:'Привіт, друзі!'})).status,200);
  assert.equal((await call(2,'send',{text:'спам'})).status,429);
  const list=(await call(3,'list')).body.messages;
  assert.equal(list[0].text,'Привіт, друзі!');
  assert.equal(list[0].senderId,undefined);
  assert.equal((await call(3,'delete',{messageId:1})).status,403);
  assert.equal((await call(1,'mute',{targetId:2,seconds:600})).status,200);
  assert.equal((await call(2,'send',{text:'Спроба'})).status,403);
  assert.equal((await call(1,'list')).body.messages[0].senderId,2);
  assert.equal((await call(1,'delete',{messageId:1})).status,200);
  assert.equal((await call(3,'list')).body.messages.length,0);
  assert.equal((await call(1,'unmute',{targetId:2})).status,200);
  assert.equal((await call(2,'list')).body.mutedUntil,null);
});
