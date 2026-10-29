-- Run this file in SQL Server Management Studio.
-- Creates SoccerHub if needed, then creates the schema and demo catalog.
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_ID(N'SoccerHub') IS NULL
    EXEC(N'CREATE DATABASE [SoccerHub]');
GO
USE [SoccerHub];
GO

IF OBJECT_ID(N'dbo.VaiTro', N'U') IS NULL
BEGIN
    BEGIN TRANSACTION;

    CREATE TABLE dbo.VaiTro (
        MaVT INT IDENTITY(1,1) CONSTRAINT PK_VaiTro PRIMARY KEY,
        TenVaiTro NVARCHAR(50) NOT NULL CONSTRAINT UQ_VaiTro_Ten UNIQUE,
        CONSTRAINT CK_VaiTro_Ten CHECK (LEN(LTRIM(RTRIM(TenVaiTro))) > 0)
    );
    CREATE TABLE dbo.NguoiDung (
        MaND INT IDENTITY(1,1) CONSTRAINT PK_NguoiDung PRIMARY KEY,
        TenDN VARCHAR(50) NOT NULL CONSTRAINT UQ_NguoiDung_TenDN UNIQUE,
        Email VARCHAR(100) NOT NULL CONSTRAINT UQ_NguoiDung_Email UNIQUE,
        MatKhau VARCHAR(255) NOT NULL,
        SoDT VARCHAR(15) NOT NULL,
        DiaChi NVARCHAR(255) NULL,
        NgayTao DATE NOT NULL CONSTRAINT DF_NguoiDung_Ngay DEFAULT CONVERT(DATE, GETDATE()),
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_NguoiDung_TrangThai DEFAULT N'Hoạt động',
        MaVT INT NOT NULL CONSTRAINT FK_NguoiDung_VaiTro REFERENCES dbo.VaiTro(MaVT),
        HoTen NVARCHAR(100) NULL,
        NgaySinh DATE NULL,
        GioiTinh NVARCHAR(10) NULL,
        TieuSu NVARCHAR(500) NULL,
        CONSTRAINT CK_NguoiDung_Ten CHECK (LEN(LTRIM(RTRIM(TenDN))) > 0),
        CONSTRAINT CK_NguoiDung_Email CHECK (Email LIKE '%_@_%._%' AND Email NOT LIKE '% %'),
        CONSTRAINT CK_NguoiDung_SoDT CHECK (LEN(SoDT) BETWEEN 9 AND 15 AND SoDT NOT LIKE '%[^0-9+]%'),
        CONSTRAINT CK_NguoiDung_MatKhau CHECK (LEN(MatKhau) >= 60),
        CONSTRAINT CK_NguoiDung_TrangThai CHECK (TrangThai IN (N'Hoạt động', N'Đã khóa', N'Đã xóa')),
        CONSTRAINT CK_NguoiDung_GioiTinh CHECK (GioiTinh IS NULL OR GioiTinh IN (N'Nam', N'Nữ', N'Khác'))
    );
    CREATE TABLE dbo.DanhMuc (
        MaDM INT IDENTITY(1,1) CONSTRAINT PK_DanhMuc PRIMARY KEY,
        TenDM NVARCHAR(100) NOT NULL CONSTRAINT UQ_DanhMuc_Ten UNIQUE,
        MoTa NVARCHAR(255) NULL,
        CONSTRAINT CK_DanhMuc_Ten CHECK (LEN(LTRIM(RTRIM(TenDM))) > 0)
    );
    CREATE TABLE dbo.SanPham (
        MaSP INT IDENTITY(1,1) CONSTRAINT PK_SanPham PRIMARY KEY,
        TenSP NVARCHAR(150) NOT NULL,
        Gia DECIMAL(18,2) NOT NULL,
        SoLuong INT NOT NULL CONSTRAINT DF_SanPham_SoLuong DEFAULT 0,
        MoTa NVARCHAR(255) NULL,
        NgayThem DATE NOT NULL CONSTRAINT DF_SanPham_Ngay DEFAULT CONVERT(DATE, GETDATE()),
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_SanPham_TrangThai DEFAULT N'Đang bán',
        MaDM INT NOT NULL CONSTRAINT FK_SanPham_DanhMuc REFERENCES dbo.DanhMuc(MaDM),
        CONSTRAINT CK_SanPham_Ten CHECK (LEN(LTRIM(RTRIM(TenSP))) > 0),
        CONSTRAINT CK_SanPham_Gia CHECK (Gia >= 0),
        CONSTRAINT CK_SanPham_SoLuong CHECK (SoLuong >= 0),
        CONSTRAINT CK_SanPham_TrangThai CHECK (TrangThai IN (N'Đang bán', N'Ngừng bán'))
    );
    CREATE TABLE dbo.HinhAnhSanPham (
        MaAnh INT IDENTITY(1,1) CONSTRAINT PK_HinhAnhSanPham PRIMARY KEY,
        MaSP INT NOT NULL CONSTRAINT FK_HinhAnh_SanPham REFERENCES dbo.SanPham(MaSP),
        DuongDanAnh VARCHAR(500) NOT NULL,
        ThuTu INT NOT NULL CONSTRAINT DF_HinhAnh_ThuTu DEFAULT 0,
        CONSTRAINT UQ_HinhAnh UNIQUE (MaSP, DuongDanAnh),
        CONSTRAINT CK_HinhAnh_DuongDan CHECK (LEN(LTRIM(RTRIM(DuongDanAnh))) > 0),
        CONSTRAINT CK_HinhAnh_ThuTu CHECK (ThuTu >= 0)
    );
    CREATE TABLE dbo.GioHang (
        MaGH INT IDENTITY(1,1) CONSTRAINT PK_GioHang PRIMARY KEY,
        MaND INT NOT NULL CONSTRAINT UQ_GioHang_NguoiDung UNIQUE
            CONSTRAINT FK_GioHang_NguoiDung REFERENCES dbo.NguoiDung(MaND),
        NgayTao DATE NOT NULL CONSTRAINT DF_GioHang_Ngay DEFAULT CONVERT(DATE, GETDATE())
    );
    CREATE TABLE dbo.ChiTietGioHang (
        MaGH INT NOT NULL CONSTRAINT FK_ChiTietGioHang_GioHang REFERENCES dbo.GioHang(MaGH) ON DELETE CASCADE,
        MaSP INT NOT NULL CONSTRAINT FK_ChiTietGioHang_SanPham REFERENCES dbo.SanPham(MaSP),
        SoLuong INT NOT NULL,
        CONSTRAINT PK_ChiTietGioHang PRIMARY KEY (MaGH, MaSP),
        CONSTRAINT CK_ChiTietGioHang_SoLuong CHECK (SoLuong > 0)
    );
    CREATE TABLE dbo.DonHang (
        MaDH INT IDENTITY(1,1) CONSTRAINT PK_DonHang PRIMARY KEY,
        MaND INT NOT NULL CONSTRAINT FK_DonHang_NguoiDung REFERENCES dbo.NguoiDung(MaND),
        NgayDat DATE NOT NULL CONSTRAINT DF_DonHang_Ngay DEFAULT CONVERT(DATE, GETDATE()),
        TongTien DECIMAL(18,2) NOT NULL CONSTRAINT DF_DonHang_Tong DEFAULT 0,
        TrangThai NVARCHAR(30) NOT NULL CONSTRAINT DF_DonHang_TrangThai DEFAULT N'Chờ xác nhận',
        DiaChiNhan NVARCHAR(255) NOT NULL,
        TenNguoiNhan NVARCHAR(100) NOT NULL,
        SoDTNhan VARCHAR(15) NOT NULL,
        HinhThucGiaoHang NVARCHAR(50) NOT NULL CONSTRAINT DF_DonHang_GiaoHang DEFAULT N'Giao tiêu chuẩn',
        PhiVanChuyen DECIMAL(18,2) NOT NULL CONSTRAINT DF_DonHang_Phi DEFAULT 0,
        GhiChu NVARCHAR(500) NULL,
        HanXacNhan DATETIME2(0) NOT NULL CONSTRAINT DF_DonHang_Han DEFAULT DATEADD(DAY, 2, SYSDATETIME()),
        CONSTRAINT CK_DonHang_Tien CHECK (TongTien >= 0 AND PhiVanChuyen >= 0 AND TongTien >= PhiVanChuyen),
        CONSTRAINT CK_DonHang_NguoiNhan CHECK (LEN(LTRIM(RTRIM(TenNguoiNhan))) > 0 AND LEN(LTRIM(RTRIM(DiaChiNhan))) > 0),
        CONSTRAINT CK_DonHang_SoDT CHECK (LEN(SoDTNhan) BETWEEN 9 AND 15 AND SoDTNhan NOT LIKE '%[^0-9+]%'),
        CONSTRAINT CK_DonHang_TrangThai CHECK (TrangThai IN
            (N'Chờ xác nhận', N'Đang xử lý', N'Đang vận chuyển', N'Đã giao hàng', N'Đã hủy'))
    );
    CREATE TABLE dbo.ChiTietDonHang (
        MaDH INT NOT NULL CONSTRAINT FK_ChiTietDonHang_DonHang REFERENCES dbo.DonHang(MaDH),
        MaSP INT NOT NULL CONSTRAINT FK_ChiTietDonHang_SanPham REFERENCES dbo.SanPham(MaSP),
        DonGia DECIMAL(18,2) NOT NULL,
        SoLuong INT NOT NULL,
        TenSPLucDat NVARCHAR(150) NOT NULL,
        CONSTRAINT PK_ChiTietDonHang PRIMARY KEY (MaDH, MaSP),
        CONSTRAINT CK_ChiTietDonHang_Gia CHECK (DonGia >= 0),
        CONSTRAINT CK_ChiTietDonHang_SoLuong CHECK (SoLuong > 0)
    );
    CREATE TABLE dbo.ThanhToan (
        MaTT INT IDENTITY(1,1) CONSTRAINT PK_ThanhToan PRIMARY KEY,
        MaDH INT NOT NULL CONSTRAINT UQ_ThanhToan_DonHang UNIQUE
            CONSTRAINT FK_ThanhToan_DonHang REFERENCES dbo.DonHang(MaDH),
        PhuongThuc VARCHAR(50) NOT NULL,
        TrangThai VARCHAR(30) NOT NULL CONSTRAINT DF_ThanhToan_TrangThai DEFAULT 'ChoThanhToan',
        NgayTT DATE NULL,
        MaGiaoDich VARCHAR(100) NULL,
        CONSTRAINT CK_ThanhToan_PhuongThuc CHECK (PhuongThuc IN ('COD', 'QR_PAY', 'MOMO', 'BANK', 'VNPAY')),
        CONSTRAINT CK_ThanhToan_TrangThai CHECK (TrangThai IN
            ('ChoThanhToan', 'DaThanhToan', 'ThatBai', 'DaHuy', 'ChoHoanTien', 'DaHoanTien')),
        CONSTRAINT CK_ThanhToan_Ngay CHECK (
            (TrangThai IN ('DaThanhToan', 'ChoHoanTien', 'DaHoanTien') AND NgayTT IS NOT NULL) OR
            (TrangThai IN ('ChoThanhToan', 'ThatBai', 'DaHuy') AND NgayTT IS NULL))
    );
    CREATE UNIQUE INDEX UX_ThanhToan_GiaoDich ON dbo.ThanhToan(MaGiaoDich) WHERE MaGiaoDich IS NOT NULL;
    CREATE TABLE dbo.DanhGia (
        MaDG INT IDENTITY(1,1) CONSTRAINT PK_DanhGia PRIMARY KEY,
        MaND INT NOT NULL CONSTRAINT FK_DanhGia_NguoiDung REFERENCES dbo.NguoiDung(MaND),
        MaSP INT NOT NULL CONSTRAINT FK_DanhGia_SanPham REFERENCES dbo.SanPham(MaSP),
        SoSao INT NOT NULL,
        NoiDung NVARCHAR(255) NULL,
        NgayGD DATE NOT NULL CONSTRAINT DF_DanhGia_Ngay DEFAULT CONVERT(DATE, GETDATE()),
        CONSTRAINT UQ_DanhGia_NguoiDung_SanPham UNIQUE (MaND, MaSP),
        CONSTRAINT CK_DanhGia_SoSao CHECK (SoSao BETWEEN 1 AND 5)
    );

    CREATE INDEX IX_NguoiDung_VaiTro ON dbo.NguoiDung(MaVT);
    CREATE INDEX IX_SanPham_DanhMuc_TrangThai ON dbo.SanPham(MaDM, TrangThai) INCLUDE (TenSP, Gia, SoLuong);
    CREATE INDEX IX_SanPham_Ten ON dbo.SanPham(TenSP);
    CREATE INDEX IX_ChiTietGioHang_SanPham ON dbo.ChiTietGioHang(MaSP);
    CREATE INDEX IX_DonHang_NguoiDung_Ngay ON dbo.DonHang(MaND, NgayDat DESC) INCLUDE (TrangThai, TongTien);
    CREATE INDEX IX_DonHang_TrangThai_Ngay ON dbo.DonHang(TrangThai, NgayDat) INCLUDE (TongTien);
    CREATE INDEX IX_ChiTietDonHang_SanPham ON dbo.ChiTietDonHang(MaSP) INCLUDE (DonGia, SoLuong);
    CREATE INDEX IX_DanhGia_SanPham ON dbo.DanhGia(MaSP, NgayGD DESC) INCLUDE (SoSao);

    COMMIT;
