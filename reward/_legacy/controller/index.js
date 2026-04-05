// =============================================
// BING REWARD CONTROLLER - SERVER (CDP-Only Mode)
// Local Web Server & Automation Backend
// No extension required!
// =============================================

import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { getRunningProfiles } from './browser-detector.js';
import {
    connectToPage,
    navigateTo,
    injectAutomation,
    runAutomationFunction,
    performSearch,
    setMobileMode,
    scrapePointsFromDashboard,
    runDailyTasks,
    runMobileDailyTasks,
    resetRewardsPage
} from './cdp-client.js';
import KEYWORD_LIST from './keywords-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
    rewardsLevel: 'gold',      // 'member' | 'silver' | 'gold'
    searchCount: 12,
    mobileSearchCount: 0,      // Limits merged natively, not separated.
    minDelay: 20,
    maxDelay: 40,
    mobileMode: false,
    scanInterval: 2000,
    maxRetries: 2,
    taskClickDelay: { min: 1000, max: 3000 },
    maxConcurrentProfiles: 10
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(input = {}) {
    const candidate = { ...DEFAULT_CONFIG, ...input };
    const rewardsLevel = ['member', 'silver', 'gold'].includes(candidate.rewardsLevel)
        ? candidate.rewardsLevel
        : DEFAULT_CONFIG.rewardsLevel;

    const minDelay = clamp(toInt(candidate.minDelay, DEFAULT_CONFIG.minDelay), 0, 300);
    const maxDelay = clamp(toInt(candidate.maxDelay, DEFAULT_CONFIG.maxDelay), minDelay, 600);

    const taskClickDelayMin = clamp(
        toInt(candidate.taskClickDelay?.min, DEFAULT_CONFIG.taskClickDelay.min),
        100,
        30000
    );
    const taskClickDelayMax = clamp(
        toInt(candidate.taskClickDelay?.max, DEFAULT_CONFIG.taskClickDelay.max),
        taskClickDelayMin,
        60000
    );

    return {
        ...candidate,
        rewardsLevel,
        searchCount: clamp(toInt(candidate.searchCount, DEFAULT_CONFIG.searchCount), 1, 100),
        mobileSearchCount: clamp(toInt(candidate.mobileSearchCount, DEFAULT_CONFIG.mobileSearchCount), 0, 50),
        minDelay,
        maxDelay,
        mobileMode: Boolean(candidate.mobileMode),
        scanInterval: clamp(toInt(candidate.scanInterval, DEFAULT_CONFIG.scanInterval), 500, 60000),
        maxRetries: clamp(toInt(candidate.maxRetries, DEFAULT_CONFIG.maxRetries), 0, 10),
        taskClickDelay: {
            min: taskClickDelayMin,
            max: taskClickDelayMax
        },
        maxConcurrentProfiles: clamp(
            toInt(candidate.maxConcurrentProfiles, DEFAULT_CONFIG.maxConcurrentProfiles),
            1,
            100
        )
    };
}

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE_PATH)) {
            return normalizeConfig(DEFAULT_CONFIG);
        }

        const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeConfig(parsed);
    } catch (error) {
        console.error(`Failed to load config at ${CONFIG_FILE_PATH}:`, error.message);
        return normalizeConfig(DEFAULT_CONFIG);
    }
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Failed to save config at ${CONFIG_FILE_PATH}:`, error.message);
        return false;
    }
}

const CONFIG = loadConfig();

// Cấu hình Limit từ MS Rewards Policy 2026
const TIER_LIMITS = {
    'member': { maxSearch: 3, points: 15 },
    'silver': { maxSearch: 6, points: 30 },
    'gold':   { maxSearch: 12, points: 60 }
};

// Validate configuration on load
function validateConfig(config) {
    const errors = [];
    if (config.searchCount <= 0 || config.searchCount > 100) {
        errors.push('searchCount must be between 1-100');
    }
    if (config.mobileSearchCount < 0 || config.mobileSearchCount > 50) {
        errors.push('mobileSearchCount must be between 0-50');
    }
    if (config.minDelay < 0 || config.maxDelay < config.minDelay) {
        errors.push('Invalid delay configuration');
    }
    return errors;
}

const configErrors = validateConfig(CONFIG);
if (configErrors.length > 0) {
    console.error('Configuration errors:', configErrors);
}
saveConfig(CONFIG);

// Global state
let profiles = []; // { profileId, debugPort, status, progress, points, percent, client }

// =============================================
// SERVER SETUP
// =============================================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:8080", "http://localhost:5173", "http://127.0.0.1:8080"],
        methods: ["GET", "POST"]
    }
});


// Serve Static Dashboard (old UI fallback)
app.use(express.static('public'));

// Socket.io Logic
io.on('connection', (socket) => {
    socket.emit('log', { text: 'Client Connected', type: 'info' });

    // Send initial state
    socket.emit('init', {
        config: CONFIG,
        profiles: getPublicProfileState()
    });

    // Handle Commands
    socket.on('command', async (data) => {
        io.emit('log', { text: `Command Received: ${data.action}`, type: 'info' });

        switch (data.action) {
            case 'scan':
                await detectProfiles();
                break;
            case 'start_all':
                startAll(data.profileIds);
                break;
            case 'stop_all':
                stopAll(data.profileIds);
                break;
            case 'reset_all':
                resetAll(data.profileIds);
                break;
            case 'check_points':
                checkAllPoints(data.profileIds);
                break;
            case 'solve_daily_tasks':
                startDailyTasksAll(data.profileIds);
                break;
            case 'solve_all_tasks':
                startAllTasksAll(data.profileIds);
                break;
            case 'reset_page':
                resetPageAll(data.profileIds);
                break;
            case 'shutdown':
                io.emit('log', { text: 'Server shutting down...', type: 'warning' });
                setTimeout(() => {
                    console.log('Graceful shutdown initiated by user');
                    process.exit(0);
                }, 1000);
                break;
        }
    });

    // Handle Config Update
    socket.on('config_update', (newConfig) => {
        const normalizedConfig = normalizeConfig({ ...CONFIG, ...newConfig });
        Object.assign(CONFIG, normalizedConfig);
        const saved = saveConfig(CONFIG);
        io.emit('log', {
            text: saved ? 'Configuration updated and saved.' : 'Configuration updated in memory, but failed to save file.',
            type: saved ? 'success' : 'warning'
        });
        // Broadcast new config to all clients
        io.emit('init', { config: CONFIG, profiles: getPublicProfileState() });
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// =============================================
// AUTOMATION LOGIC
// =============================================

// Helper: Get data ready for frontend (remove circular 'client' obj)
function getPublicProfileState() {
    return profiles.map(p => ({
        profileId: p.profileId,
        name: p.name,
        debugPort: p.debugPort,
        status: p.status,
        progress: p.progress,
        points: p.points,
        percent: p.percent,
        linked: !!p.client // true if connected
    }));
}

function broadcastState() {
    io.emit('state_update', { profiles: getPublicProfileState() });
}

/**
 * Get target profiles based on selection
 * @param {Array<string>} selectedIds - Array of profile IDs to filter
 * @returns {Array} - Filtered profiles array
 */
function getTargetProfiles(selectedIds) {
    if (!selectedIds) return profiles;
    if (selectedIds.length === 0) {
        io.emit('log', { text: '⚠️ Không có profile nào được chọn!', type: 'warning' });
        return [];
    }
    return profiles.filter(p => selectedIds.includes(p.profileId));
}

// 1. Detect Profiles
async function detectProfiles() {
    const detected = await getRunningProfiles();

    // Merge logic: keep existing state if ID matches
    const newProfiles = [];
    for (const d of detected) {
        const existing = profiles.find(p => p.profileId === d.profileId);
        if (existing) {
            newProfiles.push(existing); // Keep existing state
        } else {
            newProfiles.push({
                ...d,
                status: 'Idle',
                progress: '0/0',
                percent: 0,
                points: { current: 0, earned: 0, lastChange: 0 },
                client: null
            });
        }
    }
    profiles = newProfiles;
    broadcastState();
    io.emit('log', { text: `✅ Scan complete. Found ${profiles.length} profile(s).`, type: 'info' });
}

// 2. Monitoring Loop (CDP-Only Mode)
// Auto-reconnect to CDP clients and track connection status
let monitorInterval = null;

function startMonitoring() {
    monitorInterval = setInterval(async () => {
        for (const p of profiles) {
            // Skip profiles with no port or already connected
            if (!p.debugPort || !p.client) continue;

            try {
                // Test connection health
                try {
                    // Simple health check - can be expanded
                    if (p.status === 'Error') {
                        // Attempt reconnection for Error status profiles
                        await connectToPage(p.debugPort);
                    }
                } catch (reconnectErr) {
                    if (p.status !== 'Running' && p.status !== 'Error') {
                        p.status = 'Error';
                        p.client = null;
                        console.log(`[${p.profileId}] Connection lost: ${reconnectErr.message}`);
                    }
                }
            } catch (e) {
                console.error(`[${p.profileId}] Monitoring error:`, e.message);
            }
        }
        broadcastState();
    }, CONFIG.scanInterval);
}

function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    stopMonitoring();

    // Disconnect all clients
    const disconnectPromises = profiles.map(p => {
        if (p.client) {
            try {
                return p.client.close();
            } catch (e) {
                console.error(`Error closing client for ${p.profileId}:`, e.message);
            }
        }
        return Promise.resolve();
    });

    Promise.all(disconnectPromises)
        .then(() => {
            console.log('All clients disconnected.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error during shutdown:', err);
            process.exit(1);
        });
}

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK')); // Windows

// Start monitoring after server is ready
startMonitoring();

// Keywords loaded from external file
const KEYWORDS = KEYWORD_LIST;


function getRandomKeyword() {
    return KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function startAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `Starting CDP automation for ${targets.length} profiles...`, type: 'info' });

    for (const p of targets) {
        if (p.status === 'Running' || p.status === 'Done') continue;

        // Start automation in background (non-blocking)
        runProfileAutomation(p);
    }
}

// Run automation for a single profile (CDP-only)
async function runProfileAutomation(profile) {
    const p = profile;

    const tierLimit = TIER_LIMITS[CONFIG.rewardsLevel]?.maxSearch || 12;
    const targetSearchCount = Math.min(CONFIG.searchCount, tierLimit);
    const totalSearches = targetSearchCount + (CONFIG.mobileMode ? CONFIG.mobileSearchCount : 0);

    let completed = 0;

    p.status = 'Running';
    p.progress = `0/${totalSearches}`;
    p.percent = 0;
    broadcastState();

    io.emit('log', {
        text: `[${p.profileId}] Started (Mode: ${CONFIG.rewardsLevel.toUpperCase()} - Target ${targetSearchCount} Searches)`,
        type: 'success'
    });

    try {
        while (completed < targetSearchCount && p.status === 'Running') {
            const keyword = getRandomKeyword();
            io.emit('log', { text: `[${p.profileId}] Search ${completed + 1}/${targetSearchCount}: ${keyword}`, type: 'info' });

            let result = await performSearch(p.debugPort, keyword);

            if (!result.success) {
                for (let retry = 0; retry < CONFIG.maxRetries && !result.success; retry++) {
                    const retryKeyword = getRandomKeyword();
                    io.emit('log', { text: `[${p.profileId}] Retry ${retry + 1}: ${retryKeyword}`, type: 'warning' });
                    await new Promise(r => setTimeout(r, 5000));
                    result = await performSearch(p.debugPort, retryKeyword);
                }
            }

            if (result.success) {
                completed++;
                p.progress = `${completed}/${totalSearches}`;
                p.percent = Math.floor((completed / totalSearches) * 100);
                broadcastState();
            } else {
                io.emit('log', { text: `[${p.profileId}] Search failed after retries: ${result.error}`, type: 'error' });
            }

            if (p.status === 'Running' && completed < targetSearchCount) {
                const delay = randomDelay(CONFIG.minDelay * 1000, CONFIG.maxDelay * 1000);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        if (p.status === 'Running') {
            p.status = 'Done';
            p.percent = 100;
            io.emit('log', { text: `[${p.profileId}] Completed ${completed} searches!`, type: 'success' });
        }
    } catch (e) {
        io.emit('log', { text: `[${p.profileId}] Error: ${e.message}`, type: 'error' });
        p.status = 'Error';
    }

    broadcastState();
}

async function stopAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `Stopping tasks for ${targets.length} profiles...`, type: 'warning' });

    // Mark all running profiles as stopped
    for (const p of targets) {
        if (p.status === 'Running') {
            p.status = 'Stopped';
            io.emit('log', { text: `Stopped: ${p.name || p.profileId}`, type: 'success' });
        }
    }
    broadcastState();

    // Reset to Idle after a moment
    setTimeout(() => {
        for (const p of targets) {
            if (p.status === 'Stopped') {
                p.status = 'Idle';
            }
        }
        broadcastState();
    }, 2000);

    io.emit('log', { text: 'All profiles stopped', type: 'info' });
}

async function resetAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `Resetting progress for ${targets.length} profiles...`, type: 'info' });

    for (const p of targets) {
        p.progress = '0/0';
        p.percent = 0;
        p.status = 'Idle';
        p.points = { current: 0, earned: 0, lastChange: 0 };
        io.emit('log', { text: `Reset Profile ${p.profileId}`, type: 'success' });
    }
    broadcastState();
}

async function checkAllPoints(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `🔍 Checking points for ${targets.length} profiles (Concurrent staggered)...`, type: 'info' });

    const checkJobs = targets.map(async (p, index) => {
        try {
            // Staggering delay: offset each profile by 2 seconds to prevent network/CPU spikes
            await new Promise(r => setTimeout(r, index * 2000));
            
            const result = await scrapePointsFromDashboard(p.debugPort);
            
            if (result && result.status === 'BANNED') {
                p.status = 'BANNED';
                io.emit('log', { text: `[${p.profileId}] ❌ ACCOUNT BANNED OR SUSPENDED!`, type: 'error' });
                broadcastState();
                return;
            }
            
            if (result && result.status === 'OK' && result.points !== null) {
                const points = result.points;
                // Initialize points object if needed
                if (!p.points) {
                    p.points = { current: 0, earned: 0, start: 0, lastChange: 0 };
                }
                p.points.current = points;
                if (!p.points.start) p.points.start = points;
                p.points.earned = points - p.points.start;
                
                // Clear BANNED status if it was recovered
                if (p.status === 'BANNED' || p.status === 'UNKNOWN') p.status = 'Idle';
                
                io.emit('log', { text: `[${p.profileId}] Points: ${points}`, type: 'success' });
                broadcastState();
            } else {
                if (p.status !== 'Running') p.status = 'UNKNOWN';
                io.emit('log', { text: `[${p.profileId}] ⚠️ Could not get points or load page properly.`, type: 'warning' });
                broadcastState();
            }
        } catch (e) {
            io.emit('log', { text: `[${p.profileId}] Points check failed: ${e.message}`, type: 'error' });
        }
    });

    await Promise.allSettled(checkJobs);
    io.emit('log', { text: `✅ Finished checking points!`, type: 'success' });
}

async function startDailyTasksAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `Starting Daily Tasks for ${targets.length} profiles (Concurrent staggered)...`, type: 'info' });

    await Promise.allSettled(targets.map(async (p, index) => {
        try {
            await new Promise(r => setTimeout(r, index * 2000));
            p.status = 'Running';
            broadcastState();

            const result = await runDailyTasks(p.debugPort, (msg) => {
                io.emit('log', { text: `[${p.profileId}] ${msg}`, type: 'info' });
            });

            if (result.success) {
                io.emit('log', { text: `[${p.profileId}] Daily tasks done: ${result.completed} completed`, type: 'success' });
            }

            p.status = 'Idle';
        } catch (e) {
            io.emit('log', { text: `[${p.profileId}] Daily tasks failed: ${e.message}`, type: 'error' });
            p.status = 'Error';
        }
        broadcastState();
    }));

    io.emit('log', { text: '✅ All daily tasks completed!', type: 'success' });
}

async function startMobileTasksAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `📱 Starting MOBILE Daily Tasks for ${targets.length} profiles (Concurrent staggered)...`, type: 'info' });

    await Promise.allSettled(targets.map(async (p, index) => {
        try {
            await new Promise(r => setTimeout(r, index * 2000));
            p.status = 'Running';
            broadcastState();

            const result = await runMobileDailyTasks(p.debugPort, (msg) => {
                io.emit('log', { text: `[${p.profileId}] ${msg}`, type: 'info' });
            });

            if (result.success) {
                io.emit('log', { text: `[${p.profileId}] 📱 Mobile tasks done: ${result.completed} completed`, type: 'success' });
            }

            p.status = 'Idle';
        } catch (e) {
            io.emit('log', { text: `[${p.profileId}] Mobile tasks failed: ${e.message}`, type: 'error' });
            p.status = 'Error';
        }
        broadcastState();
    }));

    io.emit('log', { text: '✅ All mobile daily tasks completed!', type: 'success' });
}

// Unified: Run BOTH PC + Mobile daily tasks for all profiles
async function startAllTasksAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `📋 Starting ALL Tasks (PC + Mobile) for ${targets.length} profiles (Concurrent staggered)...`, type: 'info' });

    await Promise.allSettled(targets.map(async (p, index) => {
        try {
            await new Promise(r => setTimeout(r, index * 2000));
            p.status = 'Running';
            broadcastState();

            // PC Daily Tasks
            io.emit('log', { text: `[${p.profileId}] 🖥️ Running PC daily tasks...`, type: 'info' });
            const pcResult = await runDailyTasks(p.debugPort, (msg) => {
                io.emit('log', { text: `[${p.profileId}] ${msg}`, type: 'info' });
            });
            if (pcResult.success) {
                io.emit('log', { text: `[${p.profileId}] PC tasks: ${pcResult.completed} completed`, type: 'success' });
            }

            // Mobile Daily Tasks
            io.emit('log', { text: `[${p.profileId}] 📱 Running Mobile daily tasks...`, type: 'info' });
            const mobileResult = await runMobileDailyTasks(p.debugPort, (msg) => {
                io.emit('log', { text: `[${p.profileId}] ${msg}`, type: 'info' });
            });
            if (mobileResult.success) {
                io.emit('log', { text: `[${p.profileId}] Mobile tasks: ${mobileResult.completed} completed`, type: 'success' });
            }

            const total = (pcResult.completed || 0) + (mobileResult.completed || 0);
            io.emit('log', { text: `[${p.profileId}] ✅ Total tasks completed: ${total}`, type: 'success' });

            p.status = 'Idle';
        } catch (e) {
            io.emit('log', { text: `[${p.profileId}] Tasks failed: ${e.message}`, type: 'error' });
            p.status = 'Error';
        }
        broadcastState();
    }));

    io.emit('log', { text: '✅ All tasks (PC + Mobile) completed for all profiles!', type: 'success' });
}

// Reset/reload rewards page for all profiles
async function resetPageAll(selectedIds = null) {
    const targets = getTargetProfiles(selectedIds);
    if (!targets.length) return;
    
    io.emit('log', { text: `🔄 Resetting targets and cleaning tabs for ${targets.length} profiles (Concurrent staggered)...`, type: 'info' });

    await Promise.allSettled(targets.map(async (p, index) => {
        try {
            await new Promise(r => setTimeout(r, index * 1000));
            await resetRewardsPage(p.debugPort, (msg) => {
                io.emit('log', { text: `[${p.profileId}] ${msg}`, type: 'info' });
            });
        } catch (e) {
            io.emit('log', { text: `[${p.profileId}] Reset failed: ${e.message}`, type: 'error' });
        }
    }));

    io.emit('log', { text: '✅ All selected targets reset!', type: 'success' });
}


