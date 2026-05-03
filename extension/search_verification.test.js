import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAcceptUnconfirmedSearch } from './search_verification.js';

test('shouldAcceptUnconfirmedSearch accepts mobile best-effort when no Rewards counter exists', () => {
  assert.equal(
    shouldAcceptUnconfirmedSearch({
      isMobile: true,
      initialCounter: null,
      verification: { mode: 'availablePoints', counted: false, confidence: 'low' }
    }),
    true
  );
});

test('shouldAcceptUnconfirmedSearch does not accept counter-backed misses', () => {
  assert.equal(
    shouldAcceptUnconfirmedSearch({
      isMobile: true,
      initialCounter: { key: 'mobileSearch', progress: 0, max: 60 },
      verification: { mode: 'counter', counted: false, confidence: 'high' }
    }),
    false
  );
});
