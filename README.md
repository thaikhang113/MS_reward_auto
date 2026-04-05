🚀 README.md (Final Version)
<div align="center">
  <img src="https://raw.githubusercontent.com/buoi2k7/Reward_Bing_VN/main/extension/icons/icon-128.png" width="120" alt="Extension Icon">
  
  <h1>🤖 Microsoft Rewards Auto (API Edition)</h1>
  
  <p><b>Automation tool giúp tự động thu thập điểm Microsoft Rewards bằng cách gọi API trực tiếp — ổn định, nhanh và khó bị phá vỡ.</b></p>

  <br/>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://www.javascript.com/)
  ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome)
  ![Status](https://img.shields.io/badge/Status-Active-brightgreen)

</div>

---

## 📋 Mục lục

- [🚀 Giới thiệu](#-giới-thiệu)
- [🔥 Tại sao project này đáng chú ý](#-tại-sao-project-này-đáng-chú-ý)
- [🎯 Tính năng](#-tính-năng)
- [📦 Yêu cầu](#-yêu-cầu)
- [🛠 Cài đặt](#-cài-đặt)
- [🚀 Cách sử dụng](#-cách-sử-dụng)
- [🔍 Cách hoạt động](#-cách-hoạt-động)
- [🧠 Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [⚠️ Rủi ro & Lưu ý](#️-rủi-ro--lưu-ý)
- [❓ FAQ](#-faq)
- [🛣️ Roadmap](#️-roadmap)
- [🤝 Đóng góp](#-đóng-góp)
- [📄 Giấy phép](#-giấy-phép)
- [📞 Liên hệ](#-liên-hệ)

---

## 🚀 Giới thiệu

**Microsoft Rewards Auto** là tiện ích Chrome giúp tự động hóa việc thu thập điểm Microsoft Rewards mỗi ngày.

Khác với các tool truyền thống dùng **DOM Scraping (dễ bị lỗi khi UI thay đổi)**, project này:

- ⚡ Gọi API trực tiếp từ server
- 🛡️ Hoạt động ổn định hơn
- 🚀 Nhanh và chính xác hơn
- 🤖 Tự động hoàn thành nhiệm vụ khi bạn không cần thao tác

---

## 🔥 Tại sao project này đáng chú ý

- Hầu hết tool ngoài kia phụ thuộc giao diện → rất dễ "toang"
- Project này dùng API → ít bị ảnh hưởng bởi thay đổi UI
- Có thể mở rộng thành hệ thống automation lớn hơn
- Tư duy hướng backend thay vì UI hack

👉 Đây không chỉ là tool, mà là nền tảng automation.

---

## 🎯 Tính năng

### 🔧 Tính năng chính

- 🔌 **Gọi API trực tiếp**
- 📋 **Hỗ trợ nhiều loại nhiệm vụ**:
  - Daily Set
  - Web Search (PC/Mobile)
  - Punch Cards
  - Promotions
- ⏱️ **Delay ngẫu nhiên (2–8s)** tránh bị phát hiện
- 🗑️ **Loại bỏ popup gây nhiễu**
- 🌙 **Dark mode UI**
- 📊 **Theo dõi tiến độ điểm**

---

## 📦 Yêu cầu

- 🌐 Chrome / Edge (v90+)
- 👤 Tài khoản Microsoft Rewards
- 🌍 Internet

---

## 🛠 Cài đặt

### Cách 1: Load Extension (Khuyên dùng)

```bash
git clone https://github.com/buoi2k7/Reward_Bing_VN.git
cd Reward_Bing_VN
Mở chrome://extensions/
Bật Developer mode
Click Load unpacked
Chọn thư mục extension
🚀 Cách sử dụng
Đăng nhập Microsoft Rewards
Mở extension
Bấm Start
Theo dõi tiến trình
Ngồi chill 😎
🔍 Cách hoạt động
1. Call API /getuserinfo
   ↓
2. Lấy danh sách task
   ↓
3. Xử lý từng task
   ↓
4. Delay random (2–8s)
   ↓
5. Update điểm
🧠 Kiến trúc hệ thống
Background Script
Điều phối toàn bộ logic
Content Script
Tương tác với trang web
API Handler
Gửi request đến Microsoft
Task Scheduler
Quản lý delay & thứ tự task

👉 Thiết kế theo hướng modular → dễ mở rộng

⚠️ Rủi ro & Lưu ý
Có thể vi phạm điều khoản Microsoft Rewards
Có khả năng bị giới hạn hoặc khóa tài khoản
Dùng với mục đích học tập / nghiên cứu

👉 Bạn tự chịu trách nhiệm khi sử dụng

❓ FAQ

Q: Có an toàn không?
A: Dùng API thật nhưng vẫn có rủi ro nếu lạm dụng

Q: Tại sao có delay?
A: Tránh bị detect là bot

Q: Firefox có dùng được không?
A: Chưa, nhưng có thể thêm sau

🛣️ Roadmap
 Hỗ trợ Firefox
 Multi-account
 Proxy support
 Dashboard thống kê
 Auto schedule chạy nền
🤝 Đóng góp
Fork repo
Tạo branch
Commit
Push
Pull Request
📄 Giấy phép

MIT License

📞 Liên hệ
👨‍💻 GitHub: https://github.com/buoi2k7
📧 Email: ngthanhduy132@gmail.com
📱 Phone: 0337155246
<div align="center">

⭐ Nếu thấy hay thì cho 1 star nhé ⭐

</div> ```
