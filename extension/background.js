// =============================================
// BING REWARDS AUTO - BACKGROUND SERVICE WORKER
// Extension-native: No server, no CDP ports
// Uses chrome.tabs + chrome.scripting APIs
// =============================================

// ---- STATE ----
let state = {
  status: 'idle',        // idle | running | stopped | done | error | cooldown
  progress: '0/0',
  percent: 0,
  points: {
    current: null,     // null = chưa check, number = đã có data thật
    earned: 0,         // chỉ từ verified API checks
    baseline: null,    // điểm trước khi bắt đầu search
    lastCheck: null,   // timestamp lần check cuối
    history: []        // [{ time, points, wave, delta }]
  },
  currentSearch: 0,
  totalSearches: 0,
  wave: { current: 0, total: 0 },
  logs: [],
  mobileRuleEnabled: false
};

const DEFAULT_CONFIG = {
  rewardsLevel: 'gold',
  searchCount: 12,
  mobileSearchCount: 5,
  minDelay: 20,
  maxDelay: 40,
  mobileMode: false,
  maxRetries: 2,
  waveSize: 4,
  wavePauseMin: 15  // minutes
};

const TIER_LIMITS = {
  'member': { maxSearch: 3 },
  'silver': { maxSearch: 6 },
  'gold':   { maxSearch: 12 }
};

// ---- HELPERS ----
function sleep(ms) { 
  const checkInterval = 100;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (state.status === 'stopped' || state.status === 'error') {
        clearInterval(timer);
        reject(new Error('USER_STOPPED'));
      } else if (Date.now() - start >= ms) {
        clearInterval(timer);
        resolve(true);
      }
    }, checkInterval);
  });
}
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDelay(minS, maxS) { return randomInt(minS * 1000, maxS * 1000); }

function log(text, type = 'info') {
  const entry = { text, type, time: new Date().toLocaleTimeString() };
  state.logs.unshift(entry);
  if (state.logs.length > 200) state.logs.length = 200;
  broadcast({ action: 'log', data: entry });
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function broadcastState() {
  broadcast({ action: 'state_update', data: getPublicState() });
}

function getPublicState() {
  return {
    ...state,
    logs: undefined,
    points: {
      current: state.points.current,
      earned: state.points.earned,
      baseline: state.points.baseline,
      lastCheck: state.points.lastCheck,
      historyCount: state.points.history.length
    }
  };
}

// ---- CONFIG ----
async function getConfig() {
  const result = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...(result.config || {}) };
}

async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

// ---- KEYWORDS ----
// Loaded from keywords-data.js via importScripts
let KEYWORDS = [];
try {
  importScripts('keywords-data.js');
  KEYWORDS = self.KEYWORD_LIST || [];
} catch (e) {
  console.error('Failed to load keywords:', e);
}

function getRandomKeyword() {
  return KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)] || 'tin tức hôm nay';
}

// ---- TAB HELPERS ----
async function createTab(url, active = false) {
  return chrome.tabs.create({ url, active });
}

async function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    function listener(tid, info) {
      if (tid === tabId && info.status === 'complete') {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);

    const start = Date.now();
    const watcher = setInterval(() => {
      if (resolved) {
        clearInterval(watcher);
        return;
      }
      if (state.status === 'stopped' || state.status === 'error') {
        resolved = true;
        clearInterval(watcher);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('USER_STOPPED'));
      } else if (Date.now() - start >= timeout) {
        resolved = true;
        clearInterval(watcher);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }
    }, 100);
  });
}

async function injectScript(tabId, func, args = []) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
      world: 'MAIN'  // Access page's JS context
    });
    return results?.[0]?.result;
  } catch (e) {
    console.error('Inject error:', e);
    return null;
  }
}

async function injectFile(tabId, file) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: [file],
      world: 'MAIN'
    });
    return results?.[0]?.result;
  } catch (e) {
    console.error('Inject file error:', e);
    return null;
  }
}

async function closeTab(tabId) {
  try { await chrome.tabs.remove(tabId); } catch (e) {}
}

// ---- MOBILE MODE ----
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
  } catch (e) {
    console.error('Mobile mode toggle error:', e);
  }
}

// ---- AUTOMATION: SEARCH ----
async function performSearch(keyword) {
  let tab = null;
  try {
    // 1. Create tab → bing.com
    tab = await createTab('https://www.bing.com', false);
    await waitForTabLoad(tab.id);
    await sleep(2000);

    // 2. Inject automation script
    await injectFile(tab.id, 'content-automation.js');
    await sleep(500);

    // 3. Type and search
    const searchResult = await injectScript(tab.id, (kw) => {
      return window.__BRA__?.typeAndSearch(kw);
    }, [keyword]);

    if (!searchResult?.success) {
      await closeTab(tab.id);
      return { success: false, error: 'search_failed' };
    }

    // 4. Wait for results page
    await waitForTabLoad(tab.id).catch(() => {});
    await sleep(2000);

    // 5. Do search interaction (anti-ban)
    await injectFile(tab.id, 'content-automation.js');
    await sleep(300);
    await injectScript(tab.id, () => {
      return window.__BRA__?.enhancedSearchInteraction();
    });

    await closeTab(tab.id);
    return { success: true, keyword };

  } catch (e) {
    if (tab) await closeTab(tab.id);
    if (e.message === 'USER_STOPPED') throw e;
    return { success: false, error: e.message };
  }
}

