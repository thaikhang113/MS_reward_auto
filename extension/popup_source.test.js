import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./popup.js', import.meta.url), 'utf8');

test('popup auto-starts remaining rewards work unless live test disables it', () => {
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.has\('liveTest'\)/);
  assert.match(source, /chrome\.runtime\.sendMessage\(\{ action: 'maybe_auto_start', reason: 'popup_open' \}\)/);
});
