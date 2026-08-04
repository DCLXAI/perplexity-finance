/* Independent contract smoke tests. These run without a DOM or test runner. */
import assert from 'node:assert/strict';
import { parseJson, parseTheme, sanitizeWatchlist } from '../src/data/persistence.js';
import { didCrossThreshold, sanitizeAlerts } from '../src/features/alerts/alertsStore.js';

const symbols = new Set(['AMD', 'NVDA', 'BTCUSD']);
const fallback = ['AMD', 'NVDA'] as const;

assert.equal(parseJson('{broken'), undefined);
assert.deepEqual(parseJson('["AMD"]'), ['AMD']);
assert.equal(parseTheme('dark'), 'dark');
assert.equal(parseTheme('sepia', 'light'), 'light');
assert.deepEqual(
  sanitizeWatchlist(['AMD', 'AMD', 'BTCUSD', 'NOPE'], symbols, fallback),
  ['AMD', 'BTCUSD'],
);
assert.deepEqual(sanitizeWatchlist(['NOPE'], symbols, fallback), fallback);

assert.equal(didCrossThreshold('above', 99, 100, 100), true);
assert.equal(didCrossThreshold('above', 100, 101, 100), false);
assert.equal(didCrossThreshold('below', 101, 100, 100), true);
assert.equal(didCrossThreshold('below', 100, 99, 100), false);

const alerts = sanitizeAlerts([
  {
    id: 'a1',
    symbol: 'BTCUSD',
    condition: 'above',
    target: 100_000,
    createdISO: '2026-07-12T00:00:00.000Z',
    seen: true,
  },
  {
    id: 'bad',
    symbol: 'UNKNOWN',
    condition: 'above',
    target: 1,
    createdISO: '2026-07-12T00:00:00.000Z',
    seen: false,
  },
]);
assert.equal(alerts.length, 1);
assert.equal(Object.isFrozen(alerts), true);

console.log(JSON.stringify({
  persistenceValidation: 'PASS',
  alertCrossing: 'PASS',
  result: 'PASS',
}, null, 2));
