// Server-side global chat for verified Telegram Mini App sessions.
// Messages are persisted in Supabase. The browser never receives a service-role key.
const LIMIT = 60;
const COOLDOWN_MS = 4000;
const MAX_BODY = 300;

export function createChatApi({ readPayload, json, validate, sb, adminId }) {
  const errorText = e => String(e?.message || e || 'Помилка чату').slice(0,160);
  const safeId = value => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  };
  const isModerator = user => Number(user.id) === adminId;
  const safeName = user => (String(user.first_name || user.username || 'Гравець').trim() || 'Гравець').slice(0,32);

  async function muteUntil(userId) {
    const rows = await sb('/rest/v1/telegram_chat_mutes?telegram_id=eq.' + userId + '&select=muted_until&limit=1');
    return rows?.[0]?.muted_until || null;
  }
  return async (req, res) => {
    let data, user;
    try {
      data = await readPayload(req);
      user = validate(data.initData, process.env.TELEGRAM_BOT_TOKEN || '');
    } catch {
      return json(res, 401, { error: 'Увійди через Telegram і спробуй ще раз' });
    }
    const moderator = isModerator(user);
    const me = safeId(user.id);
    if (!me) return json(res, 401, { error: 'Невірний Telegram ID' });
    try {
      const action = String(data.action || '');
      if (action === 'list') {
        const [records, muted] = await Promise.all([
          sb('/rest/v1/telegram_global_chat?select=id,sender_id,sender_name,body,created_at&deleted_at=is.null&order=created_at.desc,id.desc&limit=' + LIMIT),
          muteUntil(me)
        ]);
        const messages = records.slice().reverse().map(row => ({
          id: row.id, name: row.sender_name, text: row.body, at: row.created_at,
          mine: Number(row.sender_id) === me, admin: Number(row.sender_id) === adminId,
          ...(moderator ? { senderId: Number(row.sender_id) } : {})
        }));
        return json(res, 200, { messages, moderator, mutedUntil: muted && Date.parse(muted) > Date.now() ? muted : null });
      }
      if (action === 'send') {
        const content = String(data.text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
        if (content.length < 1 || content.length > MAX_BODY) return json(res, 400, { error: 'Повідомлення має містити від 1 до 300 символів' });
        const muted = await muteUntil(me);
        if (muted && Date.parse(muted) > Date.now()) return json(res, 403, { error: 'Чат тимчасово обмежено до ' + new Date(muted).toLocaleString('uk-UA') });
        const recent = await sb('/rest/v1/telegram_global_chat?sender_id=eq.' + me + '&select=created_at&order=created_at.desc&limit=1');
        if (recent.length && Date.now() - Date.parse(recent[0].created_at) < COOLDOWN_MS) {
          return json(res, 429, { error: 'Не частіше одного повідомлення за 4 секунди' });
        }
        const rows = await sb('/rest/v1/telegram_global_chat', {
          method: 'POST', headers: { Prefer:'return=representation' },
          body: JSON.stringify({ sender_id: me, sender_name: safeName(user), body: content })
        });
        return json(res, 200, { ok:true, id: rows?.[0]?.id || null });
      }
      if (!moderator) return json(res, 403, { error: 'Дія лише для адміністратора' });
      if (action === 'delete') {
        const messageId = safeId(data.messageId);
        if (!messageId) return json(res, 400, { error: 'Невірний ID повідомлення' });
        await sb('/rest/v1/telegram_global_chat?id=eq.' + messageId + '&deleted_at=is.null', {
          method: 'PATCH', headers: { Prefer:'return=minimal' },
          body: JSON.stringify({ deleted_at: new Date().toISOString() })
        });
        return json(res, 200, { ok:true });
      }
      if (action === 'mute') {
        const targetId = safeId(data.targetId);
        const seconds = Number(data.seconds);
        if (!targetId || targetId === adminId || ![600,3600,86400].includes(seconds)) {
          return json(res, 400, { error: 'Невірний гравець або час блокування' });
        }
        await sb('/rest/v1/telegram_chat_mutes?on_conflict=telegram_id', {
          method:'POST', headers: { Prefer:'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ telegram_id: targetId, muted_until: new Date(Date.now()+seconds*1000).toISOString(), moderated_by: me, moderated_at: new Date().toISOString() })
        });
        return json(res, 200, { ok:true });
      }
      if (action === 'unmute') {
        const targetId = safeId(data.targetId);
        if (!targetId || targetId === adminId) return json(res, 400, { error: 'Невірний ID гравця' });
        await sb('/rest/v1/telegram_chat_mutes?telegram_id=eq.' + targetId, { method:'DELETE' });
        return json(res, 200, { ok:true });
      }
      return json(res, 400, { error: 'Невідома дія чату' });
    } catch (e) {
      console.error('Chat API:', errorText(e));
      return json(res, 503, { error: 'Чат тимчасово недоступний. Спробуй пізніше.' });
    }
  };
}
