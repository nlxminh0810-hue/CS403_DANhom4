USE [SoccerHub];
GO

SET NOCOUNT ON;

SELECT N'SoccerHub' AS TenDatabase,
       (SELECT COUNT(*) FROM dbo.VaiTro) AS SoVaiTro,
       (SELECT COUNT(*) FROM dbo.SanPham) AS SoSanPham,
       (SELECT COUNT(*) FROM dbo.DanhMuc) AS SoDanhMuc,
       (SELECT COUNT(*) FROM dbo.HinhAnhSanPham) AS SoHinhAnh,
       (SELECT COUNT(*) FROM dbo.NguoiDung) AS SoTaiKhoan,
       (SELECT COUNT(*) FROM dbo.GioHang) AS SoGioHang,
       (SELECT COUNT(*) FROM dbo.ChiTietGioHang) AS SoMonTrongGio,
       (SELECT COUNT(*) FROM dbo.DonHang) AS SoDonHang,
       (SELECT COUNT(*) FROM dbo.ChiTietDonHang) AS SoDongChiTietDon,
       (SELECT COUNT(*) FROM dbo.ThanhToan) AS SoThanhToan,
       (SELECT COUNT(*) FROM dbo.DanhGia) AS SoDanhGia;

SELECT MaVT, TenVaiTro FROM dbo.VaiTro ORDER BY MaVT;

SELECT MaDM, TenDM, MoTa FROM dbo.DanhMuc ORDER BY MaDM;

SELECT p.MaSP, p.TenSP, d.TenDM AS DanhMuc, p.Gia, p.SoLuong, p.TrangThai
FROM dbo.SanPham p
JOIN dbo.DanhMuc d ON d.MaDM = p.MaDM
ORDER BY p.MaSP;

SELECT a.MaAnh, a.MaSP, p.TenSP, a.DuongDanAnh, a.ThuTu
FROM dbo.HinhAnhSanPham a
JOIN dbo.SanPham p ON p.MaSP = a.MaSP
ORDER BY a.MaSP, a.ThuTu;

SELECT u.MaND, u.TenDN, u.Email, u.HoTen, v.TenVaiTro, u.TrangThai
FROM dbo.NguoiDung u
JOIN dbo.VaiTro v ON v.MaVT = u.MaVT
ORDER BY u.MaND;

SELECT g.MaGH, u.TenDN, g.NgayTao
FROM dbo.GioHang g
JOIN dbo.NguoiDung u ON u.MaND = g.MaND
ORDER BY g.MaGH;

SELECT ct.MaGH, u.TenDN, ct.MaSP, p.TenSP, ct.SoLuong
FROM dbo.ChiTietGioHang ct
JOIN dbo.GioHang g ON g.MaGH = ct.MaGH
JOIN dbo.NguoiDung u ON u.MaND = g.MaND
JOIN dbo.SanPham p ON p.MaSP = ct.MaSP
ORDER BY ct.MaGH, ct.MaSP;

SELECT d.MaDH, u.TenDN, d.NgayDat, d.TongTien, d.TrangThai AS TrangThaiDon,
       t.PhuongThuc, t.TrangThai AS TrangThaiThanhToan
FROM dbo.DonHang d
JOIN dbo.NguoiDung u ON u.MaND = d.MaND
LEFT JOIN dbo.ThanhToan t ON t.MaDH = d.MaDH
ORDER BY d.MaDH;

SELECT ct.MaDH, ct.MaSP, ct.TenSPLucDat, ct.DonGia, ct.SoLuong,
       ct.DonGia * ct.SoLuong AS ThanhTien
FROM dbo.ChiTietDonHang ct
ORDER BY ct.MaDH, ct.MaSP;

SELECT MaTT, MaDH, PhuongThuc, TrangThai, NgayTT, MaGiaoDich
FROM dbo.ThanhToan
ORDER BY MaTT;

SELECT dg.MaDG, u.TenDN, p.TenSP, dg.SoSao, dg.NoiDung, dg.NgayGD
FROM dbo.DanhGia dg
JOIN dbo.NguoiDung u ON u.MaND = dg.MaND
JOIN dbo.SanPham p ON p.MaSP = dg.MaSP
ORDER BY dg.MaDG;
