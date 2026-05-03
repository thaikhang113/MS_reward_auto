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

function extractBalancedObjectLiteral(text, startIndex) {
  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;
  let objectStart = -1;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') {
      if (objectStart === -1) objectStart = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        return text.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

export function parseRewardsDashboardFromHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return null;

  const patterns = [
    /(?:var|let|const)\s+dashboard\s*=/gi,
    /"dashboard"\s*:\s*/gi
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(html);
    while (match) {
      const literal = extractBalancedObjectLiteral(html, pattern.lastIndex);
      if (literal) {
        try {
          const parsed = JSON.parse(literal);
          const dashboard = getDashboardFromPayload(parsed);
          if (dashboard) return dashboard;
        } catch (error) {}
      }

      match = pattern.exec(html);
    }
  }

  return null;
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
