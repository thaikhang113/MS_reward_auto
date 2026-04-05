// =============================================
// OFFLINE HTML ANALYZER
// Analyzes saved HTML files
// =============================================

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const htmlFile = process.argv[2];

if (!htmlFile) {
    console.error('Usage: node analyze-html-file.js <path-to-html-file>');
    process.exit(1);
}

if (!fs.existsSync(htmlFile)) {
    console.error('File not found:', htmlFile);
    process.exit(1);
}

console.log('Analyzing:', htmlFile);
console.log('='.repeat(60));

// Read HTML
const html = fs.readFileSync(htmlFile, 'utf8');
const dom = new JSDOM(html);
const { document } = dom.window;

const analysis = {
    file: path.basename(htmlFile),
    timestamp: new Date().toISOString(),
    dailyTasks: {
        headers: [],
        cards: [],
        links: [],
        sections: []
    },
    recommendations: []
};

// Find headers
console.log('\n📋 Finding Daily Task Headers...');
const headerTexts = [
    'Daily Set',
    'Nhóm mục tiêu hàng ngày',
    'More activities',
    'Các hoạt động khác',
    'daily set',
    'more activities'
];

headerTexts.forEach(text => {
    const elements = Array.from(document.querySelectorAll('*')).filter(el =>
        el.textContent.trim().toLowerCase().includes(text.toLowerCase())
    );

    elements.forEach(el => {
        if (el.textContent.trim().length < 200) { // Skip too long elements
            analysis.dailyTasks.headers.push({
                text: text,
                actualText: el.textContent.trim().substring(0, 100),
                tagName: el.tagName,
                id: el.id || '',
                className: el.className || '',
                path: getElementPath(el)
            });
            console.log(`  ✓ Found "${text}" in <${el.tagName}> ${el.id ? '#' + el.id : ''} ${el.className ? '.' + el.className.split(' ')[0] : ''}`);
        }
    });
});

// Find cards
console.log('\n🃏 Finding Card Elements...');
const cardSelectors = [
    '.c-card',
    '[class*="card"]',
    '[class*="item"]',
    'mee-card',
    '[class*="daily"]',
    '[class*="task"]',
    '[class*="activity"]'
];

cardSelectors.forEach(sel => {
    try {
        const cards = document.querySelectorAll(sel);
        if (cards.length > 0) {
            analysis.dailyTasks.cards.push({
                selector: sel,
                count: cards.length,
                sample: {
                    className: cards[0].className,
                    id: cards[0].id || '',
                    hasLinks: cards[0].querySelectorAll('a').length > 0
                }
            });
            console.log(`  ✓ ${sel} → ${cards.length} elements`);
        }
    } catch (e) {
        // Invalid selector
    }
});

// Find links
console.log('\n🔗 Finding Task Links...');
const allLinks = document.querySelectorAll('a');
const taskLinks = Array.from(allLinks).filter(link => {
    const href = link.href || '';
    const text = link.textContent.trim();
    return href.includes('rewards') ||
        href.includes('bing.com') ||
        text.length > 0;
});

analysis.dailyTasks.links = {
    total: allLinks.length,
    taskRelated: taskLinks.length,
    samples: taskLinks.slice(0, 10).map(l => ({
        href: l.href.substring(0, 100),
        text: l.textContent.trim().substring(0, 50),
        parent: l.parentElement.tagName + (l.parentElement.className ? '.' + l.parentElement.className.split(' ')[0] : '')
    }))
};
console.log(`  Total links: ${allLinks.length}`);
console.log(`  Task-related: ${taskLinks.length}`);

// Find sections
console.log('\n📦 Finding Sections...');
const sections = document.querySelectorAll('section, div[id], div[class*="section"]');
const relevantSections = Array.from(sections).filter(s => {
    const id = s.id.toLowerCase();
    const className = s.className.toLowerCase();
    return id.includes('daily') ||
        id.includes('task') ||
        id.includes('activity') ||
        className.includes('daily') ||
        className.includes('task') ||
        className.includes('activity');
});

relevantSections.forEach(s => {
    const info = {
        tagName: s.tagName,
        id: s.id || '',
        className: s.className,
        childLinks: s.querySelectorAll('a').length
    };
    analysis.dailyTasks.sections.push(info);
    console.log(`  ✓ <${s.tagName}> #${s.id} .${s.className.split(' ')[0]} (${info.childLinks} links)`);
});

// Generate recommendations
console.log('\n✅ GENERATING RECOMMENDATIONS...\n');

if (analysis.dailyTasks.headers.length > 0) {
    const rec = {
        method: 'XPath by Header Text',
        confidence: 'HIGH',
        selectors: []
    };

    headerTexts.forEach(text => {
        rec.selectors.push(`//*[contains(text(), '${text}')]/ancestor::*[position() <= 4]//a`);
    });

    analysis.recommendations.push(rec);
    console.log('1. XPath by Header Text (Confidence: HIGH)');
    rec.selectors.forEach(s => console.log(`   ${s}`));
}

if (analysis.dailyTasks.cards.length > 0) {
    const rec = {
        method: 'Card Selectors',
        confidence: 'MEDIUM',
        selectors: analysis.dailyTasks.cards
            .filter(c => c.sample.hasLinks)
            .map(c => `${c.selector} a`)
    };

    if (rec.selectors.length > 0) {
        analysis.recommendations.push(rec);
        console.log('\n2. Card Selectors (Confidence: MEDIUM)');
        rec.selectors.forEach(s => console.log(`   ${s}`));
    }
}

if (analysis.dailyTasks.sections.length > 0) {
    const rec = {
        method: 'Section-based',
        confidence: 'HIGH',
        selectors: analysis.dailyTasks.sections.map(s => {
            if (s.id) return `#${s.id} a`;
            const firstClass = s.className.split(' ')[0];
            return `.${firstClass} a`;
        })
    };

    analysis.recommendations.push(rec);
    console.log('\n3. Section-based (Confidence: HIGH)');
    rec.selectors.forEach(s => console.log(`   ${s}`));
}

// Save analysis
const outputFile = htmlFile.replace('.html', '-analysis.json');
fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2), 'utf8');

console.log('\n' + '='.repeat(60));
console.log(`✅ Analysis saved to: ${outputFile}`);
console.log('='.repeat(60));

function getElementPath(element) {
    const path = [];
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
            selector += '#' + current.id;
        } else if (current.className) {
            const classes = current.className.split(' ').filter(c => c).slice(0, 2);
            if (classes.length) selector += '.' + classes.join('.');
        }
        path.unshift(selector);
        current = current.parentElement;
        depth++;
    }

    return path.join(' > ');
}
