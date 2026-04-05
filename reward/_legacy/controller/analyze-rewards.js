// =============================================
// BING REWARDS HTML ANALYZER
// Captures HTML and finds daily task selectors
// =============================================

import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = process.argv[2] || 9222;
const OUTPUT_DIR = './captured-html';

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function captureRewardsPage(port) {
    console.log(`Connecting to browser on port ${port}...`);

    let client;
    try {
        // List all targets
        const targets = await CDP.List({ port });
        console.log(`Found ${targets.length} tabs`);

        // Find Extension Service Worker target
        const swTarget = targets.find(t =>
            t.type === 'service_worker' &&
            t.url.includes('chrome-extension')
        );

        if (!swTarget) {
            console.error('No extension service worker found');
            return;
        }

        console.log('Connecting to extension:', swTarget.id);
        client = await CDP({ target: swTarget.id, port });

        const { Runtime, Target } = client;
        await Runtime.enable();

        console.log('\n=== Opening Rewards Dashboard ===');

        // Create new tab with Bing Rewards
        const { targetId } = await Target.createTarget({
            url: 'https://rewards.bing.com/'
        });

        console.log('Created tab:', targetId);

        // Wait for page to load
        await sleep(8000);

        // Attach to the new tab
        const pageClient = await CDP({ target: targetId, port });
        const { Page, DOM, Runtime: PageRuntime } = pageClient;

        await Page.enable();
        await DOM.enable();
        await PageRuntime.enable();

        console.log('Waiting for page to fully load...');
        await sleep(5000);

        // Get HTML
        console.log('\n=== Capturing HTML ===');
        const { root } = await DOM.getDocument();
        const { outerHTML } = await DOM.getOuterHTML({ nodeId: root.nodeId });

        // Save to file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(OUTPUT_DIR, `rewards-${timestamp}.html`);

        fs.writeFileSync(filename, outerHTML, 'utf8');
        console.log('✅ Saved HTML to:', filename);

        // Analyze for daily tasks
        console.log('\n=== Analyzing Daily Tasks ===');
        const analysis = await analyzeHTML(PageRuntime, DOM);

        // Save analysis
        const analysisFile = path.join(OUTPUT_DIR, `analysis-${timestamp}.json`);
        fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2), 'utf8');
        console.log('✅ Saved analysis to:', analysisFile);

        // Print summary
        printAnalysisSummary(analysis);

        // Close tab
        await Target.closeTarget({ targetId });
        await pageClient.close();

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

async function analyzeHTML(Runtime, DOM) {
    const analysis = {
        timestamp: new Date().toISOString(),
        dailyTasks: {
            headers: [],
            cards: [],
            links: []
        },
        selectors: {
            found: [],
            recommended: []
        }
    };

    // Execute script to find elements
    const script = `
    (function() {
        const results = {
            headers: [],
            cards: [],
            links: [],
            sections: []
        };

        // Find daily task headers
        const headerTexts = [
            'Daily Set', 'Nhóm mục tiêu hàng ngày',
            'More activities', 'Các hoạt động khác'
        ];

        for (const text of headerTexts) {
            const xpath = \`//*[contains(text(), '\${text}')]\`;
            const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            
            for (let i = 0; i < iterator.snapshotLength; i++) {
                const node = iterator.snapshotItem(i);
                results.headers.push({
                    text: text,
                    tagName: node.tagName,
                    id: node.id || '',
                    className: node.className || '',
                    path: getElementPath(node)
                });
            }
        }

        // Find all card-like elements
        const cardSelectors = [
            '.c-card',
            '[class*="card"]',
            '[class*="item"]',
            'mee-card',
            'daily-set-card'
        ];

        for (const sel of cardSelectors) {
            const cards = document.querySelectorAll(sel);
            if (cards.length > 0) {
                results.cards.push({
                    selector: sel,
                    count: cards.length,
                    sample: {
                        html: cards[0].outerHTML.substring(0, 500),
                        classes: cards[0].className
                    }
                });
            }
        }

        // Find all links in potential task areas
        const links = document.querySelectorAll('a[href*="rewards"], a[href*="bing.com"]');
        results.links = {
            total: links.length,
            samples: Array.from(links).slice(0, 10).map(l => ({
                href: l.href,
                text: l.innerText.trim().substring(0, 50),
                parent: l.parentElement.className
            }))
        };

        // Find sections with IDs
        const sections = document.querySelectorAll('section, div[id], div[class*="section"]');
        results.sections = Array.from(sections)
            .filter(s => s.id || s.className.includes('daily') || s.className.includes('task'))
            .map(s => ({
                tagName: s.tagName,
                id: s.id || '',
                className: s.className,
                children: s.children.length
            }))
            .slice(0, 20);

        function getElementPath(element) {
            const path = [];
            let current = element;
            while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    selector += '#' + current.id;
                } else if (current.className) {
                    const classes = current.className.split(' ').filter(c => c).slice(0, 2);
                    if (classes.length) selector += '.' + classes.join('.');
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        }

        return results;
    })();
    `;

    try {
        const { result } = await Runtime.evaluate({
            expression: script,
            returnByValue: true
        });

        if (result.value) {
            analysis.dailyTasks = result.value;

            // Generate recommended selectors
            const recommendations = generateRecommendations(result.value);
            analysis.selectors.recommended = recommendations;
        }
    } catch (e) {
        console.error('Analysis error:', e.message);
    }

    return analysis;
}

