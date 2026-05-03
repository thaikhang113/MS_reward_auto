import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrendsRequest,
  fetchTrendingKeywords,
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
