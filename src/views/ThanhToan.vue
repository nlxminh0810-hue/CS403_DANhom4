<template>
  <section class="checkout-page">
    <div class="checkout-card">
      <div class="checkout-heading">
        <div class="checkout-brand">
          <i class="bi bi-dribbble"></i>
          <span>SoccerHub</span>
        </div>

        <h2>Thanh toán</h2>
      </div>

      <div class="checkout-items">
        <article
          v-for="item in cart"
          :key="item.key"
          class="checkout-item"
        >
          <img
            :src="item.image"
            :alt="item.name"
            class="checkout-item-image"
          >

          <div class="checkout-item-info">
            <h3>{{ item.name }}</h3>
            <p>{{ item.color }} / {{ item.size }}</p>

            <div class="checkout-qty">
              <button
                type="button"
                @click="decrease(item)"
              >
                -
              </button>

              <input
                v-model.number="item.qty"
                type="number"
                min="1"
                @input="normalizeQty(item)"
              >

              <button
                type="button"
                @click="increase(item)"
              >
                +
              </button>
            </div>
          </div>

          <b>{{ money(item.price * Number(item.qty || 1)) }}</b>
        </article>
      </div>

      <div class="checkout-payment">
        <div>
          <h3>Thông tin giao hàng</h3>

          <div class="delivery-grid">
            <label>
              <input
                v-model.trim="form.fullName"
                class="checkout-input"
                placeholder="Họ và tên"
              >
              <span v-if="submitted && !form.fullName">
                Vui lòng nhập họ tên
              </span>
            </label>

            <label>
              <input
                v-model.trim="form.phone"
                class="checkout-input"
                maxlength="10"
                placeholder="Số điện thoại"
                @input="digitsOnly"
              >
              <span v-if="submitted && !validPhone">
                Số điện thoại không hợp lệ
              </span>
            </label>

            <select
              v-model="form.city"
              class="checkout-input"
            >
              <option value="">Chọn thành phố</option>
              <option>Hồ Chí Minh</option>
              <option>Hà Nội</option>
              <option>Đà Nẵng</option>
            </select>

            <select
              v-model="form.district"
              class="checkout-input"
            >
              <option value="">Chọn quận</option>
              <option>Quận 1</option>
              <option>Quận 3</option>
              <option>Bình Thạnh</option>
            </select>

            <select
              v-model="form.ward"
              class="checkout-input"
            >
              <option value="">Chọn phường</option>
              <option>Phường 1</option>
              <option>Phường 5</option>
              <option>Phường 7</option>
            </select>

            <label class="delivery-address">
              <textarea
                v-model.trim="form.address"
                class="checkout-input"
                rows="4"
                placeholder="Số nhà, tên đường..."
              ></textarea>
              <span v-if="submitted && !validAddress">
                Vui lòng nhập đầy đủ địa chỉ
              </span>
            </label>
          </div>
        </div>

        <aside class="checkout-bill">
          <div class="bill-line">
            <span>Tạm tính</span>
            <b>{{ money(subtotal) }}</b>
          </div>

          <div class="bill-line">
            <span>Phí vận chuyển</span>
            <b>{{ money(shippingFee) }}</b>
          </div>

          <div class="bill-line bill-total">
            <span>Tổng cộng</span>
            <b>{{ money(grandTotal) }}</b>
          </div>

          <button
            type="button"
            class="checkout-open"
            :disabled="!cart.length"
            @click="openPayment"
          >
            <i class="bi bi-credit-card"></i>
            Thanh toán ngay
          </button>
        </aside>
      </div>
    </div>

    <div
      v-if="showModal"
      class="payment-overlay"
      @click.self="showModal = false"
    >
      <div class="payment-dialog">
        <div class="payment-dialog-head">
          <h3>Thanh toán</h3>

          <button
            type="button"
            @click="showModal = false"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="payment-dialog-body">
          <div class="payment-methods">
            <button
              v-for="method in methods"
              :key="method.id"
              type="button"
              class="payment-method"
              :class="{ active: selectedMethod.id === method.id }"
              @click="selectedMethod = method"
            >
              {{ method.name }}
            </button>
          </div>

          <div class="qr-box">
            <img
              v-if="selectedQr"
              :src="selectedQr"
              alt="Mã QR thanh toán"
            >

            <i
              v-else
              :class="selectedMethod.id === 'cod'
                ? 'bi bi-cash-coin cod-icon'
                : 'bi bi-shield-lock cod-icon'"
            ></i>

            <h4>
              {{
                selectedMethod.id === 'bank'
                  ? 'Quét QR chuyển khoản MBank'
                  : selectedMethod.id === 'vnpay'
                  ? 'Thanh toán qua VNPay sandbox'
                  : selectedQr
                    ? 'Quét mã để thanh toán'
                    : 'Thanh toán khi nhận hàng'
              }}
            </h4>

            <template v-if="selectedMethod.id === 'bank'">
              <p>NGÂN HÀNG: <b>MBank</b></p>
              <p>SỐ TÀI KHOẢN: <b>0762525797</b></p>
              <p>Đơn hàng chờ xác nhận sau khi cửa hàng đối soát chuyển khoản.</p>
            </template>

            <p v-if="!['vnpay', 'bank', 'cod'].includes(selectedMethod.id)">
              <template v-if="selectedMethod.id !== 'bank' && selectedMethod.id !== 'cod'">
                TÊN:
                <b>NGUYỄN THANH LONG</b>
              </template>
            </p>

            <p>
              SỐ TIỀN CẦN THANH TOÁN:
              <strong>{{ money(grandTotal) }}</strong>
            </p>

              <p
                v-if="paymentError"
                class="payment-error"
                role="alert"
              >
                {{ paymentError }}
              </p>

            <button
              type="button"
              class="confirm-payment"
              :disabled="confirming"
              @click="confirm"
            >
              {{
                confirming
                  ? 'Đang xử lý...'
                  : selectedMethod.id === 'vnpay'
                    ? 'Tiếp tục đến VNPay'
                    : selectedMethod.id === 'bank'
                      ? 'Tôi đã chuyển khoản'
                    : 'Xác nhận thanh toán'
              }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import {
  computed,
  reactive,
  ref
} from 'vue'

import { money } from '../utils/format'

const props = defineProps({
  cart: Array,
  total: Number,
  customer: Object,
  initialDelivery: Object
})

const emit = defineEmits(['confirm'])

const shippingFee = 30000
const submitted = ref(false)
const showModal = ref(false)
const confirming = ref(false)
const paymentError = ref('')

const form = reactive({
  fullName: '',
  phone: '',
  city: '',
  district: '',
  ward: '',
  address: '',
  ...(props.initialDelivery || {})
})

const methods = [
  {
    id: 'vnpay',
    name: 'VNPay',
    qr: ''
  },
  {
    id: 'bank',
    name: 'QR PAY (MBank)',
    qr: ''
  },
  {
    id: 'momo',
    name: 'MOMO PAY',
    qr: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=MOMOPAY'
  },
  {
    id: 'cod',
    name: 'Trả tiền khi nhận hàng',
    qr: ''
  }
]

const selectedMethod = ref(methods[0])

const selectedQr = computed(() => {
  if (selectedMethod.value.id === 'bank') {
    const addInfo = encodeURIComponent('SoccerHub thanh toan don hang')
    return `https://img.vietqr.io/image/MB-0762525797-compact2.png?amount=${Math.round(grandTotal.value)}&addInfo=${addInfo}`
  }

  return selectedMethod.value.qr
})

const subtotal = computed(() =>
  props.cart.reduce(
    (sum,item) =>
      sum + item.price * Number(item.qty || 0),
    0
  )
)

const grandTotal = computed(() =>
  subtotal.value + shippingFee
)

const validPhone = computed(() =>
  /^\d{10}$/.test(form.phone)
)

const validAddress = computed(() =>
  Boolean(
    form.city &&
    form.district &&
    form.ward &&
    form.address
  )
)

const validForm = computed(() =>
  Boolean(
    form.fullName &&
    validPhone.value &&
    validAddress.value
  )
)

function digitsOnly() {
  form.phone = form.phone.replace(/\D/g, '')
}

function normalizeQty(item) {
  if (!Number(item.qty) || item.qty < 1) {
    item.qty = 1
  }
}

function increase(item) {
  item.qty = Number(item.qty || 1) + 1
}

function decrease(item) {
  item.qty = Math.max(
    1,
    Number(item.qty || 1) - 1
  )
}

function openPayment() {
  submitted.value = true

  if (!validForm.value) return

  showModal.value = true
}

async function confirm() {
  if (selectedMethod.value.id === 'vnpay') {
    confirming.value = true
    paymentError.value = ''

    try {
      const response = await fetch('/api/payments/vnpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            username: props.customer?.username,
            name: props.customer?.name || form.fullName
          },
          delivery: { ...form },
          items: props.cart.map((item) => ({
            id: item.id,
            qty: Number(item.qty)
          }))
        })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Không thể tạo giao dịch VNPay.')

      sessionStorage.setItem('soccerhub-vnpay-pending', JSON.stringify({
        code: result.orderCode,
        cart: props.cart,
        currentUser: {
          username: props.customer?.username,
          name: props.customer?.name,
          email: props.customer?.email,
          role: props.customer?.role
        },
        delivery: { ...form }
      }))
      window.location.assign(result.paymentUrl)
      return
    } catch (error) {
      paymentError.value = error.message || 'Không thể kết nối máy chủ thanh toán.'
      confirming.value = false
      return
    }
  }

  confirming.value = true

  window.setTimeout(() => {
    emit(
      'confirm',
      {
        method: selectedMethod.value.name,
        methodId: selectedMethod.value.id,
        delivery: {
          ...form
        },
        shippingFee,
        total: grandTotal.value
      }
    )

    confirming.value = false
    showModal.value = false
  }, 600)
}
</script>
