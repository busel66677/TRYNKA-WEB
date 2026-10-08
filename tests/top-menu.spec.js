import { test, expect } from '@playwright/test';

// Real HTML, CSS, and premium menu controller. App/backend modules are stubbed
// so the test never logs in or changes real balances or active games.
test.beforeEach(async ({ page }) => {
  await page.route(/\.js(?:\?|$)/, route => {
    if(new URL(route.request().url()).pathname.endsWith('/premium-ui-v78.js'))
      return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('/index.html', {waitUntil:'load'});
  await page.evaluate(() => {
    const game=document.getElementById('game');
    for(const section of document.querySelectorAll('main > section'))section.classList.add('hide');
    game.classList.remove('hide');
    const host=game.querySelector('.gameTopActions');
    host.insertAdjacentHTML('afterend',
      '<div id="tableExtras" class="tableExtras">'+
      '<button id="ownerTableBtn">⚙ Керування</button>'+
      '<button id="spectateBtn">👁 Спостерігати</button>'+
      '<div class="reactions"><button id="reactionBtn">👍</button></div></div>'
    );
    for(const id of ['ownerTableBtn','spectateBtn','reactionBtn']){
      document.getElementById(id).addEventListener('click',()=>{
        document.getElementById(id).dataset.clicked='yes';
      });
    }
    document.dispatchEvent(new CustomEvent('trynka:game-state',{
      detail:{room:{id:1},round:null,round_players:[],players:[]},
    }));
  });
  await expect(page.locator('#premiumMoreBtn')).toBeVisible();
});

for(const dims of [
  {name:'landscape phone',width:900,height:450},
  {name:'wide phone landscape',width:1024,height:600},
  {name:'desktop landscape',width:1536,height:768},
  {name:'portrait phone',width:393,height:873},
]){
  test('top dropdown and owner/spectator actions clickable — '+dims.name,async ({page})=>{
    await page.setViewportSize({width:dims.width,height:dims.height});
    const more=page.locator('#premiumMoreBtn');
    const menu=page.locator('#premiumGameMenu');
    const buttonHit=await more.evaluate(el=>{
      const r=el.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return hit===el||el.contains(hit);
    });
    expect(buttonHit,'Three-dot menu must receive clicks instead of felt').toBe(true);
    await more.click({timeout:5000});
    await expect(menu).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded','true');
    for(const id of ['ownerTableBtn','spectateBtn','reactionBtn']){
      const b=page.locator('#'+id);
      await expect(b).toBeVisible();
      const canHit=await b.evaluate(el=>{
        el.scrollIntoView({block:'nearest'});
        const r=el.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return hit===el||el.contains(hit);
      });
      expect(canHit,id+' must not be covered by the felt').toBe(true);
      await b.click({timeout:5000});
      await expect(b).toHaveAttribute('data-clicked','yes');
    }
    await more.click({timeout:5000});
    await expect(menu).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded','false');
  });
}

test('existing game menu actions stay available, table remains in place',async ({page})=>{
  const m=page.locator('#premiumMoreBtn');
  await m.click();
  const menu=page.locator('#premiumGameMenu');
  await expect(menu.locator('#inviteBtn')).toBeVisible();
  await expect(menu.locator('#ownerTableBtn')).toBeVisible();
  await expect(menu.locator('#spectateBtn')).toBeVisible();
  await expect(page.locator('#game .table')).toBeVisible();
  expect(await page.locator('#tableExtras').evaluate(el=>el.parentElement.id))
    .toBe('premiumGameMenu');
});
