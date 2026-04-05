const socket = io();

// DOM Elements
const profileContainer = document.getElementById('profile-container');
const logWindow = document.getElementById('log-window');
const totalProfiles = document.getElementById('total-profiles');
const activeProfiles = document.getElementById('active-profiles');
const connectionStatus = document.getElementById('connection-status');

// Config Elements
const inputs = {
    level: document.getElementById('cfg-level'),
    searchCount: document.getElementById('cfg-search'),
    minDelay: document.getElementById('cfg-min-delay'),
    maxDelay: document.getElementById('cfg-max-delay'),
    mobileMode: document.getElementById('cfg-mobile')
};
const selectAllCheckbox = document.getElementById('cb-select-all');

// Selection State
let selectedProfiles = new Set();
try {
    const saved = localStorage.getItem('selectedProfiles');
    if (saved) selectedProfiles = new Set(JSON.parse(saved));
} catch(e) {}

function saveSelection() {
    localStorage.setItem('selectedProfiles', JSON.stringify(Array.from(selectedProfiles)));
}

function getSelectedProfileIds() {
    return Array.from(selectedProfiles);
}

// =============================================
// SOCKET LISTENERS
// =============================================

socket.on('connect', () => {
    addLog('Connected to server', 'success');
    updateConnectionStatus(true);
});

socket.on('disconnect', () => {
    addLog('Disconnected from server', 'error');
    updateConnectionStatus(false);
});

socket.on('log', (data) => {
    addLog(data.text, data.type);
});

socket.on('init', (data) => {
    const { config, profiles } = data;

    // Load Config
    if (inputs.level) inputs.level.value = config.rewardsLevel || 'gold';
    if (inputs.searchCount) inputs.searchCount.value = config.searchCount;
    if (inputs.minDelay) inputs.minDelay.value = config.minDelay;
    if (inputs.maxDelay) inputs.maxDelay.value = config.maxDelay;
    if (inputs.mobileMode) inputs.mobileMode.checked = config.mobileMode;

    updateStats(profiles);
});

socket.on('state_update', (data) => {
    updateStats(data.profiles);
});

// =============================================
// UI FUNCTIONS
// =============================================

function updateConnectionStatus(connected) {
    if (!connectionStatus) return;
    if (connected) {
        connectionStatus.className = 'status-badge connected';
        connectionStatus.innerHTML = '<span class="status-dot"></span><span>Connected</span>';
    } else {
        connectionStatus.className = 'status-badge disconnected';
        connectionStatus.innerHTML = '<span class="status-dot"></span><span>Disconnected</span>';
    }
}

function updateStats(profiles) {
    if (!profiles) return;
    
    // Automatically select all if this is the first time we see profiles and nothing is selected
    if (profiles.length > 0 && selectedProfiles.size === 0 && !localStorage.getItem('selectedProfiles')) {
        profiles.forEach(p => selectedProfiles.add(p.profileId));
        saveSelection();
    }
    
    totalProfiles.textContent = profiles.length;
    activeProfiles.textContent = profiles.filter(p => p.status === 'Running').length;
    renderProfiles(profiles);
}

