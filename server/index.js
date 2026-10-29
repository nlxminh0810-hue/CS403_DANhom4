import 'dotenv/config'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { promisify } from 'node:util'
import { getPool, sql } from './db.js'
import { createPaymentUrl, verifyVnpaySignature } from './vnpay.js'

const scryptAsync = promisify(scrypt)
const app = express()
const port = Number(process.env.PORT || 3001)
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const apiSessions = new Map()

function createSession(user) {
  const token = randomBytes(32).toString('hex')
  apiSessions.set(token, user)
  return token
}

function requireUser(request, response, next) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const user = apiSessions.get(token)
  if (!user) return response.status(401).json({ message: 'Vui lòng �Ēng nhập lại.' })
  request.apiUser = user
  next()
}

function requireAdmin(request, response, next) {
  requireUser(request, response, () => {
    if (request.apiUser.role !== 'admin') return response.status(403).json({ message: 'Bạn không có quyền thực hi�!n thao tác này.' })
    next()
  })
}

app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
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
      SELECT p.MaSP, p.TenSP, p.Gia, p.SoLuong, p.MoTa, d.TenDM
      FROM dbo.SanPham p JOIN dbo.DanhMuc d ON d.MaDM = p.MaDM
      WHERE p.TrangThai = N'Đang bán' ORDER BY p.MaSP
    `)
    response.json({ products: result.recordset.map((p) => ({ id:p.MaSP, name:p.TenSP, price:Number(p.Gia), stock:p.SoLuong, desc:p.MoTa || '', category:p.TenDM })) })
  } catch (error) {
    console.error('Product listing failed:', error.message)
    response.status(500).json({ message: 'Không thỒ tải sản phẩm từ database.' })
  }
})

app.get('/api/admin/products', requireAdmin, async (_request, response) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`
      SELECT p.MaSP, p.TenSP, p.Gia, p.SoLuong, p.MoTa, d.TenDM
      FROM dbo.SanPham p JOIN dbo.DanhMuc d ON d.MaDM = p.MaDM ORDER BY p.MaSP
    `)
    response.json({ products: result.recordset.map((p) => ({ id:p.MaSP, name:p.TenSP, price:Number(p.Gia), stock:p.SoLuong, desc:p.MoTa || '', category:p.TenDM })) })
  } catch (error) {
    console.error('Admin product listing failed:', error.message)
    response.status(500).json({ message: 'Không thỒ tải sản phẩm.' })
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
      SELECT d.MaDH,i.TenSPLucDat,i.SoLuong
      FROM dbo.DonHang d
      JOIN dbo.NguoiDung u ON u.MaND=d.MaND
      JOIN dbo.ChiTietDonHang i ON i.MaDH=d.MaDH
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
      return { code:`SH${String(o.MaDH).padStart(3,'0')}`, user:o.TenDN, date:o.NgayDat,
        delivery:o.HinhThucGiaoHang, status:o.TrangThai,
        qty:items.reduce((sum,item)=>sum+item.SoLuong,0), total:Number(o.TongTien),
        note:o.GhiChu || '', product:items.map(item=>`${item.TenSPLucDat} x${item.SoLuong}`).join(', '), review:null }
    })
    response.json({ orders })
  } catch(error) {
    console.error('Order listing failed:', error)
    response.status(500).json({ message: `Không tải được đơn hàng: ${error.message}` })
  }
})

app.post('/api/orders', requireUser, async (request,response) => {
  const { customer, delivery, items } = request.body || {}
  const username=request.apiUser.username, name=String(delivery?.fullName || '').trim(), phone=String(delivery?.phone || '').trim()
  const address=[delivery?.address,delivery?.ward,delivery?.district,delivery?.city].map(x=>String(x||'').trim()).filter(Boolean).join(', ')
  const clean=Array.isArray(items)?items.map(x=>({id:Number(x.id),qty:Number(x.qty)})):[]
  if(!username || username.length>50 || !name || !/^\d{9,15}$/.test(phone) || !address || address.length>255 || !clean.length || clean.length>30 || clean.some(x=>!Number.isInteger(x.id)||x.id<1||!Number.isInteger(x.qty)||x.qty<1||x.qty>99)) return response.status(400).json({message:'Thông tin �ơn hàng không hợp l�!.'})
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
    for(const item of clean) if(item.qty>byId.get(item.id).SoLuong) throw Object.assign(new Error(`${byId.get(item.id).TenSP} không �ủ hàng.`),{httpStatus:400})
    const subtotal=clean.reduce((sum,x)=>sum+Number(byId.get(x.id).Gia)*x.qty,0), shipping=30000, total=subtotal+shipping
    const inserted=await new sql.Request(transaction).input('userId',sql.Int,userId).input('total',sql.Decimal(18,2),total).input('address',sql.NVarChar(255),address).input('name',sql.NVarChar(100),name).input('phone',sql.VarChar(15),phone).input('shipping',sql.Decimal(18,2),shipping).input('status',sql.NVarChar(30),String(request.body.status||'Chờ xác nhận')).input('note',sql.NVarChar(500),String(request.body.method||'COD')).query(`INSERT dbo.DonHang(MaND,TongTien,DiaChiNhan,TenNguoiNhan,SoDTNhan,PhiVanChuyen,TrangThai,GhiChu) OUTPUT INSERTED.MaDH VALUES(@userId,@total,@address,@name,@phone,@shipping,@status,@note)`)
    const orderId=inserted.recordset[0].MaDH
    for(const item of clean){const p=byId.get(item.id);const q=new sql.Request(transaction).input('id',sql.Int,item.id).input('qty',sql.Int,item.qty).input('orderId',sql.Int,orderId).input('price',sql.Decimal(18,2),Number(p.Gia)).input('name',sql.NVarChar(150),p.TenSP); await q.query(`UPDATE dbo.SanPham SET SoLuong=SoLuong-@qty WHERE MaSP=@id AND SoLuong>=@qty; IF @@ROWCOUNT=0 THROW 51001,N'Insufficient stock',1; INSERT dbo.ChiTietDonHang(MaDH,MaSP,DonGia,SoLuong,TenSPLucDat) VALUES(@orderId,@id,@price,@qty,@name)`)}
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
    const token = createSession({ id: user.id, username: user.username, role: user.role })
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
    return response.json({ user, token: createSession({ id:user.id, username:user.username, role:user.role }) })
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
