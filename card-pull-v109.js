/* TRYNKA v109 — one drag input path, release old card listeners after every deal. */
export function bindPullCards(hand, offsets) {
  if (!hand || !Array.isArray(offsets)) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  const supportsPointer = typeof window.PointerEvent === 'function';

  for (const card of hand.querySelectorAll('.pullCard')) {
    const cover = card.querySelector('.cardCover');
    if (!cover) continue;
    const idx = Number(card.dataset.cardIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= offsets.length) continue;

    let dragging = false;
    let startY = 0;
    let startOffset = Number(offsets[idx] || 0);
    let moved = false;

    const apply = value => {
      const max = Math.max(0, card.clientHeight - 13);
      const y = Math.max(0, Math.min(max, Number(value) || 0));
      offsets[idx] = y;
      cover.style.transform = 'translate3d(0,' + y + 'px,0)';
      card.classList.toggle('peeked', y > 7);
      card.classList.toggle('mostlyOpen', y > max * .70);
    };
    const begin = y => {
      dragging = true;
      moved = false;
      startY = y;
      startOffset = Number(offsets[idx] || 0);
      card.classList.add('pulling');
    };
    const move = y => {
      if (!dragging) return;
      const dy = y - startY;
      if (Math.abs(dy) > 2) moved = true;
      apply(startOffset + dy);
    };
    const end = () => {
      dragging = false;
      card.classList.remove('pulling');
    };
    apply(startOffset);

    if (supportsPointer) {
      card.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        begin(e.clientY);
        try { card.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      }, { signal });
      card.addEventListener('pointermove', e => {
        if (!dragging) return;
        move(e.clientY);
        e.preventDefault();
      }, { signal });
      card.addEventListener('pointerup', e => {
        end();
        try { card.releasePointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      }, { signal });
      card.addEventListener('pointercancel', end, { signal });
      // Chrome/Android already emits PointerEvents. Registering touch and
      // mouse events as well re-started the same drag and caused jitter.
    } else {
      const mouseMove = e => move(e.clientY);
      const mouseUp = () => {
        end();
        window.removeEventListener('mousemove', mouseMove);
        window.removeEventListener('mouseup', mouseUp);
      };
      card.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        begin(e.clientY);
        window.addEventListener('mousemove', mouseMove, { signal });
        window.addEventListener('mouseup', mouseUp, { signal });
        e.preventDefault();
      }, { signal });
      card.addEventListener('touchstart', e => {
        if (!e.touches?.[0]) return;
        begin(e.touches[0].clientY);
        e.preventDefault();
      }, { signal, passive: false });
      card.addEventListener('touchmove', e => {
        if (!dragging || !e.touches?.[0]) return;
        move(e.touches[0].clientY);
        e.preventDefault();
      }, { signal, passive: false });
      card.addEventListener('touchend', end, { signal });
      card.addEventListener('touchcancel', end, { signal });
    }

    card.addEventListener('click', () => {
      if (moved) return;
      const max = Math.max(0, card.clientHeight - 13);
      apply(Number(offsets[idx] || 0) > max * .55 ? 0 : max * .78);
    }, { signal });
    card.addEventListener('dragstart', e => e.preventDefault(), { signal });
  }

  // Aborts handlers attached to live or detached cards AND the temporary
  // window mouse handlers used in legacy browsers.
  return () => controller.abort();
}