function renderProfiles(profiles) {
    if (profiles.length === 0) {
        profileContainer.innerHTML = '<div class="empty-state"><p>No profiles detected. Open GenLogin browsers first.</p></div>';
        return;
    }

    profileContainer.innerHTML = profiles.map(p => {
        const percent = p.percent || 0;
        const isRunning = p.status === 'Running';
        const isDone = p.status === 'Done';
        const isError = p.status === 'Error';
        const isStopping = p.status === 'Stopping';
        const isStopped = p.status === 'Stopped';

        let statusClass = 'idle';
        if (isRunning) statusClass = 'running';
        if (isStopping || isStopped) statusClass = 'stopping';
        if (isDone) statusClass = 'done';
        if (isError) statusClass = 'error';
        if (p.status === 'BANNED') statusClass = 'error';
        if (p.status === 'UNKNOWN') statusClass = 'warning';

        let statusLabel = p.status;
        if (isDone) statusLabel = 'Completed';

        // Points tracking
        const points = p.points?.current || 0;
        const earned = p.points?.earned || 0;

        let earnedHtml = '';
        if (earned > 0) {
            earnedHtml = `<span class="earned-badge">+${earned}</span>`;
        }

        const isChecked = selectedProfiles.has(p.profileId) ? 'checked' : '';

        return `
            <div class="profile-card ${statusClass}">
                <div class="profile-header">
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <input type="checkbox" class="profile-checkbox style-checkbox" data-id="${p.profileId}" ${isChecked}>
                        <div>
                            <div class="profile-name">${p.name || `Profile ${p.profileId}`}</div>
                            <div class="profile-id">Port: ${p.debugPort}</div>
                        </div>
                    </div>
                    <span class="profile-status ${statusClass}">${statusLabel}</span>
                </div>

                <div class="profile-stats">
                    <div>
                        <span class="points-value">${points.toLocaleString()}</span>
                        ${earnedHtml}
                        <span style="color:var(--text-muted);font-size:10px;"> pts</span>
                    </div>
                    <div class="progress-text">${p.progress || '0/0'}</div>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar ${isDone ? 'done' : ''}" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Attach event listeners to checkboxes
    document.querySelectorAll('.profile-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (e.target.checked) Object.hasOwn ? selectedProfiles.add(id) : selectedProfiles.add(id);
            if (!e.target.checked) selectedProfiles.delete(id);
            saveSelection();
            updateSelectAllState();
        });
    });
    
    updateSelectAllState();
}

function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    const checkboxes = document.querySelectorAll('.profile-checkbox');
    const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = someChecked && !allChecked;
}

function addLog(text, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="log-time">[${time}]</span> ${text}`;
    logWindow.prepend(div);
}

function clearLogs() {
    logWindow.innerHTML = '';
}

window.clearLogs = clearLogs;

// =============================================
// BUTTON CONTROLS
// =============================================

if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.profile-checkbox').forEach(cb => {
            cb.checked = checked;
            const id = cb.getAttribute('data-id');
            if (checked) selectedProfiles.add(id);
            else selectedProfiles.delete(id);
        });
        saveSelection();
    });
}

document.getElementById('btn-refresh').addEventListener('click', () => {
    socket.emit('command', { action: 'scan' });
});

document.getElementById('btn-start-all').addEventListener('click', () => {
    socket.emit('command', { action: 'start_all', profileIds: getSelectedProfileIds() });
});

document.getElementById('btn-stop-all').addEventListener('click', () => {
    socket.emit('command', { action: 'stop_all', profileIds: getSelectedProfileIds() });
});

document.getElementById('btn-daily-tasks').addEventListener('click', () => {
    socket.emit('command', { action: 'solve_all_tasks', profileIds: getSelectedProfileIds() });
    addLog('📋 Requesting all tasks for selected profiles...', 'info');
});

document.getElementById('btn-check-points').addEventListener('click', () => {
    socket.emit('command', { action: 'check_points', profileIds: getSelectedProfileIds() });
    addLog('Requesting account check...', 'info');
});

document.getElementById('btn-reset-page').addEventListener('click', () => {
    if (confirm('LƯU Ý: Chức năng này sẽ đóng tất cả các tab thừa (Bing search, tin tức, cửa hàng...) và chỉ giữ lại trang Rewards.\\n\\nBạn có chắc chắn muốn Reset Page cho các profile đã chọn?')) {
        socket.emit('command', { action: 'reset_page', profileIds: getSelectedProfileIds() });
        addLog('🔄 Resetting rewards page and cleaning tabs...', 'info');
    }
});

document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm('Reset selected profiles progress back to 0?')) {
        socket.emit('command', { action: 'reset_all', profileIds: getSelectedProfileIds() });
    }
});

document.getElementById('btn-settings').addEventListener('click', () => {
    const newConfig = {
        rewardsLevel: inputs.level.value,
        searchCount: parseInt(inputs.searchCount.value),
        minDelay: parseInt(inputs.minDelay.value),
        maxDelay: parseInt(inputs.maxDelay.value),
        mobileMode: inputs.mobileMode.checked
    };
    socket.emit('config_update', newConfig);
    addLog('Settings saved!', 'success');
});
