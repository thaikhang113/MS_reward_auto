// =============================================
// CHROME DEVTOOLS CLIENT (CDP-Only Mode)
// Connects directly to browser pages, no extension needed
// =============================================

import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Connection timeout in milliseconds
const CDP_TIMEOUT = 10000;

// Load automation script once
let AUTOMATION_SCRIPT = null;
try {
    AUTOMATION_SCRIPT = fs.readFileSync(
        path.join(__dirname, 'automation-script.js'),
        'utf-8'
    );
} catch (e) {
    console.error('Failed to load automation-script.js:', e.message);
    process.exit(1);
}

// =============================================
// CONNECTION FUNCTIONS
// =============================================

/**
 * Connect to any page target on a browser instance
 * @param {number} port - Debug port
 * @param {number} timeout - Connection timeout in ms (default: CDP_TIMEOUT)
 * @returns {Promise<{client: CDP.Client, targetId: string}>}
 */
export async function connectToPage(port, timeout = CDP_TIMEOUT) {
    try {
        // Wrap CDP.List with timeout
        const targets = await withTimeout(
            CDP.List({ port }),
            timeout,
            `Failed to list targets on port ${port} (timeout after ${timeout}ms)`
        );

        // Find page targets (not service workers, not devtools)
        const pageTargets = targets.filter(t =>
            t.type === 'page' &&
            !t.url.startsWith('devtools://') &&
            !t.url.startsWith('chrome-extension://')
        );

        if (pageTargets.length === 0) {
            // Create a new tab with timeout
            const client = await withTimeout(
                CDP({ port }),
                timeout,
                `Failed to connect for tab creation on port ${port}`
            );
            try {
                const result = await withTimeout(
                    client.Target.createTarget({ url: 'about:blank' }),
                    timeout,
                    'Failed to create target'
                );
                await client.close();

                await sleep(1000);
                const newTargets = await withTimeout(
                    CDP.List({ port }),
                    timeout,
                    `Failed to list targets after creation on port ${port}`
                );
                const newPage = newTargets.find(t => t.id === result.targetId);

                if (newPage) {
                    const pageClient = await withTimeout(
                        CDP({ port, target: newPage.id }),
                        timeout,
                        `Failed to connect to new target ${newPage.id}`
                    );
                    await enableDomains(pageClient);
                    return { client: pageClient, targetId: newPage.id };
                }
            } catch (e) {
                if (client) await client.close().catch(() => {});
                throw e;
            }
        }

        // Connect to first available page
        const target = pageTargets[0];
        const client = await withTimeout(
            CDP({ port, target: target.id }),
            timeout,
            `Failed to connect to target ${target.id}`
        );
        await enableDomains(client);

        return { client, targetId: target.id };

    } catch (e) {
        throw new Error(`Page connection failed (Port ${port}): ${e.message}`);
    }
}

/**
 * Wrap a promise with timeout
 */
async function withTimeout(promise, timeout, errorMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage || `Operation timed out after ${timeout}ms`));
        }, timeout);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Enable required CDP domains
 */
async function enableDomains(client) {
    await client.Runtime.enable();
    await client.Page.enable();
    await client.DOM.enable();
    await client.Network.enable();
}

/**
 * Navigate to URL and wait for load
 */
export async function navigateTo(client, url) {
    await client.Page.navigate({ url });
    await client.Page.loadEventFired();
    await sleep(2000); // Extra wait for dynamic content
}

/**
 * Inject automation script into page
 */
export async function injectAutomation(client) {
    const result = await client.Runtime.evaluate({
        expression: AUTOMATION_SCRIPT,
        awaitPromise: true,
        returnByValue: true
    });

    if (result.exceptionDetails) {
        throw new Error(`Injection failed: ${result.exceptionDetails.text}`);
    }

    return result.result?.value;
}

/**
 * Run a function from the injected automation script
 */
export async function runAutomationFunction(client, funcName, ...args) {
    const argsStr = args.map(a => JSON.stringify(a)).join(', ');
    const expression = `window.__BRA__.${funcName}(${argsStr})`;

    const result = await client.Runtime.evaluate({
        expression,
        awaitPromise: true,
        returnByValue: true
    });

    if (result.exceptionDetails) {
        console.error('Function error:', result.exceptionDetails);
        return null;
    }

    return result.result?.value;
}

/**
 * Perform a single search with anti-ban timing
 */
export async function performSearch(port, keyword, options = {}) {
    const { client, targetId } = await connectToPage(port);

    try {
        // 1. Navigate to Bing
        await navigateTo(client, 'https://www.bing.com');

        // 2. Inject automation script
        await injectAutomation(client);

        // 3. Type and search (with anti-ban delays)
        const searchResult = await runAutomationFunction(client, 'typeAndSearch', keyword);

        if (!searchResult?.success) {
            await client.close();
            return { success: false, error: 'search_failed' };
        }

        // 4. Wait for search results page
        await client.Page.loadEventFired();
        await sleep(2000);

        // 5. Re-inject and do scroll interaction (anti-ban)
        await injectAutomation(client);
        await runAutomationFunction(client, 'enhancedSearchInteraction');

        await client.close();
        return { success: true, keyword };

    } catch (e) {
        await client.close().catch(() => { });
        return { success: false, error: e.message };
    }
}

