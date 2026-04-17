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

const STATUS_MESSAGES = {
  start_search: 'Search automation is not available until Phase 2.',
  daily_tasks: 'Daily task automation is not available until Phase 3.',
  check_points: 'Points verification is not available in the ES module bootstrap phase.',
  reset_page: 'Page reset is not available in the ES module bootstrap phase.'
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
    verificationMode: 'idle',
    verificationBadge: 'Idle',
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
      verificationBadge: 'Idle'
    }
  };
}

let state = createInitialState();
let logs = [];
let keywordCache = [];

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  log('[Config] Saved', 'success');
  return sanitized;
}

function resetRuntimeState() {
  state = createInitialState();
  broadcastState();
}

async function handleCommand(command) {
  switch (command) {
    case 'stop':
      state.status = 'stopped';
      state.progress = 'Stopped';
      state.percent = 0;
      log('[Run] Stopped by user', 'warning');
      broadcastState();
      return;

    case 'reset_progress':
      resetRuntimeState();
      log('[Reset] Runtime state cleared', 'success');
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
});

chrome.runtime.onStartup.addListener(() => {
  broadcastState();
});

keywordCache = getAllKeywords();
log(`[Init] Background module ready with ${keywordCache.length} keywords.`, 'success');
broadcastState();
