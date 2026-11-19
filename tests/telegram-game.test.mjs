import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreHand, createGameApi } from '../telegram/game.mjs';

const hand = (ranks, suits) => ranks.map((rank, i) => ({ rank, suit: suits[i] }));
test('special combinations outrank 31; two aces are worth 22', () => {
  const six = scoreHand(hand(['6','6','6'], ['♠','♥','♦']));
  const aces = scoreHand(hand(['A','A','A'], ['♠','♥','♦']));
  const thirtyOne = scoreHand(hand(['A','K','Q'], ['♠','♠','♠']));
  const pair = scoreHand(hand(['A','A','7'], ['♠','♥','♦']));
  assert.ok(six.value > aces.value);
  assert.ok(aces.value > thirtyOne.value);
  assert.equal(thirtyOne.value, 31);
  assert.equal(pair.value, 22);
});
test('round deals private hands and rejects an out-of-turn action', async () => {
  const seats = new Map([
    ['101', { table: 1, seat: 1, name: 'Перший' }],
    ['102', { table: 1, seat: 2, name: 'Другий' }]
  ]);
  const api = createGameApi({
    seats, stakes: [2,5], validate: value => ({ id: Number(value) }),
    readPayload: async req => req.body,
    json: (res, status, body) => { res.status = status; res.body = body; }
  });
  const act = async (id, action) => {
    const res = {};
    await api({ body: { initData: String(id), table: 1, action } }, res);
    return res;
  };
  const started = await act(101, 'start');
  assert.equal(started.status, 200);
  assert.equal(started.body.status, 'playing');
  assert.equal(started.body.players[0].cards.length, 3);
  assert.equal(started.body.players[1].cards, null);
  const second = await act(102, 'state');
  assert.equal(second.body.players[0].cards, null);
  assert.equal(second.body.players[1].cards.length, 3);
  assert.equal((await act(102, 'reveal')).status, 403);
  assert.equal((await act(101, 'call')).body.turnSeat, 2);
  const finished = await act(102, 'reveal');
  assert.equal(finished.body.status, 'finished');
  assert.equal(finished.body.players[0].cards.length, 3);
  assert.equal(finished.body.players[1].cards.length, 3);
  assert.ok(finished.body.winners.length >= 1);
  assert.equal((await act(102, 'start')).status, 409);
});
