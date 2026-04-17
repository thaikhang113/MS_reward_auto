// =============================================
// MICROSOFT REWARDS AUTO - MV3 BACKGROUND WORKER
// Classic service worker architecture:
// - importScripts() for stable helper loading
// - single in-memory runtime state
// - explicit keep-alive during long search delays
// =============================================

try {
  importScripts('keywords-data.js', 'daily_tasks_new.js');
} catch (error) {
  console.error('Failed to load helper scripts:', error);
}

const REWARDS_API_URL = 'https://rewards.bing.com/api/getuserinfo?type=1';
const REWARDS_HOME_URL = 'https://rewards.bing.com/';
const BING_HOME_URL = 'https://www.bing.com/';
const GOOGLE_TRENDS_TRENDING_URL = 'https://trends.google.com/trending';
const GOOGLE_TRENDS_BATCH_URL = 'https://trends.google.com/_/TrendsUi/data/batchexecute';

const FETCH_TIMEOUT_MS = 15000;
const TAB_LOAD_TIMEOUT_MS = 45000;
const KEEP_ALIVE_INTERVAL_MS = 20000;
const WAIT_SLICE_MS = 5000;
const SEARCH_VERIFY_ATTEMPTS = 3;
const SEARCH_VERIFY_DELAY_MS = 5000;
const TASK_SETTLE_DELAY_MS = 4500;

const SUCCESS_BADGE = 'API Verified';
const FALLBACK_BADGE = 'Fallback';
const USER_STOPPED_ERROR = 'USER_STOPPED';

const MOBILE_COUNTER_RE = /mobile/i;
const PC_COUNTER_RE = /pc|desktop/i;
const SEARCH_COUNTER_RE = /search/i;
const SEARCH_COUNTER_EXCLUDE_RE = /edge|bonus|streak|check.?in|offer|task|quiz|poll|punch|read|news|activity|promo/i;
const GOOGLE_TRENDS_SID_RE = /"FdrFJe":"([^"]+)"/;
const GOOGLE_TRENDS_BUILD_RE = /"cfb2h":"([^"]+)"/;

const DEFAULT_CONFIG = {
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
};

const TIER_LIMITS = {
  member: { maxSearch: 3 },
  silver: { maxSearch: 6 },
  gold: { maxSearch: 12 }
};

const GOOGLE_TRENDS_CONFIG = {
  geo: 'VN',
  hl: 'vi',
  hours: 24,
  rpcId: 'i0OFE',
  cacheTtlMs: 30 * 60 * 1000
};

const TASK_HELPERS = self.DAILY_TASKS_HELPERS || {};
const normalizeTaskUrl = TASK_HELPERS.normalizeTaskUrl || ((value) => value);
const getTaskDedupKey = TASK_HELPERS.getTaskDedupKey || ((value) => String(value || ''));
const scanUncompletedTasks = TASK_HELPERS.scanUncompletedTasks || (() => []);
const isSupportedTaskUrl = TASK_HELPERS.isSupportedTaskUrl || ((url) => /bing\.com|msn\.com|microsoft\.com/i.test(String(url || '')));

function createSearchState(enabled = false) {
  return {
    enabled,
    status: 'idle',
    planned: 0,
    executed: 0,
    counted: 0,
    notCounted: 0,
    remaining: null,
    counter: null,
    progressText: '0/0',
    verificationMode: 'counter',
    verificationBadge: SUCCESS_BADGE,
    lastOutcome: '',
    lastConfidence: 'high'
  };
}

function createTasksState() {
  return {
    planned: 0,
    executed: 0,
    completed: 0,
    pending: 0,
    fallbackUsed: false,
    lastSource: 'api',
    lastOutcome: 'Idle'
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
    logs: [],
    mobileRuleEnabled: false,
    points: {
      current: null,
      earned: 0,
      baseline: null,
      final: null,
      lastCheck: null,
      history: []
    },
    pc: createSearchState(false),
    mobile: createSearchState(false),
    tasks: createTasksState(),
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
      verificationBadge: SUCCESS_BADGE
    }
  };
}

function createRuntimeMemory() {
  return {
    keywordPool: [],
    keywordSource: 'pending',
    keywordRefreshedAt: 0,
    keywordRefreshPromise: null,
    trendsRequestId: (Date.now() % 900000) + 100000,
    recentKeywords: {
      pc: [],
      mobile: []
    },
    attemptedTaskKeys: new Set()
  };
}

