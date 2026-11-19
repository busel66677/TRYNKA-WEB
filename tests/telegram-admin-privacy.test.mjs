import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChatApi } from '../telegram/chat.mjs';

test('Telegram Mini App does not expose a phone contact in active page', () => {
  const html = readFileSync(new URL('../telegram/standalone.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /t\.me\/\+\d+/);
  assert.doesNotMatch(html, /\+380\d{9}/);
  assert.doesNotMatch(html, /0\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}/);
});
test('Admin messages use a role label and do not reveal Telegram ID to other players', async () => {
  const rows = [{id:1,sender_id:7,sender_name:'Old display name',body:'Older message',created_at:'2026-11-19T00:00:00Z'}];
  const sb = async (path, options={}) => {
    if (path.includes('telegram_chat_mutes')) return [];
    if (!path.includes('telegram_global_chat')) throw Error('Unexpected query');
    if (options.method === 'POST') {
      const row = { id:2, ...JSON.parse(options.body), created_at:new Date().toISOString() };
      rows.push(row);
      return [row];
    }
    if (path.includes('sender_id=eq.')) return [];
    return rows.slice().reverse();
  };
  const api = createChatApi({
    readPayload: async req => req.body,
    validate: value => ({id:Number(value),first_name:'Old display name'}),
    sb, adminId:7,
    json: (res, code, body) => { res.code=code;res.body=body; }
  });
  const call = async (id, action, options={}) => {
    const res = {};
    await api({body:{initData:String(id),action,...options}},res);
    return res;
  };
  assert.equal((await call(7,'send',{text:'Новий допис'})).code,200);
  const visible = (await call(8,'list')).body.messages;
  assert.equal(visible.length,2);
  assert.ok(visible.every(row=>row.name==='Адмін' && row.admin));
  assert.ok(visible.every(row=>!Object.hasOwn(row,'senderId')));
});
