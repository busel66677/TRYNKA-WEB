-- TRYNKA v91 paid-support rules, synced from live Supabase 2026-10-07

CREATE OR REPLACE FUNCTION public.bot_take_turn(p_room bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  original_uid uuid;
  gr game_rounds%rowtype;
  rp round_players%rowtype;
  bot uuid;
  cards text[];
  score int:=0;
  need bigint:=0;
  chips_now bigint:=0;
  ante_now bigint:=10;
  max_bet bigint:=0;
  raise_to bigint:=null;
  roll double precision:=random();
  chosen text:='call';
begin
  original_uid:=auth.uid();

  if original_uid is null or not exists(
    select 1 from room_players where room_id=p_room and user_id=original_uid
  ) then
    raise exception 'Not in room';
  end if;

  select * into gr
  from game_rounds
  where room_id=p_room and status='playing'
  order by id desc limit 1
  for update;

  if not found then return 'none'; end if;

  bot:=gr.turn_user_id;
  if not exists(select 1 from profiles where id=bot and is_bot) then
    return 'human';
  end if;

  select * into rp
  from round_players
  where round_id=gr.id and user_id=bot
  for update;

  select rh.cards into cards
  from room_hands rh
  where rh.room_id=p_room and rh.user_id=bot;

  select coalesce(table_chips,0) into chips_now
  from room_players
  where room_id=p_room and user_id=bot
  for update;

  select ante,greatest(1,ante*100)
  into ante_now,max_bet
  from rooms
  where id=p_room;

  score:=coalesce(hand_score(cards),0);
  need:=greatest(1,gr.current_bet);

  -- Strategy based only on BOT's own cards, current price and round.
  if score>=100 then
    if gr.round_no>=2 and roll<0.18 then
      chosen:='reveal';
    elsif roll<0.62 then
      chosen:='raise';
    else
      chosen:='call';
    end if;

  elsif score>=29 then
    if gr.round_no>=2 and roll<0.20 then
      chosen:='reveal';
    elsif roll<0.50 then
      chosen:='raise';
    else
      chosen:='call';
    end if;

  elsif score>=22 then
    if gr.round_no>=2 and roll<0.13 then
      chosen:='fold';
    elsif gr.round_no>=2 and roll<0.29 then
      chosen:='reveal';
    elsif roll<0.43 then
      chosen:='raise';
    else
      chosen:='call';
    end if;

  else
    if need=0 then
      if gr.round_no>=2 and roll<0.18 then chosen:='fold';
      elsif roll<0.27 then chosen:='raise';
      else chosen:='call';
      end if;
    elsif need>greatest(ante_now,chips_now/4) then
      if gr.round_no>=2 and roll<0.56 then chosen:='fold';
      elsif gr.round_no>=2 and roll<0.74 then chosen:='reveal';
      else chosen:='call';
      end if;
    else
      if gr.round_no>=2 and roll<0.24 then chosen:='fold';
      elsif gr.round_no>=2 and roll<0.38 then chosen:='reveal';
      elsif roll<0.45 then chosen:='raise';
      else chosen:='call';
      end if;
    end if;
  end if;

  if chosen='raise' then
    raise_to:=least(
      max_bet,
      gr.current_bet+greatest(ante_now,gr.current_bet/2)
    );
    if raise_to<=gr.current_bet
       or chips_now<raise_to then
      chosen:=case
        when chips_now>=need then 'call'
        when gr.round_no>=2 then 'reveal'
        else 'fold'
      end;
      raise_to:=null;
    end if;
  end if;

  if chosen='call' and chips_now<need then
    chosen:=case when gr.round_no>=2 then 'reveal' else 'fold' end;
  end if;

  begin
    perform set_config('request.jwt.claim.sub',bot::text,true);
    perform public.play_round_action(
      p_room,
      chosen,
      case when chosen='raise' then raise_to else null end
    );
    perform set_config('request.jwt.claim.sub',original_uid::text,true);
  exception when others then
    perform set_config('request.jwt.claim.sub',original_uid::text,true);
    raise;
  end;

  return chosen||':score='||score;
end
$function$
;

CREATE OR REPLACE FUNCTION public.play_round_action(p_room bigint, p_action text, p_raise_to bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  gr game_rounds%rowtype;
  rp round_players%rowtype;
  need bigint:=0;
  stack_now bigint;
  nextu uuid;
  nextseat int;
  active_n int;
  wrap boolean:=false;
  prevu uuid;
  targetcards text[];
  actorcards text[];
  target_contrib bigint:=0;
  actor_after bigint:=0;
  pay_now bigint:=0;
  refund_target bigint:=0;
  refund_actor bigint:=0;
  max_bet bigint:=0;
  new_current_bet bigint:=0;
begin
  perform assert_not_banned();
  perform check_action_limit('game_action',30,60);

  select * into gr
  from game_rounds
  where room_id=p_room and status='playing'
  order by id desc limit 1
  for update;

  if not found then raise exception 'No active round'; end if;
  if gr.turn_user_id<>auth.uid() then raise exception 'Not your turn'; end if;

  select * into rp
  from round_players
  where round_id=gr.id and user_id=auth.uid()
  for update;

  if rp.folded then raise exception 'Already folded'; end if;

  select table_chips into stack_now
  from room_players
  where room_id=p_room and user_id=auth.uid()
  for update;

  select greatest(1,ante*100) into max_bet
  from rooms
  where id=p_room;

  if p_action in ('dark','boil') then
    raise exception 'Ця дія вимкнена';

  elsif p_action='fold' then
    update round_players set folded=true
    where round_id=gr.id and user_id=auth.uid();

    insert into round_actions(round_id,user_id,action)
    values(gr.id,auth.uid(),'fold');

  elsif p_action='call' then
    need:=greatest(1,gr.current_bet);

    if coalesce(stack_now,0)<need then
      raise exception 'На столі недостатньо монет. Потрібно: %. Можете вскритися з наявним стеком.',need;
    end if;

    if need>0 then
      update room_players
      set table_chips=table_chips-need
      where room_id=p_room and user_id=auth.uid();

      update round_players
      set contributed=contributed+need
      where round_id=gr.id and user_id=auth.uid();

      update game_rounds set pot=pot+need where id=gr.id;
    end if;

    insert into round_actions(round_id,user_id,action,amount)
    values(gr.id,auth.uid(),'call',need);

  elsif p_action='raise' then
    if p_raise_to is null or p_raise_to<=gr.current_bet then
      raise exception 'Raise must be higher';
    end if;

    if p_raise_to>max_bet then
      raise exception 'Максимальна ставка за цим столом: %',max_bet;
    end if;

    need:=p_raise_to;

    if need<=0 or coalesce(stack_now,0)<need then
      raise exception 'На столі недостатньо монет. Потрібно: %',greatest(0,need);
    end if;

    update room_players
    set table_chips=table_chips-need
    where room_id=p_room and user_id=auth.uid();

    update round_players
    set contributed=contributed+need
    where round_id=gr.id and user_id=auth.uid();

    update game_rounds
    set pot=pot+need,current_bet=p_raise_to
    where id=gr.id;

    insert into round_actions(round_id,user_id,action,amount)
    values(gr.id,auth.uid(),'raise',need);

  elsif p_action='reveal' then
    if gr.round_no<2 then raise exception 'Reveal is available from round 2'; end if;

    select user_id into prevu
    from round_players
    where round_id=gr.id and not folded and seat_no<rp.seat_no
    order by seat_no desc limit 1;

    if prevu is null then
      select user_id into prevu
      from round_players
      where round_id=gr.id and not folded and user_id<>auth.uid()
      order by seat_no desc limit 1;
    end if;

    if prevu is null then raise exception 'No player to reveal against'; end if;

    select rh.cards,rpt.contributed
    into targetcards,target_contrib
    from room_hands rh
    join round_players rpt
      on rpt.round_id=gr.id and rpt.user_id=rh.user_id
    where rh.room_id=p_room and rh.user_id=prevu;

    select cards into actorcards
    from room_hands
    where room_id=p_room and user_id=auth.uid();

    -- Reveal first matches the previous player's contribution.
    -- If the actor cannot fully match, the actor puts in the whole remaining
    -- table stack and the unmatched excess is returned to the other player.
    need:=greatest(0,target_contrib-rp.contributed);
    pay_now:=least(need,coalesce(stack_now,0));

    if pay_now>0 then
      update room_players
      set table_chips=table_chips-pay_now
      where room_id=p_room and user_id=auth.uid();

      update round_players
      set contributed=contributed+pay_now
      where round_id=gr.id and user_id=auth.uid();

      update game_rounds
      set pot=pot+pay_now
      where id=gr.id;
    end if;

    actor_after:=rp.contributed+pay_now;

    if target_contrib>actor_after then
      refund_target:=target_contrib-actor_after;

      update room_players
      set table_chips=table_chips+refund_target
      where room_id=p_room and user_id=prevu;

      update round_players
      set contributed=contributed-refund_target
      where round_id=gr.id and user_id=prevu;

      update game_rounds
      set pot=greatest(0,pot-refund_target)
      where id=gr.id;

      target_contrib:=actor_after;

    elsif actor_after>target_contrib then
      refund_actor:=actor_after-target_contrib;

      update room_players
      set table_chips=table_chips+refund_actor
      where room_id=p_room and user_id=auth.uid();

      update round_players
      set contributed=contributed-refund_actor
      where round_id=gr.id and user_id=auth.uid();

      update game_rounds
      set pot=greatest(0,pot-refund_actor)
      where id=gr.id;

      actor_after:=target_contrib;
    end if;

    update game_rounds
    set reveal_actor=auth.uid(),
        reveal_target=prevu,
        reveal_cards=targetcards,
        reveal_actor_cards=actorcards
    where id=gr.id;

    insert into round_actions(round_id,user_id,action,amount)
    values(gr.id,auth.uid(),'reveal',pay_now);

    update round_players
    set revealed=true
    where round_id=gr.id
      and user_id in (auth.uid(),prevu);

    if hand_score(actorcards)<hand_score(targetcards) then
      update round_players set folded=true
      where round_id=gr.id and user_id=auth.uid();
    elsif hand_score(actorcards)>hand_score(targetcards) then
      update round_players set folded=true
      where round_id=gr.id and user_id=prevu;
    else
      -- Equal reveal is a svara specifically between the two revealed players.
      -- Other seated players may join during the svara window for half the bank.
      declare
        v_svara_close timestamptz:=now()+interval '10 seconds';
        v_svara_fee bigint;
        v_room_name text;
        v_hist record;
        v_opp text[];
      begin
        select name into v_room_name from rooms where id=gr.room_id;
        v_svara_fee:=ceil((select pot from game_rounds where id=gr.id)/2.0)::bigint;

        update game_rounds
        set status='finished',winner_id=null,finished_at=now(),turn_user_id=null,result_note='Свара'
        where id=gr.id;

        delete from room_svara_members where room_id=gr.room_id;
        delete from room_svara_state where room_id=gr.room_id;

        insert into room_svara_state(room_id,source_round_id,original_pot,entry_fee,closes_at)
        select gr.room_id,gr.id,pot,v_svara_fee,v_svara_close from game_rounds where id=gr.id;

        insert into room_svara_members(room_id,user_id,source_round_id,auto_member,fee_paid)
        values
          (gr.room_id,auth.uid(),gr.id,true,0),
          (gr.room_id,prevu,gr.id,true,0);

        update rooms
        set game_status='waiting',countdown_started_at=null,deal_started_at=null,
            carried_pot=(select pot from game_rounds where id=gr.id),
            half_next=false,next_deal_at=v_svara_close
        where id=gr.room_id;

        for v_hist in select user_id from round_players where round_id=gr.id loop
          perform award_player_progress(v_hist.user_id,false);
          select array_agg(p.nickname) into v_opp
          from round_players rpx join profiles p on p.id=rpx.user_id
          where rpx.round_id=gr.id and rpx.user_id<>v_hist.user_id;
          insert into game_history(room_id,room_name,player_id,result,pot,chip_change,opponents)
          values(gr.room_id,v_room_name,v_hist.user_id,'draw',
                 (select pot from game_rounds where id=gr.id),0,coalesce(v_opp,'{}'));
        end loop;
      end;
      return;
    end if;

    -- current_bet is the amount required for each support action.
    -- Contributions are cumulative only for pot/accounting and do not create a free check.
    if refund_target>0 then
      insert into security_events(user_id,event_type,room_id,detail)
      values(prevu,'reveal_unmatched_refund',p_room,'refund='||refund_target||'; against='||auth.uid()::text);
    elsif refund_actor>0 then
      insert into security_events(user_id,event_type,room_id,detail)
      values(auth.uid(),'reveal_unmatched_refund',p_room,'refund='||refund_actor||'; against='||prevu::text);
    end if;

  else
    raise exception 'Invalid action';
  end if;

  select count(*) into active_n
  from round_players
  where round_id=gr.id and not folded;

  if active_n<=1 then
    select user_id into nextu
    from round_players
    where round_id=gr.id and not folded
    limit 1;

    perform finish_virtual_round(gr.id,nextu);
    return;
  end if;

  select user_id,seat_no into nextu,nextseat
  from round_players
  where round_id=gr.id and not folded and seat_no>rp.seat_no
  order by seat_no limit 1;

  if nextu is null then
    select user_id,seat_no into nextu,nextseat
    from round_players
    where round_id=gr.id and not folded
    order by seat_no limit 1;
    wrap:=true;
  end if;

  update game_rounds
  set turn_user_id=nextu,
      round_no=round_no+case when wrap then 1 else 0 end,
      turn_started_at=now()
  where id=gr.id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.start_virtual_round(p_room bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r rooms%rowtype;
  rid bigint;
  p record;
  n int;
  firstu uuid;
  dealeru uuid;
  next_dealer_seat int;
  stake bigint;
  initial_pot bigint;
  svara_active boolean:=false;
begin
  if auth.uid() is not null then
    perform assert_not_banned();
    if not exists(select 1 from room_players where room_id=p_room and user_id=auth.uid()) then
      raise exception 'Not in room';
    end if;
  end if;

  select * into r from rooms where id=p_room for update;
  if not found then raise exception 'Room not found'; end if;
  if r.game_status<>'playing' then raise exception 'Cards not ready'; end if;

  if exists(select 1 from game_rounds where room_id=p_room and status='playing') then
    select id into rid
    from game_rounds
    where room_id=p_room and status='playing'
    order by id desc limit 1;
    return rid;
  end if;

  select exists(
    select 1 from public.room_svara_state where room_id=p_room
  ) into svara_active;

  select count(*) into n
  from room_players rp
  where rp.room_id=p_room
    and rp.seat_no is not null
    and exists(
      select 1 from room_hands rh
      where rh.room_id=p_room and rh.user_id=rp.user_id
    );

  if n<2 then raise exception 'Need two seated players'; end if;

  stake:=case when svara_active then 0 else r.ante end;

  if stake>0 and exists(
    select 1
    from room_players rp
    where rp.room_id=p_room
      and rp.seat_no is not null
      and exists(
        select 1 from room_hands rh
        where rh.room_id=p_room and rh.user_id=rp.user_id
      )
      and rp.table_chips<stake
  ) then
    raise exception 'Not enough table chips for ante';
  end if;

  if r.dealer_seat is null then
    select min(rp.seat_no) into next_dealer_seat
    from room_players rp
    where rp.room_id=p_room
      and rp.seat_no is not null
      and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id);
  else
    select min(rp.seat_no) into next_dealer_seat
    from room_players rp
    where rp.room_id=p_room
      and rp.seat_no is not null
      and rp.seat_no>r.dealer_seat
      and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id);

    if next_dealer_seat is null then
      select min(rp.seat_no) into next_dealer_seat
      from room_players rp
      where rp.room_id=p_room
        and rp.seat_no is not null
        and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id);
    end if;
  end if;

  select rp.user_id into dealeru
  from room_players rp
  where rp.room_id=p_room
    and rp.seat_no=next_dealer_seat
    and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id);

  select rp.user_id into firstu
  from room_players rp
  where rp.room_id=p_room
    and rp.seat_no is not null
    and rp.seat_no>next_dealer_seat
    and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id)
  order by rp.seat_no
  limit 1;

  if firstu is null then
    select rp.user_id into firstu
    from room_players rp
    where rp.room_id=p_room
      and rp.seat_no is not null
      and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id)
    order by rp.seat_no
    limit 1;
  end if;

  initial_pot:=r.carried_pot+(stake*n);

  insert into game_rounds(
    room_id,pot,turn_user_id,current_bet,round_no,turn_started_at,
    dealer_seat,dealer_user_id,is_svara
  )
  values(
    p_room,initial_pot,firstu,greatest(1,r.ante),1,now(),
    next_dealer_seat,dealeru,svara_active
  )
  returning id into rid;

  for p in
    select rp.user_id,rp.seat_no
    from room_players rp
    where rp.room_id=p_room
      and rp.seat_no is not null
      and exists(select 1 from room_hands rh where rh.room_id=p_room and rh.user_id=rp.user_id)
    order by rp.seat_no
  loop
    if stake>0 then
      update room_players
      set table_chips=table_chips-stake
      where room_id=p_room and user_id=p.user_id;
    end if;

    insert into round_players(round_id,user_id,seat_no,contributed,svara_entry_paid)
    values(
      rid,p.user_id,p.seat_no,stake,
      case when svara_active then coalesce((
        select sm.fee_paid
        from public.room_svara_members sm
        where sm.room_id=p_room and sm.user_id=p.user_id
      ),0) else 0 end
    );

    if stake>0 then
      insert into round_actions(round_id,user_id,action,amount)
      values(rid,p.user_id,'ante',stake);
    end if;
  end loop;

  update rooms
  set carried_pot=0,
      half_next=false,
      dealer_seat=next_dealer_seat
  where id=p_room;

  if svara_active then
    delete from public.room_svara_members where room_id=p_room;
    delete from public.room_svara_state where room_id=p_room;
  end if;

  return rid;
end
$function$
;
