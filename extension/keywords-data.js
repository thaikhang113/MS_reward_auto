const GOOGLE_TRENDS_ENDPOINT = 'https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&source-path=%2Ftrending&hl=vi&rt=c';
const GOOGLE_TRENDS_RPC_ID = 'i0OFE';
const GOOGLE_TRENDS_REGION = 'VN';
const GOOGLE_TRENDS_LANGUAGE = 'vi';
const GOOGLE_TRENDS_TIMEOUT_MS = 15000;
const KEYWORD_CACHE_TTL_MS = 30 * 60 * 1000;

export const KEYWORD_LIST = [
  'microsoft rewards',
  'bing rewards',
  'tin tuc hom nay',
  'du bao thoi tiet',
  'gia vang hom nay',
  'ty gia usd vnd',
  'lich thi dau bong da',
  'ket qua bong da',
  'lich premier league',
  'lich champions league',
  'bang xep hang ngoai hang anh',
  'liverpool',
  'arsenal',
  'manchester city',
  'manchester united',
  'real madrid',
  'barcelona',
  'psg',
  'nba scores',
  'formula 1',
  'world cup 2026',
  'gia xang hom nay',
  'chung khoan hom nay',
  'vnindex',
  'bitcoin price',
  'ethereum price',
  'solana',
  'dogecoin',
  'iphone 17',
  'samsung galaxy',
  'xiaomi',
  'laptop gaming',
  'pc build',
  'windows 11 tips',
  'chatgpt',
  'artificial intelligence',
  'openai',
  'python tutorial',
  'javascript',
  'typescript',
  'react js',
  'nextjs',
  'nodejs',
  'sql',
  'postgresql',
  'docker',
  'aws',
  'figma',
  'canva',
  'shopee sale',
  'lazada sale',
  'tiki',
  'tiktok shop',
  'local brand viet nam',
  'thoi trang nam',
  'thoi trang nu',
  'giay sneaker',
  'nuoc hoa',
  'skincare routine',
  'kem chong nang',
  'serum vitamin c',
  'retinol',
  'giam can',
  'tap gym tai nha',
  'yoga',
  'pilates',
  'healthy recipes',
  'cach nau pho',
  'mon ngon moi ngay',
  'ca phe',
  'tra sua',
  'du lich da lat',
  'du lich da nang',
  'du lich phu quoc',
  'du lich nha trang',
  'du lich hoi an',
  'khach san gia re',
  've may bay',
  'homestay dep',
  'am nhac moi',
  'phim hay',
  'netflix',
  'anime 2026',
  'lich nghi le',
  'lich am',
  'tu vi hom nay',
  'xem ngay tot',
  'meo vat cuoc song',
  'hoc tieng anh',
  'ielts',
  'toeic',
  'duolingo',
  'hoc online',
  'cv xin viec',
  'linkedin profile',
  'viec lam it',
  'passive income',
  'quan ly tai chinh ca nhan',
  'lai suat ngan hang'
];

let cachedTrendingKeywords = [];
let cachedAt = 0;

function shuffleKeywords(keywords) {
  const cloned = [...keywords];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function normalizeKeyword(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length < 2 || normalized.length > 120) {
    return null;
  }

  return normalized;
}

function dedupeKeywords(items) {
  const seen = new Set();
  const keywords = [];

  for (const item of items) {
    const normalized = normalizeKeyword(item);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('vi-VN');
    if (seen.has(key)) continue;

    seen.add(key);
    keywords.push(normalized);
  }

  return keywords;
}

export function buildTrendsRequest(region = GOOGLE_TRENDS_REGION, language = GOOGLE_TRENDS_LANGUAGE) {
  const params = new URLSearchParams();
  params.append(
    'f.req',
    JSON.stringify([[[GOOGLE_TRENDS_RPC_ID, JSON.stringify([null, null, region, 0, language, 24, 1]), null, 'generic']]])
  );
  return params.toString();
}

async function fetchTextWithTimeout(url, options = {}, timeoutMs = GOOGLE_TRENDS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractBatchedPayload(text) {
  const payloadLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('[['));

  if (!payloadLine) {
    throw new Error('Google Trends payload not found');
  }

  return JSON.parse(payloadLine);
}

export function parseTrendingKeywordsFromPayload(payload) {
  const rpcResult = payload.find(
    (entry) =>
      Array.isArray(entry)
      && entry[1] === GOOGLE_TRENDS_RPC_ID
      && typeof entry[2] === 'string'
  );

  if (!rpcResult) {
    throw new Error('Google Trends RPC result not found');
  }

  const innerPayload = JSON.parse(rpcResult[2]);
  const topics = Array.isArray(innerPayload?.[1]) ? innerPayload[1] : [];
  const collected = [];

  for (const topic of topics) {
    if (!Array.isArray(topic)) continue;

    collected.push(topic[0]);

    if (Array.isArray(topic[9])) {
      collected.push(...topic[9]);
    }

    if (!topic[0] && typeof topic[topic.length - 1] === 'string') {
      collected.push(topic[topic.length - 1]);
    }
  }

  return dedupeKeywords(collected);
}

