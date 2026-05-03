export const MAX_EXTENSION_OPEN_TABS = 2;
export const MOBILE_SEARCH_WINDOW_BOUNDS = Object.freeze({
  width: 430,
  height: 930,
  left: 40,
  top: 20
});

export function buildMobileSearchWindowOptions(url) {
  return {
    url,
    type: 'normal',
    focused: true,
    width: MOBILE_SEARCH_WINDOW_BOUNDS.width,
    height: MOBILE_SEARCH_WINDOW_BOUNDS.height,
    left: MOBILE_SEARCH_WINDOW_BOUNDS.left,
    top: MOBILE_SEARCH_WINDOW_BOUNDS.top
  };
}

export function isRewardsDashboardUrl(url) {
  if (typeof url !== 'string') return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'rewards.bing.com' || hostname === 'rewards.microsoft.com';
  } catch (error) {
    return false;
  }
}

export function isRewardsDashboardTab(tab) {
  return Boolean(tab && isRewardsDashboardUrl(tab.url));
}

export function pickReusableRewardsDashboardTab(tabs = [], preferredDashboardTabId = null) {
  const rewardsTabs = tabs.filter(isRewardsDashboardTab);
  if (!rewardsTabs.length) return null;

  const preferredTab = rewardsTabs.find((tab) => tab.id === preferredDashboardTabId);
  return preferredTab || rewardsTabs[0];
}

export function planManagedTabOpen(options = {}) {
  const {
    tabs = [],
    trackedTabIds = [],
    preferredDashboardTabId = null,
    purpose = 'generic'
  } = options;
  const tracked = new Set(trackedTabIds.filter(Number.isInteger));
  const reusableDashboardTab = pickReusableRewardsDashboardTab(tabs, preferredDashboardTabId);
  const willReuseDashboardTab = purpose === 'dashboard' && reusableDashboardTab?.id;
  const targetAlreadyManaged = Boolean(reusableDashboardTab?.id && tracked.has(reusableDashboardTab.id));
  const maxTabsToKeep = Math.max(
    0,
    MAX_EXTENSION_OPEN_TABS - (willReuseDashboardTab && targetAlreadyManaged ? 0 : 1)
  );
  const keepIds = new Set();

  if (reusableDashboardTab?.id && tracked.has(reusableDashboardTab.id)) {
    keepIds.add(reusableDashboardTab.id);
  }

  const trackedTabs = tabs.filter((tab) => tracked.has(tab.id));
  for (let index = trackedTabs.length - 1; index >= 0 && keepIds.size < maxTabsToKeep; index -= 1) {
    keepIds.add(trackedTabs[index].id);
  }

  const closeTabIds = trackedTabs
    .map((tab) => tab.id)
    .filter((tabId) => !keepIds.has(tabId));

  if (willReuseDashboardTab) {
    return {
      action: 'update',
      tabId: reusableDashboardTab.id,
      closeTabIds
    };
  }

  return {
    action: 'create',
    closeTabIds
  };
}
