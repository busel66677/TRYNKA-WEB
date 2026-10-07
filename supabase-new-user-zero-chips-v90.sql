-- TRYNKA v90: new users start with zero virtual chips.
-- Applied live on 2026-10-07.
alter table public.profiles
  alter column chips set default 0;

-- Existing balances are intentionally preserved.
-- private.handle_new_auth_user() inserts only id + nickname,
-- so every newly created profile now receives chips = 0 automatically.
