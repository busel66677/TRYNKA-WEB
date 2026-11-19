import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../telegram/standalone.html', import.meta.url),'utf8');
const club = readFileSync(new URL('../telegram/club-ui.js', import.meta.url),'utf8');
const controller = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] || '';

test('table invitation is validated and generates Telegram startapp link', () => {
  const start=controller.indexOf('function getTelegramStartParam()');
  const end=controller.indexOf('async function joinTable(table){',start);
  assert.ok(start>=0 && end>start,'Entry helpers should exist');
  const source=controller.slice(start,end);
  const compiled=new Function('tg','location','navigator','window','statusEl','stakes',
    'lastTables','refreshTables','joinTable','currentTable',
    source+'\nreturn {extractTableInvite,roomInviteUrl,quickJoin};');
  const joins=[];
  const helpers=compiled({initData:'telegram-test',initDataUnsafe:{}},{search:'',hash:''},{},
    {},{textContent:''},[2,5,10,20,50,100,200,500,1000],[
      {id:1,stake:2,occupied:4},{id:2,stake:5,occupied:2},{id:3,stake:10,occupied:0}
    ],async()=>{},async id=>{joins.push(id)},null);
  assert.equal(helpers.extractTableInvite('table_7'),7);
  assert.equal(helpers.extractTableInvite('table_10'),null);
  assert.equal(helpers.extractTableInvite('ref_999'),null);
  assert.equal(helpers.roomInviteUrl(3),'https://t.me/TrynkaGameBot?startapp=table_3');
  return helpers.quickJoin().then(()=>assert.deepEqual(joins,[2]));
});
test('invite button and quickplay wire to their handlers', () => {
  assert.match(controller,/invite\.onclick=shareRoomInvite/);
  assert.match(controller,/if\(inviteTarget\)await joinTable\(inviteTarget\)/);
  assert.match(club,/window\.trynkaQuickJoin\(\)/);
});
