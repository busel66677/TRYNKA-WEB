
/* Non-invasive lobby filters and readable play-money amounts. */
(() => {
  const rooms = document.getElementById('rooms');
  const area = document.getElementById('tablesArea');
  if (!rooms || !area || document.getElementById('trynkaTableFilters')) return;
  const bar = document.createElement('div');
  bar.id = 'trynkaTableFilters';
  bar.className = 'tableFilters';
  bar.setAttribute('role','group');
  bar.setAttribute('aria-label','Фільтри столів');
  bar.innerHTML = '<span class="filterTitle">Фільтр:</span><button type="button" class="tableFilter" data-filter="all" aria-pressed="true">Усі</button><button type="button" class="tableFilter" data-filter="open" aria-pressed="false">Є місця</button><button type="button" class="tableFilter" data-filter="low" aria-pressed="false">До 50 грн</button><button type="button" class="tableFilter" data-filter="high" aria-pressed="false">Від 100 грн</button><input class="tableSearch" type="search" aria-label="Пошук столу" placeholder="Пошук за назвою…"><span class="filterCount" aria-live="polite"></span>';
  rooms.before(bar);
  let mode='all';
  const input=bar.querySelector('.tableSearch');
  const count=bar.querySelector('.filterCount');
  function paint(){
    const cards=[...rooms.querySelectorAll('.roomCard')];
    const query=input.value.trim().toLocaleLowerCase('uk-UA');
    let visible=0;
    for(const card of cards){
      const stake=Number(card.dataset.ante||0);
      const occupied=Number(card.dataset.players||0);
      const max=Number(card.dataset.max||0);
      const unavailable=card.dataset.status==='playing'||!!card.querySelector('button:disabled');
      const open=!unavailable&&occupied<max;
      const matches=(mode==='all'||mode==='open'&&open||mode==='low'&&stake<=50||mode==='high'&&stake>=100)&&(!query||(card.dataset.name||'').includes(query));
      card.hidden=!matches;
      if(matches)visible++;
      card.querySelectorAll('.roomMeta .pill').forEach(pill=>{
        if(pill.dataset.stakeFormatted==='1')return;
        if(/^◉\s*[\d\s.,]+$/.test(pill.textContent.trim())){
          pill.textContent='Ставка: '+stake.toLocaleString('uk-UA')+' грн';
          pill.classList.add('stakeHighlighted');
          pill.dataset.stakeFormatted='1';
        }
      });
    }
    count.textContent=cards.length?'Показано '+visible+' з '+cards.length:'';
    let empty=rooms.querySelector('.lobbyEmpty');
    if(cards.length&&visible===0){
      if(!empty){empty=document.createElement('div');empty.className='lobbyEmpty';empty.textContent='Столів за цим фільтром немає. Спробуй іншу ставку або покажи всі.';rooms.appendChild(empty)}
    }else empty?.remove();
    const wallet=document.querySelector('#lobby .walletCard b');
    if(wallet){
      const label=[...wallet.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(label&&label.textContent.includes('◉'))label.textContent=' грн';
    }
  }
  bar.addEventListener('click',event=>{
    const button=event.target.closest('.tableFilter');
    if(!button)return;
    mode=button.dataset.filter;
    bar.querySelectorAll('.tableFilter').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    paint();
  });
  input.addEventListener('input',paint);
  new MutationObserver(paint).observe(rooms,{childList:true});
  const balance=document.getElementById('myChips');
  if(balance)new MutationObserver(paint).observe(balance,{childList:true,characterData:true,subtree:true});
  paint();
})();
