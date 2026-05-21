const { test } = require('node:test');
const assert    = require('node:assert/strict');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');

const {
  isForbiddenKey, safeJoinIn, pickKeptSnapshots,
  hashPassword, verifyPassword, safeEqStrings,
} = require('../server-utils.cjs');

// ── isForbiddenKey ────────────────────────────────────────────────
test('isForbiddenKey: rejects __proto__/constructor/prototype and non-strings', () => {
  for (const k of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(isForbiddenKey(k), true, `should reject ${k}`);
  }
  assert.equal(isForbiddenKey(undefined), true);
  assert.equal(isForbiddenKey(null),      true);
  assert.equal(isForbiddenKey(42),        true);
  assert.equal(isForbiddenKey({}),        true);
});

test('isForbiddenKey: accepts ordinary string ids', () => {
  for (const k of ['frulam_a7b3c9', 'main', 'a-b', 'aPrototype', 'p__roto__']) {
    assert.equal(isForbiddenKey(k), false, `should accept ${k}`);
  }
});

// ── safeJoinIn ────────────────────────────────────────────────────
// Tests run against a real tempdir so the realpath/symlink branch is
// exercised, not just the string-prefix branch.
function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('safeJoinIn: returns absolute path for plain children', () => {
  withTmp(dir => {
    const out = safeJoinIn(dir, 'foo.json');
    assert.equal(out, path.resolve(dir, 'foo.json'));
  });
});

test('safeJoinIn: rejects traversal segments', () => {
  withTmp(dir => {
    assert.equal(safeJoinIn(dir, '../escape'),       null);
    assert.equal(safeJoinIn(dir, 'sub/../../up'),    null);
    assert.equal(safeJoinIn(dir, '..\\winescape'),   null);
    assert.equal(safeJoinIn(dir, '..'),              null);
  });
});

test('safeJoinIn: rejects absolute paths', () => {
  withTmp(dir => {
    assert.equal(safeJoinIn(dir, '/etc/passwd'),  null);
    assert.equal(safeJoinIn(dir, '\\windows\\x'), null);
  });
});

test('safeJoinIn: rejects null bytes and non-string input', () => {
  withTmp(dir => {
    assert.equal(safeJoinIn(dir, 'foo\0bar'), null);
    assert.equal(safeJoinIn(dir, ''),         null);
    assert.equal(safeJoinIn(dir, null),       null);
    assert.equal(safeJoinIn(dir, 42),         null);
  });
});

test('safeJoinIn: allows nested paths whose ancestors exist', () => {
  withTmp(dir => {
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    const out = safeJoinIn(dir, 'a/b/leaf.txt');   // leaf may not exist
    assert.equal(out, path.resolve(dir, 'a', 'b', 'leaf.txt'));
  });
});

