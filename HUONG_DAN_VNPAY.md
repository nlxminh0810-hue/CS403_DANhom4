# Chay SoccerHub voi SQL Server va VNPay sandbox

## 1. Tao database trong SSMS

1. Mo SQL Server Management Studio va ket noi SQL Server.
2. Mo file `sql/soccerhub.sql` bang **File > Open > File**.
3. Chay toan bo script bang **Execute**. Script tao database `SoccerHub`, cac bang, 3 danh muc va 20 san pham voi 20 duong dan anh rieng, cung du lieu demo tai khoan/don hang.
4. Dam bao SQL Server cho phep ket noi TCP/IP va tai khoan SQL Server co quyen tren database `SoccerHub`.

`sql/soccerhub.sql` la file tao/cap nhat schema va seed du lieu; co the chay lai ma khong nhan ban du lieu mau. Anh nam trong `src/assets/img`, SQL Server luu duong dan trong `HinhAnhSanPham`. File `sql/kiem_tra_soccerhub.sql` chi doc va hien thi so dong/noi dung cac bang; no khong tao hay sua du lieu.

Neu ban da co database voi schema khong day du, script se dung va khong ghi de.

## 2. Cau hinh ket noi

Trong PowerShell tai thu muc project:

```powershell
Copy-Item .env.example .env
```

Mo `.env`. Neu SSMS ket noi bang `(LocalDB)\\MSSQLLocalDB` (nhu may nay), dung cau hinh:

```env
SQL_AUTH=windows
SQL_SERVER=(localdb)\\MSSQLLocalDB
SQL_PORT=
SQL_INSTANCE=
SQL_DATABASE=SoccerHub
SQL_USER=
SQL_PASSWORD=
```

Backend se dung Windows Authentication cua user dang chay Node.js. Neu dung SQL Server instance thong thuong, dat `SQL_AUTH=sql`, dien `SQL_USER`/`SQL_PASSWORD`, va dat host/port/instance tuong ung.

Tai khoan duoc tao ngay sau khi gui form dang ky, khong can xac nhan email. Email duoc dung lam ten dang nhap. Mat khau duoc bam scrypt va luu trong SQL Server; can ket noi database thanh cong de dang ky va dang nhap.

## 3. Dat lai mat khau qua email

Dien `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` va `SMTP_FROM` trong `.env` theo SMTP provider cua ban. Khong commit mat khau SMTP. API gui ma 6 chu so co hieu luc 15 phut; neu chua cau hinh SMTP, giao dien hien thong bao de cau hinh thay vi bao reset thanh cong.

## 4. Cau hinh VNPay

Dang ky merchant sandbox voi VNPay, sau do dien `VNPAY_TMN_CODE` va `VNPAY_HASH_SECRET` trong `.env`. Khong dua hai gia tri nay vao frontend hoac commit file `.env`.

Khi chay local, de:

```env
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3001/api/payments/vnpay/return
```

De VNPay goi duoc IPN, server can co URL cong khai va khai bao URL `https://<domain>/api/payments/vnpay/ipn` trong cau hinh merchant. Khi chi chay local, trang return van kiem tra chu ky va trang thai; IPN se khong truy cap duoc `localhost`.

## 5. Chay va thu

```powershell
npm install
npm run dev
```

Mo URL Vite hien trong terminal. Tai khoan demo cua giao dien: `user@gmail.com` / `123456`. Checkout chi co ba cach thanh toan: chuyen khoan ngan hang MBank (VietQR, `0762525797`), VNPay sandbox va tien mat khi nhan hang. Don chuyen khoan ngan hang cho cua hang doi soat, khong tu dong bao da thanh toan.

Kiem tra:

```powershell
npm test
npm run build
npm audit
```

Tai khoan, san pham va don hang duoc doc/ghi qua backend SQL Server. Token dang nhap duoc giu trong sessionStorage cua trinh duyet; gio hang hien van la state phien frontend. VNPay chi nen thu tren sandbox den khi da cau hinh merchant va IPN cong khai; day chua phai he thong production.