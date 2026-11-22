/* TRYNKA v133 — deal animation + legible on-table card showdown.
   Reads server-authoritative states only. Opponent cards/scores are NEVER revealed in play. */
(() => {
  'use strict';
  const money=n=>Number(n||0).toLocaleString('uk-UA')+' грн';
  const short=(s,n=18)=>{
    const text=String(s||'Гравець');
    return text.length>n?text.slice(0,n-1)+'…':text;
  };
  const node=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=value;
    return el;
  };
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  let lastDealKey='',lastRevealKey='';
  function currentRoom(){return document.querySelector('#detail:not([hidden]) .room')}
  function seatOfMe(){return Number(window.trynkaTelegramGameBridge?.()?.seat)||0}
  function clearIfNotPlaying(){
    const room=currentRoom();
    if(!room){lastDealKey='';lastRevealKey='';}
    return room;
  }

  function showOwnScore(state,room){
    const label=room.querySelector('.tg-own-hand .tg-own-label');
    if(!label)return;
    let result=label.querySelector('.tg-my-points');
    if(state.status==='playing' && state.myScore){
      if(!result){result=node('strong','tg-my-points');label.append(result)}
      result.textContent='МОЇ ОЧКИ: '+state.myScore;
    }else result?.remove();
  }

  function createFace(card, cls){
    const red=card&&['♥','♦'].includes(card.suit);
    const el=node('span','tg-reveal-face'+(red?' red':'')+(cls?' '+cls:''));
    if(card&&typeof card.rank==='string'&&typeof card.suit==='string'){
      el.append(node('b','',card.rank),node('i','',card.suit));
    }else el.textContent='🂠';
    return el;
  }

  function renderShowdown(state,room,{animateReveal=false}={}){
    const wrap=room.querySelector('.felt-wrap');
    if(!wrap)return;
    if(state.status!=='finished'){
      wrap.querySelector('.tg-reveal-board')?.remove();
      room.classList.remove('tg-reveal-active');
      lastRevealKey='';
      return;
    }
    const key=String(state.table)+':'+String(state.roundId);
    if(lastRevealKey===key&&wrap.querySelector('.tg-reveal-board'))return;
    lastRevealKey=key;
    room.classList.add('tg-reveal-active');
    const previous=wrap.querySelector('.tg-reveal-board');
    previous?.remove();
    const board=node('section','tg-reveal-board');
    board.setAttribute('role','status');
    const lastStanding=state.revealMode==='last-standing';
    board.classList.toggle('tg-last-standing',lastStanding);
    board.setAttribute('aria-label',lastStanding?'Карти останнього гравця, очки та виграш':'Відкриті карти, очки та переможець');
    board.append(node('div','tg-reveal-title',lastStanding?'🃏 ОСТАННІЙ ГРАВЕЦЬ ВІДКРИВАЄ КАРТИ':'🃏 ВСКРИТТЯ КАРТ'));
    const winners=(state.payouts||[]).filter(w=>Number(w.amount)>0);
    const players=Array.isArray(state.players)?state.players:[];
    const findWinner=w=>players.find(p=>Number(p.seat)===Number(w.seat));
    if(winners.length===1){
      const w=winners[0],p=findWinner(w);
      board.append(node('div','tg-reveal-winner','🏆 ПЕРЕМІГ: '+short(w.name,19)));
      board.append(node('div','tg-reveal-winning-score','Результат: '+String(p?.result||'—')));
      board.append(node('div','tg-reveal-winning-payout','Забрав банк: '+money(w.amount)));
    }else if(winners.length>1){
      board.append(node('div','tg-reveal-winner','🏆 НІЧИЯ · БАНК ПОДІЛЕНО'));
      for(const w of winners){
        const p=findWinner(w);
        board.append(node('div','tg-reveal-tie-score',short(w.name,13)+' · '+String(p?.result||'—')+' · '+money(w.amount)));
      }
    }else board.append(node('div','tg-reveal-winner','Роздачу завершено'));
    const list=node('div','tg-reveal-list');
    const me=seatOfMe();
    // When everyone else folds, display the LAST player's entire hand to every viewer.
    // At a regular showdown compare only surviving hands (folded hands stay private).
    const shown=players.filter(p=>p.revealed===true && Array.isArray(p.cards));
    const display=lastStanding
      ?shown.filter(p=>Number(p.seat)===Number(state.lastPlayerSeat))
      :shown;
    for(const p of display){
      const own=Number(p.seat)===me;
      const row=node('div','tg-reveal-row'+(p.winner?' is-winner':'')+(own?' is-mine':'')+(p.folded?' is-folded':''));
      const info=node('div','tg-reveal-info');
      info.append(node('b','tg-reveal-name',own?'ВИ':short(p.name,16)));
      const result=p.result||'Комбінація не визначена';
      info.append(node('span','tg-reveal-score',result));
      const hand=node('div','tg-reveal-hand');
      for(let i=0;i<3;i++){
        const card=createFace(p.cards?.[i],animateReveal?'tg-face-flip':'');
        card.style.setProperty('--deal-index',String(i));
        hand.append(card);
      }
      row.append(info,hand);
      list.append(row);
    }
    board.append(list);
    if(lastStanding){
      board.append(node('div','tg-reveal-note','Усі інші гравці впали · карти переможця відкрито для всіх'));
    }
    board.append(node('div','tg-reveal-bank','Банк: '+money(state.pot)+' · тестова гра'));
    wrap.append(board);
  }

  function dealAnimation(state,room){
    if(reduced() || state.status!=='playing')return;
    const wrap=room.querySelector('.felt-wrap');
    if(!wrap||!wrap.isConnected)return;
    const bounds=wrap.getBoundingClientRect();
    if(bounds.width<100||bounds.height<110)return;
    const players=Array.isArray(state.players)?state.players:[];
    if(players.length<2)return;
    const cx=bounds.width*.5,cy=bounds.height*.5;
    wrap.querySelectorAll('.tg-dealing-back,.tg-deal-deck').forEach(el=>el.remove());
    const deck=node('div','tg-deal-deck','♠');
    deck.style.left=(cx-18)+'px';
    deck.style.top=(cy-24)+'px';
    wrap.append(deck);
    let count=0;
    const me=seatOfMe();
    // Three consecutive passes: one card per player, then second, then third.
    for(let i=0;i<3;i++){
      players.forEach((p,k)=>{
        const seat=room.querySelector('.seat[data-seat="'+Number(p.seat)+'"]');
        const target=seat?.querySelector('.seat-icon');
        if(!target)return;
        const box=target.getBoundingClientRect();
        const x=box.left-bounds.left+box.width*.5;
        const y=box.top-bounds.top+box.height*.5;
        const card=node('div','tg-dealing-back','♠');
        card.style.left=(cx-16)+'px';
        card.style.top=(cy-22)+'px';
        wrap.append(card);
        const delay=(i*players.length+k)*225;
        const duration=850;
        const dx=x-cx+(i-1)*7,dy=y-cy+(i-1)*5;
        if(typeof card.animate==='function'){
          const a=card.animate([
            {transform:'translate(0,0) rotate(-20deg) scale(.6)',opacity:0},
            {transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1,offset:.14},
            {transform:'translate('+dx+'px,'+dy+'px) rotate('+(k*11-14)+'deg) scale(.9)',opacity:1,offset:.85},
            {transform:'translate('+dx+'px,'+dy+'px) rotate(0deg) scale(.7)',opacity:0}
          ],{duration,delay,fill:'forwards',easing:'cubic-bezier(.16,.7,.26,1)'});
          a.onfinish=()=>card.remove();
          a.oncancel=()=>card.remove();
        }else{
          // CSS animation fallback for Telegram WebViews without WAAPI.
          card.style.setProperty('--tg-dx',dx+'px');
          card.style.setProperty('--tg-dy',dy+'px');
          card.style.animation='tg-card-fly 850ms '+delay+'ms both cubic-bezier(.16,.7,.26,1)';
          card.addEventListener('animationend',()=>card.remove(),{once:true});
        }
        count++;
      });
    }
    if(count){
      room.classList.add('tg-dealing');
      const age=3*players.length*225+850;
      window.setTimeout(()=>{
        deck.remove();
        if(room.isConnected)room.classList.remove('tg-dealing');
      },Math.min(4000,age));
    }else deck.remove();
  }

  function update(state,opts={}){
    const room=clearIfNotPlaying();
    if(!room||!state||state.status==='waiting'){
      const previous=room?.querySelector('.tg-reveal-board');
      previous?.remove();
      room?.classList.remove('tg-reveal-active','tg-dealing');
      if(state?.status==='waiting'){lastDealKey='';lastRevealKey='';}
      return;
    }
    // No score overlay during play; show the decisive score at the end.
    room.querySelector('.tg-my-points')?.remove();
    renderShowdown(state,room,opts);
    if(state.status==='finished'){
      room.querySelectorAll('.tg-dealing-back,.tg-deal-deck').forEach(el=>el.remove());
      room.classList.remove('tg-dealing');
    }
    const dealKey=String(state.table)+':'+String(state.roundId);
    // The actual server deal time, not a poll, triggers the visual flight.
    const age=Date.now()-Number(state.dealStartedAt||0);
    if(state.status==='playing'&&opts.animateDeal&&age>=0&&age<4200&&lastDealKey!==dealKey){
      lastDealKey=dealKey;
      dealAnimation(state,room);
    }
  }
  window.trynkaRoundVisualsUpdate=update;
})();