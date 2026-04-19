import { fetchPendingDailyTaskUrls } from './daily_tasks_new.js';
import { getAllKeywords } from './keywords-data.js';

const DEFAULT_CONFIG = Object.freeze({
  rewardsLevel: 'gold',
  searchCount: 12,
  mobileSearchCount: 5,
  minDelay: 20,
  maxDelay: 40,
  mobileMode: false,
  maxRetries: 2,
  waveSize: 4,
  wavePauseMin: 15,
  speedLevel: 3
});

const BING_HOME_URL = 'https://www.bing.com/';
const REWARDS_HOME_URL = 'https://rewards.bing.com/';
const REWARDS_API_URL = 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest';
const MOBILE_RULESET_ID = 'mobile_ua_rules';
const AUTOMATION_WORLD = 'MAIN';
const FETCH_TIMEOUT_MS = 15000;
const KEEP_ALIVE_INTERVAL_MS = 15000;
const WAIT_SLICE_MS = 1000;
const TAB_LOAD_TIMEOUT_MS = 45000;
const SEARCH_READY_DELAY_MS = [900, 1700];
const SEARCH_SETTLE_DELAY_MS = [1800, 3200];
const INTERACTION_SETTLE_DELAY_MS = [2200, 4200];
const SEARCH_VERIFY_ATTEMPTS = 3;
const SEARCH_VERIFY_DELAY_MS = 5000;
const TASK_READY_DELAY_MS = [1200, 2200];
const TASK_DWELL_DELAY_MS = [5000, 10000];
const TASK_COOLDOWN_DELAY_MS = [1500, 3000];
const SUCCESS_BADGE = 'API Verified';
const FALLBACK_BADGE = 'Fallback';
const SAFE_DELAY_SECONDS = Object.freeze({
  min: 20,
  max: 40
});
const USER_STOPPED_ERROR = 'USER_STOPPED';
const MOBILE_COUNTER_RE = /mobile/i;
const PC_COUNTER_RE = /pc|desktop/i;
const SEARCH_COUNTER_RE = /search/i;
const SEARCH_COUNTER_EXCLUDE_RE = /edge|bonus|streak|check.?in|offer|task|quiz|poll|punch|read|news|activity|promo/i;

const STATUS_MESSAGES = {
  check_points: 'Points verification is not available in the API task phase.',
  reset_page: 'Page reset is not available in the API task phase.'
};

function createSearchState() {
  return {
    enabled: false,
    status: 'idle',
    planned: 0,
    executed: 0,
    counted: 0,
    notCounted: 0,
    remaining: null,
    counter: null,
    progressText: '0/0',
    verificationMode: 'loop',
    verificationBadge: 'Loop Only',
    lastOutcome: '',
    lastConfidence: 'n/a'
  };
}

function createInitialState() {
  return {
    status: 'idle',
    progress: 'Idle',
    percent: 0,
    wave: { current: 0, total: 0 },
    cooldownUntil: null,
    currentSearch: 0,
    totalSearches: 0,
    points: {
      current: null,
      earned: 0,
      baseline: null,
      final: null,
      lastCheck: null,
      history: []
    },
    mobileRuleEnabled: false,
    mobile: createSearchState(),
    pc: createSearchState(),
    tasks: {
      planned: 0,
      executed: 0,
      completed: 0,
      pending: 0,
      fallbackUsed: false,
      lastSource: 'idle',
      lastOutcome: 'Idle'
    },
    verification: {
      lastDashboardCheck: null,
      lastCounterSnapshot: null,
      lastVerifiedDelta: null,
      apiSource: null
    },
    summary: {
      baselinePoints: null,
      finalPoints: null,
      totalEarned: 0,
      verificationBadge: 'Loop Only'
    }
  };
}

let state = createInitialState();
let logs = [];
let keywordCache = [];
let recentKeywords = [];
let keepAliveTimer = null;
let activeRunPromise = null;

