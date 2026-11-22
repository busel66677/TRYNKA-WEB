/* TRYNKA v123 — Telegram one-screen game tools and in-table global chat. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = value => String(value == null ? '—' : value);
  // Telegram viewportHeight excludes native Telegram chrome more reliably than 100dvh.
  function syncViewportHeight(){
    const telegramHeight=Number(window.Telegram?.WebApp?.viewportHeight||0);
    const visualHeight=Number(window.visualViewport?.height||0);
    const innerHeight=Number(window.innerHeight||0);
    const heights=[telegramHeight,visualHeight,innerHeight].filter(v=>Number.isFinite(v)&&v>250);
    if(!heights.length)return;
    document.documentElement.style.setProperty('--tg-table-visible-height',Math.floor(Math.min(...heights))+'px');
  }
  syncViewportHeight();
  window.addEventListener('resize',syncViewportHeight,{passive:true});
  window.addEventListener('orientationchange',syncViewportHeight,{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewportHeight,{passive:true});
  window.Telegram?.WebApp?.onEvent?.('viewportChanged',syncViewportHeight);
  let chatOpen = false;
  let chatBusy = false;
  let chatLoading = false;
  const shade = document.createElement('div');
  shade.className = 'tg-chat-shade';
  shade.hidden = true;
  shade.setAttribute('role', 'presentation');
  const drawer = document.createElement('section');
  drawer.className = 'tg-chat-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Спільний чат гравців');
  const header = document.createElement('div');
  header.className = 'tg-chat-header';
  const heading = document.createElement('span');
  heading.textContent = '💬 Спільний чат TRYNKA';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label','Закрити чат');
  header.append(heading, close);
  const messages = document.createElement('div');
  messages.className = 'tg-chat-messages';
  messages.setAttribute('aria-live','polite');
  const hint = document.createElement('div');
  hint.className = 'tg-chat-hint';
  const form = document.createElement('form');
  form.className = 'tg-chat-compose';
  const input = document.createElement('input');
  input.maxLength = 300;
  input.placeholder = 'Повідомлення всім гравцям…';
  input.setAttribute('aria-label','Повідомлення чату');
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = '➤';
  form.append(input,send);
  drawer.append(header,messages,hint,form);
  shade.append(drawer);
  document.body.append(shade);
  function closeChat(){
    chatOpen = false;
    shade.hidden = true;
  }
  window.trynkaCloseTableChat=closeChat;
  close.addEventListener('click',closeChat);
  shade.addEventListener('click',event=>{if(event.target===shade)closeChat()});
  document.addEventListener('keydown',event=>{if(chatOpen&&event.key==='Escape')closeChat()});
  async function refreshChat(){
    if(!chatOpen||chatLoading||typeof window.apiPost!=='function')return;
    chatLoading=true;
    try{
      const data=await window.apiPost('/api/chat',{action:'list'});
      if(!chatOpen)return;
      const rows=Array.isArray(data.messages)?data.messages:[];
      const oldSignature=messages.dataset.signature||'';
      const signature=rows.map(m=>m.id).join(',');
      if(signature!==oldSignature){
        const atBottom=messages.scrollTop+messages.clientHeight>=messages.scrollHeight-75;
        messages.replaceChildren();
        if(!rows.length){
          const p=document.createElement('p');
          p.textContent='Повідомлень ще немає. Напиши першим!';
          messages.append(p);
        }
        for(const m of rows){
          const item=document.createElement('div');
          item.className='tg-chat-message';
          const name=document.createElement('b');
          name.textContent=(m.admin?'👑 ':'')+String(m.name||'Гравець')+':';
          const text=document.createElement('span');
          text.textContent=' '+String(m.text||'');
          item.append(name,text);
          messages.append(item);
        }
        messages.dataset.signature=signature;
        if(atBottom||!oldSignature)messages.scrollTop=messages.scrollHeight;
      }
      const muted=Boolean(data.mutedUntil&&Date.parse(data.mutedUntil)>Date.now());
      input.disabled=muted;
      send.disabled=muted||chatBusy;
      hint.textContent=muted?'Чат тимчасово обмежений для твого акаунта.':'Повідомлення бачать усі учасники клубу.';
    }catch(e){hint.textContent=e.message||'Не вдалося завантажити чат';}
    finally{chatLoading=false;}
  }
  async function openChat(){
    chatOpen=true;shade.hidden=false;
    hint.textContent='Завантажуємо…';
    await refreshChat();
    if(chatOpen&&!input.disabled)input.focus();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text||chatBusy||input.disabled)return;
    chatBusy=true;send.disabled=true;
    try{
      await window.apiPost('/api/chat',{action:'send',text});
      input.value='';
      messages.dataset.signature='';
      await refreshChat();
      hint.textContent='✓ Надіслано';
    }catch(e){hint.textContent=e.message||'Помилка надсилання';}
    finally{chatBusy=false;send.disabled=input.disabled;}
  });
  window.setInterval(()=>{if(chatOpen&&!document.hidden)refreshChat()},4500);
  function syncTools(){
    const active=document.body.classList.contains('trynka-in-table')
      &&!!document.querySelector('#detail:not([hidden]) .room');
    const top=document.querySelector('.top');
    if(!top)return;
    let wallet=document.querySelector('.tg-wallet');
    if(!wallet){
      wallet=document.createElement('div');
      wallet.className='tg-wallet';
      top.insertBefore(wallet,$('avatar')||null);
    }
    wallet.textContent='◈ '+num($('balance-value')?.textContent||'—');
    if(!active){
      if(wallet.parentElement!==top)top.insertBefore(wallet,$('avatar')||null);
      return;
    }
    const head=document.querySelector('#detail .room-head');
    if(!head)return;
    // One balance display, next to the table controls, not hidden behind Telegram chrome.
    if(wallet.parentElement!==head)head.append(wallet);
    let tools=head.querySelector('.tg-room-tools');
    if(tools)return;
    tools=document.createElement('div');
    tools.className='tg-room-tools';
    const invite=document.createElement('button');
    invite.type='button';invite.className='tg-tool-btn';
    invite.textContent='↗';
    invite.title='Запросити друга';
    invite.setAttribute('aria-label','Запросити друга за стіл');
    invite.onclick=()=>head.closest('.room')?.querySelector('.trynka-invite-btn')?.click();
    const chat=document.createElement('button');
    chat.type='button';chat.className='tg-tool-btn';
    chat.textContent='💬';
    chat.title='Чат';
    chat.setAttribute('aria-label','Відкрити спільний чат');
    chat.onclick=openChat;
    tools.append(invite,chat);
    head.append(tools);
  }
  window.trynkaTableEnter=()=>{
    syncTools();
    if(typeof window.loadAccount==='function')window.loadAccount().catch(()=>{});
  };
  const setup=()=>{
    syncTools();
    const list=$('table-list');
    if(list)new MutationObserver(syncTools).observe(list,{childList:true,subtree:false});
    const balance=$('balance-value');
    if(balance)new MutationObserver(syncTools).observe(balance,{childList:true,characterData:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
  window.setInterval(()=>{
    if(document.body.classList.contains('trynka-in-table')&&typeof window.loadAccount==='function')
      window.loadAccount().catch(()=>{});
  },40000);
})();