END
ELSE IF (SELECT COUNT(*) FROM sys.tables
         WHERE schema_id = SCHEMA_ID(N'dbo')
           AND name IN (N'VaiTro', N'NguoiDung', N'DanhMuc', N'SanPham', N'HinhAnhSanPham',
                        N'GioHang', N'ChiTietGioHang', N'DonHang', N'ChiTietDonHang', N'ThanhToan', N'DanhGia')) <> 11
    THROW 51000, N'Schema chưa đầy đủ. Không tự động ghi đè database hiện có.', 1;
GO

-- Allow VNPay when upgrading a database created from the earlier schema.
IF OBJECT_ID(N'dbo.CK_ThanhToan_PhuongThuc', N'C') IS NOT NULL
    ALTER TABLE dbo.ThanhToan DROP CONSTRAINT CK_ThanhToan_PhuongThuc;
ALTER TABLE dbo.ThanhToan ADD CONSTRAINT CK_ThanhToan_PhuongThuc
    CHECK (PhuongThuc IN ('COD', 'QR_PAY', 'MOMO', 'BANK', 'VNPAY'));
GO

IF NOT EXISTS (SELECT 1 FROM dbo.VaiTro WHERE TenVaiTro = N'Quản trị viên')
    INSERT dbo.VaiTro (TenVaiTro) VALUES (N'Quản trị viên');