let state = createInitialState();
let runtimeMemory = createRuntimeMemory();
let keepAliveTimer = null;
let activeRunPromise = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minSeconds, maxSeconds) {
  return randomInt(minSeconds * 1000, maxSeconds * 1000);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatSignedDelta(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value}`;
}

function formatCounter(counter) {
  if (!counter) return 'n/a';
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

function isRunActive() {
  return state.status === 'running' || state.status === 'cooldown';
}

function isRewardsRelatedUrl(url) {
  return typeof url === 'string' && /(bing\.com|msn\.com|microsoft\.com)/i.test(url);
}

function isInjectableAutomationUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (!/^https:/i.test(url)) return false;
  return /(^https:\/\/)([^/]+\.)?(bing\.com|msn\.com|microsoft\.com)\//i.test(url);
}

function getPublicState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.logs;
  return snapshot;
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

  state.logs.unshift(entry);
  if (state.logs.length > 200) {
    state.logs.length = 200;
  }

  broadcast({ action: 'log', data: entry });
}

function recordPointSnapshot(points, label) {
  if (!Number.isFinite(points)) return;

  state.points.history.push({
    time: new Date().toLocaleTimeString(),
    label,
    points
  });

  if (state.points.history.length > 50) {
    state.points.history = state.points.history.slice(-50);
  }
}

function applyCurrentPoints(points, label = null) {
  if (!Number.isFinite(points)) return;

  state.points.current = points;
  state.points.final = points;
  state.points.lastCheck = Date.now();
  state.summary.finalPoints = points;

  if (Number.isFinite(state.points.baseline)) {
    state.points.earned = points - state.points.baseline;
    state.summary.totalEarned = state.points.earned;
  }

  if (label) {
    recordPointSnapshot(points, label);
  }
}

function applyBaselinePoints(points) {
  if (!Number.isFinite(points)) return;

  state.points.baseline = points;
  state.points.earned = 0;
  state.summary.baselinePoints = points;
  state.summary.finalPoints = points;
  state.summary.totalEarned = 0;
  state.points.history = [];
  applyCurrentPoints(points, 'baseline');
}

function getFallbackKeywordPool() {
  const source = typeof self.getAllKeywords === 'function'
    ? self.getAllKeywords()
    : (Array.isArray(self.KEYWORD_LIST) ? self.KEYWORD_LIST : []);

  return Array.isArray(source) && source.length
    ? [...source]
    : ['bing rewards', 'microsoft rewards', 'bing search'];
}

function normalizeKeyword(value) {
  if (typeof value !== 'string') return '';

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 3 || normalized.length > 120) return '';
  if (!/[\p{L}\p{N}]/u.test(normalized)) return '';

  return normalized;
}

function getNextTrendsRequestId() {
  runtimeMemory.trendsRequestId += 100000;
  if (runtimeMemory.trendsRequestId > 999999) {
    runtimeMemory.trendsRequestId = 100000 + (runtimeMemory.trendsRequestId % 900000);
  }
  return runtimeMemory.trendsRequestId;
}

function parseGoogleTrendsBootstrap(html) {
  const sid = GOOGLE_TRENDS_SID_RE.exec(String(html || ''))?.[1] || '';
  const buildLabel = GOOGLE_TRENDS_BUILD_RE.exec(String(html || ''))?.[1] || '';

  if (!sid || !buildLabel) {
    throw new Error('Could not parse Google Trends bootstrap metadata');
  }

  return { sid, buildLabel };
}

function parseBatchedExecuteRpcPayload(text, rpcId) {
  const lines = String(text || '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) continue;

    try {
      const chunk = JSON.parse(trimmed);
      if (!Array.isArray(chunk)) continue;

      for (const item of chunk) {
        if (!Array.isArray(item) || item[0] !== 'wrb.fr' || item[1] !== rpcId) {
          continue;
        }

        return typeof item[2] === 'string'
          ? JSON.parse(item[2])
          : item[2];
      }
    } catch (error) {}
  }

  throw new Error(`RPC payload ${rpcId} not found in batchexecute response`);
}

function extractGoogleTrendsKeywords(payload) {
  const topics = Array.isArray(payload?.[1]) ? payload[1] : [];
  const seen = new Set();
  const keywords = [];

  const addKeyword = (value) => {
    const normalized = normalizeKeyword(value);
    if (!normalized) return;

    const dedupKey = normalized.toLowerCase();
    if (seen.has(dedupKey)) return;

    seen.add(dedupKey);
    keywords.push(normalized);
  };

  for (const topic of topics) {
    if (!Array.isArray(topic)) continue;

    addKeyword(topic[0]);
  }

  return keywords;
}

async function fetchTextWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: options.credentials || 'omit',
      mode: options.mode || 'cors',
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGoogleTrendsKeywords(options = {}) {
  const geo = options.geo || GOOGLE_TRENDS_CONFIG.geo;
  const hl = options.hl || GOOGLE_TRENDS_CONFIG.hl;
  const hours = clamp(parseInt(options.hours, 10) || GOOGLE_TRENDS_CONFIG.hours, 4, 48);

  await touchKeepAlive();

  const pageUrl = new URL(GOOGLE_TRENDS_TRENDING_URL);
  pageUrl.searchParams.set('geo', geo);
  pageUrl.searchParams.set('hl', hl);

  const html = await fetchTextWithTimeout(pageUrl.toString());
  const bootstrap = parseGoogleTrendsBootstrap(html);

  const requestUrl = new URL(GOOGLE_TRENDS_BATCH_URL);
  requestUrl.searchParams.set('rpcids', GOOGLE_TRENDS_CONFIG.rpcId);
  requestUrl.searchParams.set('source-path', '/trending');
  requestUrl.searchParams.set('f.sid', bootstrap.sid);
  requestUrl.searchParams.set('bl', bootstrap.buildLabel);
  requestUrl.searchParams.set('hl', hl);
  requestUrl.searchParams.set('_reqid', String(getNextTrendsRequestId()));
  requestUrl.searchParams.set('rt', 'c');

  const rpcPayload = JSON.stringify([null, null, geo, 0, hl, hours, 1]);
  const fReq = JSON.stringify([[[GOOGLE_TRENDS_CONFIG.rpcId, rpcPayload, null, 'generic']]]);
  const responseText = await fetchTextWithTimeout(requestUrl.toString(), {
    method: 'POST',
    body: `f.req=${encodeURIComponent(fReq)}&`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Same-Domain': '1'
    }
  });

  const payload = parseBatchedExecuteRpcPayload(responseText, GOOGLE_TRENDS_CONFIG.rpcId);
  const keywords = extractGoogleTrendsKeywords(payload);

  if (!keywords.length) {
    throw new Error('Google Trends returned an empty keyword set');
  }

  return {
    keywords,
    meta: {
      geo,
      hl,
      hours,
      totalTopics: Array.isArray(payload?.[1]) ? payload[1].length : 0
    }
  };
}

async function refreshKeywordPool(force = false) {
  const isFresh = !force
    && runtimeMemory.keywordPool.length
    && Date.now() - runtimeMemory.keywordRefreshedAt < GOOGLE_TRENDS_CONFIG.cacheTtlMs;

  if (isFresh) {
    return runtimeMemory.keywordPool;
  }

  if (runtimeMemory.keywordRefreshPromise) {
    return runtimeMemory.keywordRefreshPromise;
  }

  runtimeMemory.keywordRefreshPromise = (async () => {
    try {
      const result = await fetchGoogleTrendsKeywords();
      runtimeMemory.keywordPool = result.keywords;
      runtimeMemory.keywordSource = 'google_trends';
      runtimeMemory.keywordRefreshedAt = Date.now();
      log(`[Keywords] Loaded ${result.keywords.length} live Google Trends keywords (${result.meta.geo}, ${result.meta.hours}h).`, 'success');
      return runtimeMemory.keywordPool;
    } catch (error) {
      const fallbackKeywords = getFallbackKeywordPool();
      runtimeMemory.keywordPool = fallbackKeywords;
      runtimeMemory.keywordSource = 'fallback';
      runtimeMemory.keywordRefreshedAt = Date.now();
      log(`[Keywords] Google Trends failed (${error.message}). Using local fallback keywords.`, 'warning');
      return runtimeMemory.keywordPool;
    } finally {
      runtimeMemory.keywordRefreshPromise = null;
    }
  })();

  return runtimeMemory.keywordRefreshPromise;
}

async function ensureKeywordPoolReady(force = false) {
  if (!runtimeMemory.keywordPool.length || force) {
    await refreshKeywordPool(force);
  }

  return runtimeMemory.keywordPool;
}

function resetSearchBranch(key) {
  state[key] = createSearchState(key === 'mobile' ? state.mobileRuleEnabled : false);
}

function resetRuntimeState() {
  state.progress = 'Idle';
  state.percent = 0;
  state.wave = { current: 0, total: 0 };
  state.cooldownUntil = null;
  state.currentSearch = 0;
  state.totalSearches = 0;
  state.points = {
    current: null,
    earned: 0,
    baseline: null,
    final: null,
    lastCheck: null,
    history: []
  };
  resetSearchBranch('pc');
  resetSearchBranch('mobile');
  state.tasks = createTasksState();
  state.verification = {
    lastDashboardCheck: null,
    lastCounterSnapshot: null,
    lastVerifiedDelta: null,
    apiSource: null
  };
  state.summary = {
    baselinePoints: null,
    finalPoints: null,
    totalEarned: 0,
    verificationBadge: SUCCESS_BADGE
  };

  runtimeMemory = createRuntimeMemory();
}

function syncSearchProgress(key, useAsPrimary = false) {
  const branch = state[key];
  branch.progressText = `${branch.counted}/${branch.planned}`;
  branch.notCounted = Math.max(0, branch.executed - branch.counted);
  branch.enabled = key === 'mobile' ? state.mobileRuleEnabled : true;

  if (useAsPrimary) {
    const label = key === 'mobile' ? 'Mobile' : 'PC';
    state.progress = `${label} ${branch.progressText}`;
    state.percent = branch.planned > 0
      ? Math.min(100, Math.floor((branch.counted / branch.planned) * 100))
      : 0;
  }

  broadcastState();
}

function syncTaskProgress(useAsPrimary = false) {
  if (useAsPrimary) {
    state.progress = `Tasks ${state.tasks.completed}/${state.tasks.planned}`;
    state.percent = state.tasks.planned > 0
      ? Math.min(100, Math.floor((state.tasks.completed / state.tasks.planned) * 100))
      : 0;
  }

  broadcastState();
}

function setBranchCounterState(key, counter) {
  state[key].counter = counter
    ? {
        key: counter.key,
        progress: counter.progress,
        max: counter.max
      }
    : null;
  state[key].remaining = counter?.remaining ?? null;
}

function updateSummaryBadge() {
  const badges = [state.pc.verificationBadge];
  if (state.mobile.planned > 0 || state.mobile.counted > 0 || state.mobile.executed > 0 || state.mobile.enabled) {
    badges.push(state.mobile.verificationBadge);
  }

  state.summary.verificationBadge = badges.every((badge) => badge === SUCCESS_BADGE)
    ? SUCCESS_BADGE
    : FALLBACK_BADGE;
}

function sanitizeConfig(input = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(input || {}) };

  merged.rewardsLevel = ['member', 'silver', 'gold'].includes(merged.rewardsLevel)
    ? merged.rewardsLevel
    : DEFAULT_CONFIG.rewardsLevel;
  merged.searchCount = clamp(parseInt(merged.searchCount, 10) || DEFAULT_CONFIG.searchCount, 0, 30);
  merged.mobileSearchCount = clamp(parseInt(merged.mobileSearchCount, 10) || 0, 0, 30);
  merged.minDelay = clamp(parseInt(merged.minDelay, 10) || DEFAULT_CONFIG.minDelay, 1, 180);
  merged.maxDelay = clamp(parseInt(merged.maxDelay, 10) || DEFAULT_CONFIG.maxDelay, merged.minDelay, 240);
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
  return sanitized;
}

async function touchKeepAlive() {
  if (!isRunActive()) return;

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

async function waitWithStop(ms) {
  const endTime = Date.now() + Math.max(0, ms);

  while (Date.now() < endTime) {
    if (state.status === 'stopped') {
      throw new Error(USER_STOPPED_ERROR);
    }

    const remaining = endTime - Date.now();
    const slice = Math.min(WAIT_SLICE_MS, remaining);
    await sleep(slice);
    await touchKeepAlive();
  }
}

function getSearchDelayRange(config, mobile = false) {
  if (!mobile) {
    return {
      min: Math.max(1, Number(config.minDelay) || DEFAULT_CONFIG.minDelay),
      max: Math.max(1, Number(config.maxDelay) || DEFAULT_CONFIG.maxDelay)
    };
  }

  const minDelay = Math.max((Number(config.minDelay) || DEFAULT_CONFIG.minDelay) + 8, 18);
  const maxDelay = Math.max((Number(config.maxDelay) || DEFAULT_CONFIG.maxDelay) + 15, minDelay + 6);
  return { min: minDelay, max: maxDelay };
}

function getDiversifiedKeyword(type) {
  if (!runtimeMemory.keywordPool.length) {
    runtimeMemory.keywordPool = getFallbackKeywordPool();
  }

  const recentList = type === 'mobile'
    ? runtimeMemory.recentKeywords.mobile
    : runtimeMemory.recentKeywords.pc;

  const recentSet = new Set(recentList.slice(-10));
  const candidates = runtimeMemory.keywordPool.filter((keyword) => !recentSet.has(keyword));
  const pool = candidates.length ? candidates : runtimeMemory.keywordPool;
  const keyword = pool[Math.floor(Math.random() * pool.length)] || 'bing rewards news';

  recentList.push(keyword);
  if (recentList.length > 20) {
    recentList.splice(0, recentList.length - 20);
  }

  return keyword;
}

async function createTab(url, active = false) {
  await touchKeepAlive();
  return chrome.tabs.create({ url, active });
}

async function closeTab(tabId) {
  if (!Number.isInteger(tabId)) return;

  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {}
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    return null;
  }
}

async function waitForTabLoad(tabId, timeout = TAB_LOAD_TIMEOUT_MS) {
  const existingTab = await getTab(tabId);
  if (!existingTab) {
    throw new Error(`Tab ${tabId} no longer exists`);
  }

  if (existingTab.status === 'complete') {
    return existingTab;
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} load timeout`));
    }, timeout);

    const listener = async (updatedTabId, changeInfo) => {
      if (settled || updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(await getTab(tabId));
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  return getTab(tabId);
}

async function getOpenTabIdSet() {
  const tabs = await chrome.tabs.query({});
  return new Set(tabs.map((tab) => tab.id));
}

async function closeNewRewardsTabs(beforeTabIds, keepTabIds = []) {
  const keepSet = new Set(keepTabIds);
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (keepSet.has(tab.id)) continue;
    if (beforeTabIds.has(tab.id)) continue;
    if (!isRewardsRelatedUrl(tab.url)) continue;
    await closeTab(tab.id);
  }
}

