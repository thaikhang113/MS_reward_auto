import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
const plannerSource = readFileSync(new URL('./rewards_planner.js', import.meta.url), 'utf8');

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

test('config sanitizer preserves zero-valued live test controls', () => {
  assert.match(source, /function parseIntegerWithDefault\(/);
  assert.match(source, /merged\.searchCount = clamp\(parseIntegerWithDefault\(merged\.searchCount, DEFAULT_CONFIG\.searchCount\), 0, 30\)/);
  assert.match(source, /merged\.maxRetries = clamp\(parseIntegerWithDefault\(merged\.maxRetries, DEFAULT_CONFIG\.maxRetries\), 0, 5\)/);
});

test('auto resume checks remaining rewards work without focused dashboard recovery', () => {
  assert.match(source, /autoRunOnOpen:\s*true/);
  assert.match(source, /autoRunTasks:\s*true/);
  assert.match(source, /buildAutomationPlan\(config,\s*snapshot\)/);
  assert.match(source, /hasAutomationWork\(plan\)/);
  assert.match(source, /async function maybeAutoStartSearchRun\(/);
  assert.match(source, /allowFocusedRecovery:\s*false/);
  assert.match(source, /message\.action === 'maybe_auto_start'/);
  assert.match(plannerSource, /function getRemainingSearchCountFromCounter\(/);
  assert.match(plannerSource, /Math\.ceil\(remainingPoints \/ SEARCH_POINTS_PER_QUERY\)/);
});

test('search start uses automation planner to skip completed workers', () => {
  assert.match(source, /const plan = buildAutomationPlan\(config,\s*baselineSnapshot\)/);
  assert.match(source, /if \(plan\.mobile\.count > 0\) \{/);
  assert.match(source, /Mobile search already complete; skipping mobile worker/);
  assert.match(source, /if \(plan\.pc\.count > 0\) \{/);
  assert.match(source, /PC search already complete; skipping PC worker/);
  assert.match(source, /scanUncompletedTasks\(dashboard\)/);
});

test('dashboard recovery extracts counters from page html before points-only fallback', () => {
  assert.match(source, /const readDashboardFromPage = \(\) => \{/);
  assert.match(source, /parseDashboardFromText\(scriptText\)/);
  assert.match(source, /const pageDashboard = readDashboardFromPage\(\)/);
  assert.match(source, /if \(pageDashboard\) \{\s*return pageDashboard;\s*\}/s);
  assert.match(source, /buildVisiblePointsDashboard\(visiblePoints\)/);
});

test('focused dashboard recovery is opt-in only', () => {
  assert.match(source, /allowFocusedRecovery = false/);
  assert.match(source, /if \(allowFocusedRecovery\) \{/);
  assert.match(source, /fetchRewardsDashboardViaTab\(\{\s*active:\s*false,\s*closeAfter:\s*false,\s*settleMs:\s*4500/s);
  assert.match(source, /reusing one background Rewards Dashboard tab for recovery/);
  assert.match(source, /Background Rewards Dashboard recovery failed/);
});
