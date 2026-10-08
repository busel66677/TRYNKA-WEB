/* v116: only derive hands from a server snapshot already authorized for
   either participant. Never read room_hands for another player. */
import {paintRevealedHands} from './revealed-hands-v99.js';

export function authorizedReveals(snapshot,viewerId){
  const g=snapshot?.round;
  if(!g||!viewerId||!g.reveal_actor||!g.reveal_target||
     (viewerId!==g.reveal_actor&&viewerId!==g.reveal_target))return [];
  if(g.status!=='finished'&&g.status!=='playing')return [];
  const players=new Set((snapshot.round_players||[]).map(p=>p.user_id));
  const valid=cards=>Array.isArray(cards)&&cards.length===3&&cards.every(c=>typeof c==='string'&&c.length>0);
  const actorCards=valid(g.reveal_actor_cards)?g.reveal_actor_cards:
    viewerId===g.reveal_actor&&valid(snapshot.my_hand)?snapshot.my_hand:null;
  const targetCards=valid(g.reveal_cards)?g.reveal_cards:
    viewerId===g.reveal_target&&valid(snapshot.my_hand)?snapshot.my_hand:null;
  const rows=[];
  if(players.has(g.reveal_actor)&&actorCards)rows.push({user_id:g.reveal_actor,cards:actorCards});
  if(players.has(g.reveal_target)&&targetCards)rows.push({user_id:g.reveal_target,cards:targetCards});
  return rows;
}
export function paintAuthorizedReveals(snapshot,viewerId){
  return paintRevealedHands(authorizedReveals(snapshot,viewerId));
}
