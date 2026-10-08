-- TRYNKA v113 — READ-ONLY diagnostic for the real server / staging database.
-- No INSERT, UPDATE, DELETE, EXECUTE, RPC, or test bets. Safe to rerun.
-- All counts are aggregate; no account or hand information is returned.
select
  (select count(*) from public.round_balance_checks) as audited_rounds,
  (select count(*) from public.round_balance_checks
   where not ok or delta<>0 or expected_pot<>actual_pot) as pot_mismatches,
  (select count(*) from public.game_rounds where pot<0) as negative_banks,
  (select count(*) from public.game_rounds
   where status='finished' and result_note='Перемога' and winner_id is null) as missing_winners,
  (select count(*) from public.game_rounds
   where status='playing' and turn_user_id is null) as missing_active_turns,
  (select count(*) from public.room_svara_state
   where entry_fee<0 or original_pot<0) as invalid_svara_entries,
  (select count(*) from public.rooms where carried_pot<0) as negative_carried_pots;

-- Server-only logic to verify on a SEPARATE staging database with two
-- test accounts. Do NOT execute transaction-writing gameplay RPC in prod:
--   * ante paid once, bank = carried_in + sum(contributed)
--   * raise bounded by 100x ante, call/fold can't act out of turn
--   * exact action nonce replay cannot charge twice
--   * reveal row visible only to involved players, cleared next deal
--   * svara entry charges half bank exactly once; automatic members pay zero
--   * packet loss after server charge cannot trigger client auto-retry
--   * timer expires/folds only on server; reconnect never rejoins same room
