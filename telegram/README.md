# TRYNKA Telegram Mini App

This branch contains a separate Telegram Mini App at `/` while preserving the old TRYNKA-WEB website on `main`.

## Playable test-round milestone
- Bot-provided `initData` is HMAC-validated server-side for API requests (12h maximum age per WebView session).
- Eleven available seats per table; the first 2–4 seated players can start a test round.
- Server uses a cryptographically shuffled 36-card deck and privately deals three cards per participant.
- Turn actions: **ДАВ**, **ВПАВ**, **ВСКРИВСЯ**. Automatic fold after 30 seconds without a move.
- Showdown reveals cards and indicates winners. Rules currently use 666 > AAA > KKK > QQQ > JJJ > suit points; two aces count 22.
- The round bank is **simulation only**: no persistent chips or money are debited or awarded.
- Rounds and seat presence are in server memory; they reset when the Railway instance restarts. Keep one replica until durable multiplayer storage is implemented.

Deploy `telegram-miniapp` with `node telegram/server.mjs` and the repository Dockerfile. Railway provides PORT. `GET /health` checks that the app is running.

Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_AUTH_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` as Railway secrets. Never commit tokens or keys.

Next: integrate durable gameplay state, full betting-round/raise rules and the audited virtual-chip ledger, followed by concurrency and multi-device testing.

## Telegram club lobby and community chat

- The Telegram lobby now has a high-contrast, colorful play shortcut and shared-chat entry.
- Global chat persists in Supabase tables `telegram_global_chat` and `telegram_chat_mutes`; the database SQL is recorded in `telegram/schema-global-chat.sql` and has been applied.
- Chat API validates Telegram initData for every request; non-moderators never receive Telegram numeric IDs, client text is escaped with DOM text nodes, and send attempts are rate-limited (4 seconds).
- Admins can delete chat messages and mute/unmute users. The existing chip-adjustment RPC remains server-side and admin-guarded.
- Administrator dashboard displays Telegram player count, occupied seats, active tables and recent Telegram profiles.
- Chat updates by polling approximately every 4.5 seconds. There are no new external dependencies.

## Admin privacy

- The admin is publicly labeled `👑 Адмін` at a game seat and in the shared chat; the Telegram profile display name is not shown there.
- The public phone contact link and phone text are removed from the active Mini App page. Use the shared chat for in-app contact.
- The personal Telegram account privacy settings are independent from the Mini App. Existing contacts and older public Git history are not anonymized by this change.

## Invitations and quick entry

- The `ГРАТИ ЗАРАЗ` button now joins the lowest-stake occupied table with 1–3 participants, or the lowest available table when empty. The current test multiplayer supports up to four active players per round.
- Seated players can use `Запросити друга за цей стіл` to send a Telegram Mini App link (`https://t.me/TrynkaGameBot?startapp=table_1` etc.).
- Opening a valid `table_N` link automatically joins table N after Telegram authentication. Unknown/malformed start params are ignored and the referral `ref_N` start param is still handled by the referral API.
- Invites carry only the table number and virtual-chip stake. They do not reveal Telegram ID, phone number, or access tokens.
