-- Telegram global chat (server API only). Applied to TRYNKA-ONLINE.
create table if not exists public.telegram_global_chat (
  id bigint generated always as identity primary key,
  sender_id bigint not null check (sender_id > 0),
  sender_name text not null check (char_length(sender_name) between 1 and 32),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists telegram_global_chat_recent_idx
  on public.telegram_global_chat (created_at desc, id desc) where deleted_at is null;
create index if not exists telegram_global_chat_sender_idx
  on public.telegram_global_chat (sender_id, created_at desc);
create table if not exists public.telegram_chat_mutes (
  telegram_id bigint primary key check (telegram_id > 0),
  muted_until timestamptz not null,
  moderated_at timestamptz not null default now(),
  moderated_by bigint not null check (moderated_by > 0)
);
alter table public.telegram_global_chat enable row level security;
alter table public.telegram_chat_mutes enable row level security;
revoke all privileges on table public.telegram_global_chat, public.telegram_chat_mutes from public, anon, authenticated;
revoke all privileges on sequence public.telegram_global_chat_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.telegram_global_chat, public.telegram_chat_mutes to service_role;
grant usage, select on sequence public.telegram_global_chat_id_seq to service_role;