export function getDynamicKeywords(now = new Date()) {
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const weekday = now.getDay();
  const hour = now.getHours();
  const weekdayNames = [
    'chu nhat',
    'thu hai',
    'thu ba',
    'thu tu',
    'thu nam',
    'thu sau',
    'thu bay'
  ];

  const dynamicKeywords = [
    `tin tuc ngay ${day} thang ${month}`,
    `thoi tiet thang ${month} nam ${year}`,
    `gia vang ngay ${day} ${month} ${year}`,
    `ty gia usd ngay ${day} ${month}`,
    `xu huong thang ${month} ${year}`,
    `lich thi dau ${weekdayNames[weekday]}`,
    `lich lam viec ${weekdayNames[weekday]}`,
    `${year} trends`,
    `${month}/${year} highlights`
  ];

  if (hour >= 5 && hour < 11) {
    dynamicKeywords.push(
      'tin sang',
      'an sang gi',
      'ca phe sang',
      'bai tap buoi sang',
      'morning routine'
    );
  } else if (hour >= 11 && hour < 17) {
    dynamicKeywords.push(
      'an trua gi',
      'quan an trua',
      'tin chieu',
      'lam viec hieu qua',
      'study tips'
    );
  } else {
    dynamicKeywords.push(
      'an toi gi',
      'phim toi nay',
      'nhac thu gian',
      'night routine',
      'doc gi truoc khi ngu'
    );
  }

  if (weekday === 0 || weekday === 6) {
    dynamicKeywords.push(
      'choi gi cuoi tuan',
      'di dau cuoi tuan',
      'quan cafe dep',
      'du lich ngan ngay'
    );
  } else if (weekday === 1) {
    dynamicKeywords.push('ke hoach dau tuan', 'motivation monday');
  } else if (weekday === 5) {
    dynamicKeywords.push('happy friday', 'ke hoach cuoi tuan');
  }

  if (day <= 5) {
    dynamicKeywords.push('muc tieu thang nay', 'budget thang nay');
  }

  if (day >= 25) {
    dynamicKeywords.push('tong ket thang', 'luong thang nay');
  }

  if (month === 1 || month === 2) {
    dynamicKeywords.push('tet nguyen dan', 'lich nghi tet', 'qua tet');
  }

  if (month === 4) {
    dynamicKeywords.push('le 30 4', 'du lich 30 4');
  }

  if (month >= 6 && month <= 8) {
    dynamicKeywords.push('du lich he', 'kem chong nang mua he', 'bien dep viet nam');
  }

  if (month === 9) {
    dynamicKeywords.push('trung thu', 'banh trung thu');
  }

  if (month === 11 || month === 12) {
    dynamicKeywords.push('black friday', 'giang sinh', 'ke hoach nam moi');
  }

  return dedupeKeywords(dynamicKeywords);
}

export async function fetchTrendingKeywords(options = {}) {
  const {
    forceRefresh = false,
    region = GOOGLE_TRENDS_REGION
  } = options;

  const now = Date.now();
  if (!forceRefresh && cachedTrendingKeywords.length > 0 && now - cachedAt < KEYWORD_CACHE_TTL_MS) {
    return [...cachedTrendingKeywords];
  }

  const text = await fetchTextWithTimeout(GOOGLE_TRENDS_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Origin: 'https://trends.google.com',
      Referer: `https://trends.google.com/trending?geo=${encodeURIComponent(region)}&hl=${encodeURIComponent(GOOGLE_TRENDS_LANGUAGE)}`
    },
    body: buildTrendsRequest(region, GOOGLE_TRENDS_LANGUAGE)
  });

  const payload = extractBatchedPayload(text);
  const keywords = parseTrendingKeywordsFromPayload(payload);

  if (!keywords.length) {
    throw new Error('Google Trends returned no keywords');
  }

  cachedTrendingKeywords = keywords;
  cachedAt = now;
  return [...cachedTrendingKeywords];
}

export async function getKeyWord(options = {}) {
  return fetchTrendingKeywords(options);
}

export async function getAllKeywords(options = {}) {
  const {
    forceRefresh = false,
    now = new Date(),
    onError
  } = options;

  let trendingKeywords = [];

  try {
    trendingKeywords = await fetchTrendingKeywords({ forceRefresh });
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error);
    }
  }

  return shuffleKeywords(
    dedupeKeywords([
      ...trendingKeywords,
      ...getDynamicKeywords(now),
      ...KEYWORD_LIST
    ])
  );
}

const isNodeCli =
  typeof process !== 'undefined'
  && process.release?.name === 'node'
  && typeof process.argv?.[1] === 'string'
  && /keywords-data\.js$/i.test(process.argv[1]);

if (isNodeCli) {
  getAllKeywords({ forceRefresh: true, onError: (error) => console.error('[Trends]', error.message) })
    .then((keywords) => {
      console.log(
        JSON.stringify(
          {
            count: keywords.length,
            preview: keywords.slice(0, 20)
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