// ---- SILENT POINT CHECK (no tab open, just fetch) ----
async function fetchPointsQuiet() {
  let tab = null;
  try {
    tab = await createTab('https://rewards.bing.com/', false);
    await waitForTabLoad(tab.id).catch(() => {});
    await sleep(4000);

    const result = await injectScript(tab.id, () => {
      return (async function() {
        // METHOD 1: API (nhanh, chính xác)
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 8000);
          const r = await fetch('https://rewards.bing.com/api/getuserinfo?type=1', {
            signal: controller.signal, cache: 'no-cache'
          });
          clearTimeout(tid);
          if (r.ok) {
            const data = await r.json();
            const pts = data?.dashboard?.userStatus?.availablePoints;
            if (typeof pts === 'number') return { points: pts, source: 'api' };
          }
        } catch (e) {}

        // METHOD 2: DOM selectors (fallback)
        const extractNum = (text) => {
          if (!text) return null;
          const m = text.match(/(\d{1,3}(?:[,.\s]\d{3})+|\d+)/g);
          if (m) {
            const nums = m.map(x => parseInt(x.replace(/[,.\s]/g, ''), 10))
              .filter(n => !isNaN(n) && n >= 0 && n < 1000000)
              .sort((a, b) => b - a);
            for (const n of nums) { if (n >= 100) return n; }
          }
          return null;
        };
        const sels = [
          '.text-title1.font-semibold', 'p.text-title1.font-semibold',
          '.flex.items-center.gap-2 > p', '[class*="text-title1"]',
          'mee-rewards-user-status-balance', '#balanceToolTip',
          '.pointsValue', '[class*="balance"]'
        ];
        for (const sel of sels) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const n = extractNum(el.innerText || el.textContent);
              if (n !== null) return { points: n, source: 'dom' };
            }
          } catch(e) {}
        }
        return { points: null, source: 'none' };
      })();
    });

    await closeTab(tab.id);
    return result || { points: null, source: 'error' };

  } catch (e) {
    if (tab) await closeTab(tab.id);
    if (e.message === 'USER_STOPPED') throw e;
    return { points: null, source: 'error', error: e.message };
  }
}

// Record a point snapshot into history
function recordPointSnapshot(points, wave, label) {
  if (points === null) return;
  const prevPoints = state.points.history.length > 0
    ? state.points.history[state.points.history.length - 1].points
    : state.points.baseline;
  const delta = (prevPoints !== null && points !== null) ? points - prevPoints : null;

  state.points.history.push({
    time: new Date().toLocaleTimeString(),
    points,
    wave,
    delta,
    label
  });

  // Keep max 50 entries
  if (state.points.history.length > 50) {
    state.points.history = state.points.history.slice(-50);
  }

  state.points.current = points;
  state.points.lastCheck = Date.now();

  // Recalculate real earned from baseline
  if (state.points.baseline !== null) {
    state.points.earned = points - state.points.baseline;
  }
}

