// =============================================
// CDP HELPER UTILITIES
// Common functions for Chrome DevTools Protocol operations
// =============================================

const CDP = require('chrome-remote-interface');

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely close CDP client
 */
async function safeClose(client) {
    if (client) {
        try {
            await client.close();
        } catch (e) {
            console.warn('Warning: Failed to close CDP client:', e.message);
        }
    }
}

/**
 * Execute script in page context with error handling
 */
async function executeInPage(client, expression, awaitPromise = true) {
    try {
        const result = await client.Runtime.evaluate({
            expression,
            awaitPromise,
            returnByValue: true
        });

        if (result.exceptionDetails) {
            throw new Error(`Runtime error: ${result.exceptionDetails.text}`);
        }

        return result.result?.value;
    } catch (e) {
        throw new Error(`Execute failed: ${e.message}`);
    }
}

/**
 * Wait for page load with timeout
 */
async function waitForLoad(client, timeout = 10000) {
    const startTime = Date.now();

    try {
        // Wait for load event
        await client.Page.loadEventFired();

        // Additional wait for dynamic content
        await sleep(2000);
    } catch (e) {
        if (Date.now() - startTime >= timeout) {
            throw new Error(`Page load timeout after ${timeout}ms`);
        }
        // Ignore load errors, page may still be usable
    }
}

/**
 * Create new tab and get its target ID
 */
async function createTab(port) {
    const client = await CDP({ port });
    try {
        const result = await client.Target.createTarget({
            url: 'about:blank'
        });
        await client.close();
        return result.targetId;
    } catch (e) {
        await client.close().catch(() => {});
        throw e;
    }
}

/**
 * Connect to a specific target
 */
async function connectToTarget(port, targetId) {
    const client = await CDP({ port, target: targetId });

    // Enable required domains
    await Promise.all([
        client.Runtime.enable(),
        client.Page.enable(),
        client.DOM.enable(),
        client.Network.enable()
    ]);

    return client;
}

/**
 * Find page target from list
 */
function findPageTarget(targets) {
    return targets.find(t =>
        t.type === 'page' &&
        !t.url.startsWith('devtools://') &&
        !t.url.startsWith('chrome-extension://')
    );
}

/**
 * Find target by URL pattern
 */
function findTargetByUrl(targets, urlPattern) {
    const pattern = typeof urlPattern === 'string'
        ? new RegExp(urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        : urlPattern;

    return targets.find(t => pattern.test(t.url || ''));
}

module.exports = {
    sleep,
    safeClose,
    executeInPage,
    waitForLoad,
    createTab,
    connectToTarget,
    findPageTarget,
    findTargetByUrl
};