function getPublicState() {
  return JSON.parse(JSON.stringify(state));
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function broadcastState() {
  broadcast({
    action: 'state_update',
    data: getPublicState()
  });
}

function log(text, type = 'info') {
  const entry = {
    text,
    type,
    time: new Date().toLocaleTimeString()
  };

  logs.unshift(entry);
  if (logs.length > 200) {
    logs.length = 200;
  }

  broadcast({ action: 'log', data: entry });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCounter(counter) {
  if (!counter) return '--';
  return `${counter.progress}/${counter.max}`;
}

function cloneCounter(counter) {
  return counter
    ? {
        key: counter.key,
        progress: counter.progress,
        max: counter.max,
        remaining: counter.remaining,
        complete: counter.complete,
        score: counter.score
      }
    : null;
}

function applyCurrentPoints(points) {
  if (!Number.isFinite(points)) return;

  state.points.current = points;
  state.points.final = points;
  state.points.lastCheck = Date.now();
  state.summary.finalPoints = points;

  if (Number.isFinite(state.points.baseline)) {
    state.points.earned = points - state.points.baseline;
    state.summary.totalEarned = state.points.earned;
  }
}

function applyBaselinePoints(points) {
  if (!Number.isFinite(points)) return;

  state.points.baseline = points;
  state.summary.baselinePoints = points;
  state.summary.totalEarned = 0;
  applyCurrentPoints(points);
}

function updateSummaryBadge() {
  const badges = [];

  if (state.mobile.planned > 0 || state.mobile.executed > 0 || state.mobile.enabled) {
    badges.push(state.mobile.verificationBadge);
  }

  if (state.pc.planned > 0 || state.pc.executed > 0) {
    badges.push(state.pc.verificationBadge);
  }

  if (!badges.length) return;
  state.summary.verificationBadge = badges.every((badge) => badge === SUCCESS_BADGE)
    ? SUCCESS_BADGE
    : FALLBACK_BADGE;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchRewardsDashboardViaTab() {
  let tab = null;

  try {
    tab = await chrome.tabs.create({
      url: REWARDS_HOME_URL,
      active: false
    });

    await waitForTabLoad(tab.id);
    await waitWithStop(1800);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: AUTOMATION_WORLD,
      func: async (apiUrl) => {
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      },
      args: [REWARDS_API_URL]
    });

    return results?.[0]?.result;
  } finally {
    if (tab?.id) {
      await closeTab(tab.id);
    }
  }
}

function normalizeCounter(key, value) {
  if (!value || typeof value !== 'object') return null;

  const progress = toFiniteNumber(value.pointProgress);
  const max = toFiniteNumber(value.pointProgressMax);
  if (!Number.isFinite(max) || max <= 0) return null;

  const safeProgress = Number.isFinite(progress) ? progress : 0;
  return {
    key,
    progress: safeProgress,
    max,
    remaining: Math.max(0, max - safeProgress),
    complete: value.complete === true || safeProgress >= max
  };
}

function getCountersSnapshot(dashboard) {
  const counters = dashboard?.userStatus?.counters;
  if (!counters || typeof counters !== 'object') return {};

  const snapshot = {};
  for (const [key, value] of Object.entries(counters)) {
    const normalized = normalizeCounter(key, value);
    if (normalized) {
      snapshot[key] = normalized;
    }
  }

  return snapshot;
}

function scoreCounter(counter, type) {
  const key = counter.key.toLowerCase();
  let score = 0;

  if (SEARCH_COUNTER_RE.test(key)) score += 4;
  if (type === 'mobile') {
    if (MOBILE_COUNTER_RE.test(key)) score += 10;
    if (PC_COUNTER_RE.test(key)) score -= 8;
  } else {
    if (PC_COUNTER_RE.test(key)) score += 10;
    if (MOBILE_COUNTER_RE.test(key)) score -= 10;
  }

  if (SEARCH_COUNTER_EXCLUDE_RE.test(key)) score -= 5;
  if (counter.remaining > 0) score += 2;
  if (counter.max >= 5) score += 1;
  return score;
}

function pickBestCounter(countersSnapshot, type, preferredKey = null) {
  if (preferredKey && countersSnapshot?.[preferredKey]) {
    return { ...countersSnapshot[preferredKey], score: 999 };
  }

  const counters = Object.values(countersSnapshot || {});
  if (!counters.length) return null;

  const scored = counters
    .map((counter) => ({ ...counter, score: scoreCounter(counter, type) }))
    .filter((counter) => counter.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.max !== left.max) return right.max - left.max;
      if (left.progress !== right.progress) return left.progress - right.progress;
      return left.key.localeCompare(right.key);
    });

  return scored[0] || null;
}

function createDashboardSnapshot(dashboard, source) {
  const counters = getCountersSnapshot(dashboard);
  return {
    source,
    checkedAt: Date.now(),
    availablePoints: toFiniteNumber(dashboard?.userStatus?.availablePoints),
    counters,
    pcCounter: pickBestCounter(counters, 'pc'),
    mobileCounter: pickBestCounter(counters, 'mobile')
  };
}

