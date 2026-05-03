// =============================================
// BING REWARDS AUTO - POPUP UI CONTROLLER
// Handles compact/expanded toggle, commands,
// and real-time state updates from background.js
// =============================================

// ---- DOM ELEMENTS ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  // Header
  pointsValue: $('#points-value'),
  pointsEarned: $('#points-earned'),
  btnToggleSize: $('#btn-toggle-size'),

  // Status
  statusBadge: $('#status-badge'),
  statusDot: $('#status-dot'),
  statusText: $('#status-text'),
  waveInfo: $('#wave-info'),
  progressBar: $('#progress-bar'),
  progressText: $('#progress-text'),

  // Buttons
  btnSearch: $('#btn-search'),
  btnStop: $('#btn-stop'),
  btnTasks: $('#btn-tasks'),
  btnPoints: $('#btn-points'),
  btnResetPage: $('#btn-reset-page'),
  btnResetProgress: $('#btn-reset-progress'),
  btnSaveConfig: $('#btn-save-config'),
  btnClearLogs: $('#btn-clear-logs'),

  // Config
  cfgLevel: $('#cfg-level'),
  cfgSearch: $('#cfg-search'),
  cfgMobileSearch: $('#cfg-mobile-search'),
  cfgSpeed: $('#cfg-speed'),
  speedBadge: $('#speed-badge'),
  speedDetail: $('#speed-detail'),
  cfgMobile: $('#cfg-mobile'),
  mobileModeState: $('#mobile-mode-state'),
  mobileProgressState: $('#mobile-progress-state'),
  mobileCountedState: $('#mobile-counted-state'),
  mobileRemainingState: $('#mobile-remaining-state'),
  mobileVerifyState: $('#mobile-verify-state'),
  pcModeState: $('#pc-mode-state'),
  pcProgressState: $('#pc-progress-state'),
  pcCountedState: $('#pc-counted-state'),
  pcRemainingState: $('#pc-remaining-state'),
  pcVerifyState: $('#pc-verify-state'),
  summaryBaselineState: $('#summary-baseline-state'),
  summaryFinalState: $('#summary-final-state'),
  summaryEarnedState: $('#summary-earned-state'),
  summaryBadgeState: $('#summary-badge-state'),
  summaryDeltaState: $('#summary-delta-state'),

  // Sections
  expandedSection: $('#expanded-section'),
  logWindow: $('#log-window')
};

const MAX_LOGS = 50;
const LOG_AUTO_SCROLL_THRESHOLD = 24;
const logRenderQueue = [];
let logFlushFrame = 0;
let latestState = null;

function isLiveTestPopup() {
  return new URLSearchParams(window.location.search).has('liveTest');
}

// ---- SIZE TOGGLE ----
let isExpanded = false;

chrome.storage.local.get('uiExpanded', (result) => {
  if (result.uiExpanded) {
    isExpanded = true;
    document.body.classList.replace('compact', 'expanded');
  }
});

DOM.btnToggleSize.addEventListener('click', () => {
  isExpanded = !isExpanded;

  if (isExpanded) {
    document.body.classList.replace('compact', 'expanded');
  } else {
    document.body.classList.replace('expanded', 'compact');
  }

  chrome.storage.local.set({ uiExpanded: isExpanded });
});

// ---- INIT: Load state & config ----
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_state' });
    if (response?.state) updateUI(response.state);
    if (response?.logs) {
      setLogEntries(response.logs);
    } else {
      clearLogWindow();
    }

    const configResponse = await chrome.runtime.sendMessage({ action: 'get_config' });
    if (configResponse?.config) {
      loadConfig(configResponse.config);
      if (configResponse.config.autoRunOnOpen && !isLiveTestPopup()) {
        await chrome.runtime.sendMessage({ action: 'maybe_auto_start', reason: 'popup_open' });
      }
    }
  } catch (e) {
    addLogEntry({
      text: 'Extension ready',
      type: 'info',
      time: new Date().toLocaleTimeString()
    });
  }
}

