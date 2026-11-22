/* TRYNKA v135 — only "Дав: NN грн" by each player, no giant center HUD.
   Server-sourced contribution totals only; playing and folded players both retain amounts. */
(() => {
  'use strict';
  const money=n=>Math.max(0,Math.round(Number(n)||0)).toLocaleString('uk-UA')+' грн';
  function update(state){
    const room=document.querySelector('#detail:not([hidden]) .room');
    if(!room)return;
    room.classList.remove('tg-show-bank','tg-bank-finished');
    room.querySelector('.tg-bank-hud')?.remove();
    const active=state && (state.status==='playing'||state.status==='finished');
    const players=active&&Array.isArray(state.players)?state.players:[];
    for(const seatElement of room.querySelectorAll('.seat')){
      const seatNumber=Number(seatElement.dataset.seat);
      const player=players.find(p=>Number(p.seat)===seatNumber);
      let bet=seatElement.querySelector('.tg-contrib-badge');
      let turn=seatElement.querySelector('.tg-seat-turn-tag');
      seatElement.classList.toggle('tg-bank-folded',Boolean(player?.folded));
      if(!player){
        bet?.remove();
        turn?.remove();
        continue;
      }
      if(!bet){
        bet=document.createElement('span');
        bet.className='tg-contrib-badge';
        seatElement.append(bet);
      }
      bet.textContent='Дав: '+money(player.contributed);
      bet.classList.toggle('folded',Boolean(player.folded));
      bet.setAttribute('aria-label',player.name+' дав '+money(player.contributed)+(player.folded?' і впав':''));
      const isTurn=state.status==='playing'&&seatNumber===Number(state.turnSeat);
      if(isTurn){
        if(!turn){
          turn=document.createElement('span');
          turn.className='tg-seat-turn-tag';
          seatElement.prepend(turn);
        }
        turn.textContent='▶ ХІД';
      }else turn?.remove();
    }
  }
  window.trynkaBankHudUpdate=update;
})();