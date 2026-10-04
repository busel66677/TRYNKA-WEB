(()=>{
let deferredPrompt=null;
const btn=()=>document.getElementById('installAppBtn');
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid=()=>/android/i.test(navigator.userAgent);

function refresh(){
  const b=btn();if(!b)return;
  if(isStandalone()){
    b.classList.add('installed');
    b.querySelector('b').textContent='Додаток встановлено';
    b.querySelector('small').textContent='TRYNKA вже на цьому пристрої';
    b.disabled=true;
  }else{
    b.disabled=false;
  }
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  refresh();
});

window.addEventListener('appinstalled',()=>{
  deferredPrompt=null;
  refresh();
});

document.addEventListener('click',async e=>{
  const b=e.target.closest('#installAppBtn');if(!b)return;
  if(isStandalone())return;

  if(deferredPrompt){
    try{
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    }catch{}
    deferredPrompt=null;
    refresh();
    return;
  }

  if(isIOS()){
    alert('Щоб встановити TRYNKA:\n1. Натисни «Поділитися» в Safari.\n2. Обери «На початковий екран».\n3. Натисни «Додати».');
    return;
  }

  if(isAndroid()){
    alert('Щоб встановити TRYNKA:\n1. Відкрий меню браузера ⋮.\n2. Натисни «Встановити застосунок» або «Додати на головний екран».\n3. Підтверди встановлення.');
    return;
  }

  alert('Відкрий меню браузера та обери «Встановити застосунок» або «Додати на головний екран».');
});

document.addEventListener('DOMContentLoaded',refresh);
refresh();
})();