import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
let busy=false,me=null,currentGame='lucky7';

const games={
  lucky7:{
    title:'LUCKY 7',sub:'Класичний автомат',icon:'7️⃣',className:'lucky7',
    demo:['🍒','🔔','7️⃣'],
    pay:[['7️⃣ 7️⃣ 7️⃣','×35'],['⭐ ⭐ ⭐','×15'],['🔔 🔔 🔔','×10'],['3 однакові','×7'],['2 однакові','ставка назад']],
    spinSymbols:['🍒','🍋','🔔','⭐','7️⃣']
  },
  fruit:{
    title:'FRUIT PARTY',sub:'Фруктовий автомат',icon:'🍉',className:'fruit',
    demo:['🍒','🍍','🍓'],
    pay:[['🍍 🍍 🍍','×20'],['🍓 🍓 🍓','×12'],['3 однакові','×8'],['2 однакові','ставка назад']],
    spinSymbols:['🍒','🍋','🍇','🍉','🍊','🍓','🥝','🍍']
  },
  royal:{
    title:'ROYAL JACKPOT',sub:'Найбільші множники',icon:'👑',className:'royal',
    demo:['💎','🏆','👑'],
    pay:[['👑 👑 👑','×50'],['💎 💎 💎','×25'],['🏆 🏆 🏆','×15'],['3 однакові','×10'],['2 однакові','ставка назад']],
    spinSymbols:['♠️','♦️','🦁','🏆','💎','👑']
  }
};

