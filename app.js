const pages=[...document.querySelectorAll("main")];let turnSeconds=30,tick,currentBet=20,myBet=0,balance=1000,potValue=60;
const defaults=[{name:"Новачки",players:6,time:30,ante:10,chips:1000,now:3},{name:"Швидкий стіл",players:6,time:15,ante:20,chips:1000,now:4},{name:"Великий стіл",players:8,time:45,ante:50,chips:2000,now:5}];
let rooms=[...defaults];
function show(id){pages.forEach(p=>p.classList.add("hide"));document.getElementById(id).classList.remove("hide");scrollTo(0,0);if(id==="lobby")renderRooms()}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.page)));
function renderRooms(){const box=document.getElementById("rooms");box.innerHTML="";rooms.forEach((r,i)=>{const el=document.createElement("article");el.className="room";el.innerHTML=`<h3>${r.name}</h3><b>Анте ${r.ante} ◉</b><span>${r.now||1}/${r.players} гравців • ${r.time} сек/хід • старт ${r.chips} ◉${r.private?" • 🔒":""}</span>`;el.addEventListener("click",()=>startGame(r));box.appendChild(el)})}
privateRoom.addEventListener("change",()=>passwordWrap.classList.toggle("hide",!privateRoom.checked));
createForm.addEventListener("submit",e=>{e.preventDefault();const name=roomName.value.trim()||"Мій стіл";const r={name,players:+players.value,time:+turnTime.value,ante:+ante.value,chips:+chips.value,private:privateRoom.checked,now:1};rooms.unshift(r);startGame(r)});
function startGame(r){show("game");gameTitle.textContent=r.name+" • "+r.players+" гравців";turnSeconds=r.time;balance=r.chips;currentBet=r.ante;myBet=0;potValue=r.ante*3;update();resetCards();startTimer()}
function update(){balanceEl().textContent="Баланс: "+balance.toLocaleString("uk-UA")+" ◉";pot.textContent=potValue+" ◉";callValue.textContent=Math.max(0,currentBet-myBet)}
function balanceEl(){return document.getElementById("balance")}
function startTimer(){clearInterval(tick);let n=turnSeconds;timer.textContent=n;status.innerHTML=`Ваш хід • <i id="timer">${n}</i>с`;tick=setInterval(()=>{const t=document.getElementById("timer");if(!t)return clearInterval(tick);t.textContent=--n;if(n<=0){clearInterval(tick);status.textContent="Час вийшов — пас"}},1000)}
document.querySelectorAll("[data-act]").forEach(b=>b.addEventListener("click",()=>act(b.dataset.act)));
function act(a){if(a==="call"){const need=Math.max(0,currentBet-myBet);const pay=Math.min(need,balance);balance-=pay;myBet+=pay;potValue+=pay;status.textContent=pay?`Підтримано ${pay} ◉ без підвищення`:"Ставка вже зрівняна";update()}
if(a==="raise"){const target=currentBet+20,need=target-myBet,pay=Math.min(need,balance);balance-=pay;myBet+=pay;currentBet=myBet;potValue+=pay;status.textContent="Ставку піднято";update()}
if(a==="fold")status.textContent="Пас";
if(a==="reveal"){status.textContent="Вскриття з попереднім гравцем";revealAll()}
if(a!=="call"&&a!=="raise")clearInterval(tick)}
function resetCards(){document.querySelectorAll(".cover").forEach(c=>c.style.transform="translateY(0px)")}
function revealAll(){document.querySelectorAll(".cover").forEach(c=>c.style.transform="translateY(110%)")}
document.querySelectorAll(".peekCard").forEach(card=>{const cover=card.querySelector(".cover");let start=0,offset=0,drag=false;
card.addEventListener("pointerdown",e=>{drag=true;start=e.clientY;offset=parseFloat(cover.dataset.y||0);card.classList.add("dragging");card.setPointerCapture(e.pointerId)});
card.addEventListener("pointermove",e=>{if(!drag)return;const y=Math.max(0,Math.min(card.clientHeight,offset+(e.clientY-start)));cover.dataset.y=y;cover.style.transform=`translateY(${y}px)`});
function end(){if(!drag)return;drag=false;card.classList.remove("dragging");let y=parseFloat(cover.dataset.y||0);if(y<12)y=0;cover.dataset.y=y;cover.style.transform=`translateY(${y}px)`}
card.addEventListener("pointerup",end);card.addEventListener("pointercancel",end)});
rulesBtn.addEventListener("click",()=>rules.showModal());closeRules.addEventListener("click",()=>rules.close());renderRooms();