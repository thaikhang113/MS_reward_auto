# Cách Manual - Đơn giản hơn

Vì analyzer script có thể gặp issue với timing, hãy làm manual nhanh hơn:

## Bước 1: Save HTML thủ công

1. Mở GenLogin profile → Login Bing Rewards
2. Vào trang: https://rewards.bing.com/
3. Đợi page load hết
4. **Right-click trên trang → "Save as..."**
5. Chọn: 
   - Save as type: **"Webpage, HTML Only"**
   - File name: `rewards-old.html` (nếu giao diện cũ) hoặc `rewards-new.html`
6. Save vào: `d:\tool\reward\controller\captured-html\`

## Bước 2: Chạy analyzer offline

Tôi sẽ tạo script phân tích file HTML đã save:

```powershell
cd d:\tool\reward\controller
node analyze-html-file.js captured-html/rewards-old.html
```

Cách này:
- ✅ Không cần CDP connection
- ✅ Không bị timeout
- ✅ Có thể analyze nhiều lần
- ✅ Dễ debug hơn

Bạn thử save HTML thủ công đi, tôi tạo script phân tích offline ngay!