IF NOT EXISTS (SELECT 1 FROM dbo.VaiTro WHERE TenVaiTro = N'Khách hàng')
    INSERT dbo.VaiTro (TenVaiTro) VALUES (N'Khách hàng');

IF NOT EXISTS (SELECT 1 FROM dbo.DanhMuc WHERE TenDM = N'Áo đấu')
    INSERT dbo.DanhMuc (TenDM, MoTa) VALUES (N'Áo đấu', N'Áo và quần bóng đá');
IF NOT EXISTS (SELECT 1 FROM dbo.DanhMuc WHERE TenDM = N'Phụ kiện')
    INSERT dbo.DanhMuc (TenDM, MoTa) VALUES (N'Phụ kiện', N'Phụ kiện bóng đá');
IF NOT EXISTS (SELECT 1 FROM dbo.DanhMuc WHERE TenDM = N'Giày bóng đá')
    INSERT dbo.DanhMuc (TenDM, MoTa) VALUES (N'Giày bóng đá', N'Giày thi đấu bóng đá');
GO

SET IDENTITY_INSERT dbo.SanPham ON;
INSERT dbo.SanPham (MaSP, TenSP, Gia, SoLuong, MoTa, MaDM)
SELECT seed.MaSP, seed.TenSP, seed.Gia, seed.SoLuong, seed.MoTa, category.MaDM
FROM (VALUES
    (1, N'Áo đá bóng sân nhà', 289000, 135, N'Áo đấu thoáng khí, form thể thao.', N'Áo đấu'),
    (2, N'Quần thể thao cao cấp', 219000, 212, N'Chất vải co giãn tốt.', N'Áo đấu'),
    (3, N'Ba lô đựng giày', 349000, 124, N'Nhiều ngăn tiện lợi.', N'Phụ kiện'),
    (4, N'Bóng thi đấu cao cấp', 499000, 245, N'Độ nảy ổn định.', N'Phụ kiện'),
    (5, N'Áo Messi phiên bản fan', 399000, 164, N'Thiết kế nổi bật.', N'Áo đấu'),
    (6, N'Giày tốc độ sân cỏ nhân tạo', 1599000, 57, N'Đế TF bám sân.', N'Giày bóng đá'),
    (7, N'Giày kiểm soát bóng', 1899000, 46, N'Hỗ trợ chạm bóng.', N'Giày bóng đá'),
    (8, N'Tất chống trượt Luxury', 99000, 96, N'Đệm chân êm.', N'Phụ kiện')
) AS seed(MaSP, TenSP, Gia, SoLuong, MoTa, TenDM)
INNER JOIN dbo.DanhMuc category ON category.TenDM = seed.TenDM
WHERE NOT EXISTS (SELECT 1 FROM dbo.SanPham existing WHERE existing.MaSP = seed.MaSP);
SET IDENTITY_INSERT dbo.SanPham OFF;
GO

