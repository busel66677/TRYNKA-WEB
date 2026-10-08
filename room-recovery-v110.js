/* TRYNKA v110: deterministic, bounded Realtime room subscription recovery.
   Transport only — never performs joins, raises, deals or balance writes. */
export function createRoomRecovery({
  onRetry,
  isOnline = () => true,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  baseDelay = 750,
  maxDelay = 12000
} = {}) {
  if (typeof onRetry !== 'function') throw new TypeError('onRetry is required');
  let roomId = null;
  let generation = 0;
  let attempt = 0;
  let timer = null;
  let busy = false;

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function activate(id) {
    cancel();
    roomId = id == null ? null : Number(id);
    generation += 1;
    attempt = 0;
    return generation;
  }
  function active(id, token) {
    return roomId !== null && Number(id) === roomId && token === generation;
  }
  function schedule(token = generation, { immediate = false } = {}) {
    if (!active(roomId, token) || !isOnline() || busy) return false;
    if (timer !== null) {
      if (!immediate) return false;
      cancel();
    }
    const delay = immediate ? 0 : Math.min(maxDelay, baseDelay * 2 ** Math.min(attempt++, 8));
    const id = roomId;
    timer = setTimer(async () => {
      timer = null;
      if (!active(id, token) || !isOnline() || busy) return;
      busy = true;
      try {
        await onRetry(id, token);
      } catch {
        // Failures retry with bounded backoff; no room membership changes.
        if (active(id, token) && isOnline())
          scheduleAfterFailure(id, token);
      } finally {
        busy = false;
      }
    }, delay);
    return true;
  }
  function scheduleAfterFailure(id, token) {
    // Busy was set while performing onRetry; arm after the microtask finishes.
    Promise.resolve().then(() => {
      if (active(id, token) && !busy) schedule(token);
    });
  }
  function onStatus(id, token, status) {
    if (!active(id, token)) return false;
    if (status === 'SUBSCRIBED') {
      attempt = 0;
      cancel();
      return true;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      schedule(token);
    }
    return false;
  }
  function retryNow() { return schedule(generation, {immediate:true}); }
  function stop() { activate(null); }
  return {
    activate, onStatus, retryNow, stop,
    get roomId() { return roomId; },
    get pending() { return timer !== null; },
    get generation() { return generation; }
  };
}
