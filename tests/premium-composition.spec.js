import {test,expect} from '@playwright/test';

/* v115 premium visual checks: real layout/css and real DOM movers,
   isolated from login, Supabase and real player data. */
test.beforeEach(async ({page})=>{
 await page.route(/\.js(?:\?|$)/,route=>{
   const path=new URL(route.request().url()).pathname;
   if(['premium-table-v100.js','landscape-table-v104.js','mobile-clean-v107.js','bottom-cards-v108.js'].some(x=>path.endsWith('/'+x)))
     return route.continue();
   return route.fulfill({status:200,contentType:'application/javascript',body:''});
 });
});
async function setUp(page,width,height){
 await page.setViewportSize({width,height});
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
   for(const section of document.querySelectorAll('main > section'))section.classList.add('hide');
   document.getElementById('game').classList.remove('hide');
   document.getElementById('gameActions').classList.remove('hide');
   document.getElementById('cardDock').classList.remove('hide');
   document.getElementById('potBig').textContent='БАНК: 135 ◉';
   document.getElementById('roundTurn').textContent='ВАШ ХІД · 22с';
   document.getElementById('countdown').textContent='Ваш хід';
   document.getElementById('bankInfo').textContent='Ставка: 20 ◉';
   document.getElementById('seats').innerHTML=Array.from({length:8},(_,i)=>{
      const occupied=i===0||i===4;
      return '<div class="seat p'+i+(i===0?' mine':'')+(i===4?' turnActive':'')+
        (occupied?'':' free')+'" data-user-id="player-'+i+'">'+
        (occupied?'<span class="seatAvatar">♠</span><div class="seatBody"><b class="seatName">'+
          (i===0?'Я':'BOT')+'</b><span class="seatStack">◉ 1500</span></div>':
          '<span class="seatFreePlus">＋</span>')+'</div>';
   }).join('');
   document.getElementById('myHand').innerHTML=['A♠','10♥','6♦'].map((c,i)=>
     '<div class="card pullCard" data-card-index="'+i+'"><span class="cardFace">'+c+
     '</span><div class="cardCover"><i>♠</i><small>ПОТЯГНИ</small></div></div>').join('');
   window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
   window.TRYNKA_ARRANGE_ACTIONS_V107?.();
   window.TRYNKA_ARRANGE_BOTTOM_HAND_V108?.();
 });
}
const overlap=(a,b)=>a.x+a.width>b.x+1&&b.x+b.width>a.x+1&&a.y+a.height>b.y+1&&b.y+b.height>a.y+1;

for(const [width,height] of [[360,800],[393,873],[430,932]]){
 test('premium portrait table, actions and last-position hand '+width,async({page})=>{
   await setUp(page,width,height);
   const table=page.locator('#game .table');
   const centre=page.locator('#game .centerInfo');
   const actions=page.locator('#gameActions');
   const hand=page.locator('#playerHandTray');
   const seat0=page.locator('#game .seat.p0');
   const seat4=page.locator('#game .seat.p4');
   await expect(hand).toBeVisible();
   const [t,b,a,h,s0,s4]=await Promise.all([table,centre,actions,hand,seat0,seat4].map(el=>el.boundingBox()));
   expect(t.height).toBeGreaterThanOrEqual(450);
   expect(t.height).toBeLessThanOrEqual(485);
   expect(b.height).toBeLessThanOrEqual(111);
   expect(overlap(b,s0)).toBe(false);
   expect(overlap(b,s4)).toBe(false);
   expect(overlap(t,a)).toBe(false);
   expect(overlap(a,h)).toBe(false);
   expect(a.y).toBeGreaterThanOrEqual(t.y+t.height);
   expect(h.y).toBeGreaterThanOrEqual(a.y+a.height);
   await expect(hand.locator('.pullCard')).toHaveCount(3);
   const cards=await hand.locator('.pullCard').all();
   for(const c of cards){
     const r=await c.boundingBox();
     expect(r.width).toBeGreaterThanOrEqual(70);
     expect(r.height).toBeGreaterThanOrEqual(100);
     const hit=await c.evaluate(el=>{
       const b=el.getBoundingClientRect(),target=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
       return target===el||el.contains(target);
     });
     expect(hit).toBe(true);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
   const visuals=await table.evaluate(el=>({
      background:getComputedStyle(el).backgroundImage,
      radius:getComputedStyle(el).borderRadius,
      border:getComputedStyle(el).borderTopColor,
      bank:getComputedStyle(document.querySelector('#game .centerInfo')).backgroundImage
   }));
   expect(visuals.background).toContain('radial-gradient');
   expect(visuals.bank).toContain('linear-gradient');
   expect(visuals.radius).not.toBe('0px');
   expect(visuals.border).toBe('rgb(113, 53, 24)');
 });
}

test('controls remain click-targets and open cards stay on real seats',async({page})=>{
 await setUp(page,393,873);
 const g=page.locator('#game');
 for(const button of await g.locator('#gameActions .actionButtons button').all()){
   await button.scrollIntoViewIfNeeded();
   const hit=await button.evaluate(el=>{
     const b=el.getBoundingClientRect(),target=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
     return target===el||el.contains(target);
   });
   expect(hit).toBe(true);
 }
 const seat=g.locator('.seat.p4');
 await seat.evaluate(el=>{
   const open=document.createElement('div');
   open.className='seatShowdownCards';
   open.innerHTML='<b>A♠</b><b>J♦</b><b>8♣</b>';
   el.appendChild(open);
 });
 await expect(seat.locator('.seatShowdownCards b')).toHaveCount(3);
 await expect(g.locator('.centerInfo .seatShowdownCards')).toHaveCount(0);
});