-- Demo login accounts. All four use password: 123456.
INSERT dbo.NguoiDung (TenDN, Email, MatKhau, SoDT, MaVT, HoTen, TrangThai)
SELECT seed.TenDN, seed.Email,
       'scrypt$00112233445566778899aabbccddeeff$420c5c75bf7dc6971b80e3f7599bcbd7b97f6f42f1d943d308085c746c34435d6ee1e8c47ac2c8b9607bc9b4b7d1cbe4217e8b4cc89c5d03050a06521d18d14f',
       seed.SoDT, role.MaVT, seed.HoTen, seed.TrangThai
FROM (VALUES
    ('admin@gmail.com', 'admin@gmail.com', '0762525797', N'Quản trị SoccerHub', N'Hoạt động', N'Quản trị viên'),
    ('user@gmail.com', 'user@gmail.com', '0901234567', N'Nguyễn Văn An', N'Hoạt động', N'Khách hàng'),
    ('hovanb', 'hovanb@soccerhub.local', '0988888888', N'Hồ Văn Bình', N'Hoạt động', N'Khách hàng'),
    ('votanc', 'votanc@soccerhub.local', '0977777777', N'Võ Tấn Cường', N'Đã khóa', N'Khách hàng')
) AS seed(TenDN, Email, SoDT, HoTen, TrangThai, TenVaiTro)
INNER JOIN dbo.VaiTro role ON role.TenVaiTro = seed.TenVaiTro
WHERE NOT EXISTS (SELECT 1 FROM dbo.NguoiDung existing WHERE existing.TenDN = seed.TenDN);
GO

