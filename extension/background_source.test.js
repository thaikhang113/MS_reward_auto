import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./background.js', import.meta.url), 'utf8');

test('Rewards dashboard tab fallback opens focused for authenticated dashboard fetch', () => {
  assert.match(source, /chrome\.windows\.update\(tab\.windowId,\s*\{\s*focused:\s*true\s*\}\)/s);
  assert.match(source, /fetchRewardsDashboardViaTab\(\{\s*active:\s*true,\s*closeAfter:\s*false/s);
});

test('mobile search visibly browses before checking rewards', () => {
  assert.match(source, /callAutomationMethod\(tab\.id,\s*'browseDestinationPage'/);
  assert.match(source, /\[Mobile\] Opened a search result; scrolling destination page\./);
  assert.match(source, /\[Mobile\] Checking Rewards points after visible browsing\./);
  assert.match(source, /waitForInteractiveLoad\(tab\.id,\s*isMobile,\s*'search results'\)/);
});
