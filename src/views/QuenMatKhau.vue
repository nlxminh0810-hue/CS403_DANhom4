<template>
  <section class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <p class="label">Khôi phục tài khoản</p>
      <h2>Quên mật khẩu</h2>
      <label>Email<input v-model.trim="email" type="email" autocomplete="email" placeholder="ten@example.com" :disabled="requested"></label>
      <template v-if="requested">
        <p class="auth-note">Nếu email thuộc tài khoản đang hoạt động, mã xác nhận đã được gửi. Mã hết hạn sau 15 phút.</p>
        <label>Mã xác nhận<input v-model.trim="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 chữ số"></label>
        <label>Mật khẩu mới<input v-model="password" type="password" autocomplete="new-password" placeholder="Tối thiểu 8 ký tự"></label>
      </template>
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="notice" class="auth-note">{{ notice }}</p>
      <p v-if="done" class="success-text">Mật khẩu đã cập nhật. Hãy đăng nhập lại.</p>
      <button class="primary" :disabled="loading || done">{{ loading ? 'Đang xử lý...' : requested ? 'Xác nhận mã và đổi mật khẩu' : 'Gửi mã xác nhận' }}</button>
      <button class="secondary" type="button" @click="$emit('login')">Quay lại đăng nhập</button>
    </form>
  </section>
</template>

<script setup>
import { ref } from 'vue'
defineEmits(['login'])
const email = ref('')
const code = ref('')
const password = ref('')
const error = ref('')
const notice = ref('')
const done = ref(false)
const requested = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  notice.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = 'Vui lòng nhập email hợp lệ.'
    return
  }

  loading.value = true
  try {
    const response = await fetch(requested.value
      ? '/api/auth/password-reset/confirm'
      : '/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requested.value
        ? { email: email.value, code: code.value, password: password.value }
        : { email: email.value })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Không thể xử lý yêu cầu.')
    if (!requested.value) {
      requested.value = true
      notice.value = result.message
    } else {
      done.value = true
    }
  } catch (requestError) {
    error.value = requestError.message || 'Không thể kết nối máy chủ.'
  } finally {
    loading.value = false
  }
}
</script>