-- Upgrade demo accounts created by earlier versions of this script, whose placeholder
-- passwords could not be used to sign in.
UPDATE dbo.NguoiDung
SET MatKhau = 'scrypt$00112233445566778899aabbccddeeff$420c5c75bf7dc6971b80e3f7599bcbd7b97f6f42f1d943d308085c746c34435d6ee1e8c47ac2c8b9607bc9b4b7d1cbe4217e8b4cc89c5d03050a06521d18d14f'
WHERE TenDN IN ('admin@gmail.com','user@gmail.com','hovanb','votanc')
  AND MatKhau = REPLICATE('0',64);

UPDATE dbo.NguoiDung SET DiaChi=N'12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', NgaySinh='1998-02-14', GioiTinh=N'Nam'
WHERE TenDN='user@gmail.com' AND DiaChi IS NULL;
UPDATE dbo.NguoiDung SET DiaChi=N'25 Lê Lợi, Hải Châu, Đà Nẵng', NgaySinh='2001-07-03', GioiTinh=N'Nam'
WHERE TenDN='hovanb' AND DiaChi IS NULL;
GO

-- Product image references correspond to src/assets/img/img1.png ... img8.png.
INSERT dbo.HinhAnhSanPham (MaSP, DuongDanAnh, ThuTu)
SELECT p.MaSP, CONCAT('/src/assets/img/img',p.MaSP,'.png'), 0
FROM dbo.SanPham p
WHERE p.MaSP BETWEEN 1 AND 8
  AND NOT EXISTS (SELECT 1 FROM dbo.HinhAnhSanPham a WHERE a.MaSP=p.MaSP);
