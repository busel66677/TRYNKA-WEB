/* v113: keep accidental network retries from submitting a second chip action.
   Server remains authoritative; this module NEVER retries a bet. */
export function validateActionSnapshot(state, roomId, userId, action) {
  const round=state?.round, room=state?.room;
  if(!round || !room || Number(room.id)!==Number(roomId))
    return 'Не вдалося перевірити поточний стіл. Оновлюємо стан.';
  if(round.status!=='playing' || !round.id)
    return 'Роздача вже закінчилась або ще не почалася.';
  if(round.turn_user_id!==userId)
    return 'Зараз хід іншого гравця.';
  const me=state.round_players?.find(p=>p.user_id===userId);
  if(!me || me.folded)
    return 'У цій роздачі ви не можете зробити хід.';
  if(action==='reveal' && Number(round.round_no||1)<2)
    return 'Вскриватися можна від другого кола.';
  if(!['call','raise','fold','reveal'].includes(action))
    return 'Невідома дія.';
  return null;
}
export function uncertainActionError(error){
  if(!error)return false;
  const status=Number(error.status||0);
  const message=String(error.message||error).toLowerCase();
  const code=String(error.code||'');
  return !status || status>=500 || /fetch|network|offline|timed? ?out|abort|connection|gateway|socket|failed to send/i.test(message)
    || /^(08|57P|PGRST3)/.test(code);
}
export function actionResolvedBySnapshot(pending, state, userId) {
  if(!pending?.roomId || !state?.room || !state?.round)return false;
  if(Number(state.room.id)!==Number(pending.roomId))return false;
  const r=state.round;
  if(r.id!==pending.roundId || r.status!=='playing' || r.turn_user_id!==userId)return true;
  if(r.turn_started_at!==pending.turnStartedAt)return true;
  const mine=state.round_players?.find(p=>p.user_id===userId);
  return Boolean(mine?.folded);
}
export function pendingActionStorage(storage,key='trynka_action_pending_v1'){
  return {
    read(){
      try{
        const p=JSON.parse(storage?.getItem(key)||'null');
        if(!p || !Number.isFinite(Number(p.roomId)) || !Number.isFinite(Number(p.roundId))
          || typeof p.nonce!=='string' || !/^[0-9a-f-]{36}$/i.test(p.nonce))return null;
        return {...p,uncertain:true};
      }catch{return null;}
    },
    write(p){try{storage?.setItem(key,JSON.stringify(p));}catch{}},
    clear(){try{storage?.removeItem(key);}catch{}}
  };
}
