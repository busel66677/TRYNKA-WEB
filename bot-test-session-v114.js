/* TRYNKA v114 — explicit, one-room admin BOT test session.
   No recurring gameplay RPC is started until the admin clicks +BOT. */
export function createSoloBotSession({
  resolveRoom,
  runBotCycle,
  isVisible=()=>true,
  setIntervalFn=(fn,ms)=>setInterval(fn,ms),
  clearIntervalFn=id=>clearInterval(id),
  intervalMs=2600,
  onError=()=>{}
}={}){
  if(typeof resolveRoom!=='function'||typeof runBotCycle!=='function')
    throw new TypeError('resolveRoom and runBotCycle are required');
  let roomId=null, intervalId=null, busy=false, generation=0;
  const stop=()=>{
    generation++;
    roomId=null;
    if(intervalId!==null){clearIntervalFn(intervalId);intervalId=null;}
  };
  const tick=async()=>{
    if(roomId===null||busy)return;
    if(!isVisible()){stop();return;}
    const id=roomId,token=generation;
    busy=true;
    try{
      const memberRoom=await resolveRoom();
      if(generation!==token||roomId!==id)return;
      if(memberRoom!==id){stop();return;}
      await runBotCycle(id);
    }catch(error){
      if(generation===token)onError(error);
    }finally{
      busy=false;
    }
  };
  const start=id=>{
    const n=Number(id);
    if(!Number.isSafeInteger(n)||n<=0)throw new TypeError('Valid room required');
    if(roomId===n&&intervalId!==null)return;
    stop();
    roomId=n;
    intervalId=setIntervalFn(()=>{void tick();},intervalMs);
    void tick();
  };
  return {
    start,stop,tick,
    get roomId(){return roomId;},
    get active(){return roomId!==null&&intervalId!==null;}
  };
}
