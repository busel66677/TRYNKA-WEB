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