GO

-- Five repeatable demo orders cover delivery, cancellation and payment states.
INSERT dbo.DonHang (MaND, NgayDat, TongTien, TrangThai, DiaChiNhan, TenNguoiNhan, SoDTNhan, HinhThucGiaoHang, PhiVanChuyen, GhiChu)
SELECT u.MaND, seed.NgayDat, 30000, seed.TrangThai, seed.DiaChi, seed.TenNguoiNhan, seed.SoDT, seed.GiaoHang, 30000, seed.GhiChu
FROM (VALUES
    ('user@gmail.com', CONVERT(date,'2026-09-12'), N'Đã giao hàng', N'12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', N'Nguyễn Văn An', '0901234567', N'Giao tiêu chuẩn', N'Gọi trước khi giao [DEMO-SH001]'),
    ('user@gmail.com', CONVERT(date,'2026-10-03'), N'Đang vận chuyển', N'12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', N'Nguyễn Văn An', '0901234567', N'Giao nhanh', N'Giao giờ hành chính [DEMO-SH002]'),
    ('user@gmail.com', CONVERT(date,'2026-10-08'), N'Đã hủy', N'12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh', N'Nguyễn Văn An', '0901234567', N'Giao tiêu chuẩn', N'Khách đổi ý [DEMO-SH003]'),
    ('hovanb', CONVERT(date,'2026-10-17'), N'Đang xử lý', N'25 Lê Lợi, Hải Châu, Đà Nẵng', N'Hồ Văn Bình', '0988888888', N'Giao nhanh', N'Giao buổi chiều [DEMO-SH004]'),
    ('hovanb', CONVERT(date,'2026-10-22'), N'Chờ xác nhận', N'25 Lê Lợi, Hải Châu, Đà Nẵng', N'Hồ Văn Bình', '0988888888', N'Giao tiêu chuẩn', N'Đơn hàng mẫu [DEMO-SH005]')
) AS seed(TenDN,NgayDat,TrangThai,DiaChi,TenNguoiNhan,SoDT,GiaoHang,GhiChu)
JOIN dbo.NguoiDung u ON u.TenDN=seed.TenDN
WHERE NOT EXISTS (SELECT 1 FROM dbo.DonHang d WHERE d.GhiChu=seed.GhiChu);

