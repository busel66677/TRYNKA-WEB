/* TRYNKA v132 — real, server-sourced bank HUD. No client calculations of winnings. */
(() => {
  'use strict';
  const money = n => Math.max(0,Number(n)||0).toLocaleString('uk-UA')+' грн';
  const shortName = (s,max=15) => {
    const value=String(s||'Гравець');
    return value.length>max?value.slice(0,max-1)+'…':value;
  };
  const actions = {
    ante:'Ставка',call:'Дав',raise:'Підняв',fold:'Впав',
    reveal:'Вскриття',timeout:'Час вийшов',disconnect:'Вийшов'
  };
  let cacheRoom=null,cacheKey='';
  function node(tag,cls,text){
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function update(state){
    const room=document.querySelector('#detail:not([hidden]) .room');
    if(!room){cacheRoom=null;cacheKey='';return;}
    const felt=room.querySelector('.felt');
    if(!felt)return;
    const active=state && (state.status==='playing'||state.status==='finished');
    if(!active){
      room.classList.remove('tg-show-bank','tg-bank-finished');
      felt.querySelector('.tg-bank-hud')?.remove();
      room.querySelectorAll('.tg-contrib-badge,.tg-seat-turn-tag').forEach(el=>el.remove());
      room.querySelectorAll('.seat.tg-bank-folded').forEach(el=>el.classList.remove('tg-bank-folded'));
      cacheRoom=null;cacheKey='';
      return;
    }
    const players=Array.isArray(state.players)?state.players:[];
    const safe=[
      state.roundId,state.status,state.pot,state.turnSeat,state.myTurn,
      state.lastAction?.at,
      ...players.map(p=>p.seat+':'+p.contributed+':'+p.folded+':'+p.lastAction+':'+p.won),
      ...(state.payouts||[]).map(p=>p.seat+':'+p.amount)
    ].join('|');
    if(room===cacheRoom && cacheKey===safe && felt.querySelector('.tg-bank-hud'))return;
    cacheRoom=room;cacheKey=safe;
    room.classList.add('tg-show-bank');
    room.classList.toggle('tg-bank-finished',state.status==='finished');
    const hud=felt.querySelector('.tg-bank-hud')||node('section','tg-bank-hud');
    hud.setAttribute('aria-label','Банк, внески та хід гравців');
    hud.replaceChildren();
    const label=node('div','tg-bank-label',state.status==='finished'?'РОЗДАЧУ ЗАВЕРШЕНО':'БАНК');
    hud.append(label);
    const value=node('strong','tg-bank-total',money(state.pot));
    hud.append(value);
    if(state.status==='playing'){
      const turn=players.find(p=>Number(p.seat)===Number(state.turnSeat));
      hud.append(node('div','tg-bank-turn'+(state.myTurn?' mine':''),
        state.myTurn?'▶ ВАШ ХІД':turn?'▶ ХІД: '+shortName(turn.name,13):'Очікуємо хід'));
    }
    const rows=node('div','tg-bank-contributions');
    for(const p of players){
      const row=node('div','tg-bank-contribution'+(p.folded?' is-folded':''));
      row.append(node('span','tg-bank-player-name',shortName(p.name,10)));
      row.append(node('b','tg-bank-player-amount',money(p.contributed)));
      rows.append(row);
    }
    if(rows.childElementCount)hud.append(rows);
    const last=state.lastAction;
    if(state.status==='playing' && last){
      const label=actions[last.type]||last.type||'Хід';
      const amount=last.amount>0?' +'+money(last.amount):'';
      hud.append(node('div','tg-bank-last',shortName(last.name,11)+' · '+label+amount));
    }
    if(state.status==='finished'){
      const payouts=Array.isArray(state.payouts)?state.payouts:[];
      const awarded=payouts.filter(p=>Number(p.amount)>0);
      const result=awarded.length
        ?awarded.map(p=>shortName(p.name,13)+' +'+money(p.amount)).join(' · ')
        :'Немає переможця';
      hud.append(node('div','tg-bank-winner','🏆 '+result));
      hud.append(node('div','tg-bank-payout-note','Розподіл тестового банку'));
    }
    felt.append(hud);
    for(const el of room.querySelectorAll('.seat')){
      const seat=Number(el.dataset.seat);
      const p=players.find(x=>Number(x.seat)===seat);
      let contribution=el.querySelector('.tg-contrib-badge');
      let turnTag=el.querySelector('.tg-seat-turn-tag');
      el.classList.toggle('tg-bank-folded',!!p?.folded);
      if(!p){
        contribution?.remove();
        turnTag?.remove();
        continue;
      }
      if(!contribution){contribution=node('span','tg-contrib-badge');el.append(contribution)}
      contribution.textContent=p.folded?'ПАС':'+'+money(p.contributed);
      contribution.classList.toggle('folded',!!p.folded);
      const isTurn=state.status==='playing'&&seat===Number(state.turnSeat);
      if(isTurn){
        if(!turnTag){turnTag=node('span','tg-seat-turn-tag');el.prepend(turnTag)}
        turnTag.textContent='▶ ХІД';
      }else turnTag?.remove();
    }
  }
  window.trynkaBankHudUpdate=update;
})();