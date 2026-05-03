import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { getTaskDedupKey, normalizeTaskUrl } from './daily_tasks_new.js';

test('normalizeTaskUrl keeps Rewards quest URLs for punch card scanning', () => {
  const url = normalizeTaskUrl('https://rewards.bing.com/earn/quest/ENWW_pcparent_FY26_BingMonthlyPC_May_punchcard?rnoreward=1');

  assert.equal(
    url,
    'https://rewards.bing.com/earn/quest/ENWW_pcparent_FY26_BingMonthlyPC_May_punchcard'
  );
});

test('normalizeTaskUrl rejects Rewards navigation pages', () => {
  assert.equal(normalizeTaskUrl('https://rewards.bing.com/dashboard'), null);
  assert.equal(normalizeTaskUrl('https://rewards.bing.com/earn'), null);
});

test('normalizeTaskUrl keeps external Rewards tracking links', () => {
  assert.equal(
    normalizeTaskUrl('https://www.seaofthieves.com/?form=ML2XMD&OCID=ML2XMD&PUBL=RewardsDO&CREA=ML2XMD'),
    'https://www.seaofthieves.com/?form=ML2XMD&OCID=ML2XMD&PUBL=RewardsDO&CREA=ML2XMD'
  );
});

test('getTaskDedupKey keeps distinct Rewards search offers with the same query', () => {
  const desktopKey = getTaskDedupKey('https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XME&OCID=ML2XME&PUBL=RewardsDO');
  const mobileKey = getTaskDedupKey('https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XMF&OCID=ML2XMF&PUBL=RewardsDO');

  assert.notEqual(desktopKey, mobileKey);
});

test('openDashboardTaskLink clicks the matching Rewards offer when query text is duplicated', async () => {
  const desktopLink = createFakeLink('https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XME&OCID=ML2XME&PUBL=RewardsDO', 'desktop');
  const mobileLink = createFakeLink('https://www.bing.com/search?q=Sea+of+Thieves+News&form=ML2XMF&OCID=ML2XMF&PUBL=RewardsDO', 'mobile');
  const contentScript = fs.readFileSync(new URL('./content-automation.js', import.meta.url), 'utf8');
  const context = createContentScriptContext([desktopLink, mobileLink]);

  vm.runInNewContext(contentScript, context);

  const result = await context.window.__BRA__.openDashboardTaskLink(mobileLink.href);

  assert.equal(result.success, true);
  assert.equal(desktopLink.clicked, false);
  assert.equal(mobileLink.clicked, true);
});

function createFakeLink(href, text) {
  return {
    href,
    textContent: text,
    innerText: text,
    clicked: false,
    setAttribute() {},
    dispatchEvent() {},
    scrollIntoView() {},
    click() {
      this.clicked = true;
    },
    getBoundingClientRect() {
      return { left: 10, top: 10, width: 120, height: 40 };
    }
  };
}

function createContentScriptContext(links) {
  const document = {
    querySelectorAll(selector) {
      return selector === 'a[href]' ? links : [];
    },
    documentElement: {
      classList: { add() {} },
      setAttribute() {},
      style: {}
    },
    body: { style: {} }
  };
  const window = {
    document,
    __BRA__: null,
    setTimeout(callback) {
      callback();
      return 1;
    },
    scrollBy() {},
    scrollTo() {},
    MouseEvent: class MouseEvent {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    }
  };
  window.window = window;

  return {
    URL,
    Math,
    Promise,
    String,
    console,
    document,
    navigator: {},
    screen: {},
    window,
    MouseEvent: window.MouseEvent,
    Event: class Event {},
    Object,
    Array,
    Number,
    RegExp,
    Boolean
  };
}
