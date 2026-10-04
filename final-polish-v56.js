import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.TRYNKA_CONFIG;if(!cfg)throw new Error('Missing config');
const sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function roomId(){try{const x=JSON.parse(sessionStorage.getItem('trynka_nav_state_v1')||'{}');return x.view==='game'&&x.roomId?Number(x.roomId):null}catch{return null}}
function mountRoundHistory(){
  const h=document.querySelector('#game .tableHistory h3');if(!h||$('roundHistoryBtn'))return;
  const b=document.createElement('button');b.id='roundHistoryBtn';b.className='roundHistoryBtn';b.textContent='Роздачі';h.appendChild(b);
  b.onclick=openRoundHistory;
}
function ensureHistoryDialog(){
  let d=$('roundHistoryDialog');if(d)return d;
  d=document.createElement('dialog');d.id='roundHistoryDialog';d.className='roundHistoryDialog';
  d.innerHTML='<div class="historyHead"><div><span class="eyebrow">TRYNKA TABLE</span><h2>Історія роздач</h2></div><button id="roundHistoryClose">×</button></div><div id="roundHistoryList"></div>';
  document.body.appendChild(d);$('roundHistoryClose').onclick=()=>d.close();return d;
}
async function openRoundHistory(){
  const rid=roomId();if(!rid)return;
  const d=ensureHistoryDialog(),box=$('roundHistoryList');
  box.innerHTML='<p class="historyLoading">Завантаження…</p>';d.showModal();
  const {data:rounds}=await sb.from('game_rounds').select('id,status,pot,dealer_fee,winner_id,result_note,created_at,finished_at').eq('room_id',rid).order('id',{ascending:false}).limit(10);
  if(!rounds?.length){box.innerHTML='<p>Роздач ще немає.</p>';return}
  box.innerHTML=rounds.map((r,i)=>'<button class="roundHistoryRow" data-round="'+r.id+'"><span>#'+r.id+' · '+new Date(r.created_at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+'</span><b>'+(r.status==='playing'?'Гра триває':esc(r.result_note||'Завершено'))+'</b><small>Банк '+Number(r.pot||0)+' ◉</small></button><div id="roundDetail'+r.id+'" class="roundDetail hide"></div>').join('');
  box.querySelectorAll('[data-round]').forEach(x=>x.onclick=()=>loadRound(Number(x.dataset.round)));
}
async function loadRound(id){
  const box=$('roundDetail'+id);if(!box)return;
  if(!box.classList.contains('hide')){box.classList.add('hide');return}
  const {data:a}=await sb.from('round_actions').select('action,amount,created_at,profiles(nickname)').eq('round_id',id).order('created_at',{ascending:true});
  const labels={ante:'вніс ставку',call:'дав',raise:'підняв',fold:'впав',reveal:'вскрився',timeout:'час вийшов',dark:'гра в темну',boil:'запропонував сварити'};
  box.innerHTML=(a||[]).map(x=>'<div><time>'+new Date(x.created_at).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</time><b>'+esc(x.profiles?.nickname||'Гравець')+'</b><span>'+esc(labels[x.action]||x.action)+(Number(x.amount||0)>0?' · '+Number(x.amount)+' ◉':'')+'</span></div>').join('')||'<p>Дій немає.</p>';
  box.classList.remove('hide');
}
function polishSpectator(){
  const game=$('game');if(!game)return;
  const spec=game.classList.contains('spectatorMode');
  let note=$('spectatorNotice');
  if(spec&&!note){
    note=document.createElement('div');note.id='spectatorNotice';note.className='spectatorNotice';note.textContent='👁 Ви спостерігаєте за столом — карти гравців приховані';
    document.querySelector('#game .tableWrap')?.prepend(note);
  } else if(!spec&&note) note.remove();
}
function mountFairHelp(){
  const b=$('fairDealBadge');if(!b||b.dataset.simpleHelp)return;
  b.dataset.simpleHelp='1';
  b.onclick=()=>alert('Чесна роздача означає: сервер зафіксував порядок колоди до початку гри. Після завершення браузер перевірив, що колода не була змінена.');
}
setInterval(()=>{mountRoundHistory();polishSpectator();mountFairHelp()},700);
mountRoundHistory();polishSpectator();mountFairHelp();
