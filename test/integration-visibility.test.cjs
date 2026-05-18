'use strict';

// Integration: end-to-end visibility filtering through the live
// HTTP stack. Boots the real server, seeds DM-only / public /
// twinned records, and asserts what reaches the player wire.
//
// Under the twin-entity model the visibility surface is simpler
// than the MVP: only two things to verify per response —
//   1. DM-only entities are absent.
//   2. `linkedTwinId` is absent on every entity in non-DM payloads.

const { test }   = require('node:test');
const assert     = require('node:assert/strict');
const { startServer } = require('./helpers/server-process.cjs');

const DM     = 'dm-pw';
const PLAYER = 'player-pw';

async function loginAs(srv, password) {
  const res = await srv.fetch('/api/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ password }),
  });
  assert.equal(res.status, 200, 'login failed');
}

async function fetchData(srv) {
  const res = await srv.fetch('/api/data');
  assert.equal(res.status, 200);
  return await res.json();
}

function commonSeed() {
  return {
    'characters.json': [
      {
        id: 'pub_alice',
        name: 'Alice',
        faction: 'neutral',
        description: 'A merchant.',
        visibility: 'public',
      },
      {
        id: 'dm_villain',
        name: 'The Villain',
        faction: 'cult_high',
        description: 'Plot-twist material.',
        visibility: 'dm',
      },
      {
        id: 'pub_twinned',
        name: 'Stranger',
        faction: 'neutral',
        description: 'A hooded figure.',
        visibility: 'public',
        linkedTwinId: 'dm_twinned',
      },
      {
        id: 'dm_twinned',
        name: 'Frulam Mondath',
        faction: 'cult_high',
        description: 'Wearer of Purple.',
        visibility: 'dm',
        linkedTwinId: 'pub_twinned',
      },
    ],
    'factions.json': {
      neutral:   { id: 'neutral',   name: 'Neutral',   description: 'Public.', visibility: 'public' },
      cult_high: { id: 'cult_high', name: 'Hidden Cult', description: 'DM-only.', visibility: 'dm' },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────

test('GET /api/data: anonymous receives player-filtered payload (no DM-only entities, no linkedTwinId)', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER, seedData: commonSeed() });
  try {
    const data = await fetchData(srv);
    const ids = data.characters.map(c => c.id);
    assert.equal(ids.includes('dm_villain'),  false);
    assert.equal(ids.includes('dm_twinned'),  false);
    // pub_twinned IS visible but the linkedTwinId pointing at the DM
    // sibling must NOT be in the payload — players shouldn't be able
    // to infer that this entity has DM lore.
    const stranger = data.characters.find(c => c.id === 'pub_twinned');
    assert.ok(stranger, 'public twin should be visible to player');
    assert.equal(Object.prototype.hasOwnProperty.call(stranger, 'linkedTwinId'), false,
      'linkedTwinId must be stripped from player payload');
    // DM-only faction missing.
    assert.equal(Object.prototype.hasOwnProperty.call(data.factions, 'cult_high'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(data.factions, 'neutral'),   true);
  } finally { await srv.kill(); }
});

test('GET /api/data: player session matches anonymous behavior', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER, seedData: commonSeed() });
  try {
    await loginAs(srv, PLAYER);
    const data = await fetchData(srv);
    const ids = data.characters.map(c => c.id);
    assert.equal(ids.includes('dm_villain'), false);
    assert.equal(ids.includes('dm_twinned'), false);
  } finally { await srv.kill(); }
});

test('GET /api/data: DM session receives EVERY entity + linkedTwinId intact', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER, seedData: commonSeed() });
  try {
    await loginAs(srv, DM);
    const data = await fetchData(srv);
    assert.equal(data.characters.length, 4);
    const stranger = data.characters.find(c => c.id === 'pub_twinned');
    const frulam   = data.characters.find(c => c.id === 'dm_twinned');
    assert.equal(stranger.linkedTwinId, 'dm_twinned');
    assert.equal(frulam.linkedTwinId,   'pub_twinned');
    // DM-only faction present.
    assert.equal(Object.prototype.hasOwnProperty.call(data.factions, 'cult_high'), true);
  } finally { await srv.kill(); }
});

