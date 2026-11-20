import { randomInt } from 'node:crypto';

// In-memory test rounds. Only the server deals and knows opponents' cards.
// Balances are deliberately untouched until a persistent, audited game ledger exists.
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const TURN_MS = 30000;
const RESTART_MS = 7000;
const MAX_PLAYERS = 4;

function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function scoreHand(hand) {
  const ranks = hand.map(c => c.rank);
  const triple = ranks.every(rank => rank === ranks[0]);
  const tr = ranks[0];
  const special = triple ? ({'6':[1000,'666'], 'A':[990,'Три тузи'], 'K':[980,'Три королі'], 'Q':[970,'Три дами'], 'J':[960,'Три валети']}[tr]) : null;
  if (special) return { value: special[0], label: special[1] };
  const points = rank => rank === 'A' ? 11 : ['10','J','Q','K'].includes(rank) ? 10 : Number(rank);
  const totals = SUITS.map(suit => hand.filter(c => c.suit === suit).reduce((sum, c) => sum + points(c.rank), 0));
  const acePair = ranks.filter(rank => rank === 'A').length >= 2 ? 22 : 0;
  const value = Math.max(acePair, ...totals);
  return { value, label: value + ' очок' };
}

export function createGameApi({ seats, stakes, validate, readPayload, json }) {
  const rounds = new Map();
  let sequence = 0;

  function isPresent(player, table) {
    const current = seats.get(player.id);
    return current && current.table === table;
  }
  function surviving(round) { return round.players.filter(p => !p.folded); }

  function finish(round, why) {
    if (round.status !== 'playing') return;
    round.status = 'finished';
    round.finishedAt = Date.now();
    round.turn = -1;
    round.reason = why;
    const active = surviving(round);
    const scores = active.map(p => ({ id: p.id, score: scoreHand(p.cards).value }));
    const best = Math.max(...scores.map(s => s.score));
    round.winners = scores.filter(s => s.score === best).map(s => s.id);
  }
  function advance(round) {
    if (surviving(round).length <= 1) { finish(round, 'Залишився один гравець'); return; }
    for (let n = 1; n <= round.players.length; n++) {
      const next = (round.turn + n) % round.players.length;
      const p = round.players[next];
      if (!p.folded && !p.acted) {
        round.turn = next;
        round.turnEndsAt = Date.now() + TURN_MS;
        return;
      }
    }
    finish(round, 'Вскриття карт');
  }
  function tick(round) {
    if (!round || round.status !== 'playing') return;
    for (const p of round.players) {
      if (!isPresent(p, round.table)) { p.folded = true; p.acted = true; }
    }
    if (surviving(round).length <= 1) { finish(round, 'Гравці вийшли зі столу'); return; }
    // A timed-out player automatically folds; this also resolves disconnected players.
    if (Date.now() >= round.turnEndsAt) {
      const p = round.players[round.turn];
      if (p && !p.acted) { p.folded = true; p.acted = true; }
      advance(round);
    } else {
      const p = round.players[round.turn];
      if (!p || p.folded || p.acted) advance(round);
    }
  }
  function view(round, userId, table) {
    if (!round) return { table, status: 'waiting', seated: [...seats.values()].filter(p => p.table === table).length, maxPlayers: MAX_PLAYERS };
    const finished = round.status === 'finished';
    const player = round.players[round.turn];
    return {
      table, status: round.status, roundId: round.id,
      pot: round.pot, stake: round.stake, turnEndsAt: round.turnEndsAt,
      dealStartedAt: round.dealStartedAt, finishedAt: round.finishedAt,
      nextRoundAt: finished ? round.finishedAt + RESTART_MS : null,
      reason: finished ? round.reason : null,
      myTurn: round.status === 'playing' && player?.id === userId,
      turnSeat: round.status === 'playing' ? player?.seat : null,
      winners: finished ? round.players.filter(p => round.winners.includes(p.id)).map(p => p.seat) : [],
      maxPlayers: MAX_PLAYERS,
      players: round.players.map(p => ({
        seat: p.seat, name: p.name, folded: p.folded, acted: p.acted,
        cards: finished || p.id === userId ? p.cards : null,
        result: finished && !p.folded ? scoreHand(p.cards).label : null,
        winner: finished && round.winners.includes(p.id)
      }))
    };
  }

  return async function gameApi(req, res) {
    let data, user;
    try {
      data = await readPayload(req);
      user = validate(data.initData, process.env.TELEGRAM_BOT_TOKEN || '');
    } catch {
      return json(res, 401, { error: 'Telegram-сесія недійсна. Відкрийте гру заново.' });
    }
    const table = Number(data.table);
    if (!Number.isInteger(table) || table < 1 || table > stakes.length) {
      return json(res, 400, { error: 'Невірний номер столу' });
    }
    const id = String(user.id);
    const seat = seats.get(id);
    if (!seat || seat.table !== table) return json(res, 409, { error: 'Спершу займіть місце за столом' });
    let round = rounds.get(table);
    tick(round);
    const action = data.action;
    if (action === 'state') return json(res, 200, view(round, id, table));
    if (action === 'start') {
      if (round?.status === 'playing') return json(res, 409, { error: 'Роздача вже триває' });
      if (round?.status === 'finished' && Date.now() < round.finishedAt + RESTART_MS) {
        return json(res, 409, { error: 'Дочекайтеся завершення попередньої роздачі' });
      }
      const entries = [...seats.entries()].filter(([, p]) => p.table === table)
        .sort((a,b) => a[1].seat - b[1].seat).slice(0, MAX_PLAYERS);
      if (entries.length < 2) return json(res, 409, { error: 'Для гри потрібно щонайменше двоє' });
      if (!entries.some(([uid]) => uid === id)) return json(res, 403, { error: 'Ця роздача доступна першим чотирьом гравцям' });
      const deck = makeDeck();
      const players = entries.map(([uid,p]) => ({
        id: uid, seat: p.seat, name: p.name, cards: [deck.pop(), deck.pop(), deck.pop()],
        folded: false, acted: false
      }));
      round = {
        id: ++sequence, table, status: 'playing', dealStartedAt: Date.now(), stake: stakes[table - 1],
        pot: stakes[table - 1] * players.length, players, turn: 0,
        turnEndsAt: Date.now() + TURN_MS, winners: [], reason: null, finishedAt: null
      };
      rounds.set(table, round);
      return json(res, 200, view(round, id, table));
    }
    if (!['call', 'fold', 'reveal'].includes(action)) return json(res, 400, { error: 'Невідома дія' });
    if (!round || round.status !== 'playing') return json(res, 409, { error: 'Наразі немає активної роздачі' });
    const me = round.players[round.turn];
    if (!me || me.id !== id) return json(res, 403, { error: 'Зараз не ваш хід' });
    if (me.folded || me.acted) return json(res, 409, { error: 'Хід уже зроблено' });
    me.acted = true;
    if (action === 'fold') me.folded = true;
    if (action === 'call') round.pot += round.stake;
    if (action === 'reveal') finish(round, 'Вскриття за вимогою гравця');
    else advance(round);
    return json(res, 200, view(round, id, table));
  };
}
