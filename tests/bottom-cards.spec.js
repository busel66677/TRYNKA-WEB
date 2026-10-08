import { test, expect } from '@playwright/test';

// Uses real responsive DOM movers, HTML and CSS. All auth/game/network
// modules are isolated: this test never touches real rooms or balances.
test.beforeEach(async ({page})=>{
  await page.route(/\.js(?:\?|$)/,route=>{
    const path=new URL(route.request().url()).pathname;
    if(['premium-table-v100.js','landscape-table-v104.js','mobile-clean-v107.js','bottom-cards-v108.js'].some(n=>path.endsWith('/'+n)))
      return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
});
async function setup(page,width=393,height=873){
  await page.setViewportSize({width,height});
  await page.goto('/index.html',{waitUntil:'load'});
  await page.evaluate(()=>{
    for(const section of document.querySelectorAll('main>section'))section.classList.add('hide');
    document.getElementById('game').classList.remove('hide');
    document.getElementById('gameActions').classList.remove('hide');
    const dock=document.getElementById('cardDock');
    dock.classList.remove('hide');
    document.getElementById('myHand').innerHTML=['A♠','K♣','6♥'].map((c,i)=>
      '<div class="card pullCard" data-card-index="'+i+'"><span class="cardFace">'+c+
      '</span><div class="cardCover"><i>♠</i><small>ПОТЯГНИ КАРТУ</small></div></div>').join('');
    window.TRYNKA_ARRANGE_ACTIONS_V107?.();
    window.TRYNKA_ARRANGE_BOTTOM_HAND_V108?.();
  });
}
const overlaps=(a,b)=>a.x+a.width>b.x+1&&b.x+b.width>a.x+1&&a.y+a.height>b.y+1&&b.y+b.height>a.y+1;
for(const width of [360,393,430]){
  test('all three large draggable cards sit BELOW controls on '+width+'px',async({page})=>{
    await setup(page,width,873);
    const tray=page.locator('#playerHandTray');
    const dock=page.locator('#cardDock');
    const hand=page.locator('#myHand');
    const actions=page.locator('#gameActions');
    await expect(tray).toBeVisible();
    await expect(dock).toBeVisible();
    await expect(tray.locator('#cardDock #myHand .pullCard')).toHaveCount(3);
    expect(await dock.evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
    const tb=await tray.boundingBox();
    const ab=await actions.boundingBox();
    const table=await page.locator('#game .table').boundingBox();
    expect(tb.y).toBeGreaterThanOrEqual(ab.y+ab.height);
    expect(tb.y).toBeGreaterThan(table.y+table.height);
    expect(overlaps(tb,ab)).toBe(false);
    const cards=await hand.locator('.pullCard').all();
    const rectangles=[];
    for(const card of cards){
      const b=await card.boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(70);
      expect(b.height).toBeGreaterThanOrEqual(100);
      const cover=card.locator('.cardCover');
      expect(await cover.evaluate(el=>getComputedStyle(el).touchAction)).toBe('none');
      const centre={x:b.x+b.width/2,y:b.y+b.height/2};
      const hit=await card.evaluate(el=>{
        const r=el.getBoundingClientRect();
        const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return target===el || el.contains(target);
      });
      expect(hit,'whole card is touchable').toBe(true);
      rectangles.push(b);
    }
    expect(overlaps(rectangles[0],rectangles[1])).toBe(false);
    expect(overlaps(rectangles[1],rectangles[2])).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}

test('original interactive card elements survive rotation and gameplay DOM events',async({page})=>{
  await setup(page);
  const first=page.locator('#myHand .pullCard').first();
  await first.evaluate(el=>{
    el.dataset.identity='original-card';
    el.addEventListener('pointerdown',()=>el.dataset.dragStarted='yes');
    el.addEventListener('pointermove',()=>el.dataset.dragMoved='yes');
  });
  const cover=first.locator('.cardCover');
  const b=await cover.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2+25,{steps:3});
  await page.mouse.up();
  await expect(first).toHaveAttribute('data-drag-started','yes');
  await expect(first).toHaveAttribute('data-drag-moved','yes');

  await page.setViewportSize({width:900,height:450});
  await page.evaluate(()=>{
    window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
    window.TRYNKA_ARRANGE_ACTIONS_V107?.();
    window.TRYNKA_ARRANGE_BOTTOM_HAND_V108();
  });
  expect(await page.locator('#cardDock').evaluate(el=>el.parentElement.classList.contains('table'))).toBe(true);
  await page.setViewportSize({width:393,height:873});
  await page.evaluate(()=>{
    window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
    window.TRYNKA_ARRANGE_ACTIONS_V107?.();
    window.TRYNKA_ARRANGE_BOTTOM_HAND_V108();
    document.dispatchEvent(new CustomEvent('trynka:game-state'));
  });
  expect(await page.locator('#cardDock').evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
  await expect(first).toHaveAttribute('data-identity','original-card');
  await expect(page.locator('#myHand .pullCard')).toHaveCount(3);
  await page.locator('#cardDock').evaluate(el=>el.classList.add('hide'));
  await expect(page.locator('#playerHandTray')).toBeHidden();
});
