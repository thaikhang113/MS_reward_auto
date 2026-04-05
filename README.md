<div align="center">
  <img src="https://raw.githubusercontent.com/buoi2k7/Reward_Bing_VN/main/extension/icons/icon-128.png" width="120" alt="Extension Icon">
  <h1>Microsoft Rewards Auto (API Edition)</h1>
  <p><b>Công cụ tự động hóa thu thập điểm Microsoft Rewards bằng cách gọi API trực tiếp, không phụ thuộc vào thay đổi giao diện.</b></p>
</div>

---

## 📋 Giới thiệu

**Microsoft Rewards Auto** là tiện ích Chrome giúp tự động hóa việc thu thập điểm Microsoft Rewards hàng ngày. 

Khác với các công cụ dùng DOM Scraping (dễ bị vỡ khi giao diện thay đổi), công cụ này tương tác trực tiếp với API của Microsoft, giúp:
- Đọc danh sách nhiệm vụ chính xác từ server
- Hoạt động ổn định dù Microsoft thay đổi giao diện
- Giảm rủi ro so với phương pháp cũ

## 🎯 Tính năng

- **Gọi API trực tiếp**: Lấy dữ liệu nhiệm vụ từ `/api/getuserinfo` thay vì DOM Scraping
- **Hỗ trợ đa loại nhiệm vụ**: 
  - Daily Set (Nhiệm vụ hàng ngày)
  - Web Search (PC/Mobile)
  - PunchCards (Nhiệm vụ dài ngày)
  - More Promotions
- **Delay ngẫu nhiên**: Giữa các hành động để tránh phát hiện (2-8 giây)
- **Xóa thông báo bẫy**: Loại bỏ các cửa sổ cảnh báo không cần thiết
- **Giao diện Dark Mode**: Popup tối ưu hóa

## 🛠 Cài đặt

1. Tải toàn bộ mã nguồn về máy (hoặc chỉ tải thư mục `extension`)
2. Mở Chrome/Edge, nhập `chrome://extensions/`
3. Bật **Developer mode** (góc trên phải)
4. Bấm **Load unpacked**
5. Chọn thư mục `extension`
6. Biểu tượng tiện ích sẽ hiện lên. Bấm vào và chọn **Bắt đầu**

---

⚠️ **Lưu ý**: Công cụ này dùng cho mục đích học tập. Hãy sử dụng tuân theo điều khoản dịch vụ của Microsoft.