// ---- AUTOMATION: SEARCH ALL (Wave System) ----
async function startSearchAutomation() {
  const config = await getConfig();
  const tierLimit = TIER_LIMITS[config.rewardsLevel]?.maxSearch || 12;
  const targetCount = Math.min(config.searchCount, tierLimit);
  const waveSize = config.waveSize || 4;
  const totalWaves = Math.ceil(targetCount / waveSize);

  state.status = 'running';
  state.currentSearch = 0;
  state.totalSearches = targetCount;
  state.progress = `0/${targetCount}`;
  state.percent = 0;
  state.wave = { current: 1, total: totalWaves };
  broadcastState();

  log(`▶️ Started (${config.rewardsLevel.toUpperCase()} mode — ${targetCount} searches, ${totalWaves} waves)`);

  // ====== BASELINE: Check points BEFORE starting ======
  log('📊 Checking points before starting (baseline)...');
  const baseline = await fetchPointsQuiet();
  if (baseline.points !== null) {
    state.points.baseline = baseline.points;
    state.points.current = baseline.points;
    state.points.earned = 0;
    state.points.history = [];
    recordPointSnapshot(baseline.points, 0, 'baseline');
    log(`📊 Baseline: ${baseline.points.toLocaleString()} pts (${baseline.source})`, 'success');
  } else {
    log('⚠️ Could not read baseline points — earned tracking disabled', 'warning');
    state.points.baseline = null;
    state.points.earned = 0;
  }
  broadcastState();

  let completed = 0;

  for (let wave = 1; wave <= totalWaves && state.status === 'running'; wave++) {
    state.wave.current = wave;
    const waveStart = completed;
    const waveEnd = Math.min(completed + waveSize, targetCount);

    log(`🌊 Wave ${wave}/${totalWaves} starting (search ${waveStart + 1}-${waveEnd})`);
    broadcastState();

    for (let i = waveStart; i < waveEnd && state.status === 'running'; i++) {
      const keyword = getRandomKeyword();
      log(`🔍 Search ${i + 1}/${targetCount}: ${keyword}`);

      let result = await performSearch(keyword);

      // Retry if failed
      if (!result.success) {
        for (let retry = 0; retry < config.maxRetries && !result.success; retry++) {
          const retryKeyword = getRandomKeyword();
          log(`🔄 Retry ${retry + 1}: ${retryKeyword}`, 'warning');
          await sleep(5000);
          result = await performSearch(retryKeyword);
        }
      }

      if (result.success) {
        completed++;
        state.currentSearch = completed;
        state.progress = `${completed}/${targetCount}`;
        state.percent = Math.floor((completed / targetCount) * 100);
        broadcastState();
      } else {
        log(`❌ Search failed: ${result.error}`, 'error');
      }

      // Delay between searches
      if (state.status === 'running' && i < waveEnd - 1) {
        const delay = randomDelay(config.minDelay, config.maxDelay);
        log(`⏳ Delay ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }

    // ====== AFTER WAVE: Verify points actually changed ======
    if (state.status === 'running' || state.status === 'cooldown') {
      log(`📊 Wave ${wave} done — verifying points...`);
      await sleep(3000); // Wait for MS to process
      const afterWave = await fetchPointsQuiet();
      if (afterWave.points !== null) {
        const prevPoints = state.points.current;
        recordPointSnapshot(afterWave.points, wave, `after_wave_${wave}`);
        const waveDelta = (prevPoints !== null) ? afterWave.points - prevPoints : null;

        if (waveDelta !== null && waveDelta > 0) {
          log(`📊 Wave ${wave}: +${waveDelta} pts ✅ (total earned: +${state.points.earned})`, 'success');
        } else if (waveDelta === 0) {
          log(`⚠️ Wave ${wave}: 0 pts earned — searches may not be counting!`, 'warning');
        } else if (waveDelta !== null && waveDelta < 0) {
          log(`⚠️ Wave ${wave}: ${waveDelta} pts (points decreased?!)`, 'warning');
        } else {
          log(`📊 Wave ${wave}: ${afterWave.points.toLocaleString()} pts (no prev to compare)`);
        }
      } else {
        log(`⚠️ Wave ${wave}: Could not verify points (${afterWave.source})`, 'warning');
      }
      broadcastState();
    }

    // Wave pause (except last wave)
    if (wave < totalWaves && state.status === 'running') {
      const pauseMin = config.wavePauseMin || 15;
      const pauseMs = pauseMin * 60 * 1000 + randomInt(0, 60000);
      state.status = 'cooldown';
      log(`😴 Wave pause: ${pauseMin}+ min before wave ${wave + 1}...`, 'warning');
      broadcastState();
      await sleep(pauseMs);
      if (state.status === 'cooldown') state.status = 'running';
    }
  }

  // ====== FINAL: Summary ======
  if (state.status === 'running' || state.status === 'cooldown') {
    state.status = 'done';
    state.percent = 100;

    // Final point check
    log('📊 Final point verification...');
    const final = await fetchPointsQuiet();
    if (final.points !== null) {
      recordPointSnapshot(final.points, totalWaves + 1, 'final');
      const totalEarned = state.points.baseline !== null
        ? final.points - state.points.baseline
        : null;

      if (totalEarned !== null) {
        state.points.earned = totalEarned;
        log(`✅ Done ${completed}/${targetCount} searches — Real earned: +${totalEarned} pts`, 'success');
        if (totalEarned === 0) {
          log('⚠️ 0 points earned total — account may have reached daily limit or searches not counting', 'warning');
        }
      } else {
        log(`✅ Done ${completed}/${targetCount} searches — Points: ${final.points.toLocaleString()}`, 'success');
      }
    } else {
      log(`✅ Completed ${completed}/${targetCount} searches (could not verify points)`, 'success');
    }
  }
  broadcastState();
}

// ---- AUTOMATION: CHECK POINTS (manual button) ----
async function checkPoints() {
  let tab = null;
  try {
    log('⭐ Checking points...');
    tab = await createTab('https://rewards.bing.com/', false);
    await waitForTabLoad(tab.id);
    await sleep(5000);

    const result = await injectScript(tab.id, () => {
      return (async function() {
        let result = { points: null, status: 'UNKNOWN', breakdown: null };

        // BAN DETECTION
        const bodyText = document.body?.innerText || '';
        if (bodyText.match(/suspended|tạm ngưng|bị khóa|vi phạm/i)) {
          result.status = 'BANNED';
          return result;
        }

        // METHOD 1: Full API (lấy cả breakdown)
        try {
          const r = await fetch('https://rewards.bing.com/api/getuserinfo?type=1', {
            cache: 'no-cache'
          });
          if (r.ok) {
            const data = await r.json();
            const us = data?.dashboard?.userStatus;
            if (us) {
              result.points = us.availablePoints;
              result.status = 'OK';
              // Lấy thêm thông tin breakdown nếu có
              result.breakdown = {
                available: us.availablePoints,
                lifetime: us.lifetimePoints || null,
                redeemable: us.redeemablePoints || null,
                level: us.levelInfo?.activeLevel || null
              };
              // Lấy counters (PC search, mobile search, edge bonus)
              const counters = data?.dashboard?.userStatus?.counters;
              if (counters) {
                result.breakdown.counters = {};
                for (const [key, val] of Object.entries(counters)) {
                  if (val?.complete !== undefined && val?.pointProgress !== undefined) {
                    result.breakdown.counters[key] = {
                      progress: val.pointProgress,
                      max: val.pointProgressMax,
                      complete: val.complete
                    };
                  }
                }
              }
              return result;
            }
          }
        } catch (e) {}

        // METHOD 2: DOM selectors (fallback)
        const extractPoints = (text) => {
          if (!text) return null;
          const matches = text.match(/(\d{1,3}(?:[,.\s]\d{3})+|\d+)/g);
          if (matches) {
            const nums = matches.map(m => parseInt(m.replace(/[,.\s]/g, ''), 10))
              .filter(n => !isNaN(n) && n >= 0 && n < 1000000)
              .sort((a, b) => b - a);
            for (const n of nums) { if (n >= 100) return n; }
          }
          return null;
        };

        const selectors = [
          '.text-title1.font-semibold',
          'p.text-title1.font-semibold',
          '.flex.items-center.gap-2 > p',
          '[class*="text-title1"]',
          'mee-rewards-user-status-balance',
          '#balanceToolTip',
          '.pointsValue',
          '[class*="balance"]'
        ];

        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              const num = extractPoints(el.innerText || el.textContent);
              if (num !== null) {
                result.points = num;
                result.status = 'OK';
                return result;
              }
            }
          } catch(e) {}
        }

        return result;
      })();
    });

    await closeTab(tab.id);

    if (result?.status === 'BANNED') {
      state.status = 'error';
      log('🚫 ACCOUNT BANNED / SUSPENDED!', 'error');
    } else if (result?.status === 'OK' && result.points !== null) {
      // Update state with real data
      const prevPoints = state.points.current;
      state.points.current = result.points;
      state.points.lastCheck = Date.now();

      // If we have a baseline, show real earned
      if (state.points.baseline !== null) {
        state.points.earned = result.points - state.points.baseline;
        log(`⭐ Points: ${result.points.toLocaleString()} (earned: +${state.points.earned} since baseline)`, 'success');
      } else {
        // No baseline yet — set this as baseline
        state.points.baseline = result.points;
        state.points.earned = 0;
        log(`⭐ Points: ${result.points.toLocaleString()} (set as baseline)`, 'success');
      }

      // Show delta since last check
      if (prevPoints !== null && prevPoints !== result.points) {
        const delta = result.points - prevPoints;
        log(`   Δ ${delta > 0 ? '+' : ''}${delta} since last check`);
      }

      // Show breakdown if available
      if (result.breakdown?.counters) {
        for (const [key, val] of Object.entries(result.breakdown.counters)) {
          const name = key.replace(/([A-Z])/g, ' $1').trim();
          const pct = val.max > 0 ? Math.round((val.progress / val.max) * 100) : 0;
          log(`   📈 ${name}: ${val.progress}/${val.max} (${pct}%) ${val.complete ? '✅' : ''}`);
        }
      }

      recordPointSnapshot(result.points, state.wave.current, 'manual_check');
    } else {
      log('⚠️ Could not read points (API + DOM both failed)', 'warning');
    }
    broadcastState();

  } catch (e) {
    if (tab) await closeTab(tab.id);
    log(`❌ Points check failed: ${e.message}`, 'error');
  }
}

// ---- AUTOMATION: DAILY TASKS ----
async function runDailyTasks() {
  log(`[Daily Tasks] Bắt đầu tự động làm nhiệm vụ hàng ngày...`);
  let dashTab = null;
  let totalCompleted = 0;
  let apiUrls = [];

  try {
    // 🔥 TẢI DỮ LIỆU SUPER ACCURATE JSON QUA API
    log('🤖 [API] Đang tải Database JSON cực kỳ chính xác từ Microsoft Server...');
    const apiRes = await fetch("https://rewards.bing.com/api/getuserinfo?type=1");
    if (apiRes.ok) {
      const dbData = await apiRes.json();
      const dashboard = dbData.dashboard || {};

      const isValidTask = (task) => {
        if (!task || typeof task !== 'object') return false;
        if (task.activity) return false; // skip meta wrappers
        return task.destinationUrl && !task.destinationUrl.includes('referandearn');
      };

      const extractFromArray = (arr) => {
        if (!Array.isArray(arr)) return;
        for (const task of arr) {
          if (isValidTask(task) && !task.complete && !task.pointProgressMax) {
            apiUrls.push(task.destinationUrl);
          }
        }
      };

      // Extract tasks from API object structures (dailySetPromotions is {date: {default: [...]}}, etc.)
      const extractFromSection = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          // some sections are direct arrays
          extractFromArray(obj);
          return;
        }
        for (const val of Object.values(obj)) {
          if (Array.isArray(val)) {
            extractFromArray(val);
          } else if (typeof val === 'object' && val !== null) {
            // drill one level deeper (e.g. { "default": [...] })
            extractFromArray(val.default || val);
          }
        }
      };

      // 1. Quét Daily Set (keyed: {dateKey: {default: [tasks]}})
      if (dashboard.dailySetPromotions) {
        extractFromSection(dashboard.dailySetPromotions);
      }
      // 2. Quét More Promotions
      if (dashboard.morePromotions) {
        extractFromSection(dashboard.morePromotions);
      }
      // 3. Quét PunchCards
      if (dashboard.punchCards && Array.isArray(dashboard.punchCards)) {
        for (const pc of dashboard.punchCards) {
          if (pc.activities && Array.isArray(pc.activities)) {
            extractFromArray(pc.activities);
          }
          if (pc.parentPromotion) {
            if (Array.isArray(pc.parentPromotion)) {
              extractFromArray(pc.parentPromotion);
            } else if (Array.isArray(pc.parentPromotion.promotions)) {
              extractFromArray(pc.parentPromotion.promotions);
            }
          }
        }
      }

      // Khử trùng lặp URL
      apiUrls = [...new Set(apiUrls)];
      log(`🔥 [API] Thành công! Tìm thấy chính xác ${apiUrls.length} nhiệm vụ cần làm.`);
    }
  } catch (e) {
    log(`[API Error] Lỗi khi kéo Database: ${e.message}`, 'error');
  }

  try {
    if (apiUrls.length > 0) {
      log(`[API Task] Bắt đầu xử lý ${apiUrls.length} nhiệm vụ...`);
      for (const url of apiUrls) {
        let taskTab = null;
        try {
          if (url.includes('microsoft.com/en-us/edge') || url.includes('bing.com/explore')) continue;

          log(`🎯 Mở task: ${url.substring(0, 50)}...`);
          taskTab = await createTab(url, false);
          await waitForTabLoad(taskTab.id);
          await sleep(4000);

          await injectScript(taskTab.id, () => {
            window.alert = () => { }; window.confirm = () => false; window.prompt = () => null;
            const cancels = document.querySelectorAll('button[class*="cancel"], button[class*="close"]');
            cancels.forEach(c => { try { c.click(); } catch (e) { } });
          });

          await sleep(1500);
          await closeTab(taskTab.id);
          totalCompleted++;
          await sleep(2000);
        } catch (e) {
          if (taskTab) await closeTab(taskTab.id);
        }
      }
      log(`✅ Đã xong toàn bộ ${totalCompleted} nhiệm vụ theo API.`);
    }

    log('📋 [Phase 3] Dashboard — clicking all task cards...');
    dashTab = await createTab('https://rewards.bing.com/', false);
    await waitForTabLoad(dashTab.id);
    await sleep(5000);

    const dashboardResult = await injectScript(dashTab.id, () => {
      return (async function () {
        const delay = ms => new Promise(r => setTimeout(r, ms));

        // Scroll to load all lazy cards
        document.body.style.scrollBehavior = 'auto';
        const totalH = document.documentElement.scrollHeight;
        let pos = 0;
        while (pos < totalH) {
          pos = Math.min(pos + 400, totalH);
          window.scrollTo(0, pos);
          await delay(250);
        }
        window.scrollTo(0, 0);
        await delay(600);

        const clicked = [];

        // STRATEGY 1: Find <a> task cards — match React Aria disclosure panel cards
        // Each card is <a target="_blank" href="bing.com/search?q=..." cursor-pointer>
        const taskCards = document.querySelectorAll('a[href][target="_blank"][class*="cursor-pointer"]');

        const skipUrlPatterns = [
          /referandearn/i, /refer/i, /invite/i, /settings/i, /about/i,
          /terms/i, /privacy/i, /profile/i, /account/i, /redeem/i,
          /download/i, /microsoft\.com\/en-us\/edge/i, /bing\.com\/explore/i,
          /app/i, /signup/i
        ];

        // Check if a task (card or parent) is completed
        const isCompleted = (card) => {
          // Check for checkmark/done elements
          const checkElements = card?.querySelectorAll?.('.sw-checkmark, .completed, [class*="done"], [class*="checkmark"]');
          if (checkElements?.length) return true;
          // Check for "Completed"/"Hoàn thành" text (the dashboard shows "Completed" in a div)
          const text = card?.textContent || '';
          if (/completed|hoàn thành|đã hoàn thành/i.test(text)) return true;
          return false;
        };

        for (const card of taskCards) {
          const rect = card.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 30) continue;

          const url = card.href || '';
          const text = (card.textContent || '').trim().toLowerCase();

          // Must be a bing or rewards task URL
          if (!url.includes('bing.com') && !url.includes('rewards.bing.com')) continue;
          if (skipUrlPatterns.some(p => p.test(url))) continue;

          // Skip completed
          if (isCompleted(card)) continue;

          try {
            const titleEl = card.querySelector('p[class*="line-clamp"]') || card.querySelector('[class*="Strong"]');
            const title = titleEl ? titleEl.textContent.trim() : text.substring(0, 30);
            const ptsEl = card.querySelector('[class*="caption1Stronger"]') || card.querySelector('[class*="statusInformative"]');
            const pts = ptsEl ? ptsEl.textContent.trim() : '';

            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(800);
            card.click();
            clicked.push(`${title} (${pts || '?'} pts)`);
            await delay(8000);
          } catch (e) { }
        }

        // STRATEGY 2: XPath fallback by section header
        if (clicked.length === 0) {
          const headers = ['Daily Set', 'hàng ngày', 'hoạt động khác', 'More activities', 'Earn more', 'Nhiệm vụ phụ'];
          for (const header of headers) {
            try {
              const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${header.toLowerCase()}')]/ancestor::*[position() <= 3]//a[@href and contains(@href, 'bing.com')]`;
              const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (let i = 0; i < result.snapshotLength; i++) {
                const link = result.snapshotItem(i);
                if (link.closest('.sw-checkmark, .completed')) continue;
                link.click();
                clicked.push(`xpath:${header}`);
                await delay(2000);
              }
            } catch (e) { }
          }
        }

        return { clicked };
      })();
    });

    if (dashboardResult?.clicked?.length > 0) {
      totalCompleted += dashboardResult.clicked.length;
    } else {
      log(`📦 Dashboard: No pending tasks found`);
    }
    // Cleanup
    await sleep(1500);
    const finalTabs = await chrome.tabs.query({});
    for (const t of finalTabs) {
      if (t.id !== dashTab.id &&
          !t.url?.startsWith('chrome://') &&
          !t.url?.startsWith('chrome-extension://') &&
          !t.url?.includes('rewards.bing.com')) {
        if (t.url?.includes('bing.com') || t.url?.includes('msn.com') || t.url?.includes('microsoft.com')) {
          await closeTab(t.id);
        }
      }
    }
    await closeTab(dashTab.id);
    dashTab = null;

    log(`✅ Daily tasks complete! Total: ${totalCompleted} actions`, 'success');
    return { success: true, completed: totalCompleted };

  } catch (e) {
    if (tab) await closeTab(tab.id);
    if (e.message === 'USER_STOPPED') throw e;
    log(`❌ Daily tasks failed: ${e.message}`, 'error');
    return { success: false, completed: totalCompleted, error: e.message };
  }
}

