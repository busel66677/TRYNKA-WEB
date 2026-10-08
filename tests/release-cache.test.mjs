import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
test('released build metadata, service worker cache and registration agree',()=>{
 const v=JSON.parse(read('version.json'));
 const release=Number(String(v.version).replace(/^v/,''));
 assert.ok(Number.isSafeInteger(release)&&release>=112);
 const index=read('index.html');
 const sw=read('sw.js');
 const registration=read('experience-v27.js');
 assert.match(index,new RegExp('content="2026\\.10\\.08-v'+release+'"'));
 assert.match(sw,new RegExp("const CACHE='trynka-v"+release+"'"));
 assert.ok(registration.includes("register('./sw.js?v="+release+"')"));
 assert.ok(index.includes('experience-v27.js?v=20261008-sw-v'+release));
});
test('room recovery implementation cannot be cached as pre-reconnect app.js',()=>{
 const page=read('index.html');
 const app=read('app.js');
 const reconnect=read('room-recovery-v110.js');
 assert.ok(app.includes("import {createRoomRecovery} from './room-recovery-v110.js'"));
 assert.ok(reconnect.includes("CHANNEL_ERROR")&&reconnect.includes("TIMED_OUT"));
 const match=page.match(/<script type="module" src="app\.js\?v=20261008-reconnect-v(\d+)"/);
 assert.ok(match,'main page must use a cache-busted recovery app module');
 assert.ok(Number(match[1])>=112,'old cached app.js cannot be loaded');
});
