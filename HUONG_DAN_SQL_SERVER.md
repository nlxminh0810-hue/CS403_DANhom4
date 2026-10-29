# Chạy dữ liệu SoccerHub bằng SQL Server Management Studio

## 1. Kết nối đúng SQL Server

Trong SSMS, mở cửa sổ **Connect to Server** và nhập:

- **Server type:** Database Engine
- **Server name:** `(localdb)\MSSQLLocalDB`
- **Authentication:** Windows Authentication

Đây là cấu hình hiện tại của dự án trong `.env`. Nếu máy bạn dùng SQL Server Express hoặc một instance khác, hãy nhập đúng tên instance đang dùng, ví dụ `localhost\SQLEXPRESS`, rồi cập nhật `SQL_SERVER` trong `.env` theo cùng tên đó.

## 2. Chạy file tạo database và dữ liệu mẫu

1. Trong SSMS chọn **File > Open > File...**.
2. Mở `sql/soccerhub.sql` trong thư mục dự án.
3. Kiểm tra thanh công cụ vẫn đang kết nối tới đúng server ở bước 1.
4. Nhấn **Execute** (hoặc `F5`) và chờ script chạy xong.
5. Trong **Messages**, xác nhận không có lỗi. Kết quả cuối cùng hiện số sản phẩm, tài khoản, đơn hàng và thanh toán đã tạo.

Script tự tạo database `SoccerHub`, các bảng, danh mục, 8 sản phẩm và dữ liệu mẫu cho tài khoản, giỏ hàng, đơn hàng, thanh toán, đánh giá. Có thể chạy lại; các dòng dữ liệu mẫu không bị nhân đôi. Nếu database đã có nhưng thiếu bảng, script sẽ dừng để tránh ghi đè dữ liệu hiện có.

## 3. Xem đủ 11 bảng và dữ liệu của từng bảng

**Cách xem tên các bảng:**

1. Nếu chưa thấy Object Explorer, nhấn `F8`.
2. Bấm dấu `+` cạnh server đang kết nối.
3. Bấm dấu `+` cạnh **Databases**.
4. Bấm chuột phải **Databases** > **Refresh**.
5. Mở **SoccerHub** > **Tables**. Bạn sẽ thấy 11 bảng: `VaiTro`, `NguoiDung`, `DanhMuc`, `SanPham`, `HinhAnhSanPham`, `GioHang`, `ChiTietGioHang`, `DonHang`, `ChiTietDonHang`, `ThanhToan`, `DanhGia`.

**Cách xem các dòng dữ liệu trong bảng:**

1. Chọn **File > Open > File...** và mở `sql/kiem_tra_soccerhub.sql`.
2. Kiểm tra đầu file có `USE [SoccerHub];`.
3. Nhấn `F5` hoặc nút **Execute**.
4. SSMS sẽ hiện nhiều bảng kết quả ở khung **Results**. Truy vấn đầu tiên cho số dòng của cả 11 bảng; các truy vấn tiếp theo hiển thị nội dung từng bảng và tên liên quan.

Nếu kết quả báo `Invalid object name`, hãy chạy `sql/soccerhub.sql` trước. Nếu bảng tổng kết hiện 0, kiểm tra SSMS đang kết nối đúng instance và đúng database `SoccerHub`.

## 4. Đăng nhập thử trên website

Mở PowerShell tại thư mục dự án, chạy `npm run dev`, sau đó vào `http://localhost:5173`.

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản trị viên | `admin@gmail.com` | `123456` |
| Khách hàng | `user@gmail.com` | `123456` |
| Khách hàng | `hovanb` | `123456` |

Tài khoản `votanc` được tạo ở trạng thái khóa để thử chức năng khóa tài khoản.

## Lưu ý

- Tài khoản Windows đăng nhập SSMS cần quyền tạo database khi chạy lần đầu. Node.js cần chạy dưới cùng tài khoản Windows để dùng LocalDB.
- Nếu SSMS báo không tìm thấy LocalDB, kiểm tra đã cài SQL Server Express LocalDB chưa. Nếu đang dùng instance SQL Server khác, đổi tên server trong SSMS và `SQL_SERVER` trong `.env` cho trùng nhau.
- Đăng ký tài khoản mới cần cấu hình SMTP trong `.env`; các tài khoản mẫu ở trên không cần đăng ký lại.
