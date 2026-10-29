<template>
  <div>

    <AppHeader
      :page="page"
      :tabs="tabs"
      :user="currentUser"
      :cart-count="cartCount"
      @navigate="setPage"
      @login="openLogin"
      @register="openRegister"
    />

    <main class="main">

      <div class="search-area">

        <input
          v-model="keyword"
          type="search"
          placeholder="Hôm nay bạn muốn mua gì ?"
        >

        <button
          class="search-btn"
          @click="setPage('shop')"
        >
          <i class="bi bi-search"></i>
        </button>

        <button
          class="user-btn"
          @click="setPage('profile')"
        >
          <i class="bi bi-person-fill"></i>
        </button>

      </div>

      <!-- HOME -->
      <TrangChu
        v-if="page === 'home'"
        :products="products"
        @navigate="setPage"
      />

      <!-- SHOP -->
      <CuaHang
        v-else-if="page === 'shop'"
        :products="products"
        :keyword="keyword"
        @detail="openDetail"
        @cart="addCart"
      />

      <!-- DETAIL -->
      <ChiTietSanPham
        v-else-if="
          page === 'detail'
          &&
          selectedProduct
        "
        :product="selectedProduct"
        @cart="addCart"
        @buy="buyNow"
      />

      <!-- LOGIN -->
      <DangNhap
        v-else-if="page === 'login'"
        :customers="customers"
        @submit="login"
        @social="socialLogin"
        @forgot="page = 'forgot'"
        @register="openRegister"
        @navigate="setPage"
      />

      <!-- REGISTER -->
      <DangKy
        v-else-if="page === 'register'"
        :customers="customers"
        @submit="register"
        @social="socialLogin"
        @login="openLogin"
        @navigate="setPage"
      />

      <!-- FORGOT -->
      <QuenMatKhau
        v-else-if="page === 'forgot'"
        @login="openLogin"
      />

      <!-- CART -->
      <GioHang
        v-else-if="page === 'cart'"
        :cart="cart"
        @remove="removeCart"
        @checkout="setPage('payment')"
      />

      <!-- PAYMENT -->
      <ThanhToan
        v-else-if="page === 'payment'"
        :cart="cart"
        :total="cartTotal"
        :customer="currentUser"
        :initial-delivery="checkoutDelivery"
        @confirm="confirmOrder"
      />

      <!-- ORDER -->
      <DonHang
        v-else-if="page === 'orders'"
        :orders="orders"
        :current-user="currentUser"
        @status="updateOrderStatus"
      />

      <!-- PROFILE -->
      <HoSo
        v-else-if="page === 'profile'"
        :profile="profile"
        @save="saveProfile"
        @logout="logout"
        @delete="deleteAccount"
      />

      <!-- ADMIN PRODUCT -->
      <QuanLySanPham
        v-else-if="
          page === 'adminProducts'
          &&
          currentUser?.role === 'admin'
        "
        :products="products"
        @add="addProduct"
        @update="updateProduct"
        @delete="deleteProduct"
        @detail="openDetail"
      />

      <!-- ADMIN USER -->
      <QuanLyNguoiDung
        v-else-if="
          page === 'adminUsers'
          &&
          currentUser?.role === 'admin'
        "
        :customers="customers"
        @delete="deleteCustomer"
        @status="setCustomerStatus"
      />

      <!-- REPORT -->
      <BaoCao
        v-else-if="
          page === 'reports'
          &&
          currentUser?.role === 'admin'
        "
        :orders="orders"
        :products="products"
      />

    </main>
  </div>
</template>

<script setup>
import {
  computed,
  onMounted,
  ref
} from 'vue'

import AppHeader from './components/AppHeader.vue'

import TrangChu from './views/TrangChu.vue'
import CuaHang from './views/CuaHang.vue'
import ChiTietSanPham from './views/ChiTietSanPham.vue'

import DangNhap from './views/DangNhap.vue'
import DangKy from './views/DangKy.vue'
import QuenMatKhau from './views/QuenMatKhau.vue'

import GioHang from './views/GioHang.vue'
import ThanhToan from './views/ThanhToan.vue'

import DonHang from './views/DonHang.vue'
import HoSo from './views/HoSo.vue'

