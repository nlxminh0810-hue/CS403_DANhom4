<template>
  <section class="auth-page">

    <form
      class="auth-card register-card"
      @submit.prevent="submit"
    >

      <div class="auth-top">

        <h2>Tạo tài khoản mới</h2>

        <button
          class="close-auth"
          type="button"
          @click="$emit('navigate', 'home')"
        >
          <i class="bi bi-x-lg"></i>
        </button>

      </div>

      <div class="register-form-body">

        <input
          class="login-input"
          v-model.trim="form.name"
          placeholder="Nhập họ và tên"
          autocomplete="name"
        >

        <input
          class="login-input"
          v-model.trim="form.email"
          type="email"
          placeholder="Nhập địa chỉ email"
          autocomplete="email"
        >

        <input
          class="login-input"
          v-model.trim="form.phone"
          placeholder="Nhập số điện thoại"
          autocomplete="tel"
        >

        <input
          class="login-input"
          v-model="form.password"
          type="password"
          placeholder="Nhập mật khẩu"
          autocomplete="new-password"
        >

        <input
          class="login-input"
          v-model="form.confirmPassword"
          type="password"
          placeholder="Xác nhận lại mật khẩu"
          autocomplete="new-password"
        >

        <p class="register-text">

          Đã có tài khoản?

          <button
            type="button"
            @click="$emit('login')"
          >
            Đăng nhập
          </button>

        </p>

        <p
          v-if="error"
          class="error-text"
        >
          {{ error }}
        </p>

        <button
          class="login-submit"
          type="submit"
          :disabled="isLoading"
        >
          {{ isLoading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản' }}
        </button>

        <button
          class="social-btn google-btn"
          type="button"
          @click="$emit('social', 'Google')"
        >

          <span class="social-icon">
            <i class="bi bi-google"></i>
          </span>

          <span>
            Tiếp tục với Google
          </span>

        </button>

        <button
          class="social-btn facebook-btn"
          type="button"
          @click="$emit('social', 'Facebook')"
        >

          <span class="social-icon">
            <i class="bi bi-facebook"></i>
          </span>

          <span>
            Tiếp tục với Facebook
          </span>

        </button>

      </div>
    </form>
  </section>
</template>

<script setup>
import {
  reactive,
  ref
} from 'vue'

const props = defineProps({
  customers: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'submit',
  'social',
  'login',
  'navigate'
])

const form = reactive({

  name: '',

  email: '',

  phone: '',

  password: '',

  confirmPassword: ''
})

const error = ref('')
const isLoading = ref(false)

async function submit() {
  error.value = ''

  if (!form.name || !form.email || !form.phone || !form.password || !form.confirmPassword) {
    error.value = 'Vui lòng nhập đầy đủ thông tin.'
    return
  }

  if (form.email.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    error.value = 'Email không hợp lệ hoặc dài quá 50 ký tự.'
    return
  }

  if (props.customers.some((customer) =>
    String(customer.email || customer.username).toLowerCase() === form.email.toLowerCase()
  )) {
    error.value = 'Email này đã được sử dụng.'
    return
  }

  if (!/^\d{9,15}$/.test(form.phone)) {
    error.value = 'Số điện thoại cần có từ 9 đến 15 chữ số.'
    return
  }

  if (form.password.length < 6) {
    error.value = 'Mật khẩu cần tối thiểu 6 ký tự.'
    return
  }

  if (form.password !== form.confirmPassword) {
    error.value = 'Mật khẩu xác nhận chưa khớp.'
    return
  }

  isLoading.value = true
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email.toLowerCase(),
        name: form.name,
        phone: form.phone,
        password: form.password
      })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Không thể tạo tài khoản.')

    sessionStorage.setItem('soccerhub-session', result.token)
    emit('submit', result.user)
  } catch (requestError) {
    error.value = requestError.message || 'Không thể tạo tài khoản.'
  } finally {
    isLoading.value = false
  }
}

</script>
