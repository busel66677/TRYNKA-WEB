import {test,expect} from '@playwright/test';

/* Real pointer-handler module, synthetic cards. No login, wallet or DB writes. */
test.beforeEach(async({page})=>{
  await page.route(/\.js(?:\?|$)/,route=>{
    if(new URL(route.request().url()).pathname.endsWith('/card-pull-v109.js'))
      return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('/index.html',{waitUntil:'load'});
  await page.evaluate(()=>{
    document.body.insertAdjacentHTML('beforeend',`
      <div id="pullTestHand">
        <div class="card pullCard" style="height:90px" data-card-index="0">
          <span class="cardFace">A♠</span><div class="cardCover"></div>
        </div>
        <div class="card pullCard" style="height:90px" data-card-index="1">
          <span class="cardFace">10♠</span><div class="cardCover"></div>
        </div>
      </div>`);
  });
});

test('single touch pointer path survives duplicate legacy touch events',async({page})=>{
 const result=await page.evaluate(async()=>{
   const {bindPullCards}=await import('/card-pull-v109.js');
   const root=document.getElementById('pullTestHand');
   const offsets=[0,0,0],cleanup=bindPullCards(root,offsets);
   const card=root.querySelector('.pullCard');
   const ptr=(type,y)=>card.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:44,pointerType:'touch',clientY:y}));
   ptr('pointerdown',100);
   ptr('pointermove',120);
   // WebKit/old handlers used to restart a gesture on the touchstart too.
   card.dispatchEvent(new Event('touchstart',{bubbles:true,cancelable:true}));
   ptr('pointermove',132);
   ptr('pointerup',132);
   const offset=offsets[0],transform=card.querySelector('.cardCover').style.transform;
   cleanup();
   return {offset,transform,pulling:card.classList.contains('pulling')};
 });
 expect(result.offset).toBe(32);
 expect(result.transform).toContain('32px');
 expect(result.pulling).toBe(false);
});

test('old cards release listeners when a new deal replaces the hand',async({page})=>{
 const result=await page.evaluate(async()=>{
   const {bindPullCards}=await import('/card-pull-v109.js');
   const root=document.getElementById('pullTestHand');
   const previous=[0,0,0],cleanup=bindPullCards(root,previous);
   const old=root.querySelector('.pullCard');
   cleanup();
   old.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:46,clientY:10,bubbles:true}));
   old.dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',pointerId:46,clientY:55,bubbles:true}));
   old.click(); // should no longer toggle a removed or detached hand
   root.replaceChildren();
   root.innerHTML='<div class="card pullCard" style="height:90px" data-card-index="0"><span class="cardFace">K♦</span><div class="cardCover"></div></div>';
   const next=[0,0,0],cleanupNext=bindPullCards(root,next);
   root.querySelector('.pullCard').click();
   const output={oldOffset:previous[0],oldCover:old.querySelector('.cardCover').style.transform,
      newOffset:next[0],newCards:root.querySelectorAll('.pullCard').length};
   cleanupNext();
   return output;
 });
 expect(result.oldOffset).toBe(0);
 expect(result.oldCover).toContain('0px');
 expect(result.newOffset).toBeGreaterThan(40);
 expect(result.newCards).toBe(1);
});

test('pull offset stays within card bounds and is limited per-card',async({page})=>{
 const result=await page.evaluate(async()=>{
   const {bindPullCards}=await import('/card-pull-v109.js');
   const root=document.getElementById('pullTestHand');
   const offsets=[0,0,0],cleanup=bindPullCards(root,offsets);
   const card=root.querySelectorAll('.pullCard')[1];
   const fire=(type,y)=>card.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:6,pointerType:'touch',clientY:y}));
   fire('pointerdown',100);fire('pointermove',999);fire('pointerup',999);
   let hi=offsets[1],other=offsets[0];
   fire('pointerdown',999);fire('pointermove',-200);fire('pointerup',-200);
   let lo=offsets[1];
   cleanup();
   return {hi,lo,other,max:card.clientHeight-13};
 });
 expect(result.hi).toBe(result.max);
 expect(result.lo).toBe(0);
 expect(result.other).toBe(0);
});
