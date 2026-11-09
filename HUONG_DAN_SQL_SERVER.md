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

`sql/soccerhub.sql` là file tạo/cập nhật cấu trúc và seed dữ liệu; chạy file này trước. Script tự tạo database `SoccerHub`, 11 bảng nghiệp vụ cùng 2 bảng hỗ trợ phiên/mã reset mật khẩu, 3 danh mục và 20 sản phẩm với 20 đường dẫn ảnh riêng. Phương thức thanh toán được giới hạn ở `COD`, `BANK` và `VNPAY`; dữ liệu cũ `QR_PAY`/`MOMO` được chuyển sang `BANK`. Ảnh ban đầu nằm trong `src/assets/img`; ảnh admin tải lên được lưu trong `uploads/products` và SQL lưu đường dẫn. Thư mục upload bị loại khỏi Git, nên cần backup riêng nếu muốn chuyển ảnh admin lên máy chủ khác. Script có thể chạy lại mà không nhân bản dữ liệu mẫu. Nếu database đã có nhưng thiếu bảng nghiệp vụ, script sẽ dừng để tránh ghi đè dữ liệu.

**Nếu trước đó script đã báo lỗi:** database có thể đã tạo được một phần. Hãy sửa/cập nhật file `sql/soccerhub.sql` mới nhất từ dự án, mở lại file và nhấn `Ctrl+A` trước khi `F5` để chạy toàn bộ script. Chạy lại trên đúng database `SoccerHub`; không cần xóa database. Các thông báo `already exists` thường xuất hiện khi chỉ chạy lại một đoạn tạo index trên database đã có bảng/index, vì vậy cần chạy toàn bộ file từ đầu.

## 3. Xem bảng và dữ liệu

**Cách xem tên các bảng:**

1. Nếu chưa thấy Object Explorer, nhấn `F8`.
2. Bấm dấu `+` cạnh server đang kết nối.
3. Bấm dấu `+` cạnh **Databases**.
4. Bấm chuột phải **Databases** > **Refresh**.
5. Mở **SoccerHub** > **Tables**. Có 11 bảng nghiệp vụ và 2 bảng hỗ trợ đăng nhập: `PhienDangNhap`, `MaDatLaiMatKhau`.

**Cách xem các dòng dữ liệu trong bảng:**

1. Chọn **File > Open > File...** và mở `sql/kiem_tra_soccerhub.sql`.
2. Kiểm tra đầu file có `USE [SoccerHub];`.
3. Nhấn `F5` hoặc nút **Execute**.
4. SSMS sẽ hiện nhiều bảng kết quả ở khung **Results**. Truy vấn đầu tiên đếm các bảng nghiệp vụ và bảng hỗ trợ; các truy vấn tiếp theo hiển thị nội dung và quan hệ dữ liệu.

`sql/kiem_tra_soccerhub.sql` chỉ chạy các câu `SELECT` để xem/đếm dữ liệu; file này không tạo hay thay đổi bản ghi và không cần chạy để website hoạt động.

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
- Đặt lại mật khẩu cần cấu hình SMTP trong `.env`; nếu chưa cấu hình, API báo rõ và không giả lập thành công.
