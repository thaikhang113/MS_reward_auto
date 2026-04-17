(function initDailyTaskHelpers(globalScope) {
  const TASK_URL_BLACKLIST = [
    'referandearn',
    'edge',
    'install',
    'purchase',
    'giftcards',
    'redeem',
    'signin'
  ];

  const REWARDS_PATH_BLACKLIST = new Set([
    '/',
    '/welcome',
    '/dashboard',
    '/dashboard/',
    '/pointsbreakdown',
    '/starbonusdistribution'
  ]);

  function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function hasSupportedHost(hostname) {
    return /(^|\.)bing\.com$/i.test(hostname)
      || /(^|\.)msn\.com$/i.test(hostname)
      || /(^|\.)microsoft\.com$/i.test(hostname);
  }

  function normalizeTaskUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return null;

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl || trimmedUrl.startsWith('/')) return null;

    try {
      const parsedUrl = new URL(trimmedUrl);
      const protocol = parsedUrl.protocol.toLowerCase();
      const hostname = parsedUrl.hostname.toLowerCase();
      const path = (parsedUrl.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      const href = parsedUrl.href.toLowerCase();

      if (protocol !== 'http:' && protocol !== 'https:') return null;
      if (!hasSupportedHost(hostname)) return null;
      if (TASK_URL_BLACKLIST.some((keyword) => href.includes(keyword))) return null;

      if ((hostname === 'rewards.bing.com' || hostname.endsWith('.rewards.bing.com'))
        && (REWARDS_PATH_BLACKLIST.has(path) || path.startsWith('/dashboard'))) {
        return null;
      }

      parsedUrl.hash = '';
      return parsedUrl.toString();
    } catch (error) {
      return null;
    }
  }

  function getTaskDedupKey(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const path = parsedUrl.pathname.toLowerCase();

      if ((hostname === 'www.bing.com' || hostname === 'bing.com') && path === '/search') {
        const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        if (query) {
          return `${hostname}${path}?q=${query}`;
        }
      }

      return `${hostname}${path}${parsedUrl.search}`;
    } catch (error) {
      return String(url || '');
    }
  }

  function isTaskIncomplete(task) {
    const maxProgress = toFiniteNumber(task?.pointProgressMax);
    if (maxProgress !== null) {
      const currentProgress = Math.max(0, toFiniteNumber(task?.pointProgress) ?? 0);
      return currentProgress < maxProgress;
    }

    if (typeof task?.complete === 'boolean') {
      return task.complete === false;
    }

    if (typeof task?.complete === 'string') {
      return task.complete.toLowerCase() === 'false';
    }

    return false;
  }

  function scanUncompletedTasks(dashboard) {
    const foundTasks = new Map();
    const visited = new WeakSet();

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (visited.has(node)) return;
      visited.add(node);

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      if (Object.prototype.hasOwnProperty.call(node, 'destinationUrl')) {
        const normalizedUrl = normalizeTaskUrl(node.destinationUrl);
        if (normalizedUrl && isTaskIncomplete(node)) {
          const dedupKey = getTaskDedupKey(normalizedUrl);
          foundTasks.set(dedupKey, {
            url: normalizedUrl,
            dedupKey,
            pointProgress: toFiniteNumber(node.pointProgress),
            pointProgressMax: toFiniteNumber(node.pointProgressMax),
            complete: node.complete
          });
        }
        return;
      }

      Object.values(node).forEach(visit);
    }

    visit(dashboard);
    return [...foundTasks.values()];
  }

  globalScope.DAILY_TASKS_HELPERS = Object.freeze({
    TASK_URL_BLACKLIST: [...TASK_URL_BLACKLIST],
    REWARDS_PATH_BLACKLIST: [...REWARDS_PATH_BLACKLIST],
    getTaskDedupKey,
    hasSupportedHost,
    isTaskIncomplete,
    isSupportedTaskUrl(url) {
      try {
        const parsedUrl = new URL(url);
        return hasSupportedHost(parsedUrl.hostname.toLowerCase());
      } catch (error) {
        return false;
      }
    },
    normalizeTaskUrl,
    scanUncompletedTasks,
    toFiniteNumber
  });
})(self);
