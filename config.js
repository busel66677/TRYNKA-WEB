// Після створення Supabase-проєкту встав сюди 2 значення з Project Settings → API.
window.TRYNKA_CONFIG = {
  supabaseUrl: "https://oqyjypzltncbruzaxetp.supabase.co",
  supabaseAnonKey: "sb_publishable_PUAdJ6qJ6U8nf0UrK1FmKQ_PcyMEjIZ",
  // Sentry вмикається тільки після вставки DSN з Settings → Projects → Client Keys (DSN).
  sentryDsn: "",
  // 5% performance traces: достатньо для пошуку підвисань без зайвого навантаження.
  sentryTracesSampleRate: 0.05,
  // PostHog project token безпечний для клієнтського коду.
  posthogToken: "phc_vAvUV7y2XNZa4d8JAFNyK2zLZPBVrsuFkF55DLDsjprF",
  posthogHost: "https://eu.i.posthog.com"
};
// Окремий модуль тестового гравця. Завантажується після конфігурації.
import('./bot.js').catch(e=>console.error('BOT module:',e));
