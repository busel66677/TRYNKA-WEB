import { test, expect } from '@playwright/test';

// Visual fixture uses real CSS + real orientation controller. It never reads
// cards from Supabase and never changes a live table.
test.beforeEach(async ({page}) => {
  await page.route(/\.js(?:\?|$)/, route => {
    const path = new URL(route.request().url()).pathname;
    if(path.endsWith('landscape-table-v104.js') ||
       path.endsWith('premium-table-v100.js') ||
       path.endsWith('mobile-clean-v107.js') ||
       path.endsWith('bottom-cards-v108.js'))
      return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('/index.html', {waitUntil:'load'});
  await page.evaluate(() => {
    const g=document.getElementById('game');
    for(const section of document.querySelectorAll('main > section'))
      section.classList.add('hide');
    g.classList.remove('hide');
    document.getElementById('gameActions').classList.remove('hide');
    document.getElementById('cardDock').classList.remove('hide');
    document.getElementById('myHand').innerHTML =
      ['A♠','K♣','10♥'].map(c=>
        '<div class="card pullCard"><span class="cardFace">'+c+'</span></div>').join('');
    document.getElementById('seats').innerHTML =
      Array.from({length:8},(_,n)=>
        '<div class="seat s'+n+' p'+n+(n===0?' mine':'')+
        '" data-user-id="person'+n+'">'+
        '<span class="seatAvatar">♠</span><div class="seatBody">'+
        '<span class="seatName">Гравець '+n+'</span>'+
        '<span class="seatStack">◉ 317</span></div></div>').join('');
    window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
    window.TRYNKA_ARRANGE_ACTIONS_V107?.();
    window.TRYNKA_ARRANGE_BOTTOM_HAND_V108?.();
  });
});

const area= async locator => {
  const r=await locator.boundingBox();
  expect(r).not.toBeNull();
  return r;
};
const intersect=(a,b,p=0)=>a.x+a.width>b.x+p&&b.x+b.width>a.x+p&&a.y+a.height>b.y+p&&b.y+b.height>a.y+p;

for(const [width,height] of [[360,800],[393,873],[430,932]]){
  test('portrait mockup table and controls '+width+'px',async ({page})=>{
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();window.TRYNKA_ARRANGE_BOTTOM_HAND_V108?.();});
    const overlay=await page.locator('#trynkaRotateNotice').evaluate(el=>getComputedStyle(el).display);
    expect(overlay,'players should never be forced to rotate').toBe('none');
    const table=await area(page.locator('#game .table'));
    const bank=await area(page.locator('#game .centerInfo'));
    const dock=await area(page.locator('#game #cardDock'));
    const seat=await area(page.locator('#game #seats .seat.p0'));
    const actions=await area(page.locator('#game #gameActions'));
    const title=await area(page.locator('#game .gameTop'));
    expect(table.width).toBeLessThan(width-10);
    expect(table.height).toBeGreaterThan(440);
    expect(table.height).toBeLessThanOrEqual(500);
    // The updated premium rail is deliberately flatter, not a vertical egg.
    expect(table.height).toBeGreaterThan(table.width*1.18);
    expect(bank.y).toBeGreaterThan(table.y+45);
    expect(dock.y).toBeGreaterThan(actions.y+actions.height);
    expect(await page.locator('#cardDock').evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
    expect(dock.y).toBeGreaterThan(seat.y+seat.height);
    expect(actions.y).toBeGreaterThan(seat.y+seat.height);
    expect(actions.y).toBeGreaterThanOrEqual(table.y+table.height+4);
    expect(await page.locator('#gameActions').evaluate(el=>el.parentElement.classList.contains('tableWrap'))).toBe(true);
    expect(title.y+title.height).toBeLessThan(table.y);
    expect(intersect(dock,bank)).toBe(false);
    expect(intersect(dock,seat)).toBe(false);
    expect(intersect(actions,seat)).toBe(false);
    expect(await page.locator('#game .table').evaluate(el=>getComputedStyle(el).borderRadius))
      .not.toBe('0px');
    const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,screen:innerWidth}));
    expect(size.doc).toBeLessThanOrEqual(size.screen+2);
  });
}

for(const [width,height] of [[900,450],[1024,600]]){
 test('landscape casino table is centered, not stretched '+width,async ({page})=>{
   await page.setViewportSize({width,height});
   await page.evaluate(()=>window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.());
   const table=await area(page.locator('#game .table'));
   const wrapper=await area(page.locator('#game .tableWrap'));
   const heading=await area(page.locator('#game .gameTop'));
   expect(table.width).toBeLessThanOrEqual(wrapper.width);
   expect(table.x).toBeGreaterThanOrEqual(wrapper.x);
   expect(table.x+table.width).toBeLessThanOrEqual(wrapper.x+wrapper.width+2);
   expect(heading.y+heading.height).toBeLessThan(table.y);
   expect(await page.locator('#trynkaRotateNotice').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 });
}

test('showdown cards remain owned by their real seat (no fake cards or players)',async ({page})=>{
 const count=await page.locator('#game #seats .seat').count();
 expect(count).toBe(8);
 expect(await page.locator('#game .seatBacks').count()).toBe(0);
 expect(await page.locator('#game .seatShowdownCards').count()).toBe(0);
});
