import { test, expect } from '@playwright/test';

/*
 * Loads the REAL HTML/CSS and the REAL authorized-card renderer. All other
 * app JS is mocked out. No authentication, database, or game-state writes.
 */
test.beforeEach(async ({ page }) => {
  await page.route(/\.js(?:\?|$)/, route => {
    if (new URL(route.request().url()).pathname.endsWith('/revealed-hands-v99.js')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => {
    for (const section of document.querySelectorAll('main > section')) section.classList.add('hide');
    document.getElementById('game').classList.remove('hide');
    document.getElementById('cardDock').classList.remove('hide');
    document.getElementById('gameActions').classList.remove('hide');
    const seats = document.getElementById('seats');
    seats.innerHTML = Array.from({ length: 8 }, (_, slot) =>
      '<div class="seat s' + slot + ' p' + slot + '" data-seat-no="' + slot +
      '" data-user-id="player-' + slot + '"><div class="seatAvatar">♠</div>' +
      '<div class="seatBody"><div class="seatName">Гравець ' + slot + '</div>' +
      '<div class="seatStack">СТІЛ: 339</div><div class="betBadge">ДАВ <b>20</b> ◉</div>' +
      '</div></div>'
    ).join('');
  });
});

function overlaps(a, b, gap = 0) {
  return a.x + a.width > b.x + gap && b.x + b.width > a.x + gap
    && a.y + a.height > b.y + gap && b.y + b.height > a.y + gap;
}
const revealed = slot => ({
  user_id: 'player-' + slot,
  cards: slot % 2
    ? ['10♠', 'K♣', '6♥']
    : ['A♦', 'K♦', '8♦'],
});

test('revealed hands belong to exactly the two real players and clear next deal', async ({ page }) => {
  const state = await page.evaluate(async () => {
    const { paintRevealedHands } = await import('/revealed-hands-v99.js');
    const pair = [
      { user_id: 'player-0', cards: ['A♦', 'K♦', '8♦'] },
      { user_id: 'player-4', cards: ['10♠', 'K♣', '6♥'] },
    ];
    const count = paintRevealedHands(pair);
    const first = document.querySelector('[data-user-id="player-0"] .seatShowdownCards');
    const secondPass = paintRevealedHands(pair);
    const keptSameNode = first === document.querySelector('[data-user-id="player-0"] .seatShowdownCards');
    const red = [...document.querySelectorAll('[data-user-id="player-0"] .seatShowdownCards b')].every(el => el.classList.contains('red'));
    const black = [...document.querySelectorAll('[data-user-id="player-4"] .seatShowdownCards b')].filter(el => el.classList.contains('black')).length;
    const dockHidden = getComputedStyle(document.getElementById('cardDock')).display === 'none';
    const labels = [...document.querySelectorAll('#seats .seatShowdownCards')].map(el => el.parentElement.dataset.userId);
    const nextDealCount = paintRevealedHands([]);
    return { count, secondPass, keptSameNode, red, black, dockHidden, labels, nextDealCount,
      restored: !document.getElementById('cardDock').classList.contains('revealMode'),
      overlays: document.querySelectorAll('#seats .seatShowdownCards').length };
  });
  expect(state).toEqual({
    count: 2, secondPass: 2, keptSameNode: true, red: true, black: 3,
    dockHidden: true, labels: ['player-0','player-4'],
    nextDealCount: 0, restored: true, overlays: 0,
  });
});

test('revealed cards stay beside each seat without covering the bank or controls', async ({ page }) => {
  for (const [left, right] of [[0, 4], [1, 2], [3, 5], [6, 7]]) {
    const count = await page.evaluate(async ([a,b]) => {
      const { paintRevealedHands } = await import('/revealed-hands-v99.js');
      const mk = n => ({ user_id:'player-' + n, cards:n % 2 ? ['10♠','K♣','6♥'] : ['A♦','K♦','8♦'] });
      return paintRevealedHands([mk(a),mk(b)]);
    }, [left, right]);
    expect(count).toBe(2);
    const table = await page.locator('#game .table').boundingBox();
    const bank = await page.locator('#game .centerInfo').boundingBox();
    const actions = await page.locator('#gameActions').boundingBox();
    const cards = await page.locator('#seats .seatShowdownCards').all();
    expect(cards).toHaveLength(2);
    const boxes = [];
    for (const cardsOfSeat of cards) {
      const rect = await cardsOfSeat.boundingBox();
      const seat = await cardsOfSeat.locator('xpath=..').boundingBox();
      expect(rect).not.toBeNull();
      expect(rect.x).toBeGreaterThanOrEqual(table.x - 2);
      expect(rect.x + rect.width).toBeLessThanOrEqual(table.x + table.width + 2);
      expect(rect.y).toBeGreaterThanOrEqual(table.y - 2);
      expect(rect.y + rect.height).toBeLessThanOrEqual(table.y + table.height + 2);
      expect(overlaps(rect, bank, 1)).toBe(false);
      expect(overlaps(rect, actions, 1)).toBe(false);
      // Must be in the immediate neighborhood of its player's badge.
      const dx = Math.max(0, Math.max(seat.x - rect.x - rect.width, rect.x - seat.x - seat.width));
      const dy = Math.max(0, Math.max(seat.y - rect.y - rect.height, rect.y - seat.y - seat.height));
      expect(Math.min(dx, dy)).toBeLessThanOrEqual(8);
      boxes.push(rect);
    }
    expect(overlaps(boxes[0],boxes[1],1)).toBe(false);
  }
});

test('seat re-render still reattaches authorized hands, no HTML injection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { paintRevealedHands } = await import('/revealed-hands-v99.js');
    paintRevealedHands([{ user_id:'player-0', cards:['6♣','7♣','8♣'] }]);
    const seat = document.querySelector('#seats .seat[data-user-id="player-0"]');
    seat.innerHTML = '<div class="seatName">Новий рендер</div>';
    paintRevealedHands([{ user_id:'player-0', cards:['<img onerror="bad()">','7♣','8♣'] }]);
    const tile = seat.querySelector('.seatShowdownCards b');
    return { count:seat.querySelectorAll('.seatShowdownCards').length,
      literal:tile?.textContent, injected:!!seat.querySelector('img') };
  });
  expect(result).toEqual({count:1,literal:'<img onerror="bad()">',injected:false});
});
