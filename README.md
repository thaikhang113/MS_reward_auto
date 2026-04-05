<div align="center">
  <img src="https://raw.githubusercontent.com/buoi2k7/Reward_Bing_VN/main/extension/icons/icon-128.png" width="120" alt="Extension Icon">
  <h1>🤖 Microsoft Rewards Auto (API Edition)</h1>
  <p><b>Công cụ tự động hóa thu thập điểm Microsoft Rewards bằng cách gọi API trực tiếp, không phụ thuộc vào thay đổi giao diện.</b></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://www.javascript.com/)
  ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome)
  ![Status](https://img.shields.io/badge/Status-Active-brightgreen)
</div>

---

## 📋 Mục Lục
- [Giới thiệu](#-giới-thiệu)
- [Tính năng](#-tính-năng)
- [Yêu cầu](#-yêu-cầu)
- [Cài đặt](#-cài-đặt)
- [Cách sử dụng](#-cách-sử-dụng)
- [Cách hoạt động](#-cách-hoạt-động)
- [FAQ](#-faq)
- [Đóng góp](#-đóng-góp)
- [Giấy phép](#-giấy-phép)
- [Liên hệ](#-liên-hệ)

---

## 📋 Giới thiệu

**Microsoft Rewards Auto** là tiện ích Chrome giúp tự động hóa việc thu thập điểm Microsoft Rewards hàng ngày. 

Khác với các công cụ dùng **DOM Scraping** (dễ bị vỡ khi giao diện thay đổi), công cụ này tương tác trực tiếp với **API của Microsoft**, giúp:
- ✅ Đọc danh sách nhiệm vụ chính xác từ server
- ✅ Hoạt động ổn định dù Microsoft thay đổi giao diện
- ✅ Giảm rủi ro so với phương pháp cũ
- ✅ Tự động hoàn thành các nhiệm vụ trong khi bạn ngủ 😴

---

## 🎯 Tính năng

### 🔧 Tính năng chính
- **🔌 Gọi API trực tiếp**: Lấy dữ liệu nhiệm vụ từ `/api/getuserinfo` thay vì DOM Scraping
- **📋 Hỗ trợ đa loại nhiệm vụ**: 
  - Daily Set (Nhiệm vụ hàng ngày)
  - Web Search (PC/Mobile)
  - PunchCards (Nhiệm vụ dài ngày)
  - More Promotions
- **⏱️ Delay ngẫu nhiên**: Giữa các hành động để tránh phát hiện (2-8 giây)
- **🗑️ Xóa thông báo bẫy**: Loại bỏ các cửa sổ cảnh báo không cần thiết
- **🌙 Giao diện Dark Mode**: Popup tối ưu hóa mắt
- **📊 Theo dõi tiến độ**: Xem số điểm đã thu thập

---

## 📦 Yêu cầu

- **🌐 Trình duyệt**: Google Chrome hoặc Microsoft Edge (phiên bản 90+)
- **👤 Tài khoản**: Microsoft Rewards account
- **🌍 Kết nối**: Internet connection

---

## 🛠 Cài đặt

### Cách 1: Cài đặt từ Unpacked Extension (Khuyên dùng)
1. **Tải mã nguồn**:
   ```bash
   git clone https://github.com/buoi2k7/Reward_Bing_VN.git
   cd Reward_Bing_VN
