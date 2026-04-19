export const REWARDS_API_URL = 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest';

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

export function hasSupportedHost(hostname) {
  return /(^|\.)bing\.com$/i.test(hostname)
    || /(^|\.)msn\.com$/i.test(hostname)
    || /(^|\.)microsoft\.com$/i.test(hostname);
}

function buildRewardsFilters(parsedUrl) {
  if (parsedUrl.searchParams.has('filters')) {
    return parsedUrl.searchParams.get('filters');
  }

  const filterTokens = [];
  const tokenSpecs = [
    ['wqoskey', 'WQOskey'],
    ['wqid', 'WQId'],
    ['btroid', 'BTROID'],
    ['btroec', 'BTROEC'],
    ['btromc', 'BTROMC']
  ];

  tokenSpecs.forEach(([paramKey, filterKey]) => {
    const rawValue = parsedUrl.searchParams.get(paramKey);
    if (!rawValue) return;

    const safeValue = String(rawValue).replace(/"/g, '\\"');
    filterTokens.push(`${filterKey}:"${safeValue}"`);
  });

  return filterTokens.length ? filterTokens.join(' ') : null;
}

export function normalizeTaskUrl(rawUrl) {
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

    parsedUrl.searchParams.delete('rnoreward');

    if (
      /(^|\.)bing\.com$/i.test(hostname)
      && /\/(search|news)/i.test(path)
      && !parsedUrl.searchParams.has('filters')
    ) {
      const filtersValue = buildRewardsFilters(parsedUrl);
      if (filtersValue) {
        parsedUrl.searchParams.set('filters', filtersValue);
      }
    }

    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch (error) {
    return null;
  }
}

export function getTaskDedupKey(url) {
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

export function isTaskIncomplete(task) {
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

export function scanUncompletedTasks(dashboard) {
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
        foundTasks.set(dedupKey, normalizedUrl);
      }
      return;
    }

    Object.values(node).forEach(visit);
  }

  visit(dashboard);
  return [...foundTasks.values()];
}

export async function fetchPendingDailyTaskUrls(fetchImpl = fetch) {
  const response = await fetchImpl(REWARDS_API_URL, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  if (!response.ok) {
    throw new Error(`Rewards API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  return scanUncompletedTasks(payload?.dashboard);
}
