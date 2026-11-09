<template>
  <section class="panel">

    <div class="title-row">

      <h2>Quản lý sản phẩm</h2>

      <span>
        {{ products.length }} sản phẩm
      </span>

    </div>

    <div class="admin-grid">

      <form
        class="admin-form modern-form"
        @submit.prevent="save"
      >

        <h3>
          {{
            editingId
              ? 'Cập nhật sản phẩm'
              : 'Thêm sản phẩm'
          }}
        </h3>

        <label>
          Tên sản phẩm

          <input v-model.trim="form.name">
        </label>

        <label>
          Danh mục

          <select v-model="form.category">

            <option>Áo đấu</option>

            <option>Giày bóng đá</option>

            <option>Phụ kiện</option>

          </select>

        </label>

        <label>
          Giá

          <input
            v-model.number="form.price"
            type="number"
            min="0"
          >
        </label>

        <label>
          Số lượng tồn

          <input
            v-model.number="form.stock"
            type="number"
            min="0"
          >
        </label>

        <label class="full">
          Mô tả

          <textarea v-model="form.desc"></textarea>
        </label>

        <label class="full">
          Ảnh sản phẩm
          <input type="file" accept="image/png,image/jpeg,image/webp" @change="selectImage">
          <small v-if="imageError" class="error-text">{{ imageError }}</small>
        </label>

        <div v-if="imagePreview || form.image" class="product-image-preview">
          <img :src="imagePreview || form.image" alt="Ảnh sản phẩm xem trước">
        </div>

        <div class="admin-toolbar">

          <button class="primary">

            {{
              editingId
                ? 'Lưu chỉnh sửa'
                : '+ Thêm sản phẩm'
            }}

          </button>

          <button
            class="secondary"
            type="button"
            @click="reset"
          >
            Làm mới
          </button>

        </div>

      </form>

      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>STT</th>

              <th>Tên sản phẩm</th>

              <th>Danh mục</th>

              <th>Giá</th>

              <th>Tồn</th>

              <th>Action</th>

            </tr>

          </thead>

          <tbody>

            <tr
              v-for="(item,index) in products"
              :key="item.id"
            >

              <td>{{ index + 1 }}</td>

              <td>{{ item.name }}</td>

              <td>{{ item.category }}</td>

              <td>{{ money(item.price) }}</td>

              <td>{{ item.stock }}</td>

              <td class="row-actions product-actions">

                <button
                  class="link"
                  @click="edit(item)"
                >
                  Sửa
                </button>

                <button
                  class="link"
                  @click="$emit('detail', item)"
                >
                  Chi tiết
                </button>

                <button
                  class="danger small"
                  @click="$emit('delete', item.id)"
                >
                  Xóa
                </button>

              </td>

            </tr>

          </tbody>

        </table>

      </div>

    </div>
  </section>
</template>

<script setup>
import {
  reactive,
  ref
} from 'vue'

import { money } from '../utils/format'

defineProps({
  products: Array
})

const emit = defineEmits([
  'add',
  'update',
  'delete',
  'detail'
])

const editingId = ref(null)
const imageFile = ref(null)
const imagePreview = ref('')
const imageError = ref('')

const form = reactive(emptyForm())

function emptyForm() {

  return {
    name: '',
    category: 'Phụ kiện',
    price: 199000,
    stock: 50,
    desc: '',
    image: ''
  }
}

function reset() {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = null
  imagePreview.value = ''
  imageError.value = ''

  editingId.value = null

  Object.assign(
    form,
    emptyForm()
  )
}

function edit(item) {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = null
  imagePreview.value = ''
  imageError.value = ''

  editingId.value = item.id

  Object.assign(
    form,
    item
  )
}

function selectImage(event) {
  imageError.value = ''
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    imageError.value = 'Ảnh không được vượt quá 5 MB.'
    if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
    imageFile.value = null
    imagePreview.value = ''
    event.target.value = ''
    return
  }
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

function save() {

  if (!form.name.trim()) return
  if (imageError.value) return

  if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0 ||
      !Number.isInteger(Number(form.stock)) || Number(form.stock) < 0) {
    imageError.value = 'Giá hoặc số lượng tồn kho không hợp lệ.'
    return
  }
  if (!editingId.value && !imageFile.value) {
    imageError.value = 'Chọn ảnh sản phẩm trước khi thêm mới.'
    return
  }

  if (editingId.value) {

    emit(
      'update',
      editingId.value,
      { ...form, imageFile: imageFile.value }
    )

  } else {

    emit(
      'add',
      {
        ...form,
        imageFile: imageFile.value,
        id: Date.now()
      }
    )
  }

  reset()
}
</script>