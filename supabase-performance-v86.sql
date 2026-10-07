-- TRYNKA production hardening applied 2026-10-07 (v86)
-- These indexes mirror the live Supabase performance fixes used by the game loop.
create index if not exists idx_game_rounds_active_room on public.game_rounds(room_id,id desc) where status='playing';
create index if not exists idx_game_rounds_turn_started on public.game_rounds(turn_started_at) where status='playing' and turn_user_id is not null;
create index if not exists idx_round_players_active_seat on public.round_players(round_id,seat_no) where folded=false;
create index if not exists idx_room_players_user_room on public.room_players(user_id,room_id);
create index if not exists idx_room_players_room_seated on public.room_players(room_id,seat_no) where seat_no is not null;
create index if not exists idx_room_svara_members_source on public.room_svara_members(source_round_id);
create index if not exists idx_chip_ledger_user_created on public.chip_ledger(user_id,created_at desc);
create index if not exists idx_chip_ledger_room on public.chip_ledger(room_id) where room_id is not null;
