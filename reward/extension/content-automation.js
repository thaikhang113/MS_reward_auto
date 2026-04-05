// =============================================
// AUTOMATION SCRIPT - Injected into Bing pages
// via chrome.scripting.executeScript
// =============================================

(function () {
    if (window.__BRA_INJECTED__) return { status: 'already_injected' };
    window.__BRA_INJECTED__ = true;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    // Human-like typing with typo simulation
    async function humanTypeString(el, text, speed = 'medium') {
        let minDelay, maxDelay;
        switch (speed) {
            case 'slow':   minDelay = 200; maxDelay = 400; break;
            case 'fast':   minDelay = 40;  maxDelay = 100; break;
            default:       minDelay = 100; maxDelay = 250; break;
        }

        let i = 0;
        while (i < text.length) {
            const char = text[i];

            // 10% typo chance
            if (Math.random() < 0.1 && i > 0 && char !== ' ') {
                const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
                el.dispatchEvent(new KeyboardEvent('keydown', { key: wrongChar, bubbles: true }));
                el.value += wrongChar;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: wrongChar, bubbles: true }));
                await sleep(randomInt(minDelay, maxDelay));
                await sleep(randomInt(300, 800));
                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
                el.value = el.value.slice(0, -1);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
                await sleep(randomInt(200, 500));
            }

            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.value += char;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            let charDelay = randomInt(minDelay, maxDelay);
            if (char === ' ') charDelay += randomInt(30, 80);
            if (Math.random() < 0.05) charDelay += randomInt(50, 150);
            await sleep(charDelay);
            i++;
        }
    }

    // Enhanced search interaction (anti-ban - Simulate Reading)
    async function enhancedSearchInteraction() {
        await sleep(randomInt(1000, 2000));
        
        // Mô phỏng lướt báo: cuộn xuống 500-1000px chia làm nhiều nhịp
        const totalScroll = randomInt(500, 1000);
        const steps = randomInt(3, 6);
        const scrollPerStep = Math.floor(totalScroll / steps);
        
        for (let i = 0; i < steps; i++) {
            window.scrollBy({ top: scrollPerStep + randomInt(-50, 50), behavior: 'smooth' });
            await sleep(randomInt(800, 1500)); // Nhịp nghỉ đọc tin
        }

        // Thi thoảng lướt ngược lên như kiểu đọc lại
        if (Math.random() > 0.5) {
            window.scrollBy({ top: -randomInt(100, 300), behavior: 'smooth' });
            await sleep(randomInt(1000, 2000));
        }
    }

    function findSearchInput() {
        const selectors = [
            '#sb_form_q', 'textarea[name="q"]', 'input[name="q"]',
            'textarea.b_searchbox', 'input.b_searchbox',
            '[aria-label*="Search" i]', 'input[type="search"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    async function typeAndSearch(keyword) {
        window.scrollTo(0, 0);
        await sleep(300);

        // Dismiss overlays
        try {
            const langPanel = document.querySelector('#b-scopeListItem-menu, .b_scopeListItem_menu, [id*="lang"], #b_tween');
            if (langPanel && langPanel.style.display !== 'none') {
                document.body.click();
                await sleep(300);
            }
            document.querySelectorAll('[class*="overlay"][style*="display: block"], [class*="modal"][style*="display: block"], .b_overlay')
                .forEach(o => { try { o.style.display = 'none'; } catch(e) {} });
        } catch(e) {}

        const searchInput = findSearchInput();
        if (!searchInput) return { success: false, error: 'no_input' };

        searchInput.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(randomInt(300, 600));
        await sleep(randomInt(500, 1000));
        searchInput.focus();
        searchInput.click();
        await sleep(randomInt(200, 400));

        if (document.activeElement !== searchInput) {
            searchInput.focus();
            await sleep(200);
        }

        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(randomInt(100, 200));

        await humanTypeString(searchInput, keyword, 'medium');
        await sleep(randomInt(800, 2000));
        await sleep(randomInt(500, 1200));

        const form = searchInput.closest('form') || document.getElementById('sb_form');
        if (form) { form.submit(); }
        else {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', keyCode: 13, bubbles: true
            }));
        }
        return { success: true };
    }

    // =============================================
    // SCRAPE POINTS (API + DOM selectors)
    // =============================================
    async function scrapePoints() {
        // METHOD 1: Official API (with timeout)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const r = await fetch('https://rewards.bing.com/api/getuserinfo?type=1', {
                signal: controller.signal,
                cache: 'no-cache',
                credentials: 'omit'
            });
            clearTimeout(timeoutId);

            if (r.ok) {
                const data = await r.json();
                if (data?.dashboard?.userStatus?.availablePoints) {
                    return data.dashboard.userStatus.availablePoints;
                }
            }
        } catch (e) {
            // API failed, try selectors
        }

        // METHOD 2: DOM selectors
        const extractPoints = (text) => {
            if (!text) return null;
            const matches = text.match(/(\d{1,3}(?:[,.\s]\d{3})+|\d+)(?:\.\d{2})?/g);
            if (matches) {
                const numbers = matches
                    .map(m => parseInt(m.replace(/[,.\s]/g, ''), 10))
                    .filter(n => !isNaN(n) && n >= 0 && n < 1000000)
                    .sort((a, b) => b - a);
                for (const num of numbers) {
                    if (num >= 100) return num;
                }
            }
            return null;
        };

        const selectors = [
            '.text-title1.font-semibold',
            'mee-rewards-user-status-balance',
            '#balanceToolTip',
            '.pointsValue',
            '[class*="balance"]'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                const num = extractPoints(el.innerText || el.textContent);
                if (num) return num;
            }
        }

        return null;
    }

    // =============================================
    // CLICK DAILY TASKS (XPath + fallback)
    // =============================================
    async function clickDailyTasks() {
        await sleep(2000);

        const tasks = [];

        // XPath by header text (works for both old/new UI)
        const findTasksByHeader = (headerText) => {
            const xpath = `//*[contains(text(), '${headerText}')]/ancestor::*[position() <= 4]//a`;
            const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const found = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                found.push(result.snapshotItem(i));
            }
            return found;
        };

        const headers = [
            'Nhóm mục tiêu hàng ngày',
            'Daily Set',
            'Các hoạt động khác',
            'More activities'
        ];

        for (const h of headers) {
            findTasksByHeader(h).forEach(l => tasks.push(l));
        }

        // Fallback: section-based
        if (tasks.length === 0) {
            ['#daily-sets a', '#more-activities a'].forEach(sel => {
                document.querySelectorAll(sel).forEach(l => tasks.push(l));
            });
        }

        let clickedCount = 0;
        const maxClicks = 4;
        const uniqueTasks = [...new Set(tasks)];

        for (const link of uniqueTasks) {
            if (clickedCount >= maxClicks) break;

            // Skip completed
            const card = link.closest('.c-card') || link.closest('div[class*="content"]');
            if (card?.querySelector('.sw-checkmark')) continue;

            if (!link.href || link.href.includes('#')) continue;

            try {
                link.scrollIntoView({ behavior: 'auto', block: 'center' });
                await sleep(500);
                link.click();
                clickedCount++;
                await sleep(5000);
            } catch (e) { }
        }

        return { clicked: clickedCount };
    }

    window.__BRA__ = {
        typeAndSearch,
        enhancedSearchInteraction,
        scrapePoints,
        clickDailyTasks,
        humanTypeString,
        findSearchInput,
        sleep,
        randomInt
    };

    return { status: 'injected', version: '3.0' };
})();