// ---- AUTOMATION: MOBILE DAILY TASKS ----
async function runMobileDailyTasks() {
  let tab = null;
  let totalCompleted = 0;

  try {
    log('📱 Enabling mobile mode...');
    await setMobileMode(true);
    await sleep(500);

    // Open Bing in mobile mode
    log('📱 Opening Bing in mobile mode...');
    tab = await createTab('https://www.bing.com/', false);
    await waitForTabLoad(tab.id);
    await sleep(3000);

    log('🔍 Looking for mobile tasks...');
    const mobileResult = await injectScript(tab.id, () => {
      return (async function() {
        const results = { found: 0, clicked: 0, taskNames: [], readArticleUrls: [] };
        const delay = ms => new Promise(r => setTimeout(r, ms));

        const clickElement = async (el) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await delay(500);
          if (el.href) { window.open(el.href, '_blank'); } else { el.click(); }
          await delay(1000);
        };

        // Scroll down
        for (let i = 0; i < 8; i++) {
          window.scrollBy({ top: 300, behavior: 'smooth' });
          await delay(600);
        }
        window.scrollTo(0, 0);
        await delay(1000);

        // MOBILE TASK 1: Rewards/Check-in
        const rewardsSelectors = [
          '[class*="rewards"]', '[id*="rewards"]', '[class*="checkin"]',
          '[class*="check-in"]', '[class*="streak"]', '#id_rc',
          '.rewards_flyout', '#rewardsApp'
        ];
        for (const sel of rewardsSelectors) {
          try {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const rect = el.getBoundingClientRect();
              if (rect.width < 20 || rect.height < 20) continue;
              const text = el.textContent || '';
              if (text.length > 200) continue;
              const isClickable = el.tagName === 'A' || el.tagName === 'BUTTON' ||
                el.style.cursor === 'pointer' || el.getAttribute('role') === 'button';
              if (isClickable) {
                results.found++;
                results.taskNames.push('Rewards: ' + text.substring(0, 40).trim());
                await clickElement(el);
                results.clicked++;
                await delay(3000);
              }
            }
          } catch(e) {}
        }

        // MOBILE TASK 2: Read to Earn
        const newsSelectors = [
          '.news-card a', '[class*="news"] a[href]', '.infopane a[href]',
          'a.story-card', '[class*="feed"] a[href]', '.content-card a',
          'article a[href]', '.card a[href*="msn.com"]'
        ];
        for (const sel of newsSelectors) {
          try {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const rect = el.getBoundingClientRect();
              if (rect.width < 50 || rect.height < 30) continue;
              if (el.href && !results.readArticleUrls.includes(el.href)) {
                results.readArticleUrls.push(el.href);
                if (results.readArticleUrls.length >= 5) break;
              }
            }
          } catch(e) {}
          if (results.readArticleUrls.length >= 5) break;
        }
        for (let i = 0; i < Math.min(3, results.readArticleUrls.length); i++) {
          results.found++;
          results.taskNames.push('Read: article ' + (i + 1));
        }

        // MOBILE TASK 3: Point-earning elements
        const allClickable = document.querySelectorAll('a[href], button, [role="button"]');
        for (const el of allClickable) {
          if (results.clicked >= 10) break;
          const text = el.textContent || '';
          const rect = el.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 30) continue;
          if (el.closest('header') || el.closest('nav')) continue;
          const hasPoints = text.match(/[+]\s*\d+\s*(pts|points|điểm)?/i);
          const hasTask = text.match(/(quiz|poll|trivia|daily|check.?in|earn|reward|complete|claim)/i);
          if (hasPoints || hasTask) {
            if (text.includes('Sign') || text.includes('Settings')) continue;
            results.found++;
            results.taskNames.push('Task: ' + text.substring(0, 40).trim());
            await clickElement(el);
            results.clicked++;
            await delay(3000);
          }
        }
        return { ...results, readArticleUrls: results.readArticleUrls.slice(0, 3) };
      })();
    });

    const mobileData = mobileResult || { found: 0, clicked: 0, taskNames: [], readArticleUrls: [] };
    totalCompleted += mobileData.clicked;
    if (mobileData.taskNames?.length > 0) {
      mobileData.taskNames.forEach(name => log(`   📱 ${name}`));
    }

    // Read articles (dwell time)
    const articleUrls = mobileData.readArticleUrls || [];
    if (articleUrls.length > 0) {
      log(`📰 Read to Earn: Opening ${articleUrls.length} articles...`);
      for (const url of articleUrls) {
        try {
          await chrome.tabs.update(tab.id, { url });
          await waitForTabLoad(tab.id).catch(() => {});
          await sleep(2000);

          await injectScript(tab.id, () => {
            return (async function() {
              const delay = ms => new Promise(r => setTimeout(r, ms));
              const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
              const scrollCount = randomInt(15, 25);
              for (let i = 0; i < scrollCount; i++) {
                window.scrollBy({ top: randomInt(150, 400), behavior: 'smooth' });
                await delay(randomInt(1000, 3000));
                if (Math.random() < 0.2) {
                  window.scrollBy({ top: -randomInt(50, 150), behavior: 'smooth' });
                  await delay(randomInt(500, 1500));
                }
              }
            })();
          });

          totalCompleted++;
          log(`   📰 Read article: ${url.substring(0, 60)}...`);
          await sleep(1000);
        } catch (e) {
          log(`   ⚠️ Article read failed: ${e.message}`, 'warning');
        }
      }
    }

    // Mobile rewards dashboard
    log('📱 Checking mobile rewards dashboard...');
    await chrome.tabs.update(tab.id, { url: 'https://rewards.bing.com/' });
    await waitForTabLoad(tab.id).catch(() => {});
    await sleep(4000);

    const mobileDashResult = await injectScript(tab.id, () => {
      return (async function() {
        const results = { found: 0, clicked: 0, taskNames: [] };
        const delay = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 5; i++) {
          window.scrollBy({ top: 300, behavior: 'smooth' });
          await delay(500);
        }
        window.scrollTo(0, 0);
        await delay(500);
        const allClickable = document.querySelectorAll('a[href], button, [role="button"]');
        for (const el of allClickable) {
          if (results.clicked >= 8) break;
          const text = el.textContent || '';
          const rect = el.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 25) continue;
          if (el.closest('header') || el.closest('nav')) continue;
          if (text.includes('Sign in') || text.includes('Redeem') || text.includes('About')) continue;
          const hasPoints = text.match(/[+•]\s*\d+/);
          const hasCheck = el.querySelector('[class*="check"]');
          if (hasPoints && !hasCheck) {
            results.found++;
            results.taskNames.push(text.substring(0, 40).trim());
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(400);
            if (el.href) { window.open(el.href, '_blank'); } else { el.click(); }
            results.clicked++;
            await delay(4000);
          }
        }
        return results;
      })();
    });

    const mobileDash = mobileDashResult || { found: 0, clicked: 0, taskNames: [] };
    totalCompleted += mobileDash.clicked;
    if (mobileDash.taskNames?.length > 0) {
      mobileDash.taskNames.forEach(n => log(`   📱 Mobile dash: ${n}`));
    }

    // Disable mobile and cleanup
    await setMobileMode(false);
    await sleep(2000);
    const allTabs = await chrome.tabs.query({});
    for (const t of allTabs) {
      if (t.id !== tab.id && (t.url?.includes('bing.com') || t.url?.includes('msn.com'))) {
        await closeTab(t.id);
      }
    }
    await closeTab(tab.id);

    log(`✅ Mobile tasks completed: ${totalCompleted}`, 'success');
    return { success: true, completed: totalCompleted };

  } catch (e) {
    await setMobileMode(false);
    if (tab) await closeTab(tab.id);
    if (e.message === 'USER_STOPPED') throw e;
    log(`❌ Mobile tasks failed: ${e.message}`, 'error');
    return { success: false, completed: 0, error: e.message };
  }
}

