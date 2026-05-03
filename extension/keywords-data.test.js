import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrendsRequest,
  fetchTrendingKeywords,
  getAllKeywords,
  parseTrendingKeywordsFromRss,
  parseTrendingKeywordsFromPayload
} from './keywords-data.js';

test('buildTrendsRequest uses the current Google Trends trending RPC shape', () => {
  const params = new URLSearchParams(buildTrendsRequest('VN', 'vi'));
  const request = JSON.parse(params.get('f.req'));
  const rpc = request[0][0];

  assert.equal(rpc[0], 'i0OFE');
  assert.equal(rpc[3], 'generic');
  assert.deepEqual(JSON.parse(rpc[1]), [null, null, 'VN', 0, 'vi', 24, 1]);
});

test('parseTrendingKeywordsFromPayload reads current Google Trends topic and related terms', () => {
  const innerPayload = JSON.stringify([
    null,
    [
      [
        'phuong oanh',
        null,
        'VN',
        [1777773600],
        null,
        null,
        10000,
        null,
        1000,
        ['phuong oanh', 'mua da ha noi'],
        [4],
        [],
        'phuong oanh'
      ],
      [
        'arsenal dau voi fulham',
        null,
        'VN',
        [1777753800],
        null,
        null,
        20000,
        null,
        1000,
        ['arsenal', 'arsenal vs'],
        [17],
        [],
        'arsenal dau voi fulham'
      ]
    ]
  ]);

  const payload = [['wrb.fr', 'i0OFE', innerPayload, null, null, null, 'generic']];

  assert.deepEqual(parseTrendingKeywordsFromPayload(payload), [
    'phuong oanh',
    'mua da ha noi',
    'arsenal dau voi fulham',
    'arsenal',
    'arsenal vs'
  ]);
});

test('parseTrendingKeywordsFromRss reads item titles from Google Trends RSS', () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel>
    <title>Daily Search Trends</title>
    <item><title>juventus</title><ht:approx_traffic>500+</ht:approx_traffic></item>
    <item><title><![CDATA[real betis vs]]></title><ht:approx_traffic>200+</ht:approx_traffic></item>
    <item><title>real betis vs</title><ht:approx_traffic>100+</ht:approx_traffic></item>
  </channel></rss>`;

  assert.deepEqual(parseTrendingKeywordsFromRss(rss), ['juventus', 'real betis vs']);
});

test('fetchTrendingKeywords supports same-origin tab fetch fallback', async () => {
  const innerPayload = JSON.stringify([
    null,
    [
      ['trend one', null, 'VN', [], null, null, 100, null, 100, ['trend related'], [], [], 'trend one']
    ]
  ]);
  const text = `)]}'\n\n123\n${JSON.stringify([['wrb.fr', 'i0OFE', innerPayload]])}`;
  const calls = [];

  const keywords = await fetchTrendingKeywords({
    forceRefresh: true,
    fetchText: async (request) => {
      calls.push(request);
      return text;
    }
  });

  assert.deepEqual(keywords, ['trend one', 'trend related']);
  assert.match(calls[0].endpoint, /rpcids=i0OFE/);
  assert.equal(calls[0].region, 'VN');
  assert.match(calls[0].body, /f\.req=/);
});

test('fetchTrendingKeywords falls back when the primary fetch returns no tab payload', async () => {
  const innerPayload = JSON.stringify([
    null,
    [
      ['fallback trend', null, 'VN', [], null, null, 100, null, 100, ['fallback related'], [], [], 'fallback trend']
    ]
  ]);
  const text = `)]}'\n\n123\n${JSON.stringify([['wrb.fr', 'i0OFE', innerPayload]])}`;
  const calls = [];

  const keywords = await fetchTrendingKeywords({
    forceRefresh: true,
    fetchText: async (request) => {
      calls.push(['primary', request.endpoint]);
      throw new Error('Google Trends tab returned empty payload');
    },
    fallbackFetchText: async (request) => {
      calls.push(['fallback', request.endpoint]);
      return text;
    }
  });

  assert.deepEqual(keywords, ['fallback trend', 'fallback related']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'primary');
  assert.equal(calls[1][0], 'fallback');
});

test('getAllKeywords forwards the Trends fallback fetcher', async () => {
  const innerPayload = JSON.stringify([
    null,
    [
      ['wrapper trend', null, 'VN', [], null, null, 100, null, 100, ['wrapper related'], [], [], 'wrapper trend']
    ]
  ]);
  const text = `)]}'\n\n123\n${JSON.stringify([['wrb.fr', 'i0OFE', innerPayload]])}`;

  const keywords = await getAllKeywords({
    forceRefresh: true,
    fetchText: async () => {
      throw new Error('Google Trends tab returned empty payload');
    },
    fallbackFetchText: async () => text
  });

  assert.equal(keywords.includes('wrapper trend'), true);
  assert.equal(keywords.includes('wrapper related'), true);
});

test('fetchTrendingKeywords falls back to RSS when RPC fetchers fail', async () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel>
    <item><title>rss trend</title></item>
    <item><title><![CDATA[rss related]]></title></item>
  </channel></rss>`;
  const calls = [];

  const keywords = await fetchTrendingKeywords({
    forceRefresh: true,
    fetchText: async () => {
      calls.push('primary');
      throw new Error('HTTP 400');
    },
    fallbackFetchText: async () => {
      calls.push('tab');
      throw new Error('Google Trends tab returned empty payload');
    },
    rssFetchText: async (request) => {
      calls.push(request.kind);
      return rss;
    }
  });

  assert.deepEqual(keywords, ['rss trend', 'rss related']);
  assert.deepEqual(calls, ['primary', 'tab', 'rss']);
});