function isTransientInjectionError(error) {
  const message = String(error?.message || error || '');
  return /Execution context was destroyed|Frame with ID 0 is showing error page|The frame was removed|Cannot access contents of the page|No tab with id/i.test(message);
}

function isNavigationDestroyedContextError(error) {
  const message = String(error?.message || error || '');
  return /Execution context was destroyed|The frame was removed/i.test(message);
}

async function ensureAutomationInjected(tabId) {
  const tab = await getTab(tabId);
  if (!tab) {
    throw new Error(`Tab ${tabId} no longer exists`);
  }

  if (!isInjectableAutomationUrl(tab.url)) {
    throw new Error(`Tab URL is not injectable: ${tab.url || 'unknown'}`);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-automation.js'],
    world: 'MAIN'
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => ({
      ready: Boolean(window.__BRA__),
      version: window.__BRA__?.version || null
    })
  });

  const status = results?.[0]?.result;
  if (!status?.ready) {
    throw new Error('Automation API is unavailable after injection');
  }

  return status;
}

async function callAutomationMethod(tabId, methodName, args = [], options = {}) {
  const retries = Math.max(1, options.retries || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const tab = await getTab(tabId);
      if (!tab) {
        throw new Error(`Tab ${tabId} no longer exists`);
      }

      if (tab.status !== 'complete') {
        await waitForTabLoad(tabId);
      }

      await ensureAutomationInjected(tabId);
      await touchKeepAlive();

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (invokedMethodName, invokedArgs) => {
          const api = window.__BRA__;
          if (!api || typeof api[invokedMethodName] !== 'function') {
            throw new Error(`Automation method not available: ${invokedMethodName}`);
          }

          return api[invokedMethodName](...(invokedArgs || []));
        },
        args: [methodName, args]
      });

      return results?.[0]?.result ?? null;
    } catch (error) {
      lastError = error;

      if (options.allowDestroyedContext && isNavigationDestroyedContextError(error)) {
        await waitForTabLoad(tabId).catch(() => null);
        return {
          success: true,
          navigationLikely: true,
          transientError: String(error?.message || error)
        };
      }

      if (attempt < retries && isTransientInjectionError(error)) {
        await waitWithStop(600);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error(`Automation method failed: ${methodName}`);
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      mode: 'cors',
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
    tab = await createTab(REWARDS_HOME_URL, false);
    await waitForTabLoad(tab.id);
    await waitWithStop(2000);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (apiUrl) => {
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      },
      args: [REWARDS_API_URL]
    });

    const payload = results?.[0]?.result;
    if (!payload?.dashboard) {
      throw new Error('Dashboard payload is missing');
    }

    return payload;
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

  if (!scored.length) return null;
  return scored[0];
}

