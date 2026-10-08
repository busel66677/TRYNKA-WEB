/* v100 premium layout: relocate the EXISTING hand, never clone or read cards. */
(function () {
  const mq = window.matchMedia('(max-width:650px)');
  function arrange() {
    const game = document.getElementById('game');
    const top = game?.querySelector('.gameTop');
    const table = game?.querySelector('.table');
    const dock = document.getElementById('cardDock');
    if (!game || !top || !table || !dock) return;
    // Preserve the same DOM node and all game event handlers. On desktop
    // return it to its original place in the toolbar.
    if (mq.matches) {
      if (dock.parentElement !== table) table.appendChild(dock);
    } else if (dock.parentElement !== top) {
      top.insertBefore(dock, top.querySelector('.gameTopActions'));
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', arrange, { once: true });
  else arrange();
  if (mq.addEventListener) mq.addEventListener('change', arrange);
  else if (mq.addListener) mq.addListener(arrange);
  window.TRYNKA_ARRANGE_PREMIUM_TABLE = arrange;
})();