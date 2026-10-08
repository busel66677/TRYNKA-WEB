/*
 * Place ONLY already-authorized revealed cards beside the real seat that owns
 * them. Caller supplies the protected game snapshot; no public hand reads.
 * Safe to call repeatedly and after seats are rebuilt.
 */
export function paintRevealedHands(rows = []) {
  const seatsHost = document.querySelector('#game #seats');
  const table = document.querySelector('#game .table');
  const cardDock = document.getElementById('cardDock');
  const oldDock = document.getElementById('revealDock');

  // v95 put the reveal in the header; keep that legacy area empty and hidden.
  if (oldDock) {
    oldDock.replaceChildren();
    oldDock.classList.add('hide');
  }
  if (!seatsHost) {
    cardDock?.classList.remove('revealMode');
    table?.classList.remove('seatRevealActive');
    return 0;
  }

  const availableSeats = new Map(
    [...seatsHost.querySelectorAll('.seat[data-user-id]')]
      .map(seat => [seat.dataset.userId, seat])
  );
  const cardsByUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.user_id || !Array.isArray(row.cards) || !row.cards.length) continue;
    // Do not display partially dealt / invalid hands as a full reveal.
    if (row.cards.length !== 3 || row.cards.some(c => typeof c !== 'string')) continue;
    cardsByUser.set(String(row.user_id), row.cards);
  }

  // When the duel ends, remove ALL prior overlays, including remounted seats.
  for (const seat of seatsHost.querySelectorAll('.seat')) {
    const cards = cardsByUser.get(seat.dataset.userId);
    const signature = cards ? JSON.stringify(cards) : null;
    const old = seat.querySelector('.seatShowdownCards');
    if (!signature || !availableSeats.has(seat.dataset.userId)) {
      old?.remove();
      seat.classList.remove('showdownSeat');
      continue;
    }
    seat.classList.add('showdownSeat');
    // Leave unchanged cards in place; realtime updates should not blink.
    if (old && old.dataset.signature === signature) continue;
    old?.remove();
    const box = document.createElement('div');
    box.className = 'seatShowdownCards';
    box.dataset.signature = signature;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Відкриті карти гравця');
    for (const value of cards) {
      const tile = document.createElement('b');
      tile.className = /[♥♦]/.test(value) ? 'red' : 'black';
      tile.textContent = value; // Never interpret card strings as markup.
      box.appendChild(tile);
    }
    seat.appendChild(box);
  }

  const visible = seatsHost.querySelectorAll('.seatShowdownCards').length;
  table?.classList.toggle('seatRevealActive', visible > 0);
  cardDock?.classList.toggle('revealMode', visible > 0);
  return visible;
}