function getAvailablePoints(dashboard) {
  return toFiniteNumber(dashboard?.userStatus?.availablePoints);
}

function createDashboardSnapshot(dashboard, source) {
  const counters = getCountersSnapshot(dashboard);
  const pcCounter = pickBestCounter(counters, 'pc');
  const mobileCounter = pickBestCounter(counters, 'mobile');
  const pendingTasks = scanUncompletedTasks(dashboard);

  return {
    dashboard,
    source,
    checkedAt: Date.now(),
    availablePoints: getAvailablePoints(dashboard),
    counters,
    pcCounter,
    mobileCounter,
    pendingTasks
  };
}

function getSnapshotCounter(snapshot, type, preferredKey = null) {
  if (!snapshot) return null;

  if (type === 'mobile') {
    return preferredKey
      ? pickBestCounter(snapshot.counters, 'mobile', preferredKey)
      : (snapshot.mobileCounter || pickBestCounter(snapshot.counters, 'mobile'));
  }

  return preferredKey
    ? pickBestCounter(snapshot.counters, 'pc', preferredKey)
    : (snapshot.pcCounter || pickBestCounter(snapshot.counters, 'pc'));
}

async function fetchRewardsDashboard(options = {}) {
  const {
    context = 'dashboard',
    logCounters = false,
    recordLabel = null,
    silent = false
  } = options;

  let payload = null;
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
    applyCurrentPoints(snapshot.availablePoints, recordLabel);
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
    if (logCounters) {
      log(`[API] Pending tasks: ${snapshot.pendingTasks.length}`);
    }
  }

  broadcastState();
  return snapshot;
}

async function setMobileMode(enabled) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['mobile_ua_rules']
      });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['mobile_ua_rules']
      });
    }

    state.mobileRuleEnabled = enabled;
    state.mobile.enabled = enabled;
    broadcastState();
    return true;
  } catch (error) {
    state.mobileRuleEnabled = false;
    state.mobile.enabled = false;
    broadcastState();
    log(`[Mobile] Failed to ${enabled ? 'enable' : 'disable'} UA rules: ${error.message}`, 'error');
    return false;
  }
}

function logMobileEnvironment(snapshot, contextLabel) {
  if (!snapshot?.signals) {
    log(`[Mobile] ${contextLabel}: page signals unavailable`, 'warning');
    return;
  }

  const missingSignals = [];
  if (!snapshot.signals.uaMobile) missingSignals.push('navigator.userAgent');
  if (!snapshot.signals.uaDataMobile) missingSignals.push('navigator.userAgentData.mobile');
  if (!snapshot.signals.touch) missingSignals.push('touch');
  if (!snapshot.signals.mobileViewport) missingSignals.push('viewport');

  if (missingSignals.length) {
    log(`[Mobile] ${contextLabel}: page is not fully mobile (${missingSignals.join(', ')})`, 'warning');
  } else {
    log(`[Mobile] ${contextLabel}: mobile signals OK (${snapshot.summary || 'ready'})`);
  }
}

async function createSearchSession(options = {}) {
  const tab = await createTab(BING_HOME_URL, false);
  await waitForTabLoad(tab.id);

  const snapshot = await callAutomationMethod(
    tab.id,
    'prepareEnvironment',
    [{ mobile: Boolean(options.mobile) }],
    { retries: 2 }
  );

  if (options.mobile) {
    logMobileEnvironment(snapshot, `${options.label || 'Mobile'} session`);
  }

  return {
    tabId: tab.id,
    mobile: Boolean(options.mobile),
    label: options.label || 'Search'
  };
}

