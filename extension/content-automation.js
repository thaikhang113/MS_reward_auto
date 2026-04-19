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

  function submitSearch(searchInput, options = {}) {
    const form = searchInput.closest('form') || document.getElementById('sb_form');
    const submitButton = form?.querySelector('button[type="submit"], input[type="submit"], [aria-label*="Search" i]');

    if (options.mobile && submitButton) {
      submitButton.click();
      return;
    }

    if (form?.requestSubmit) {
      form.requestSubmit();
      return;
    }

    if (form) {
      form.submit();
      return;
    }

    searchInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    }));
  }

  async function typeAndSearch(keyword, options = {}) {
    window.scrollTo(0, 0);

    if (options.mobile) {
      applyMobileProfile();
    }

    await sleep(randomInt(250, 500));
    dismissBlockingUi();

    const searchInput = options.mobile ? await revealSearchInput() : findSearchInput();

    if (!searchInput) {
      if (options.mobile) {
        const directUrl = new URL('/search', window.location.origin);
        directUrl.searchParams.set('q', keyword);
        window.location.href = directUrl.toString();
        return { success: true, fallback: 'url_navigation' };
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

    submitSearch(searchInput, options);
    return { success: true };
  }

  async function enhancedSearchInteraction(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    const scrollPlan = [];
    const maxBaseStep = options.mobile ? 320 : 260;
    const minBaseStep = options.mobile ? 110 : 90;
    const sequenceLength = randomInt(options.mobile ? 6 : 5, options.mobile ? 10 : 8);

    dismissBlockingUi();
    await sleep(randomInt(options.mobile ? 1400 : 900, options.mobile ? 2400 : 1700));

    for (let index = 0; index < sequenceLength; index += 1) {
      let direction = 1;
      if (index > 1 && Math.random() < 0.35) {
        direction = -1;
      }

      if (index > 3 && Math.random() < 0.2) {
        direction = 1;
      }

      scrollPlan.push(direction * randomInt(minBaseStep, maxBaseStep));
    }

    for (const delta of scrollPlan) {
      window.scrollBy({
        top: delta,
        behavior: 'smooth'
      });

      await sleep(randomInt(options.mobile ? 550 : 500, options.mobile ? 1200 : 1000));

      if (Math.random() < 0.45) {
        window.scrollBy({
          top: randomInt(-35, 35),
          behavior: 'auto'
        });
      }

      if (Math.random() < 0.5) {
        dismissBlockingUi();
      }

      await sleep(randomInt(options.mobile ? 300 : 250, options.mobile ? 850 : 700));
    }

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

    dismissBlockingUi();
    return {
      success: true,
      mobile: Boolean(options.mobile),
      steps: scrollPlan.length
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
    const supportedInternalHostRe = /(^|\.)bing\.com$|(^|\.)msn\.com$|(^|\.)microsoft\.com$/i;
    const clampCoordinate = (value, min, max) => Math.min(Math.max(value, min), max);
    const getViewportSize = () => ({
      width: Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280),
      height: Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720)
    });
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
        await sleep(randomInt(120, 280));
      }
    };
    const performHumanScrollPass = async () => {
      const downSteps = randomInt(3, 5);

      for (let index = 0; index < downSteps; index += 1) {
        window.scrollBy({
          top: randomInt(140, 320),
          behavior: 'smooth'
        });
        await sleep(randomInt(700, 1300));
        dismissBlockingUi();
      }

      window.scrollBy({
        top: -randomInt(90, 220),
        behavior: 'smooth'
      });
      await sleep(randomInt(900, 1500));
      dismissBlockingUi();
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
    const clickNewsStory = async () => {
      const selectors = [
        'h3 a[href]',
        'article a[href]',
        'a[href][class*="title" i]',
        'a[href][class*="headline" i]',
        '[data-testid*="title" i] a[href]',
        'main a[href]'
      ];
      const candidates = dedupeElements(
        selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      )
        .filter((element) => isInternalInteractionTarget(element))
        .sort(() => Math.random() - 0.5);

      const choice = candidates[0];
      if (!choice) {
        return false;
      }

      const label = getElementText(choice) || choice.href || 'news_item';
      const clicked = await clickTaskElement(choice);
      if (!clicked) {
        return false;
      }

      result.clicked.push(label.substring(0, 80));
      await sleep(randomInt(1800, 3200));
      return true;
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

    // Anti-detection: them cac dau vet chuot nho de trang co nhieu su kien nhu mot phien doc that.
    await performHumanMousePass();
    // Anti-detection: cuon xuong cham roi keo len mot chut nhu nguoi dang doc noi dung.
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
      const openedNews = await clickNewsStory();
      if (!openedNews) {
        await clickRandomInternalAction();
      }
      result.completed = openedNews || isTaskCompleted();
      return result;
    }

    const interacted = await clickRandomInternalAction();
    if (!interacted) {
      await performStandardTaskInteraction(result);
    }

    result.completed = interacted || isTaskCompleted();
    return result;
  }

  async function collectDashboardTaskLinks(options = {}) {
    if (options.mobile) {
      applyMobileProfile();
    }

    const taskLinkSelectors = [
      'mee-rewards-daily-set-item-content a[href]',
      '.ds-card-sec a[href]',
      '.b_cards a[href]',
      'a[href][target="_blank"][class*="cursor-pointer"]',
      'a[href*="bing.com"]',
      'a[href*="rewards.bing.com"]',
      'a[href*="microsoft.com"]',
      'a[href*="msn.com"]',
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

    const isSupportedTaskLink = (href) => /^https?:/i.test(href || '')
      && /bing\.com|rewards\.bing\.com|microsoft\.com|msn\.com/i.test(href || '');

    const findTaskCard = (element) => {
      for (const selector of taskCardSelectors) {
        const card = element.closest?.(selector);
        if (card) return card;
      }

      return element.closest?.('a, div, article, section, li') || element;
    };

    const isCompletedTaskCard = (node) => {
      const card = findTaskCard(node);
      const text = getElementText(card);

      if (/completed|done|hoan thanh|da hoan thanh|daily set completed/i.test(text)) {
        return true;
      }

      return Boolean(card?.querySelector?.(
        '.sw-checkmark, .completed, [class*="checkmark"], [class*="completed"], [class*="done"], [data-icon-name*="check" i], svg[aria-label*="check" i], svg[aria-label*="completed" i]'
      ));
    };

    const collectTaskLinksInDocument = () => {
      taskLinkSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((link) => {
          if (!isVisibleElement(link)) return;

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
          if (isCompletedTaskCard(card) || isCompletedTaskCard(link)) return;

          const dedupKey = sanitizedHref;
          if (seen.has(dedupKey)) return;

          seen.add(dedupKey);
          tasks.push({
            url: dedupKey,
            text: getElementText(card || link).substring(0, 140)
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

    dismissBlockingUi();
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

        dismissBlockingUi();
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
      dismissBlockingUi();
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
      cardsVisited
    };
  }

  window.__BRA__ = {
    version: VERSION,
    applyMobileProfile,
    collectDashboardTaskLinks,
    collectEnvironmentSnapshot,
    dismissBlockingUi,
    enhancedSearchInteraction,
    findSearchInput,
    getEnvironmentSnapshot: collectEnvironmentSnapshot,
    humanTypeString,
    prepareEnvironment,
    randomInt,
    runTaskPageInteraction,
    scrapePoints,
    sleep,
    typeAndSearch
  };
})();
