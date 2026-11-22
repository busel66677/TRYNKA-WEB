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
    board.setAttribute('aria-label','Відкриті карти, очки та переможець');
    board.append(node('div','tg-reveal-title','🃏 ВСКРИТТЯ КАРТ'));
    const winners=(state.payouts||[]).filter(w=>Number(w.amount)>0);
    const bannerText=winners.length
      ?winners.length===1
        ?'🏆 '+short(winners[0].name,17)+' забрав '+money(winners[0].amount)
        :'🏆 Банк поділено: '+winners.map(w=>short(w.name,10)+' '+money(w.amount)).join(' · ')
      :'Роздачу завершено';
    board.append(node('div','tg-reveal-winner',bannerText));
    const list=node('div','tg-reveal-list');
    const me=seatOfMe();
    const players=Array.isArray(state.players)?state.players:[];
    for(const p of players){
      const own=Number(p.seat)===me;
      const row=node('div','tg-reveal-row'+(p.winner?' is-winner':'')+(own?' is-mine':'')+(p.folded?' is-folded':''));
      const info=node('div','tg-reveal-info');
      info.append(node('b','tg-reveal-name',own?'ВИ':short(p.name,16)));
      const result=p.result?(p.folded?'Пас · '+p.result:p.result):p.folded?'Пас':'Результат відсутній';
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
    const me=seatOfMe();
    const cx=bounds.width*.50,cy=bounds.height*.49;
    const myCards=room.querySelectorAll('.tg-own-hand .tg-card');
    let done=0;
    for(let i=0;i<3;i++){
      players.forEach((p,k)=>{
        const seat=room.querySelector('.seat[data-seat="'+Number(p.seat)+'"]');
        const target=p.seat===me&&myCards[i]?myCards[i]:seat?.querySelector('.seat-icon');
        if(!target)return;
        const box=target.getBoundingClientRect();
        const x=box.left-bounds.left+box.width*.5;
        const y=box.top-bounds.top+box.height*.5;
        const card=node('div','tg-dealing-back','♠');
        card.style.left=(cx-13)+'px';
        card.style.top=(cy-18)+'px';
        card.style.setProperty('--ix',String(i));
        wrap.append(card);
        const delay=(i*players.length+k)*125;
        const duration=680;
        if(typeof card.animate==='function'){
          const animation=card.animate([
            {transform:'translate(0,0) rotate(-16deg) scale(.62)',opacity:0},
            {transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1,offset:.13},
            {transform:'translate('+(x-cx)+'px,'+(y-cy)+'px) rotate('+(k*9-15)+'deg) scale(.82)',opacity:1,offset:.85},
            {transform:'translate('+(x-cx)+'px,'+(y-cy)+'px) rotate(0deg) scale(.5)',opacity:0}
          ],{duration,delay,fill:'forwards',easing:'cubic-bezier(.26,.7,.3,1)'});
          animation.onfinish=()=>card.remove();
          animation.oncancel=()=>card.remove();
        }else{
          // No Web Animations support: leave live game fully playable.
          card.remove();
        }
        done++;
      });
    }
    if(done){
      room.classList.add('tg-dealing');
      window.setTimeout(()=>{if(room.isConnected)room.classList.remove('tg-dealing')},Math.min(2800,done*125+850));
    }
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
    showOwnScore(state,room);
    renderShowdown(state,room,opts);
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