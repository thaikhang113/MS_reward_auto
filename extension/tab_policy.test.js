import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EXTENSION_OPEN_TABS,
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