/**
 * Set mobile emulation with anti-fingerprinting
 * @param {string} device - 'iphone' or 'android' (default: 'android')
 */
export async function setMobileMode(client, enabled, device = 'android') {
    // Các dòng thiết bị cao cấp nhất (Premium) Android - Chrome 131+ (Năm 2026)
    const ANDROID_DEVICES = [
        { width: 412, height: 915, dpr: 3.5, ua: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }, // S24 Ultra
        { width: 360, height: 780, dpr: 3.0, ua: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }, // S23
        { width: 412, height: 892, dpr: 3.5, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }, // Pixel 8 Pro
        { width: 393, height: 851, dpr: 2.75, ua:'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' } // Xiaomi 14
    ];

    // Các thiết bị Apple đời mới - iOS 17+
    const IOS_DEVICES = [
        { width: 393, height: 852, dpr: 3.0, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, // iPhone 15 Pro
        { width: 390, height: 844, dpr: 3.0, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' }, // iPhone 14
        { width: 430, height: 932, dpr: 3.0, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } // iPhone 15 Pro Max
    ];

    if (enabled) {
        if (device === 'android') {
            const randomDevice = ANDROID_DEVICES[Math.floor(Math.random() * ANDROID_DEVICES.length)];

            await client.Emulation.setDeviceMetricsOverride({
                width: randomDevice.width,
                height: randomDevice.height,
                deviceScaleFactor: randomDevice.dpr,
                mobile: true
            });
            await client.Emulation.setUserAgentOverride({
                userAgent: randomDevice.ua
            });

            // Enable touch emulation for anti-detect với giới hạn Max MultiTouch (ví dụ gỡ gạc lỗi bot ko bao giờ sài 10 ngón =)))
            await client.Emulation.setTouchEmulationEnabled({
                enabled: true,
                maxTouchPoints: 5 
            });
        } else {
            const randomDevice = IOS_DEVICES[Math.floor(Math.random() * IOS_DEVICES.length)];

            await client.Emulation.setDeviceMetricsOverride({
                width: randomDevice.width,
                height: randomDevice.height,
                deviceScaleFactor: randomDevice.dpr,
                mobile: true
            });
            await client.Emulation.setUserAgentOverride({
                userAgent: randomDevice.ua
            });

            await client.Emulation.setTouchEmulationEnabled({
                enabled: true,
                maxTouchPoints: 5 
            });
        }
    } else {
        await client.Emulation.clearDeviceMetricsOverride();
        await client.Emulation.setTouchEmulationEnabled({ enabled: false });
        // Reset user agent
        try { await client.Emulation.setUserAgentOverride({ userAgent: '' }); } catch (e) { }
    }
}

// scrapePointsFromDashboard is defined below in legacy section with API call support

/**
 * Capture screenshot from browser
 */
export async function captureScreenshot(port) {
    try {
        const { client } = await connectToPage(port);

        const result = await client.Page.captureScreenshot({
            format: 'png',
            quality: 80
        });

        await client.close();

        return `data:image/png;base64,${result.data}`;
    } catch (e) {
        console.error('Failed to capture screenshot:', e.message);
        return null;
    }
}

// Utility
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// captureScreenshot is now defined above with port-based connection

/**
 * Scrape points by opening rewards.bing.com in a tab and injecting script
 * @param {number} port - The browser debug port
 */
export async function scrapePointsFromDashboard(port) {
    let tabClient = null;
    let targetId = null;

    try {
        // 1. Create new tab via the main CDP connection
        const mainClient = await CDP({ port });
        const { Target } = mainClient;

        const result = await Target.createTarget({
            url: 'https://rewards.bing.com/'
        });
        targetId = result.targetId;
        await mainClient.close();

        // 2. Wait for page to load
        await new Promise(r => setTimeout(r, 5000));

        // 3. Connect directly to the new tab
        const targets = await CDP.List({ port });
        const tabTarget = targets.find(t => t.id === targetId || t.url?.includes('rewards.bing.com'));

        if (!tabTarget) {
            console.log('  ⚠️ Could not find dashboard tab');
            return null;
        }

        tabClient = await CDP({ port, target: tabTarget.id });
        const { Runtime, Page } = tabClient;
        await Runtime.enable();

        // 4. Execute script in tab context  
        const evalResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    let result = { points: null, status: 'UNKNOWN' };
                    
                    // ============================================
                    // BAN DETECTION
                    // ============================================
                    const bodyText = document.body.innerText || '';
                    if (bodyText.match(/suspended|tạm ngưng|bị khóa|vi phạm/i)) {
                        result.status = 'BANNED';
                        // Even if banned, maybe we can read points, but status is more important
                        return result;
                    }

                    // ============================================
                    // POINTS EXTRACTION
                    // ============================================
                    // METHOD 1: OFFICIAL API (Most Robust)
                    try {
                        const r = await fetch('https://rewards.bing.com/api/getuserinfo?type=1');
                        if (r.ok) {
                            const data = await r.json();
                            if (data && data.dashboard && data.dashboard.userStatus) {
                                result.points = data.dashboard.userStatus.availablePoints;
                                result.status = 'OK';
                                return result;
                            }
                        }
                    } catch (e) {
                        // console.error('API Check failed, falling back to selectors');
                    }

                    // METHOD 2: LEGACY SELECTORS (Fallback)
                    const extractPoints = (text) => {
                        if (!text) return null;
                        // Match number sequences with optional thousand separators and decimals
                        const matches = text.match(/(\d{1,3}(?:[,\.\s]\d{3})+|\d+)(?:\.\d{2})?/g);
                        if (matches) {
                            // Process from highest to lowest value
                            const numbers = matches
                                .map(m => parseInt(m.replace(/[,\.\s]/g, ''), 10))
                                .filter(n => !isNaN(n) && n >= 0 && n < 1000000)
                                .sort((a, b) => b - a);

                            // Prefer larger numbers in valid range
                            for (const num of numbers) {
                                if (num >= 100) return num;
                            }
                        }
                        return null;
                    };
                    
                    // STRATEGY 1: NEW UI (Next.js 2024+)
                    const newUISelectors = [
                        '.text-title1.font-semibold',
                        'p.text-title1.font-semibold',
                        '.flex.items-center.gap-2 > p',
                        '.flex.h-11.items-center p',
                        '.flex.grow.items-center.gap-2 p',
                        '.overflow-hidden.rounded-2xl .text-title1',
                        '[class*="text-title1"]'
                    ];
                    
                    for (const sel of newUISelectors) {
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
                    
                    // STRATEGY 2: Text matching near keywords
                    const allElements = document.querySelectorAll('*');
                    for (const el of allElements) {
                        const text = el.innerText || '';
                        if (text.match(/Available points|Điểm hiện có|Available|Điểm/i)) {
                            const num = extractPoints(text);
                            if (num !== null) {
                                result.points = num;
                                result.status = 'OK';
                                return result;
                            }
                        }
                    }
                    
                    // STRATEGY 3: OLD UI selectors
                    const oldSelectors = [
                        'mee-rewards-user-status-balance',
                        '.mee-rewards-user-status-balance',
                        '#balanceToolTip',
                        '.pointsValue',
                        '[class*="balance"]'
                    ];
                    
                    for (const sel of oldSelectors) {
                        const el = document.querySelector(sel);
                        if (el) {
                            const num = extractPoints(el.innerText || el.textContent);
                            if (num !== null) {
                                result.points = num;
                                result.status = 'OK';
                                return result;
                            }
                        }
                    }
                    
                    // If no points found but we loaded the DOM without finding ban keywords, it's UNKNOWN
                    return result;
                })()
            `,
            returnByValue: true,
            awaitPromise: true
        });

        await tabClient.close();

        // 5. Close the tab
        const closeClient = await CDP({ port });
        await closeClient.Target.closeTarget({ targetId });
        await closeClient.close();

        const payload = evalResult?.result?.value || { points: null, status: 'UNKNOWN' };
        return payload;

    } catch (e) {
        console.error('  ❌ CDP Scrape Error:', e.message);
        if (tabClient) await tabClient.close().catch(() => { });
        return null;
    }
}

/**
 * Run daily tasks (click incomplete reward cards on dashboard)
 * Uses ACTUAL selectors from rewards page HTML:
 * - react-aria-Disclosure sections with DisclosurePanel content
 * - <a> tags with cursor-pointer class for task cards
 * - Checks for completion via checkmark SVGs
 * @param {number} port - The browser debug port
 * @param {function} log - Logging callback
 */
export async function runDailyTasks(port, log = console.log) {
    let tabClient = null;
    let targetId = null;
    let totalCompleted = 0;

    try {
        // ============================================
        // PHASE 1: EARN PAGE (rewards.bing.com/earn)
        // ============================================
        log('  📋 Opening rewards EARN page...');

        const mainClient = await CDP({ port });
        const result = await mainClient.Target.createTarget({
            url: 'https://rewards.bing.com/earn'
        });
        targetId = result.targetId;
        await mainClient.close();

        // Wait for page to fully load (Next.js/React hydration)
        await new Promise(r => setTimeout(r, 10000));

        const targets = await CDP.List({ port });
        const tabTarget = targets.find(t => t.url?.includes('rewards.bing.com'));

        if (!tabTarget) {
            log('  ⚠️ Could not find rewards tab');
            return { success: false, completed: 0 };
        }

        tabClient = await CDP({ port, target: tabTarget.id });
        const { Runtime, Page } = tabClient;
        await Runtime.enable();

        log('  🔍 Looking for tasks on EARN page...');

        // Inject task-finding script based on ACTUAL page structure
        const earnResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    const results = { found: 0, clicked: 0, errors: [], taskNames: [] };
                    const delay = ms => new Promise(r => setTimeout(r, ms));
                    
                    // Human-like click
                    const clickElement = async (el) => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(300 + Math.random() * 500);
                        if (el.href) {
                            window.open(el.href, '_blank');
                        } else {
                            try {
                                el.click();
                            } catch (e) {
                                const rect = el.getBoundingClientRect();
                                el.dispatchEvent(new MouseEvent('click', {
                                    bubbles: true, cancelable: true,
                                    clientX: rect.left + rect.width / 2,
                                    clientY: rect.top + rect.height / 2
                                }));
                            }
                        }
                        await delay(500 + Math.random() * 500);
                    };
                    
                    // Scroll to load all lazy content
                    for (let i = 0; i < 6; i++) {
                        window.scrollBy({ top: 400, behavior: 'smooth' });
                        await delay(800);
                    }
                    window.scrollTo(0, 0);
                    await delay(1500);
                    
                    // ============================================
                    // STRATEGY 1: react-aria-Disclosure panels
                    // The real page uses these for collapsible sections
                    // Inside DisclosurePanel -> grid -> <a> task cards
                    // ============================================
                    const taskCards = [];
                    
                    // Find all DisclosurePanel sections (expanded content areas)
                    const panels = document.querySelectorAll('.react-aria-DisclosurePanel, [class*="DisclosurePanel"]');
                    for (const panel of panels) {
                        // Inside each panel, find task card links
                        const links = panel.querySelectorAll('a.cursor-pointer, a[class*="cursor-pointer"]');
                        for (const link of links) {
                            const rect = link.getBoundingClientRect();
                            if (rect.width < 60 || rect.height < 40) continue;
                            if (!link.href) continue;
                            
                            const text = (link.textContent || '').trim();
                            
                            // Skip navigation links
                            if (text.includes('Sign in') || text.includes('Redeem') || 
                                text.includes('About') || text.includes('Profile')) continue;
                            
                            // Check if completed (has checkmark SVG)
                            const hasCheck = link.querySelector('svg.text-brandRewards1, [class*="check-circle"], [class*="lucide-check"]');
                            if (hasCheck) continue;
                            
                            // Check for "Refer a friend" type cards to skip
                            if (link.href.includes('referandearn')) continue;
                            
                            taskCards.push({
                                el: link,
                                text: text.replace(/\\s+/g, ' ').substring(0, 80),
                                href: link.href
                            });
                        }
                    }
                    
                    // ============================================
                    // STRATEGY 2: Direct selector for task cards
                    // Cards use outline-neutralStrokeFocus2 class
                    // ============================================
                    if (taskCards.length === 0) {
                        const directCards = document.querySelectorAll('a[class*="outline-neutralStrokeFocus2"][class*="cursor-pointer"]');
                        for (const link of directCards) {
                            const rect = link.getBoundingClientRect();
                            if (rect.width < 60 || rect.height < 40) continue;
                            if (!link.href) continue;
                            
                            const text = (link.textContent || '').trim();
                            if (text.includes('Sign in') || text.includes('Redeem')) continue;
                            if (link.href.includes('referandearn')) continue;
                            
                            const hasCheck = link.querySelector('svg.text-brandRewards1, [class*="check"]');
                            if (hasCheck) continue;
                            
                            taskCards.push({
                                el: link,
                                text: text.replace(/\\s+/g, ' ').substring(0, 80),
                                href: link.href
                            });
                        }
                    }
                    
                    // ============================================
                    // STRATEGY 3: Grid-based card detection
                    // Tasks are inside grid containers
                    // ============================================
                    if (taskCards.length === 0) {
                        const grids = document.querySelectorAll('[class*="grid-cols"]');
                        for (const grid of grids) {
                            const links = grid.querySelectorAll('a[href][class*="cursor-pointer"]');
                            for (const link of links) {
                                const rect = link.getBoundingClientRect();
                                if (rect.width < 60 || rect.height < 40) continue;
                                
                                const text = (link.textContent || '').trim();
                                if (text.includes('Sign in') || text.includes('Redeem')) continue;
                                if (link.href?.includes('referandearn')) continue;
                                
                                const hasCheck = link.querySelector('svg.text-brandRewards1, [class*="check"]');
                                if (hasCheck) continue;
                                
                                taskCards.push({
                                    el: link,
                                    text: text.replace(/\\s+/g, ' ').substring(0, 80),
                                    href: link.href
                                });
                            }
                        }
                    }
                    
                    // ============================================
                    // STRATEGY 4: Fallback - any clickable with points
                    // ============================================
                    if (taskCards.length === 0) {
                        const allLinks = document.querySelectorAll('a[href*="bing.com"][class*="cursor-pointer"]');
                        for (const link of allLinks) {
                            const rect = link.getBoundingClientRect();
                            if (rect.width < 60 || rect.height < 40 || rect.width > 800) continue;
                            if (link.closest('header') || link.closest('nav')) continue;
                            
                            const text = (link.textContent || '').trim();
                            const hasPoints = text.match(/[+]\\s*\\d+/);
                            if (!hasPoints) continue;
                            
                            const hasCheck = link.querySelector('[class*="check"]');
                            if (hasCheck) continue;
                            
                            taskCards.push({
                                el: link,
                                text: text.replace(/\\s+/g, ' ').substring(0, 80),
                                href: link.href
                            });
                        }
                    }
                    
                    // Deduplicate by href
                    const seenHrefs = new Set();
                    const uniqueTasks = taskCards.filter(t => {
                        const key = t.href || t.text;
                        if (seenHrefs.has(key)) return false;
                        seenHrefs.add(key);
                        return true;
                    });
                    
                    results.found = uniqueTasks.length;
                    
                    // Click each task (limit to 15)
                    const maxClicks = 15;
                    for (const task of uniqueTasks) {
                        if (results.clicked >= maxClicks) break;
                        try {
                            results.taskNames.push(task.text.substring(0, 50));
                            await clickElement(task.el);
                            results.clicked++;
                            await delay(3000 + Math.random() * 2000);
                        } catch (e) {
                            results.errors.push(e.message);
                        }
                    }
                    
                    return results;
                })()
            `,
            returnByValue: true,
            awaitPromise: true
        });

        const earnTaskResults = earnResult?.result?.value || { found: 0, clicked: 0, taskNames: [] };
        totalCompleted += earnTaskResults.clicked;

        if (earnTaskResults.taskNames && earnTaskResults.taskNames.length > 0) {
            log(`  📦 Earn page: Found ${earnTaskResults.found} tasks, clicked ${earnTaskResults.clicked}`);
            earnTaskResults.taskNames.forEach(name => log(`     → ${name}`));
        } else {
            log(`  📦 Earn page: No tasks found or all completed`);
        }

        // Close popup tabs that opened from clicking tasks
        await new Promise(r => setTimeout(r, 3000));
        const allTargets = await CDP.List({ port });
        const rewardsTabId = tabTarget.id;

        for (const t of allTargets) {
            if (t.id !== rewardsTabId && t.type === 'page' &&
                !t.url?.includes('rewards.bing.com') &&
                t.url !== 'about:blank' &&
                !t.url?.startsWith('chrome://') &&
                !t.url?.startsWith('chrome-extension://')) {
                try {
                    const closeC = await CDP({ port });
                    await closeC.Target.closeTarget({ targetId: t.id });
                    await closeC.close();
                    log(`  🗑️ Closed popup: ${t.url?.substring(0, 60)}`);
                } catch { }
            }
        }

        await tabClient.close();

        // Close the earn tab
        try {
            const closeClient = await CDP({ port });
            await closeClient.Target.closeTarget({ targetId });
            await closeClient.close();
        } catch { }

        // ============================================
        // PHASE 2: DASHBOARD (rewards.bing.com/)
        // Check for daily set tasks on dashboard
        // ============================================
        log('  📋 Checking dashboard for additional tasks...');

        const mainClient2 = await CDP({ port });
        const result2 = await mainClient2.Target.createTarget({
            url: 'https://rewards.bing.com/'
        });
        const targetId2 = result2.targetId;
        await mainClient2.close();

        await new Promise(r => setTimeout(r, 8000));

        const targets2 = await CDP.List({ port });
        const dashTab = targets2.find(t => t.url?.includes('rewards.bing.com'));

        if (dashTab) {
            const dashClient = await CDP({ port, target: dashTab.id });
            const { Runtime: Runtime2 } = dashClient;
            await Runtime2.enable();

            const dashResult = await Runtime2.evaluate({
                expression: `
                    (async function() {
                        const results = { found: 0, clicked: 0, errors: [], taskNames: [] };
                        const delay = ms => new Promise(r => setTimeout(r, ms));
                        
                        const clickElement = async (el) => {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await delay(300 + Math.random() * 400);
                            if (el.href) {
                                window.open(el.href, '_blank');
                            } else {
                                el.click();
                            }
                            await delay(500 + Math.random() * 500);
                        };
                        
                        // Scroll to load content
                        for (let i = 0; i < 4; i++) {
                            window.scrollBy({ top: 300, behavior: 'smooth' });
                            await delay(600);
                        }
                        window.scrollTo(0, 0);
                        await delay(1000);
                        
                        // ============================================
                        // Dashboard: Find tasks in Disclosure panels
                        // Same structure as earn page
                        // ============================================
                        const panels = document.querySelectorAll('.react-aria-DisclosurePanel, [class*="DisclosurePanel"]');
                        for (const panel of panels) {
                            const links = panel.querySelectorAll('a[href][class*="cursor-pointer"]');
                            for (const link of links) {
                                if (results.clicked >= 8) break;
                                const rect = link.getBoundingClientRect();
                                if (rect.width < 60 || rect.height < 40) continue;
                                
                                const text = (link.textContent || '').trim();
                                if (text.includes('Sign in') || text.includes('Redeem')) continue;
                                if (link.href?.includes('referandearn')) continue;
                                
                                const hasCheck = link.querySelector('svg.text-brandRewards1, [class*="check-circle"], [class*="lucide-check"]');
                                if (hasCheck) continue;
                                
                                results.found++;
                                results.taskNames.push(text.replace(/\\s+/g, ' ').substring(0, 40));
                                await clickElement(link);
                                results.clicked++;
                                await delay(3000 + Math.random() * 2000);
                            }
                        }
                        
                        // Fallback: OLD UI daily set
                        if (results.clicked === 0) {
                            const dailySet = document.querySelector('section#dailyset, #daily-sets');
                            if (dailySet) {
                                const links = dailySet.querySelectorAll('a[href], button');
                                for (const link of links) {
                                    if (results.clicked >= 5) break;
                                    const text = link.textContent || '';
                                    const rect = link.getBoundingClientRect();
                                    if (rect.width < 50 || rect.height < 30) continue;
                                    
                                    const hasCheck = link.querySelector('[class*="check"], .sw-checkmark');
                                    if (hasCheck) continue;
                                    if (text.includes('See more') || text.includes('Xem thêm')) continue;
                                    
                                    const hasPoints = text.match(/[+•]\\s*\\d+/);
                                    if (hasPoints) {
                                        results.found++;
                                        results.taskNames.push(text.substring(0, 40));
                                        await clickElement(link);
                                        results.clicked++;
                                        await delay(4000);
                                    }
                                }
                            }
                        }
                        
                        return results;
                    })()
                `,
                returnByValue: true,
                awaitPromise: true
            });

            const dashTaskResults = dashResult?.result?.value || { found: 0, clicked: 0, taskNames: [] };
            totalCompleted += dashTaskResults.clicked;
            log(`  📦 Dashboard: Found ${dashTaskResults.found} tasks, clicked ${dashTaskResults.clicked}`);
            if (dashTaskResults.taskNames) {
                dashTaskResults.taskNames.forEach(name => log(`     → ${name}`));
            }

            await dashClient.close();

            // Close popup tabs from dashboard clicks
            await new Promise(r => setTimeout(r, 2000));
            const allTargets2 = await CDP.List({ port });
            for (const t of allTargets2) {
                if (t.type === 'page' && !t.url?.includes('rewards.bing.com') &&
                    t.url !== 'about:blank' && !t.url?.startsWith('chrome://') &&
                    !t.url?.startsWith('chrome-extension://')) {
                    try {
                        const closeC = await CDP({ port });
                        await closeC.Target.closeTarget({ targetId: t.id });
                        await closeC.close();
                    } catch { }
                }
            }

            // Close dashboard tab
            try {
                const closeClient2 = await CDP({ port });
                await closeClient2.Target.closeTarget({ targetId: targetId2 });
                await closeClient2.close();
            } catch { }
        }

        log(`  ✅ Completed ${totalCompleted} daily tasks total`);
        return { success: true, completed: totalCompleted };

    } catch (e) {
        console.error('  ❌ Daily Tasks Error:', e.message);
        if (tabClient) await tabClient.close().catch(() => { });
        return { success: false, completed: totalCompleted, error: e.message };
    }
}

