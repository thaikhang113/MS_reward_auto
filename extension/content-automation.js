(function installRewardsAutomationApi() {
  const VERSION = '5.2.0';

  if (window.__BRA__ && window.__BRA__.version === VERSION) {
    return;
  }

  const MOBILE_PROFILE = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    platform: 'Android',
    vendor: 'Google Inc.',
    maxTouchPoints: 5,
    screen: {
      width: 412,
      height: 915,
      availWidth: 412,
      availHeight: 915
    },
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '131' },
        { brand: 'Google Chrome', version: '131' }
      ],
      mobile: true,
      platform: 'Android'
    }
  };
  const REWARDS_API_URL = 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest';

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function randomInt(min, max) {
    const safeMin = Math.ceil(min);
    const safeMax = Math.floor(max);
    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
  }

  const DISMISS_TEXT_RE = /close|dismiss|not now|no thanks|skip|maybe later|got it|ok(?:ay)?|accept|agree|continue to site|continue without|stay on page|hide/i;
  const BLOCKING_TEXT_RE = /cookie|consent|survey|edge|install|app|popup|pop-up|modal|overlay|dialog|newsletter|subscribe|sign in|signin|prompt|tip|offer/i;
  const TASK_ACTION_TEXT_RE = /(start|play|claim|view|continue|check.?in|quiz|poll|read|click|earn|get points|try now|join now|see more|learn more|vote|answer|next|submit)/i;
  const TASK_START_TEXT_RE = /(start|play|continue|next|begin|resume|take quiz|take poll|show options|answer now)/i;
  const TASK_QUIZ_TEXT_RE = /\bquiz\b|trivia|question\s*\d+|answer and earn|correct answer|select one answer|true or false/i;
  const TASK_POLL_TEXT_RE = /\bpoll\b|vote|your opinion|which would you choose|pick one|cast your vote/i;
  const TASK_COMPLETE_TEXT_RE = /congratulations|great job|well done|thanks for playing|you.?re done|all done|completed|come back tomorrow|points added|earned points|keep exploring/i;
  const TASK_START_SELECTORS = [
    '#rqStartQuiz',
    '[id*="rqStartQuiz" i]',
    '[id*="startQuiz" i]',
    '[data-bi-id*="start" i]',
    '.wk_button',
    'button[class*="quiz" i]',
    'button[class*="poll" i]'
  ];
  const TASK_OPTION_SELECTORS = [
    '[id^="rqAnswerOption"]',
    '[id^="btoption"]',
    '[id^="quizAnswerOption"]',
    '.b_cards [id^="rqAnswerOption"]',
    '.b_cards [id^="btoption"]',
    '.b_cards button',
    '.b_cards [role="button"]',
    '.b_cards a',
    '[class*="quiz" i] button',
    '[class*="quiz" i] [role="button"]',
    '[class*="poll" i] button',
    '[class*="poll" i] [role="button"]',
    '.wk_button',
    '[data-option]'
  ];
  const TASK_PROGRESS_SELECTORS = [
    'button[id*="next" i]',
    'button[id*="continue" i]',
    'button[id*="submit" i]',
    'button[class*="next" i]',
    'button[class*="continue" i]',
    'button[class*="submit" i]',
    '[role="button"][id*="next" i]',
    '[role="button"][id*="continue" i]',
    '[role="button"][id*="submit" i]'
  ];

  function nativeSetValue(element, value) {
    if (!element) return;

    const prototype = Object.getPrototypeOf(element);
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function fireInput(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function createMediaQueryList(matches, media) {
    return {
      matches,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return true;
      }
    };
  }

  function overrideGetter(target, propertyName, getter) {
    try {
      Object.defineProperty(target, propertyName, {
        configurable: true,
        get: getter
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  function overrideValue(target, propertyName, value) {
    return overrideGetter(target, propertyName, () => value);
  }

  function patchMatchMedia() {
    if (window.__BRA_MATCH_MEDIA_PATCHED__) return;
    window.__BRA_MATCH_MEDIA_PATCHED__ = true;

    const originalMatchMedia = typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null;

    window.matchMedia = function matchMedia(query) {
      if (typeof query === 'string') {
        if (/pointer\s*:\s*coarse/i.test(query) || /any-pointer\s*:\s*coarse/i.test(query)) {
          return createMediaQueryList(true, query);
        }

        if (/hover\s*:\s*none/i.test(query) || /any-hover\s*:\s*none/i.test(query)) {
          return createMediaQueryList(true, query);
        }

        const maxWidth = query.match(/max-width\s*:\s*(\d+)px/i);
        if (maxWidth) {
          return createMediaQueryList(MOBILE_PROFILE.screen.width <= Number(maxWidth[1]), query);
        }

        const minWidth = query.match(/min-width\s*:\s*(\d+)px/i);
        if (minWidth) {
          return createMediaQueryList(MOBILE_PROFILE.screen.width >= Number(minWidth[1]), query);
        }
      }

      return originalMatchMedia ? originalMatchMedia(query) : createMediaQueryList(false, query);
    };
  }

  function collectEnvironmentSnapshot(options = {}) {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    const userAgentData = navigator.userAgentData || null;
    const coarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const touch = Boolean('ontouchstart' in window) || Number(navigator.maxTouchPoints || 0) > 0;

    const snapshot = {
      url: window.location.href,
      width,
      height,
      userAgent: navigator.userAgent,
      signals: {
        uaMobile: /android|iphone|mobile|mobi/i.test(navigator.userAgent || ''),
        uaDataMobile: Boolean(userAgentData && userAgentData.mobile),
        touch,
        coarsePointer,
        mobileViewport: width <= 920 || coarsePointer
      },
      searchInputFound: Boolean(findSearchInput()),
      mobileExpected: Boolean(options.mobileExpected)
    };

    snapshot.summary = [
      `ua=${snapshot.signals.uaMobile ? 'mobile' : 'desktop'}`,
      `uaData=${snapshot.signals.uaDataMobile ? 'mobile' : 'desktop'}`,
      `touch=${snapshot.signals.touch ? 'yes' : 'no'}`,
      `viewport=${snapshot.signals.mobileViewport ? 'mobile' : 'desktop'}`
    ].join(', ');

    return snapshot;
  }

  function applyMobileProfile() {
    if (window.__BRA_MOBILE_PATCHED__) {
      return collectEnvironmentSnapshot({ mobileExpected: true });
    }

    window.__BRA_MOBILE_PATCHED__ = true;
    const navigatorPrototype = Object.getPrototypeOf(navigator);

    overrideValue(navigator, 'userAgent', MOBILE_PROFILE.userAgent)
      || overrideValue(navigatorPrototype, 'userAgent', MOBILE_PROFILE.userAgent);
    overrideValue(navigator, 'platform', MOBILE_PROFILE.platform)
      || overrideValue(navigatorPrototype, 'platform', MOBILE_PROFILE.platform);
    overrideValue(navigator, 'vendor', MOBILE_PROFILE.vendor)
      || overrideValue(navigatorPrototype, 'vendor', MOBILE_PROFILE.vendor);
    overrideValue(navigator, 'maxTouchPoints', MOBILE_PROFILE.maxTouchPoints)
      || overrideValue(navigatorPrototype, 'maxTouchPoints', MOBILE_PROFILE.maxTouchPoints);
    overrideValue(navigator, 'webdriver', false)
      || overrideValue(navigatorPrototype, 'webdriver', false);

    const userAgentData = {
      ...MOBILE_PROFILE.userAgentData,
      async getHighEntropyValues(hints = []) {
        const values = {
          architecture: 'arm',
          bitness: '64',
          mobile: true,
          model: 'SM-S928B',
          platform: 'Android',
          platformVersion: '14.0.0',
          uaFullVersion: '131.0.0.0'
        };

        return hints.reduce((result, hint) => {
          if (Object.prototype.hasOwnProperty.call(values, hint)) {
            result[hint] = values[hint];
          }
          return result;
        }, {});
      }
    };

    overrideValue(navigator, 'userAgentData', userAgentData)
      || overrideValue(navigatorPrototype, 'userAgentData', userAgentData);
    overrideValue(window, 'orientation', 0);
    overrideValue(window, 'ontouchstart', null);
    overrideValue(screen, 'width', MOBILE_PROFILE.screen.width);
    overrideValue(screen, 'height', MOBILE_PROFILE.screen.height);
    overrideValue(screen, 'availWidth', MOBILE_PROFILE.screen.availWidth);
    overrideValue(screen, 'availHeight', MOBILE_PROFILE.screen.availHeight);

    patchMatchMedia();

    document.documentElement.setAttribute('data-bra-mobile', 'true');
    document.documentElement.classList.add('bra-mobile-profile');
    document.documentElement.style.touchAction = 'manipulation';
    if (document.body) {
      document.body.style.touchAction = 'manipulation';
    }

    return collectEnvironmentSnapshot({ mobileExpected: true });
  }

  function findSearchInput() {
    const selectors = [
      '#sb_form_q',
      'form[role="search"] textarea[name="q"]',
      'form[role="search"] input[name="q"]',
      'textarea[name="q"]',
      'input[name="q"]',
      'textarea[id*="sb_form_q"]',
      'input[id*="sb_form_q"]',
      'textarea.b_searchbox',
      'input.b_searchbox',
      '[data-appns="SERP"] textarea[name="q"]',
      '[data-appns="SERP"] input[name="q"]',
      '[aria-label*="Search" i]',
      '[aria-label*="search" i]',
      'input[type="search"]',
      '[enterkeyhint="search"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  async function prepareEnvironment(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    await sleep(randomInt(120, 240));
    return collectEnvironmentSnapshot({ mobileExpected: options.mobile });
  }

  async function revealSearchInput() {
    let input = findSearchInput();
    if (input) return input;

    const triggers = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element) => {
        const label = [
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.textContent
        ].join(' ').trim();

        return /search|tim kiem|magnify/i.test(label);
      })
      .slice(0, 5);

    for (const trigger of triggers) {
      try {
        trigger.click();
        await sleep(400);
        input = findSearchInput();
        if (input) return input;
      } catch (error) {}
    }

    return findSearchInput();
  }

  async function humanTypeString(element, text, speed = 'medium') {
    let minDelay;
    let maxDelay;

    switch (speed) {
      case 'slow':
        minDelay = 200;
        maxDelay = 400;
        break;
      case 'fast':
        minDelay = 40;
        maxDelay = 100;
        break;
      default:
        minDelay = 100;
        maxDelay = 250;
        break;
    }

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const currentValue = element.value || '';

      if (Math.random() < 0.1 && index > 0 && character !== ' ') {
        const typo = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        element.dispatchEvent(new KeyboardEvent('keydown', { key: typo, bubbles: true }));
        nativeSetValue(element, currentValue + typo);
        fireInput(element);
        element.dispatchEvent(new KeyboardEvent('keyup', { key: typo, bubbles: true }));
        await sleep(randomInt(minDelay, maxDelay));

        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
        nativeSetValue(element, currentValue);
        fireInput(element);
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
        await sleep(randomInt(150, 350));
      }

      element.dispatchEvent(new KeyboardEvent('keydown', { key: character, bubbles: true }));
      nativeSetValue(element, currentValue + character);
      fireInput(element);
      element.dispatchEvent(new KeyboardEvent('keyup', { key: character, bubbles: true }));

      let delay = randomInt(minDelay, maxDelay);
      if (character === ' ') delay += randomInt(30, 80);
      if (Math.random() < 0.05) delay += randomInt(50, 150);
      await sleep(delay);
    }
  }

  function buildSearchNavigationUrl(keyword) {
    const url = new URL('/search', window.location.origin || 'https://www.bing.com');
    url.searchParams.set('q', keyword);
    return url.toString();
  }

  function isSearchResultsPage(keyword) {
    try {
      const url = new URL(window.location.href);
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const expected = String(keyword || '').trim().toLowerCase();
      return /\/search/i.test(url.pathname) && (!expected || query === expected);
    } catch (error) {
      return Boolean(document.querySelector('#b_results, main [data-bm]'));
    }
  }

  async function waitForSearchNavigation(keyword, startedUrl) {
    const deadline = Date.now() + 3500;

    while (Date.now() < deadline) {
      if (window.location.href !== startedUrl && isSearchResultsPage(keyword)) {
        return true;
      }

      if (isSearchResultsPage(keyword)) {
        return true;
      }

      await sleep(180);
    }

    return false;
  }

  function dispatchEnterSearch(searchInput) {
    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };

    searchInput.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    searchInput.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  function submitSearch(searchInput) {
    const form = searchInput.closest('form') || document.getElementById('sb_form');
    const submitButton = form?.querySelector('button[type="submit"], input[type="submit"], [aria-label*="Search" i]');

    dispatchEnterSearch(searchInput);

    if (submitButton) {
      submitButton.click();
    }

    if (form?.requestSubmit) {
      try {
        form.requestSubmit();
      } catch (error) {}
    } else if (form) {
      try {
        form.submit();
      } catch (error) {}
    }

    dispatchEnterSearch(searchInput);
  }

  async function typeAndSearch(keyword, options = {}) {
    const startedUrl = window.location.href;
    window.scrollTo(0, 0);

    if (options.mobile) {
      applyMobileProfile();
    }

    await sleep(randomInt(250, 500));
    dismissBlockingUi();

    const searchInput = options.mobile ? await revealSearchInput() : findSearchInput();

    if (!searchInput) {
      if (options.mobile) {
        window.setTimeout(() => window.location.assign(buildSearchNavigationUrl(keyword)), 180);
        return { success: true, fallback: 'scheduled_url_navigation' };
      }

      return { success: false, error: 'no_input' };
    }

    searchInput.scrollIntoView({ behavior: 'auto', block: 'center' });
    await sleep(randomInt(350, 700));
    searchInput.focus();
    searchInput.click();
    await sleep(randomInt(200, 400));

    nativeSetValue(searchInput, '');
    fireInput(searchInput);
    await sleep(randomInt(80, 180));

    await humanTypeString(searchInput, keyword, options.mobile ? 'fast' : 'medium');
    await sleep(randomInt(600, 1500));

    if (options.mobile) {
      window.setTimeout(() => submitSearch(searchInput), 180);
      return { success: true, submitted: true, scheduled: true };
    }

    submitSearch(searchInput);

    if (!await waitForSearchNavigation(keyword, startedUrl)) {
      window.location.assign(buildSearchNavigationUrl(keyword));
      return { success: true, fallback: 'forced_url_navigation' };
    }

    return { success: true, submitted: true };
  }

  async function runVisibleScrollSequence(options = {}) {
    const mobile = Boolean(options.mobile);
    const minBaseStep = mobile ? 130 : 90;
    const maxBaseStep = mobile ? 360 : 260;
    const sequenceLength = options.steps || randomInt(mobile ? 7 : 5, mobile ? 12 : 8);
    const scrollPlan = [];

    for (let index = 0; index < sequenceLength; index += 1) {
      let direction = 1;
      if (index > 1 && Math.random() < (mobile ? 0.45 : 0.35)) {
        direction = -1;
      }

      if (index > 3 && Math.random() < 0.25) {
        direction = 1;
      }

      scrollPlan.push(direction * randomInt(minBaseStep, maxBaseStep));
    }

    for (const delta of scrollPlan) {
      window.scrollBy({
        top: delta,
        behavior: 'smooth'
      });

      await sleep(randomInt(mobile ? 650 : 500, mobile ? 1350 : 1000));

      if (Math.random() < 0.5) {
        window.scrollBy({
          top: randomInt(-45, 45),
          behavior: 'auto'
        });
      }

      if (Math.random() < 0.55) {
        dismissBlockingUi();
      }

      await sleep(randomInt(mobile ? 350 : 250, mobile ? 950 : 700));
    }

    return scrollPlan.length;
  }

  function scoreSearchResultAnchor(anchor) {
    if (!/^https?:/i.test(anchor.href || '')) return 0;

    const label = getElementText(anchor);
    if (/^(all|search|videos|images|maps|copilot|skip to content|accessibility feedback)$/i.test(label)) return 0;

    try {
      const url = new URL(anchor.href);
      const host = url.hostname.replace(/^www\./i, '');
      const bingHost = /(^|\.)bing\.com$/i.test(host);
      const isBingTrackingUrl = bingHost && /\/(?:ck\/a|aclick)/i.test(url.pathname);
      if (/rewards\.bing\.com|login\.live\.com|account\.microsoft\.com/i.test(url.hostname)) return 0;
      if (bingHost && !isBingTrackingUrl) return 0;
      if (!label && !isBingTrackingUrl) return 0;

      let score = 1;
      if (!bingHost) score += 5;
      if (isBingTrackingUrl) score += 8;
      if (url.searchParams.has('u')) score += 3;
      if (isInteractableElement(anchor)) score += 2;
      if (label.length >= 12) score += 2;
      if (/^\d+$/.test(label)) score -= 4;
      if (anchor.closest('#b_results, .b_algo, article, main')) score += 1;
      if (anchor.closest('#b_results .b_algo h2, #b_results .b_algo, [data-bm], article')) score += 2;
      return Math.max(0, score);
    } catch (error) {
      return 0;
    }
  }

  function findSearchResultAnchor() {
    const anchors = Array.from(document.querySelectorAll('#b_results .b_algo h2 a[href], #b_results h2 a[href], #b_results .b_algo a[href], #b_results a[href], main a[href], article a[href], a[href*="/ck/a"][href*="u="]'));
    const candidates = anchors
      .map((anchor) => ({ anchor, score: scoreSearchResultAnchor(anchor) }))
      .filter((candidate) => candidate.score > 0);

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.anchor || null;
  }

  function countSearchResultCandidates() {
    return Array.from(document.querySelectorAll('#b_results .b_algo h2 a[href], #b_results h2 a[href], #b_results .b_algo a[href], #b_results a[href], main a[href], article a[href], a[href*="/ck/a"][href*="u="]'))
      .filter((anchor) => scoreSearchResultAnchor(anchor) > 0)
      .length;
  }

  async function browseDestinationPage(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    dismissBlockingUi();
    await sleep(randomInt(options.mobile ? 1600 : 1000, options.mobile ? 2600 : 1800));

    const steps = await runVisibleScrollSequence({
      mobile: Boolean(options.mobile),
      steps: randomInt(options.mobile ? 8 : 5, options.mobile ? 13 : 8)
    });

    dismissBlockingUi();
    return {
      success: true,
      mobile: Boolean(options.mobile),
      steps,
      url: window.location.href
    };
  }

  async function enhancedSearchInteraction(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    dismissBlockingUi();
    await sleep(randomInt(options.mobile ? 1400 : 900, options.mobile ? 2400 : 1700));

    const steps = await runVisibleScrollSequence({
      mobile: Boolean(options.mobile),
      steps: randomInt(options.mobile ? 7 : 5, options.mobile ? 12 : 8)
    });

    const resultAnchors = Array.from(document.querySelectorAll('#b_results a[href], main a[href], article a[href]'))
      .filter((element) => /^https?:/i.test(element.href || ''))
      .slice(0, options.mobile ? 4 : 6);

    if (resultAnchors.length > 0) {
      const visitCount = Math.min(resultAnchors.length, randomInt(1, options.mobile ? 3 : 4));
      for (let index = 0; index < visitCount; index += 1) {
        const anchor = resultAnchors[index];
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomInt(options.mobile ? 700 : 600, options.mobile ? 1500 : 1300));

        if (Math.random() < 0.55) {
          window.scrollBy({
            top: randomInt(-80, 120),
            behavior: 'smooth'
          });
          await sleep(randomInt(350, 900));
        }

        if (Math.random() < 0.4) {
          dismissBlockingUi();
        }
      }
    }

    if (Math.random() > 0.3) {
      window.scrollBy({
        top: -randomInt(options.mobile ? 120 : 90, options.mobile ? 260 : 220),
        behavior: 'smooth'
      });
      await sleep(randomInt(options.mobile ? 750 : 650, options.mobile ? 1500 : 1200));
    }

    let openedResult = false;
    let resultUrl = null;
    let resultCandidateCount = 0;
    if (options.mobile) {
      resultCandidateCount = countSearchResultCandidates();
      const anchor = findSearchResultAnchor();
      if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomInt(900, 1700));
        resultUrl = anchor.href;
        window.setTimeout(() => window.location.assign(anchor.href), 120);
        openedResult = true;
      }
    }

    dismissBlockingUi();
    return {
      success: true,
      mobile: Boolean(options.mobile),
      steps,
      openedResult,
      resultUrl,
      resultCandidateCount
    };
  }

  async function scrapePoints() {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(REWARDS_API_URL, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      window.clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const points = data?.dashboard?.userStatus?.availablePoints;
        if (typeof points === 'number') return points;
      }
    } catch (error) {}

    const selectors = [
      '.text-title1.font-semibold',
      'mee-rewards-user-status-balance',
      '#balanceToolTip',
      '.pointsValue',
      '[class*="balance"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const matches = (element.innerText || element.textContent || '')
        .match(/(\d{1,3}(?:[,.\s]\d{3})+|\d+)/g);

      if (!matches) continue;

      const numbers = matches
        .map((value) => parseInt(value.replace(/[,.\s]/g, ''), 10))
        .filter((value) => !Number.isNaN(value) && value >= 0 && value < 1000000)
        .sort((left, right) => right - left);

      for (const value of numbers) {
        if (value >= 100) return value;
      }
    }

    return null;
  }

  function isVisibleElement(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 24 && rect.height > 24;
  }

  function isInteractableElement(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
      return false;
    }

    return true;
  }

  function getElementText(element) {
    return [
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
      element?.getAttribute?.('data-testid'),
      element?.textContent
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLargeBlockingContainer(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 180 || rect.height < 80) return false;

    const style = window.getComputedStyle(element);
    const text = getElementText(element);
    const fixedLike = /fixed|sticky|absolute/i.test(style.position || '');
    const highZ = parseInt(style.zIndex || '0', 10);
    const overlayLike = fixedLike && (highZ >= 20 || rect.width >= window.innerWidth * 0.6 || rect.height >= window.innerHeight * 0.25);

    return overlayLike || BLOCKING_TEXT_RE.test(text);
  }

  function hideBlockingElement(element) {
    if (!element) return false;

    try {
      element.setAttribute('data-bra-dismissed', 'true');
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('visibility', 'hidden', 'important');
      element.style.setProperty('pointer-events', 'none', 'important');
      element.style.setProperty('opacity', '0', 'important');
      return true;
    } catch (error) {
      return false;
    }
  }

  function dismissBlockingUi() {
    const closeSelectors = [
      '[data-dismiss]',
      '[data-action*="close" i]',
      '[aria-label*="close" i]',
      '[aria-label*="dismiss" i]',
      '[title*="close" i]',
      '[title*="dismiss" i]',
      'button[aria-label="Close"]',
      'button[aria-label="Dismiss"]',
      'button[id*="close" i]',
      'button[class*="close" i]',
      '[role="button"][class*="close" i]'
    ];
    const containerSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="overlay" i]',
      '[class*="modal" i]',
      '[class*="popup" i]',
      '[class*="backdrop" i]',
      '[class*="cookie" i]',
      '[class*="consent" i]',
      '.b_overlay'
    ];
    const clicked = new Set();
    const hidden = new Set();

    closeSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!isInteractableElement(element)) return;
        const label = getElementText(element);
        if (label && !DISMISS_TEXT_RE.test(label) && !/close|dismiss/i.test(selector)) return;

        try {
          element.click();
          clicked.add(element);
        } catch (error) {}
      });
    });

    const clickableElements = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
    clickableElements.forEach((element) => {
      if (!isInteractableElement(element)) return;
      const label = getElementText(element);
      if (!label || !DISMISS_TEXT_RE.test(label)) return;
      if (!element.closest('[role="dialog"], [aria-modal="true"], [class*="overlay" i], [class*="modal" i], [class*="popup" i], [class*="cookie" i], [class*="consent" i]')) {
        return;
      }

      try {
        element.click();
        clicked.add(element);
      } catch (error) {}
    });

    containerSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!isLargeBlockingContainer(element)) return;
        if (hideBlockingElement(element)) {
          hidden.add(element);
        }
      });
    });

    Array.from(document.querySelectorAll('div, aside, section')).forEach((element) => {
      if (!isLargeBlockingContainer(element)) return;
      if (hideBlockingElement(element)) {
        hidden.add(element);
      }
    });

    [document.documentElement, document.body].forEach((element) => {
      if (!element) return;
      try {
        element.style.removeProperty('overflow');
        element.style.removeProperty('position');
      } catch (error) {}
    });

    return {
      clicked: clicked.size,
      hidden: hidden.size
    };
  }

  function dedupeElements(elements) {
    const seen = new Set();
    const unique = [];

    elements.forEach((element) => {
      if (!element || seen.has(element)) return;
      seen.add(element);
      unique.push(element);
    });

    return unique;
  }

  function getTaskTextSnapshot() {
    return (document.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  }

  function getTaskElementKey(element) {
    if (!element) return '';

    const text = getElementText(element)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 120);

    return [
      element.id || '',
      element.getAttribute?.('data-option') || '',
      element.getAttribute?.('data-bi-id') || '',
      text
    ].join('|');
  }

  function collectTaskActionCandidates() {
    return dedupeElements([
      ...Array.from(document.querySelectorAll('a[href], button, [role="button"]')),
      ...TASK_START_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    ])
      .filter((element) => isInteractableElement(element))
      .filter((element) => !element.closest('header, nav, footer'));
  }

  function findTaskStartButtons() {
    const selectorMatches = TASK_START_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const genericMatches = collectTaskActionCandidates().filter((element) => TASK_START_TEXT_RE.test(getElementText(element)));

    return dedupeElements([...selectorMatches, ...genericMatches])
      .filter((element) => isVisibleElement(element))
      .slice(0, 8);
  }

  function findTaskAnswerOptions() {
    const selectorMatches = TASK_OPTION_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const cardMatches = Array.from(document.querySelectorAll('.b_cards > *, [class*="rq" i], [class*="quiz" i] > *, [class*="poll" i] > *'))
      .filter((element) => element.matches?.('button, a, [role="button"], div, article, li'));

    return dedupeElements([...selectorMatches, ...cardMatches])
      .filter((element) => isInteractableElement(element))
      .filter((element) => !element.closest('header, nav, footer'))
      .filter((element) => {
        const key = getTaskElementKey(element);
        return key && key !== '|||';
      })
      .slice(0, 12);
  }

  function findTaskProgressButtons() {
    const selectorMatches = TASK_PROGRESS_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const genericMatches = collectTaskActionCandidates().filter((element) => {
      const label = getElementText(element);
      return /continue|next|submit|done|see results|show answer|finish/i.test(label);
    });

    return dedupeElements([...selectorMatches, ...genericMatches])
      .filter((element) => isVisibleElement(element))
      .slice(0, 8);
  }

  function detectTaskInteractionMode() {
    const pageText = getTaskTextSnapshot();
    const options = findTaskAnswerOptions();
    const optionIds = options.map((element) => element.id || '');
    const hasRewardsQuizIds = optionIds.some((id) => /^rqAnswerOption/i.test(id));
    const hasRewardsPollIds = optionIds.some((id) => /^btoption/i.test(id));
    const hasRewardsStartSelector = Boolean(document.querySelector('#rqStartQuiz, [id*="rqStartQuiz" i], [id*="startQuiz" i]'));
    const hasQuizContainer = Boolean(document.querySelector('.b_cards, [id*="quiz" i], [class*="quiz" i]'));
    const hasPollContainer = Boolean(document.querySelector('[id*="poll" i], [class*="poll" i], [id^="btoption"]'));
    const hasWkButton = Boolean(document.querySelector('.wk_button'));

    if (hasRewardsPollIds || (hasPollContainer && TASK_POLL_TEXT_RE.test(pageText) && options.length >= 2)) {
      return { mode: 'poll', options, pageText };
    }

    if (
      hasRewardsQuizIds
      || ((hasRewardsStartSelector || hasQuizContainer || hasWkButton) && (TASK_QUIZ_TEXT_RE.test(pageText) || options.length >= 2))
    ) {
      return { mode: 'quiz', options, pageText };
    }

    return { mode: 'standard', options, pageText };
  }

  function isTaskCompleted() {
    const completionSelectors = [
      '[class*="complete" i]',
      '[class*="completed" i]',
      '[data-stage="complete"]',
      '[data-state="complete"]'
    ];

    if (completionSelectors.some((selector) => document.querySelector(selector))) {
      return true;
    }

    const pageText = getTaskTextSnapshot();
    return TASK_COMPLETE_TEXT_RE.test(pageText) && findTaskAnswerOptions().length === 0;
  }

  async function clickTaskElement(element) {
    if (!element) return false;

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(randomInt(280, 520));

      const rect = element.getBoundingClientRect();
      const clientX = rect.left + Math.max(5, Math.min(rect.width - 5, rect.width / 2));
      const clientY = rect.top + Math.max(5, Math.min(rect.height - 5, rect.height / 2));
      const mouseOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY
      };

      element.dispatchEvent(new MouseEvent('mouseover', mouseOptions));
      element.dispatchEvent(new MouseEvent('mousemove', mouseOptions));
      element.dispatchEvent(new MouseEvent('mousedown', mouseOptions));
      element.dispatchEvent(new MouseEvent('mouseup', mouseOptions));
      element.click();

      await sleep(randomInt(180, 360));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function maybeStartTaskInteraction(result) {
    const startButtons = findTaskStartButtons();

    for (const button of startButtons) {
      const label = getElementText(button);
      if (!TASK_START_TEXT_RE.test(label)) continue;

      if (await clickTaskElement(button)) {
        result.started = true;
        result.clicked.push(label.substring(0, 80));
        dismissBlockingUi();
        await sleep(randomInt(900, 1500));
        return true;
      }
    }

    return false;
  }

  async function maybeAdvanceTaskInteraction(result) {
    const progressButtons = findTaskProgressButtons();

    for (const button of progressButtons) {
      const label = getElementText(button);
      if (!/continue|next|submit|done|see results|show answer|finish/i.test(label)) continue;

      if (await clickTaskElement(button)) {
        result.clicked.push(label.substring(0, 80));
        dismissBlockingUi();
        await sleep(randomInt(900, 1400));
        return true;
      }
    }

    return false;
  }

  async function solveTaskPoll(result) {
    const options = findTaskAnswerOptions();
    if (!options.length) return false;

    const choice = options[randomInt(0, options.length - 1)];
    const label = getElementText(choice);
    const clicked = await clickTaskElement(choice);

    if (!clicked) return false;

    result.answersClicked += 1;
    result.clicked.push(label.substring(0, 80));
    dismissBlockingUi();
    await sleep(randomInt(1400, 2200));
    await maybeAdvanceTaskInteraction(result);
    return true;
  }

  async function solveTaskQuiz(result) {
    let lastSignature = '';
    let triedForSignature = new Set();
    let idleLoops = 0;

    for (let step = 0; step < 12; step += 1) {
      dismissBlockingUi();

      if (isTaskCompleted()) {
        return true;
      }

      const started = await maybeStartTaskInteraction(result);
      if (started) {
        idleLoops = 0;
      }

      const options = findTaskAnswerOptions();
      if (!options.length) {
        const advanced = await maybeAdvanceTaskInteraction(result);
        if (advanced) {
          idleLoops = 0;
          continue;
        }

        idleLoops += 1;
        if (idleLoops >= 2) {
          break;
        }

        await sleep(randomInt(1000, 1600));
        continue;
      }

      const signature = options.map((element) => getTaskElementKey(element)).join('||');
      if (signature !== lastSignature) {
        lastSignature = signature;
        triedForSignature = new Set();
      }

      const nextOption = options.find((element) => !triedForSignature.has(getTaskElementKey(element)))
        || options[randomInt(0, options.length - 1)];
      const optionKey = getTaskElementKey(nextOption);
      const label = getElementText(nextOption);

      triedForSignature.add(optionKey);

      if (!await clickTaskElement(nextOption)) {
        idleLoops += 1;
        if (idleLoops >= 3) break;
        continue;
      }

      result.answersClicked += 1;
      result.clicked.push(label.substring(0, 80));
      dismissBlockingUi();
      await sleep(randomInt(1200, 2200));
      await maybeAdvanceTaskInteraction(result);
      await sleep(randomInt(900, 1500));

      const updatedSignature = findTaskAnswerOptions().map((element) => getTaskElementKey(element)).join('||');
      idleLoops = updatedSignature && updatedSignature === signature ? idleLoops + 1 : 0;

      if (isTaskCompleted()) {
        return true;
      }

      if (idleLoops >= 3) {
        break;
      }
    }

    return result.answersClicked > 0;
  }

  async function performStandardTaskInteraction(result) {
    const candidates = collectTaskActionCandidates().slice(0, 60);

    for (const element of candidates) {
      const label = getElementText(element);
      if (!label || !TASK_ACTION_TEXT_RE.test(label)) continue;

      if (await clickTaskElement(element)) {
        result.clicked.push(label.substring(0, 80));
        dismissBlockingUi();
        await sleep(randomInt(1200, 2000));
        if (result.clicked.length >= 2) break;
      }
    }

    const scrollSteps = randomInt(3, 5);
    for (let index = 0; index < scrollSteps; index += 1) {
      window.scrollBy({
        top: randomInt(180, 420),
        behavior: 'smooth'
      });
      await sleep(randomInt(500, 900));
      dismissBlockingUi();
    }

    if (Math.random() > 0.4) {
      window.scrollBy({
        top: -randomInt(90, 180),
        behavior: 'smooth'
      });
      await sleep(randomInt(400, 700));
    }

    return result.clicked.length > 0;
  }

  async function runTaskPageInteraction(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    const result = {
      success: true,
      mode: 'standard',
      clicked: [],
      answersClicked: 0,
      started: false,
      completed: false
    };
    const createRetryableResult = (stage, extra = {}) => ({
      ...result,
      ...extra,
      success: false,
      retryable: true,
      error: stage,
      stage
    });
    const NEWS_FLOW_KEY = '__BRA_NEWS_FLOW__';
    const supportedInternalHostRe = /(^|\.)bing\.com$|(^|\.)msn\.com$|(^|\.)microsoft\.com$/i;
    const clampCoordinate = (value, min, max) => Math.min(Math.max(value, min), max);
    const getViewportSize = () => ({
      width: Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280),
      height: Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720)
    });
    const ensureVisiblePageState = () => {
      if (window.__BRA_VISIBILITY_PATCHED__) {
        return;
      }

      window.__BRA_VISIBILITY_PATCHED__ = true;
      const documentPrototype = Object.getPrototypeOf(document);

      overrideValue(document, 'visibilityState', 'visible')
        || overrideValue(documentPrototype, 'visibilityState', 'visible');
      overrideValue(document, 'hidden', false)
        || overrideValue(documentPrototype, 'hidden', false);
      overrideValue(document, 'webkitHidden', false)
        || overrideValue(documentPrototype, 'webkitHidden', false);
      overrideGetter(document, 'hasFocus', () => () => true)
        || overrideGetter(documentPrototype, 'hasFocus', () => () => true);
    };
    const getNewsFlowState = () => {
      try {
        const raw = window.sessionStorage.getItem(NEWS_FLOW_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    };
    const setNewsFlowState = (nextState) => {
      try {
        window.sessionStorage.setItem(NEWS_FLOW_KEY, JSON.stringify(nextState));
      } catch (error) {}
    };
    const clearNewsFlowState = () => {
      try {
        window.sessionStorage.removeItem(NEWS_FLOW_KEY);
      } catch (error) {}
    };
    const dispatchDocumentMouseDown = (clientX, clientY) => {
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY
      };

      document.dispatchEvent(new MouseEvent('mousedown', eventInit));
      document.dispatchEvent(new MouseEvent('mouseup', eventInit));
    };
    const dispatchMouseMove = (clientX, clientY) => {
      const target = document.elementFromPoint(clientX, clientY) || document.body || document.documentElement;
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY
      };

      document.dispatchEvent(new MouseEvent('mousemove', eventInit));
      target.dispatchEvent(new MouseEvent('mousemove', eventInit));
      target.dispatchEvent(new MouseEvent('mouseover', eventInit));
    };
    const performHumanMousePass = async (steps = randomInt(5, 9)) => {
      const viewport = getViewportSize();

      for (let index = 0; index < steps; index += 1) {
        const clientX = clampCoordinate(randomInt(24, viewport.width - 24), 0, viewport.width - 1);
        const clientY = clampCoordinate(randomInt(24, viewport.height - 24), 0, viewport.height - 1);
        dispatchMouseMove(clientX, clientY);
        if (Math.random() < 0.35) {
          dispatchDocumentMouseDown(clientX, clientY);
        }
        await sleep(randomInt(120, 280));
      }
    };
    const moveMouseToElement = async (element, steps = randomInt(2, 4)) => {
      if (!element || !isVisibleElement(element)) {
        return false;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(randomInt(500, 900));

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      const viewport = getViewportSize();
      for (let index = 0; index < steps; index += 1) {
        const clientX = clampCoordinate(
          Math.round(rect.left + randomInt(8, Math.max(8, Math.round(rect.width) - 8))),
          0,
          viewport.width - 1
        );
        const clientY = clampCoordinate(
          Math.round(rect.top + randomInt(8, Math.max(8, Math.round(rect.height) - 8))),
          0,
          viewport.height - 1
        );
        dispatchMouseMove(clientX, clientY);
        if (Math.random() < 0.45) {
          dispatchDocumentMouseDown(clientX, clientY);
        }
        await sleep(randomInt(180, 360));
      }

      return true;
    };
    const performHumanScrollPass = async () => {
      const scrollPattern = [
        { distance: 400, pauseMin: 1800, pauseMax: 2200 },
        { distance: 600, pauseMin: 1300, pauseMax: 1700 },
        { distance: 320, pauseMin: 1100, pauseMax: 1500 }
      ];

      for (const step of scrollPattern) {
        window.scrollBy({
          top: step.distance,
          behavior: 'smooth'
        });
        await sleep(randomInt(step.pauseMin, step.pauseMax));
        dismissBlockingUi();
      }

      window.scrollBy({
        top: -randomInt(120, 240),
        behavior: 'smooth'
      });
      await sleep(randomInt(900, 1500));
      dismissBlockingUi();
    };
    const performNewsArticleReadPass = async () => {
      const articleTarget = Math.max(
        Math.floor((document.documentElement.scrollHeight - window.innerHeight) * 0.5),
        0
      );

      while (window.scrollY < articleTarget) {
        const remaining = articleTarget - window.scrollY;
        const scrollStep = remaining > 700 ? 600 : (remaining > 450 ? 400 : remaining);
        window.scrollBy({
          top: scrollStep,
          behavior: 'smooth'
        });
        if (Math.random() < 0.5) {
          const viewport = getViewportSize();
          dispatchDocumentMouseDown(
            clampCoordinate(randomInt(24, viewport.width - 24), 0, viewport.width - 1),
            clampCoordinate(randomInt(24, viewport.height - 24), 0, viewport.height - 1)
          );
        }
        await sleep(scrollStep >= 600 ? randomInt(1400, 1700) : randomInt(1800, 2200));
      }
    };
    const isInternalInteractionTarget = (element) => {
      if (!element || !isVisibleElement(element) || !isInteractableElement(element)) {
        return false;
      }

      if (element.closest('header, nav, footer')) {
        return false;
      }

      if (element.tagName === 'A') {
        const href = element.href || '';
        if (!/^https?:/i.test(href)) return false;

        try {
          const parsedUrl = new URL(href);
          return supportedInternalHostRe.test(parsedUrl.hostname);
        } catch (error) {
          return false;
        }
      }

      return true;
    };
    const getNewsCandidates = () => dedupeElements(
      [
        'div[data-author] a[href]',
        'div[data-author]',
        '.news-card a[href]',
        '.news-card',
        'h3 a[href]',
        'article a[href]',
        'article',
        'a[href][class*="title" i]',
        'a[href][class*="headline" i]',
        '[data-testid*="title" i] a[href]',
        'main a[href]'
      ].flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    )
      .map((element) => element.matches?.('a[href]') ? element : (element.querySelector?.('a[href]') || element))
      .filter((element) => isInternalInteractionTarget(element));
    const clickNewsStory = async () => {
      const flowState = getNewsFlowState();
      const candidates = getNewsCandidates()
        .sort(() => Math.random() - 0.5);
      const isListingPage = candidates.length >= 2;

      if (!isListingPage && flowState?.visited?.length) {
        await performHumanMousePass(randomInt(4, 6));
        await performNewsArticleReadPass();

        if (flowState.visited.length < 2 && window.history.length > 1 && !flowState.returnedOnce) {
          setNewsFlowState({
            ...flowState,
            stage: 'returning',
            returnedOnce: true
          });
          window.history.back();
          await sleep(250);
          return createRetryableResult('news_returning_to_listing');
        } else {
          clearNewsFlowState();
        }

        result.completed = true;
        return true;
      }

      const selectors = [
        'div[data-author] a[href]',
        '.news-card a[href]',
        'h3 a[href]',
        'article a[href]'
      ];
      const hoverCandidates = dedupeElements(
        selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      )
        .filter((element) => isInternalInteractionTarget(element))
        .sort(() => Math.random() - 0.5);
      const hoverTargets = hoverCandidates.slice(0, randomInt(3, Math.min(4, Math.max(3, hoverCandidates.length))));
      for (const target of hoverTargets) {
        await moveMouseToElement(target, randomInt(2, 3));
        await sleep(randomInt(450, 900));
      }

      const visited = new Set(flowState?.visited || []);
      const choice = candidates.find((candidate) => !visited.has(candidate.href)) || candidates[0];
      if (!choice) {
        return false;
      }

      const beforeUrl = window.location.href;
      const label = getElementText(choice) || choice.href || 'news_item';
      const nextVisited = [...visited, choice.href];
      await moveMouseToElement(choice, randomInt(2, 4));
      const rect = choice.getBoundingClientRect();
      dispatchDocumentMouseDown(
        clampCoordinate(Math.round(rect.left + Math.max(10, rect.width / 2)), 0, getViewportSize().width - 1),
        clampCoordinate(Math.round(rect.top + Math.max(10, rect.height / 2)), 0, getViewportSize().height - 1)
      );
      const clicked = await clickTaskElement(choice);
      if (!clicked) {
        return false;
      }

      setNewsFlowState({
        stage: 'opened',
        visited: nextVisited,
        returnedOnce: Boolean(flowState?.returnedOnce)
      });
      result.clicked.push(label.substring(0, 80));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(500);
        if (window.location.href !== beforeUrl || document.readyState === 'complete') {
          break;
        }
      }

      if (window.location.href === beforeUrl && choice.href && choice.href !== beforeUrl) {
        window.location.assign(choice.href);
        await sleep(250);
      }

      return createRetryableResult('news_opened_article');
    };
    const clickRandomInternalAction = async () => {
      const candidates = dedupeElements([
        ...Array.from(document.querySelectorAll('a[href], button, [role="button"]')),
        ...collectTaskActionCandidates()
      ])
        .filter((element) => isInternalInteractionTarget(element))
        .sort(() => Math.random() - 0.5);
      const interactionLimit = randomInt(1, 2);
      let interactions = 0;

      for (const candidate of candidates) {
        const label = getElementText(candidate);
        if (!label && candidate.tagName !== 'A') continue;

        await moveMouseToElement(candidate, randomInt(2, 3));
        const clicked = await clickTaskElement(candidate);
        if (!clicked) continue;

        interactions += 1;
        result.clicked.push((label || candidate.href || 'internal_action').substring(0, 80));
        dismissBlockingUi();
        await sleep(randomInt(1300, 2400));

        if (interactions >= interactionLimit) {
          return true;
        }
      }

      return interactions > 0;
    };

    dismissBlockingUi();
    await sleep(randomInt(700, 1200));
    ensureVisiblePageState();

    // Anti-detection: them dau vet chuot, mousedown va hover de trang nhan duoc session tuong tac day hon.
    await performHumanMousePass();
    // Anti-detection: cuon theo kieu giat cuc, xuong tung nhom doan ngan roi keo len mot chut nhu nguoi dang doc.
    await performHumanScrollPass();
    await performHumanMousePass(randomInt(4, 7));

    const detection = detectTaskInteractionMode();
    result.mode = detection.mode;

    if (detection.mode === 'poll') {
      await maybeStartTaskInteraction(result);
      const solved = await solveTaskPoll(result);
      result.completed = solved || isTaskCompleted();
      return result;
    }

    if (detection.mode === 'quiz') {
      const solved = await solveTaskQuiz(result);
      result.completed = solved || isTaskCompleted();
      return result;
    }

    if (/news/i.test(window.location.href)) {
      result.mode = 'news';
      const newsOutcome = await clickNewsStory();
      if (newsOutcome && typeof newsOutcome === 'object' && newsOutcome.retryable) {
        return newsOutcome;
      }
      if (!newsOutcome) {
        await clickRandomInternalAction();
      }
      result.completed = newsOutcome || isTaskCompleted();
      return result;
    }

    const interacted = await clickRandomInternalAction();
    if (!interacted) {
      await performStandardTaskInteraction(result);
    }

    result.completed = interacted || isTaskCompleted();
    return result;
  }

  async function openDashboardTaskLink(targetUrl, options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    const normalizeMatchKey = (rawUrl) => {
      try {
        const parsedUrl = new URL(rawUrl);
        parsedUrl.searchParams.delete('rnoreward');
        parsedUrl.hash = '';

        const hostname = parsedUrl.hostname.toLowerCase();
        const path = parsedUrl.pathname.replace(/\/+$/, '').toLowerCase() || '/';

        if (/(\.|^)bing\.com$/i.test(hostname) && path === '/search') {
          const query = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
          if (query) {
            const rewardsOfferId = [
              parsedUrl.searchParams.get('form'),
              parsedUrl.searchParams.get('ocid'),
              parsedUrl.searchParams.get('filters')
            ]
              .filter(Boolean)
              .join('|')
              .toLowerCase();

            if (rewardsOfferId) {
              return `${hostname}${path}?q=${query}::${rewardsOfferId}`;
            }

            return `${hostname}${path}?q=${query}`;
          }
        }

        return `${hostname}${path}?${[...parsedUrl.searchParams.entries()]
          .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
            leftKey === rightKey
              ? leftValue.localeCompare(rightValue)
              : leftKey.localeCompare(rightKey)
          ))
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&')}`;
      } catch (error) {
        return String(rawUrl || '').trim().toLowerCase();
      }
    };

    const targetKey = normalizeMatchKey(targetUrl);
    const targetHref = String(targetUrl || '').trim();
    if (!targetKey || !targetHref) {
      return { success: false, error: 'missing_target_url' };
    }

    const findMatchingLink = () => Array.from(document.querySelectorAll('a[href]'))
      .find((link) => normalizeMatchKey(link.href) === targetKey || link.href === targetHref);

    let link = findMatchingLink();
    let scans = 0;

    while (!link && scans < 12) {
      window.scrollBy({ top: randomInt(360, 720), behavior: 'smooth' });
      await sleep(randomInt(550, 900));
      link = findMatchingLink();
      scans += 1;
    }

    if (!link) {
      return { success: false, error: 'task_link_not_found', targetKey };
    }

    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(randomInt(650, 1100));

    link.setAttribute('target', '_self');

    try {
      const rect = link.getBoundingClientRect();
      const clientX = rect.left + Math.max(5, Math.min(rect.width - 5, rect.width / 2));
      const clientY = rect.top + Math.max(5, Math.min(rect.height - 5, rect.height / 2));
      const mouseOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY
      };

      link.dispatchEvent(new MouseEvent('mouseover', mouseOptions));
      link.dispatchEvent(new MouseEvent('mousemove', mouseOptions));
      link.dispatchEvent(new MouseEvent('mousedown', mouseOptions));
      link.dispatchEvent(new MouseEvent('mouseup', mouseOptions));
      link.click();
    } catch (error) {
      return { success: false, error: 'task_link_click_failed', targetKey };
    }

    return {
      success: true,
      clicked: true,
      href: link.href,
      text: getElementText(link).substring(0, 140),
      targetKey
    };
  }

  async function collectDashboardTaskLinks(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    const pagePath = window.location.pathname.toLowerCase();
    const scanScope = options.scope
      || (pagePath.startsWith('/dashboard') ? 'daily' : (pagePath.startsWith('/earn/quest/') ? 'quest' : 'earn'));
    const taskLinkSelectors = [
      'mee-rewards-daily-set-item-content a[href]',
      '.ds-card-sec a[href]',
      '.b_cards a[href]',
      'a[href][target="_blank"][class*="cursor-pointer"]',
      'a[href*="bing.com"]',
      'a[href*="rewards.bing.com"]',
      'a[href*="rewards.microsoft.com"]',
      'a[href*="microsoft.com"]',
      'a[href*="msn.com"]',
      'a[href*="RewardsDO"]',
      'a[href*="OCID="]',
      'a[href*="PUBL="]',
      'a[href*="/search?"]',
      'a[href*="quiz"]',
      'a[href*="poll"]'
    ];
    const taskCardSelectors = [
      'mee-rewards-daily-set-item-content',
      '.ds-card-sec',
      '.b_cards',
      'mee-card',
      'article',
      'section',
      'li',
      '[role="listitem"]',
      '[class*="activity" i]',
      '[class*="offer" i]',
      '[class*="card" i]',
      '[class*="punch" i]',
      '[class*="daily" i]',
      '[class*="set" i]'
    ];
    const seen = new Set();
    const visitedCards = new WeakSet();
    const tasks = [];
    let cardsVisited = 0;
    const canDismissBlockingUi = !/rewards\.bing\.com$/i.test(window.location.hostname);
    const pageScanText = getTaskTextSnapshot();

    const hasRewardsTrackingParams = (href) => /[?&](form|ocid|publ|crea)=/i.test(href || '');
    const isSupportedTaskLink = (href) => /^https?:/i.test(href || '')
      && (/bing\.com|rewards\.bing\.com|microsoft\.com|msn\.com/i.test(href || '') || hasRewardsTrackingParams(href));

    const findTaskCard = (element) => {
      if (element?.matches?.('a[href]')) {
        return element;
      }

      for (const selector of taskCardSelectors) {
        const card = element.closest?.(selector);
        if (card) return card;
      }

      return element.closest?.('a, div, article, section, li') || element;
    };

    const parseTaskRatio = (text) => {
      const matches = [...String(text || '').matchAll(/(\d+)\s*\/\s*(\d+)\s*tasks?/gi)];
      if (!matches.length) return null;

      const [, rawCurrent, rawMax] = matches[matches.length - 1];
      const max = Number(rawMax);
      let current = Number(rawCurrent);

      if (Number.isFinite(current) && Number.isFinite(max) && current > max && rawCurrent.length > rawMax.length) {
        current = Number(rawCurrent.slice(-rawMax.length));
      }

      return Number.isFinite(current) && Number.isFinite(max)
        ? { current, max }
        : null;
    };

    const isCompletedTaskCard = (node) => {
      const card = findTaskCard(node);
      const text = getElementText(card);

      if (
        /completed|\bdone\b|hoan thanh|da hoan thanh|daily set completed/i.test(text)
        && !/\bin progress\b|\+\s*\d+|\b0\s*\/\s*\d+\b/i.test(text)
      ) {
        return true;
      }

      const taskRatio = parseTaskRatio(text);
      if (taskRatio) {
        return taskRatio.current >= taskRatio.max;
      }

      return Boolean(card?.querySelector?.(
        '.sw-checkmark, .completed, [class*="checkmark"], [class*="completed"], [class*="done"], [data-icon-name*="check" i], svg[aria-label*="check" i], svg[aria-label*="completed" i]'
      ));
    };

    const isLikelyEarnTaskLink = (href, link, card) => {
      const text = getElementText(card || link);
      const combined = `${href} ${text}`;

      if (/microsoft\.com\/edge|referandearn|\/redeem\//i.test(href)) return false;

      if (scanScope === 'daily') {
        return /bing\.com\/search/i.test(href)
          && /[?&]q=/i.test(href)
          && /(\+\s*\d+|DailySet|BTDSUOID|dsetqu|tgrew|REWARDSQUIZ_DailySet)/i.test(combined);
      }

      if (scanScope === 'quest') {
        if (/rewards\.bing\.com\/earn(?:$|[?#])/i.test(href)) return false;
        if (/rewards\.microsoft\.com\/dashboard\//i.test(href) && /(activate|click to complete|start here)/i.test(combined)) return true;
        if (/ML2XME/i.test(href) && /desktop\s*\(([1-9]\d*)\s*\/\s*\d+\s*days complete\)/i.test(pageScanText)) return false;
        if (/ML2XMF/i.test(href) && /mobile\s*\(([1-9]\d*)\s*\/\s*\d+\s*days complete\)/i.test(pageScanText)) return false;
        if (/bing\.com\/search/i.test(href) && /[?&]q=/i.test(href) && /(click to complete|start searching|follow|discover|explore|get|search to complete|RewardsDO|OCID|PUBL)/i.test(combined)) return true;
        if (hasRewardsTrackingParams(href) && /(click to complete|visit|start|follow|discover|explore|learn|watch|RewardsDO|OCID|PUBL)/i.test(combined)) return true;
        return false;
      }

      if (/rewards\.bing\.com\/earn\/quest\//i.test(href)) return true;
      if (/bing\.com\/search/i.test(href) && /[?&]q=/i.test(href) && /(\+\s*\d+|points?|quiz|poll|trivia|challenge|discover|unlock|learn)/i.test(combined)) return true;
      if (/bing\.com\/images\/create/i.test(href) && /(\+\s*\d+|points?|RewardsDO|OCID|PUBL)/i.test(combined)) return true;
      if (/aka\.ms\//i.test(href) && /(\+\s*\d+|points?)/i.test(combined)) return true;
      if (/microsoft\.com|msn\.com/i.test(href) && /(\+\s*\d+|points?|RewardsDO|OCID|PUBL|learn|read|watch)/i.test(combined)) return true;

      return false;
    };

    const collectTaskLinksInDocument = () => {
      if (scanScope === 'earn') {
        document.querySelectorAll('a[href*="/earn/quest/"]').forEach((link) => {
          if (!isVisibleElement(link)) return;

          const text = getElementText(link);
          const taskRatio = parseTaskRatio(text);
          if (taskRatio && taskRatio.current >= taskRatio.max) return;

          let sanitizedHref = link.href || '';
          try {
            const parsedUrl = new URL(sanitizedHref);
            parsedUrl.searchParams.delete('rnoreward');
            parsedUrl.hash = '';
            sanitizedHref = parsedUrl.toString();
          } catch (error) {
            return;
          }

          if (seen.has(sanitizedHref)) return;

          seen.add(sanitizedHref);
          tasks.push({
            url: sanitizedHref,
            text: text.substring(0, 140),
            sourceUrl: window.location.href,
            sourceType: scanScope
          });
        });
      }

      taskLinkSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((link) => {
          if (!isVisibleElement(link)) return;
          if (link.closest?.('header, nav, footer')) return;

          let sanitizedHref = link.href || '';
          if (!sanitizedHref) return;

          try {
            const parsedUrl = new URL(sanitizedHref);
            parsedUrl.searchParams.delete('rnoreward');
            parsedUrl.hash = '';
            sanitizedHref = parsedUrl.toString();
          } catch (error) {
            return;
          }

          if (!isSupportedTaskLink(sanitizedHref)) return;

          const card = findTaskCard(link);
          if (!isLikelyEarnTaskLink(sanitizedHref, link, card)) return;
          if (isCompletedTaskCard(card) || isCompletedTaskCard(link)) return;

          const dedupKey = sanitizedHref;
          if (seen.has(dedupKey)) return;

          seen.add(dedupKey);
          tasks.push({
            url: dedupKey,
            text: getElementText(card || link).substring(0, 140),
            sourceUrl: window.location.href,
            sourceType: scanScope,
            mobile: /ML2XMF/i.test(dedupKey)
          });
        });
      });
    };

    const getVisibleCards = () => dedupeElements(
      taskCardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    )
      .filter((card) => isVisibleElement(card))
      .filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .filter((card) => card.querySelector?.('a[href]'));

    if (canDismissBlockingUi) dismissBlockingUi();
    await sleep(randomInt(700, 1200));
    window.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(randomInt(500, 900));
    collectTaskLinksInDocument();

    let safetyCounter = 0;

    while (safetyCounter < 30) {
      const visibleCards = getVisibleCards();

      for (const card of visibleCards) {
        if (visitedCards.has(card)) continue;
        visitedCards.add(card);
        cardsVisited += 1;

        // Anti-ban: dừng 1-2 giây trên từng card để mô phỏng người dùng đang đọc nhiệm vụ trước khi thu thập link.
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(randomInt(1000, 2000));

        if (Math.random() < 0.65) {
          window.scrollBy({
            top: randomInt(-70, 130),
            behavior: 'smooth'
          });
          await sleep(randomInt(300, 650));
        }

        if (canDismissBlockingUi) dismissBlockingUi();
        collectTaskLinksInDocument();
      }

      const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY >= maxScrollTop - 20) {
        break;
      }

      // Anti-ban: cuộn theo từng đoạn ngắn thay vì nhảy thẳng xuống cuối trang để kích hoạt lazy-load tự nhiên hơn.
      const nextTop = Math.min(maxScrollTop, window.scrollY + randomInt(360, 720));
      window.scrollTo({
        top: nextTop,
        behavior: 'smooth'
      });
      await sleep(randomInt(900, 1600));
      if (canDismissBlockingUi) dismissBlockingUi();
      collectTaskLinksInDocument();
      safetyCounter += 1;
    }

    if (tasks.length > 0 && Math.random() > 0.35) {
      window.scrollBy({
        top: -randomInt(180, 340),
        behavior: 'smooth'
      });
      await sleep(randomInt(800, 1400));
      collectTaskLinksInDocument();
    }

    return {
      tasks,
      cardsVisited,
      sourceType: scanScope,
      sourceUrl: window.location.href
    };
  }

  window.__BRA__ = {
    version: VERSION,
    applyMobileProfile,
    browseDestinationPage,
    collectDashboardTaskLinks,
    collectEnvironmentSnapshot,
    dismissBlockingUi,
    enhancedSearchInteraction,
    findSearchInput,
    getEnvironmentSnapshot: collectEnvironmentSnapshot,
    humanTypeString,
    openDashboardTaskLink,
    prepareEnvironment,
    randomInt,
    runTaskPageInteraction,
    scrapePoints,
    sleep,
    typeAndSearch
  };
})();
