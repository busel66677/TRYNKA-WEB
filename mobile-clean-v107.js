/* v107: place the actual game controls below the mobile table rim.
   DOM MOVE ONLY: listeners, disabled states, balances and game rules remain. */
(()=>{
  'use strict';
  const portrait=matchMedia('(orientation:portrait) and (max-width:700px)');
  function arrange(){
    const game=document.getElementById('game');
    const table=game?.querySelector('.table');
    const wrapper=game?.querySelector('.tableWrap');
    const actions=document.getElementById('gameActions');
    if(!game||!table||!wrapper||!actions)return;
    if(portrait.matches){
      if(actions.parentElement!==wrapper || actions.previousElementSibling!==table){
        table.insertAdjacentElement('afterend',actions);
      }
    } else if(actions.parentElement!==table){
      table.appendChild(actions);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arrange,{once:true});
  else arrange();
  if(portrait.addEventListener)portrait.addEventListener('change',arrange);
  else portrait.addListener(arrange);
  window.addEventListener('resize',arrange,{passive:true});
  document.addEventListener('trynka:game-state',arrange);
  window.TRYNKA_ARRANGE_ACTIONS_V107=arrange;
})();
