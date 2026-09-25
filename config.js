// Після створення Supabase-проєкту встав сюди 2 значення з Project Settings → API.
window.TRYNKA_CONFIG = {
  supabaseUrl: "https://oqyjypzltncbruzaxetp.supabase.co",
  supabaseAnonKey: "sb_publishable_PUAdJ6qJ6U8nf0UrK1FmKQ_PcyMEjIZ"
};
// Окремий модуль тестового гравця. Завантажується після конфігурації.
import('./bot.js').catch(e=>console.error('BOT module:',e));
