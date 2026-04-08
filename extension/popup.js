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
  cfgSpeed: $('#cfg-speed'),
  speedBadge: $('#speed-badge'),
  speedDetail: $('#speed-detail'),
  cfgMobile: $('#cfg-mobile'),

  // Sections
  expandedSection: $('#expanded-section'),
  logWindow: $('#log-window')
};

const MAX_LOGS = 50;
const LOG_AUTO_SCROLL_THRESHOLD = 24;
const logRenderQueue = [];
let logFlushFrame = 0;

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
    if (configResponse?.config) loadConfig(configResponse.config);
  } catch (e) {
    addLogEntry({
      text: 'Extension ready',
      type: 'info',
      time: new Date().toLocaleTimeString()
    });
  }
}

// ---- UI UPDATE ----
function updateUI(state) {
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

  if (state.wave?.current > 0 && state.wave?.total > 0) {
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

// ---- CONFIG ----
function loadConfig(config) {
  if (config.rewardsLevel) DOM.cfgLevel.value = config.rewardsLevel;
  if (config.searchCount) DOM.cfgSearch.value = config.searchCount;

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
}

function getConfigFromUI() {
  const speedLevel = parseInt(DOM.cfgSpeed.value, 10) || 3;
  const speed = SPEED_LEVELS[speedLevel];

  return {
    rewardsLevel: DOM.cfgLevel.value,
    searchCount: parseInt(DOM.cfgSearch.value, 10) || 12,
    speedLevel,
    minDelay: speed.minDelay,
    maxDelay: speed.maxDelay,
    waveSize: speed.waveSize,
    wavePauseMin: speed.wavePause,
    mobileMode: DOM.cfgMobile.checked
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

// ---- INIT ----
init();
