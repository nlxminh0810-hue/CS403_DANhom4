import 'dotenv/config'
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import express from 'express'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { getPool, sql } from './db.js'
import { createPaymentUrl, verifyVnpaySignature } from './vnpay.js'

const scryptAsync = promisify(scrypt)
const app = express()
const port = Number(process.env.PORT || 3001)
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const uploadDirectory = path.join(projectDirectory, 'uploads', 'products')
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })
const smtpTransporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
        : {})
    })
  : null

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function createSession(user) {
  const token = randomBytes(32).toString('hex')
  const pool = await getPool()
  await pool.request()
    .input('userId', sql.Int, user.id)
    .input('tokenHash', sql.Char(64), hashToken(token))
    .input('expiresAt', sql.DateTime2(0), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    .query(`
      DELETE FROM dbo.PhienDangNhap WHERE HanHet <= SYSDATETIME();
      INSERT dbo.PhienDangNhap (MaND, TokenHash, HanHet) VALUES (@userId, @tokenHash, @expiresAt);
    `)
  return token
}

async function requireUser(request, response, next) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!/^[a-f0-9]{64}$/i.test(token)) return response.status(401).json({ message: 'Vui lòng đăng nhập lại.' })
  try {
    const pool = await getPool()
    const result = await pool.request()
      .input('tokenHash', sql.Char(64), hashToken(token))
      .query(`
        SELECT TOP (1) u.MaND, u.TenDN, u.TrangThai, v.TenVaiTro
        FROM dbo.PhienDangNhap s
        JOIN dbo.NguoiDung u ON u.MaND = s.MaND
        JOIN dbo.VaiTro v ON v.MaVT = u.MaVT
        WHERE s.TokenHash = @tokenHash AND s.HanHet > SYSDATETIME()
      `)
    const account = result.recordset[0]
    if (!account || account.TrangThai !== 'Hoạt động') {
      return response.status(401).json({ message: 'Phiên đăng nhập hết hạn hoặc tài khoản không hoạt động.' })
    }
    request.apiUser = {
      id: account.MaND,
      username: account.TenDN,
      role: account.TenVaiTro === 'Quản trị viên' ? 'admin' : 'user'
    }
    next()
  } catch (error) {
    console.error('Session validation failed:', error.message)
    response.status(500).json({ message: 'Không thể xác thực phiên đăng nhập.' })
  }
}

function requireAdmin(request, response, next) {
  requireUser(request, response, () => {
    if (request.apiUser.role !== 'admin') return response.status(403).json({ message: 'Bạn không có quyền thực hi�!n thao tác này.' })
    next()
  })
}

app.use(express.json({ limit: '32kb' }))
app.use('/uploads', express.static(path.join(projectDirectory, 'uploads')))

