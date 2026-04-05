# 📦 Legacy — Bing Rewards Server (CDP Mode)

> **Archived: April 2026**
> Đây là phiên bản cũ dùng Node.js + Express + Socket.io + CDP (Chrome DevTools Protocol).
> Đã được thay thế hoàn toàn bằng Chrome Extension (Manifest V3) ở `../extension/`.

## Lý do archive
- **Quá nặng:** ~90MB node_modules, cần cài đặt npm
- **Kết nối không ổn định:** CDP qua port → lag, timeout, mất kết nối
- **Tốn tài nguyên:** Server localhost chạy song song với browser
- **Không per-profile:** Dữ liệu chung cho tất cả browser, không tách riêng

## Cấu trúc cũ
```
controller/
├── index.js              # Server Express + Socket.io (689 dòng)
├── cdp-client.js         # Core CDP automation (1332 dòng) ← 💪 file chính
├── automation-script.js  # Browser-injected scripts (391 dòng)
├── browser-detector.js   # Port scanning để tìm GenLogin profiles
├── keywords-data.js      # 500+ từ khóa tiếng Việt
├── keywords.js           # Keyword helper cũ
├── config.json           # Config file
├── package.json          # Dependencies (express, socket.io, chrome-remote-interface)
├── public/               # Web UI (HTML/CSS/JS dashboard)
├── utils/                # Helper functions
├── captured-html/        # Debug HTML captures
├── analyze-rewards.js    # Rewards page analyzer
├── analyze-html-file.js  # HTML structure analyzer
├── debug-detector.js     # Debug utilities
├── electron-main.js      # Electron wrapper (thử nghiệm)
└── node_modules/         # ~90MB dependencies
```

## Thành tựu
- Chạy ổn định từ 2024-2026
- Xử lý đồng thời 10+ profiles
- Points tracking + ban detection
- Wave-based search + anti-ban typing

---
*Cảm ơn vì đã phục vụ tốt. Rest in peace.* 🫡
