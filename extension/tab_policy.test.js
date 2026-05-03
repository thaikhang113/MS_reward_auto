import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOBILE_SEARCH_WINDOW_BOUNDS,
  MAX_EXTENSION_OPEN_TABS,
  buildMobileSearchWindowOptions,
  isRewardsDashboardTab,
  pickReusableRewardsDashboardTab,
  planManagedTabOpen
} from './tab_policy.js';

test('isRewardsDashboardTab only matches Rewards hosts', () => {
  assert.equal(isRewardsDashboardTab({ url: 'https://rewards.bing.com/' }), true);
  assert.equal(isRewardsDashboardTab({ url: 'https://rewards.microsoft.com/earn' }), true);
  assert.equal(isRewardsDashboardTab({ url: 'https://www.bing.com/search?q=x' }), false);
  assert.equal(isRewardsDashboardTab({ url: 'chrome://extensions' }), false);
});

test('pickReusableRewardsDashboardTab prefers the tracked Rewards tab', () => {
  const tabs = [
    { id: 1, url: 'https://rewards.bing.com/' },
    { id: 2, url: 'https://rewards.microsoft.com/earn' }
  ];

  assert.equal(pickReusableRewardsDashboardTab(tabs, 2)?.id, 2);
  assert.equal(pickReusableRewardsDashboardTab(tabs, 99)?.id, 1);
});

test('planManagedTabOpen reuses Rewards tabs and caps extension-created tabs', () => {
  const tabs = [
    { id: 10, url: 'https://rewards.bing.com/' },
    { id: 11, url: 'https://www.bing.com/search?q=a' },
    { id: 12, url: 'https://www.bing.com/search?q=b' },
    { id: 13, url: 'https://www.bing.com/search?q=c' }
  ];

  assert.deepEqual(
    planManagedTabOpen({
      tabs,
      trackedTabIds: [10, 11, 12, 13],
      preferredDashboardTabId: 10,
      purpose: 'dashboard',
      url: 'https://rewards.bing.com/'
    }),
    { action: 'update', tabId: 10, closeTabIds: [11, 12] }
  );

  assert.equal(MAX_EXTENSION_OPEN_TABS, 2);
});

test('planManagedTabOpen preserves recovery dashboard before creating a new tab', () => {
  const tabs = [
    { id: 10, url: 'https://rewards.bing.com/' },
    { id: 11, url: 'https://www.bing.com/search?q=a' },
    { id: 12, url: 'https://www.bing.com/search?q=b' }
  ];

  assert.deepEqual(
    planManagedTabOpen({
      tabs,
      trackedTabIds: [10, 11, 12],
      preferredDashboardTabId: 10,
      purpose: 'generic',
      url: 'https://www.bing.com/'
    }),
    { action: 'create', closeTabIds: [11, 12] }
  );
});

test('buildMobileSearchWindowOptions creates a focused mobile-sized Edge window', () => {
  assert.deepEqual(
    buildMobileSearchWindowOptions('https://www.bing.com/'),
    {
      url: 'https://www.bing.com/',
      type: 'normal',
      focused: true,
      width: MOBILE_SEARCH_WINDOW_BOUNDS.width,
      height: MOBILE_SEARCH_WINDOW_BOUNDS.height,
      left: MOBILE_SEARCH_WINDOW_BOUNDS.left,
      top: MOBILE_SEARCH_WINDOW_BOUNDS.top
    }
  );
  assert.deepEqual(MOBILE_SEARCH_WINDOW_BOUNDS, {
    width: 430,
    height: 930,
    left: 40,
    top: 20
  });
});
