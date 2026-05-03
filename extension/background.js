import { fetchPendingDailyTaskUrls, getTaskDedupKey, normalizeTaskUrl, scanUncompletedTasks } from './daily_tasks_new.js';
import { getAllKeywords } from './keywords-data.js';
import { getDashboardFromPayload, normalizeRewardsCounter } from './rewards_dashboard.js';
import { buildAutomationPlan, getRemainingSearchCountFromCounter, hasAutomationWork } from './rewards_planner.js';
import { shouldAcceptUnconfirmedSearch } from './search_verification.js';
import { buildMobileSearchWindowOptions, planManagedTabOpen } from './tab_policy.js';

const DEFAULT_CONFIG = Object.freeze({
  rewardsLevel: 'gold',
  searchCount: 30,
  mobileSearchCount: 30,
  minDelay: 20,
  maxDelay: 40,
  mobileMode: true,
  maxRetries: 2,
  waveSize: 4,
  wavePauseMin: 15,
  speedLevel: 3,
  autoRunOnOpen: true,
  autoRunTasks: true,
  mobileWindowModeVersion: 1
});

const BING_HOME_URL = 'https://www.bing.com/';
const REWARDS_HOME_URL = 'https://rewards.bing.com/';
const REWARDS_API_URL = 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest';
const GOOGLE_TRENDS_PAGE_URL = 'https://trends.google.com/trending?geo=VN&hl=vi';
const MOBILE_RULESET_ID = 'mobile_ua_rules';
const AUTOMATION_WORLD = 'MAIN';
const FETCH_TIMEOUT_MS = 15000;
const KEEP_ALIVE_HEARTBEAT_MS = 20000;
const ACTIVE_SESSION_ALARM_NAME = 'mv3-active-session-watchdog';
const ACTIVE_SESSION_ALARM_PERIOD_MINUTES = 0.5;
const WAIT_SLICE_MS = 1000;
const TAB_LOAD_TIMEOUT_MS = 45000;
const SEARCH_READY_DELAY_MS = [900, 1700];
const SEARCH_SETTLE_DELAY_MS = [1800, 3200];
const INTERACTION_SETTLE_DELAY_MS = [2200, 4200];
const SEARCH_VERIFY_ATTEMPTS = 3;
const SEARCH_VERIFY_DELAY_MS = 5000;
const SEARCH_RETRY_BACKOFF_MS = [4000, 9000];
const TASK_READY_DELAY_MS = [1200, 2200];
const TASK_DWELL_DELAY_MS = [5000, 10000];
const TASK_COOLDOWN_DELAY_MS = [1500, 3000];
const TASK_RETRY_BACKOFF_MS = [5000, 11000];
const TASK_VERIFY_SETTLE_DELAY_MS = [2500, 4500];
const MAX_TASK_ATTEMPTS = 3;
const TASK_INTERACTION_PASS_LIMIT = 5;
const SUCCESS_BADGE = 'API Verified';
const FALLBACK_BADGE = 'Fallback';
const MAX_RUNTIME_LOGS = 200;
const MAX_RECENT_KEYWORDS = 24;
const RUNTIME_STATE_KEY = 'runtimeState';
const RUNTIME_LOGS_KEY = 'runtimeLogs';
const RUNTIME_RECENT_KEYWORDS_KEY = 'runtimeRecentKeywords';
const RUNTIME_SESSION_KEY = 'runtimeSession';
const SAFE_DELAY_SECONDS = Object.freeze({
  min: 20,
  max: 40
});
const USER_STOPPED_ERROR = 'USER_STOPPED';
const RECOVERED_STATE_PROGRESS = 'Recovered after worker restart';
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

function createInitialRuntimeSession() {
  return {
    activeCommand: null,
    startedAt: null,
    heartbeatAt: null,
    heartbeatSource: null,
    bootstrapLogged: false
  };
}

let state = createInitialState();
let logs = [];
let keywordCache = [];
let recentKeywords = [];
let runtimeSession = createInitialRuntimeSession();
let keepAliveTimer = null;
let activeRunPromise = null;
let initPromise = null;
let persistInFlight = null;
let persistDirty = false;
let rewardsDashboardRecoveryTabId = null;
const managedTabIds = new Set();
const managedWindowIds = new Set();

function getPublicState() {
  return JSON.parse(JSON.stringify(state));
}

function getRuntimeStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

function mergePersistedState(savedState) {
  const initialState = createInitialState();
  const candidate = savedState && typeof savedState === 'object' ? savedState : {};

  return {
    ...initialState,
    ...candidate,
    wave: {
      ...initialState.wave,
      ...(candidate.wave || {})
    },
    points: {
      ...initialState.points,
      ...(candidate.points || {}),
      history: Array.isArray(candidate.points?.history)
        ? candidate.points.history.slice(0, 100)
        : []
    },
    mobile: {
      ...createSearchState(),
      ...(candidate.mobile || {})
    },
    pc: {
      ...createSearchState(),
      ...(candidate.pc || {})
    },
    tasks: {
      ...initialState.tasks,
      ...(candidate.tasks || {})
    },
    verification: {
      ...initialState.verification,
      ...(candidate.verification || {})
    },
    summary: {
      ...initialState.summary,
      ...(candidate.summary || {})
    }
  };
}

function normalizeLogs(savedLogs) {
  return Array.isArray(savedLogs)
    ? savedLogs
      .filter((entry) => entry && typeof entry === 'object')
      .slice(0, MAX_RUNTIME_LOGS)
    : [];
}

function normalizeRecentKeywords(savedKeywords) {
  return Array.isArray(savedKeywords)
    ? savedKeywords
      .filter((keyword) => typeof keyword === 'string' && keyword.trim())
      .slice(-MAX_RECENT_KEYWORDS)
    : [];
}

function normalizeRuntimeSession(savedSession) {
  return {
    ...createInitialRuntimeSession(),
    ...(savedSession && typeof savedSession === 'object' ? savedSession : {})
  };
}

function buildRuntimeSnapshot() {
  return {
    [RUNTIME_STATE_KEY]: getPublicState(),
    [RUNTIME_LOGS_KEY]: logs.slice(0, MAX_RUNTIME_LOGS),
    [RUNTIME_RECENT_KEYWORDS_KEY]: recentKeywords.slice(-MAX_RECENT_KEYWORDS),
    [RUNTIME_SESSION_KEY]: { ...runtimeSession }
  };
}

function scheduleRuntimePersist() {
  persistDirty = true;

  if (persistInFlight) {
    return persistInFlight;
  }

  persistInFlight = (async () => {
    const runtimeStorage = getRuntimeStorageArea();

    while (persistDirty) {
      persistDirty = false;
      await runtimeStorage.set(buildRuntimeSnapshot());
    }
  })()
    .catch((error) => {
      console.warn('[Runtime] Persist failed:', error);
    })
    .finally(() => {
      persistInFlight = null;
    });

  return persistInFlight;
}

