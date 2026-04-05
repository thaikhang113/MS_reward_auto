// =============================================
// SEARCH KEYWORDS CONFIGURATION
// Vietnamese keywords for Bing Rewards automation
// Imported from all-categories; provides random() function
// =============================================

// Note: All keywords are in Vietnamese for Bing Rewards automation
// The main categories are defined separately for organization
// This file provides a simple interface to get random keywords

const KEYWORDS = [
    // This will be populated by requiring all categories
    // See keywords-categories.js for the full categorized list
];

// Fallback minimal keywords if categories not loaded
const FALLBACK_KEYWORDS = [
    'tin tức hôm nay', 'thời tiết hôm nay', 'công nghệ mới', 'du lịch đà nẵng',
    'món ăn ngon', 'bóng đá việt nam', 'phim hay 2026', 'học lập trình',
    'giảm cân', 'kinh doanh online', 'thời trang nam', 'xe máy honda',
    'nhà đất bán', 'chăm sóc trẻ em', 'spa đà nẵng', 'đại học 2026'
];

let initialized = false;

function init(categories) {
    if (initialized) return;
    KEYWORDS.length = 0;
    Object.values(categories).forEach(category => {
        KEYWORDS.push(...category);
    });
    initialized = true;
}

function getRandom() {
    if (KEYWORDS.length === 0) {
        return FALLBACK_KEYWORDS[Math.floor(Math.random() * FALLBACK_KEYWORDS.length)];
    }
    return KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
}

function getAll() {
    if (KEYWORDS.length === 0) {
        return FALLBACK_KEYWORDS;
    }
    return KEYWORDS;
}

module.exports = {
    KEYWORDS,
    FALLBACK_KEYWORDS,
    init,
    getRandom,
    getAll
};