function mount(){
  const btn=$('homeSlots');if(!btn||btn.dataset.wired)return;
  btn.dataset.wired='1';btn.onclick=openSlots;
}
function ensureDialog(){
  let d=$('slotsDialog');if(d)return d;
  d=document.createElement('dialog');d.id='slotsDialog';d.className='slotsDialog slotsV68';
  d.innerHTML=`
    <div class="slotsShell">
      <div class="slotsHead"><div><span class="eyebrow">TRYNKA CASINO</span><h2>🎰 СЛОТИ</h2></div><button id="slotsClose">×</button></div>
      <div class="slotsBalance">Баланс <b><span id="slotsBalanceValue">0</span> ◉</b></div>
      <div class="slotGamePicker">
        <button data-game="lucky7"><span>7️⃣</span><b>Lucky 7</b><small>Класика · до ×35</small></button>
        <button data-game="fruit"><span>🍉</span><b>Fruit Party</b><small>Фрукти · до ×20</small></button>
        <button data-game="royal"><span>👑</span><b>Royal Jackpot</b><small>VIP · до ×50</small></button>
      </div>
      <div id="slotMachine" class="slotMachine">
        <div id="slotTop" class="slotTop"></div>
        <div class="slotJackpotStrip"><span>JACKPOT</span><b id="slotJackpotText">×35</b></div>
        <div class="reels">
          <div class="reel" id="slotR1">🍒</div>
          <div class="reel" id="slotR2">🔔</div>
          <div class="reel" id="slotR3">7️⃣</div>
        </div>
        <div id="slotResult" class="slotResult">Обери ставку і крути</div>
      </div>
      <div class="slotBets">
        <button data-bet="10" class="active">10 ◉</button><button data-bet="50">50 ◉</button><button data-bet="100">100 ◉</button><button data-bet="500">500 ◉</button>
      </div>
      <button id="slotSpin" class="slotSpin">🎰 КРУТИТИ · 10 ◉</button>
      <div id="slotPaytable" class="slotPaytable"></div>
      <div class="slotRecentWrap"><h3>Останні прокрути</h3><div id="slotRecent" class="slotRecent"></div></div>
      <small class="slotNote">Тільки внутрішні фішки TRYNKA. Під час гри за столом слоти недоступні.</small>
    </div>`;
  document.body.appendChild(d);
  $('slotsClose').onclick=()=>d.close();
  d.querySelectorAll('[data-bet]').forEach(b=>b.onclick=()=>selectBet(Number(b.dataset.bet)));
  d.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>selectGame(b.dataset.game));
  $('slotSpin').onclick=spin;
  selectGame('lucky7');
  return d;
}
function selectedBet(){return Number(document.querySelector('#slotsDialog [data-bet].active')?.dataset.bet||10)}
function selectBet(v){
  document.querySelectorAll('#slotsDialog [data-bet]').forEach(b=>b.classList.toggle('active',Number(b.dataset.bet)===v));
  $('slotSpin').textContent='🎰 КРУТИТИ · '+v+' ◉';
}
function selectGame(key){
  if(!games[key])return;
  currentGame=key;const g=games[key];
  document.querySelectorAll('#slotsDialog [data-game]').forEach(b=>b.classList.toggle('active',b.dataset.game===key));
  const machine=$('slotMachine');if(machine)machine.className='slotMachine '+g.className;
  $('slotTop').textContent=g.icon+' '+g.title+' · '+g.sub.toUpperCase();
  $('slotJackpotText').textContent=g.pay[0][1];
  [$('slotR1'),$('slotR2'),$('slotR3')].forEach((x,i)=>x.textContent=g.demo[i]);
  $('slotPaytable').innerHTML=g.pay.map(x=>'<span><b>'+x[0]+'</b><em>'+x[1]+'</em></span>').join('');
  $('slotResult').className='slotResult';$('slotResult').textContent='Обери ставку і крути';
}
function updateBalance(v){
  $('slotsBalanceValue').textContent=Number(v||0).toLocaleString('uk-UA');
  if($('myChips'))$('myChips').textContent=Number(v||0).toLocaleString('uk-UA');
}
async function loadRecent(){
  if(!me||!$('slotRecent'))return;
  const {data}=await sb.from('slot_spins').select('game,bet,reel1,reel2,reel3,net,created_at').eq('user_id',me.id).order('id',{ascending:false}).limit(6);
  $('slotRecent').innerHTML=(data||[]).map(x=>{
    const g=games[x.game]||games.lucky7;
    const net=Number(x.net||0);
    return '<div><span class="recentGame '+g.className+'">'+g.icon+'</span><b>'+x.reel1+' '+x.reel2+' '+x.reel3+'</b><em class="'+(net>0?'plus':net<0?'minus':'zero')+'">'+(net>0?'+':'')+net+' ◉</em></div>';
  }).join('')||'<small>Поки порожньо.</small>';
}
async function openSlots(){
  if(!me){const {data:{user}}=await sb.auth.getUser();me=user||null}if(!me)return;
  const d=ensureDialog();
  const {data:p}=await sb.from('profiles').select('chips').eq('id',me.id).maybeSingle();
  updateBalance(p?.chips||0);await loadRecent();
  d.showModal();
}
function flashWin(kind){
  const m=$('slotMachine');if(!m)return;
  m.classList.remove('hit','jackpotHit');void m.offsetWidth;
  m.classList.add(kind==='jackpot'?'jackpotHit':'hit');
  setTimeout(()=>m.classList.remove('hit','jackpotHit'),1200);
}
async function spin(){
  if(busy)return;
  const bet=selectedBet(),btn=$('slotSpin'),g=games[currentGame];
  busy=true;btn.disabled=true;
  const reels=[$('slotR1'),$('slotR2'),$('slotR3')];
  reels.forEach((x,i)=>{x.classList.add('spinning');x.style.animationDelay=(i*70)+'ms'});
  $('slotResult').className='slotResult';$('slotResult').textContent='Крутимо…';
  const timers=reels.map((r,i)=>setInterval(()=>r.textContent=g.spinSymbols[Math.floor(Math.random()*g.spinSymbols.length)],65+i*12));
  try{
    const {data,error}=await sb.rpc('play_slots',{p_bet:bet,p_game:currentGame});
    await new Promise(r=>setTimeout(r,900));
    timers.forEach(clearInterval);
    if(error)throw error;
    for(let i=0;i<3;i++){
      await new Promise(r=>setTimeout(r,140));
      reels[i].classList.remove('spinning');
      reels[i].textContent=data.reels[i];
    }
    updateBalance(data.balance);
    const mult=Number(data.multiplier||0),net=Number(data.net||0);
    if(data.jackpot){
      flashWin('jackpot');$('slotResult').className='slotResult jackpot';
      $('slotResult').textContent='💥 ДЖЕКПОТ ×'+mult+' · +'+net.toLocaleString('uk-UA')+' ◉';
    }else if(net>0){
      flashWin('win');$('slotResult').className='slotResult win';
      $('slotResult').textContent='🎉 ВИГРАШ ×'+mult+' · +'+net.toLocaleString('uk-UA')+' ◉';
    }else if(net===0){
      $('slotResult').className='slotResult push';$('slotResult').textContent='🙂 Ставка повернулась';
    }else{
      $('slotResult').className='slotResult lose';$('slotResult').textContent='Не зайшло 😄 −'+Math.abs(net).toLocaleString('uk-UA')+' ◉';
    }
    await loadRecent();
  }catch(e){
    timers.forEach(clearInterval);reels.forEach(x=>x.classList.remove('spinning'));
    $('slotResult').className='slotResult lose';$('slotResult').textContent=e?.message||'Помилка слотів';
  }finally{busy=false;btn.disabled=false}
}
async function init(){const {data:{user}}=await sb.auth.getUser();me=user||null;mount();setInterval(mount,3000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