// Symlink test: skip on Windows where mklink needs admin privilege.
const canSymlink = process.platform !== 'win32';
test('safeJoinIn: rejects symlinks pointing outside the dir', { skip: !canSymlink }, () => {
  withTmp(dir => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-out-'));
    try {
      fs.symlinkSync(outside, path.join(dir, 'escape'));
      assert.equal(safeJoinIn(dir, 'escape/anything'), null);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

// ── pickKeptSnapshots ─────────────────────────────────────────────
function meta(id, iso) { return { id, createdAt: iso }; }

test('pickKeptSnapshots: keeps everything when below recentKeep', () => {
  const metas = [
    meta('a', '2026-04-01T00:00:00.000Z'),
    meta('b', '2026-04-02T00:00:00.000Z'),
  ];
  const keep = pickKeptSnapshots(metas, { recentKeep: 50, dailyDays: 14, now: Date.parse('2026-04-03T00:00:00Z') });
  assert.deepEqual([...keep].sort(), ['a', 'b']);
});

test('pickKeptSnapshots: keeps the last N by recency', () => {
  const metas = [];
  for (let i = 1; i <= 5; i++) metas.push(meta(`s${i}`, `2026-04-0${i}T00:00:00.000Z`));
  const keep = pickKeptSnapshots(metas, { recentKeep: 3, dailyDays: 0, now: Date.parse('2026-04-06T00:00:00Z') });
  // Daily window is 0 days → only the recent window contributes.
  assert.deepEqual([...keep].sort(), ['s3', 's4', 's5']);
});

test('pickKeptSnapshots: daily window keeps latest snap per UTC-day', () => {
  // Three on day 1, one on day 2, one on day 3. recentKeep=1 keeps
  // only the very newest; daily should keep one per day for last 14d.
  const metas = [
    meta('d1-a', '2026-04-01T03:00:00.000Z'),
    meta('d1-b', '2026-04-01T15:00:00.000Z'),  // latest of day 1
    meta('d1-c', '2026-04-01T06:00:00.000Z'),
    meta('d2',   '2026-04-02T10:00:00.000Z'),
    meta('d3',   '2026-04-03T10:00:00.000Z'),
  ];
  const now  = Date.parse('2026-04-04T00:00:00Z');
  const keep = pickKeptSnapshots(metas, { recentKeep: 1, dailyDays: 14, now });
  // Recent: d3. Daily: d1-b (latest of day 1), d2, d3. Union: 3 ids.
  assert.deepEqual([...keep].sort(), ['d1-b', 'd2', 'd3']);
});

test('pickKeptSnapshots: prunes anything outside both windows', () => {
  const metas = [
    meta('ancient', '2025-01-01T00:00:00.000Z'),
    meta('recent',  '2026-04-03T00:00:00.000Z'),
  ];
  const now  = Date.parse('2026-04-04T00:00:00Z');
  const keep = pickKeptSnapshots(metas, { recentKeep: 1, dailyDays: 14, now });
  assert.equal(keep.has('ancient'), false);
  assert.equal(keep.has('recent'),  true);
});

test('pickKeptSnapshots: skips entries with unparseable timestamps in daily window', () => {
  const metas = [
    meta('bad',    'not-a-date'),
    meta('good',   '2026-04-03T00:00:00.000Z'),
  ];
  const now  = Date.parse('2026-04-04T00:00:00Z');
  const keep = pickKeptSnapshots(metas, { recentKeep: 5, dailyDays: 14, now });
  // recentKeep=5 sweeps both into the recent window; the daily branch
  // just shouldn't crash on the bad row.
  assert.equal(keep.has('good'), true);
});

// ── safeEqStrings ─────────────────────────────────────────────────
test('safeEqStrings: equal strings return true', () => {
  assert.equal(safeEqStrings('abc', 'abc'), true);
  assert.equal(safeEqStrings('', ''),       true);
});

test('safeEqStrings: unequal or different-length strings return false', () => {
  assert.equal(safeEqStrings('abc', 'abcd'), false);
  assert.equal(safeEqStrings('abc', 'abd'),  false);
  assert.equal(safeEqStrings('abc', ''),     false);
});

test('safeEqStrings: handles null/undefined as empty string', () => {
  assert.equal(safeEqStrings(null, ''),         true);
  assert.equal(safeEqStrings(undefined, null),  true);
  assert.equal(safeEqStrings(null, 'x'),        false);
});

// ── hashPassword / verifyPassword ─────────────────────────────────
test('hashPassword: returns {salt, hash, updatedAt} with hex salt + hash', () => {
  const cred = hashPassword('hunter2', 1700000000000);
  assert.equal(typeof cred.salt, 'string');
  assert.equal(typeof cred.hash, 'string');
  assert.match(cred.salt, /^[0-9a-f]{32}$/);
  assert.match(cred.hash, /^[0-9a-f]{64}$/);
  assert.equal(cred.updatedAt, 1700000000000);
});

test('hashPassword: different calls produce different salts (and therefore hashes)', () => {
  const a = hashPassword('same-password');
  const b = hashPassword('same-password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('verifyPassword: accepts the correct password', () => {
  const cred = hashPassword('hunter2');
  assert.equal(verifyPassword(cred, 'hunter2'), true);
});

test('verifyPassword: rejects the wrong password', () => {
  const cred = hashPassword('hunter2');
  assert.equal(verifyPassword(cred, 'wrong'),   false);
  assert.equal(verifyPassword(cred, 'HUNTER2'), false);
  assert.equal(verifyPassword(cred, ''),        false);
});

test('verifyPassword: rejects null / corrupt / partial records', () => {
  assert.equal(verifyPassword(null, 'x'),                            false);
  assert.equal(verifyPassword(undefined, 'x'),                       false);
  assert.equal(verifyPassword({}, 'x'),                              false);
  assert.equal(verifyPassword({ salt: 'a' }, 'x'),                   false);
  assert.equal(verifyPassword({ hash: 'a' }, 'x'),                   false);
  assert.equal(verifyPassword({ salt: 123, hash: 'a' }, 'x'),        false);
});

test('verifyPassword: handles null / undefined input as empty string', () => {
  // An empty-string password is a real credential (some test fixtures
  // use it). Verify that hashing & checking '' round-trips, and that
  // null/undefined are coerced to '' the same way.
  const cred = hashPassword('');
  assert.equal(verifyPassword(cred, ''),        true);
  assert.equal(verifyPassword(cred, null),      true);
  assert.equal(verifyPassword(cred, undefined), true);
});
