import { test, expect } from '@playwright/test';

/*
 * Deterministic layout fixture on the REAL index.html and REAL CSS files.
 * We deliberately block all app JS: no authentication, no live Supabase writes,
 * no side effects for active players. These tests assert presentation only.
 * Two-player gameplay/integration tests need separate staging accounts/DB.
 */
test.beforeEach(async ({ page }) => {
  await page.route(/\.js(?:\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: '',
  }));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => {
    const game = document.getElementById('game');
    for (const section of document.querySelectorAll('main > section')) section.classList.add('hide');
    game.classList.remove('hide');

    document.getElementById('roomTitle').textContent = 'Мій стіл';
    document.getElementById('potBig').textContent = 'БАНК: 40 ◉';
    document.getElementById('countdown').textContent = 'Гра почалась';
    document.getElementById('gameBalance').textContent = '◉ 339';

    const dock = document.getElementById('cardDock');
    dock.classList.remove('hide');
    const hand = document.getElementById('myHand');
    hand.className = 'hand cardDockHand handSeat0';
    hand.innerHTML = [
      '<div class="card pullCard black"><span class="cardFace">10♣</span></div>',
      '<div class="card pullCard black"><span class="cardFace">K♣</span></div>',
      '<div class="card pullCard"><span class="cardFace">6♥</span></div>',
    ].join('');

    document.getElementById('seats').innerHTML = [
      '<div class="seat free p0"><div class="seatName">Сісти</div></div>',
      '<div class="seat free p1"><div class="seatName">Сісти</div></div>',
      '<div class="seat free p7"><div class="seatName">Сісти</div></div>',
    ].join('');

    const actions = document.getElementById('gameActions');
    actions.classList.remove('hide');
    const topActions = document.querySelector('#game .gameTopActions');
    const stand = document.createElement('button');
    stand.id = 'standUpBtn';
    stand.className = 'standUpBtn';
    stand.textContent = '↑ Встати зі столу';
    topActions.prepend(stand);

    const more = document.createElement('button');
    more.id = 'premiumMoreBtn';
    more.className = 'premiumMoreBtn';
    more.textContent = '⋮';
    topActions.append(more);

    const menu = document.createElement('div');
    menu.id = 'premiumGameMenu';
    menu.className = 'premiumGameMenu hide';
    menu.innerHTML = '<button type="button">👥 Запросити друга</button>' +
      '<button type="button">🤖 BOT за столом</button>' +
      '<button type="button">Діагностика</button>';
    document.querySelector('#game .gameTop').append(menu);
    more.addEventListener('click', () => menu.classList.toggle('hide'));
  });
});

function overlaps(a, b, pad = 1) {
  if (!a || !b) return false;
  return a.x + a.width > b.x + pad && b.x + b.width > a.x + pad
    && a.y + a.height > b.y + pad && b.y + b.height > a.y + pad;
}

test('cards remain wholly inside their dedicated dock, not over the toolbar', async ({ page }, testInfo) => {
  const dock = await page.locator('#cardDock').boundingBox();
  const title = await page.locator('#roomTitle').boundingBox();
  const stand = await page.locator('#standUpBtn').boundingBox();
  const wallet = await page.locator('#gameBalance').boundingBox();
  const cards = await page.locator('#cardDock #myHand .card').all();
  expect(cards).toHaveLength(3);
  expect(dock).not.toBeNull();
  for (const card of cards) {
    const rect = await card.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect.x).toBeGreaterThanOrEqual(dock.x - 2);
    expect(rect.x + rect.width).toBeLessThanOrEqual(dock.x + dock.width + 2);
    expect(rect.y).toBeGreaterThanOrEqual(dock.y - 2);
    expect(rect.y + rect.height).toBeLessThanOrEqual(dock.y + dock.height + 2);
  }

  if (testInfo.project.name.startsWith('android')) {
    expect(overlaps(dock, title)).toBe(false);
    expect(overlaps(dock, stand)).toBe(false);
    expect(overlaps(dock, wallet)).toBe(false);
    expect(overlaps(stand, wallet)).toBe(false);
  }
});

test('mobile header is compact and the game does not overflow horizontally', async ({ page }, testInfo) => {
  if (!testInfo.project.name.startsWith('android')) return;
  expect(await page.locator('body > header').evaluate(el => getComputedStyle(el).display)).toBe('none');
  const size = await page.evaluate(() => ({
    screen: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(size.document).toBeLessThanOrEqual(size.screen + 2);
  const table = await page.locator('#game .table').boundingBox();
  expect(table.x).toBeGreaterThanOrEqual(0);
  expect(table.x + table.width).toBeLessThanOrEqual(size.screen + 2);
});

test('opening the three-dot menu pushes the table down instead of covering it', async ({ page }, testInfo) => {
  await page.locator('#premiumMoreBtn').click();
  await expect(page.locator('#premiumGameMenu')).toBeVisible();
  if (!testInfo.project.name.startsWith('android')) return;
  const menu = await page.locator('#premiumGameMenu').boundingBox();
  const table = await page.locator('#game .table').boundingBox();
  expect(menu.y + menu.height).toBeLessThanOrEqual(table.y + 2);
});

test('action buttons stay inside the table and have readable labels', async ({ page }, testInfo) => {
  const table = await page.locator('#game .table').boundingBox();
  const buttons = await page.locator('#gameActions .actionButtons button').all();
  expect(buttons.length).toBeGreaterThanOrEqual(4);
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(table.x - 2);
    expect(box.x + box.width).toBeLessThanOrEqual(table.x + table.width + 2);
    if (testInfo.project.name.startsWith('android')) {
      const fontSize = await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(9);
    }
  }
});