// ---- UI UPDATE ----
function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderMobileState(state) {
  const mobile = state.mobile || {};
  const planned = mobile.planned || 0;
  const executed = mobile.executed || 0;
  const counted = mobile.counted || 0;
  const notCounted = mobile.notCounted || 0;
  const counter = mobile.counter;
  const runtimeEnabled = Boolean(mobile.enabled);
  const configured = DOM.cfgMobile.checked;

  let modeLabel = 'Off';
  if (runtimeEnabled) {
    modeLabel = 'Active';
  } else if (configured) {
    modeLabel = 'Ready';
  }

  DOM.mobileModeState.textContent = `Mode: ${modeLabel}`;
  DOM.mobileProgressState.textContent =
    `Progress: ${mobile.progressText || '0/0'} | Exec ${executed}/${planned}`;
  DOM.mobileCountedState.textContent =
    `Counted: ${counted} | Not counted: ${notCounted}`;
  DOM.mobileRemainingState.textContent =
    `Counter: ${counter ? `${counter.progress}/${counter.max}` : '--'} | Remaining: ${mobile.remaining ?? '--'}`;
  DOM.mobileVerifyState.textContent =
    `Verify: ${mobile.verificationBadge || 'API Verified'}`;
}

function renderPcState(state) {
  const pc = state.pc || {};
  const planned = pc.planned || 0;
  const executed = pc.executed || 0;
  const counted = pc.counted || 0;
  const notCounted = pc.notCounted || 0;
  const counter = pc.counter;

  const modeLabel = pc.verificationMode === 'availablePoints'
    ? 'points fallback'
    : (pc.verificationMode || 'counter');
  DOM.pcModeState.textContent = `Mode: ${modeLabel}`;
  DOM.pcProgressState.textContent =
    `Progress: ${pc.progressText || '0/0'} | Exec ${executed}/${planned}`;
  DOM.pcCountedState.textContent =
    `Counted: ${counted} | Not counted: ${notCounted}`;
  DOM.pcRemainingState.textContent =
    `Counter: ${counter ? `${counter.progress}/${counter.max}` : '--'} | Remaining: ${pc.remaining ?? '--'}`;
  DOM.pcVerifyState.textContent =
    `Verify: ${pc.verificationBadge || 'API Verified'}`;
}

function renderSummaryState(state) {
  const summary = state.summary || {};
  const verification = state.verification || {};
  const lastDelta = verification.lastVerifiedDelta || {};
  const points = state.points || {};
  const formatValue = (value) => (
    value !== undefined && value !== null && value !== '--'
      ? Number(value).toLocaleString()
      : '--'
  );

  DOM.summaryBaselineState.textContent =
    `Baseline: ${formatValue(summary.baselinePoints ?? points.baseline ?? '--')}`;
  DOM.summaryFinalState.textContent =
    `Final: ${formatValue(summary.finalPoints ?? points.current ?? '--')}`;
  DOM.summaryEarnedState.textContent =
    `Earned: ${summary.totalEarned !== undefined && summary.totalEarned !== null ? `${summary.totalEarned >= 0 ? '+' : ''}${summary.totalEarned}` : '--'}`;
  DOM.summaryBadgeState.textContent =
    `Badge: ${summary.verificationBadge || 'API Verified'}`;
  DOM.summaryDeltaState.textContent =
    `Last verify: ${lastDelta.mode ? `${lastDelta.type || '--'} / ${lastDelta.mode} / ${lastDelta.confidence || '--'}` : '--'}`;
}

function updateUI(state) {
  latestState = state;
  const pts = state.points?.current;
  DOM.pointsValue.textContent = (pts !== null && pts !== undefined)
    ? pts.toLocaleString()
    : '---';

  const earned = state.points?.earned;
  if (earned !== null && earned !== undefined && earned !== 0) {
    DOM.pointsEarned.textContent = `${earned > 0 ? '+' : ''}${earned}`;
    DOM.pointsEarned.style.color = earned > 0 ? '#10b981' : '#ef4444';
  } else if (pts !== null && earned === 0 && state.points?.baseline !== null) {
    DOM.pointsEarned.textContent = '+/-0';
    DOM.pointsEarned.style.color = '#6b7280';
  } else {
    DOM.pointsEarned.textContent = '';
    DOM.pointsEarned.style.color = '';
  }

  const status = state.status || 'idle';
  DOM.statusBadge.className = `status-badge ${status}`;

  const statusLabels = {
    idle: 'Idle',
    running: 'Running',
    cooldown: 'Wave Pause',
    stopped: 'Stopped',
    done: 'Completed',
    error: 'Error'
  };
  DOM.statusText.textContent = statusLabels[status] || status;

  if (status === 'cooldown' && state.cooldownUntil) {
    const remainingMs = state.cooldownUntil - Date.now();
    DOM.waveInfo.textContent = remainingMs > 0
      ? `Wave ${state.wave.current}/${state.wave.total} · Resume in ${formatCountdown(remainingMs)}`
      : `Wave ${state.wave.current}/${state.wave.total} · Resuming...`;
  } else if (state.wave?.current > 0 && state.wave?.total > 0) {
    DOM.waveInfo.textContent = `Wave ${state.wave.current}/${state.wave.total}`;
  } else {
    DOM.waveInfo.textContent = '';
  }

  DOM.progressBar.style.width = `${state.percent || 0}%`;
  DOM.progressText.textContent = state.progress || '0/0';

  const isRunning = status === 'running' || status === 'cooldown';
  DOM.btnSearch.disabled = isRunning;
  DOM.btnTasks.disabled = isRunning;
  DOM.btnSearch.style.opacity = isRunning ? '0.5' : '1';
  DOM.btnTasks.style.opacity = isRunning ? '0.5' : '1';
  renderMobileState(state);
  renderPcState(state);
  renderSummaryState(state);
}