function parseProductImage(request, response, next) {
  imageUpload.single('image')(request, response, error => {
    if (!error) return next()
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    response.status(status).json({ message: status === 413 ? 'Ảnh không được vượt quá 5 MB.' : 'File ảnh không hợp lệ.' })
  })
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/auth/me', requireUser, async (request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().input('id', sql.Int, request.apiUser.id).query(`
      SELECT u.TenDN,u.Email,u.HoTen,u.SoDT,u.DiaChi,u.NgaySinh,u.GioiTinh,u.TieuSu,v.TenVaiTro
      FROM dbo.NguoiDung u JOIN dbo.VaiTro v ON v.MaVT=u.MaVT
      WHERE u.MaND=@id AND u.TrangThai=N'Hoạt động'
    `)
    const user = result.recordset[0]
    if (!user) return response.status(401).json({ message: 'Tài khoản không còn hoạt động.' })
    response.json({ user: {
      id: request.apiUser.id,
      username: user.TenDN,
      email: user.Email,
      name: user.HoTen || user.TenDN,
      phone: user.SoDT,
      address: user.DiaChi || '',
      birth: user.NgaySinh || '',
      gender: user.GioiTinh || '',
      bio: user.TieuSu || '',
      role: user.TenVaiTro === 'Quản trị viên' ? 'admin' : 'user',
      locked: false
    } })
  } catch (error) {
    console.error('Session profile lookup failed:', error.message)
    response.status(500).json({ message: 'Không thể tải thông tin phiên đăng nhập.' })
  }
})

app.post('/api/auth/logout', async (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (/^[a-f0-9]{64}$/i.test(token)) {
    try {
      const pool = await getPool()
      await pool.request().input('tokenHash', sql.Char(64), hashToken(token))
        .query('DELETE FROM dbo.PhienDangNhap WHERE TokenHash=@tokenHash')
    } catch (error) {
      console.error('Session logout failed:', error.message)
      return response.status(500).json({ message: 'Không thể kết thúc phiên đăng nhập.' })
    }
  }
  response.json({ ok: true })
})

app.delete('/api/account', requireUser, async (request, response) => {
  let transaction
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    await new sql.Request(transaction).input('id', sql.Int, request.apiUser.id).query(`
      UPDATE dbo.NguoiDung SET TrangThai=N'Đã xóa' WHERE MaND=@id AND MaVT IN (
        SELECT MaVT FROM dbo.VaiTro WHERE TenVaiTro=N'Khách hàng'
      );
      IF @@ROWCOUNT=0 THROW 51021,N'Chỉ tài khoản khách hàng mới có thể tự xóa.',1;
      DELETE FROM dbo.PhienDangNhap WHERE MaND=@id;
      DELETE FROM dbo.MaDatLaiMatKhau WHERE MaND=@id;
    `)
    await transaction.commit()
    response.json({ ok: true })
  } catch (error) {
    try { await transaction?.rollback() } catch {}
    console.error('Account deletion failed:', error.message)
    response.status(error.number === 51021 ? 403 : 500).json({ message: error.message || 'Không thể xóa tài khoản.' })
  }
})

app.post('/api/auth/password-reset/request', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
    return response.status(400).json({ message: 'Email không hợp lệ.' })
  }
  if (!smtpTransporter || !process.env.SMTP_FROM) {
    return response.status(503).json({ message: 'Chức năng đặt lại mật khẩu chưa được cấu hình email trong .env.' })
  }

  try {
    const pool = await getPool()
    const account = await pool.request().input('email', sql.VarChar(100), email).query(`
      SELECT TOP (1) MaND,Email FROM dbo.NguoiDung WHERE Email=@email AND TrangThai=N'Hoạt động'
    `)
    if (account.recordset.length) {
      const user = account.recordset[0]
      const recent = await pool.request().input('userId', sql.Int, user.MaND).query(`
        SELECT TOP (1) MaDatLai FROM dbo.MaDatLaiMatKhau
        WHERE MaND=@userId AND DaDung=0 AND NgayTao>DATEADD(MINUTE,-1,SYSDATETIME())
      `)
      if (!recent.recordset.length) {
        const code = String(randomInt(100000, 1000000))
        const codeHash = hashToken(code)
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        await pool.request().input('userId', sql.Int, user.MaND)
          .input('codeHash', sql.Char(64), codeHash)
          .input('expiresAt', sql.DateTime2(0), expiresAt)
          .query(`
            UPDATE dbo.MaDatLaiMatKhau SET DaDung=1 WHERE MaND=@userId AND DaDung=0;
            DELETE FROM dbo.MaDatLaiMatKhau WHERE HanHet<=SYSDATETIME();
            INSERT dbo.MaDatLaiMatKhau (MaND,MaCodeHash,HanHet) VALUES (@userId,@codeHash,@expiresAt);
          `)
        try {
          await smtpTransporter.sendMail({
            from: process.env.SMTP_FROM,
            to: user.Email,
            subject: 'Mã đặt lại mật khẩu SoccerHub',
            text: `Mã đặt lại mật khẩu của bạn là ${code}. Mã có hiệu lực trong 15 phút.`
          })
        } catch (error) {
          await pool.request().input('codeHash', sql.Char(64), codeHash)
            .query('DELETE FROM dbo.MaDatLaiMatKhau WHERE MaCodeHash=@codeHash')
          throw error
        }
      }
    }
    response.json({ message: 'Nếu email thuộc tài khoản đang hoạt động, mã đặt lại sẽ được gửi đến hộp thư.' })
  } catch (error) {
    console.error('Password reset request failed:', error.message)
    response.status(500).json({ message: 'Không thể gửi mã đặt lại. Vui lòng thử lại sau.' })
  }
})

app.post('/api/auth/password-reset/confirm', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const code = String(request.body?.code || '').trim()
  const password = String(request.body?.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
    return response.status(400).json({ message: 'Email, mã xác nhận hoặc mật khẩu mới không hợp lệ.' })
  }

  try {
    const pool = await getPool()
    const transaction = new sql.Transaction(pool)
    await transaction.begin()
    const match = await new sql.Request(transaction).input('email', sql.VarChar(100), email)
      .input('codeHash', sql.Char(64), hashToken(code)).query(`
        SELECT TOP (1) r.MaDatLai,u.MaND
        FROM dbo.MaDatLaiMatKhau r WITH (UPDLOCK,ROWLOCK)
        JOIN dbo.NguoiDung u ON u.MaND=r.MaND
        WHERE u.Email=@email AND u.TrangThai=N'Hoạt động'
          AND r.MaCodeHash=@codeHash AND r.DaDung=0 AND r.HanHet>SYSDATETIME()
        ORDER BY r.NgayTao DESC
      `)
    if (!match.recordset.length) {
      await transaction.rollback()
      return response.status(400).json({ message: 'Mã không đúng hoặc đã hết hạn.' })
    }
    const userId = match.recordset[0].MaND
    const salt = randomBytes(16)
    const passwordHash = await scryptAsync(password, salt, 64)
    const storedPassword = `scrypt$${salt.toString('hex')}$${passwordHash.toString('hex')}`
    await new sql.Request(transaction).input('userId', sql.Int, userId)
      .input('password', sql.VarChar(255), storedPassword)
      .input('resetId', sql.BigInt, match.recordset[0].MaDatLai).query(`
        UPDATE dbo.NguoiDung SET MatKhau=@password WHERE MaND=@userId;
        UPDATE dbo.MaDatLaiMatKhau SET DaDung=1 WHERE MaDatLai=@resetId;
        DELETE FROM dbo.PhienDangNhap WHERE MaND=@userId;
      `)
    await transaction.commit()
    response.json({ ok: true, message: 'Mật khẩu đã được cập nhật. Hãy đăng nhập lại.' })
  } catch (error) {
    console.error('Password reset confirmation failed:', error.message)
    response.status(500).json({ message: 'Không thể cập nhật mật khẩu.' })
  }
})

app.put('/api/profile', requireUser, async (request,response)=>{
  const {name='',phone='',address='',birth='',gender='',bio=''}=request.body||{}
  if(!String(name).trim()||String(name).length>100||!/^\d{9,15}$/.test(String(phone))||String(address).length>255||String(bio).length>500||!['','Nam','Nữ','Khác'].includes(String(gender)))return response.status(400).json({message:'Thông tin h� sơ không hợp l�!.'})
  try{const pool=await getPool();await pool.request().input('id',sql.Int,request.apiUser.id).input('name',sql.NVarChar(100),String(name).trim()).input('phone',sql.VarChar(15),phone).input('address',sql.NVarChar(255),address).input('birth',sql.Date,birth||null).input('gender',sql.NVarChar(10),gender||null).input('bio',sql.NVarChar(500),bio).query('UPDATE dbo.NguoiDung SET HoTen=@name,SoDT=@phone,DiaChi=@address,NgaySinh=@birth,GioiTinh=@gender,TieuSu=@bio WHERE MaND=@id');response.json({ok:true})}catch(error){console.error('Profile update failed:',error.message);response.status(500).json({message:'Không thỒ lưu h� sơ.'})}
})

// Catalog and account data are read from SQL Server so every browser sees the same records.
app.get('/api/products', async (_request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`
      SELECT p.MaSP, p.TenSP, p.Gia, p.SoLuong, p.MoTa, d.TenDM,
             (SELECT TOP (1) a.DuongDanAnh FROM dbo.HinhAnhSanPham a
              WHERE a.MaSP = p.MaSP ORDER BY a.ThuTu, a.MaAnh) AS DuongDanAnh
      FROM dbo.SanPham p JOIN dbo.DanhMuc d ON d.MaDM = p.MaDM
      WHERE p.TrangThai = N'Đang bán' ORDER BY p.MaSP
    `)
    response.json({ products: result.recordset.map((p) => ({ id:p.MaSP, name:p.TenSP, price:Number(p.Gia), stock:p.SoLuong, desc:p.MoTa || '', category:p.TenDM, imagePath:p.DuongDanAnh || '' })) })
  } catch (error) {
    console.error('Product listing failed:', error.message)
    response.status(500).json({ message: 'Không thỒ tải sản phẩm từ database.' })
  }
})

app.get('/api/admin/products', requireAdmin, async (_request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`
      SELECT p.MaSP, p.TenSP, p.Gia, p.SoLuong, p.MoTa, d.TenDM,
             (SELECT TOP (1) a.DuongDanAnh FROM dbo.HinhAnhSanPham a
              WHERE a.MaSP = p.MaSP ORDER BY a.ThuTu, a.MaAnh) AS DuongDanAnh
      FROM dbo.SanPham p JOIN dbo.DanhMuc d ON d.MaDM = p.MaDM ORDER BY p.MaSP
    `)
    response.json({ products: result.recordset.map((p) => ({ id:p.MaSP, name:p.TenSP, price:Number(p.Gia), stock:p.SoLuong, desc:p.MoTa || '', category:p.TenDM, imagePath:p.DuongDanAnh || '' })) })
  } catch (error) {
    console.error('Admin product listing failed:', error.message)
    response.status(500).json({ message: 'Không thỒ tải sản phẩm.' })
  }
})

app.post('/api/admin/products/:id/image', requireAdmin, parseProductImage, async (request, response) => {
  const productId = Number(request.params.id)
  const buffer = request.file?.buffer
  if (!Number.isInteger(productId) || productId < 1 || !buffer) {
    return response.status(400).json({ message: 'Chọn ảnh sản phẩm hợp lệ.' })
  }

  let extension
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    extension = 'png'
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    extension = 'jpg'
  } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    extension = 'webp'
  } else {
    return response.status(400).json({ message: 'Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.' })
  }

  const filename = `${productId}-${randomBytes(12).toString('hex')}.${extension}`
  const filePath = path.join(uploadDirectory, filename)
  const imagePath = `/uploads/products/${filename}`
  let fileWritten = false
  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  try {
    await mkdir(uploadDirectory, { recursive: true })
    await writeFile(filePath, buffer, { flag: 'wx' })
    fileWritten = true
    await transaction.begin()
    const existing = await new sql.Request(transaction).input('id', sql.Int, productId)
      .query('SELECT MaSP FROM dbo.SanPham WITH (UPDLOCK,HOLDLOCK) WHERE MaSP=@id')
    if (!existing.recordset.length) throw Object.assign(new Error('Không tìm thấy sản phẩm.'), { httpStatus: 404 })
    const oldImages = await new sql.Request(transaction).input('id', sql.Int, productId)
      .query('SELECT DuongDanAnh FROM dbo.HinhAnhSanPham WHERE MaSP=@id')
    await new sql.Request(transaction).input('id', sql.Int, productId)
      .query('DELETE FROM dbo.HinhAnhSanPham WHERE MaSP=@id')
    await new sql.Request(transaction)
      .input('id', sql.Int, productId)
      .input('imagePath', sql.VarChar(500), imagePath)
      .query('INSERT dbo.HinhAnhSanPham (MaSP,DuongDanAnh,ThuTu) VALUES (@id,@imagePath,0)')
    await transaction.commit()
    for (const oldImage of oldImages.recordset) {
      if (oldImage.DuongDanAnh?.startsWith('/uploads/products/')) {
        await unlink(path.join(uploadDirectory, path.basename(oldImage.DuongDanAnh))).catch(() => {})
      }
    }
    response.json({ ok: true, imagePath })
  } catch (error) {
    try { await transaction.rollback() } catch {}
    if (fileWritten) await unlink(filePath).catch(() => {})
    console.error('Product image upload failed:', error.message)
    response.status(error.httpStatus || 500).json({ message: error.message || 'Không thể lưu ảnh sản phẩm.' })
  }
})

app.post('/api/admin/products', requireAdmin, async (request, response) => {
  const { name, category, price, stock, desc = '' } = request.body || {}
  if (!String(name || '').trim() || String(name).length > 150 || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) return response.status(400).json({ message: 'Thông tin sản phẩm không hợp l�!.' })
  try {
    const pool = await getPool()
    const result = await pool.request().input('name',sql.NVarChar(150),String(name).trim()).input('category',sql.NVarChar(100),String(category)).input('price',sql.Decimal(18,2),Number(price)).input('stock',sql.Int,Number(stock)).input('desc',sql.NVarChar(255),String(desc).slice(0,255)).query(`
      INSERT dbo.SanPham (TenSP,Gia,SoLuong,MoTa,MaDM)
      OUTPUT INSERTED.MaSP
      SELECT @name,@price,@stock,@desc,MaDM FROM dbo.DanhMuc WHERE TenDM=@category
    `)
    if (!result.recordset.length) return response.status(400).json({ message: 'Danh mục không t�n tại.' })
    response.status(201).json({ id: result.recordset[0].MaSP })
  } catch (error) { console.error('Product creation failed:', error.message); response.status(500).json({ message: 'Không thỒ lưu sản phẩm.' }) }
})

app.put('/api/admin/products/:id', requireAdmin, async (request, response) => {
  const id = Number(request.params.id), { name, category, price, stock, desc = '' } = request.body || {}
  if (!Number.isInteger(id) || id < 1 || !String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) return response.status(400).json({ message: 'Thông tin sản phẩm không hợp l�!.' })
  try {
    const pool = await getPool()
    const result = await pool.request().input('id',sql.Int,id).input('name',sql.NVarChar(150),String(name).trim()).input('category',sql.NVarChar(100),String(category)).input('price',sql.Decimal(18,2),Number(price)).input('stock',sql.Int,Number(stock)).input('desc',sql.NVarChar(255),String(desc).slice(0,255)).query(`UPDATE p SET TenSP=@name,Gia=@price,SoLuong=@stock,MoTa=@desc,MaDM=d.MaDM FROM dbo.SanPham p JOIN dbo.DanhMuc d ON d.TenDM=@category WHERE p.MaSP=@id; SELECT @@ROWCOUNT AS Updated`)
    if (!result.recordset[0]?.Updated) return response.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    response.json({ ok:true })
  } catch (error) { console.error('Product update failed:', error.message); response.status(500).json({ message: 'Không thỒ cập nhật sản phẩm.' }) }
})

app.delete('/api/admin/products/:id', requireAdmin, async (request, response) => {
  const id = Number(request.params.id)
  try {
    const pool = await getPool()
    const result = await pool.request().input('id',sql.Int,id).query("UPDATE dbo.SanPham SET TrangThai=N'Ngừng bán' WHERE MaSP=@id; SELECT @@ROWCOUNT AS Updated")
    if (!result.recordset[0]?.Updated) return response.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    response.json({ ok:true })
  } catch (error) { console.error('Product deletion failed:', error.message); response.status(500).json({ message: 'Không thỒ xóa sản phẩm.' }) }
})

app.get('/api/admin/users', requireAdmin, async (_request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`SELECT u.MaND,u.TenDN,u.Email,u.HoTen,u.SoDT,u.NgayTao,u.NgaySinh,u.TrangThai,v.TenVaiTro,COUNT(DISTINCT o.MaDH) AS SoDon FROM dbo.NguoiDung u JOIN dbo.VaiTro v ON v.MaVT=u.MaVT LEFT JOIN dbo.DonHang o ON o.MaND=u.MaND GROUP BY u.MaND,u.TenDN,u.Email,u.HoTen,u.SoDT,u.NgayTao,u.NgaySinh,u.TrangThai,v.TenVaiTro ORDER BY u.MaND`)
    response.json({ customers: result.recordset.map(u => ({ id:u.MaND, username:u.TenDN, email:u.Email, name:u.HoTen || u.TenDN, phone:u.SoDT, birth:u.NgaySinh, created:u.NgayTao, orders:u.SoDon, locked:u.TrangThai !== 'Hoạt động', role:u.TenVaiTro === 'Quản trị viên' ? 'admin':'user' })) })
  } catch (error) { console.error('User listing failed:', error.message); response.status(500).json({ message: 'Không thỒ tải danh sách tài khoản.' }) }
})

app.patch('/api/admin/users/:id/status', requireAdmin, async (request, response) => {
  const id = Number(request.params.id), locked = Boolean(request.body?.locked)
  try {
    const pool = await getPool()
    const result = await pool.request().input('id',sql.Int,id).input('status',sql.NVarChar(20),locked?'Đã khóa':'Hoạt động').query(`UPDATE dbo.NguoiDung SET TrangThai=@status WHERE MaND=@id AND MaVT IN (SELECT MaVT FROM dbo.VaiTro WHERE TenVaiTro=N'Khách hàng'); SELECT @@ROWCOUNT AS Updated`)
    if (!result.recordset[0]?.Updated) return response.status(404).json({ message: 'Không thỒ cập nhật tài khoản này.' })
    response.json({ ok:true })
  } catch (error) { console.error('User status update failed:',error.message); response.status(500).json({ message:'Không thỒ cập nhật tài khoản.' }) }
})

app.get('/api/cart', requireUser, async (request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().input('userId', sql.Int, request.apiUser.id).query(`
      SELECT p.MaSP,p.TenSP,p.Gia,p.SoLuong,p.MoTa,d.TenDM,
             i.MauSac,i.KichCo,i.SoLuong AS SoLuongGio,
             (SELECT TOP (1) a.DuongDanAnh FROM dbo.HinhAnhSanPham a
              WHERE a.MaSP=p.MaSP ORDER BY a.ThuTu,a.MaAnh) AS DuongDanAnh
      FROM dbo.GioHang g
      JOIN dbo.ChiTietGioHang i ON i.MaGH=g.MaGH
      JOIN dbo.SanPham p ON p.MaSP=i.MaSP
      JOIN dbo.DanhMuc d ON d.MaDM=p.MaDM
      WHERE g.MaND=@userId AND p.TrangThai=N'Đang bán'
      ORDER BY p.MaSP,i.MauSac,i.KichCo
    `)
    response.json({ cart: result.recordset.map(item => ({
      id: item.MaSP,
      key: `${item.MaSP}-${item.MauSac}-${item.KichCo}`,
      name: item.TenSP,
      price: Number(item.Gia),
      stock: item.SoLuong,
      desc: item.MoTa || '',
      category: item.TenDM,
      imagePath: item.DuongDanAnh || '',
      color: item.MauSac,
      size: item.KichCo,
      qty: item.SoLuongGio
    })) })
  } catch (error) {
    console.error('Cart load failed:', error.message)
    response.status(500).json({ message: 'Không thể tải giỏ hàng.' })
  }
})

app.put('/api/cart', requireUser, async (request, response) => {
  const rawItems = request.body?.items
  if (!Array.isArray(rawItems) || rawItems.length > 30) {
    return response.status(400).json({ message: 'Giỏ hàng không hợp lệ.' })
  }
  const items = rawItems.map(item => ({
    id: Number(item.id),
    qty: Number(item.qty),
    color: String(item.color || '').trim(),
    size: String(item.size || '').trim()
  }))
  if (items.some(item => !Number.isInteger(item.id) || item.id < 1 ||
      !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 ||
      item.color.length > 30 || item.size.length > 10)) {
    return response.status(400).json({ message: 'Sản phẩm, số lượng hoặc biến thể không hợp lệ.' })
  }
  const keys = items.map(item => `${item.id}-${item.color}-${item.size}`)
  if (new Set(keys).size !== keys.length) {
    return response.status(400).json({ message: 'Giỏ hàng có sản phẩm biến thể bị trùng.' })
  }

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  try {
    await transaction.begin()
    const ids = [...new Set(items.map(item => item.id))]
    const productRequest = new sql.Request(transaction)
    ids.forEach((id, index) => productRequest.input(`id${index}`, sql.Int, id))
    const products = ids.length
      ? (await productRequest.query(`
          SELECT MaSP,TenSP,SoLuong FROM dbo.SanPham WITH (UPDLOCK,HOLDLOCK)
          WHERE TrangThai=N'Đang bán' AND MaSP IN (${ids.map((_id,index) => `@id${index}`).join(',')})
        `)).recordset
      : []
    const byId = new Map(products.map(product => [product.MaSP, product]))
    if (byId.size !== ids.length) throw Object.assign(new Error('Có sản phẩm không còn bán.'), { httpStatus: 400 })
    const requestedByProduct = new Map()
    for (const item of items) requestedByProduct.set(item.id, (requestedByProduct.get(item.id) || 0) + item.qty)
    for (const [id, quantity] of requestedByProduct) {
      if (quantity > byId.get(id).SoLuong) {
        throw Object.assign(new Error(`${byId.get(id).TenSP} không đủ số lượng trong kho.`), { httpStatus: 400 })
      }
    }

    const cartResult = await new sql.Request(transaction)
      .input('userId', sql.Int, request.apiUser.id)
      .query('SELECT MaGH FROM dbo.GioHang WITH (UPDLOCK,HOLDLOCK) WHERE MaND=@userId')
    let cartId = cartResult.recordset[0]?.MaGH
    if (!cartId) {
      const inserted = await new sql.Request(transaction).input('userId', sql.Int, request.apiUser.id)
        .query('INSERT dbo.GioHang (MaND) OUTPUT INSERTED.MaGH VALUES (@userId)')
      cartId = inserted.recordset[0].MaGH
    }
    await new sql.Request(transaction).input('cartId', sql.Int, cartId)
      .query('DELETE FROM dbo.ChiTietGioHang WHERE MaGH=@cartId')
    for (const item of items) {
      await new sql.Request(transaction)
        .input('cartId', sql.Int, cartId)
        .input('productId', sql.Int, item.id)
        .input('color', sql.NVarChar(30), item.color)
        .input('size', sql.NVarChar(10), item.size)
        .input('qty', sql.Int, item.qty)
        .query(`
          INSERT dbo.ChiTietGioHang (MaGH,MaSP,MauSac,KichCo,SoLuong)
          VALUES (@cartId,@productId,@color,@size,@qty)
        `)
    }
    await transaction.commit()
    response.json({ ok: true })
  } catch (error) {
    try { await transaction.rollback() } catch {}
    console.error('Cart save failed:', error.message)
    response.status(error.httpStatus || 500).json({ message: error.message || 'Không thể lưu giỏ hàng.' })
  }
})

app.get('/api/orders', requireUser, async (request, response) => {
  const username = request.apiUser.username
  const admin = request.apiUser.role === 'admin'
  const scope = admin ? '__ADMIN__' : username
  try {
    const pool = await getPool()
    const result = await pool.request().input('username', sql.VarChar(50), scope).query(`
      SELECT o.MaDH,o.NgayDat,o.TongTien,o.TrangThai,o.HinhThucGiaoHang,o.GhiChu,u.TenDN
      FROM dbo.DonHang o
      JOIN dbo.NguoiDung u ON u.MaND=o.MaND
      WHERE (@username='__ADMIN__' OR u.TenDN=@username)
      ORDER BY o.MaDH DESC
    `)
    const detailResult = await pool.request().input('username', sql.VarChar(50), scope).query(`
      SELECT d.MaDH,i.TenSPLucDat,i.SoLuong,i.MauSac,i.KichCo,r.SoSao,r.NoiDung
      FROM dbo.DonHang d
      JOIN dbo.NguoiDung u ON u.MaND=d.MaND
      JOIN dbo.ChiTietDonHang i ON i.MaDH=d.MaDH
      LEFT JOIN dbo.DanhGia r ON r.MaND=d.MaND AND r.MaSP=i.MaSP
      WHERE (@username='__ADMIN__' OR u.TenDN=@username)
      ORDER BY d.MaDH DESC
    `)
    const details = new Map()
    for (const item of detailResult.recordset) {
      const orderItems = details.get(item.MaDH) || []
      orderItems.push(item)
      details.set(item.MaDH, orderItems)
    }
    const orders = result.recordset.map(o => {
      const items = details.get(o.MaDH) || []
      const savedReview = items.find(item => item.SoSao != null)
      const product = items.map(item => {
        const variant = [item.MauSac, item.KichCo].filter(Boolean).join(' / ')
        return `${item.TenSPLucDat} x${item.SoLuong}${variant ? ` (${variant})` : ''}`
      }).join(', ')
      return { code:`SH${String(o.MaDH).padStart(3,'0')}`, user:o.TenDN, date:o.NgayDat,
        delivery:o.HinhThucGiaoHang, status:o.TrangThai,
        qty:items.reduce((sum,item)=>sum+item.SoLuong,0), total:Number(o.TongTien),
        note:o.GhiChu || '', product, review:savedReview ? { star:savedReview.SoSao, content:savedReview.NoiDung || '' } : null }
    })
    response.json({ orders })
  } catch(error) {
    console.error('Order listing failed:', error)
    response.status(500).json({ message: `Không tải được đơn hàng: ${error.message}` })
  }
})

app.post('/api/orders/:code/review', requireUser, async (request, response) => {
  const match = /^SH(\d+)$/.exec(request.params.code)
  const orderId = Number(match?.[1])
  const star = Number(request.body?.star)
  const content = String(request.body?.content || '').trim()
  if (!Number.isInteger(orderId) || orderId < 1 || !Number.isInteger(star) || star < 1 || star > 5 ||
      !content || content.length > 255) {
    return response.status(400).json({ message: 'Điểm sao hoặc nội dung đánh giá không hợp lệ.' })
  }

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  try {
    await transaction.begin()
    const order = await new sql.Request(transaction)
      .input('orderId', sql.Int, orderId)
      .input('userId', sql.Int, request.apiUser.id)
      .query(`
        SELECT MaDH FROM dbo.DonHang WITH (UPDLOCK,HOLDLOCK)
        WHERE MaDH=@orderId AND MaND=@userId AND TrangThai=N'Đã giao hàng'
      `)
    if (!order.recordset.length) {
      await transaction.rollback()
      return response.status(404).json({ message: 'Chỉ có thể đánh giá đơn đã giao của bạn.' })
    }
    const products = await new sql.Request(transaction).input('orderId', sql.Int, orderId).query(`
      SELECT DISTINCT MaSP FROM dbo.ChiTietDonHang WHERE MaDH=@orderId
    `)
    if (!products.recordset.length) {
      await transaction.rollback()
      return response.status(400).json({ message: 'Đơn hàng không có sản phẩm để đánh giá.' })
    }
    for (const product of products.recordset) {
      const reviewRequest = new sql.Request(transaction)
        .input('userId', sql.Int, request.apiUser.id)
        .input('productId', sql.Int, product.MaSP)
        .input('star', sql.Int, star)
        .input('content', sql.NVarChar(255), content)
      await reviewRequest.query(`
        IF EXISTS (SELECT 1 FROM dbo.DanhGia WHERE MaND=@userId AND MaSP=@productId)
          UPDATE dbo.DanhGia SET SoSao=@star,NoiDung=@content,NgayGD=CONVERT(DATE,GETDATE())
          WHERE MaND=@userId AND MaSP=@productId;
        ELSE
          INSERT dbo.DanhGia (MaND,MaSP,SoSao,NoiDung)
          VALUES (@userId,@productId,@star,@content);
      `)
    }
    await transaction.commit()
    response.json({ ok: true, review: { star, content } })
  } catch (error) {
    try { await transaction.rollback() } catch {}
    console.error('Review save failed:', error.message)
    response.status(500).json({ message: 'Không thể lưu đánh giá.' })
  }
})

app.post('/api/orders', requireUser, async (request,response) => {
  const { customer, delivery, items } = request.body || {}
  const username=request.apiUser.username, name=String(delivery?.fullName || '').trim(), phone=String(delivery?.phone || '').trim()
  const address=[delivery?.address,delivery?.ward,delivery?.district,delivery?.city].map(x=>String(x||'').trim()).filter(Boolean).join(', ')
  const clean=Array.isArray(items)?items.map(x=>({id:Number(x.id),qty:Number(x.qty),color:String(x.color||'').trim(),size:String(x.size||'').trim()})):[]
  if(!username || username.length>50 || !name || !/^\d{9,15}$/.test(phone) || !address || address.length>255 || !clean.length || clean.length>30 || clean.some(x=>!Number.isInteger(x.id)||x.id<1||!Number.isInteger(x.qty)||x.qty<1||x.qty>99)) return response.status(400).json({message:'Thông tin �ơn hàng không hợp l�!.'})
  if(clean.some(item=>item.color.length>30||item.size.length>10)) return response.status(400).json({message:'Màu sắc hoặc kích cỡ không hợp lệ.'})
  const transactionPool = await getPool()
  const transaction = new sql.Transaction(transactionPool)
  try {
    await transaction.begin()
    const req=new sql.Request(transaction).input('username',sql.VarChar(50),username)
    const userResult=await req.query('SELECT MaND FROM dbo.NguoiDung WHERE TenDN=@username AND TrangThai=N\'Hoạt động\'')
    if(!userResult.recordset.length) throw Object.assign(new Error('Tài khoản không hợp l�!.'),{httpStatus:401})
    const userId=userResult.recordset[0].MaND
    const ids=[...new Set(clean.map(x=>x.id))], pr=new sql.Request(transaction)
    ids.forEach((id,i)=>pr.input(`id${i}`,sql.Int,id))
    const products=(await pr.query(`SELECT MaSP,TenSP,Gia,SoLuong FROM dbo.SanPham WITH (UPDLOCK,HOLDLOCK) WHERE TrangThai=N'Đang bán' AND MaSP IN (${ids.map((_,i)=>`@id${i}`).join(',')})`)).recordset
    const byId=new Map(products.map(x=>[x.MaSP,x]))
    if(byId.size!==ids.length) throw Object.assign(new Error('Sản phẩm không còn bán.'),{httpStatus:400})
    const requestedByProduct=new Map()
    for(const item of clean) requestedByProduct.set(item.id,(requestedByProduct.get(item.id)||0)+item.qty)
    for(const [id,quantity] of requestedByProduct) if(quantity>byId.get(id).SoLuong) throw Object.assign(new Error(`${byId.get(id).TenSP} không đủ hàng.`),{httpStatus:400})
    for(const item of clean) if(item.qty>byId.get(item.id).SoLuong) throw Object.assign(new Error(`${byId.get(item.id).TenSP} không �ủ hàng.`),{httpStatus:400})
    const subtotal=clean.reduce((sum,x)=>sum+Number(byId.get(x.id).Gia)*x.qty,0), shipping=30000, total=subtotal+shipping
    const inserted=await new sql.Request(transaction).input('userId',sql.Int,userId).input('total',sql.Decimal(18,2),total).input('address',sql.NVarChar(255),address).input('name',sql.NVarChar(100),name).input('phone',sql.VarChar(15),phone).input('shipping',sql.Decimal(18,2),shipping).input('status',sql.NVarChar(30),String(request.body.status||'Chờ xác nhận')).input('note',sql.NVarChar(500),String(request.body.method||'COD')).query(`INSERT dbo.DonHang(MaND,TongTien,DiaChiNhan,TenNguoiNhan,SoDTNhan,PhiVanChuyen,TrangThai,GhiChu) OUTPUT INSERTED.MaDH VALUES(@userId,@total,@address,@name,@phone,@shipping,@status,@note)`)
    const orderId=inserted.recordset[0].MaDH
    for (const item of clean) {
      const product = byId.get(item.id)
      const lineRequest = new sql.Request(transaction)
        .input('id', sql.Int, item.id)
        .input('qty', sql.Int, item.qty)
        .input('orderId', sql.Int, orderId)
        .input('price', sql.Decimal(18, 2), Number(product.Gia))
        .input('name', sql.NVarChar(150), product.TenSP)
        .input('color', sql.NVarChar(30), item.color)
        .input('size', sql.NVarChar(10), item.size)
      await lineRequest.query(`
        UPDATE dbo.SanPham SET SoLuong=SoLuong-@qty WHERE MaSP=@id AND SoLuong>=@qty;
        IF @@ROWCOUNT=0 THROW 51001,N'Insufficient stock',1;
        INSERT dbo.ChiTietDonHang (MaDH,MaSP,MauSac,KichCo,DonGia,SoLuong,TenSPLucDat)
        VALUES (@orderId,@id,@color,@size,@price,@qty,@name)
      `)
    }
    await new sql.Request(transaction).input('orderId',sql.Int,orderId).input('method',sql.VarChar(50),request.body.methodId==='cod'?'COD':'BANK').query(`INSERT dbo.ThanhToan(MaDH,PhuongThuc,TrangThai) VALUES(@orderId,@method,'ChoThanhToan')`)
    await transaction.commit()
    response.status(201).json({orderCode:`SH${String(orderId).padStart(3,'0')}`,total})
  } catch(error) { try{await transaction.rollback()}catch{}; console.error('Order creation failed:',error.message); response.status(error.httpStatus||500).json({message:error.message||'Không thỒ tạo �ơn hàng.'}) }
})

app.patch('/api/admin/orders/:code/status', requireAdmin, async(request,response)=>{
  const match=/^SH(\d+)$/.exec(request.params.code), id=Number(match?.[1]), status=String(request.body?.status||'')
  const allowed=['Chờ xác nhận','Đang xử lý','Đang vận chuyển','Đã giao hàng','Đã hủy']
  if(!Number.isInteger(id)||!allowed.includes(status))return response.status(400).json({message:'Trạng thái không hợp l�!.'})
  try{const pool=await getPool();const result=await pool.request().input('id',sql.Int,id).input('status',sql.NVarChar(30),status).query('UPDATE dbo.DonHang SET TrangThai=@status WHERE MaDH=@id; SELECT @@ROWCOUNT AS Updated');if(!result.recordset[0]?.Updated)return response.status(404).json({message:'Không tìm thấy �ơn hàng.'});response.json({ok:true})}catch(error){console.error('Order status update failed:',error.message);response.status(500).json({message:'Không thỒ cập nhật �ơn hàng.'})}
})

app.post('/api/auth/register', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const name = String(request.body?.name || '').trim()
  const phone = String(request.body?.phone || '').trim()
  const password = String(request.body?.password || '')

  if (email.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !name || name.length > 100 || !/^\d{9,15}$/.test(phone) ||
      password.length < 6 || password.length > 128) {
    return response.status(400).json({ message: 'Thông tin đăng ký không hợp lệ.' })
  }

  try {
    const user = await createRegisteredUser({ email, name, phone, password })
    const token = await createSession({ id: user.id, username: user.username, role: user.role })
    return response.status(201).json({ user, token })
  } catch (error) {
    if (error.code === 'ACCOUNT_EXISTS') {
      return response.status(409).json({ message: 'Email này đã được sử dụng.' })
    }
    console.error('Registration account creation failed:', error.message)
    return response.status(500).json({ message: 'Không thể tạo tài khoản. Vui lòng thử lại sau.' })
  }
})

async function createRegisteredUser({ email, name, phone, password }) {
  const pool = await getPool()
  const role = await pool.request()
    .query("SELECT TOP (1) MaVT FROM dbo.VaiTro WHERE TenVaiTro = N'Khách hàng'")
  if (!role.recordset.length) throw new Error('Thi�u vai tr� Kh�ch h�ng trong database.')

  const salt = randomBytes(16)
  const passwordHash = await scryptAsync(password, salt, 64)
  const storedPassword = `scrypt$${salt.toString('hex')}$${passwordHash.toString('hex')}`

  try {
    const inserted = await pool.request()
      .input('email', sql.VarChar(100), email)
      .input('password', sql.VarChar(255), storedPassword)
      .input('phone', sql.VarChar(15), phone)
      .input('roleId', sql.Int, role.recordset[0].MaVT)
      .input('name', sql.NVarChar(100), name)
      .query(`
        INSERT INTO dbo.NguoiDung (TenDN, Email, MatKhau, SoDT, MaVT, HoTen)
        OUTPUT INSERTED.MaND, INSERTED.TenDN, INSERTED.Email, INSERTED.SoDT, INSERTED.HoTen
        VALUES (@email, @email, @password, @phone, @roleId, @name)
      `)

    const insertedUser = inserted.recordset[0]
    return {
      id: insertedUser.MaND,
      username: insertedUser.TenDN,
      email: insertedUser.Email,
      phone: insertedUser.SoDT,
      name: insertedUser.HoTen,
      role: 'user',
      locked: false
    }
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      error.code = 'ACCOUNT_EXISTS'
    }
    throw error
  }
}

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  if (!email || email.length > 100 || !password || password.length > 128) {
    return response.status(400).json({ message: 'Tài khoản hoặc mật khẩu không hợp lệ.' })
  }

  try {
    const pool = await getPool()
    const result = await pool.request()
      .input('email', sql.VarChar(100), email)
      .query(`
        SELECT TOP (1) nd.MaND, nd.TenDN, nd.Email, nd.MatKhau, nd.SoDT,
        nd.HoTen, nd.TrangThai, nd.DiaChi, nd.NgaySinh, nd.GioiTinh, nd.TieuSu, vt.TenVaiTro
        FROM dbo.NguoiDung nd
        INNER JOIN dbo.VaiTro vt ON vt.MaVT = nd.MaVT
        WHERE nd.Email = @email OR nd.TenDN = @email
      `)
    const account = result.recordset[0]
    const storedHash = String(account?.MatKhau || '').split('$')
    if (!account || storedHash.length !== 3 || storedHash[0] !== 'scrypt' ||
        !/^[a-f0-9]{32}$/i.test(storedHash[1]) || !/^[a-f0-9]{128}$/i.test(storedHash[2])) {
      return response.status(401).json({ message: 'Tài khoản hoặc mật khẩu không đúng.' })
    }

    const salt = Buffer.from(storedHash[1], 'hex')
    const expectedHash = Buffer.from(storedHash[2], 'hex')
    const actualHash = await scryptAsync(password, salt, expectedHash.length)
    if (!timingSafeEqual(actualHash, expectedHash)) {
      return response.status(401).json({ message: 'Tài khoản hoặc mật khẩu không đúng.' })
    }

    if (account.TrangThai !== 'Hoạt động') {
      return response.status(403).json({ message: 'Tài khoản này đã bị khóa.' })
    }

    const user = {
        id: account.MaND,
        username: account.TenDN,
        email: account.Email,
        phone: account.SoDT,
        name: account.HoTen,
        address: account.DiaChi || '',
        birth: account.NgaySinh || '',
        gender: account.GioiTinh || '',
        bio: account.TieuSu || '',
        role: account.TenVaiTro === 'Quản trị viên' ? 'admin' : 'user',
        locked: false
      }
    const token = await createSession({ id: user.id, username: user.username, role: user.role })
    return response.json({ user, token })
  } catch (error) {
    console.error('Account login failed:', error.message)
    return response.status(500).json({ message: 'Không thể đăng nhập. Vui lòng thử lại sau.' })
  }
})

app.post('/api/payments/vnpay', requireUser, async (request, response) => {
  const { customer, delivery, items } = request.body || {}
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    return response.status(400).json({ message: 'Giỏ hàng không hợp lệ.' })
  }

  const cleanItems = items.map((item) => ({ id: Number(item.id), qty: Number(item.qty) }))
  if (cleanItems.some(({ id, qty }) =>
    !Number.isInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1 || qty > 99
  )) {
    return response.status(400).json({ message: 'Sản phẩm hoặc số lượng không hợp lệ.' })
  }

  const username = request.apiUser.username
  if (String(customer?.username || '') !== username) return response.status(403).json({ message:'Tài khoản �ặt hàng không kh�:p phiên �Ēng nhập.' })
  const customerName = String(customer?.name || delivery?.fullName || '').trim()
  const phone = String(delivery?.phone || '').trim()
  const address = [delivery?.address, delivery?.ward, delivery?.district, delivery?.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')

  if (!username || username.length > 50 || !customerName || customerName.length > 100 ||
      !/^\d{9,15}$/.test(phone) || !address || address.length > 255) {
    return response.status(400).json({ message: 'Thông tin người nhận không hợp lệ.' })
  }

  try {
    const pool = await getPool()
    const itemIds = [...new Set(cleanItems.map((item) => item.id))]
    const productsRequest = pool.request()
    itemIds.forEach((id, index) => productsRequest.input(`id${index}`, sql.Int, id))
    const idParameters = itemIds.map((_id, index) => `@id${index}`).join(',')
    const productsResult = await productsRequest.query(`
      SELECT MaSP, TenSP, Gia, SoLuong
      FROM dbo.SanPham
      WHERE TrangThai = N'Đang bán' AND MaSP IN (${idParameters})
    `)
    const products = new Map(productsResult.recordset.map((product) => [product.MaSP, product]))

    if (products.size !== itemIds.length) {
      return response.status(400).json({ message: 'C� s�n ph�m kh�ng c�n ��c b�n.' })
    }
    for (const item of cleanItems) {
      const product = products.get(item.id)
      if (item.qty > product.SoLuong) {
        return response.status(400).json({ message: `${product.TenSP} không đủ số lượng trong kho.` })
      }
    }

    const subtotal = cleanItems.reduce((sum, item) =>
      sum + Math.round(Number(products.get(item.id).Gia) * 100) * item.qty, 0) / 100
    const shippingFee = 30000
    const total = subtotal + shippingFee
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    let orderCode
    let paymentUrl
    try {
      const roleResult = await new sql.Request(transaction).query(`
        SELECT TOP (1) MaVT FROM dbo.VaiTro WHERE TenVaiTro = N'Khách hàng'
      `)
      if (!roleResult.recordset.length) throw new Error('Thi�u vai tr� Kh�ch h�ng trong database.')

      const email = username.includes('@') ? username : `${username}@soccerhub.local`
      const existingUser = await new sql.Request(transaction)
        .input('username', sql.VarChar(50), username)
        .input('email', sql.VarChar(100), email)
        .query('SELECT TOP (1) MaND FROM dbo.NguoiDung WHERE TenDN = @username OR Email = @email')

      let userId = existingUser.recordset[0]?.MaND
      if (!userId) {
        const insertedUser = await new sql.Request(transaction)
          .input('username', sql.VarChar(50), username)
          .input('email', sql.VarChar(100), email)
          .input('password', sql.VarChar(255), 'DEMO-ONLY'.padEnd(60, 'x'))
          .input('phone', sql.VarChar(15), phone)
          .input('address', sql.NVarChar(255), address)
          .input('roleId', sql.Int, roleResult.recordset[0].MaVT)
          .input('name', sql.NVarChar(100), customerName)
          .query(`
            INSERT INTO dbo.NguoiDung (TenDN, Email, MatKhau, SoDT, DiaChi, MaVT, HoTen)
            OUTPUT INSERTED.MaND
            VALUES (@username, @email, @password, @phone, @address, @roleId, @name)
          `)
        userId = insertedUser.recordset[0].MaND
      }

      const insertedOrder = await new sql.Request(transaction)
        .input('userId', sql.Int, userId)
        .input('total', sql.Decimal(18, 2), total)
        .input('address', sql.NVarChar(255), address)
        .input('name', sql.NVarChar(100), customerName)
        .input('phone', sql.VarChar(15), phone)
        .input('shippingFee', sql.Decimal(18, 2), shippingFee)
        .query(`
          INSERT INTO dbo.DonHang (MaND, TongTien, DiaChiNhan, TenNguoiNhan, SoDTNhan, GhiChu, PhiVanChuyen)
          OUTPUT INSERTED.MaDH
          VALUES (@userId, @total, @address, @name, @phone, N'Thanh to�n qua VNPay', @shippingFee)
        `)
      const orderId = insertedOrder.recordset[0].MaDH
      orderCode = `SH${String(orderId).padStart(3, '0')}`

      for (const item of cleanItems) {
        const product = products.get(item.id)
        await new sql.Request(transaction)
          .input('orderId', sql.Int, orderId)
          .input('productId', sql.Int, item.id)
          .input('price', sql.Decimal(18, 2), Number(product.Gia))
          .input('qty', sql.Int, item.qty)
          .input('productName', sql.NVarChar(150), product.TenSP)
          .query(`
            INSERT INTO dbo.ChiTietDonHang (MaDH, MaSP, DonGia, SoLuong, TenSPLucDat)
            VALUES (@orderId, @productId, @price, @qty, @productName)
          `)
      }

      await new sql.Request(transaction)
        .input('orderId', sql.Int, orderId)
        .query("INSERT INTO dbo.ThanhToan (MaDH, PhuongThuc, TrangThai) VALUES (@orderId, 'VNPAY', 'ChoThanhToan')")

      const ip = String(request.headers['x-forwarded-for'] || request.ip)
        .split(',')[0]
        .trim()
        .replace(/^::ffff:/, '')
      paymentUrl = createPaymentUrl(orderCode, total, ip === '::1' ? '127.0.0.1' : ip)
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    return response.json({ orderCode, paymentUrl, amount: total })
  } catch (error) {
    console.error('VNPay order creation failed:', error.message)
    return response.status(500).json({ message: error.message || 'Không thể tạo giao dịch VNPay.' })
  }
})

async function processVnpayResult(params) {
  if (!verifyVnpaySignature(params)) return { code: '97', message: 'Chữ ký VNPay không hợp lệ.' }

  const orderCode = String(params.vnp_TxnRef || '')
  const match = /^SH(\d+)$/.exec(orderCode)
  const orderId = Number(match?.[1])
  if (!Number.isSafeInteger(orderId) || orderId < 1) return { code: '01', message: 'Không tìm thấy đơn hàng.' }

  const pool = await getPool()
  const foundOrder = await pool.request()
    .input('orderId', sql.Int, orderId)
    .query(`
      SELECT d.TongTien, t.TrangThai AS PaymentStatus
      FROM dbo.DonHang d
      INNER JOIN dbo.ThanhToan t ON t.MaDH = d.MaDH
      WHERE d.MaDH = @orderId AND t.PhuongThuc = 'VNPAY'
    `)
  if (!foundOrder.recordset.length) return { code: '01', message: 'Không tìm thấy đơn hàng.' }

  const expectedAmount = Math.round(Number(foundOrder.recordset[0].TongTien) * 100)
  if (Number(params.vnp_Amount) !== expectedAmount) return { code: '04', message: 'Số tiền giao dịch không khớp.' }
  if (foundOrder.recordset[0].PaymentStatus === 'DaThanhToan') {
    return { code: '02', message: 'Giao d�ch � ��c x�c nh�n tr��c �.' }
  }

  const paid = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00'
  const updated = await pool.request()
    .input('orderId', sql.Int, orderId)
    .input('paymentStatus', sql.VarChar(30), paid ? 'DaThanhToan' : 'ThatBai')
    .input('transactionNo', sql.VarChar(100), String(params.vnp_TransactionNo || '').slice(0, 100) || null)
    .input('paid', sql.Bit, paid)
    .query(`
      UPDATE dbo.ThanhToan
      SET TrangThai = @paymentStatus,
          NgayTT = CASE WHEN @paid = 1 THEN CONVERT(DATE, GETDATE()) ELSE NULL END,
          MaGiaoDich = @transactionNo
      WHERE MaDH = @orderId AND TrangThai = 'ChoThanhToan';
      DECLARE @paymentRows INT = @@ROWCOUNT;
      IF @paid = 1
        UPDATE dbo.DonHang SET TrangThai = N'Đang xử lý' WHERE MaDH = @orderId;
      SELECT @paymentRows AS Updated;
    `)

  if (!updated.recordset[0]?.Updated) return { code: '02', message: 'Giao dịch đã được xử lý.' }
  return paid
    ? { code: '00', message: 'Thanh to�n th�nh c�ng.' }
    : { code: '00', message: 'Thanh to�n ch�a th�nh c�ng.' }
}

app.get('/api/payments/vnpay/ipn', async (request, response) => {
  try {
    const result = await processVnpayResult(request.query)
    response.json({ RspCode: result.code, Message: result.message })
  } catch (error) {
    console.error('VNPay IPN failed:', error.message)
    response.json({ RspCode: '99', Message: 'Lỗi xử lý IPN.' })
  }
})

app.get('/api/payments/vnpay/return', async (request, response) => {
  const orderCode = String(request.query.vnp_TxnRef || '')
  try {
    await processVnpayResult(request.query)
  } catch (error) {
    console.error('VNPay return failed:', error.message)
  }

  const returnUrl = new URL(frontendUrl)
  returnUrl.searchParams.set('vnpay', '1')
  returnUrl.searchParams.set('ref', orderCode)
  response.redirect(returnUrl.toString())
})

app.get('/api/payments/:orderCode', requireUser, async (request, response) => {
  const match = /^SH(\d+)$/.exec(request.params.orderCode)
  const orderId = Number(match?.[1])
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return response.status(400).json({ message: 'Mã đơn hàng không hợp lệ.' })
  }

  try {
    const pool = await getPool()
    const result = await pool.request()
      .input('orderId', sql.Int, orderId)
      .input('userId', sql.Int, request.apiUser.id)
      .query(`
        SELECT d.MaDH, d.TongTien, d.TrangThai,
               t.TrangThai AS PaymentStatus
        FROM dbo.DonHang d
        INNER JOIN dbo.ThanhToan t ON t.MaDH = d.MaDH
        WHERE d.MaDH = @orderId AND t.PhuongThuc = 'VNPAY' AND d.MaND = @userId;
        SELECT TenSPLucDat, SoLuong FROM dbo.ChiTietDonHang WHERE MaDH = @orderId;
        SELECT TenDN FROM dbo.NguoiDung WHERE MaND = (SELECT MaND FROM dbo.DonHang WHERE MaDH = @orderId);
      `)
    const order = result.recordsets[0]?.[0]
    if (!order) return response.status(404).json({ message: 'Không tìm thấy đơn hàng.' })

    const items = result.recordsets[1] || []
    return response.json({
      paymentStatus: order.PaymentStatus,
      order: {
        code: `SH${String(order.MaDH).padStart(3, '0')}`,
        user: result.recordsets[2]?.[0]?.TenDN || '',
        delivery: 'Giao tiêu chuẩn',
        status: order.TrangThai,
        qty: items.reduce((sum, item) => sum + item.SoLuong, 0),
        total: Number(order.TongTien),
        note: 'VNPay',
        product: items.map((item) => `${item.TenSPLucDat} x${item.SoLuong}`).join(', '),
        review: null
      }
    })
  } catch (error) {
    console.error('VNPay status lookup failed:', error.message)
    return response.status(500).json({ message: 'Kh�ng th� ki�m tra tr�ng th�i thanh to�n.' })
  }
})

app.listen(port, () => console.log(`SoccerHub API listening on http://localhost:${port}`))