function getSnapshotCounter(snapshot, type, preferredKey = null) {
  if (!snapshot) return null;

  return type === 'mobile'
    ? (preferredKey ? pickBestCounter(snapshot.counters, 'mobile', preferredKey) : snapshot.mobileCounter)
    : (preferredKey ? pickBestCounter(snapshot.counters, 'pc', preferredKey) : snapshot.pcCounter);
}

async function fetchRewardsDashboard(options = {}) {
  const {
    context = 'dashboard',
    logCounters = false,
    silent = false
  } = options;

  let payload;
  let source = 'background_fetch';

  try {
    payload = await fetchJsonWithTimeout(REWARDS_API_URL);
  } catch (error) {
    source = 'tab_fallback';
    payload = await fetchRewardsDashboardViaTab();
  }

  const dashboard = payload?.dashboard || payload;
  if (!dashboard || typeof dashboard !== 'object') {
    throw new Error('Invalid rewards dashboard payload');
  }

  const snapshot = createDashboardSnapshot(dashboard, source);
  state.verification.lastDashboardCheck = snapshot.checkedAt;
  state.verification.lastCounterSnapshot = snapshot.counters;
  state.verification.apiSource = source;

  if (Number.isFinite(snapshot.availablePoints)) {
    applyCurrentPoints(snapshot.availablePoints);
  }

  if (!silent) {
    log(`[API] Dashboard loaded via ${source} (${context})`, 'success');
    if (Number.isFinite(snapshot.availablePoints)) {
      log(`[API] Available points: ${snapshot.availablePoints}`);
    }
    if (logCounters && snapshot.pcCounter) {
      log(`[API] PC counter: ${snapshot.pcCounter.key} ${formatCounter(snapshot.pcCounter)}`);
    }
    if (logCounters && snapshot.mobileCounter) {
      log(`[API] Mobile counter: ${snapshot.mobileCounter.key} ${formatCounter(snapshot.mobileCounter)}`);
    }
  }

  broadcastState();
  return snapshot;
}

async function verifySearchOutcome(beforeSnapshot, type, options = {}) {
  const preferredKey = options.preferredKey || null;
  const beforeCounter = getSnapshotCounter(beforeSnapshot, type, preferredKey);
  let latestSnapshot = beforeSnapshot;
  let latestCounter = beforeCounter;

  for (let attempt = 1; attempt <= SEARCH_VERIFY_ATTEMPTS; attempt += 1) {
    await waitWithStop(SEARCH_VERIFY_DELAY_MS + randomInt(250, 1000));
    const afterSnapshot = await fetchRewardsDashboard({
      context: `${options.label || type} verify ${attempt}`,
      silent: true
    });

    const afterCounter = getSnapshotCounter(afterSnapshot, type, beforeCounter?.key || preferredKey);
    latestSnapshot = afterSnapshot;
    latestCounter = afterCounter;

    let counted = false;
    let mode = 'counter';
    let confidence = 'high';

    if (beforeCounter && afterCounter && afterCounter.progress > beforeCounter.progress) {
      counted = true;
    } else if (
      type === 'pc'
      && Number.isFinite(beforeSnapshot.availablePoints)
      && Number.isFinite(afterSnapshot.availablePoints)
      && afterSnapshot.availablePoints > beforeSnapshot.availablePoints
    ) {
      counted = true;
      mode = 'availablePoints';
      confidence = 'medium';
    } else if (!beforeCounter && !afterCounter) {
      mode = 'availablePoints';
      confidence = 'low';
    }

    state.verification.lastVerifiedDelta = {
      type,
      mode,
      counted,
      confidence,
      attempt,
      beforeCounter: cloneCounter(beforeCounter),
      afterCounter: cloneCounter(afterCounter),
      beforePoints: beforeSnapshot.availablePoints,
      afterPoints: afterSnapshot.availablePoints
    };
    broadcastState();

    if (counted) {
      return {
        counted,
        mode,
        confidence,
        afterSnapshot,
        afterCounter
      };
    }
  }

  return {
    counted: false,
    mode: beforeCounter ? 'counter' : 'availablePoints',
    confidence: beforeCounter ? 'high' : 'low',
    afterSnapshot: latestSnapshot,
    afterCounter: latestCounter
  };
}

