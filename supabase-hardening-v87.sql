-- TRYNKA v87 server hardening (applied live 2026-10-07)
-- Internal game-loop functions are server-only.
revoke execute on function public.deal_room_cards(bigint) from anon, authenticated, public;
revoke execute on function public.expire_round_turn(bigint) from anon, authenticated, public;
revoke execute on function public.server_advance_games() from anon, authenticated, public;
revoke execute on function public.cleanup_stale_table_players() from anon, authenticated, public;
revoke execute on function public.cleanup_abandoned_rooms() from anon, authenticated, public;
grant execute on function public.deal_room_cards(bigint) to postgres, service_role;
grant execute on function public.expire_round_turn(bigint) to postgres, service_role;
grant execute on function public.server_advance_games() to postgres, service_role;
grant execute on function public.cleanup_stale_table_players() to postgres, service_role;
grant execute on function public.cleanup_abandoned_rooms() to postgres, service_role;

-- IMPORTANT gameplay correction applied live:
-- An equal head-to-head REVEAL creates svara specifically for reveal_actor + reveal_target.
-- Other seated players are not auto-members; they may join during the window for entry_fee = ceil(pot/2).
