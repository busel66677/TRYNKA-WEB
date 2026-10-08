import {test,expect} from '@playwright/test';

/* Screenshot-like test: 1 human + BOT, face-down bot backs, real DOM nodes
   for owned cards and betting controls. App/backend JS is intercepted; no
   player balances, turn state or Supabase data can be changed. */
test.beforeEach(async ({page})=>{
  await page.route(/\.js(?:\?|$)/,route=>{
    const path=new URL(route.request().url()).pathname;
    if(['premium-table-v100.js','landscape-table-v104.js','mobile-clean-v107.js','bottom-cards-v108.js'].some(n=>path.endsWith('/'+n)))
      return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
});

async function tableFixture(page,width,height){
  await page.setViewportSize({width,height});
  await page.goto('/index.html',{waitUntil:'load'});
  await page.evaluate(()=>{
    for(const section of document.querySelectorAll('main>section')) section.classList.add('hide');
    document.getElementById('game').classList.remove('hide');
    const seatHost=document.getElementById('seats');
    seatHost.innerHTML=Array.from({length:8},(_,i)=>{
      if(i===0||i===1){
        return '<div class="seat p'+i+' s'+i+(i===0?' mine turnActive':'')+
          '" data-user-id="'+(i===0?'human':'bot')+'">'+
          '<div class="seatAvatar">♠</div><div class="seatBody">'+
          '<div class="seatName">'+(i===0?'Адмін':'BOT')+'</div>'+
          '<div class="seatStack">СТІЛ: ◉ '+(i===0?307:9980)+'</div>'+
          '<div class="betBadge">● ДАВ 20</div></div>'+
          (i===1?'<div class="seatBacks"><i></i><i></i><i></i></div>':'')+
          '</div>';
      }
      return '<div class="seat free p'+i+' s'+i+'"><div class="seatFreePlus">＋</div></div>';
    }).join('');
    const dock=document.getElementById('cardDock');
    dock.classList.remove('hide');
    document.getElementById('myHand').innerHTML=['A♠','K♣','6♥'].map(card=>
      '<div class="card pullCard"><span class="cardFace">'+card+'</span></div>').join('');
    document.getElementById('gameActions').classList.remove('hide');
    document.getElementById('potBig').textContent='БАНК: 30 ◉';
    document.getElementById('bankInfo').textContent='Ставка: 10 ◉ · Макс: 1000 ◉';
    document.getElementById('countdown').textContent='Гра почалась';
    document.getElementById('roundTurn').textContent='ВАШ ХІД · 25с';
    window.TRYNKA_ARRANGE_LANDSCAPE_TABLE?.();
    window.TRYNKA_ARRANGE_ACTIONS_V107?.();
    window.TRYNKA_ARRANGE_BOTTOM_HAND_V108?.();
  });
}
async function rect(locator){
 const box=await locator.boundingBox();
 expect(box).not.toBeNull();
 return box;
}
const crosses=(a,b,margin=1)=>a.x+a.width>b.x+margin&&b.x+b.width>a.x+margin&&a.y+a.height>b.y+margin&&b.y+b.height>a.y+margin;

for(const width of [360,393,430]){
  test('Screenshot-like BOT game has no overlapping bank/cards/actions at '+width,async({page})=>{
    await tableFixture(page,width,873);
    const g=page.locator('#game');
    const table=await rect(g.locator('.table'));
    const actions=await rect(g.locator('#gameActions'));
    const bank=await rect(g.locator('.centerInfo'));
    const dock=await rect(g.locator('#cardDock'));
    const mine=await rect(g.locator('#seats .seat.p0'));
    const bot=await rect(g.locator('#seats .seat.p1'));
    const backs=await rect(g.locator('#seats .seat.p1 .seatBacks'));
    expect(table.height).toBeGreaterThanOrEqual(440);
    expect(table.height).toBeLessThanOrEqual(500);
    expect(actions.y).toBeGreaterThanOrEqual(table.y+table.height+4);
    expect(bank.height).toBeLessThanOrEqual(122);
    expect(crosses(bank,dock)).toBe(false);
    expect(crosses(bank,mine)).toBe(false);
    expect(crosses(bank,bot)).toBe(false);
    expect(crosses(dock,mine)).toBe(false);
    expect(dock.y).toBeGreaterThanOrEqual(actions.y+actions.height);
    expect(await page.locator('#cardDock').evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
    expect(crosses(dock,backs)).toBe(false);
    expect(crosses(actions,table)).toBe(false);
    expect(await g.locator('#gameActions').evaluate(el=>el.parentElement.classList.contains('tableWrap'))).toBe(true);
    expect(await g.locator('#cardDock').evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
    const viewport=await page.evaluate(()=>({screen:innerWidth,scroll:document.documentElement.scrollWidth}));
    expect(viewport.scroll).toBeLessThanOrEqual(viewport.screen+2);
    for(const c of await g.locator('#cardDock .card').all()){
      const b=await rect(c);
      expect(b.x).toBeGreaterThanOrEqual(dock.x-2);
      expect(b.x+b.width).toBeLessThanOrEqual(dock.x+dock.width+2);
      expect(b.height).toBeGreaterThanOrEqual(100);
    expect(b.width).toBeGreaterThanOrEqual(70);
    expect(b.y).toBeGreaterThanOrEqual(dock.y-5);
      expect(b.y+b.height).toBeLessThanOrEqual(dock.y+dock.height+8);
    }
    const controls=await g.locator('#gameActions .actionButtons button').all();
    expect(controls).toHaveLength(4);
    for(const control of controls){
      await control.scrollIntoViewIfNeeded();
      const b=await rect(control);
      expect(b.x).toBeGreaterThanOrEqual(actions.x-2);
      expect(b.x+b.width).toBeLessThanOrEqual(actions.x+actions.width+2);
      const hit=await control.evaluate(el=>{
        const b=el.getBoundingClientRect();
        const target=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
        return target===el||el.contains(target);
      });
      expect(hit,'the actual bet button must receive touch taps').toBe(true);
    }
    // Preserve a screenshot on failures, and on successful runs when manually inspecting.
    await page.screenshot({path:'test-results/screenshot-bot-'+width+'.png',fullPage:true});
  });
}

test('DOM move preserves direct button handler and restores landscape',async({page})=>{
 await tableFixture(page,393,873);
 const call=page.locator('#gameActions [data-action="call"]');
 await call.evaluate(button=>{
   button.dataset.record='untouched';
   button.addEventListener('click',()=>button.dataset.record='clicked');
 });
 await call.click();
 await expect(call).toHaveAttribute('data-record','clicked');
 await page.setViewportSize({width:900,height:450});
 await page.evaluate(()=>{window.TRYNKA_ARRANGE_ACTIONS_V107();window.TRYNKA_ARRANGE_BOTTOM_HAND_V108();});
 expect(await page.locator('#gameActions').evaluate(el=>el.parentElement.classList.contains('table'))).toBe(true);
 await page.setViewportSize({width:393,height:873});
 await page.evaluate(()=>window.TRYNKA_ARRANGE_ACTIONS_V107());
 expect(await page.locator('#gameActions').evaluate(el=>el.parentElement.classList.contains('tableWrap'))).toBe(true);
 expect(await page.locator('#cardDock').evaluate(el=>el.parentElement.id)).toBe('playerHandTray');
 await expect(call).toHaveAttribute('data-record','clicked');
 expect(await page.locator('#gameActions .actionButtons button').count()).toBe(4);
});