async function closeSearchSession(session) {
  if (!session?.tabId) return;
  await closeTab(session.tabId);
}

async function performSearch(session, keyword) {
  const tab = await getTab(session.tabId);
  if (!tab) {
    throw new Error('Search session tab was closed');
  }

  if (!/bing\.com/i.test(tab.url || '')) {
    await navigateTab(session.tabId, BING_HOME_URL);
  }

  await callAutomationMethod(
    session.tabId,
    'prepareEnvironment',
    [{ mobile: session.mobile }],
    { retries: 2 }
  ).catch(() => null);

  let submitResult = await callAutomationMethod(
    session.tabId,
    'typeAndSearch',
    [keyword, { mobile: session.mobile }],
    {
      retries: 2,
      allowDestroyedContext: true
    }
  );

  if (!submitResult?.success) {
    const directSearchUrl = new URL('/search', BING_HOME_URL);
    directSearchUrl.searchParams.set('q', keyword);
    await navigateTab(session.tabId, directSearchUrl.toString());
    submitResult = {
      success: true,
      fallback: 'tabs_update'
    };
  } else {
    await waitWithStop(1200);
    await waitForTabLoad(session.tabId).catch(() => null);
  }

  await waitWithStop(randomInt(1200, 2200));

  await callAutomationMethod(
    session.tabId,
    'enhancedSearchInteraction',
    [{ mobile: session.mobile }],
    { retries: 2 }
  ).catch(() => null);

  return {
    success: true,
    keyword,
    result: submitResult
  };
}

