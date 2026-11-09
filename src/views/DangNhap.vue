<template>
  <section class="auth-page">
    <form class="auth-card login-card" @submit.prevent="submit">
      <div class="auth-top">
        <h2>Đăng nhập</h2>
        <button class="close-auth" type="button" @click="$emit('navigate', 'home')"><i class="bi bi-x-lg"></i></button>
      </div>

      <div class="login-form-body">
        <input class="login-input" v-model.trim="form.email" placeholder="Nhập tên đăng nhập">
        <input class="login-input" v-model="form.password" type="password" placeholder="Nhập mật khẩu">
        <div class="login-links">
          <button type="button" @click="$emit('forgot')">Quên mật khẩu?</button>
          <span>Chưa có tài khoản? <button type="button" @click="$emit('register')">Đăng kí</button></span>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="login-submit">Đăng nhập</button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue'
const emit = defineEmits(['submit', 'forgot', 'register', 'navigate'])
const form = reactive({ email: '', password: '' })
const error = ref('')

function submit() {
  error.value = ''
  if (!form.email || !form.password) {
    error.value = 'Vui lòng nhập tài khoản và mật khẩu.'
    return
  }
  emit('submit', { ...form })
}
</script>
