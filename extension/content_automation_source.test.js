import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./content-automation.js', import.meta.url), 'utf8');

test('mobile search submits with Enter and falls back to direct search URL', () => {
  assert.match(source, /function dispatchEnterSearch\(/);
  assert.match(source, /await waitForSearchNavigation\(keyword, startedUrl\)/);
  assert.match(source, /window\.location\.assign\(buildSearchNavigationUrl\(keyword\)\)/);
});

test('mobile search schedules submit after executeScript returns', () => {
  assert.match(source, /if \(options\.mobile\) \{\s*window\.setTimeout\(\(\) => submitSearch\(searchInput\), 180\);\s*return \{ success: true, submitted: true, scheduled: true \};\s*\}/s);
  assert.match(source, /window\.setTimeout\(\(\) => window\.location\.assign\(buildSearchNavigationUrl\(keyword\)\), 180\);/);
});

test('mobile engagement opens a search result and scrolls the destination page', () => {
  assert.match(source, /function scoreSearchResultAnchor\(/);
  assert.match(source, /function findSearchResultAnchor\(/);
  assert.match(source, /function countSearchResultCandidates\(/);
  assert.match(source, /candidates\.sort\(\(left, right\) => right\.score - left\.score\)/);
  assert.match(source, /window\.setTimeout\(\(\) => window\.location\.assign\(anchor\.href\), 120\)/);
  assert.match(source, /async function browseDestinationPage\(/);
  assert.match(source, /browseDestinationPage,/);
});