async function verifySearchOutcome(beforeSnapshot, type, options = {}) {
  const preferredKey = options.preferredKey || null;
  const beforeCounter = getSnapshotCounter(beforeSnapshot, type, preferredKey);
  let latestSnapshot = beforeSnapshot;
  let latestCounter = beforeCounter;

  for (let attempt = 1; attempt <= SEARCH_VERIFY_ATTEMPTS; attempt += 1) {
    await waitWithStop(SEARCH_VERIFY_DELAY_MS + randomInt(200, 1200));
    const afterSnapshot = await fetchRewardsDashboard({
      context: `${options.label || 'search'} verify ${attempt}`,
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

async function maybeRunWaveCooldown(processedCount, targetCount, config, label) {
  const waveSize = Math.max(0, Number(config.waveSize) || 0);
  const wavePauseMin = Math.max(0, Number(config.wavePauseMin) || 0);

  if (!waveSize || !wavePauseMin) return;
  if (processedCount <= 0 || processedCount >= targetCount) return;
  if (processedCount % waveSize !== 0) return;

  state.status = 'cooldown';
  state.wave = {
    current: Math.floor(processedCount / waveSize),
    total: Math.ceil(targetCount / waveSize)
  };
  state.cooldownUntil = Date.now() + (wavePauseMin * 60 * 1000);
  state.progress = `${label} cooldown`;
  broadcastState();
  log(`[Wave] Cooldown ${wavePauseMin} minute(s) after ${processedCount}/${targetCount} ${label.toLowerCase()}.`, 'warning');

  try {
    await waitWithStop(wavePauseMin * 60 * 1000);
  } finally {
    state.status = 'running';
    state.cooldownUntil = null;
    broadcastState();
  }
}

async function runTaskUrl(task, options = {}) {
  let taskTab = null;
  const openTabsBefore = await getOpenTabIdSet();

  try {
    taskTab = await createTab(task.url, false);
    await waitForTabLoad(taskTab.id);

    const loadedTab = await getTab(taskTab.id);
    if (isInjectableAutomationUrl(loadedTab?.url || '')) {
      await callAutomationMethod(
        taskTab.id,
        'runTaskPageInteraction',
        [{ mobile: Boolean(options.mobile) }],
        { retries: 2 }
      ).catch(() => null);
    }

    await waitWithStop(TASK_SETTLE_DELAY_MS);
    await closeNewRewardsTabs(openTabsBefore, taskTab.id ? [taskTab.id] : []);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (taskTab?.id) {
      await closeTab(taskTab.id);
    }
  }
}

function updateTaskStateFromSnapshot(snapshot) {
  state.tasks.pending = snapshot.pendingTasks.length;
  state.tasks.lastOutcome = `Pending ${snapshot.pendingTasks.length}`;
  syncTaskProgress(true);
}

async function runTaskList(taskList, currentSnapshot, options = {}) {
  let snapshot = currentSnapshot;
  const sourceLabel = options.sourceLabel || 'api';

  const normalizedTasks = taskList
    .map((task) => ({
      ...task,
      url: normalizeTaskUrl(task.url),
      dedupKey: task.dedupKey || getTaskDedupKey(task.url)
    }))
    .filter((task) => task.url && task.dedupKey)
    .filter((task) => isSupportedTaskUrl(task.url))
    .filter((task) => !runtimeMemory.attemptedTaskKeys.has(task.dedupKey));

  if (!normalizedTasks.length) {
    return snapshot;
  }

  state.tasks.planned = Math.max(state.tasks.planned, state.tasks.executed + normalizedTasks.length);
  state.tasks.lastSource = sourceLabel;
  state.tasks.lastOutcome = `Running ${normalizedTasks.length} ${sourceLabel} task(s)`;
  syncTaskProgress(true);

  for (const task of normalizedTasks) {
    if (state.status === 'stopped') {
      throw new Error(USER_STOPPED_ERROR);
    }

    runtimeMemory.attemptedTaskKeys.add(task.dedupKey);
    const beforeSnapshot = snapshot;
    log(`[Tasks] Opening ${task.url}`, 'info');

    const result = await runTaskUrl(task, { mobile: Boolean(options.mobile) });
    state.tasks.executed += 1;

    if (!result.success) {
      state.tasks.lastOutcome = `Task failed: ${task.url}`;
      syncTaskProgress(true);
      log(`[Tasks] Failed: ${result.error}`, 'warning');
      continue;
    }

    snapshot = await fetchRewardsDashboard({
      context: `${sourceLabel} task verify`,
      silent: true
    });

    const pointsDelta = Number.isFinite(beforeSnapshot.availablePoints) && Number.isFinite(snapshot.availablePoints)
      ? snapshot.availablePoints - beforeSnapshot.availablePoints
      : 0;

    const completed = snapshot.pendingTasks.length < beforeSnapshot.pendingTasks.length || pointsDelta > 0;
    if (completed) {
      state.tasks.completed += 1;
      log(`[Tasks] Counted (${formatSignedDelta(pointsDelta)})`, 'success');
    } else {
      log('[Tasks] No API-confirmed progress after task', 'warning');
    }

    updateTaskStateFromSnapshot(snapshot);
    await waitWithStop(randomInt(1800, 3200));

    if (!snapshot.pendingTasks.length) {
      break;
    }
  }

  return snapshot;
}

async function runApiTasksFirst(currentSnapshot) {
  state.tasks.planned = currentSnapshot.pendingTasks.length;
  state.tasks.pending = currentSnapshot.pendingTasks.length;
  state.tasks.lastSource = 'api';
  syncTaskProgress(true);

  if (!currentSnapshot.pendingTasks.length) {
    log('[Tasks] Microsoft API reports no pending daily tasks.');
    return currentSnapshot;
  }

  log(`[Tasks] API reported ${currentSnapshot.pendingTasks.length} pending task(s).`);
  return runTaskList(currentSnapshot.pendingTasks, currentSnapshot, {
    sourceLabel: 'api',
    mobile: false
  });
}

async function collectDashboardFallbackTasks(options = {}) {
  let dashboardTab = null;

  try {
    dashboardTab = await createTab(REWARDS_HOME_URL, false);
    await waitForTabLoad(dashboardTab.id);
    await waitWithStop(1800);

    const result = await callAutomationMethod(
      dashboardTab.id,
      'collectDashboardTaskLinks',
      [{ mobile: Boolean(options.mobile) }],
      { retries: 2 }
    );

    const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
    return tasks
      .map((task) => ({
        url: normalizeTaskUrl(task.url),
        text: task.text || '',
        dedupKey: getTaskDedupKey(task.url)
      }))
      .filter((task) => task.url && task.dedupKey);
  } finally {
    if (dashboardTab?.id) {
      await closeTab(dashboardTab.id);
    }
  }
}

async function runDashboardFallbackTasks(currentSnapshot, options = {}) {
  if (!currentSnapshot.pendingTasks.length) {
    log('[Tasks] No pending tasks remain before dashboard fallback.');
    return currentSnapshot;
  }

  const fallbackTasks = await collectDashboardFallbackTasks(options);
  const pendingKeys = new Set(currentSnapshot.pendingTasks.map((task) => task.dedupKey));

  const filteredTasks = fallbackTasks.filter((task) => {
    if (runtimeMemory.attemptedTaskKeys.has(task.dedupKey)) {
      return false;
    }

    return pendingKeys.size === 0 || pendingKeys.has(task.dedupKey);
  });

  if (!filteredTasks.length) {
    state.tasks.fallbackUsed = true;
    state.tasks.lastSource = 'dashboard';
    state.tasks.lastOutcome = 'Dashboard fallback found no new tasks';
    syncTaskProgress(true);
    log('[Tasks] Dashboard fallback found no actionable task links.', 'warning');
    return currentSnapshot;
  }

  state.tasks.fallbackUsed = true;
  log(`[Tasks] Dashboard fallback found ${filteredTasks.length} task link(s).`);
  return runTaskList(filteredTasks, currentSnapshot, {
    sourceLabel: 'dashboard',
    mobile: Boolean(options.mobile)
  });
}

async function runVerifiedSearchBatch(type, currentSnapshot, requestedCount) {
  const config = await getConfig();
  const isMobile = type === 'mobile';
  const branch = state[type];
  const delayRange = getSearchDelayRange(config, isMobile);
  const label = isMobile ? 'Mobile' : 'PC';
  let snapshot = currentSnapshot;
  let session = null;

  await ensureKeywordPoolReady();

  const initialCounter = getSnapshotCounter(snapshot, type);
  const requestedTarget = Math.max(0, Number(requestedCount) || 0);

  if (isMobile && !initialCounter) {
    branch.status = 'done';
    branch.planned = 0;
    branch.lastOutcome = 'Mobile counter unavailable';
    branch.verificationBadge = FALLBACK_BADGE;
    updateSummaryBadge();
    syncSearchProgress(type, true);
    log('[Mobile] Rewards API did not expose a reliable mobile counter. Skipping mobile batch.', 'warning');
    return snapshot;
  }

  const tierLimit = TIER_LIMITS[config.rewardsLevel]?.maxSearch || DEFAULT_CONFIG.searchCount;
  const cappedRequested = isMobile ? requestedTarget : Math.min(requestedTarget, tierLimit);
  const safeTarget = initialCounter
    ? Math.min(cappedRequested, initialCounter.remaining)
    : cappedRequested;

  branch.status = 'preparing';
  branch.planned = safeTarget;
  branch.executed = 0;
  branch.counted = 0;
  branch.verificationMode = initialCounter ? 'counter' : 'availablePoints';
  branch.verificationBadge = initialCounter ? SUCCESS_BADGE : FALLBACK_BADGE;
  branch.lastOutcome = initialCounter
    ? `Preparing ${label.toLowerCase()} baseline`
    : `Preparing ${label.toLowerCase()} fallback verification`;
  setBranchCounterState(type, initialCounter);
  state.totalSearches = safeTarget;
  state.currentSearch = 0;
  state.wave = {
    current: 0,
    total: config.waveSize > 0 ? Math.ceil(Math.max(1, safeTarget) / config.waveSize) : 0
  };
  syncSearchProgress(type, true);
  updateSummaryBadge();

  if (initialCounter) {
    log(`[${label}] Counter before: ${formatCounter(initialCounter)}`);
  } else {
    log(`[${label}] No reliable counter detected. Falling back to available points.`, 'warning');
  }

  if (safeTarget <= 0) {
    branch.status = 'done';
    branch.lastOutcome = `${label} target already complete`;
    syncSearchProgress(type, true);
    log(`[${label}] Nothing left to do for this batch.`);
    return snapshot;
  }

  try {
    session = await createSearchSession({
      mobile: isMobile,
      label
    });

    branch.status = 'searching';
    syncSearchProgress(type, true);

    for (let index = 1; index <= safeTarget; index += 1) {
      if (state.status === 'stopped') {
        throw new Error(USER_STOPPED_ERROR);
      }

      const beforeSnapshot = snapshot;
      const preferredKey = branch.counter?.key || getSnapshotCounter(beforeSnapshot, type)?.key || null;
      let counted = false;

      state.currentSearch = index;
      syncSearchProgress(type, true);

      for (let retry = 0; retry <= config.maxRetries; retry += 1) {
        const keyword = getDiversifiedKeyword(type);
        branch.lastOutcome = `${label} ${index}/${safeTarget} attempt ${retry + 1}`;
        syncSearchProgress(type, true);

        const searchResult = await performSearch(session, keyword);
        if (!searchResult.success) {
          log(`[${label}] Search submit failed`, 'warning');
          continue;
        }

        branch.executed += 1;
        log(`[${label}] Search ${index} executed with "${keyword}"`);
        syncSearchProgress(type, true);

        const verification = await verifySearchOutcome(beforeSnapshot, type, {
          preferredKey,
          label
        });

        snapshot = verification.afterSnapshot || snapshot;
        if (verification.afterCounter) {
          setBranchCounterState(type, verification.afterCounter);
          log(`[${label}] Counter after: ${formatCounter(verification.afterCounter)}`);
        }

        if (verification.counted) {
          branch.counted += 1;
          branch.verificationMode = verification.mode;
          branch.verificationBadge = verification.mode === 'counter' ? SUCCESS_BADGE : FALLBACK_BADGE;
          branch.lastConfidence = verification.confidence;
          branch.lastOutcome = `${label} ${index}/${safeTarget} counted`;
          syncSearchProgress(type, true);
          updateSummaryBadge();
          log(`[${label}] Search ${index} counted`, 'success');
          counted = true;
          break;
        }

        branch.lastOutcome = `${label} ${index}/${safeTarget} not counted`;
        syncSearchProgress(type, true);
        log(`[${label}] Search ${index} was not confirmed by API`, 'warning');

        if (retry < config.maxRetries) {
          await waitWithStop(randomDelay(delayRange.min, delayRange.max));
        }
      }

      if (!counted) {
        log(`[${label}] Search ${index} exhausted retries`, 'warning');
      }

      const activeCounter = getSnapshotCounter(snapshot, type, branch.counter?.key || null);
      if (activeCounter) {
        setBranchCounterState(type, activeCounter);
        if (activeCounter.remaining <= 0) {
          break;
        }
      }

      if (index < safeTarget) {
        await maybeRunWaveCooldown(index, safeTarget, config, `${label} searches`);
        const delay = randomDelay(delayRange.min, delayRange.max);
        log(`[${label}] Delay ${Math.round(delay / 1000)}s before next search...`);
        await waitWithStop(delay);
      }
    }
  } finally {
    await closeSearchSession(session);
  }

  branch.status = 'done';
  branch.remaining = getSnapshotCounter(snapshot, type, branch.counter?.key || null)?.remaining ?? branch.remaining;
  branch.lastOutcome = `${label} search batch complete`;
  syncSearchProgress(type, true);
  updateSummaryBadge();
  log(`[Summary] ${label} planned=${branch.planned}, executed=${branch.executed}, counted=${branch.counted}, remaining=${branch.remaining ?? 'n/a'}`);

  return snapshot;
}

function finalizeRunState() {
  stopKeepAlive();
  state.cooldownUntil = null;
  state.wave = { current: 0, total: 0 };

  if (state.status === 'stopped') {
    state.progress = 'Stopped';
    state.percent = 0;
  } else if (state.status !== 'error') {
    state.status = 'done';
    state.progress = 'Completed';
    state.percent = 100;
  }

  broadcastState();
}

async function handleRunFailure(error, prefix) {
  if (error.message === USER_STOPPED_ERROR) {
    finalizeRunState();
    return;
  }

  stopKeepAlive();
  state.cooldownUntil = null;
  state.wave = { current: 0, total: 0 };
  state.status = 'error';
  state.progress = 'Error';
  state.percent = 0;
  log(`[${prefix}] ${error.message}`, 'error');
  broadcastState();
}

async function runStartAutomation() {
  const config = await getConfig();

  resetRuntimeState();
  state.status = 'running';
  state.progress = 'Baseline';
  state.percent = 0;
  broadcastState();
  startKeepAlive();

  try {
    log('[Keywords] Refreshing live Google Trends keyword pool...');
    await refreshKeywordPool(true);

    log('[Start] Phase 1/6: fetch dashboard baseline');
    let snapshot = await fetchRewardsDashboard({
      context: 'baseline',
      logCounters: true,
      recordLabel: 'baseline'
    });

    if (Number.isFinite(snapshot.availablePoints)) {
      applyBaselinePoints(snapshot.availablePoints);
      log(`[Summary] Baseline points: ${snapshot.availablePoints}`);
    }

    log('[Start] Phase 2/6: API daily tasks');
    snapshot = await runApiTasksFirst(snapshot);

    if (state.status === 'stopped') {
      throw new Error(USER_STOPPED_ERROR);
    }

    if (config.mobileMode) {
      log('[Start] Phase 3/6: enable mobile mode');
      const enabled = await setMobileMode(true);
      if (!enabled) {
        throw new Error('Could not enable mobile UA rules');
      }

      try {
        snapshot = await fetchRewardsDashboard({
          context: 'mobile baseline',
          silent: true
        });

        if (config.mobileSearchCount > 0) {
          log('[Start] Phase 4/6: verified mobile search batch');
          snapshot = await runVerifiedSearchBatch('mobile', snapshot, config.mobileSearchCount);
        } else {
          log('[Mobile] Mobile mode enabled with 0 mobile searches configured. Skipping mobile search batch.');
        }

        if (state.status !== 'stopped' && snapshot.pendingTasks.length > 0) {
          log('[Start] Phase 5/6: mobile dashboard fallback tasks');
          snapshot = await runDashboardFallbackTasks(snapshot, { mobile: true });
        }
      } finally {
        await setMobileMode(false);
        log('[Mobile] Mobile mode disabled');
      }
    } else if (snapshot.pendingTasks.length > 0) {
      log('[Start] Phase 4/6: desktop dashboard fallback tasks');
      snapshot = await runDashboardFallbackTasks(snapshot, { mobile: false });
    }

    if (state.status === 'stopped') {
      throw new Error(USER_STOPPED_ERROR);
    }

    log('[Start] Phase 5/6: verified PC search batch');
    snapshot = await fetchRewardsDashboard({
      context: 'pc baseline',
      silent: true
    });
    snapshot = await runVerifiedSearchBatch('pc', snapshot, config.searchCount);

    if (state.status === 'stopped') {
      throw new Error(USER_STOPPED_ERROR);
    }

    log('[Start] Phase 6/6: final dashboard verification');
    snapshot = await fetchRewardsDashboard({
      context: 'final verification',
      logCounters: true,
      recordLabel: 'final'
    });

    if (Number.isFinite(snapshot.availablePoints)) {
      applyCurrentPoints(snapshot.availablePoints, 'final');
      state.summary.finalPoints = snapshot.availablePoints;
      if (Number.isFinite(state.summary.baselinePoints)) {
        state.summary.totalEarned = snapshot.availablePoints - state.summary.baselinePoints;
      }
    }

    updateSummaryBadge();
    log(`[Summary] executed=${state.mobile.executed + state.pc.executed}, counted=${state.mobile.counted + state.pc.counted}, earned=${formatSignedDelta(state.summary.totalEarned)}`);
    finalizeRunState();
  } catch (error) {
    await handleRunFailure(error, 'Start Error');
  } finally {
    await setMobileMode(false);
    activeRunPromise = null;
  }
}

async function runDailyTasksOnlyAutomation() {
  const config = await getConfig();

  resetRuntimeState();
  state.status = 'running';
  state.progress = 'Tasks';
  state.percent = 0;
  broadcastState();
  startKeepAlive();

  try {
    let snapshot = await fetchRewardsDashboard({
      context: 'tasks baseline',
      logCounters: true,
      recordLabel: 'tasks_baseline'
    });

    if (Number.isFinite(snapshot.availablePoints)) {
      applyBaselinePoints(snapshot.availablePoints);
      log(`[Summary] Baseline points: ${snapshot.availablePoints}`);
    }

    snapshot = await runApiTasksFirst(snapshot);

    if (state.status !== 'stopped' && snapshot.pendingTasks.length > 0) {
      if (config.mobileMode) {
        const enabled = await setMobileMode(true);
        if (!enabled) {
          throw new Error('Could not enable mobile UA rules for task fallback');
        }

        try {
          snapshot = await runDashboardFallbackTasks(snapshot, { mobile: true });
        } finally {
          await setMobileMode(false);
          log('[Mobile] Mobile mode disabled');
        }
      } else {
        snapshot = await runDashboardFallbackTasks(snapshot, { mobile: false });
      }
    }

    snapshot = await fetchRewardsDashboard({
      context: 'tasks final verification',
      logCounters: true,
      recordLabel: 'tasks_final'
    });

    if (Number.isFinite(snapshot.availablePoints)) {
      applyCurrentPoints(snapshot.availablePoints, 'tasks_final');
      state.summary.finalPoints = snapshot.availablePoints;
      if (Number.isFinite(state.summary.baselinePoints)) {
        state.summary.totalEarned = snapshot.availablePoints - state.summary.baselinePoints;
      }
    }

    updateSummaryBadge();
    log(`[Summary] Tasks executed=${state.tasks.executed}, completed=${state.tasks.completed}, pending=${snapshot.pendingTasks.length}, earned=${formatSignedDelta(state.summary.totalEarned)}`);
    finalizeRunState();
  } catch (error) {
    await handleRunFailure(error, 'Tasks Error');
  } finally {
    await setMobileMode(false);
    activeRunPromise = null;
  }
}

async function checkPoints() {
  const snapshot = await fetchRewardsDashboard({
    context: 'manual check',
    logCounters: true,
    recordLabel: 'manual_check'
  });

  if (Number.isFinite(snapshot.availablePoints)) {
    if (!Number.isFinite(state.points.baseline)) {
      applyBaselinePoints(snapshot.availablePoints);
    } else {
      applyCurrentPoints(snapshot.availablePoints, 'manual_check');
    }
  }

  updateSummaryBadge();
  broadcastState();
}

async function resetPage() {
  log('[Reset] Closing rewards-related tabs...');

  const tabs = await chrome.tabs.query({});
  let rewardsTab = tabs.find((tab) => /rewards\.bing\.com/i.test(tab.url || ''));

  for (const tab of tabs) {
    if (rewardsTab && tab.id === rewardsTab.id) continue;
    if (isRewardsRelatedUrl(tab.url)) {
      await closeTab(tab.id);
    }
  }

  if (!rewardsTab) {
    rewardsTab = await createTab(REWARDS_HOME_URL, true);
    await waitForTabLoad(rewardsTab.id);
  } else {
    await chrome.tabs.reload(rewardsTab.id);
    await waitForTabLoad(rewardsTab.id);
  }

  log('[Reset] Rewards page refreshed', 'success');
}

async function startRun(kind) {
  if (activeRunPromise) {
    log('[Run] Another automation session is already active.', 'warning');
    return;
  }

  activeRunPromise = (kind === 'tasks' ? runDailyTasksOnlyAutomation() : runStartAutomation())
    .catch((error) => {
      log(`[Run] ${error.message}`, 'error');
    })
    .finally(() => {
      activeRunPromise = null;
    });
}

async function handleCommand(command) {
  switch (command) {
    case 'start_search':
      if (isRunActive() || activeRunPromise) {
        log('[Start] Automation is already running.', 'warning');
        return;
      }
      await startRun('full');
      return;

    case 'daily_tasks':
      if (isRunActive() || activeRunPromise) {
        log('[Tasks] Automation is already running.', 'warning');
        return;
      }
      await startRun('tasks');
      return;

    case 'stop':
      state.status = 'stopped';
      state.progress = 'Stopped';
      state.percent = 0;
      state.cooldownUntil = null;
      log('[Run] Stopped by user', 'warning');
      broadcastState();
      return;

    case 'check_points':
      await checkPoints();
      return;

    case 'reset_page':
      await resetPage();
      return;

    case 'reset_progress':
      state.status = 'stopped';
      await setMobileMode(false);
      stopKeepAlive();
      state = createInitialState();
      runtimeMemory = createRuntimeMemory();
      log('[Reset] Runtime state cleared', 'success');
      broadcastState();
      return;

    default:
      log(`[Command] Unknown command: ${command}`, 'warning');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'get_state') {
      sendResponse({
        state: getPublicState(),
        logs: state.logs.slice(0, 50)
      });
      return;
    }

    if (message.action === 'get_config') {
      const config = await getConfig();
      sendResponse({ config });
      return;
    }

    if (message.action === 'save_config') {
      const config = await saveConfig(message.config);
      log('[Config] Saved', 'success');
      sendResponse({ success: true, config });
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
  const currentConfig = await getConfig();
  await chrome.storage.local.set({ config: currentConfig });
  await setMobileMode(false);
});

chrome.runtime.onStartup.addListener(() => {
  setMobileMode(false).catch(() => {});
});

resetRuntimeState();
setMobileMode(false).catch(() => {});
log('[Init] Background worker ready', 'success');
