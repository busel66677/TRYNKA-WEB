// Telegram TRYNKA: responsive card-deal, turn, countdown and showdown animations.
// The server remains authoritative; visuals never decide cards, turns or winners.
(() => {
  const tg=window.Telegram?.WebApp;
  const styles=document.createElement('style');
  styles.textContent=`
  .tg-round{position:relative;margin:14px 8px 18px;padding:15px;background:linear-gradient(156deg,#173b29,#0b2219);border:1px solid #ad935e85;border-radius:18px;color:#fff0d0;box-shadow:inset 0 1px #ffffff11,0 8px 21px #0005}
  .tg-round-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;letter-spacing:1px;font-weight:850;color:#e6ca91}
  .tg-round-head .tg-pot{font-size:12px;color:#ffe5a5;letter-spacing:0}
  .tg-round-title{margin:12px 0 4px;font-weight:900;font-size:19px;color:#fff1ca}
  .tg-round-title.own-turn{color:#ffe18e;text-shadow:0 0 15px #f4c66b66}
  .tg-round-line{font-size:12px;color:#bfd3c1;line-height:1.5;margin:7px 0}
  .tg-clock{display:flex;align-items:center;justify-content:space-between;gap:9px;margin:11px 0 8px;font-size:13px;color:#f3e3b8;font-weight:800}
  .tg-clock strong{font-variant-numeric:tabular-nums;font-size:18px;color:#ffe5ab}
  .tg-time-track{height:6px;border-radius:7px;background:#091b14;overflow:hidden;border:1px solid #e3c18426;margin:0 0 15px}
  .tg-time-fill{width:100%;height:100%;background:linear-gradient(90deg,#b4a96d,#f4d78c);border-radius:6px;transition:width .18s linear,background .15s ease}
  .tg-time-track.urgent .tg-time-fill{background:linear-gradient(90deg,#bd5650,#f3a073)}
  .tg-player{border:1px solid #8d9f713d;border-radius:12px;padding:9px 10px;margin:7px 0;background:#0a2018a6;transition:border-color .25s,background .25s,box-shadow .25s}
  .tg-player.is-turn{border-color:#edcf82;background:#234532;box-shadow:inset 0 0 0 1px #edca7133,0 0 17px #e9ba4633}
  .tg-player.is-winner{border-color:#eed187;background:linear-gradient(120deg,#334a31,#234333);box-shadow:0 0 16px #cda85d3e}
  .tg-player.is-folded{opacity:.62}
  .tg-player-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}
  .tg-player-heading strong{color:#f3dfac;font-weight:850;overflow-wrap:anywhere}
  .tg-player-status{font-size:11px;color:#c0ceb9;white-space:nowrap}
  .tg-player.is-turn .tg-player-status{color:#ffdf91;font-weight:900}
  .tg-player.is-winner .tg-player-status{color:#ffe8a8;font-weight:900}
  .tg-hand{display:flex;gap:7px;align-items:center;min-height:65px;margin:10px 0 1px}
  .tg-card{width:48px;height:65px;display:flex;align-items:center;justify-content:center;position:relative;flex:none;border-radius:8px;
    background:#f9f4e6;color:#15231b;border:1px solid #ffffffbb;box-shadow:0 3px 10px #0007;font:900 19px Georgia,serif;transform-origin:center center;backface-visibility:hidden}
  .tg-card.red{color:#bc3535}.tg-card.back{background:repeating-linear-gradient(45deg,#24523e 0,#24523e 6px,#173827 6px,#173827 12px);color:#ead49c;border:2px solid #c9aa6d;box-shadow:inset 0 0 0 2px #153326,0 3px 9px #0006}
  .tg-card.deal{animation:tg-deal .62s both cubic-bezier(.19,.9,.28,1.1);animation-delay:var(--delay,0ms)}
  .tg-card.reveal{animation:tg-flip .65s both ease-out;animation-delay:var(--delay,0ms)}
  @keyframes tg-deal{0%{opacity:0;transform:translate(42px,-98px) rotate(20deg) scale(.36)}60%{opacity:1}100%{opacity:1;transform:translate(0,0) rotate(0) scale(1)}}
  @keyframes tg-flip{0%{opacity:.6;transform:scaleX(.05) rotateY(85deg)}57%{opacity:1;transform:scaleX(.3) rotateY(40deg)}100%{transform:scaleX(1) rotateY(0)}}
  .tg-round-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}
  .tg-round-buttons button{flex:1;min-width:84px;padding:13px 7px;border:1px solid #efdeae80;border-radius:11px;background:linear-gradient(135deg,#f2d99d,#cba667);color:#15261b;font-size:13px;font-weight:950;box-shadow:0 4px 11px #0004}
  .tg-round-buttons button.danger{background:#53352b;border-color:#b97f68;color:#ffe6d6}
  .tg-round-buttons button:disabled{opacity:.48;box-shadow:none}
  .tg-round-note{margin:15px 2px 1px;font-size:10px;color:#a2b8a7}
  .tg-round-error{font-size:12px;color:#ffd0b9;margin:8px 0}
  .tg-showdown{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:8;pointer-events:none;min-width:220px;max-width:90%;padding:19px 18px;text-align:center;
    background:linear-gradient(150deg,#203e2d,#0a2017eF);border:2px solid #f2d28b;border-radius:17px;box-shadow:0 0 0 300px #08150f4a,0 8px 32px #000c,0 0 22px #e5bd6e50;
    animation:tg-showdown-pop .48s both cubic-bezier(.17,.9,.31,1.2)}
  .tg-showdown-heading{font-family:Georgia,serif;font-size:25px;font-weight:900;letter-spacing:2px;color:#ffe3a2}
  .tg-showdown-subtitle{font-size:13px;color:#f7edd2;margin-top:9px;line-height:1.4}
  @keyframes tg-showdown-pop{from{opacity:0;transform:translate(-50%,-50%) scale(.7)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  .seat.is-turn .seat-icon{border:3px solid #ffe39a!important;box-shadow:0 0 0 4px #eac26733,0 0 20px #f0cb73ac!important;animation:tg-seat-pulse 1.45s ease-in-out infinite}
  .seat.is-turn .seat-name{border:1px solid #f7d990;color:#fff0b8;font-weight:900}
  .seat.is-winner .seat-icon{border:3px solid #ffda7a!important;box-shadow:0 0 0 5px #d9ba6d38,0 0 24px #f5cf85b0!important}
  .seat.is-winner .seat-name{color:#ffe4a1;border:1px solid #deb766}
  @keyframes tg-seat-pulse{0%,100%{box-shadow:0 0 0 3px #e9c77436,0 0 12px #e9ca8580}50%{box-shadow:0 0 0 6px #ebd08166,0 0 25px #f5d48dbb}}
  @media(max-width:360px){.tg-card{width:42px;height:60px;font-size:17px}.tg-hand{gap:5px}.tg-round{margin-left:3px;margin-right:3px;padding:12px}}
  @media(prefers-reduced-motion:reduce){.tg-card.deal,.tg-card.reveal,.tg-showdown,.seat.is-turn .seat-icon{animation:none!important}.tg-time-fill{transition:none}}
  `;
  document.head.append(styles);

  let busy=false;
  let inFlight=false;
  let requestSeq=0;
  let lastKey='';
  let lastRound='';
  let lastStatus='waiting';
  let snapshot=null;
  let snapshotTable=null;
  let errorMessage='';
  let gamePanel=null;
  let timeText=null;
  let timeTrack=null;
  let timeFill=null;
  let finishButton=null;
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;

  function currentTable(){return Number(window.trynkaTelegramGameBridge?.()?.table)||null}
  function panelFor(table){
    if(currentTable()!==table)return null;
    const room=document.querySelector('#detail:not([hidden]) .room');
    if(!room)return null;
    let panel=room.querySelector('.tg-round');
    if(!panel){
      panel=document.createElement('section');
      panel.className='tg-round';
      panel.setAttribute('aria-label','Стан роздачі');
      room.insertBefore(panel,room.querySelector('.trynka-invite-btn')||room.querySelector('.leave-btn'));
    }
    gamePanel=panel;
    return panel;
  }
  function node(tag,cls,text){
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=text;
    return element;
  }
  function addCard(parent,card,mode,delay){
    const red=card&&['♥','♦'].includes(card.suit);
    const item=node('div','tg-card'+(red?' red':'')+(!card?' back':'')+(mode?' '+mode:''),card?card.rank+card.suit:'♠');
    if(mode)item.style.setProperty('--delay',delay+'ms');
    parent.append(item);
  }
  function makeButton(parent,text,action,table,{danger=false,disabled=false}={}){
    const button=node('button',danger?'danger':'',text);
    button.type='button';button.disabled=busy||disabled;
    button.onclick=async()=>{
      if(busy||button.disabled)return;
      busy=true;button.disabled=true;
      try{
        const state=await apiPost('/api/game',{action,table});
        if(currentTable()!==table)return;
        errorMessage='';
        applyState(table,state);
      }catch(e){errorMessage=e.message||'Не вдалося виконати хід';}
      finally{busy=false;refresh();}
    };
    parent.append(button);
    return button;
  }
  function fingerprint(state){
    if(state.status==='waiting')return 'waiting:'+state.seated;
    const players=(state.players||[]).map(p=>[p.seat,p.folded,p.acted,p.winner].join(':')).join('|');
    return [state.roundId,state.status,state.turnSeat,state.myTurn,state.pot,players].join('/');
  }
  function setSeatHighlights(state){
    const room=document.querySelector('#detail:not([hidden]) .room');
    if(!room)return;
    for(const el of room.querySelectorAll('.seat')){
      el.classList.remove('is-turn','is-winner');
      const seat=Number(el.dataset.seat);
      if(state?.status==='playing'&&seat===Number(state.turnSeat))el.classList.add('is-turn');
      if(state?.status==='finished'&&state.winners?.includes(seat))el.classList.add('is-winner');
    }
  }
  window.trynkaSyncGameHighlights=()=>setSeatHighlights(snapshotTable===currentTable()?snapshot:null);
  function clockUpdate(){
    if(!snapshot||snapshotTable!==currentTable())return;
    if(snapshot.status==='playing'&&timeText&&timeFill){
      const remaining=Math.max(0,Number(snapshot.turnEndsAt||0)-Date.now());
      const whole=Math.ceil(remaining/1000);
      timeText.textContent=whole+' с';
      timeFill.style.width=Math.min(100,remaining/30000*100)+'%';
      timeTrack?.classList.toggle('urgent',whole<=8);
    }
    if(snapshot.status==='finished'&&finishButton){
      const remaining=Math.max(0,Math.ceil((Number(snapshot.nextRoundAt||0)-Date.now())/1000));
      finishButton.disabled=busy||remaining>0;
      finishButton.textContent=remaining?'Наступна роздача через '+remaining+' с':'🃏 Нова роздача';
    }
  }
  function showdownOverlay(data){
    const room=document.querySelector('#detail:not([hidden]) .room');
    const wrap=room?.querySelector('.felt-wrap');
    if(!wrap)return;
    wrap.querySelector('.tg-showdown')?.remove();
    // Show only briefly on a new completed round; not on every poll or after reconnect.
    const age=Date.now()-Number(data.finishedAt||0);
    if(age<0||age>4200||reducedMotion())return;
    const panel=node('div','tg-showdown');
    panel.append(node('div','tg-showdown-heading','♠ ВСКРИТТЯ ♠'));
    const names=(data.players||[]).filter(p=>p.winner).map(p=>p.name);
    panel.append(node('div','tg-showdown-subtitle',names.length?'🏆 '+names.join(', '):'Карти відкрито'));
    wrap.append(panel);
    // Explicit cleanup keeps the final cards readable after the reveal.
    window.setTimeout(()=>panel.remove(),Math.max(500,4300-age));
  }
  function render(table,data,{animateDeal=false,animateReveal=false,showWinner=false}={}){
    const panel=panelFor(table);
    if(!panel)return;
    panel.replaceChildren();
    timeText=null;timeFill=null;timeTrack=null;finishButton=null;
    const head=node('div','tg-round-head');
    head.append(node('span','','♠ РОЗДАЧА · '+(data.roundId||'—')));
    head.append(node('span','tg-pot',data.status==='waiting'?'2–4 гравці':'Банк: '+Number(data.pot||0)+' ◉'));
    panel.append(head);
    if(errorMessage)panel.append(node('p','tg-round-error',errorMessage));
    const title=node('div','tg-round-title'+(data.myTurn?' own-turn':''));
    const buttons=node('div','tg-round-buttons');

    if(data.status==='waiting'){
      title.textContent='Очікуємо гравців';
      panel.append(title);
      panel.append(node('p','tg-round-line','За столом: '+(data.seated??'…')+'. Для тестової роздачі потрібно щонайменше двоє.'));
      makeButton(buttons,'🃏 Роздати карти','start',table,{disabled:Number(data.seated)<2});
      panel.append(buttons);
      panel.append(node('p','tg-round-note','Тестовий режим · без списання ігрових фішок'));
      setSeatHighlights(null);
      return;
    }

    if(data.status==='playing'){
      const current=(data.players||[]).find(p=>p.seat===data.turnSeat);
      title.textContent=data.myTurn?'⚡ ВАШ ХІД':('Хід: '+(current?.name||'гравець')+' · місце №'+data.turnSeat);
      panel.append(title);
      const clock=node('div','tg-clock');
      clock.append(node('span','',data.myTurn?'Обирайте дію':'Час на хід'));
      timeText=node('strong','','30 с');clock.append(timeText);panel.append(clock);
      timeTrack=node('div','tg-time-track');timeFill=node('div','tg-time-fill');
      timeTrack.append(timeFill);panel.append(timeTrack);
      panel.append(node('p','tg-round-line','Ставка: '+data.stake+' тестових фішок · підсвічений гравець робить хід'));
    }else{
      const winners=(data.players||[]).filter(p=>p.winner).map(p=>p.name);
      title.textContent=winners.length?'🏆 Переможець: '+winners.join(', '):'Роздачу завершено';
      panel.append(title);
      panel.append(node('p','tg-round-line',data.reason||'Вскриття карт'));
    }

    for(const p of data.players||[]){
      const active=data.status==='playing'&&Number(data.turnSeat)===Number(p.seat);
      const wrapper=node('article','tg-player'+(active?' is-turn':'')+(p.winner?' is-winner':'')+(p.folded?' is-folded':''));
      const heading=node('div','tg-player-heading');
      heading.append(node('strong','',(p.winner?'🏆 ':'')+p.name+' · №'+p.seat));
      heading.append(node('span','tg-player-status',p.folded?'Впав':p.result||(active?'● Ходить':p.acted?'Дав':'Чекає')));
      wrapper.append(heading);
      const cards=node('div','tg-hand');
      const hand=p.cards||[null,null,null];
      hand.forEach((card,i)=>addCard(cards,card,animateReveal?'reveal':animateDeal?'deal':'',(i*155)+(p.seat-1)*85));
      wrapper.append(cards);panel.append(wrapper);
    }

    if(data.status==='playing'&&data.myTurn){
      makeButton(buttons,'ДАВ','call',table);
      makeButton(buttons,'ВПАВ','fold',table,{danger:true});
      makeButton(buttons,'ВСКРИВСЯ','reveal',table);
      panel.append(buttons);
    }else if(data.status==='finished'){
      finishButton=makeButton(buttons,'🃏 Нова роздача','start',table,{disabled:true});
      panel.append(buttons);
    }
    panel.append(node('p','tg-round-note','Тестова партія: віртуальні фішки не списуються та не нараховуються.'));
    setSeatHighlights(data);
    clockUpdate();
    if(showWinner)showdownOverlay(data);
  }
  function applyState(table,data){
    if(currentTable()!==table)return;
    const key=fingerprint(data);
    const newRound=data.status!=='waiting'&&String(data.roundId)!==lastRound;
    const dealAge=Date.now()-Number(data.dealStartedAt||0);
    const animateDeal=newRound&&data.status==='playing'&&dealAge>=0&&dealAge<5500;
    const animateReveal=data.status==='finished'&&(lastStatus==='playing'||(newRound&&Date.now()-Number(data.finishedAt||0)<4000));
    const showWinner=animateReveal;
    snapshot=data;snapshotTable=table;
    if(newRound)lastRound=String(data.roundId);
    // Repaint only when something actually changed; a 1.3s network poll must never restart animation.
    if(key!==lastKey||!document.querySelector('#detail:not([hidden]) .room .tg-round')){
      render(table,data,{animateDeal,animateReveal,showWinner});
      lastKey=key;
    }
    lastStatus=data.status;
    setSeatHighlights(data);
    clockUpdate();
    if(data.myTurn&&data.status==='playing'&&data.turnSeat!==window.__trynkaLastTurnSeat){
      // Only subtle haptic feedback; no loud audio.
      try{tg?.HapticFeedback?.impactOccurred?.('light')}catch{}
    }
    window.__trynkaLastTurnSeat=data.status==='playing'?data.turnSeat:null;
  }
  async function refresh(){
    const table=currentTable();
    if(!table||!tg?.initData||busy){
      if(!table){snapshot=null;snapshotTable=null;lastRound='';lastStatus='waiting';lastKey='';window.__trynkaLastTurnSeat=null;}
      return;
    }
    if(inFlight)return;
    inFlight=true;const seq=++requestSeq;
    try{
      const state=await apiPost('/api/game',{action:'state',table});
      if(seq===requestSeq&&currentTable()===table){
        errorMessage='';
        applyState(table,state);
      }
    }catch(e){
      errorMessage=e.message||'Не вдалося оновити гру';
      const panel=panelFor(table);
      if(panel&&!panel.querySelector('.tg-round-error'))panel.prepend(node('p','tg-round-error',errorMessage));
    }finally{inFlight=false}
  }
  window.setInterval(()=>{if(!document.hidden)refresh()},1300);
  window.setInterval(clockUpdate,160);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  refresh();
})();
