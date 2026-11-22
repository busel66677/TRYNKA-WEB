import { randomInt } from 'node:crypto';

// In-memory test rounds. Only the server deals and knows opponents' cards.
// Balances are deliberately untouched until a persistent, audited game ledger exists.
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const TURN_MS = 30000;
const RESTART_MS = 7000;
const READY_DELAY_MS = 5000;
const MAX_PLAYERS = 4;
const BOT_THINK_MS = 1100;
const BOT_NAME = '🤖 Тест-бот';

function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function scoreWithoutJoker(hand) {
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

// Валет піки — єдиний джокер. Підстановка визначається лише на сервері.
export function scoreHand(hand) {
  if (!Array.isArray(hand) || hand.length !== 3) throw Error('Invalid hand');
  const jokerIndex = hand.findIndex(card => card.rank === 'J' && card.suit === '♠');
  if (jokerIndex < 0) return scoreWithoutJoker(hand);
  let best = null;
  for (const suit of SUITS) for (const rank of RANKS) {
    const replacement = hand.map((card, i) => i === jokerIndex ? {rank, suit} : card);
    const score = scoreWithoutJoker(replacement);
    if (!best || score.value > best.value) best = score;
  }
  return {value: best.value, label: best.label + ' · джокер J♠'};
}

export function createGameApi({ seats, stakes, validate, readPayload, json, adminId }) {
  const rounds = new Map();
  const readyByTable = new Map();
  let sequence = 0;

  function readyState(table) {
    let state = readyByTable.get(table);
    if (!state) {state = {ids: new Set(), endsAt: null};readyByTable.set(table, state);}
    for (const id of state.ids) if (seats.get(id)?.table !== table) state.ids.delete(id);
    // Testing bots auto-ready every round; a real player still presses "Готово".
    for (const [id, p] of seats) {
      if (p.table === table && p.isBot === true) state.ids.add(id);
    }
    if (state.ids.size < 2) state.endsAt = null;
    return state;
  }
  function ownedBotEntries(table, ownerId) {
    return [...seats.entries()].filter(([,p]) => p.table === table && p.isBot === true && p.ownerId === ownerId);
  }
  function testBotCount(table, ownerId) {
    return ownedBotEntries(table, ownerId).length;
  }
  function waitingView(table, userId) {
    const state = readyState(table);
    return {
      table, status: 'waiting',
      seated: [...seats.values()].filter(p => p.table === table).length,
      maxPlayers: MAX_PLAYERS, readyCount: state.ids.size,
      readySeats: [...state.ids].map(id => seats.get(id)?.seat).filter(Boolean),
      myReady: state.ids.has(userId), readyEndsAt: state.endsAt,
      testBotCount: testBotCount(table, userId)
    };
  }
  function startRound(table, entries) {
    const deck = makeDeck();
    const players = entries.slice(0, MAX_PLAYERS).map(([uid,p]) => ({
      id: uid, seat: p.seat, name: p.name, isBot: p.isBot === true,
      cards: [deck.pop(), deck.pop(), deck.pop()], folded: false, acted: false,
      contributed: stakes[table - 1], lastAction: 'ante'
    }));
    const round = {
      id: ++sequence, table, status: 'playing', dealStartedAt: Date.now(),
      stake: stakes[table - 1], pot: stakes[table - 1] * players.length,
      players, turn: 0, turnEndsAt: Date.now() + TURN_MS,
      turnStartedAt: Date.now(),
      winners: [], payouts: [], actionLog: [], reason: null, finishedAt: null
    };
    readyByTable.delete(table);
    rounds.set(table, round);
    return round;
  }
  function maybeStartReady(table) {
    const state = readyState(table);
    if (state.endsAt === null || Date.now() < state.endsAt) return null;
    const entries = [...seats.entries()].filter(([id,p]) => p.table === table && state.ids.has(id))
      .sort((a,b) => a[1].seat - b[1].seat).slice(0, MAX_PLAYERS);
    if (entries.length < 2) {state.endsAt = null;return null;}
    return startRound(table, entries);
  }

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
    // Deterministic integer split: everyone sees the same payouts.
    // These are TEST bank allocations; no account balance is credited.
    const winners = round.players.filter(p => round.winners.includes(p.id))
      .sort((a,b)=>a.seat-b.seat);
    const base = winners.length ? Math.floor(round.pot / winners.length) : 0;
    const extra = winners.length ? round.pot % winners.length : 0;
    round.payouts = winners.map((p,i)=>({
      seat:p.seat, name:p.name, amount:base+(i<extra?1:0)
    }));
  }
  function recordAction(round, player, type, amount=0) {
    player.lastAction = type;
    const event = {seat:player.seat, name:player.name, type, amount, at:Date.now()};
    round.actionLog.push(event);
    if(round.actionLog.length>16)round.actionLog.shift();
  }
  function addContribution(round,player,amount) {
    round.pot += amount;
    player.contributed += amount;
  }
  function advance(round) {
    if (surviving(round).length <= 1) { finish(round, 'Залишився один гравець'); return; }
    for (let n = 1; n <= round.players.length; n++) {
      const next = (round.turn + n) % round.players.length;
      const p = round.players[next];
      if (!p.folded && !p.acted) {
        round.turn = next;
        round.turnStartedAt = Date.now();
        round.turnEndsAt = Date.now() + TURN_MS;
        return;
      }
    }
    finish(round, 'Вскриття карт');
  }
  function tick(round) {
    if (!round || round.status !== 'playing') return;
    for (const p of round.players) {
      if (!isPresent(p, round.table) && !p.folded) { p.folded = true; p.acted = true; recordAction(round,p,'disconnect',0); }
    }
    if (surviving(round).length <= 1) { finish(round, 'Гравці вийшли зі столу'); return; }
    // One server-controlled bot action after a short thinking delay.
    // The same turn state as human play is used; never give the bot a bypass.
    const p = round.players[round.turn];
    if (!p || p.folded || p.acted) { advance(round); return; }
    if (Date.now() >= round.turnEndsAt) {
      p.folded = true;
      p.acted = true;
      recordAction(round,p,'timeout',0);
      advance(round);
      return;
    }
    if (p.isBot && Date.now() - round.turnStartedAt >= BOT_THINK_MS) {
      p.acted = true;
      const strength = scoreHand(p.cards).value;
      const roll = randomInt(100);
      if (strength < 16 && roll < 12 && surviving(round).length > 2) {
        p.folded = true;
        recordAction(round,p,'fold',0);
      } else if (strength >= 25 && roll < 24) {
        addContribution(round,p,round.stake*2);
        recordAction(round,p,'raise',round.stake*2);
      } else {
        addContribution(round,p,round.stake);
        recordAction(round,p,'call',round.stake);
      }
      advance(round);
    }
  }
  function view(round, userId, table) {
    if (!round) return waitingView(table, userId);
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
      testBotCount: testBotCount(table, userId),
      lastAction:round.actionLog.at(-1)||null,
      actionLog:round.actionLog.slice(-6),
      payouts:finished?round.payouts:[],
      players: round.players.map(p => ({
        seat: p.seat, name: p.name, isBot: p.isBot, folded: p.folded, acted: p.acted,
        contributed:p.contributed, lastAction:p.lastAction,
        won:finished?(round.payouts.find(w=>w.seat===p.seat)?.amount||0):0,
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
    if (round?.status === 'finished' && Date.now() >= round.finishedAt + RESTART_MS) {
      rounds.delete(table);
      round = null;
    }
    if (!round) round = maybeStartReady(table);
    const action = data.action;
    if (action === 'test_bot_add' || action === 'test_bot_remove') {
      // Test-only controls must never be available to regular players.
      if (user.id !== adminId) return json(res, 403, {error:'Тестові боти доступні лише адміністратору'});
      if (round?.status === 'playing') return json(res, 409, {error:'Змінювати ботів можна лише між роздачами'});
      if (action === 'test_bot_add') {
        const humans = [...seats.entries()].filter(([,p]) => p.table === table && p.isBot !== true);
        if (humans.length !== 1 || humans[0][0] !== id) {
          return json(res, 409, {error:'Бота можна додати лише за столом без інших реальних гравців'});
        }
        if (testBotCount(table, id) >= 1) return json(res, 409, {error:'Тест-бот уже за цим столом'});
        const used = new Set([...seats.values()].filter(p => p.table === table).map(p => p.seat));
        const freeSeat = Array.from({length:11},(_,i)=>i+1).find(n=>!used.has(n));
        if (!freeSeat) return json(res, 409, {error:'Немає вільного місця'});
        const botId = 'test-bot:'+id+':'+table;
        seats.set(botId, {table, seat:freeSeat, name:BOT_NAME, photo:null,
          lastSeen:Date.now(), isBot:true, ownerId:id});
        const waiting = readyState(table);
        if (waiting.ids.size >= 2 && waiting.endsAt === null) waiting.endsAt = Date.now()+READY_DELAY_MS;
      } else {
        for (const [botId] of ownedBotEntries(table, id)) seats.delete(botId);
        readyState(table);
      }
      return json(res, 200, {ok:true, testBotCount:testBotCount(table,id),
        game:view(round,id,table)});
    }
    if (action === 'state') return json(res, 200, view(round, id, table));
    if (action === 'ready') {
      if (round) return json(res, 409, {error:'Дочекайся наступної роздачі'});
      const state = readyState(table);
      if (state.ids.has(id)) {
        state.ids.delete(id);
        if (state.ids.size < 2) state.endsAt = null;
      } else {
        if (state.ids.size >= MAX_PLAYERS) return json(res,409,{error:'На цю роздачу вже готові четверо'});
        state.ids.add(id);
        if (state.ids.size >= 2 && state.endsAt === null) state.endsAt = Date.now() + READY_DELAY_MS;
      }
      return json(res, 200, waitingView(table, id));
    }
    if (action === 'start') {
      if (round?.status === 'playing') return json(res,409,{error:'Роздача вже триває'});
      if (round?.status === 'finished') return json(res,409,{error:'Дочекайся завершення попередньої роздачі'});
      const entries = [...seats.entries()].filter(([,p]) => p.table === table)
        .sort((a,b) => a[1].seat - b[1].seat).slice(0,MAX_PLAYERS);
      if (entries.length < 2) return json(res,409,{error:'Для гри потрібно щонайменше двоє'});
      if (!entries.some(([uid])=>uid===id)) return json(res,403,{error:'Ця роздача доступна першим чотирьом гравцям'});
      round = startRound(table, entries);
      return json(res,200,view(round,id,table));
    }
    if (!['call', 'raise', 'fold', 'reveal'].includes(action)) return json(res, 400, { error: 'Невідома дія' });
    if (!round || round.status !== 'playing') return json(res, 409, { error: 'Наразі немає активної роздачі' });
    const me = round.players[round.turn];
    if (!me || me.id !== id) return json(res, 403, { error: 'Зараз не ваш хід' });
    if (me.folded || me.acted) return json(res, 409, { error: 'Хід уже зроблено' });
    me.acted = true;
    if (action === 'fold') {
      me.folded = true;
      recordAction(round,me,'fold');
    }
    if (action === 'call') {
      addContribution(round,me,round.stake);
      recordAction(round,me,'call',round.stake);
    }
    if (action === 'raise') {
      addContribution(round,me,round.stake*2);
      recordAction(round,me,'raise',round.stake*2);
    }
    if (action === 'reveal') {
      recordAction(round,me,'reveal');
      finish(round, 'Вскриття за вимогою гравця');
    } else advance(round);
    return json(res, 200, view(round, id, table));
  };
}
