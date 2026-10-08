import { test, expect } from '@playwright/test';

/* Keep the real card-DOM movers and authorized showdown renderer. Block all
 * backend modules: geometry and pointer controls must work without game writes.
 */
test.beforeEach(async ({page})=>{
  await page.route(/\.js(?:\?|$)/,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/premium-table-v100.js')||
       path.endsWith('/landscape-table-v104.js')||
       path.endsWith('/revealed-hands-v99.js'))return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
});
async function populate(page,width,height){
  await page.setViewportSize({width,height});
  await page.goto('/index.html',{waitUntil:'load'});
  await page.evaluate(()=>{
    for(const sec of document.querySelectorAll('main>section'))sec.classList.add('hide');
    const g=document.getElementById('game');g.classList.remove('hide');
    document.getElementById('cardDock').classList.remove('hide');
    document.getElementById('gameActions').classList.remove('hide');
    const hand=document.getElementById('myHand');
    hand.dataset.identity='keep-me';
    hand.className='hand cardDockHand handSeat0';
    hand.innerHTML=['A♠','10♣','6♥'].map(value=>'<div class="card pullCard"><span class="cardFace">'+value+'</span></div>').join('');
    document.getElementById('seats').innerHTML=[0,2,4,6].map(i=>
      '<div class="seat s'+i+' p'+i+(i===0?' mine':'')+'" data-user-id="player-'+i+'">'+
      '<span class="seatAvatar">♠</span><span class="seatBody"><span class="seatName">Гравець '+i+'</span>'+
      '<span class="seatStack">◉ 500</span></span></div>').join('');
    window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
  });
}
const overlap=(a,b,p=1)=>a&&b&&a.x+a.width>b.x+p&&b.x+b.width>a.x+p&&a.y+a.height>b.y+p&&b.y+b.height>a.y+p;

for(const [width,height] of [[873,393],[740,360],[932,430]]){
 test('landscape layout preserves cards and clear central bank at '+width+'x'+height,async({page})=>{
  await populate(page,width,height);
  const geometry=await page.evaluate(()=>{
    const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height}};
    return {
      orientation:matchMedia('(orientation: landscape)').matches,
      same:document.getElementById('myHand').dataset.identity,
      cards:document.querySelectorAll('#myHand .card').length,
      parent:document.getElementById('cardDock').parentElement.className,
      outerWidth:document.documentElement.scrollWidth,
      viewport:innerWidth,
      table:rect('#game .table'),bank:rect('#game .centerInfo'),
      hand:rect('#cardDock'),actions:rect('#gameActions'),
      top:rect('#game .gameTop'),
      seats: [...document.querySelectorAll('#game .seat')].map(el=>({slot:el.className,rect:(()=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()})),
      buttonOrder:[...document.querySelectorAll('#gameActions [data-action]')].sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x).map(el=>el.dataset.action)
    };
  });
  expect(geometry.orientation).toBe(true);
  expect(geometry.parent.split(' ')).toContain('table');
  expect(geometry.same).toBe('keep-me');
  expect(geometry.cards).toBe(3);
  expect(geometry.table.width/geometry.table.height).toBeGreaterThan(2);
  expect(geometry.outerWidth).toBeLessThanOrEqual(geometry.viewport+3);
  expect(geometry.buttonOrder).toEqual(['fold','call','raise','reveal']);
  expect(overlap(geometry.hand,geometry.bank,2)).toBe(false);
  expect(overlap(geometry.hand,geometry.actions,2)).toBe(false);
  expect(geometry.hand.y).toBeGreaterThan(geometry.bank.y+geometry.bank.height);
  expect(geometry.actions.y).toBeGreaterThan(geometry.table.y+geometry.table.height-10);
  expect(geometry.actions.y+geometry.actions.height).toBeLessThanOrEqual(height+15);
  expect(geometry.top.y+geometry.top.height).toBeLessThan(geometry.table.y);
 });
}

test('rotate mode suggests landscape and still allows portrait fallback',async({page})=>{
 await populate(page,393,873);
 const el=page.locator('#trynkaRotateNotice');
 await expect(el).toBeVisible();
 await expect(el).toContainText('Поверніть телефон');
 await el.getByRole('button',{name:'Продовжити вертикально'}).click();
 await expect(el).toBeHidden();
 const parent=await page.locator('#cardDock').evaluate(d=>d.parentElement.className);
 expect(parent.split(' ')).toContain('table');
 await page.setViewportSize({width:873,height:393});
 await page.evaluate(()=>window.TRYNKA_ARRANGE_LANDSCAPE_TABLE());
 await expect(el).toBeHidden();
 expect(await page.locator('#myHand .card').count()).toBe(3);
});
test('authorized revealed cards remain at exact rival seats after rotation',async({page})=>{
 await populate(page,873,393);
 const result=await page.evaluate(async()=>{
  const {paintRevealedHands}=await import('/revealed-hands-v99.js');
  const pairs=[{user_id:'player-2',cards:['A♦','K♣','6♥']},{user_id:'player-6',cards:['10♠','8♠','7♠']}];
  const count=paintRevealedHands(pairs);
  const nodes=[...document.querySelectorAll('#seats .seatShowdownCards')];
  const bank=document.querySelector('#game .centerInfo').getBoundingClientRect();
  const intersects=(r,b)=>r.left<b.right-1&&r.right>b.left+1&&r.top<b.bottom-1&&r.bottom>b.top+1;
  return {count,owners:nodes.map(n=>n.parentElement.dataset.userId),bankCollision:nodes.some(n=>intersects(n.getBoundingClientRect(),bank)),
    afterClear:(paintRevealedHands([]),document.querySelectorAll('#seats .seatShowdownCards').length)};
 });
 expect(result).toEqual({count:2,owners:['player-2','player-6'],bankCollision:false,afterClear:0});
});