function sanitizeConfig(input = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(input || {}) };

  merged.rewardsLevel = ['member', 'silver', 'gold'].includes(merged.rewardsLevel)
    ? merged.rewardsLevel
    : DEFAULT_CONFIG.rewardsLevel;
  merged.searchCount = clamp(parseInt(merged.searchCount, 10) || DEFAULT_CONFIG.searchCount, 0, 30);
  merged.mobileSearchCount = clamp(parseInt(merged.mobileSearchCount, 10) || 0, 0, 30);
  merged.minDelay = clamp(parseInt(merged.minDelay, 10) || DEFAULT_CONFIG.minDelay, SAFE_DELAY_SECONDS.min, SAFE_DELAY_SECONDS.max);
  merged.maxDelay = clamp(parseInt(merged.maxDelay, 10) || DEFAULT_CONFIG.maxDelay, merged.minDelay, SAFE_DELAY_SECONDS.max);
  merged.mobileMode = Boolean(merged.mobileMode);
  merged.maxRetries = clamp(parseInt(merged.maxRetries, 10) || DEFAULT_CONFIG.maxRetries, 0, 5);
  merged.waveSize = clamp(parseInt(merged.waveSize, 10) || DEFAULT_CONFIG.waveSize, 0, 20);
  merged.wavePauseMin = clamp(parseInt(merged.wavePauseMin, 10) || DEFAULT_CONFIG.wavePauseMin, 0, 120);
  merged.speedLevel = clamp(parseInt(merged.speedLevel, 10) || DEFAULT_CONFIG.speedLevel, 1, 6);

  return merged;
}

async function getConfig() {
  const result = await chrome.storage.local.get('config');
  return sanitizeConfig(result.config || {});
}

async function saveConfig(config) {
  const sanitized = sanitizeConfig(config);
  await chrome.storage.local.set({ config: sanitized });
  log('[Config] Saved', 'success');
  return sanitized;
}

function resetRuntimeState() {
  state = createInitialState();
  recentKeywords = [];
  broadcastState();
}

function getSafeDelayRange(config) {
  return {
    minMs: (clamp(Number(config.minDelay) || DEFAULT_CONFIG.minDelay, SAFE_DELAY_SECONDS.min, SAFE_DELAY_SECONDS.max)) * 1000,
    maxMs: (clamp(Number(config.maxDelay) || DEFAULT_CONFIG.maxDelay, SAFE_DELAY_SECONDS.min, SAFE_DELAY_SECONDS.max)) * 1000
  };
}

async function refreshKeywordCache(forceRefresh = false) {
  keywordCache = await getAllKeywords({
    forceRefresh,
    onError: (error) => {
      log(`[Keywords] Google Trends fetch failed: ${error.message}. Using fallback pool.`, 'warning');
    }
  });

  if (!keywordCache.length) {
    keywordCache = ['microsoft rewards'];
  }

  return keywordCache;
}

async function pickKeyword() {
  if (!keywordCache.length) {
    await refreshKeywordCache();
  }

  const recentSet = new Set(recentKeywords.slice(-12).map((keyword) => keyword.toLowerCase()));
  const available = keywordCache.filter((keyword) => !recentSet.has(String(keyword).toLowerCase()));
  const pool = available.length ? available : keywordCache;
  const keyword = pool[randomInt(0, pool.length - 1)] || 'microsoft rewards';

  recentKeywords.push(keyword);
  if (recentKeywords.length > 24) {
    recentKeywords.splice(0, recentKeywords.length - 24);
  }

  return keyword;
}

async function touchKeepAlive() {
  try {
    await chrome.runtime.getPlatformInfo();
  } catch (error) {}
}

function startKeepAlive() {
  if (keepAliveTimer) return;

  keepAliveTimer = setInterval(() => {
    touchKeepAlive().catch(() => {});
  }, KEEP_ALIVE_INTERVAL_MS);
}

function stopKeepAlive() {
  if (!keepAliveTimer) return;

  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function assertNotStopped() {
  if (state.status === 'stopped') {
    throw new Error(USER_STOPPED_ERROR);
  }
}

async function waitWithStop(ms) {
  const deadline = Date.now() + Math.max(0, ms);
  let nextKeepAliveAt = Date.now();

  while (Date.now() < deadline) {
    assertNotStopped();

    const now = Date.now();
    if (now >= nextKeepAliveAt) {
      await touchKeepAlive();
      nextKeepAliveAt = now + KEEP_ALIVE_INTERVAL_MS;
    }

    const remaining = deadline - now;
    const untilKeepAlive = Math.max(0, nextKeepAliveAt - now);
    const slice = Math.max(250, Math.min(WAIT_SLICE_MS, remaining, untilKeepAlive || WAIT_SLICE_MS));
    await sleep(slice);
  }
}

async function getTabSafely(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    return null;
  }
}

