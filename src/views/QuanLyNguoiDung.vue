<template>
  <section class="panel">

    <div class="title-row">

      <h2>Tài khoản khách hàng</h2>

      <span>
        {{ customers.length }} khách hàng
      </span>

    </div>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>STT</th>

            <th>Tên tài khoản</th>

            <th>Ngày sinh</th>

            <th>Ngày lập</th>

            <th>Số đơn</th>

            <th>Trạng thái</th>

            <th>Action</th>

          </tr>

        </thead>

        <tbody>

          <tr
            v-for="(user,index) in customers"
            :key="user.id"
          >

            <td>{{ index + 1 }}</td>

            <td>{{ user.name }}</td>

            <td>{{ user.birth }}</td>

            <td>{{ user.created }}</td>

            <td>{{ user.orders }}</td>

            <td>
              {{
                user.locked
                  ? 'Đã khóa'
                  : 'Hoạt động'
              }}
            </td>

            <td class="user-actions">

              <button
                class="action-btn detail-btn"
                @click="selected = user"
              >
                Chi tiết
              </button>

              <button
                class="action-btn lock-btn"
                @click="$emit('status', user.id, !user.locked)"
              >
                {{
                  user.locked
                    ? 'Mở khóa'
                    : 'Khóa'
                }}
              </button>

              <button
                class="action-btn delete-btn"
                @click="$emit('delete', user.id)"
              >
                Xóa
              </button>

            </td>

          </tr>

        </tbody>

      </table>

    </div>

    <div
      v-if="selected"
      class="detail-panel"
    >

      <h3>Chi tiết khách hàng</h3>

      <div class="detail-list">

        <p>
          <b>Họ tên</b>
          {{ selected.name }}
        </p>

        <p>
          <b>Ngày sinh</b>
          {{ selected.birth }}
        </p>

        <p>
          <b>Ngày lập</b>
          {{ selected.created }}
        </p>

        <p>
          <b>Số đơn</b>
          {{ selected.orders }}
        </p>

      </div>

    </div>

  </section>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  customers: Array
})

defineEmits(['delete', 'status'])

const selected = ref(null)
</script>
