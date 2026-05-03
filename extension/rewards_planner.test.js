import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutomationPlan,
  getRemainingSearchCountFromCounter,
  hasAutomationWork
} from './rewards_planner.js';

test('automation planner skips completed mobile and schedules remaining pc searches plus tasks', () => {
  const plan = buildAutomationPlan(
    {
      mobileMode: true,
      mobileSearchCount: 30,
      searchCount: 30
    },
    {
      mobileCounter: {
        key: 'mobileSearch',
        progress: 60,
        max: 60,
        remaining: 0,
        complete: true
      },
      pcCounter: {
        key: 'pcSearch',
        progress: 30,
        max: 90,
        remaining: 60,
        complete: false
      },
      pendingTaskUrls: ['https://www.bing.com/search?q=reward']
    }
  );

  assert.equal(plan.mobile.count, 0);
  assert.equal(plan.mobile.reason, 'complete');
  assert.equal(plan.pc.count, 20);
  assert.equal(plan.tasks.count, 1);
  assert.equal(hasAutomationWork(plan), true);
});

test('remaining search count converts Rewards remaining points to search count', () => {
  assert.equal(getRemainingSearchCountFromCounter({
    key: 'mobileSearch',
    progress: 39,
    max: 60,
    remaining: 21,
    complete: false
  }), 7);
});

test('automation planner reports no work when counters and tasks are complete', () => {
  const plan = buildAutomationPlan(
    {
      mobileMode: true,
      mobileSearchCount: 30,
      searchCount: 30
    },
    {
      mobileCounter: { key: 'mobileSearch', progress: 60, max: 60, remaining: 0, complete: true },
      pcCounter: { key: 'pcSearch', progress: 90, max: 90, remaining: 0, complete: true },
      pendingTaskUrls: []
    }
  );

  assert.equal(hasAutomationWork(plan), false);
});

test('automation planner can disable dashboard tasks while keeping search workers', () => {
  const plan = buildAutomationPlan(
    {
      autoRunTasks: false,
      mobileMode: false,
      searchCount: 30
    },
    {
      pcCounter: { key: 'pcSearch', progress: 0, max: 90, remaining: 90, complete: false },
      pendingTaskUrls: ['https://www.bing.com/search?q=reward']
    }
  );

  assert.equal(plan.tasks.count, 0);
  assert.equal(plan.pc.count, 30);
  assert.equal(hasAutomationWork(plan), true);
});

test('automation planner does not run searches blindly when counters are missing', () => {
  const plan = buildAutomationPlan(
    {
      mobileMode: true,
      mobileSearchCount: 30,
      searchCount: 30
    },
    {
      pendingTaskUrls: []
    }
  );

  assert.equal(plan.mobile.count, 0);
  assert.equal(plan.mobile.reason, 'no_counter');
  assert.equal(plan.pc.count, 0);
  assert.equal(plan.pc.reason, 'no_counter');
  assert.equal(hasAutomationWork(plan), false);
});