// ---- SPEED LEVELS ----
const SPEED_LEVELS = {
  1: { name: 'Sieu an toan', minDelay: 50, maxDelay: 90, waveSize: 2, wavePause: 25, color: '#10b981' },
  2: { name: 'An toan', minDelay: 35, maxDelay: 60, waveSize: 3, wavePause: 20, color: '#34d399' },
  3: { name: 'Binh thuong', minDelay: 20, maxDelay: 40, waveSize: 4, wavePause: 15, color: '#00e5ff' },
  4: { name: 'Nhanh', minDelay: 12, maxDelay: 25, waveSize: 5, wavePause: 10, color: '#f59e0b' },
  5: { name: 'Rat nhanh', minDelay: 8, maxDelay: 15, waveSize: 6, wavePause: 7, color: '#ef4444' },
  6: { name: 'Toc bien', minDelay: 5, maxDelay: 10, waveSize: 8, wavePause: 5, color: '#dc2626' }
};

function updateSpeedDisplay(level) {
  const speed = SPEED_LEVELS[level];
  if (!speed) return;

  DOM.speedBadge.textContent = `Lv.${level} - ${speed.name}`;
  DOM.speedBadge.style.color = speed.color;
  DOM.speedDetail.textContent =
    `Delay ${speed.minDelay}-${speed.maxDelay}s · Wave ${speed.waveSize} · Pause ${speed.wavePause}p`;
}

DOM.cfgSpeed.addEventListener('input', () => {
  updateSpeedDisplay(parseInt(DOM.cfgSpeed.value, 10));
});

DOM.cfgMobile.addEventListener('change', () => {
  renderMobileState(latestState || { mobile: {} });
  renderPcState(latestState || { pc: {} });
  renderSummaryState(latestState || {});
});

// ---- CONFIG ----
function loadConfig(config) {
  if (config.rewardsLevel) DOM.cfgLevel.value = config.rewardsLevel;
  if (config.searchCount) DOM.cfgSearch.value = config.searchCount;
  if (config.mobileSearchCount !== undefined) DOM.cfgMobileSearch.value = config.mobileSearchCount;

  if (config.speedLevel) {
    DOM.cfgSpeed.value = config.speedLevel;
    updateSpeedDisplay(config.speedLevel);
  } else {
    DOM.cfgSpeed.value = 3;
    updateSpeedDisplay(3);
  }

  if (config.mobileMode !== undefined) {
    DOM.cfgMobile.checked = config.mobileMode;
  }

  if (latestState) {
    updateUI(latestState);
  } else {
    renderMobileState({ mobile: {} });
    renderPcState({ pc: {} });
    renderSummaryState({});
  }
}

function getConfigFromUI() {
  const speedLevel = parseInt(DOM.cfgSpeed.value, 10) || 3;
  const speed = SPEED_LEVELS[speedLevel];
  const mobileSearchCount = parseInt(DOM.cfgMobileSearch.value, 10);

  return {
    rewardsLevel: DOM.cfgLevel.value,
    searchCount: parseInt(DOM.cfgSearch.value, 10) || 30,
    speedLevel,
    minDelay: speed.minDelay,
    maxDelay: speed.maxDelay,
    waveSize: speed.waveSize,
    wavePauseMin: speed.wavePause,
    mobileMode: DOM.cfgMobile.checked,
    mobileSearchCount: Number.isFinite(mobileSearchCount) ? mobileSearchCount : 30
  };
}