import QuanLySanPham from './views/QuanLySanPham.vue'
import QuanLyNguoiDung from './views/QuanLyNguoiDung.vue'
import BaoCao from './views/BaoCao.vue'


/* =========================
   STATE
========================= */

const page = ref('home')

const keyword = ref('')

const selectedProduct = ref(null)

const currentUser = ref(null)

const products = ref([])
const orders = ref([])
const customers = ref([])
const apiToken = ref(sessionStorage.getItem('soccerhub-session') || '')

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (apiToken.value) headers.Authorization = `Bearer ${apiToken.value}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(path, { ...options, headers })
}

function productWithImage(product) {
  return { ...product, image: new URL(`./assets/img/img${product.id}.png`, import.meta.url).href }
}

async function loadProducts(admin = false) {
  const response = await apiFetch(admin ? '/api/admin/products' : '/api/products')
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'KhÃ´ng thá»ƒ táº£i sáº£n pháº©m.')
  products.value = (result.products || []).map(productWithImage)
}

async function loadOrders() {
  const response = await apiFetch('/api/orders')
  const body = await response.text()
  let result = {}
  try { result = JSON.parse(body) } catch {}
  if (!response.ok) {
    const detail = result.message || body || 'Máy chủ không gửi nội dung lỗi.'
    throw new Error(`Tải đơn hàng thất bại (HTTP ${response.status}): ${detail}`)
  }
  orders.value = result.orders || []
}

const cart = ref([])
const checkoutDelivery = ref(null)

const profile = ref({

  name: '',

  birth: '',

  gender: '',

  email: '',

  phone: '',

  address: '',

  bio: ''
})

/* =========================
   ROLE MENU
========================= */

const tabs = computed(() => {

  // CHƯA LOGIN
  if (!currentUser.value) {

    return [

      {
        id: 'home',
        name: 'Trang chủ'
      },

      {
        id: 'shop',
        name: 'Sản phẩm'
      }

    ]
  }

  // ADMIN
  if (
    currentUser.value.role ===
    'admin'
  ) {

    return [

      {
        id: 'home',
        name: 'Trang chủ'
      },

      {
        id: 'shop',
        name: 'Sản phẩm'
      },

      {
        id: 'orders',
        name: 'Quản lý đơn hàng'
      },

      {
        id: 'adminProducts',
        name: 'QL sản phẩm'
      },

      {
        id: 'adminUsers',
        name: 'QL tài khoản'
      },

      {
        id: 'reports',
        name: 'Thống kê'
      }

    ]
  }

  // USER
  return [

    {
      id: 'home',
      name: 'Trang chủ'
    },

    {
      id: 'shop',
      name: 'Sản phẩm'
    },

    {
      id: 'orders',
      name: 'Đơn hàng'
    }

  ]
})

/* =========================
   PAGE PROTECT
========================= */

const protectedPages = [

  'cart',

  'payment',

  'profile',

  'orders',

  'adminProducts',

  'adminUsers',

  'reports'
]

/* =========================
   CART
========================= */

const cartCount = computed(() =>
  cart.value.reduce(
    (sum,item)=>
      sum + Number(item.qty || 0),
    0
  )
)

const cartTotal = computed(() =>
  cart.value.reduce(
    (sum,item)=>
      sum +
      item.price *
      Number(item.qty || 0),
    0
  )
)

/* =========================
   NAVIGATION
========================= */

function setPage(nextPage) {

  // CHƯA LOGIN
  if (
    protectedPages.includes(nextPage)
    &&
    !currentUser.value
  ) {

    page.value = 'login'

    return
  }

  // USER KHÔNG VÀO ADMIN
  if (

    [
      'adminProducts',
      'adminUsers',
      'reports'
    ].includes(nextPage)

    &&

    currentUser.value?.role !==
    'admin'

  ) {

    page.value = 'home'

    return
  }

  page.value = nextPage
}

/* =========================
   AUTH
========================= */

function openLogin() {

  page.value = 'login'
}

function openRegister() {

  page.value = 'register'
}

async function login(credentials) {
  let found = customers.value.find(
    (c) => c.username === credentials.email && c.password === credentials.password
  )

  if (!found) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })
      const result = await response.json()
      if (!response.ok) {
        alert(result.message || 'Không thể đăng nhập.')
        page.value = 'login'
        return
      }
      found = result.user
      apiToken.value = result.token
      sessionStorage.setItem('soccerhub-session', result.token)
    } catch (error) {
      console.error('Account login request failed:', error)
      alert('Không thể kết nối máy chủ đăng nhập. Vui lòng thử lại.')
      page.value = 'login'
      return
    }
  }

  if (found.locked) {
    alert('Tài khoản này đã bị khóa.')
    return
  }

  currentUser.value = { ...found }

  apiToken.value = sessionStorage.getItem('soccerhub-session') || apiToken.value
  try {
    await Promise.all([loadProducts(found.role === 'admin'), loadOrders()])
    if (found.role === 'admin') {
      const response = await apiFetch('/api/admin/users')
      const result = await response.json()
      if (!response.ok) throw new Error(result.message)
      customers.value = result.customers || []
    }
  } catch (error) { alert(error.message); return }

  profile.value.name = found.name || ''
  profile.value.phone = found.phone || ''
  profile.value.email =
    found.email || (found.username && found.username.includes('@') ? found.username : `${found.username}@soccerhub.vn`)

  page.value = found.role === 'admin' ? 'adminProducts' : 'profile'
}

async function register(user) {
  customers.value.unshift({ ...user })

  currentUser.value = user
  apiToken.value = sessionStorage.getItem('soccerhub-session') || ''

  profile.value.name = user.name

  profile.value.phone = user.phone

  profile.value.email =
    user.email || `${user.username}@soccerhub.vn`

  try {
    await Promise.all([loadProducts(), loadOrders()])
  } catch (error) {
    console.error('Account was created, but initial data loading failed:', error)
    alert(`Tài khoản đã tạo và đăng nhập thành công, nhưng tải dữ liệu ban đầu thất bại. ${error.message}`)
  }
  page.value = 'profile'
}

function socialLogin(provider) {

  currentUser.value = {

    username:
      provider.toLowerCase(),

    name:
      `${provider} User`,

    email:
      `${provider.toLowerCase()}@soccerhub.vn`,

    role: 'user'
  }

  profile.value.name =
    currentUser.value.name

  profile.value.email =
    currentUser.value.email

  page.value = 'profile'
}

function logout() {

  currentUser.value = null
  apiToken.value = ''
  sessionStorage.removeItem('soccerhub-session')

  cart.value = []

  page.value = 'home'
}

function deleteAccount() {

  if (
    !confirm(
      'Bạn có chắc muốn xóa tài khoản?'
    )
  ) return

  logout()
}

/* =========================
   PROFILE
========================= */

async function saveProfile(nextProfile) {
  try {
    const response = await apiFetch('/api/profile', { method:'PUT', body:JSON.stringify(nextProfile) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message)
    profile.value = nextProfile
    currentUser.value.name = nextProfile.name
    currentUser.value.phone = nextProfile.phone
  } catch(error) { alert(error.message || 'Could not save profile') }
}

/* =========================
   PRODUCT
========================= */

function openDetail(product) {

  selectedProduct.value = product

  page.value = 'detail'
}

function addCart(

  product,

  option = {
    color: 'Xanh',
    size: 'M',
    qty: 1
  }

) {

  if (!currentUser.value) {

    page.value = 'login'

    return
  }

  const key =
    `${product.id}-${option.color}-${option.size}`

  const existed =
    cart.value.find(
      (item)=>item.key === key
    )

  if (existed) {

    existed.qty +=
      Number(option.qty || 1)

  } else {

    cart.value.push({

      ...product,

      key,

      color: option.color,

      size: option.size,

      qty:
        Number(option.qty || 1)
    })
  }
}

function buyNow(product,option) {

  addCart(product,option)

  if (currentUser.value) {

    page.value = 'payment'
  }
}

function removeCart(key) {

  cart.value =
    cart.value.filter(
      (item)=>item.key !== key
    )
}

/* =========================
   PAYMENT
========================= */

async function confirmOrder(payment) {
  if (!cart.value.length) return
  const methodId = typeof payment === 'string' ? 'cod' : payment.methodId
  const method = typeof payment === 'string' ? payment : payment.method
  const delivery = typeof payment === 'string' ? checkoutDelivery.value : payment.delivery
  try {
    const response = await apiFetch('/api/orders', { method:'POST', body:JSON.stringify({ customer:currentUser.value, delivery, items:cart.value.map(({id,qty})=>({id,qty})), methodId, method }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Could not create order')
    await Promise.all([loadOrders(), loadProducts()])
    cart.value = []
    page.value = 'orders'
  } catch (error) { alert(error.message || 'Could not create order') }
}

async function resumeVnpayReturn() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('vnpay') !== '1') return

  const orderCode = url.searchParams.get('ref') || ''
  const pending = sessionStorage.getItem('soccerhub-vnpay-pending')
  sessionStorage.removeItem('soccerhub-vnpay-pending')
  window.history.replaceState({}, '', `${url.pathname}${url.hash}`)

  if (pending) {
    try {
      const context = JSON.parse(pending)
      cart.value = context.cart || []
      currentUser.value = context.currentUser || null
      profile.value.name = context.currentUser?.name || ''
      checkoutDelivery.value = context.delivery || null
    } catch {
      cart.value = []
    }
  }

  page.value = currentUser.value ? 'payment' : 'home'

  if (!orderCode) {
    page.value = 'payment'
    alert('Không nhận được mã đơn hàng từ VNPay.')
    return
  }

  try {
    const response = await apiFetch(`/api/payments/${encodeURIComponent(orderCode)}`)
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Không kiểm tra được giao dịch.')

    if (result.paymentStatus === 'DaThanhToan') {
      orders.value.unshift(result.order)
      cart.value = []
      checkoutDelivery.value = null
      page.value = 'orders'
      alert(`Thanh toán thành công. Mã đơn hàng: ${orderCode}`)
    } else {
      page.value = 'payment'
      alert('Giao dịch chưa thanh toán thành công. Bạn có thể thử lại.')
    }
  } catch (error) {
    page.value = currentUser.value ? 'payment' : 'home'
    alert(error.message || 'Không thể kiểm tra trạng thái thanh toán.')
  }
}

onMounted(resumeVnpayReturn)

/* =========================
   PRODUCT ADMIN
========================= */

async function addProduct(product) {
  try { const r=await apiFetch('/api/admin/products',{method:'POST',body:JSON.stringify(product)});const d=await r.json();if(!r.ok)throw new Error(d.message);await loadProducts(true) } catch(error){alert(error.message)}
}

async function updateProduct(id,patch) {
  try { const r=await apiFetch('/api/admin/products/'+id,{method:'PUT',body:JSON.stringify(patch)});const d=await r.json();if(!r.ok)throw new Error(d.message);await loadProducts(true) } catch(error){alert(error.message)}
}

async function deleteProduct(id) {
  try { const r=await apiFetch('/api/admin/products/'+id,{method:'DELETE'});const d=await r.json();if(!r.ok)throw new Error(d.message);await loadProducts(true) } catch(error){alert(error.message)}
}

/* =========================
   USER ADMIN
========================= */

async function deleteCustomer(id) {
  try { const r=await apiFetch('/api/admin/users/'+id+'/status',{method:'PATCH',body:JSON.stringify({locked:true})});const d=await r.json();if(!r.ok)throw new Error(d.message);customers.value=customers.value.filter(item=>item.id!==id) } catch(error){alert(error.message)}
}

async function setCustomerStatus(id, locked) {
  try {
    const response = await apiFetch(`/api/admin/users/${id}/status`, { method:'PATCH', body:JSON.stringify({locked}) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message)
    const customer = customers.value.find(item => item.id === id)
    if (customer) customer.locked = locked
  } catch(error) { alert(error.message) }
}

async function updateOrderStatus(code, status) {
  try {
    const response = await apiFetch(`/api/admin/orders/${code}/status`, { method:'PATCH', body:JSON.stringify({status}) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message)
  } catch(error) {
    alert(error.message)
    await loadOrders()
  }
}

onMounted(async()=>{ try { await loadProducts() } catch(error) { console.error(error) } })
</script>
