// =============================================
// AUTOMATION SCRIPT - Injected via CDP
// =============================================
// This script is injected into browser pages via CDP Runtime.evaluate()
// Contains all automation logic with anti-ban timing

(function () {
    // Prevent double injection
    if (window.__BRA_INJECTED__) return { status: 'already_injected' };
    window.__BRA_INJECTED__ = true;

    // =============================================
    // UTILITIES
    // =============================================
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // =============================================
    // HUMAN-LIKE TYPING (Anti-ban) with typo simulation
    // Speed: 100-250ms per character
    // =============================================
    async function humanTypeString(el, text, speed = 'medium') {
        let minDelay, maxDelay;

        switch (speed) {
            case 'slow':    minDelay = 200; maxDelay = 400; break;
            case 'fast':    minDelay = 40; maxDelay = 100; break;
            case 'medium':  
            default:        minDelay = 100; maxDelay = 250; break;
        }

        console.log(`BRA: Typing "${text}" (${speed}: ${minDelay}-${maxDelay}ms)`);

        let i = 0;
        while (i < text.length) {
            const char = text[i];

            // 10% chance to make a typo (giả lập gõ nhầm xong xoá đi gõ lại)
            if (Math.random() < 0.1 && i > 0 && char !== ' ') {
                // Type wrong character (Gõ ngẫu nhiên 1 kí tự liên tiếp)
                const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26)); 

                el.dispatchEvent(new KeyboardEvent('keydown', { key: wrongChar, bubbles: true }));
                el.value += wrongChar;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: wrongChar, bubbles: true }));

                await sleep(randomInt(minDelay, maxDelay));

                // Pause before realizing mistake
                await sleep(randomInt(300, 800));

                // Press backspace
                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
                el.value = el.value.slice(0, -1);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));

                await sleep(randomInt(200, 500));
            }

            // Type correct character
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.value += char;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            // Variable delay
            let charDelay = randomInt(minDelay, maxDelay);

            // Natural feel adjustments
            if (char === ' ') charDelay += randomInt(30, 80);
            if (Math.random() < 0.05) charDelay += randomInt(50, 150); // Occasional pause

            await sleep(charDelay);
            i++;
        }
    }

    // =============================================
    // SEARCH INTERACTION (Anti-ban)
    // Scroll 5-10 times, delay 1000-2500ms each
    // =============================================
    async function enhancedSearchInteraction() {
        console.log('BRA: Starting enhanced search interaction...');

        // 1. Initial pause (reading results)
        await sleep(randomInt(1500, 3000));

        // 2. Scroll down multiple times to simulate reading
        const scrollCount = randomInt(5, 10);
        console.log(`BRA: Will scroll ${scrollCount} times`);

        for (let i = 0; i < scrollCount; i++) {
            const scrollAmount = randomInt(150, 350);
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            await sleep(randomInt(1000, 2500));
        }

        // 3. Hover and sometimes click on a result (anti fingerprint patterns)
        const resultLinks = document.querySelectorAll('h2 a, .b_algo h2 a, li.b_algo h2 a');
        if (resultLinks.length > 0) {
            const randomIndex = randomInt(0, Math.min(resultLinks.length - 1, 4));
            const link = resultLinks[randomIndex];

            // Tỷ lệ 50% hover vào link (kiểu như đọc xem có chuẩn không)
            if (Math.random() > 0.5) {
                link.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(randomInt(300, 500));
                
                link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                await sleep(randomInt(500, 1000));
                link.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            }

            // Tỷ lệ 20-30% click thật vào liên kết, sau đó Back lại
            // Giải phóng lệnh Click Ảo vì MS Track Event Load
            if (Math.random() < 0.25) {
                console.log('BRA: Simulating deep click for organic rating');
                link.click();
                await sleep(randomInt(3000, 6000)); // Cố tình delay giả bộ đang đọc trang mới
                window.history.back();
                await sleep(randomInt(1000, 2000)); 
            }
        }

        // 4. Scroll back up
        window.scrollBy({ top: -randomInt(100, 300), behavior: 'smooth' });
        await sleep(randomInt(500, 1000));

        // 5. Final pause
        await sleep(randomInt(1000, 2000));

        console.log('BRA: Search interaction complete');
    }

    // =============================================
    // FIND SEARCH INPUT
    // =============================================
    function findSearchInput() {
        const selectors = [
            '#sb_form_q',
            'textarea[name="q"]',
            'input[name="q"]',
            'textarea.b_searchbox',
            'input.b_searchbox',
            '[aria-label*="Search" i]',
            'input[type="search"]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    // =============================================
    // TYPE AND SEARCH
    // =============================================
    async function typeAndSearch(keyword) {
        console.log('BRA: Starting search for:', keyword);

        // STEP 0: Scroll to top and dismiss any overlays (prevent clicking language selector)
        window.scrollTo(0, 0);
        await sleep(300);

        // Close any open popups/overlays (language selector, settings, etc.)
        try {
            // Dismiss language selector if open
            const langPanel = document.querySelector('#b-scopeListItem-menu, .b_scopeListItem_menu, [id*="lang"], #b_tween');
            if (langPanel && langPanel.style.display !== 'none') {
                document.body.click(); // Click away to dismiss
                await sleep(300);
            }
            // Close any modal overlays
            const overlays = document.querySelectorAll('[class*="overlay"][style*="display: block"], [class*="modal"][style*="display: block"], .b_overlay');
            overlays.forEach(o => {
                try { o.style.display = 'none'; } catch(e) {}
            });
        } catch(e) {
            console.log('BRA: Overlay dismiss skipped:', e.message);
        }

        const searchInput = findSearchInput();
        if (!searchInput) {
            console.error('BRA: No search input found');
            return { success: false, error: 'no_input' };
        }

        // Scroll search input into view to make sure we interact with the right element
        searchInput.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(randomInt(300, 600));

        // Focus and clear
        await sleep(randomInt(500, 1000));
        searchInput.focus();
        searchInput.click();
        await sleep(randomInt(200, 400));

        // Verify the search input is actually focused (not the language selector)
        if (document.activeElement !== searchInput) {
            console.log('BRA: Re-focusing search input...');
            searchInput.focus();
            await sleep(200);
        }

        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(randomInt(100, 200));

        // Type character by character (anti-ban)
        await humanTypeString(searchInput, keyword, 'medium');

        // Thinking pause before submit (800-2000ms)
        console.log('BRA: Thinking before submit...');
        await sleep(randomInt(800, 2000));

        // Submit
        await sleep(randomInt(500, 1200));
        const form = searchInput.closest('form') || document.getElementById('sb_form');
        if (form) {
            form.submit();
        } else {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', keyCode: 13, bubbles: true
            }));
        }

        console.log('BRA: Search submitted');
        return { success: true };
    }

    // =============================================
    // SCRAPE POINTS
    // =============================================
    async function scrapePoints() {
        console.log('BRA: Scraping points...');

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
            if (e.name === 'AbortError') {
                console.log('BRA: API timeout, trying selectors...');
            } else {
                console.log('BRA: API failed, trying selectors...');
            }
        }

        // METHOD 2: DOM selectors
        const extractPoints = (text) => {
            if (!text) return null;
            // Match number sequences with optional thousand separators and decimals
            const matches = text.match(/(\d{1,3}(?:[,\.\s]\d{3})+|\d+)(?:\.\d{2})?/g);
            if (matches) {
                // Process from highest to lowest value (most likely to be points)
                const numbers = matches
                    .map(m => parseInt(m.replace(/[,\.\s]/g, ''), 10))
                    .filter(n => !isNaN(n) && n >= 0 && n < 1000000)
                    .sort((a, b) => b - a); // Descending

                // Prefer larger numbers in valid range (points tend to be in thousands)
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
    // CLICK DAILY TASKS
    // =============================================
    async function clickDailyTasks() {
        console.log('BRA: Looking for daily tasks...');
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

        console.log('BRA: Found', tasks.length, 'potential tasks');

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

    // =============================================
    // EXPOSE FUNCTIONS
    // =============================================
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

    console.log('BRA: Automation script injected successfully');
    return { status: 'injected', version: '2.0' };
})();
