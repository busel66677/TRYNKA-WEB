import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const escRe=value=>String(value).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');

test('released build metadata, service worker cache and registration agree',()=>{
 const v=JSON.parse(read('version.json'));
 const release=Number(String(v.version).replace(/^v/,''));
 assert.ok(Number.isSafeInteger(release)&&release>=112);
 assert.equal(v.build.endsWith('-v'+release),true,'build metadata must end with the release number');
 const index=read('index.html');
 const sw=read('sw.js');
 const registration=read('experience-v27.js');
 assert.match(index,new RegExp('content="'+escRe(v.build)+'"'));
 assert.match(sw,new RegExp("const CACHE='trynka-v"+release+"'"));
 assert.ok(registration.includes("register('./sw.js?v="+release+"')"));
 assert.match(index,new RegExp('experience-v27\\.js\\?v=[^"]*v'+release));
});

test('room recovery implementation cannot be cached as pre-reconnect app.js',()=>{
 const v=JSON.parse(read('version.json'));
 const release=Number(String(v.version).replace(/^v/,''));
 const page=read('index.html');
 const app=read('app.js');
 const reconnect=read('room-recovery-v110.js');
 assert.ok(app.includes("import {createRoomRecovery} from './room-recovery-v110.js'"));
 assert.ok(reconnect.includes('CHANNEL_ERROR')&&reconnect.includes('TIMED_OUT'));
 const match=page.match(/<script type="module" src="app\.js\?v=([^"]*v(\d+))"/);
 assert.ok(match,'main page must use a cache-busted recovery app module');
 assert.equal(Number(match[2]),release,'app.js cache-buster must match the released build');
});