async function persistRuntimeSession() {
  try {
    await getRuntimeStorageArea().set({
      [RUNTIME_SESSION_KEY]: { ...runtimeSession }
    });
  } catch (error) {
    console.warn('[Runtime] Session persist failed:', error);
  }
}

async function disableMobileRulesSilently() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: [MOBILE_RULESET_ID]
    });
  } catch (error) {}

  state.mobileRuleEnabled = false;
  state.mobile.enabled = false;
}

function isIgnorableBroadcastError(error) {
  const message = String(error?.message || error || '');

  return message.includes('Could not establish connection')
    || message.includes('Receiving end does not exist')
    || message.includes('The message port closed before a response was received');
}

async function broadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (!isIgnorableBroadcastError(error)) {
      console.debug('[Broadcast] Message dropped:', error);
    }
  }
}

function broadcastState() {
  void scheduleRuntimePersist();
  void broadcast({
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
  if (logs.length > MAX_RUNTIME_LOGS) {
    logs.length = MAX_RUNTIME_LOGS;
  }

  void scheduleRuntimePersist();
  void broadcast({ action: 'log', data: entry });
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

function parseIntegerWithDefault(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function buildRetryBackoffDelayMs(range, retryIndex) {
  const [minDelay, maxDelay] = range;
  const multiplier = 1 + (Math.max(0, retryIndex) * 0.6);
  return randomInt(
    Math.round(minDelay * multiplier),
    Math.round(maxDelay * multiplier)
  );
}

function hasPendingTaskUrl(pendingUrls, url) {
  const taskKey = getTaskDedupKey(url);
  return pendingUrls.some((pendingUrl) => getTaskDedupKey(pendingUrl) === taskKey);
}

function getTaskUrl(task) {
  return typeof task === 'string' ? task : task?.url;
}

function getTaskSourceUrl(task) {
  return typeof task === 'string' ? null : task?.sourceUrl || null;
}

function isMobileTask(task) {
  return typeof task === 'object' && Boolean(task?.mobile);
}

function isRewardsQuestUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.toLowerCase() === 'rewards.bing.com'
      && parsedUrl.pathname.toLowerCase().startsWith('/earn/quest/');
  } catch (error) {
    return false;
  }
}

async function scanTaskSourcePage(sourceUrl, scope) {
  let tab = null;

  try {
    tab = await openManagedTab(sourceUrl, { active: false });

    await waitForTabLoad(tab.id);
    await waitWithStop(randomInt(1800, 2600));

    const scanResult = await callAutomationMethod(tab.id, 'collectDashboardTaskLinks', [{ mobile: false, scope }]);
    if (!Array.isArray(scanResult?.tasks)) {
      throw new Error('collectDashboardTaskLinks returned an invalid payload');
    }

    return {
      tasks: scanResult.tasks,
      cardsVisited: Number(scanResult.cardsVisited || 0)
    };
  } finally {
    if (tab?.id) {
      await closeTab(tab.id);
    }
  }
}

async function fetchPendingTaskSnapshot() {
  const mergedTasks = new Map();
  const questSources = new Map();
  let apiError = null;
  let dashboardError = null;
  let apiCount = 0;
  let dashboardCount = 0;
  let dashboardVisitedCards = 0;
  let dailyCount = 0;
  let dailyVisitedCards = 0;
  let earnCount = 0;
  let earnVisitedCards = 0;
  let questCount = 0;
  let questVisitedCards = 0;

  const addTask = (rawTask, fallbackSourceUrl = null, fallbackSourceType = null) => {
    const rawUrl = getTaskUrl(rawTask);
    const normalizedUrl = normalizeTaskUrl(rawUrl);
    if (!normalizedUrl) return;

    const taskEntry = {
      url: normalizedUrl,
      sourceUrl: getTaskSourceUrl(rawTask) || fallbackSourceUrl || new URL('/earn', REWARDS_HOME_URL).toString(),
      sourceType: rawTask?.sourceType || fallbackSourceType || null,
      text: rawTask?.text || '',
      mobile: Boolean(rawTask?.mobile)
    };

    if (isRewardsQuestUrl(normalizedUrl)) {
      questSources.set(getTaskDedupKey(normalizedUrl), normalizedUrl);
      return;
    }

    mergedTasks.set(getTaskDedupKey(normalizedUrl), taskEntry);
  };

  try {
    const apiUrls = await fetchPendingDailyTaskUrls();
    apiCount = apiUrls.length;

    for (const rawUrl of apiUrls) {
      addTask(rawUrl, new URL('/earn', REWARDS_HOME_URL).toString(), 'api');
    }
  } catch (error) {
    apiError = error;
  }

  try {
    const dailySourceUrl = new URL('/dashboard', REWARDS_HOME_URL).toString();
    const dailyResult = await scanTaskSourcePage(dailySourceUrl, 'daily');
    dailyCount = dailyResult.tasks.length;
    dailyVisitedCards = dailyResult.cardsVisited;
    dailyResult.tasks.forEach((task) => addTask(task, dailySourceUrl, 'daily'));

    const earnSourceUrl = new URL('/earn', REWARDS_HOME_URL).toString();
    const earnResult = await scanTaskSourcePage(earnSourceUrl, 'earn');
    earnCount = earnResult.tasks.length;
    earnVisitedCards = earnResult.cardsVisited;
    earnResult.tasks.forEach((task) => addTask(task, earnSourceUrl, 'earn'));

    for (const questUrl of questSources.values()) {
      const questResult = await scanTaskSourcePage(questUrl, 'quest');
      questCount += questResult.tasks.length;
      questVisitedCards += questResult.cardsVisited;
      questResult.tasks.forEach((task) => addTask(task, questUrl, 'quest'));
    }

    dashboardCount = dailyCount + earnCount + questCount;
    dashboardVisitedCards = dailyVisitedCards + earnVisitedCards + questVisitedCards;
  } catch (error) {
    dashboardError = error;
  }

  if (!mergedTasks.size && apiError && dashboardError) {
    throw new Error(`Unable to load dashboard tasks: ${dashboardError.message}; API fallback failed: ${apiError.message}`);
  }

  const pendingTasks = [...mergedTasks.values()]
    .sort((leftTask, rightTask) => Number(Boolean(leftTask.mobile)) - Number(Boolean(rightTask.mobile)));
  const pendingUrls = pendingTasks.map((task) => task.url);
  return {
    pendingTasks,
    pendingUrls,
    pendingKeys: new Set(pendingUrls.map((url) => getTaskDedupKey(url))),
    sources: {
      apiCount,
      dashboardCount,
      dashboardVisitedCards,
      dailyCount,
      dailyVisitedCards,
      earnCount,
      earnVisitedCards,
      questCount,
      questVisitedCards,
      apiError: apiError?.message || null,
      dashboardError: dashboardError?.message || null
    }
  };
}

async function recoverInterruptedSessionIfNeeded() {
  const hadActiveSession = Boolean(runtimeSession.activeCommand);
  const wasRunning = state.status === 'running';

  if (!hadActiveSession && !state.mobileRuleEnabled) {
    return;
  }

  if (!hadActiveSession) {
    await disableMobileRulesSilently();
    void scheduleRuntimePersist();
    return;
  }

  const interruptedCommand = runtimeSession.activeCommand;
  await disableMobileRulesSilently();

  runtimeSession.activeCommand = null;
  runtimeSession.startedAt = null;
  runtimeSession.heartbeatAt = Date.now();
  runtimeSession.heartbeatSource = 'recovery';

  if (wasRunning) {
    state.status = 'stopped';
    state.progress = RECOVERED_STATE_PROGRESS;
    state.mobile.status = state.mobile.status === 'done' ? 'done' : 'idle';
    state.pc.status = state.pc.status === 'done' ? 'done' : 'idle';
    log(`[Recovery] Restored persisted state after service worker restart during "${interruptedCommand}".`, 'warning');
  } else {
    void scheduleRuntimePersist();
  }

  await chrome.alarms.clear(ACTIVE_SESSION_ALARM_NAME).catch(() => {});
  await persistRuntimeSession();
}

async function bootstrapKeywords() {
  try {
    const keywords = await refreshKeywordCache();

    if (!runtimeSession.bootstrapLogged) {
      runtimeSession.bootstrapLogged = true;
      log(`[Init] Background module ready with ${keywords.length} keywords.`, 'success');
      await persistRuntimeSession();
    }
  } catch (error) {
    keywordCache = ['microsoft rewards'];

    if (!runtimeSession.bootstrapLogged) {
      runtimeSession.bootstrapLogged = true;
      log(`[Init] Keyword bootstrap failed: ${error.message}`, 'warning');
      await persistRuntimeSession();
    }
  }
}

async function initializeRuntime() {
  const persisted = await getRuntimeStorageArea().get([
    RUNTIME_STATE_KEY,
    RUNTIME_LOGS_KEY,
    RUNTIME_RECENT_KEYWORDS_KEY,
    RUNTIME_SESSION_KEY
  ]);

  state = mergePersistedState(persisted[RUNTIME_STATE_KEY]);
  logs = normalizeLogs(persisted[RUNTIME_LOGS_KEY]);
  recentKeywords = normalizeRecentKeywords(persisted[RUNTIME_RECENT_KEYWORDS_KEY]);
  runtimeSession = normalizeRuntimeSession(persisted[RUNTIME_SESSION_KEY]);

  await recoverInterruptedSessionIfNeeded();
  void bootstrapKeywords();
}

function ensureInitialized() {
  if (!initPromise) {
    initPromise = initializeRuntime().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
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

async function fetchRewardsDashboardViaTab(options = {}) {
  const {
    active = false,
    closeAfter = true,
    settleMs = 1800
  } = options;
  let tab = null;

  try {
    tab = await openManagedTab(REWARDS_HOME_URL, {
      active,
      purpose: closeAfter ? 'generic' : 'dashboard'
    });

    if (active && tab.windowId) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (error) {}
    }

    await waitForTabLoad(tab.id);

    if (active && tab.windowId) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (error) {}
    }

    await waitWithStop(settleMs);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: AUTOMATION_WORLD,
      func: async (apiUrl) => {
        const buildVisiblePointsDashboard = (availablePoints) => ({
          userStatus: {
            availablePoints,
            counters: {}
          }
        });

        const isDashboardPayload = (payload) => {
          const dashboard = payload?.dashboard || payload;
          return Boolean(
            dashboard
            && typeof dashboard === 'object'
            && !Array.isArray(dashboard)
            && dashboard.userStatus
            && typeof dashboard.userStatus === 'object'
          );
        };

        const scrapeVisiblePoints = () => {
          const text = document.body?.innerText || '';
          const match = text.match(/Available points\s+([\d,.\s]+)/i);
          if (!match) return null;

          const value = Number.parseInt(match[1].replace(/[^\d]/g, ''), 10);
          return Number.isFinite(value) ? value : null;
        };

        const response = await fetch(apiUrl, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!response.ok) {
          const visiblePoints = scrapeVisiblePoints();
          if (Number.isFinite(visiblePoints)) {
            return buildVisiblePointsDashboard(visiblePoints);
          }

          throw new Error(`HTTP ${response.status}`);
        }

        try {
          const payload = await response.json();
          if (isDashboardPayload(payload)) {
            return payload;
          }

          const visiblePoints = scrapeVisiblePoints();
          if (Number.isFinite(visiblePoints)) {
            return buildVisiblePointsDashboard(visiblePoints);
          }

          return payload;
        } catch (error) {
          const visiblePoints = scrapeVisiblePoints();
          if (Number.isFinite(visiblePoints)) {
            return buildVisiblePointsDashboard(visiblePoints);
          }

          throw error;
        }
      },
      args: [REWARDS_API_URL]
    });

    return results?.[0]?.result;
  } finally {
    if (closeAfter && tab?.id) {
      await closeTab(tab.id);
    }
  }
}