// ---- AUTOMATION: RESET PAGE ----
async function resetPage() {
  try {
    log('🔄 Resetting & cleaning tabs...');
    const allTabs = await chrome.tabs.query({});
    let closedCount = 0;

    // Find or create rewards tab
    let rewardsTab = allTabs.find(t => t.url?.includes('rewards.bing.com'));
    if (!rewardsTab) {
      rewardsTab = await createTab('https://rewards.bing.com/', true);
      await waitForTabLoad(rewardsTab.id).catch(() => {});
    }

    // Close non-essential tabs
    for (const t of allTabs) {
      if (t.id === rewardsTab.id) continue;
      if (t.url?.includes('bing.com') || t.url?.includes('msn.com')) {
        await closeTab(t.id);
        closedCount++;
      }
    }

    if (closedCount > 0) log(`🗑️ Closed ${closedCount} tabs`);

    // Reload rewards tab
    await chrome.tabs.reload(rewardsTab.id);
    log('✅ Rewards page reloaded', 'success');
    return { success: true };

  } catch (e) {
    log(`❌ Reset failed: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

// ---- MESSAGE HANDLER ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'get_state') {
    sendResponse({ state: getPublicState(), logs: state.logs.slice(0, 50) });
    return true;
  }

  if (msg.action === 'get_config') {
    getConfig().then(config => sendResponse({ config }));
    return true;
  }

  if (msg.action === 'save_config') {
    saveConfig(msg.config).then(() => {
      log('⚙️ Config saved!', 'success');
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === 'command') {
    handleCommand(msg.command);
    sendResponse({ received: true });
    return true;
  }

  return false;
});

async function handleCommand(command) {
  switch (command) {
    case 'start_search':
      if (state.status === 'running') { log('⚠️ Already running!', 'warning'); return; }
      startSearchAutomation().catch(e => {
        if (e.message !== 'USER_STOPPED') log(`❌ Search Error: ${e.message}`, 'error');
      });
      break;

    case 'stop':
      state.status = 'stopped';
      log('⏹️ Stopped!', 'warning');
      broadcastState();
      break;

    case 'check_points':
      checkPoints().catch(e => {
        if (e.message !== 'USER_STOPPED') log(`❌ Point Check Error: ${e.message}`, 'error');
      });
      break;

    case 'daily_tasks':
      if (state.status === 'running') { log('⚠️ Already running!', 'warning'); return; }
      state.status = 'running';
      broadcastState();
      
      (async () => {
        await runDailyTasks();
        const config = await getConfig();
        if (config.mobileMode && state.status === 'running') {
          await runMobileDailyTasks();
        }
        if (state.status === 'running') state.status = 'idle';
        broadcastState();
      })().catch(e => {
        if (e.message !== 'USER_STOPPED') log(`❌ Task Error: ${e.message}`, 'error');
      });
      break;

    case 'reset_page':
      resetPage().catch(e => {
        if (e.message !== 'USER_STOPPED') log(`❌ Reset Error: ${e.message}`, 'error');
      });
      break;

    case 'reset_progress':
      state.status = 'idle';
      state.progress = '0/0';
      state.percent = 0;
      state.currentSearch = 0;
      state.points = { current: null, earned: 0, baseline: null, lastCheck: null, history: [] };
      state.wave = { current: 0, total: 0 };
      log('🔄 Progress + points reset', 'success');
      broadcastState();
      break;
  }
}

// ---- KEEP-ALIVE ----
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && (state.status === 'running' || state.status === 'cooldown')) {
    // Service worker stays alive while automation is active
  }
});

// ---- INIT ----
log('⚡ Extension loaded', 'success');
