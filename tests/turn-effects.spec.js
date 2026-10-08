import {test,expect} from '@playwright/test';

test.beforeEach(async ({page})=>{
 await page.route(/\.js(?:\?|$)/,route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/turn-effects-v111.js'))return route.continue();
   return route.fulfill({status:200,contentType:'application/javascript',body:''});
 });
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
   document.querySelectorAll('main>section').forEach(el=>el.classList.add('hide'));
   document.getElementById('game').classList.remove('hide');
   document.getElementById('seats').innerHTML=
     '<div class="seat s0 p0 mine" data-user-id="player1"><span class="seatAvatar">♠</span><div class="seatName">Гравець</div></div>'+
     '<div class="seat s4 p4" data-user-id="player2"><span class="seatAvatar">♦</span><div class="seatName">Суперник</div></div>';
 });
});
function gameState(turn='player1',status='playing'){
 const now=Date.now();
 return {
   server_ts:new Date(now).toISOString(),
   room:{id:11,turn_seconds:30},
   round:{
     id:50,status,turn_user_id:turn,
     turn_started_at:new Date(now-10000).toISOString(),
     finished_at:status==='finished'?new Date(now).toISOString():null,
     winner_id:status==='finished'?'player2':null
   }
 };
}
test('active seat displays server-derived turn-time progress and updates on turn swap',async ({page})=>{
 await page.evaluate(s=>document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:s})),gameState());
 const first=page.locator('#seats .seat[data-user-id="player1"] .trynkaTurnProgress');
 await expect(first).toBeVisible();
 const width=await first.evaluate(el=>parseFloat(el.style.width));
 expect(width).toBeGreaterThan(62);
 expect(width).toBeLessThan(70);
 await expect(page.locator('#roundTurn')).toHaveAttribute('data-last-seconds',/1[89]|20/);
 await page.evaluate(s=>document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:s})),gameState('player2'));
 await expect(page.locator('#seats .seat[data-user-id="player1"] .trynkaTurnProgress')).toHaveCount(0);
 await expect(page.locator('#seats .seat[data-user-id="player2"] .trynkaTurnProgress')).toBeVisible();
});
test('win effect is cosmetic and never covers or captures betting actions',async({page})=>{
 await page.evaluate(s=>document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:s})),gameState());
 await page.evaluate(s=>document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:s})),gameState(null,'finished'));
 await expect(page.locator('#seats .trynkaTurnProgress')).toHaveCount(0);
 await expect(page.locator('.trynkaWinnerChip')).toHaveCount(3);
 const controls=page.locator('#gameActions .actionButtons button');
 await expect(controls).toHaveCount(4);
 const checks=await page.locator('.trynkaWinnerChip').evaluateAll(all=>all.map(x=>getComputedStyle(x).pointerEvents));
 expect(checks.every(x=>x==='none')).toBe(true);
 await expect(page.locator('.trynkaWinnerChip')).toHaveCount(0,{timeout:3000});
});
test('reduced motion skips chip flight',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(s=>document.dispatchEvent(new CustomEvent('trynka:game-state',{detail:s})),gameState(null,'finished'));
 await expect(page.locator('.trynkaWinnerChip')).toHaveCount(0);
});