test('GET /api/data: DM impersonating player gets the player-filtered payload', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER, seedData: commonSeed() });
  try {
    await loginAs(srv, DM);
    await srv.fetch('/api/view-as', { method: 'POST' });
    const data = await fetchData(srv);
    const ids = data.characters.map(c => c.id);
    assert.equal(ids.includes('dm_villain'), false, 'impersonation must hide DM content');
    const stranger = data.characters.find(c => c.id === 'pub_twinned');
    assert.equal(Object.prototype.hasOwnProperty.call(stranger, 'linkedTwinId'), false);
  } finally { await srv.kill(); }
});

test('GET /api/data: raw bytes do NOT contain any DM-only substring (no DevTools leak)', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER, seedData: commonSeed() });
  try {
    const res  = await srv.fetch('/api/data');
    const text = await res.text();
    assert.equal(text.includes('Plot-twist material'),  false, 'DM-only entity description leaked');
    assert.equal(text.includes('Wearer of Purple'),     false, 'DM-only twin description leaked');
    assert.equal(text.includes('dm_twinned'),           false, 'DM-only entity id leaked via linkedTwinId');
    assert.equal(text.includes('linkedTwinId'),         false, 'linkedTwinId field leaked');
    assert.equal(text.includes('Hidden Cult'),          false, 'DM-only faction name leaked');
    // Sanity: public content IS in the response.
    assert.equal(text.includes('A merchant'), true);
    assert.equal(text.includes('A hooded figure'), true);
  } finally { await srv.kill(); }
});

test('PATCH+GET round-trip: DM creates a DM-only char, player view never sees it', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER });
  try {
    await loginAs(srv, DM);
    const patch = await srv.fetch('/api/data', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        type: 'characters', action: 'save',
        payload: {
          id: 'spy_42', name: 'Hidden Spy', faction: 'cult_high',
          description: 'Sold the queen out.',
          visibility: 'dm',
        },
      }),
    });
    assert.equal(patch.status, 200);

    const dmData = await fetchData(srv);
    assert.equal(dmData.characters.find(c => c.id === 'spy_42').name, 'Hidden Spy');

    srv.clearCookies();
    const playerData = await fetchData(srv);
    assert.equal(playerData.characters.find(c => c.id === 'spy_42'), undefined);
  } finally { await srv.kill(); }
});

test('PATCH /api/data: PC (faction=party) cannot be marked DM-only (server enforces)', async () => {
  const srv = await startServer({ dmPassword: DM, playerPassword: PLAYER });
  try {
    await loginAs(srv, DM);
    const res = await srv.fetch('/api/data', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        type: 'characters', action: 'save',
        payload: { id: 'pc_kira', name: 'Kira', faction: 'party', visibility: 'dm' },
      }),
    });
    assert.equal(res.status, 400);
  } finally { await srv.kill(); }
});

test('Settings collection is not filtered (shared metadata)', async () => {
  const srv = await startServer({
    dmPassword: DM, playerPassword: PLAYER,
    seedData: {
      'settings.json': {
        attitudes: [{ id: 'ally', label: 'Spojenec' }],
      },
    },
  });
  try {
    const data = await fetchData(srv);
    assert.deepEqual(data.settings.attitudes, [{ id: 'ally', label: 'Spojenec' }]);
  } finally { await srv.kill(); }
});

test('Relationships: DM-only relationship hidden from player payload', async () => {
  const srv = await startServer({
    dmPassword: DM, playerPassword: PLAYER,
    seedData: {
      'characters.json': [
        { id: 'a', name: 'A', faction: 'neutral', visibility: 'public' },
        { id: 'b', name: 'B', faction: 'neutral', visibility: 'public' },
      ],
      'relationships.json': [
        { source: 'a', target: 'b', type: 'ally',     visibility: 'public' },
        { source: 'a', target: 'b', type: 'commands', visibility: 'dm'     },
      ],
    },
  });
  try {
    await loginAs(srv, DM);
    const dmData = await fetchData(srv);
    assert.equal(dmData.relationships.length, 2);
    srv.clearCookies();
    const playerData = await fetchData(srv);
    assert.equal(playerData.relationships.length, 1);
    assert.equal(playerData.relationships[0].type, 'ally');
  } finally { await srv.kill(); }
});