INSERT dbo.ChiTietDonHang (MaDH,MaSP,DonGia,SoLuong,TenSPLucDat)
SELECT d.MaDH, seed.MaSP, p.Gia, seed.SoLuong, p.TenSP
FROM (VALUES
    (N'[DEMO-SH001]',1,2), (N'[DEMO-SH002]',6,1),
    (N'[DEMO-SH003]',8,1), (N'[DEMO-SH004]',4,1), (N'[DEMO-SH004]',2,2),
    (N'[DEMO-SH005]',5,1), (N'[DEMO-SH005]',3,1)
) AS seed(GhiChu,MaSP,SoLuong)
JOIN dbo.DonHang d ON CHARINDEX(seed.GhiChu,d.GhiChu)>0
JOIN dbo.SanPham p ON p.MaSP=seed.MaSP
WHERE NOT EXISTS (SELECT 1 FROM dbo.ChiTietDonHang i WHERE i.MaDH=d.MaDH AND i.MaSP=seed.MaSP);

UPDATE d SET TongTien = d.PhiVanChuyen + totals.TienHang
FROM dbo.DonHang d
JOIN (SELECT MaDH,SUM(DonGia*SoLuong) AS TienHang FROM dbo.ChiTietDonHang GROUP BY MaDH) totals ON totals.MaDH=d.MaDH
WHERE CHARINDEX(N'[DEMO-SH',d.GhiChu)>0;

INSERT dbo.ThanhToan (MaDH,PhuongThuc,TrangThai,NgayTT,MaGiaoDich)
SELECT d.MaDH, seed.PhuongThuc, seed.TrangThai, seed.NgayTT, seed.MaGiaoDich
FROM (VALUES
    (N'[DEMO-SH001]','COD','DaThanhToan',CONVERT(date,'2026-09-12'),'DEMO-COD-001'),
    (N'[DEMO-SH002]','VNPAY','DaThanhToan',CONVERT(date,'2026-10-03),'DEMO-VNPAY-002'),
    (N'[DEMO-SH003]','COD','DaHuy',CONVERT(date,NULL),NULL),
    (N'[DEMO-SH004]','QR_PAY','DaThanhToan',CONVERT(date,'2026-10-17'),'DEMO-QR-004'),
    (N'[DEMO-SH005]','COD','ChoThanhToan',CONVERT(date,NULL),NULL)
) AS seed(GhiChu,PhuongThuc,TrangThai,NgayTT,MaGiaoDich)
JOIN dbo.DonHang d ON CHARINDEX(seed.GhiChu,d.GhiChu)>0
WHERE NOT EXISTS (SELECT 1 FROM dbo.ThanhToan t WHERE t.MaDH=d.MaDH);

INSERT dbo.DanhGia (MaND,MaSP,SoSao,NoiDung,NgayGD)
SELECT u.MaND,1,5,N'Chất vải đẹp, mặc thoải mái.',CONVERT(date,'2026-09-15')
FROM dbo.NguoiDung u
WHERE u.TenDN='user@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM dbo.DanhGia r WHERE r.MaND=u.MaND AND r.MaSP=1);

INSERT dbo.GioHang (MaND)
SELECT u.MaND FROM dbo.NguoiDung u
WHERE u.TenDN='hovanb'
  AND NOT EXISTS (SELECT 1 FROM dbo.GioHang c WHERE c.MaND=u.MaND);

INSERT dbo.ChiTietGioHang (MaGH,MaSP,SoLuong)
SELECT c.MaGH,7,1 FROM dbo.GioHang c JOIN dbo.NguoiDung u ON u.MaND=c.MaND
WHERE u.TenDN='hovanb'
  AND NOT EXISTS (SELECT 1 FROM dbo.ChiTietGioHang i WHERE i.MaGH=c.MaGH AND i.MaSP=7);
GO

SELECT N'SoccerHub đã sẵn sàng' AS KetQua,
       (SELECT COUNT(*) FROM dbo.SanPham) AS SoSanPham,
       (SELECT COUNT(*) FROM dbo.NguoiDung) AS SoTaiKhoan,
       (SELECT COUNT(*) FROM dbo.DonHang) AS SoDonHang,
       (SELECT COUNT(*) FROM dbo.ThanhToan) AS SoThanhToan;
