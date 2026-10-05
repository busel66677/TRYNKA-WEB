import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
let busy=false,me=null;
const symbols=['🍒','🍋','🔔','⭐','👑'];

function mount(){
  const btn=$('homeSlots');if(!btn||btn.dataset.wired)return;
  btn.dataset.wired='1';btn.onclick=openSlots;
}
function ensureDialog(){
  let d=$('slotsDialog');if(d)return d;
  d=document.createElement('dialog');d.id='slotsDialog';d.className='slotsDialog';
  d.innerHTML=`
    <div class="slotsShell">
      <div class="slotsHead"><div><span class="eyebrow">TRYNKA CASINO</span><h2>🎰 СЛОТИ</h2></div><button id="slotsClose">×</button></div>
      <div class="slotsBalance">Баланс <b><span id="slotsBalanceValue">0</span> ◉</b></div>
      <div class="slotMachine">
        <div class="slotTop">♠ TRYNKA JACKPOT ♠</div>
        <div class="reels">
          <div class="reel" id="slotR1">🍒</div>
          <div class="reel" id="slotR2">🔔</div>
          <div class="reel" id="slotR3">👑</div>
        </div>
        <div id="slotResult" class="slotResult">Обери ставку і крути</div>
      </div>
      <div class="slotBets">
        <button data-bet="10" class="active">10 ◉</button><button data-bet="50">50 ◉</button><button data-bet="100">100 ◉</button><button data-bet="500">500 ◉</button>
      </div>
      <button id="slotSpin" class="slotSpin">🎰 КРУТИТИ · 10 ◉</button>
      <div class="slotPaytable">
        <span><b>👑 👑 👑</b><em>×25</em></span>
        <span><b>3 однакові</b><em>×7</em></span>
        <span><b>2 однакові</b><em>ставка назад</em></span>
      </div>
      <small class="slotNote">Тільки внутрішні фішки TRYNKA. Під час гри за столом слоти недоступні.</small>
    </div>`;
  document.body.appendChild(d);
  $('slotsClose').onclick=()=>d.close();
  d.querySelectorAll('[data-bet]').forEach(b=>b.onclick=()=>selectBet(Number(b.dataset.bet)));
  $('slotSpin').onclick=spin;
  return d;
}
function selectedBet(){return Number(document.querySelector('#slotsDialog [data-bet].active')?.dataset.bet||10)}
function selectBet(v){
  document.querySelectorAll('#slotsDialog [data-bet]').forEach(b=>b.classList.toggle('active',Number(b.dataset.bet)===v));
  $('slotSpin').textContent='🎰 КРУТИТИ · '+v+' ◉';
}
function updateBalance(v){
  $('slotsBalanceValue').textContent=Number(v||0).toLocaleString('uk-UA');
  if($('myChips'))$('myChips').textContent=Number(v||0).toLocaleString('uk-UA');
}
async function openSlots(){
  if(!me){const {data:{user}}=await sb.auth.getUser();me=user||null}if(!me)return;
  const d=ensureDialog();
  const {data:p}=await sb.from('profiles').select('chips').eq('id',me.id).maybeSingle();
  updateBalance(p?.chips||0);
  $('slotResult').className='slotResult';$('slotResult').textContent='Обери ставку і крути';
  d.showModal();
}
async function spin(){
  if(busy)return;
  const bet=selectedBet(),btn=$('slotSpin');
  busy=true;btn.disabled=true;
  const reels=[$('slotR1'),$('slotR2'),$('slotR3')];
  reels.forEach(x=>x.classList.add('spinning'));
  $('slotResult').className='slotResult';$('slotResult').textContent='Крутимо…';
  let timer=setInterval(()=>reels.forEach(x=>x.textContent=symbols[Math.floor(Math.random()*symbols.length)]),80);
  try{
    const {data,error}=await sb.rpc('play_slots',{p_bet:bet});
    await new Promise(r=>setTimeout(r,850));
    clearInterval(timer);timer=null;
    if(error)throw error;
    reels.forEach((x,i)=>{x.classList.remove('spinning');x.textContent=data.reels[i]});
    updateBalance(data.balance);
    const mult=Number(data.multiplier||0),net=Number(data.net||0);
    if(mult>=25){
      $('slotResult').className='slotResult jackpot';
      $('slotResult').textContent='💥 ДЖЕКПОТ! +'+net.toLocaleString('uk-UA')+' ◉';
    }else if(net>0){
      $('slotResult').className='slotResult win';
      $('slotResult').textContent='🎉 ВИГРАШ +'+net.toLocaleString('uk-UA')+' ◉';
    }else if(net===0){
      $('slotResult').className='slotResult push';
      $('slotResult').textContent='🙂 Ставка повернулась';
    }else{
      $('slotResult').className='slotResult lose';
      $('slotResult').textContent='Не зайшло 😄 −'+Math.abs(net).toLocaleString('uk-UA')+' ◉';
    }
  }catch(e){
    if(timer)clearInterval(timer);
    reels.forEach(x=>x.classList.remove('spinning'));
    $('slotResult').className='slotResult lose';
    $('slotResult').textContent=e?.message||'Помилка слотів';
  }finally{
    busy=false;btn.disabled=false;
  }
}
async function init(){const {data:{user}}=await sb.auth.getUser();me=user||null;mount();setInterval(mount,3000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
