const TASK_URL_BLACKLIST = ['referandearn', 'explore', 'edge', 'install', 'app', 'purchase'];
const REWARDS_PATH_BLACKLIST = new Set(['/', '/welcome', '/pointsbreakdown', '/starbonusdistribution']);

function normalizeTaskUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl || trimmedUrl.startsWith('/')) return null;

  try {
    const parsedUrl = new URL(trimmedUrl);
    const protocol = parsedUrl.protocol.toLowerCase();
    const host = parsedUrl.hostname.toLowerCase();
    const path = (parsedUrl.pathname.replace(/\/+$/, '') || '/').toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') return null;
    if (TASK_URL_BLACKLIST.some((keyword) => parsedUrl.href.toLowerCase().includes(keyword))) return null;

    if (host === 'rewards.bing.com') {
      if (REWARDS_PATH_BLACKLIST.has(path) || path.startsWith('/dashboard')) {
        return null;
      }
    }

    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch (e) {
    return null;
  }
}

function getTaskDedupKey(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();

    if ((host === 'www.bing.com' || host === 'bing.com') && path === '/search') {
      const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
      if (query) return `${host}${path}?q=${query}`;
    }

    return `${host}${path}${parsedUrl.search}`;
  } catch (e) {
    return url;
  }
}

function isBlockedTaskUrl(url) {
  return !normalizeTaskUrl(url);
}

function scanUncompletedTasks(dashboard) {
  const uniqueUrls = new Map();
  const visited = new WeakSet();

  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isTaskIncomplete = (task) => {
    const maxProgress = toNumber(task.pointProgressMax);

    if (maxProgress !== null) {
      // Punch cards can be partially completed (for example 1/10), so progress wins.
      const currentProgress = Math.max(0, toNumber(task.pointProgress) ?? 0);
      return currentProgress < maxProgress;
    }

    if (typeof task.complete === 'boolean') {
      return task.complete === false;
    }

    if (typeof task.complete === 'string') {
      return task.complete.toLowerCase() === 'false';
    }

    // Ignore wrapper nodes that carry a URL but no completion state.
    return false;
  };

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(node, 'destinationUrl')) {
      const url = normalizeTaskUrl(node.destinationUrl);

      if (url && isTaskIncomplete(node)) {
        uniqueUrls.set(getTaskDedupKey(url), url);
      }

      // Stop here on purpose to avoid re-reading duplicated promo metadata.
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(dashboard);
  return [...uniqueUrls.values()];
}

export async function runDailyTasks() {
  log('[Daily Tasks] Starting daily task automation...');
  let totalCompleted = 0;
  let apiUrls = [];

  try {
    log('[API] Loading rewards dashboard JSON from Microsoft...');
    const apiRes = await fetch('https://rewards.bing.com/api/getuserinfo?type=1');

    if (apiRes.ok) {
      const dbData = await apiRes.json();
      const dashboard = dbData.dashboard || {};
      apiUrls = scanUncompletedTasks(dashboard);
      log(`[API] Found ${apiUrls.length} pending task URLs.`);
    }
  } catch (e) {
    log(`[API Error] ${e.message}`);
  }

  try {
    if (apiUrls.length > 0) {
      log(`[API Task] Processing ${apiUrls.length} task URLs...`);

      for (const url of apiUrls) {
        let taskTab = null;

        try {
          if (isBlockedTaskUrl(url)) continue;

          log(`[Task] Opening: ${url.substring(0, 50)}...`);
          taskTab = await createTab(url, false);
          await waitForTabLoad(taskTab.id);
          await sleep(4000);

          await injectScript(taskTab.id, () => {
            window.alert = () => {};
            window.confirm = () => false;
            window.prompt = () => null;

            const cancels = document.querySelectorAll('button[class*="cancel"], button[class*="close"]');
            cancels.forEach((button) => {
              try {
                button.click();
              } catch (e) {}
            });
          });

          await sleep(1500);
          await closeTab(taskTab.id);
          totalCompleted++;
          await sleep(2000);
        } catch (e) {
          if (taskTab) await closeTab(taskTab.id);
        }
      }

      log(`[API Task] Finished ${totalCompleted} tasks from API.`);
    } else {
      log('[API] No pending task was reported by Microsoft.');
    }

    log('[Phase 3] Checking dashboard buttons and extra views...');
    let dashTab = null;

    try {
      dashTab = await createTab('https://rewards.bing.com/', false);
      await waitForTabLoad(dashTab.id);
      await sleep(5000);

      const clickedViews = await injectScript(dashTab.id, () => {
        return (async function () {
          const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

          for (let i = 0; i < 3; i++) {
            window.scrollBy({ top: 300, behavior: 'smooth' });
            await delay(500);
          }

          window.scrollTo(0, 0);
          await delay(1000);

          let counts = 0;
          const viewBtns = document.querySelectorAll('[class*="hero"] button, [class*="hero"] a, carousel button, carousel a');

          for (const btn of viewBtns) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            const rect = btn.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0 && (txt === 'view' || txt === 'xem' || txt === 'nhan')) {
              try {
                btn.click();
                counts++;
                await delay(2000);
              } catch (e) {}
            }
          }

          return counts;
        })();
      });

      if (clickedViews > 0) {
        log(`[Dashboard] Clicked ${clickedViews} extra actions.`);
      } else {
        log('[Dashboard] No extra action was found.');
      }

      await sleep(1500);
      await closeTab(dashTab.id);
    } catch (e) {
      if (dashTab) await closeTab(dashTab.id);
    }
  } catch (error) {
    log(`[Daily Tasks Error] ${error.message}`, 'error');
  }

  log(`[Daily Tasks] Done. Total API actions processed: ${totalCompleted}`, 'success');
}
