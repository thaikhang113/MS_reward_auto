import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDashboardFromPayload,
  normalizeRewardsCounter,
  parseRewardsDashboardFromHtml
} from './rewards_dashboard.js';

test('getDashboardFromPayload accepts wrapped and direct dashboard objects', () => {
  const direct = { userStatus: { availablePoints: 1572 } };
  const wrapped = { dashboard: direct };

  assert.equal(getDashboardFromPayload(wrapped), direct);
  assert.equal(getDashboardFromPayload(direct), direct);
});

test('getDashboardFromPayload rejects non-dashboard payloads so tab fallback can run', () => {
  assert.equal(getDashboardFromPayload(null), null);
  assert.equal(getDashboardFromPayload('blocked'), null);
  assert.equal(getDashboardFromPayload({ error: 'not signed in' }), null);
});

test('normalizeRewardsCounter reads Rewards API array attributes counters', () => {
  const counter = normalizeRewardsCounter('mobileSearch', [{
    attributes: {
      progress: '9',
      max: '60',
      complete: 'False'
    }
  }]);

  assert.deepEqual(counter, {
    key: 'mobileSearch',
    progress: 9,
    max: 60,
    remaining: 51,
    complete: false
  });
});

test('parseRewardsDashboardFromHtml extracts dashboard variable with counters', () => {
  const html = `
    <script>
      var dashboard = {"userStatus":{"availablePoints":2338,"counters":{"mobileSearch":[{"pointProgress":60,"pointProgressMax":60}]}}};
    </script>
  `;

  assert.deepEqual(parseRewardsDashboardFromHtml(html), {
    userStatus: {
      availablePoints: 2338,
      counters: {
        mobileSearch: [{
          pointProgress: 60,
          pointProgressMax: 60
        }]
      }
    }
  });
});