// ---- LOGGING ----
function addLogEntry(entry) {
  if (!entry) return;
  logRenderQueue.push(entry);
  scheduleLogFlush();
}

function setLogEntries(entries) {
  clearLogWindow();

  const normalizedEntries = Array.isArray(entries)
    ? [...entries].reverse()
    : [];

  for (const entry of normalizedEntries) {
    logRenderQueue.push(entry);
  }

  scheduleLogFlush();
}

function clearLogWindow() {
  logRenderQueue.length = 0;

  if (logFlushFrame) {
    cancelAnimationFrame(logFlushFrame);
    logFlushFrame = 0;
  }

  DOM.logWindow.replaceChildren();
}

function scheduleLogFlush() {
  if (logFlushFrame) return;
  logFlushFrame = requestAnimationFrame(flushLogEntries);
}

function flushLogEntries() {
  logFlushFrame = 0;
  if (!logRenderQueue.length) return;

  const shouldAutoScroll = isLogWindowNearBottom();
  const pendingEntries = logRenderQueue.splice(0, logRenderQueue.length);
  const fragment = document.createDocumentFragment();

  for (const entry of pendingEntries) {
    fragment.appendChild(createLogEntryNode(entry));
  }

  DOM.logWindow.appendChild(fragment);
  trimLogWindow();

  if (shouldAutoScroll || DOM.logWindow.childElementCount <= MAX_LOGS) {
    DOM.logWindow.scrollTop = DOM.logWindow.scrollHeight;
  }
}

function createLogEntryNode(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.type || 'info'}`;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = `[${entry.time || '--:--:--'}]`;

  div.append(time, document.createTextNode(` ${entry.text || ''}`));
  return div;
}

function trimLogWindow() {
  const overflow = DOM.logWindow.childElementCount - MAX_LOGS;
  if (overflow <= 0) return;

  const cutoffNode = DOM.logWindow.children[overflow];
  if (!cutoffNode) {
    DOM.logWindow.replaceChildren();
    return;
  }

  const range = document.createRange();
  range.setStartBefore(DOM.logWindow.firstChild);
  range.setEndBefore(cutoffNode);
  range.deleteContents();
}

function isLogWindowNearBottom() {
  return (DOM.logWindow.scrollHeight - DOM.logWindow.scrollTop - DOM.logWindow.clientHeight)
    <= LOG_AUTO_SCROLL_THRESHOLD;
}

// ---- MESSAGE LISTENER ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'state_update') {
    updateUI(msg.data);
  }

  if (msg.action === 'log') {
    addLogEntry(msg.data);
  }
});

// ---- EVENT HANDLERS ----
function sendCommand(command) {
  chrome.runtime.sendMessage({ action: 'command', command });
}

DOM.btnSearch.addEventListener('click', () => sendCommand('start_search'));
DOM.btnStop.addEventListener('click', () => sendCommand('stop'));
DOM.btnTasks.addEventListener('click', () => sendCommand('daily_tasks'));
DOM.btnPoints.addEventListener('click', () => sendCommand('check_points'));
DOM.btnResetPage.addEventListener('click', () => sendCommand('reset_page'));

DOM.btnResetProgress.addEventListener('click', () => {
  if (confirm('Xoa tien trinh hien tai?')) {
    sendCommand('reset_progress');
  }
});

DOM.btnSaveConfig.addEventListener('click', async () => {
  const config = getConfigFromUI();
  const response = await chrome.runtime.sendMessage({ action: 'save_config', config });

  if (response?.success) {
    DOM.btnSaveConfig.style.background = 'rgba(16, 185, 129, 0.2)';
    DOM.btnSaveConfig.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    DOM.btnSaveConfig.style.color = '#10b981';

    setTimeout(() => {
      DOM.btnSaveConfig.style.background = '';
      DOM.btnSaveConfig.style.borderColor = '';
      DOM.btnSaveConfig.style.color = '';
    }, 1500);
  }
});

DOM.btnClearLogs.addEventListener('click', () => {
  clearLogWindow();
  addLogEntry({
    text: 'Log cleared',
    type: 'info',
    time: new Date().toLocaleTimeString()
  });
});

// ---- POLL STATE (backup for when popup was closed) ----
setInterval(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_state' });
    if (response?.state) updateUI(response.state);
  } catch (e) {}
}, 3000);

setInterval(() => {
  if (latestState?.status === 'cooldown' && latestState.cooldownUntil) {
    updateUI(latestState);
  }
}, 1000);

// ---- INIT ----
init();
