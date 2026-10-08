const $=id=>document.getElementById(id);

let lastFinishedKey='';
let toastTimer=null;

function actionButtons(){
  const labels={call:'ПІДТРИМАТИ',raise:'ПІДНЯТИ',reveal:'ВСКРИТИСЯ',fold:'ПАС'};
  Object.entries(labels).forEach(([action,label])=>{
    const b=document.querySelector('#gameActions [data-action="'+action+'"]');
    if(b&&b.textContent!==label)b.textContent=label;
  });
}

function ensureRoundToast(){
  const table=document.querySelector('#game .table');
  if(!table)return null;
  let toast=$('premiumRoundToast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='premiumRoundToast';
    toast.className='premiumRoundToast';
    toast.innerHTML='<b></b><span></span>';
    table.appendChild(toast);
  }
  return toast;
}
function showRoundToast(title,sub=''){
  const toast=ensureRoundToast();if(!toast)return;
  toast.querySelector('b').textContent=title;
  toast.querySelector('span').textContent=sub;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
}

function syncSeatState(snapshot){
  const round=snapshot?.round;
  const rp=new Map((snapshot?.round_players||[]).map(x=>[x.user_id,x]));
  document.querySelectorAll('#game #seats .seat').forEach(seat=>{
    const uid=seat.dataset.userId||'';
    const state=rp.get(uid);
    seat.classList.toggle('premiumTurn',!!uid&&round?.status==='playing'&&round?.turn_user_id===uid);
    seat.classList.toggle('premiumFolded',!!state?.folded);
    seat.classList.toggle('premiumWinner',!!uid&&round?.status==='finished'&&round?.winner_id===uid);
  });

  if(round?.status==='finished'&&round?.finished_at){
    const key=String(round.id)+'|'+String(round.finished_at);
    if(key!==lastFinishedKey){
      lastFinishedKey=key;
      const winner=(snapshot.players||[]).find(p=>p.user_id===round.winner_id);
      if(round.result_note==='Свара'){
        showRoundToast('СВАРА','Банк переходить у наступну роздачу');
      }else if(round.winner_id){
        showRoundToast((winner?.nickname||'Гравець')+' ПЕРЕМІГ','Банк '+Number(round.pot||0).toLocaleString('uk-UA')+' ◉');
      }else{
        showRoundToast(round.result_note||'РОЗДАЧУ ЗАВЕРШЕНО');
      }
    }
  }
}

function ensureMenu(){
  const host=document.querySelector('#game .gameTopActions');
  const bar=document.querySelector('#game .gameTop');
  if(!host||!bar)return;

  let btn=$('premiumMoreBtn');
  let menu=$('premiumGameMenu');
  if(!btn){
    btn=document.createElement('button');
    btn.id='premiumMoreBtn';
    btn.type='button';
    btn.className='premiumMoreBtn';
    btn.setAttribute('aria-label','Меню столу');
    btn.textContent='⋮';
    host.appendChild(btn);
  }
  if(!menu){
    menu=document.createElement('div');
    menu.id='premiumGameMenu';
    menu.className='premiumGameMenu hide';
    bar.appendChild(menu);
    btn.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      menu.classList.toggle('hide');
      btn.setAttribute('aria-expanded',String(!menu.classList.contains('hide')));
    };
    document.addEventListener('click',e=>{
      if(!menu.contains(e.target)&&e.target!==btn){
        menu.classList.add('hide');
        btn.setAttribute('aria-expanded','false');
      }
    });
  }

  const candidates=[
    [$('inviteBtn'),'👥 Запросити друга'],
    [$('addTestBot'),'🤖 Додати BOT'],
    [$('diagTableBtn'),'🩺 Діагностика']
  ];
  candidates.forEach(([el,label])=>{
    if(!el||el.parentElement===menu)return;
    el.textContent=label;
    menu.appendChild(el);
  });
  // v105: legacy owner/spectator/rules/reaction controls were appended as a
  // loose extra flex item to the game header and fell *behind* the table.
  // Keep their original buttons and event listeners; move the existing node
  // into this accessible dropdown instead of cloning or hiding the controls.
  const extras=$('tableExtras');
  if(extras&&extras.parentElement!==menu)menu.appendChild(extras);
  btn.setAttribute('aria-expanded',String(!menu.classList.contains('hide')));

}

function cleanExtraUi(){
  document.querySelectorAll('#game .uxRoundResult').forEach(x=>x.remove());
}

function applyPremium(){
  if($('game')?.classList.contains('hide'))return;
  actionButtons();
  ensureMenu();
  ensureRoundToast();
  cleanExtraUi();
}

document.addEventListener('trynka:room-snapshot',e=>{
  applyPremium();
  syncSeatState(e.detail);
});
document.addEventListener('trynka:game-state',e=>{
  applyPremium();
  syncSeatState(e.detail);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyPremium()});

const observer=new MutationObserver(()=>applyPremium());
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    applyPremium();
    const game=$('game');if(game)observer.observe(game,{childList:true,subtree:true});
  });
}else{
  applyPremium();
  const game=$('game');if(game)observer.observe(game,{childList:true,subtree:true});
}