/**
 * Reset/reload rewards page on the browser
 * Opens rewards.bing.com in a new tab to refresh the view
 * @param {number} port - The browser debug port
 * @param {function} log - Logging callback
 */
export async function resetRewardsPage(port, log = console.log) {
    try {
        log('  🔄 Resetting page & cleaning tabs...');

        let mainClient;
        try {
             mainClient = await CDP({ port });
        } catch(e) {
             throw new Error("Cannot connect to Chrome: " + e.message);
        }

        // 1. Ensure we have at least one rewards tab before closing things
        let rewardsTabId = null;
        let targets = await CDP.List({ port });
        const existingRewards = targets.find(t => t.type === 'page' && t.url?.includes('rewards.bing.com'));

        if (existingRewards) {
            rewardsTabId = existingRewards.id;
        } else {
             // Create one!
             const res = await mainClient.Target.createTarget({ url: 'https://rewards.bing.com/' });
             rewardsTabId = res.targetId;
             await new Promise(r => setTimeout(r, 3000));
        }

        // 2. Refresh target list & Close other tabs safely
        targets = await CDP.List({ port });
        let closedCount = 0;

        for (const t of targets) {
            // Skip the rewards tab we just found or created
            if (t.id === rewardsTabId) continue;

            if (t.type === 'page' && 
                !t.url?.startsWith('devtools://') && 
                !t.url?.startsWith('chrome-extension://') && 
                t.url !== 'about:blank') {
                try {
                    await mainClient.Target.closeTarget({ targetId: t.id });
                    closedCount++;
                } catch (e) { }
            }
        }
        await mainClient.close();
        if (closedCount > 0) log(`  🗑️ Closed ${closedCount} leftover tabs`);

        // 3. Reload rewards tab if it already existed
        if (existingRewards) {
            try {
                const client = await CDP({ port, target: rewardsTabId });
                await client.Page.enable();
                await client.Page.reload({ ignoreCache: true });
                // We DO NOT await client.Page.loadEventFired() because it hangs frequently when concurrent
                await new Promise(r => setTimeout(r, 4000));
                await client.close();
                log('  ✅ Rewards page reloaded');
            } catch(e) {
                log('  ⚠️ Failed to reload rewards tab: ' + e.message);
            }
        } else {
            log('  ✅ Rewards page opened in new tab');
        }

        return { success: true };
    } catch (e) {
        log(`  ❌ Reset page failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Run mobile daily tasks by emulating Android on bing.com
 * Mobile Bing homepage shows: daily check-in, Read to Earn, quizzes, rewards tasks
 * @param {number} port - The browser debug port
 * @param {function} log - Logging callback
 */
export async function runMobileDailyTasks(port, log = console.log) {
    let tabClient = null;
    let targetId = null;

    try {
        log('  📱 Opening Bing in Android mobile mode...');

        // 1. Create a new tab
        const mainClient = await CDP({ port });
        const result = await mainClient.Target.createTarget({ url: 'about:blank' });
        targetId = result.targetId;
        await mainClient.close();

        await sleep(1000);

        // 2. Connect and set Android emulation
        const targets = await CDP.List({ port });
        const tabTarget = targets.find(t => t.id === targetId);
        if (!tabTarget) {
            log('  ⚠️ Could not find blank tab');
            return { success: false, completed: 0 };
        }

        tabClient = await CDP({ port, target: tabTarget.id });
        await enableDomains(tabClient);

        // Set Android emulation BEFORE navigating
        await setMobileMode(tabClient, true, 'android');
        log('  📱 Android emulation active (Samsung Galaxy S21)');

        // 3. Navigate to Bing mobile homepage
        await navigateTo(tabClient, 'https://www.bing.com/');
        await sleep(3000); // Extra wait for mobile content to load

        log('  🔍 Looking for mobile daily tasks...');

        // 4. Scroll and find tasks on mobile Bing homepage
        const { Runtime } = tabClient;
        const mobileResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    const results = { found: 0, clicked: 0, errors: [], taskNames: [] };
                    const delay = ms => new Promise(r => setTimeout(r, ms));
                    
                    const clickElement = async (el) => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(500);
                        if (el.href) {
                            window.open(el.href, '_blank');
                        } else {
                            el.click();
                        }
                        await delay(1000);
                    };
                    
                    // Scroll down to load all content on mobile page
                    for (let i = 0; i < 8; i++) {
                        window.scrollBy({ top: 300, behavior: 'smooth' });
                        await delay(600);
                    }
                    window.scrollTo(0, 0);
                    await delay(1000);
                    
                    // ============================================
                    // MOBILE TASK 1: Daily Check-in / Rewards Card
                    // Look for rewards/check-in prompts
                    // ============================================
                    const rewardsSelectors = [
                        // Rewards card on mobile homepage
                        '[class*="rewards"]',
                        '[id*="rewards"]',
                        '[data-tag*="rewards"]',
                        // Check-in button
                        '[class*="checkin"]',
                        '[class*="check-in"]',
                        // Points/streak card
                        '[class*="streak"]',
                        '[class*="points"]',
                        // Mobile rewards flyout
                        '#id_rc',
                        '.rewards_flyout',
                        '#rewardsApp'
                    ];
                    
                    for (const sel of rewardsSelectors) {
                        try {
                            const els = document.querySelectorAll(sel);
                            for (const el of els) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width < 20 || rect.height < 20) continue;
                                
                                const text = el.textContent || '';
                                // Check if it's a clickable task (not navigation)
                                if (text.length > 200) continue; // Skip large containers
                                
                                const isClickable = el.tagName === 'A' || el.tagName === 'BUTTON' || 
                                    el.style.cursor === 'pointer' || el.getAttribute('role') === 'button' ||
                                    el.onclick;
                                    
                                if (isClickable) {
                                    results.found++;
                                    results.taskNames.push('Rewards: ' + text.substring(0, 40).trim());
                                    await clickElement(el);
                                    results.clicked++;
                                    await delay(3000);
                                }
                            }
                        } catch(e) {
                            results.errors.push(sel + ': ' + e.message);
                        }
                    }
                    
                    // ============================================
                    // MOBILE TASK 2: Read to Earn / News articles
                    // Tap and scroll through news articles
                    // ============================================
                    const newsSelectors = [
                        // News cards on mobile Bing
                        '.news-card a',
                        '[class*="news"] a[href]',
                        '.infopane a[href]',
                        'a.story-card',
                        '[class*="feed"] a[href]',
                        '.content-card a',
                        // Bing discover/trending cards
                        '.discover-card a',
                        '[data-tag*="news"] a',
                        // Generic article cards
                        'article a[href]',
                        '.card a[href*="msn.com"]',
                        '.card a[href*="bing.com/news"]'
                    ];
                    
                    const readArticles = [];
                    for (const sel of newsSelectors) {
                        try {
                            const els = document.querySelectorAll(sel);
                            for (const el of els) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width < 50 || rect.height < 30) continue;
                                if (el.href && !readArticles.includes(el.href)) {
                                    readArticles.push(el.href);
                                    if (readArticles.length >= 5) break;
                                }
                            }
                        } catch(e) {}
                        if (readArticles.length >= 5) break;
                    }
                    
                    // Click up to 3 news articles for Read to Earn
                    for (let i = 0; i < Math.min(3, readArticles.length); i++) {
                        results.found++;
                        results.taskNames.push('Read: article ' + (i+1));
                    }
                    
                    // ============================================
                    // MOBILE TASK 3: Daily tasks / Quizzes
                    // Find point-earning elements
                    // ============================================
                    const allClickable = document.querySelectorAll('a[href], button, [role="button"]');
                    for (const el of allClickable) {
                        if (results.clicked >= 10) break;
                        
                        const text = el.textContent || '';
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 40 || rect.height < 30) continue;
                        if (el.closest('header') || el.closest('nav')) continue;
                        
                        // Look for point indicators
                        const hasPoints = text.match(/[+]\\s*\\d+\\s*(pts|points|điểm)?/i);
                        const hasTaskKeywords = text.match(/(quiz|poll|trivia|daily|check.?in|earn|reward|complete|claim)/i);
                        
                        if (hasPoints || hasTaskKeywords) {
                            // Skip if already clicked or navigation
                            if (text.includes('Sign') || text.includes('Settings')) continue;
                            
                            results.found++;
                            results.taskNames.push('Task: ' + text.substring(0, 40).trim());
                            await clickElement(el);
                            results.clicked++;
                            await delay(3000);
                        }
                    }
                    
                    return { ...results, readArticleUrls: readArticles.slice(0, 3) };
                })()
            `,
            returnByValue: true,
            awaitPromise: true
        });

        const mobileTaskResults = mobileResult?.result?.value || { found: 0, clicked: 0, taskNames: [], readArticleUrls: [] };
        let totalMobileCompleted = mobileTaskResults.clicked;

        if (mobileTaskResults.taskNames.length > 0) {
            mobileTaskResults.taskNames.forEach(name => log(`     📱 ${name}`));
        }

        // 5. Read to Earn: Open articles and scroll through them
        const articleUrls = mobileTaskResults.readArticleUrls || [];
        if (articleUrls.length > 0) {
            log(`  📰 Read to Earn: Opening ${articleUrls.length} articles...`);

            for (const url of articleUrls) {
                try {
                    // Navigate to article
                    await navigateTo(tabClient, url);
                    await sleep(2000);

                    // Scroll through article (simulate reading) - Dwell time 30-60s per Article
                    await Runtime.evaluate({
                        expression: `
                            (async function() {
                                const delay = ms => new Promise(r => setTimeout(r, ms));
                                const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
                                const scrollCount = randomInt(15, 25);
                                
                                // Scroll down slowly to simulate reading (min ~30 seconds)
                                for (let i = 0; i < scrollCount; i++) {
                                    window.scrollBy({ top: randomInt(150, 400), behavior: 'smooth' });
                                    await delay(randomInt(1000, 3000));
                                    
                                    if (Math.random() < 0.2) {
                                        window.scrollBy({ top: -randomInt(50, 150), behavior: 'smooth' });
                                        await delay(randomInt(500, 1500));
                                    }
                                }
                            })()
                        `,
                        awaitPromise: true
                    });

                    totalMobileCompleted++;
                    log(`     📰 Read article: ${url.substring(0, 60)}...`);
                    await sleep(1000);
                } catch (e) {
                    log(`     ⚠️ Article read failed: ${e.message}`);
                }
            }
        }

        // 6. Navigate to mobile rewards dashboard  
        log('  📱 Checking mobile rewards dashboard...');
        await navigateTo(tabClient, 'https://rewards.bing.com/');
        await sleep(4000);

        const mobileDashResult = await Runtime.evaluate({
            expression: `
                (async function() {
                    const results = { found: 0, clicked: 0, taskNames: [] };
                    const delay = ms => new Promise(r => setTimeout(r, ms));
                    
                    // Scroll to load content
                    for (let i = 0; i < 5; i++) {
                        window.scrollBy({ top: 300, behavior: 'smooth' });
                        await delay(500);
                    }
                    window.scrollTo(0, 0);
                    await delay(500);
                    
                    // Find incomplete task cards (same as desktop but on mobile viewport)
                    const allClickable = document.querySelectorAll('a[href], button, [role="button"]');
                    for (const el of allClickable) {
                        if (results.clicked >= 8) break;
                        
                        const text = el.textContent || '';
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 40 || rect.height < 25) continue;
                        if (el.closest('header') || el.closest('nav')) continue;
                        if (text.includes('Sign in') || text.includes('Redeem') || text.includes('About')) continue;
                        
                        const hasPoints = text.match(/[+•]\\s*\\d+/);
                        const hasCheck = el.querySelector('[class*="check"]');
                        
                        if (hasPoints && !hasCheck) {
                            results.found++;
                            results.taskNames.push(text.substring(0, 40).trim());
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await delay(400);
                            if (el.href) {
                                window.open(el.href, '_blank');
                            } else {
                                el.click();
                            }
                            results.clicked++;
                            await delay(4000);
                        }
                    }
                    
                    return results;
                })()
            `,
            returnByValue: true,
            awaitPromise: true
        });

        const mobileDash = mobileDashResult?.result?.value || { found: 0, clicked: 0 };
        totalMobileCompleted += mobileDash.clicked;
        if (mobileDash.taskNames && mobileDash.taskNames.length > 0) {
            mobileDash.taskNames.forEach(name => log(`     📱 Mobile dash: ${name}`));
        }

        // 7. Disable mobile emulation and clean up
        await setMobileMode(tabClient, false);

        // Close popup tabs
        await sleep(2000);
        const allTargets = await CDP.List({ port });
        for (const t of allTargets) {
            if (t.id !== tabTarget.id && t.type === 'page' &&
                t.url !== 'about:blank' && !t.url?.startsWith('chrome://') &&
                !t.url?.startsWith('chrome-extension://')) {
                try {
                    const closeC = await CDP({ port });
                    await closeC.Target.closeTarget({ targetId: t.id });
                    await closeC.close();
                } catch { }
            }
        }

        await tabClient.close();

        // Close the mobile tab
        try {
            const closeClient = await CDP({ port });
            await closeClient.Target.closeTarget({ targetId });
            await closeClient.close();
        } catch { }

        log(`  ✅ Mobile tasks completed: ${totalMobileCompleted} total`);
        return { success: true, completed: totalMobileCompleted };

    } catch (e) {
        console.error('  ❌ Mobile Daily Tasks Error:', e.message);
        if (tabClient) {
            try { await setMobileMode(tabClient, false); } catch { }
            await tabClient.close().catch(() => { });
        }
        return { success: false, completed: 0, error: e.message };
    }
}
