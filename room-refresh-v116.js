/* v116: Coalesce bursts of room events, never postpone redraw forever. */
export function createCoalescedRefresh({
  onRefresh,
  setTimer=(fn,ms)=>setTimeout(fn,ms),
  clearTimer=id=>clearTimeout(id),
  minDelay=90,
  maxDelay=1200
}={}){
  if(typeof onRefresh!=='function')throw new TypeError('onRefresh required');
  let timer=null;
  return {
    request(delay=120){
      if(timer!==null)return false;
      const ms=Math.max(minDelay,Math.min(maxDelay,Number.isFinite(Number(delay))?Number(delay):120));
      timer=setTimer(()=>{timer=null;onRefresh()},ms);
      return true;
    },
    cancel(){
      if(timer!==null){clearTimer(timer);timer=null}
    },
    get pending(){return timer!==null}
  };
}