async function closeTab(tabId) {
  if (!Number.isInteger(tabId)) return;

  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {}
}

async function waitForTabLoad(tabId, timeoutMs = TAB_LOAD_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    assertNotStopped();
    await touchKeepAlive();

    const tab = await getTabSafely(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} was closed before load completed`);
    }

    if (tab.status === 'complete') {
      return tab;
    }

    await waitWithStop(700);
  }

  throw new Error(`Timed out waiting for tab ${tabId} to finish loading`);
}

async function injectAutomationFile(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-automation.js'],
    world: AUTOMATION_WORLD
  });
}

async function callAutomationMethod(tabId, methodName, args = []) {
  await injectAutomationFile(tabId);

  const executionResults = await chrome.scripting.executeScript({
    target: { tabId },
    world: AUTOMATION_WORLD,
    func: async (name, methodArgs) => {
      const api = window.__BRA__;
      if (!api || typeof api[name] !== 'function') {
        return {
          success: false,
          error: `${name}_missing`
        };
      }

      return api[name](...(Array.isArray(methodArgs) ? methodArgs : []));
    },
    args: [methodName, args]
  });

  return executionResults?.[0]?.result || null;
}

async function setMobileMode(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [MOBILE_RULESET_ID] }
        : { disableRulesetIds: [MOBILE_RULESET_ID] }
    );

    state.mobileRuleEnabled = enabled;
    state.mobile.enabled = enabled;
    broadcastState();
    return true;
  } catch (error) {
    log(`[Mobile] Could not ${enabled ? 'enable' : 'disable'} UA rules: ${error.message}`, 'warning');
    return false;
  }
}

function syncSearchState(branchKey, label) {
  const branch = state[branchKey];
  branch.notCounted = Math.max(0, branch.executed - branch.counted);
  branch.progressText = `${branch.counted}/${branch.planned}`;
  branch.remaining = Math.max(0, branch.planned - branch.executed);
  state.progress = `${label} ${branch.progressText}`;
  state.percent = branch.planned > 0
    ? Math.min(100, Math.floor((branch.counted / branch.planned) * 100))
    : 0;
  state.currentSearch = branch.executed;
  state.totalSearches = branch.planned;
  broadcastState();
}

function syncTaskState() {
  state.progress = `Tasks ${state.tasks.completed}/${state.tasks.planned}`;
  state.percent = state.tasks.planned > 0
    ? Math.min(100, Math.floor((state.tasks.completed / state.tasks.planned) * 100))
    : 0;
  broadcastState();
}

async function runSingleSearch(keyword, isMobile) {
  let tab = null;

  try {
    tab = await chrome.tabs.create({
      url: BING_HOME_URL,
      active: false
    });

    await waitForTabLoad(tab.id);
    await waitWithStop(randomInt(...SEARCH_READY_DELAY_MS));

    const prepareResult = await callAutomationMethod(tab.id, 'prepareEnvironment', [{ mobile: isMobile }]);
    if (prepareResult?.summary) {
      log(`[Search] Environment: ${prepareResult.summary}`);
    }

    const searchResult = await callAutomationMethod(tab.id, 'typeAndSearch', [keyword, { mobile: isMobile }]);
    if (!searchResult?.success) {
      throw new Error(searchResult?.error || 'typeAndSearch failed');
    }

    await waitWithStop(randomInt(...SEARCH_SETTLE_DELAY_MS));
    await waitForTabLoad(tab.id);

    const interactionResult = await callAutomationMethod(tab.id, 'enhancedSearchInteraction', [{ mobile: isMobile }]);
    if (!interactionResult?.success) {
      log('[Search] Interaction step returned a non-success result.', 'warning');
    }

    await waitWithStop(randomInt(...INTERACTION_SETTLE_DELAY_MS));
    return { success: true };
  } finally {
    if (tab?.id) {
      await closeTab(tab.id);
    }
  }
}

async function runSearchAutomation(count, isMobile) {
  const config = await getConfig();
  const branchKey = isMobile ? 'mobile' : 'pc';
  const label = isMobile ? 'Mobile' : 'PC';
  const branch = state[branchKey];
  let targetCount = Math.max(0, Number(count) || 0);
  const delayRange = getSafeDelayRange(config);
  let snapshot = await fetchRewardsDashboard({
    context: `${label.toLowerCase()} baseline`,
    logCounters: true,
    silent: false
  });
  const initialCounter = getSnapshotCounter(snapshot, branchKey);

  branch.enabled = isMobile;
  branch.status = 'running';
  if (initialCounter?.remaining >= 0) {
    targetCount = Math.min(targetCount, initialCounter.remaining);
  }
  branch.planned = targetCount;
  branch.executed = 0;
  branch.counted = 0;
  branch.notCounted = 0;
  branch.remaining = targetCount;
  branch.counter = cloneCounter(initialCounter);
  branch.verificationMode = initialCounter ? 'counter' : 'availablePoints';
  branch.verificationBadge = initialCounter ? SUCCESS_BADGE : FALLBACK_BADGE;
  branch.lastOutcome = `${label} batch queued`;
  updateSummaryBadge();
  syncSearchState(branchKey, label);

  if (!Number.isFinite(state.points.baseline) && Number.isFinite(snapshot.availablePoints)) {
    applyBaselinePoints(snapshot.availablePoints);
    broadcastState();
  }

  if (targetCount === 0) {
    branch.status = 'done';
    branch.lastOutcome = `${label} batch skipped`;
    log(`[${label}] No remaining searches detected from Rewards counter.`, 'warning');
    syncSearchState(branchKey, label);
    return snapshot;
  }

  if (isMobile) {
    const enabled = await setMobileMode(true);
    if (!enabled) {
      throw new Error('Unable to enable mobile UA rules');
    }
    if (!initialCounter) {
      log('[Mobile] Rewards API did not expose a reliable mobile counter. Running best-effort mode.', 'warning');
    }
  }

  try {
    for (let index = 1; index <= targetCount; index += 1) {
      assertNotStopped();
      let counted = false;

      for (let retry = 0; retry <= config.maxRetries; retry += 1) {
        const beforeSnapshot = snapshot;
        const preferredKey = branch.counter?.key || getSnapshotCounter(beforeSnapshot, branchKey)?.key || null;
        const keyword = await pickKeyword();
        branch.lastOutcome = `${label} search ${index}/${targetCount}${retry > 0 ? ` retry ${retry}` : ''}`;
        syncSearchState(branchKey, label);
        log(`[${label}] Search ${index}/${targetCount}: ${keyword}`);

        await runSingleSearch(keyword, isMobile);
        branch.executed += 1;
        syncSearchState(branchKey, label);

        const verification = await verifySearchOutcome(beforeSnapshot, branchKey, {
          preferredKey,
          label
        });

        snapshot = verification.afterSnapshot || snapshot;
        branch.counter = cloneCounter(verification.afterCounter || getSnapshotCounter(snapshot, branchKey, preferredKey));
        branch.verificationMode = verification.mode;
        branch.verificationBadge = verification.mode === 'counter' ? SUCCESS_BADGE : FALLBACK_BADGE;
        updateSummaryBadge();

        if (verification.counted) {
          counted = true;
          branch.counted += 1;
          branch.lastConfidence = verification.confidence;
          branch.lastOutcome = `${label} search ${index}/${targetCount} counted`;
          if (branch.counter) {
            branch.remaining = branch.counter.remaining;
          }
          log(`[${label}] Search ${index} counted via ${verification.mode}${branch.counter ? ` (${formatCounter(branch.counter)})` : ''}`, 'success');
          syncSearchState(branchKey, label);
          break;
        }

        branch.lastOutcome = `${label} search ${index}/${targetCount} not counted`;
        syncSearchState(branchKey, label);
        log(`[${label}] Search ${index} was not confirmed by Rewards API.`, 'warning');

        if (retry < config.maxRetries) {
          await waitWithStop(randomInt(4000, 8000));
        }
      }

      if (!counted) {
        log(`[${label}] Search ${index} exhausted retries without counter movement.`, 'warning');
      }

      if (index < targetCount) {
        const delayMs = randomInt(delayRange.minMs, delayRange.maxMs);
        log(`[${label}] Delay ${Math.round(delayMs / 1000)}s before next search.`);
        await waitWithStop(delayMs);
      }
    }
  } finally {
    if (isMobile) {
      await setMobileMode(false);
    }
  }

  branch.status = 'done';
  branch.lastOutcome = `${label} batch complete`;
  updateSummaryBadge();
  syncSearchState(branchKey, label);
  return snapshot;
}

async function runTaskVisit(url) {
  let tab = null;

  try {
    tab = await chrome.tabs.create({
      url,
      active: false
    });

    await waitForTabLoad(tab.id);
    await waitWithStop(randomInt(...TASK_READY_DELAY_MS));

    const taskResult = await callAutomationMethod(tab.id, 'runTaskPageInteraction', [{ mobile: false }]);
    if (!taskResult?.success) {
      throw new Error(taskResult?.error || 'runTaskPageInteraction failed');
    }

    if (Array.isArray(taskResult?.clicked) && taskResult.clicked.length > 0) {
      log(`[Tasks] Clicked ${taskResult.clicked.length} action(s) on task page.`);
    }

    const dwellMs = randomInt(...TASK_DWELL_DELAY_MS);
    log(`[Tasks] Waiting ${Math.round(dwellMs / 1000)}s on task page.`);
    await waitWithStop(dwellMs);
  } finally {
    if (tab?.id) {
      await closeTab(tab.id);
    }
  }
}

async function scrapePointsFromRewardsPage() {
  const snapshot = await fetchRewardsDashboard({
    context: 'manual check',
    logCounters: true
  });

  if (!Number.isFinite(state.points.baseline) && Number.isFinite(snapshot.availablePoints)) {
    applyBaselinePoints(snapshot.availablePoints);
    broadcastState();
  }

  updateSummaryBadge();
  return snapshot.availablePoints;
}

async function runDailyTasksAutomation() {
  resetRuntimeState();
  state.status = 'running';
  state.progress = 'Tasks';
  state.percent = 0;
  broadcastState();
  startKeepAlive();

  try {
    const taskUrls = await fetchPendingDailyTaskUrls();
    state.tasks.planned = taskUrls.length;
    state.tasks.pending = taskUrls.length;
    state.tasks.lastSource = 'api';
    state.tasks.lastOutcome = taskUrls.length > 0 ? 'Pending tasks loaded from Rewards API' : 'No pending daily tasks';
    syncTaskState();

    if (taskUrls.length === 0) {
      state.status = 'done';
      state.progress = 'Completed';
      state.percent = 100;
      state.summary.verificationBadge = 'API Tasks';
      log('[Tasks] Rewards API returned no pending daily tasks.');
      broadcastState();
      return;
    }

    log(`[Tasks] Rewards API returned ${taskUrls.length} pending task URL(s).`);

    for (let index = 0; index < taskUrls.length; index += 1) {
      assertNotStopped();

      const url = taskUrls[index];
      state.tasks.lastOutcome = `Opening task ${index + 1}/${taskUrls.length}`;
      syncTaskState();
      log(`[Tasks] Opening ${index + 1}/${taskUrls.length}: ${url}`);

      await runTaskVisit(url);

      state.tasks.executed += 1;
      state.tasks.completed += 1;
      state.tasks.pending = Math.max(0, taskUrls.length - state.tasks.executed);
      state.tasks.lastOutcome = `Visited task ${index + 1}/${taskUrls.length}`;
      syncTaskState();

      if (index < taskUrls.length - 1) {
        await waitWithStop(randomInt(...TASK_COOLDOWN_DELAY_MS));
      }
    }

    state.status = 'done';
    state.progress = 'Completed';
    state.percent = 100;
    state.summary.verificationBadge = 'API Tasks';
    log('[Tasks] Daily tasks automation completed.', 'success');
    broadcastState();
  } catch (error) {
    if (error.message === USER_STOPPED_ERROR) {
      state.status = 'stopped';
      state.progress = 'Stopped';
      state.percent = 0;
      log('[Tasks] Stopped by user', 'warning');
      broadcastState();
      return;
    }

    state.status = 'error';
    state.progress = 'Error';
    state.percent = 0;
    log(`[Tasks] ${error.message}`, 'error');
    broadcastState();
  } finally {
    await setMobileMode(false);
    stopKeepAlive();
  }
}

async function runStartAutomation() {
  const config = await getConfig();

  resetRuntimeState();
  await refreshKeywordCache(true);
  state.status = 'running';
  state.progress = 'Preparing';
  state.percent = 0;
  broadcastState();
  startKeepAlive();

  try {
    const baselineSnapshot = await fetchRewardsDashboard({
      context: 'run baseline',
      logCounters: true
    });

    if (Number.isFinite(baselineSnapshot.availablePoints)) {
      applyBaselinePoints(baselineSnapshot.availablePoints);
      log(`[Summary] Baseline points: ${baselineSnapshot.availablePoints}`);
      broadcastState();
    }

    if (config.mobileMode && config.mobileSearchCount > 0) {
      await runSearchAutomation(config.mobileSearchCount, true);
    }

    assertNotStopped();
    await runSearchAutomation(config.searchCount, false);

    const finalSnapshot = await fetchRewardsDashboard({
      context: 'final verification',
      logCounters: true
    });

    if (Number.isFinite(finalSnapshot.availablePoints)) {
      applyCurrentPoints(finalSnapshot.availablePoints);
      log(`[Summary] Final points: ${finalSnapshot.availablePoints}`, 'success');
    }

    state.status = 'done';
    state.progress = 'Completed';
    state.percent = 100;
    updateSummaryBadge();
    log(`[Run] Search automation completed. Counted ${state.mobile.counted + state.pc.counted}/${state.mobile.planned + state.pc.planned}.`, 'success');
    broadcastState();
  } catch (error) {
    if (error.message === USER_STOPPED_ERROR) {
      state.status = 'stopped';
      state.progress = 'Stopped';
      state.percent = 0;
      log('[Run] Stopped by user', 'warning');
      broadcastState();
      return;
    }

    state.status = 'error';
    state.progress = 'Error';
    state.percent = 0;
    log(`[Run] ${error.message}`, 'error');
    broadcastState();
  } finally {
    await setMobileMode(false);
    stopKeepAlive();
  }
}

function startSearchRun() {
  if (activeRunPromise) {
    log('[Run] Another automation session is already active.', 'warning');
    return;
  }

  activeRunPromise = runStartAutomation()
    .catch((error) => {
      log(`[Run] ${error.message}`, 'error');
    })
    .finally(() => {
      activeRunPromise = null;
    });
}

function startDailyTasksRun() {
  if (activeRunPromise) {
    log('[Tasks] Another automation session is already active.', 'warning');
    return;
  }

  activeRunPromise = runDailyTasksAutomation()
    .catch((error) => {
      log(`[Tasks] ${error.message}`, 'error');
    })
    .finally(() => {
      activeRunPromise = null;
    });
}

async function handleCommand(command) {
  switch (command) {
    case 'start_search':
      startSearchRun();
      return;

    case 'daily_tasks':
      startDailyTasksRun();
      return;

    case 'stop':
      state.status = 'stopped';
      state.progress = 'Stopped';
      state.percent = 0;
      broadcastState();
      return;

    case 'reset_progress':
      await setMobileMode(false);
      stopKeepAlive();
      resetRuntimeState();
      log('[Reset] Runtime state cleared', 'success');
      return;

    case 'check_points':
      await scrapePointsFromRewardsPage();
      return;

    default:
      log(`[Command] ${STATUS_MESSAGES[command] || `Unknown command: ${command}`}`, 'warning');
      broadcastState();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'get_state') {
      sendResponse({
        state: getPublicState(),
        logs: logs.slice(0, 50)
      });
      return;
    }

    if (message.action === 'get_config') {
      sendResponse({ config: await getConfig() });
      return;
    }

    if (message.action === 'save_config') {
      sendResponse({
        success: true,
        config: await saveConfig(message.config)
      });
      return;
    }

    if (message.action === 'command') {
      await handleCommand(message.command);
      sendResponse({ received: true });
      return;
    }

    sendResponse({ ok: false });
  })().catch((error) => {
    sendResponse({
      success: false,
      error: error.message
    });
  });

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ config: await getConfig() });
  await setMobileMode(false);
});

chrome.runtime.onStartup.addListener(() => {
  setMobileMode(false).catch(() => {});
  broadcastState();
});

refreshKeywordCache()
  .then((keywords) => {
    log(`[Init] Background module ready with ${keywords.length} keywords.`, 'success');
    broadcastState();
  })
  .catch((error) => {
    keywordCache = ['microsoft rewards'];
    log(`[Init] Keyword bootstrap failed: ${error.message}`, 'warning');
    broadcastState();
  });
