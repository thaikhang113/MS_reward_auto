const SEARCH_POINTS_PER_QUERY = 3;

function toCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

export function getRemainingSearchCountFromCounter(counter) {
  if (!counter) return null;
  if (counter.complete) return 0;

  const remainingPoints = Number.isFinite(counter.remaining)
    ? counter.remaining
    : (
        Number.isFinite(counter.max) && Number.isFinite(counter.progress)
          ? counter.max - counter.progress
          : null
      );

  if (!Number.isFinite(remainingPoints)) return null;
  return Math.max(0, Math.ceil(remainingPoints / SEARCH_POINTS_PER_QUERY));
}

function buildSearchBranch(configuredCount, counter, enabled = true) {
  if (!enabled) {
    return {
      count: 0,
      remaining: null,
      reason: 'disabled'
    };
  }

  const configured = toCount(configuredCount);
  if (configured <= 0) {
    return {
      count: 0,
      remaining: null,
      reason: 'disabled'
    };
  }

  const remaining = getRemainingSearchCountFromCounter(counter);
  if (remaining === 0) {
    return {
      count: 0,
      remaining,
      reason: 'complete'
    };
  }

  const count = remaining === null ? configured : Math.min(configured, remaining);
  return {
    count,
    remaining,
    reason: count > 0 ? 'remaining' : 'complete'
  };
}

export function buildAutomationPlan(config = {}, snapshot = {}) {
  const pendingTaskUrls = config.autoRunTasks === false
    ? []
    : Array.isArray(snapshot.pendingTaskUrls)
    ? snapshot.pendingTaskUrls
    : [];
  const mobile = buildSearchBranch(
    config.mobileSearchCount,
    snapshot.mobileCounter,
    Boolean(config.mobileMode)
  );
  const pc = buildSearchBranch(config.searchCount, snapshot.pcCounter, true);

  return {
    tasks: {
      count: pendingTaskUrls.length,
      urls: pendingTaskUrls
    },
    mobile,
    pc,
    totalSearches: mobile.count + pc.count,
    totalWork: pendingTaskUrls.length + mobile.count + pc.count
  };
}

export function hasAutomationWork(plan) {
  return Boolean(plan && plan.totalWork > 0);
}