function generateRecommendations(data) {
    const recommendations = [];

    // Based on headers found
    if (data.headers && data.headers.length > 0) {
        const headerPaths = data.headers.map(h => h.path);
        recommendations.push({
            method: 'XPath by header text',
            selectors: [
                "//\*[contains(text(), 'Daily Set')]/ancestor::\*[position() <= 4]//a",
                "//\*[contains(text(), 'Nhóm mục tiêu hàng ngày')]/ancestor::\*[position() <= 4]//a"
            ],
            confidence: 'HIGH'
        });
    }

    // Based on cards found
    if (data.cards && data.cards.length > 0) {
        const topCardSelector = data.cards[0].selector;
        recommendations.push({
            method: 'Card selector',
            selectors: data.cards.map(c => `${c.selector} a`),
            confidence: 'MEDIUM'
        });
    }

    // Based on sections
    if (data.sections && data.sections.length > 0) {
        const taskSections = data.sections.filter(s =>
            s.id.includes('daily') ||
            s.id.includes('task') ||
            s.className.includes('daily') ||
            s.className.includes('task')
        );

        if (taskSections.length > 0) {
            recommendations.push({
                method: 'Section-based',
                selectors: taskSections.map(s => `#${s.id} a, .${s.className.split(' ')[0]} a`),
                confidence: 'HIGH'
            });
        }
    }

    return recommendations;
}

function printAnalysisSummary(analysis) {
    console.log('\n' + '='.repeat(50));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(50));

    console.log('\n📋 Daily Task Headers Found:', analysis.dailyTasks.headers?.length || 0);
    if (analysis.dailyTasks.headers) {
        analysis.dailyTasks.headers.forEach(h => {
            console.log(`  - "${h.text}" → ${h.tagName}#${h.id || '(no id)'}.${h.className || '(no class)'}`);
        });
    }

    console.log('\n🃏 Card Elements Found:', analysis.dailyTasks.cards?.length || 0);
    if (analysis.dailyTasks.cards) {
        analysis.dailyTasks.cards.forEach(c => {
            console.log(`  - ${c.selector} (${c.count} cards)`);
        });
    }

    console.log('\n🔗 Total Links:', analysis.dailyTasks.links?.total || 0);

    console.log('\n✅ RECOMMENDED SELECTORS:');
    if (analysis.selectors.recommended) {
        analysis.selectors.recommended.forEach((rec, i) => {
            console.log(`\n${i + 1}. ${rec.method} (Confidence: ${rec.confidence})`);
            rec.selectors.forEach(sel => {
                console.log(`   ${sel}`);
            });
        });
    }

    console.log('\n' + '='.repeat(50));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
console.log('Bing Rewards HTML Analyzer');
console.log('Usage: node analyze-rewards.js [debug-port]');
console.log('Default port: 9222\n');

captureRewardsPage(DEBUG_PORT).catch(console.error);
