export function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getDashboardFromPayload(payload) {
  const dashboard = payload?.dashboard || payload;

  if (!dashboard || typeof dashboard !== 'object' || Array.isArray(dashboard)) {
    return null;
  }

  if (!dashboard.userStatus || typeof dashboard.userStatus !== 'object') {
    return null;
  }

  return dashboard;
}

export function normalizeRewardsCounter(key, value) {
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== 'object') return null;

  const attributes = source.attributes && typeof source.attributes === 'object'
    ? source.attributes
    : source;

  const max = toFiniteNumber(source.pointProgressMax ?? attributes.max);
  if (!Number.isFinite(max) || max <= 0) return null;

  const progress = toFiniteNumber(source.pointProgress ?? attributes.progress);
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const completeValue = source.complete ?? attributes.complete;
  const complete = completeValue === true
    || String(completeValue).toLowerCase() === 'true'
    || safeProgress >= max;

  return {
    key,
    progress: safeProgress,
    max,
    remaining: Math.max(0, max - safeProgress),
    complete
  };
}
