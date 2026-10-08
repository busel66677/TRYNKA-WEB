import {test,expect} from '@playwright/test';

/* Simulate the exact live failure: a room snapshot paints revealed cards,
   then the app replaces seat nameplates due to changed chip stacks. */
test.beforeEach(async({page})=>{
 await page.route(/\.js(?:\?|$)/,route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/revealed-hands-v99.js')||
      path.endsWith('/authorized-reveals-v116.js'))return route.continue();
   return route.fulfill({status:200,contentType:'application/javascript',body:''});
 });
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
   for(const el of document.querySelectorAll('main>section'))el.classList.add('hide');
   document.getElementById('game').classList.remove('hide');
   const el=document.getElementById('seats');
   el.innerHTML='<div class="seat s0 p0" data-user-id="actor"><span class="seatName">Я</span></div>'+
     '<div class="seat s4 p4" data-user-id="target"><span class="seatName">BOT</span></div>';
   document.getElementById('cardDock').classList.remove('hide');
 });
});
const snapshot={
 room:{id:12,game_status:'playing'},
 round:{id:88,status:'finished',reveal_actor:'actor',reveal_target:'target',
   reveal_actor_cards:['A♠','K♠','6♠'],reveal_cards:['J♦','10♦','8♣']},
 round_players:[{user_id:'actor'},{user_id:'target'}],
 my_hand:['A♠','K♠','6♠']
};
test('remount of all seats cannot permanently erase revealed rival cards',async({page})=>{
 await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   paintAuthorizedReveals(s,'actor');
 },snapshot);
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(2);
 await page.evaluate(()=>{
   const seats=document.getElementById('seats');
   seats.innerHTML='<div class="seat s0 p0" data-user-id="actor"><span class="seatName">Я</span></div>'+
     '<div class="seat s4 p4" data-user-id="target"><span class="seatName">BOT</span></div>';
 });
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(0);
 await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   paintAuthorizedReveals(s,'actor');
 },snapshot);
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(2);
 const rival=page.locator('#seats .seat[data-user-id="target"] .seatShowdownCards b');
 await expect(rival).toHaveText(['J♦','10♦','8♣']);
 await expect(page.locator('#game .table')).toHaveClass(/seatRevealActive/);
 const retained=await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   const before=document.querySelector('#seats .seat[data-user-id="target"] .seatShowdownCards');
   paintAuthorizedReveals(s,'actor');
   return before===document.querySelector('#seats .seat[data-user-id="target"] .seatShowdownCards');
 },snapshot);
 expect(retained).toBe(true);
});
test('nonparticipants cannot see the hands, and next deal clears them',async({page})=>{
 await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   paintAuthorizedReveals(s,'spectator');
 },snapshot);
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(0);
 await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   paintAuthorizedReveals(s,'target');
 },snapshot);
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(2);
 await page.evaluate(async s=>{
   const {paintAuthorizedReveals}=await import('/authorized-reveals-v116.js');
   paintAuthorizedReveals({...s,round:{...s.round,id:89,status:'playing',reveal_actor:null,reveal_target:null}},'actor');
 },snapshot);
 await expect(page.locator('#seats .seatShowdownCards')).toHaveCount(0);
 await expect(page.locator('#game .table')).not.toHaveClass(/seatRevealActive/);
});
