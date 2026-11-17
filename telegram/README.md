# TRYNKA Telegram Mini App preview

This branch preserves the existing TRYNKA-WEB frontend and serves it inside Telegram WebView using a small Node HTTP server. The Telegram WebApp SDK is injected into HTML responses. It does **not** yet authenticate Telegram users, implement authoritative multiplayer, or operate the Telegram bot.

Deploy the branch with the repository-root Dockerfile. Railway supplies PORT. Verify GET /health and the frontend before configuring the Mini App URL in BotFather.

Never commit a Telegram bot token. Once a secure backend is implemented, set the token through Railway environment secrets and verify Telegram initData server-side before trusting identity. Existing web login/game flow may need changes for Telegram.
