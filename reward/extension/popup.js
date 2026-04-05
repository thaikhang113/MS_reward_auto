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

// ---- SIZE TOGGLE ----
let isExpanded = false;

// Load saved size preference
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
    // Get current state
    const response = await chrome.runtime.sendMessage({ action: 'get_state' });
    if (response?.state) updateUI(response.state);
    if (response?.logs) {
      DOM.logWindow.innerHTML = '';
      response.logs.forEach(entry => addLogEntry(entry));
    }
    
    // Get config
    const configResponse = await chrome.runtime.sendMessage({ action: 'get_config' });
    if (configResponse?.config) loadConfig(configResponse.config);
    
  } catch (e) {
    addLogEntry({ text: '⚡ Extension ready', type: 'info', time: new Date().toLocaleTimeString() });
  }
}

// ---- UI UPDATE ----
function updateUI(state) {
  // Points — show '---' if never checked, real number otherwise
  const pts = state.points?.current;
  DOM.pointsValue.textContent = (pts !== null && pts !== undefined)
    ? pts.toLocaleString()
    : '---';

  // Earned badge — only show if we have real data
  const earned = state.points?.earned;
  if (earned !== null && earned !== undefined && earned !== 0) {
    DOM.pointsEarned.textContent = `${earned > 0 ? '+' : ''}${earned}`;
    DOM.pointsEarned.style.color = earned > 0 ? '#10b981' : '#ef4444';
  } else if (pts !== null && earned === 0 && state.points?.baseline !== null) {
    DOM.pointsEarned.textContent = '±0';
    DOM.pointsEarned.style.color = '#6b7280';
  } else {
    DOM.pointsEarned.textContent = '';
    DOM.pointsEarned.style.color = '';
  }
  
  // Status badge
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
  
  // Wave info
  if (state.wave?.current > 0 && state.wave?.total > 0) {
    DOM.waveInfo.textContent = `Wave ${state.wave.current}/${state.wave.total}`;
  } else {
    DOM.waveInfo.textContent = '';
  }
  
  // Progress
  DOM.progressBar.style.width = `${state.percent || 0}%`;
  DOM.progressText.textContent = state.progress || '0/0';
  
  // Button states
  const isRunning = status === 'running' || status === 'cooldown';
  DOM.btnSearch.disabled = isRunning;
  DOM.btnTasks.disabled = isRunning;
  DOM.btnSearch.style.opacity = isRunning ? '0.5' : '1';
  DOM.btnTasks.style.opacity = isRunning ? '0.5' : '1';
}

// ---- SPEED LEVELS ----
const SPEED_LEVELS = {
  1: { name: 'Siêu an toàn',  minDelay: 50, maxDelay: 90,  waveSize: 2, wavePause: 25, color: '#10b981' },
  2: { name: 'An toàn',       minDelay: 35, maxDelay: 60,  waveSize: 3, wavePause: 20, color: '#34d399' },
  3: { name: 'Bình thường',   minDelay: 20, maxDelay: 40,  waveSize: 4, wavePause: 15, color: '#00e5ff' },
  4: { name: 'Nhanh',         minDelay: 12, maxDelay: 25,  waveSize: 5, wavePause: 10, color: '#f59e0b' },
  5: { name: 'Rất nhanh',     minDelay: 8,  maxDelay: 15,  waveSize: 6, wavePause: 7,  color: '#ef4444' },
  6: { name: 'Tốc biến ⚠️',   minDelay: 5,  maxDelay: 10,  waveSize: 8, wavePause: 5,  color: '#dc2626' }
};

function updateSpeedDisplay(level) {
  const s = SPEED_LEVELS[level];
  if (!s) return;
  DOM.speedBadge.textContent = `Lv.${level} — ${s.name}`;
  DOM.speedBadge.style.color = s.color;
  DOM.speedDetail.textContent = `Delay ${s.minDelay}-${s.maxDelay}s · Wave ${s.waveSize} · Pause ${s.wavePause}p`;
}

// Live slider preview
DOM.cfgSpeed.addEventListener('input', () => {
  updateSpeedDisplay(parseInt(DOM.cfgSpeed.value));
});

// ---- CONFIG ----
function loadConfig(config) {
  if (config.rewardsLevel) DOM.cfgLevel.value = config.rewardsLevel;
  if (config.searchCount) DOM.cfgSearch.value = config.searchCount;
  if (config.speedLevel) {
    DOM.cfgSpeed.value = config.speedLevel;
    updateSpeedDisplay(config.speedLevel);
  } else {
    // Fallback: guess speed level from old config values
    DOM.cfgSpeed.value = 3;
    updateSpeedDisplay(3);
  }
  if (config.mobileMode !== undefined) DOM.cfgMobile.checked = config.mobileMode;
}

function getConfigFromUI() {
  const speedLevel = parseInt(DOM.cfgSpeed.value) || 3;
  const s = SPEED_LEVELS[speedLevel];
  return {
    rewardsLevel: DOM.cfgLevel.value,
    searchCount: parseInt(DOM.cfgSearch.value) || 12,
    speedLevel: speedLevel,
    minDelay: s.minDelay,
    maxDelay: s.maxDelay,
    waveSize: s.waveSize,
    wavePauseMin: s.wavePause,
    mobileMode: DOM.cfgMobile.checked
  };
}

// ---- LOGGING ----
function addLogEntry(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.type || 'info'}`;
  div.innerHTML = `<span class="log-time">[${entry.time || '--:--:--'}]</span> ${escapeHtml(entry.text)}`;
  
  // Append (newest at bottom — terminal style)
  DOM.logWindow.appendChild(div);
  
  // Auto-scroll to bottom (luôn thấy log mới nhất)
  DOM.logWindow.scrollTop = DOM.logWindow.scrollHeight;
  
  // Limit entries (xóa cũ nhất ở trên)
  while (DOM.logWindow.children.length > 100) {
    DOM.logWindow.removeChild(DOM.logWindow.firstChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  if (confirm('Xóa tiến trình hiện tại?')) {
    sendCommand('reset_progress');
  }
});

DOM.btnSaveConfig.addEventListener('click', async () => {
  const config = getConfigFromUI();
  const response = await chrome.runtime.sendMessage({ action: 'save_config', config });
  if (response?.success) {
    // Flash save button
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
  DOM.logWindow.innerHTML = '';
  addLogEntry({ text: 'Log cleared', type: 'info', time: new Date().toLocaleTimeString() });
});

// ---- POLL STATE (backup for when popup was closed) ----
setInterval(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_state' });
    if (response?.state) updateUI(response.state);
  } catch(e) {}
}, 3000);

// ---- INIT ----
init();
