# Microsoft Rewards Auto

Chrome/Edge extension tu dong chay Microsoft Rewards searches va daily tasks.

## Tinh nang

- PC search va mobile search.
- Mobile search gia lap bang UA rules, touch/viewport mobile trong content script.
- Lay keyword chinh tu Google Trends Viet Nam; thu background fetch truoc, fallback sang tab Google Trends neu browser/Google tra loi rong hoac reject request.
- Neu Rewards API tra payload loi, extension tu mo/reuse Rewards Dashboard de recovery.
- Gioi han tab extension quan ly toi da 2 tab, tab moi tao o background (`active: false`) de khong cuop focus khi ban dang lam viec.
- Doc diem/counter tu Rewards API khi co the, fallback sang dashboard recovery khi API khong on dinh.
- Scan Daily Set, punch card, promotions, task link tu Rewards dashboard.

## Cai dat

1. Clone repo:

```bash
git clone https://github.com/thaikhang113/MS_reward_auto.git
```

2. Mo `edge://extensions` hoac `chrome://extensions`.
3. Bat `Developer mode`.
4. Chon `Load unpacked`.
5. Chon thu muc `extension`.
6. Dang nhap Microsoft Rewards trong cung profile trinh duyet.

## Cach dung

1. Bam icon extension.
2. Chon so luong PC/mobile searches.
3. Bam Start.
4. De trinh duyet mo trong qua trinh chay.

Neu log bao dashboard payload invalid, extension se mo/reuse mot tab Rewards Dashboard o background. Neu chua dang nhap, vao tab do dang nhap roi chay lai.

## Nguon du lieu

- Microsoft Rewards dashboard: `https://rewards.bing.com/`
- Microsoft Rewards user info API: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest`
- Bing Search: `https://www.bing.com/`
- Google Trends page: `https://trends.google.com/trending?geo=VN&hl=vi`
- Google Trends RPC endpoint observed from Trends page network: `https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&source-path=%2Ftrending&hl=vi&rt=c`

## Cau truc

- `extension/background.js`: dieu phoi search, task, Rewards API, dashboard recovery.
- `extension/content-automation.js`: thao tac DOM tren Bing/Rewards/task pages.
- `extension/keywords-data.js`: keyword pool, dynamic keywords, Google Trends fetch.
- `extension/rewards_dashboard.js`: normalize dashboard payload/counters.
- `extension/daily_tasks_new.js`: lay va normalize task URL.
- `extension/tab_policy.js`: gioi han/reuse tab extension quan ly.

## Kiem thu

```bash
cd extension
node --test daily_tasks_new.test.js rewards_dashboard.test.js keywords-data.test.js tab_policy.test.js search_verification.test.js
```

## Luu y

Tool nay tu dong hoa thao tac tren Microsoft Rewards. Hay tu kiem tra dieu khoan Microsoft Rewards va tu chiu trach nhiem khi su dung.
