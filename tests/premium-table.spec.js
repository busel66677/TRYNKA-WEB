import { test, expect } from '@playwright/test';

/* The live CSS and the real v100 DOM mover, but no backend or gameplay JS. */
test.beforeEach(async ({ page }) => {
  await page.route(/\.js(?:\?|$)/, route => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/premium-table-v100.js')) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    });
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => {
    const game = document.getElementById('game');
    for (const section of document.querySelectorAll('main > section')) section.classList.add('hide');
    game.classList.remove('hide');
    const dock = document.getElementById('cardDock');
    dock.classList.remove('hide');
    const hand = document.getElementById('myHand');
    hand.className = 'hand cardDockHand handSeat0';
    hand.innerHTML = ['A♠', '10♣', '6♥'].map((c, i) =>
      '<div class="card pullCard' + (i === 2 ? ' red' : ' black') + '">' +
      '<span class="cardFace">' + c + '</span></div>'
    ).join('');
    const seats = document.getElementById('seats');
    seats.innerHTML = Array.from({ length: 8 }, (_, slot) =>
      '<div class="seat s' + slot + ' p' + slot +
      (slot === 0 ? ' mine' : '') +
      '" data-user-id="player-' + slot +
      '"><div class="seatAvatar">♠</div><div class="seatBody">' +
      '<div class="seatName">Гравець ' + slot + '</div>' +
      '<div class="seatStack">СТІЛ: ◉ 999</div></div></div>'
    ).join('');
    document.getElementById('gameActions').classList.remove('hide');
  });
});

function intersects(a,b,p=0) {
  if(!a || !b) return false;
  return a.x+a.width>b.x+p && b.x+b.width>a.x+p &&
    a.y+a.height>b.y+p && b.y+b.height>a.y+p;
}

test('table is emerald felt with brass trim and premium seat styling', async ({ page }) => {
  const theme = await page.evaluate(() => {
    const table = getComputedStyle(document.querySelector('#game .table'));
    const seat = getComputedStyle(document.querySelector('#game .seat.mine'));
    const buttons = [...document.querySelectorAll('#game .actionButtons button')];
    return {
      tableBackground:table.backgroundImage,
      tableBorder:table.borderTopColor,
      tableBorderWidth:parseFloat(table.borderTopWidth),
      tableShadow:table.boxShadow,
      seatBackground:seat.backgroundImage,
      seatBorderWidth:parseFloat(seat.borderTopWidth),
      buttons:buttons.map(b => ({
        action:b.dataset.action, bg:getComputedStyle(b).backgroundImage,
        minHeight:parseFloat(getComputedStyle(b).minHeight)
      })),
    };
  });
  expect(theme.tableBackground).toContain('radial-gradient');
  expect(theme.tableBorderWidth).toBeGreaterThanOrEqual(7);
  expect(theme.tableShadow).toContain('rgb');
  expect(theme.seatBackground).toContain('linear-gradient');
  expect(theme.seatBorderWidth).toBeGreaterThanOrEqual(1);
  expect(theme.buttons).toHaveLength(4);
  for (const button of theme.buttons) {
    expect(button.bg).toContain('linear-gradient');
    expect(button.minHeight).toBeGreaterThanOrEqual(40);
  }
});

test('mobile hand sits by bottom seat, not above the table or over bank and actions', async ({ page }, testInfo) => {
  const dock = page.locator('#cardDock');
  if (testInfo.project.name.startsWith('android')) {
    await expect(dock).toHaveJSProperty('parentElement', await page.locator('#game .table').elementHandle());
    const d = await dock.boundingBox();
    const table = await page.locator('#game .table').boundingBox();
    const bank = await page.locator('#game .centerInfo').boundingBox();
    const seat = await page.locator('#game .seat.p0').boundingBox();
    const actions = await page.locator('#gameActions').boundingBox();
    expect(d).not.toBeNull();
    expect(d.x).toBeGreaterThanOrEqual(table.x);
    expect(d.x + d.width).toBeLessThanOrEqual(table.x + table.width);
    expect(d.y).toBeGreaterThanOrEqual(table.y);
    expect(d.y + d.height).toBeLessThanOrEqual(table.y + table.height);
    expect(d.y).toBeGreaterThan(bank.y);
    expect(d.y).toBeLessThan(seat.y);
    expect(intersects(d,bank,2)).toBe(false);
    expect(intersects(d,seat,2)).toBe(false);
    expect(intersects(d,actions,2)).toBe(false);
    const horizontal = await page.evaluate(() => ({
      width:document.documentElement.scrollWidth, viewport:innerWidth,
    }));
    expect(horizontal.width).toBeLessThanOrEqual(horizontal.viewport+2);
  } else {
    expect(await dock.evaluate(x=>x.parentElement.classList.contains('gameTop'))).toBe(true);
  }
});

test('real DOM mover preserves exact hand DOM and supports phone-desktop resize', async ({ page }) => {
  const first = await page.evaluate(() => {
    const hand=document.getElementById('myHand');
    hand.dataset.testIdentity='same-instance';
    return { parent:document.getElementById('cardDock').parentElement.className,
      cards:hand.querySelectorAll('.card').length };
  });
  expect(first.cards).toBe(3);
  await page.setViewportSize({ width: 900, height: 800 });
  const desktop = await page.evaluate(() => {
    window.TRYNKA_ARRANGE_PREMIUM_TABLE();
    return {
      parent:document.getElementById('cardDock').parentElement.className,
      same:document.getElementById('myHand').dataset.testIdentity,
      cards:document.querySelectorAll('#myHand .card').length,
    };
  });
  expect(desktop.parent).toContain('gameTop');
  expect(desktop.same).toBe('same-instance');
  expect(desktop.cards).toBe(3);
  await page.setViewportSize({ width: 393, height: 873 });
  const mobile = await page.evaluate(() => {
    window.TRYNKA_ARRANGE_PREMIUM_TABLE();
    return {
      parent:document.getElementById('cardDock').parentElement.className,
      same:document.getElementById('myHand').dataset.testIdentity,
      cards:document.querySelectorAll('#myHand .card').length,
    };
  });
  expect(mobile.parent.split(' ')).toContain('table');
  expect(mobile.same).toBe('same-instance');
  expect(mobile.cards).toBe(3);
});