async function fetchGoogleTrendsTextInBackground(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { ...(request.headers || {}) };
  delete headers.Referer;
  delete headers.referer;

  try {
    const response = await fetch(request.endpoint, {
      method: request.method,
      cache: 'no-store',
      credentials: 'include',
      headers,
      body: request.body,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Google Trends background fetch returned empty payload');
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGoogleTrendsTextViaTab(request) {
  let tab = null;

  try {
    const pageUrl = `https://trends.google.com/trending?geo=${encodeURIComponent(request.region || 'VN')}&hl=${encodeURIComponent(request.language || 'vi')}`;
    tab = await openManagedTab(pageUrl || GOOGLE_TRENDS_PAGE_URL, { active: false });

    await waitForTabLoad(tab.id);
    await waitWithStop(900);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: AUTOMATION_WORLD,
      func: async (fetchRequest) => {
        const headers = { ...(fetchRequest.headers || {}) };
        delete headers.Referer;
        delete headers.referer;

        const response = await fetch(fetchRequest.endpoint, {
          method: fetchRequest.method,
          cache: 'no-store',
          credentials: 'include',
          headers,
          body: fetchRequest.body
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.text();
      },
      args: [request]
    });

    const text = results?.[0]?.result;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Google Trends tab returned empty payload');
    }

    return text;
  } finally {
    if (tab?.id) {
      await closeTab(tab.id);
    }
  }
}

function getCountersSnapshot(dashboard) {
  const counters = dashboard?.userStatus?.counters;
  if (!counters || typeof counters !== 'object') return {};

  const snapshot = {};
  for (const [key, value] of Object.entries(counters)) {
    const normalized = normalizeRewardsCounter(key, value);
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
    mobileCounter: pickBestCounter(counters, 'mobile'),
    pendingTaskUrls: scanUncompletedTasks(dashboard)
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
    silent = false,
    allowFocusedRecovery = false
  } = options;

  let payload;
  let source = 'background_fetch';

  try {
    payload = await fetchJsonWithTimeout(REWARDS_API_URL);
    if (!getDashboardFromPayload(payload)) {
      throw new Error('Background fetch returned a non-dashboard payload');
    }
  } catch (error) {
    source = 'tab_fallback';
    payload = await fetchRewardsDashboardViaTab();
  }

  const dashboard = getDashboardFromPayload(payload);
  if (!dashboard) {
    source = 'dashboard_recovery';
    if (allowFocusedRecovery) {
      log('[API] Dashboard payload invalid; reusing one focused Rewards Dashboard tab for recovery.', 'warning');
      payload = await fetchRewardsDashboardViaTab({
        active: true,
        closeAfter: false,
        settleMs: 4500
      });
    } else {
      log('[API] Dashboard payload invalid; reusing one background Rewards Dashboard tab for recovery.', 'warning');
      payload = await fetchRewardsDashboardViaTab({
        active: false,
        closeAfter: false,
        settleMs: 4500
      });
    }
  }

  const recoveredDashboard = getDashboardFromPayload(payload);
  if (!recoveredDashboard) {
    throw new Error('Invalid rewards dashboard payload. Background Rewards Dashboard recovery failed; keep one Rewards dashboard tab signed in, then run again.');
  }

  const snapshot = createDashboardSnapshot(recoveredDashboard, source);
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
  merged.searchCount = clamp(parseIntegerWithDefault(merged.searchCount, DEFAULT_CONFIG.searchCount), 0, 30);
  merged.mobileSearchCount = clamp(parseIntegerWithDefault(merged.mobileSearchCount, 0), 0, 30);
  merged.minDelay = clamp(parseIntegerWithDefault(merged.minDelay, DEFAULT_CONFIG.minDelay), SAFE_DELAY_SECONDS.min, SAFE_DELAY_SECONDS.max);
  merged.maxDelay = clamp(parseIntegerWithDefault(merged.maxDelay, DEFAULT_CONFIG.maxDelay), merged.minDelay, SAFE_DELAY_SECONDS.max);
  merged.mobileMode = Boolean(merged.mobileMode);
  merged.maxRetries = clamp(parseIntegerWithDefault(merged.maxRetries, DEFAULT_CONFIG.maxRetries), 0, 5);
  merged.waveSize = clamp(parseIntegerWithDefault(merged.waveSize, DEFAULT_CONFIG.waveSize), 0, 20);
  merged.wavePauseMin = clamp(parseIntegerWithDefault(merged.wavePauseMin, DEFAULT_CONFIG.wavePauseMin), 0, 120);
  merged.speedLevel = clamp(parseIntegerWithDefault(merged.speedLevel, DEFAULT_CONFIG.speedLevel), 1, 6);
  merged.autoRunOnOpen = merged.autoRunOnOpen !== false;
  merged.autoRunTasks = merged.autoRunTasks !== false;
  merged.mobileWindowModeVersion = DEFAULT_CONFIG.mobileWindowModeVersion;

  return merged;
}

async function getConfig() {
  const runtimeStorage = chrome.storage.local;
  const result = await runtimeStorage.get('config');
  const savedConfig = result.config || {};
  const config = sanitizeConfig(savedConfig);

  if (savedConfig.mobileWindowModeVersion !== DEFAULT_CONFIG.mobileWindowModeVersion) {
    config.searchCount = DEFAULT_CONFIG.searchCount;
    config.mobileSearchCount = DEFAULT_CONFIG.mobileSearchCount;
    config.mobileMode = DEFAULT_CONFIG.mobileMode;
    await runtimeStorage.set({ config });
  }

  return config;
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
    fetchText: fetchGoogleTrendsTextInBackground,
    fallbackFetchText: fetchGoogleTrendsTextViaTab,
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
  if (recentKeywords.length > MAX_RECENT_KEYWORDS) {
    recentKeywords.splice(0, recentKeywords.length - MAX_RECENT_KEYWORDS);
  }

  void scheduleRuntimePersist();
  return keyword;
}

async function createActiveSessionAlarm() {
  await chrome.alarms.create(ACTIVE_SESSION_ALARM_NAME, {
    periodInMinutes: ACTIVE_SESSION_ALARM_PERIOD_MINUTES
  });
}

async function recordKeepAliveHeartbeat(source) {
  runtimeSession.heartbeatAt = Date.now();
  runtimeSession.heartbeatSource = source;
  await persistRuntimeSession();
}

async function startKeepAlive(command) {
  runtimeSession.activeCommand = command;
  runtimeSession.startedAt = Date.now();
  await createActiveSessionAlarm();
  await recordKeepAliveHeartbeat('session_start');
  void scheduleRuntimePersist();

  if (keepAliveTimer) return;

  keepAliveTimer = setInterval(() => {
    void recordKeepAliveHeartbeat('heartbeat');
  }, KEEP_ALIVE_HEARTBEAT_MS);
}

async function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  runtimeSession.activeCommand = null;
  runtimeSession.startedAt = null;
  await chrome.alarms.clear(ACTIVE_SESSION_ALARM_NAME).catch(() => {});
  await recordKeepAliveHeartbeat('session_end');
  void scheduleRuntimePersist();
}

function assertNotStopped() {
  if (state.status === 'stopped') {
    throw new Error(USER_STOPPED_ERROR);
  }
}

async function waitWithStop(ms) {
  const deadline = Date.now() + Math.max(0, ms);

  while (Date.now() < deadline) {
    assertNotStopped();

    const now = Date.now();
    const remaining = deadline - now;
    const slice = Math.max(250, Math.min(WAIT_SLICE_MS, remaining));
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

  managedTabIds.delete(tabId);
  if (tabId === rewardsDashboardRecoveryTabId) {
    rewardsDashboardRecoveryTabId = null;
  }

  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {}
}

async function closeWindow(windowId) {
  if (!Number.isInteger(windowId)) return;

  managedWindowIds.delete(windowId);

  try {
    const tabs = await chrome.tabs.query({ windowId });
    for (const tab of tabs) {
      if (Number.isInteger(tab.id)) {
        managedTabIds.delete(tab.id);
        if (tab.id === rewardsDashboardRecoveryTabId) {
          rewardsDashboardRecoveryTabId = null;
        }
      }
    }
  } catch (error) {}

  try {
    await chrome.windows.remove(windowId);
  } catch (error) {}
}

async function openManagedTab(url, options = {}) {
  const {
    active = false,
    purpose = 'generic',
    preferredDashboardTabId = rewardsDashboardRecoveryTabId
  } = options;
  const tabs = await chrome.tabs.query({});
  const plan = planManagedTabOpen({
    tabs,
    trackedTabIds: Array.from(managedTabIds),
    preferredDashboardTabId,
    purpose,
    url
  });

  for (const tabId of plan.closeTabIds || []) {
    await closeTab(tabId);
  }

  let tab = null;
  if (plan.action === 'update') {
    try {
      tab = await chrome.tabs.update(plan.tabId, { url, active });
    } catch (error) {
      tab = null;
    }
  }

  if (!tab) {
    tab = await chrome.tabs.create({ url, active });
  }

  if (tab?.id) {
    managedTabIds.add(tab.id);
    if (purpose === 'dashboard') {
      rewardsDashboardRecoveryTabId = tab.id;
    }
  }

  return tab;
}

async function openMobileSearchWindow(url) {
  const windowOptions = buildMobileSearchWindowOptions(url);
  const browserWindow = await chrome.windows.create(windowOptions);
  const tab = Array.isArray(browserWindow?.tabs) ? browserWindow.tabs[0] : null;

  if (!browserWindow?.id || !tab?.id) {
    throw new Error('Mobile search window was not created');
  }

  managedWindowIds.add(browserWindow.id);
  managedTabIds.add(tab.id);

  try {
    await chrome.windows.update(browserWindow.id, {
      focused: true,
      width: windowOptions.width,
      height: windowOptions.height,
      left: windowOptions.left,
      top: windowOptions.top
    });
  } catch (error) {}

  return {
    tab,
    windowId: browserWindow.id
  };
}

async function waitForTabLoad(tabId, timeoutMs = TAB_LOAD_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    assertNotStopped();

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

async function waitForInteractiveLoad(tabId, isMobile, phase) {
  if (!isMobile) {
    return waitForTabLoad(tabId);
  }

  try {
    return await waitForTabLoad(tabId, 15000);
  } catch (error) {
    if (!/Timed out waiting for tab/i.test(String(error?.message || error))) {
      throw error;
    }

    const tab = await getTabSafely(tabId);
    if (!tab) {
      throw error;
    }

    log(`[Mobile] ${phase} still loading; continuing visible browsing.`, 'warning');
    return tab;
  }
}

async function injectAutomationFile(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-automation.js'],
    world: AUTOMATION_WORLD
  });
}

async function callAutomationMethod(tabId, methodName, args = []) {
  if (!tabId) {
    return null;
  }

  try {
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
  } catch (error) {
    const message = String(error?.message || error || '');

    if (/Frame with ID 0|frame .* was removed|No frame with id 0/i.test(message)) {
      log(`[Automation] ${methodName} interrupted because the main frame was replaced. Will retry on the refreshed page.`, 'warning');
      return {
        success: false,
        error: 'frame_removed',
        retryable: true
      };
    }

    throw error;
  }
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
  const queuedRemaining = Math.max(0, branch.planned - branch.executed);
  const counterRemaining = getRemainingSearchCountFromCounter(branch.counter);

  branch.notCounted = Math.max(0, branch.executed - branch.counted);
  branch.progressText = `${branch.counted}/${branch.planned}`;
  branch.remaining = counterRemaining ?? queuedRemaining;
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

function logAutomationPlan(plan, context = 'Run') {
  const mobileText = plan.mobile.reason === 'complete'
    ? 'complete'
    : `${plan.mobile.count}${plan.mobile.remaining !== null ? `/${plan.mobile.remaining}` : ''}`;
  const pcText = plan.pc.reason === 'complete'
    ? 'complete'
    : `${plan.pc.count}${plan.pc.remaining !== null ? `/${plan.pc.remaining}` : ''}`;

  log(`[${context}] Plan: tasks ${plan.tasks.count}, mobile ${mobileText}, PC ${pcText}.`);
}

async function runSingleSearch(keyword, isMobile) {
  let tab = null;
  let mobileWindowId = null;

  try {
    if (isMobile) {
      const mobileWindow = await openMobileSearchWindow(BING_HOME_URL);
      tab = mobileWindow.tab;
      mobileWindowId = mobileWindow.windowId;
      log('[Mobile] Opened focused Edge mobile-sized window for search.');
    } else {
      tab = await openManagedTab(BING_HOME_URL, { active: false });
    }

    await waitForTabLoad(tab.id);
    await waitWithStop(randomInt(...SEARCH_READY_DELAY_MS));

    if (isMobile && tab.windowId) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (error) {}
    }

    const prepareResult = await callAutomationMethod(tab.id, 'prepareEnvironment', [{ mobile: isMobile }]);
    if (prepareResult?.summary) {
      log(`[Search] Environment: ${prepareResult.summary}`);
    }

    const searchResult = await callAutomationMethod(tab.id, 'typeAndSearch', [keyword, { mobile: isMobile }]);
    if (!searchResult?.success) {
      throw new Error(searchResult?.error || 'typeAndSearch failed');
    }

    await waitWithStop(randomInt(...SEARCH_SETTLE_DELAY_MS));
    await waitForInteractiveLoad(tab.id, isMobile, 'search results');

    if (isMobile) {
      log('[Mobile] Search submitted; scrolling search results.');
    }
    const interactionResult = await callAutomationMethod(tab.id, 'enhancedSearchInteraction', [{ mobile: isMobile }]);
    if (!interactionResult?.success) {
      log('[Search] Interaction step returned a non-success result.', 'warning');
    } else if (isMobile) {
      const candidateSuffix = Number.isFinite(interactionResult.resultCandidateCount)
        ? `; candidates ${interactionResult.resultCandidateCount}`
        : '';
      log(`[Mobile] Search results engagement: ${interactionResult.steps || 0} scrolls${interactionResult.openedResult ? '; opened result.' : '; no result opened.'}${candidateSuffix}`);
    }

    if (isMobile && interactionResult?.openedResult) {
      await waitWithStop(randomInt(1200, 2400));
      log('[Mobile] Opened a search result; scrolling destination page.');
      await waitForInteractiveLoad(tab.id, isMobile, 'destination page');

      try {
        const destinationResult = await callAutomationMethod(tab.id, 'browseDestinationPage', [{ mobile: isMobile }]);
        if (destinationResult?.success) {
          log(`[Mobile] Destination engagement: ${destinationResult.steps || 0} scrolls.`);
        } else {
          log('[Mobile] Destination engagement could not run; continuing to Rewards check.', 'warning');
        }
      } catch (error) {
        log(`[Mobile] Destination engagement failed: ${error.message}; continuing to Rewards check.`, 'warning');
      }
    }

    await waitWithStop(randomInt(...INTERACTION_SETTLE_DELAY_MS));
    return { success: true };
  } finally {
    if (mobileWindowId) {
      await closeWindow(mobileWindowId);
    } else if (tab?.id) {
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
  const remainingSearchCount = getRemainingSearchCountFromCounter(initialCounter);
  if (remainingSearchCount !== null) {
    targetCount = Math.min(targetCount, remainingSearchCount);
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

        try {
          await runSingleSearch(keyword, isMobile);
          branch.executed += 1;
          syncSearchState(branchKey, label);

          if (isMobile) {
            log('[Mobile] Checking Rewards points after visible browsing.');
          }
          const verification = await verifySearchOutcome(beforeSnapshot, branchKey, {
            preferredKey,
            label
          });

          snapshot = verification.afterSnapshot || snapshot;
          branch.counter = cloneCounter(verification.afterCounter || getSnapshotCounter(snapshot, branchKey, preferredKey));
          branch.verificationMode = verification.mode;
          branch.verificationBadge = verification.mode === 'counter' ? SUCCESS_BADGE : FALLBACK_BADGE;
          updateSummaryBadge();

          const acceptBestEffort = shouldAcceptUnconfirmedSearch({
            isMobile,
            initialCounter,
            verification
          });

          if (verification.counted || acceptBestEffort) {
            counted = true;
            branch.counted += 1;
            branch.lastConfidence = verification.confidence;
            branch.lastOutcome = acceptBestEffort
              ? `${label} search ${index}/${targetCount} submitted`
              : `${label} search ${index}/${targetCount} counted`;
            if (branch.counter) {
              branch.remaining = getRemainingSearchCountFromCounter(branch.counter) ?? branch.counter.remaining;
            }
            log(
              acceptBestEffort
                ? `[${label}] Search ${index} submitted; Rewards API has no mobile counter, accepting best-effort.`
                : `[${label}] Search ${index} counted via ${verification.mode}${branch.counter ? ` (${formatCounter(branch.counter)})` : ''}`,
              'success'
            );
            syncSearchState(branchKey, label);
            break;
          }

          branch.lastOutcome = `${label} search ${index}/${targetCount} not counted`;
          syncSearchState(branchKey, label);
          log(`[${label}] Search ${index} was not confirmed by Rewards API.`, 'warning');
        } catch (error) {
          if (error.message === USER_STOPPED_ERROR) {
            throw error;
          }

          branch.lastOutcome = `${label} search ${index}/${targetCount} failed`;
          syncSearchState(branchKey, label);
          log(`[${label}] Search ${index} attempt ${retry + 1} failed: ${error.message}`, 'warning');
        }

        if (retry < config.maxRetries) {
          const retryDelayMs = buildRetryBackoffDelayMs(SEARCH_RETRY_BACKOFF_MS, retry);
          log(`[${label}] Retry backoff ${Math.round(retryDelayMs / 1000)}s before re-opening a fresh tab.`, 'warning');
          await waitWithStop(retryDelayMs);
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

function summarizeTaskInteraction(taskResult) {
  if (!taskResult || typeof taskResult !== 'object') {
    return 'standard';
  }

  const mode = taskResult.mode || 'standard';
  const answers = Number(taskResult.answersClicked || 0);
  const clicked = Array.isArray(taskResult.clicked) ? taskResult.clicked.length : 0;
  return `${mode} | answers ${answers} | clicks ${clicked}`;
}

async function verifyTaskCompletion(url) {
  await waitWithStop(randomInt(...TASK_VERIFY_SETTLE_DELAY_MS));
  const snapshot = await fetchPendingTaskSnapshot();

  return {
    completed: !hasPendingTaskUrl(snapshot.pendingUrls, url),
    pendingUrls: snapshot.pendingUrls,
    pendingKeys: snapshot.pendingKeys
  };
}

function taskTabMatchesUrl(tabUrl, targetUrl) {
  const normalizedTabUrl = normalizeTaskUrl(tabUrl);
  if (!normalizedTabUrl) return false;

  return getTaskDedupKey(normalizedTabUrl) === getTaskDedupKey(targetUrl);
}

function stripUrlHash(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch (error) {
    return String(url || '');
  }
}

async function waitForClickedTaskTab(dashboardTabId, targetUrl, knownTabIds, sourceUrl = null) {
  const deadline = Date.now() + 18000;
  const normalizedSourceUrl = sourceUrl ? stripUrlHash(sourceUrl) : null;

  while (Date.now() < deadline) {
    const tabs = await chrome.tabs.query({});
    const dashboardTab = tabs.find((tab) => tab.id === dashboardTabId);

    if (dashboardTab?.url && taskTabMatchesUrl(dashboardTab.url, targetUrl)) {
      return dashboardTab;
    }

    if (
      dashboardTab?.url
      && normalizedSourceUrl
      && stripUrlHash(dashboardTab.url) !== normalizedSourceUrl
      && !/^chrome:|^edge:/i.test(dashboardTab.url)
    ) {
      return dashboardTab;
    }

    const matchedTab = tabs.find((tab) => {
      if (!tab?.id || tab.id === dashboardTabId) return false;
      if (!tab.url || !taskTabMatchesUrl(tab.url, targetUrl)) return false;
      return tab.openerTabId === dashboardTabId || !knownTabIds.has(tab.id);
    });

    if (matchedTab) {
      return matchedTab;
    }

    await waitWithStop(500);
  }

  return null;
}

async function openTaskViaRewardsDashboard(task) {
  const url = getTaskUrl(task);
  const sourceUrl = getTaskSourceUrl(task) || new URL('/earn', REWARDS_HOME_URL).toString();
  const knownTabs = await chrome.tabs.query({});
  const knownTabIds = new Set(knownTabs.map((tab) => tab.id).filter(Boolean));
  const dashboardTab = await openManagedTab(sourceUrl, { active: false });

  try {
    await waitForTabLoad(dashboardTab.id);
    await waitWithStop(randomInt(1800, 2600));

    const clickResult = await callAutomationMethod(dashboardTab.id, 'openDashboardTaskLink', [url, { mobile: isMobileTask(task) }]);
    if (!clickResult?.success) {
      throw new Error(clickResult?.error || 'task_link_click_failed');
    }

    const taskTab = await waitForClickedTaskTab(dashboardTab.id, url, knownTabIds, sourceUrl);
    if (!taskTab?.id) {
      log('[Tasks] Rewards card did not open a new task page; verifying click-through in place.', 'warning');
      return { dashboardTab, taskTab: dashboardTab, clickResult };
    }

    log(`[Tasks] Clicked Rewards card: ${clickResult.text || clickResult.href || url}`);
    return { dashboardTab, taskTab, clickResult };
  } catch (error) {
    if (dashboardTab?.id) {
      await closeTab(dashboardTab.id);
    }
    throw error;
  }
}

async function runTaskVisit(task) {
  const url = getTaskUrl(task);
  const taskUsesMobile = isMobileTask(task);
  let tab = null;
  let dashboardTab = null;

  try {
    if (taskUsesMobile) {
      await setMobileMode(true);
    }

    const openedTask = await openTaskViaRewardsDashboard(task);
    dashboardTab = openedTask.dashboardTab;
    tab = openedTask.taskTab;

    await waitForTabLoad(tab.id);
    // Background dwell: wait after load before injecting interactions.
    await waitWithStop(randomInt(2000, 3000));

    let taskResult = null;

    for (let pass = 1; pass <= TASK_INTERACTION_PASS_LIMIT; pass += 1) {
      try {
        taskResult = await callAutomationMethod(tab.id, 'runTaskPageInteraction', [{ mobile: taskUsesMobile }]);
      } catch (error) {
        const message = String(error?.message || error || '');
        if (/Cannot access|Missing host permission|host permissions|The extensions gallery cannot be scripted|chrome:\/\//i.test(message)) {
          taskResult = {
            success: true,
            mode: 'external',
            clicked: [],
            answersClicked: 0
          };
          log('[Tasks] Task page is outside extension host permissions; using click-through dwell only.', 'warning');
          break;
        }

        throw error;
      }

      if (taskResult?.success) {
        break;
      }

      if (taskResult?.retryable) {
        log(`[Tasks] Re-syncing task tab after frame reset (pass ${pass}/${TASK_INTERACTION_PASS_LIMIT}).`, 'warning');
        await waitForTabLoad(tab.id);
        await waitWithStop(randomInt(1800, 2800));
        continue;
      }

      throw new Error(taskResult?.error || 'runTaskPageInteraction failed');
    }

    if (!taskResult?.success) {
      throw new Error(taskResult?.error || 'runTaskPageInteraction failed');
    }

    log(`[Tasks] Interaction mode: ${summarizeTaskInteraction(taskResult)}`);
    if (Array.isArray(taskResult?.clicked) && taskResult.clicked.length > 0) {
      log(`[Tasks] Clicked ${taskResult.clicked.length} action(s) on task page.`);
    }

    // Anti-ban: giữ tab mở 8-15 giây để Bing có thời gian ghi nhận điểm như một phiên tương tác thật.
    const dwellMs = randomInt(8000, 15000);
    log(`[Tasks] Anti-ban dwell ${Math.round(dwellMs / 1000)}s before closing task tab.`);
    await waitWithStop(dwellMs);
    return taskResult;
  } finally {
    if (tab?.id && tab.id !== dashboardTab?.id) {
      await closeTab(tab.id);
      await waitWithStop(10000);
    }
    if (dashboardTab?.id) {
      await closeTab(dashboardTab.id);
    }
    if (taskUsesMobile) {
      await setMobileMode(false);
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
  await startKeepAlive('daily_tasks');

  try {
    const initialSnapshot = await fetchPendingTaskSnapshot();
    const taskEntries = initialSnapshot.pendingTasks || initialSnapshot.pendingUrls.map((url) => ({ url }));
    const taskUrls = taskEntries.map((task) => task.url);
    const sourceSummary = initialSnapshot.sources || {};
    let latestPendingUrls = [...taskUrls];
    state.tasks.planned = taskUrls.length;
    state.tasks.pending = taskUrls.length;
    state.tasks.lastSource = 'dashboard+api';
    state.tasks.lastOutcome = taskUrls.length > 0
      ? 'Pending tasks loaded from Rewards Dashboard + API'
      : 'No pending dashboard tasks';
    syncTaskState();

    if (sourceSummary.dashboardError) {
      log(`[Tasks] Dashboard scrape warning: ${sourceSummary.dashboardError}`, 'warning');
    }
    if (sourceSummary.apiError) {
      log(`[Tasks] API fallback warning: ${sourceSummary.apiError}`, 'warning');
    }
    log(
      `[Tasks] Task scan found ${sourceSummary.dashboardCount || 0} URL(s) across ${sourceSummary.dashboardVisitedCards || 0} card(s): daily ${sourceSummary.dailyCount || 0}, earn ${sourceSummary.earnCount || 0}, quest ${sourceSummary.questCount || 0}; API reported ${sourceSummary.apiCount || 0}.`
    );

    if (taskUrls.length === 0) {
      state.status = 'done';
      state.progress = 'Completed';
      state.percent = 100;
      state.summary.verificationBadge = 'Dashboard Tasks';
      log('[Tasks] Rewards Dashboard has no pending tasks.');
      broadcastState();
      return;
    }

    log(`[Tasks] Combined task queue contains ${taskUrls.length} pending URL(s).`);

    for (let index = 0; index < taskUrls.length; index += 1) {
      assertNotStopped();

      const task = taskEntries[index];
      const url = getTaskUrl(task);
      if (!hasPendingTaskUrl(latestPendingUrls, url)) {
        state.tasks.completed = Math.max(state.tasks.completed, state.tasks.planned - latestPendingUrls.length);
        state.tasks.executed = state.tasks.completed;
        state.tasks.pending = latestPendingUrls.length;
        state.tasks.lastOutcome = `Task ${index + 1}/${taskUrls.length} already cleared by API`;
        syncTaskState();
        log(`[Tasks] Skipping already-cleared task ${index + 1}/${taskUrls.length}.`);
      } else {
        let taskCompleted = false;
        const maxAttempts = isMobileTask(task) ? 1 : MAX_TASK_ATTEMPTS;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          state.tasks.lastOutcome = `Opening task ${index + 1}/${taskUrls.length}${attempt > 1 ? ` retry ${attempt - 1}` : ''}`;
          syncTaskState();
          // Anti-ban: luôn xử lý tuần tự từng tab một, không mở đồng thời nhiều task để tránh bị đánh dấu spam.
          log(`[Tasks] Opening ${index + 1}/${taskUrls.length}${attempt > 1 ? ` retry ${attempt - 1}` : ''}: ${url}`);

          try {
            await runTaskVisit(task);
            const verification = await verifyTaskCompletion(url);
            latestPendingUrls = verification.pendingUrls;
            state.tasks.pending = latestPendingUrls.length;

            if (verification.completed) {
              taskCompleted = true;
              state.tasks.completed = Math.max(state.tasks.completed + 1, state.tasks.planned - latestPendingUrls.length);
              state.tasks.executed = state.tasks.completed;
              state.tasks.lastOutcome = `Completed task ${index + 1}/${taskUrls.length}`;
              syncTaskState();
              log(`[Tasks] Task ${index + 1} verified by Dashboard snapshot.`, 'success');
              break;
            }

            state.tasks.lastOutcome = `Task ${index + 1}/${taskUrls.length} still pending after attempt ${attempt}`;
            syncTaskState();
            log(`[Tasks] Task ${index + 1} was not removed from the pending list after attempt ${attempt}.`, 'warning');
          } catch (error) {
            try {
              const verification = await verifyTaskCompletion(url);
              latestPendingUrls = verification.pendingUrls;
              state.tasks.pending = latestPendingUrls.length;

              if (verification.completed) {
                taskCompleted = true;
                state.tasks.completed = Math.max(state.tasks.completed + 1, state.tasks.planned - latestPendingUrls.length);
                state.tasks.executed = state.tasks.completed;
                state.tasks.lastOutcome = `Completed task ${index + 1}/${taskUrls.length}`;
                syncTaskState();
                log(`[Tasks] Task ${index + 1} verified after click fallback.`, 'success');
                break;
              }
            } catch (verificationError) {}

            state.tasks.lastOutcome = `Task ${index + 1}/${taskUrls.length} failed`;
            syncTaskState();
            log(`[Tasks] Task ${index + 1} attempt ${attempt} failed: ${error.message}`, 'warning');
          }

          if (attempt < maxAttempts) {
            const retryDelayMs = buildRetryBackoffDelayMs(TASK_RETRY_BACKOFF_MS, attempt - 1);
            log(`[Tasks] Retry backoff ${Math.round(retryDelayMs / 1000)}s before opening a fresh task tab.`, 'warning');
            await waitWithStop(retryDelayMs);
          }
        }

        if (!taskCompleted) {
          state.tasks.fallbackUsed = true;

          try {
            const verification = await fetchPendingTaskSnapshot();
            latestPendingUrls = verification.pendingUrls;
            state.tasks.pending = latestPendingUrls.length;
          } catch (error) {}

          state.tasks.completed = Math.max(0, state.tasks.planned - state.tasks.pending);
          state.tasks.executed = state.tasks.completed;
          state.tasks.lastOutcome = `Task ${index + 1}/${taskUrls.length} exhausted retries`;
          syncTaskState();
          log(`[Tasks] Task ${index + 1} exhausted retries and remains pending.`, 'warning');
        }
      }

      if (index < taskUrls.length - 1) {
        // Anti-ban: nghỉ ngắn giữa hai task để nhịp mở tab không quá dày đặc.
        await waitWithStop(randomInt(...TASK_COOLDOWN_DELAY_MS));
      }
    }

    try {
      const finalSnapshot = await fetchPendingTaskSnapshot();
      latestPendingUrls = finalSnapshot.pendingUrls;
      state.tasks.pending = latestPendingUrls.length;
    } catch (error) {}

    state.tasks.completed = Math.max(0, state.tasks.planned - state.tasks.pending);
    state.tasks.executed = state.tasks.completed;
    state.status = 'done';
    state.progress = 'Completed';
    state.percent = 100;
    state.summary.verificationBadge = 'Dashboard Tasks';
    state.tasks.lastOutcome = state.tasks.pending === 0
      ? 'All tasks verified by Rewards Dashboard'
      : `${state.tasks.pending} task(s) still pending after retries`;
    log(
      state.tasks.pending === 0
        ? '[Tasks] Daily tasks automation completed.'
        : `[Tasks] Daily tasks automation finished with ${state.tasks.pending} pending task(s).`,
      state.tasks.pending === 0 ? 'success' : 'warning'
    );
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
    await stopKeepAlive();
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
  await startKeepAlive('start_search');

  try {
    const baselineSnapshot = await fetchRewardsDashboard({
      context: 'run baseline',
      logCounters: true
    });
    const plan = buildAutomationPlan(config, baselineSnapshot);
    logAutomationPlan(plan, 'Run');

    if (Number.isFinite(baselineSnapshot.availablePoints)) {
      applyBaselinePoints(baselineSnapshot.availablePoints);
      log(`[Summary] Baseline points: ${baselineSnapshot.availablePoints}`);
      broadcastState();
    }

    if (!hasAutomationWork(plan)) {
      state.status = 'done';
      state.progress = 'Completed';
      state.percent = 100;
      log('[Run] No remaining Rewards work detected.', 'success');
      broadcastState();
      return;
    }

    if (plan.tasks.count > 0) {
      log(`[Run] Pending dashboard tasks detected; running ${plan.tasks.count} task(s) before searches.`);
      await runDailyTasksAutomation();
      assertNotStopped();
      state.status = 'running';
      state.progress = 'Preparing searches';
      state.percent = 0;
      broadcastState();
      await startKeepAlive('start_search');
    }

    if (plan.mobile.count > 0) {
      await runSearchAutomation(plan.mobile.count, true);
    } else if (plan.mobile.reason === 'complete') {
      log('[Run] Mobile search already complete; skipping mobile worker.');
    }

    assertNotStopped();
    if (plan.pc.count > 0) {
      await runSearchAutomation(plan.pc.count, false);
    } else if (plan.pc.reason === 'complete') {
      log('[Run] PC search already complete; skipping PC worker.');
    }

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
    await stopKeepAlive();
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

async function maybeAutoStartSearchRun(reason = 'auto') {
  if (activeRunPromise || state.status === 'running' || state.status === 'cooldown') {
    return { started: false, reason: 'active' };
  }

  const config = await getConfig();
  if (!config.autoRunOnOpen) {
    return { started: false, reason: 'disabled' };
  }

  let snapshot = null;
  try {
    snapshot = await fetchRewardsDashboard({
      context: `auto ${reason}`,
      logCounters: true,
      allowFocusedRecovery: false
    });
  } catch (error) {
    log(`[Auto] Could not check remaining Rewards work in background: ${error.message}`, 'warning');
    return { started: false, reason: 'dashboard_unavailable' };
  }

  const plan = buildAutomationPlan(config, snapshot);
  logAutomationPlan(plan, 'Auto');

  if (!hasAutomationWork(plan)) {
    log('[Auto] No remaining Rewards work detected.');
    return { started: false, reason: 'complete' };
  }

  log('[Auto] Remaining Rewards work detected; starting background run.', 'success');
  startSearchRun();
  return { started: true, reason: 'remaining_work' };
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
      if (activeRunPromise) {
        state.status = 'stopped';
        state.progress = 'Stopped';
        state.percent = 0;
        broadcastState();
        log('[Reset] Stop requested. Clear progress again after the active run exits.', 'warning');
        return;
      }

      await setMobileMode(false);
      await stopKeepAlive();
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
    await ensureInitialized();

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

    if (message.action === 'maybe_auto_start') {
      sendResponse(await maybeAutoStartSearchRun(message.reason || 'message'));
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ACTIVE_SESSION_ALARM_NAME) {
    return;
  }

  (async () => {
    await ensureInitialized();

    if (!runtimeSession.activeCommand) {
      await chrome.alarms.clear(ACTIVE_SESSION_ALARM_NAME).catch(() => {});
      return;
    }

    await recordKeepAliveHeartbeat('alarm');
  })().catch((error) => {
    console.warn('[Alarm] Active-session watchdog failed:', error);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    await ensureInitialized();
    await chrome.storage.local.set({ config: await getConfig() });
    await disableMobileRulesSilently();
    await stopKeepAlive();
    broadcastState();
  })().catch((error) => {
    console.warn('[Lifecycle] onInstalled failed:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  (async () => {
    await ensureInitialized();
    await disableMobileRulesSilently();
    broadcastState();
  })
    .catch((error) => {
      console.warn('[Lifecycle] onStartup failed:', error);
    });
  });

void ensureInitialized();
