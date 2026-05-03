import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));

test('manifest allows destination-page browsing after opening search results', () => {
  assert.ok(manifest.host_permissions.includes('https://*/*'));
  assert.ok(manifest.host_permissions.includes('http://*/*'));
});
