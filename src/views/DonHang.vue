<template>
  <section
    v-if="isAdmin"
    class="panel admin-order-page"
  >

    <div class="admin-order-top">

      <div>

        <h2>Quản lý đơn hàng</h2>

        <p>
          Theo dõi và cập nhật trạng thái đơn hàng
        </p>

      </div>

      <input
        class="order-search"
        v-model="keyword"
        placeholder="Tìm mã đơn hàng..."
      >

    </div>

    <!-- STATS -->
    <div class="order-stats">

      <article>

        <b>
          {{ orders.length }}
        </b>

        <span>
          Tổng đơn
        </span>

      </article>

      <article>

        <b>
          {{ processingCount }}
        </b>

        <span>
          Đang xử lý
        </span>

      </article>

      <article>

        <b>
          {{ shippingCount }}
        </b>

        <span>
          Đang vận chuyển
        </span>

      </article>

      <article>

        <b>
          {{ money(revenue) }}
        </b>

        <span>
          Doanh thu
        </span>

      </article>

    </div>

    <!-- TABLE -->
    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>Mã đơn</th>

            <th>Khách hàng</th>

            <th>Sản phẩm</th>

            <th>Số lượng</th>

            <th>Thanh toán</th>

            <th>Trạng thái</th>

            <th>Action</th>

          </tr>

        </thead>

        <tbody>

          <tr
            v-for="item in filteredOrders"
            :key="item.code"
          >

            <td>
              {{ item.code }}
            </td>

            <td>
              {{ item.user }}
            </td>

            <td class="product-cell">
              {{ item.product }}
            </td>

            <td>
              {{ item.qty }}
            </td>

            <td>
              {{ money(item.total) }}
            </td>

            <td>

              <select
                class="status-select"
                v-model="item.status"
                @change="$emit('status', item.code, item.status)"
              >

                <option>
                  Chờ xác nhận
                </option>

                <option>
                  Đang xử lý
                </option>

                <option>
                  Đang vận chuyển
                </option>

                <option>
                  Đã giao hàng
                </option>

                <option>
                  Đã hủy
                </option>

              </select>

            </td>

            <td class="action-group">

              <button
                class="view-btn"
                @click="selected = item"
              >
                Chi tiết
              </button>

              <button
                class="cancel-btn"
                @click="cancelOrder(item)"
              >
                Hủy
              </button>

            </td>

          </tr>

        </tbody>

      </table>

    </div>

    <!-- DETAIL -->
    <div
      v-if="selected"
      class="order-detail"
    >

      <h3>
        Chi tiết đơn hàng
      </h3>

      <div class="detail-grid">

        <p>

          <b>Mã đơn:</b>

          {{ selected.code }}

        </p>

        <p>

          <b>Khách:</b>

          {{ selected.user }}

        </p>

        <p>

          <b>Sản phẩm:</b>

          {{ selected.product }}

        </p>

        <p>

          <b>Số lượng:</b>

          {{ selected.qty }}

        </p>

        <p>

          <b>Tổng tiền:</b>

          {{ money(selected.total) }}

        </p>

        <p>

          <b>Ghi chú:</b>

          {{ selected.note }}

        </p>

      </div>

    </div>

  </section>

  <section
    v-else
    class="panel user-order-page"
  >
    <div class="user-order-header">
      <h2>Đơn hàng của tôi</h2>

      <input
        v-model="keyword"
        class="user-order-search"
        placeholder="Nhập mã đơn hàng"
      >
    </div>

    <div class="user-order-list">
      <article
        v-for="item in filteredOrders"
        :key="item.code"
        class="user-order-card"
      >
        <div class="order-top">
          <div class="order-code">
            <b>Mã đơn:</b>
            <span>{{ item.code }}</span>
          </div>

          <div class="order-delivery">
            <b>Giao hàng:</b>
            <span>{{ item.delivery }}</span>
          </div>

          <div class="order-status">
            <b>Trạng thái:</b>
            <span
              class="status-badge"
              :class="statusClass(item.status)"
            >
              {{ item.status }}
            </span>
          </div>

          <div class="order-total">
            <b>Thành tiền:</b>
            <span>{{ money(item.total) }}</span>
          </div>
        </div>

        <div class="order-product">
          <b>Sản phẩm:</b>
          <p>{{ item.product }}</p>
        </div>

        <div
          v-if="item.review"
          class="order-review"
        >
          <div class="review-rate">
            Đã đánh giá: {{ item.review.star }}/5
          </div>

          <p>{{ item.review.content }}</p>
        </div>

        <form
          v-else-if="canReview(item)"
          class="order-review-form"
          @submit.prevent="submitReview(item)"
        >
          <div class="review-form-head">
            <b>Đánh giá sản phẩm</b>
            <select v-model.number="reviewForms[item.code].star">
              <option
                v-for="star in 5"
                :key="star"
                :value="star"
              >
                {{ star }} sao
              </option>
            </select>
          </div>

          <textarea
            v-model.trim="reviewForms[item.code].content"
            placeholder="Chia sẻ cảm nhận của bạn về sản phẩm"
            rows="3"
          ></textarea>

          <button class="primary">
            Gửi đánh giá
          </button>
        </form>
 
        <div
          v-else
          class="order-review-empty"
        >
          Chỉ có thể đánh giá khi đơn hàng đã giao.
        </div>
      </article>

      <p
        v-if="!filteredOrders.length"
        class="empty"
      >
        Bạn chưa có đơn hàng nào.
      </p>
    </div>
  </section>
</template>

<script setup>
import {
  computed,
  reactive,
  ref
} from 'vue'

import {
  money
} from '../utils/format'

const props = defineProps({

  orders: Array,

  currentUser: Object
})

const emit = defineEmits(['status', 'review'])

const keyword = ref('')

const selected = ref(null)

const reviewForms = reactive({})

const isAdmin = computed(() =>
  props.currentUser?.role === 'admin'
)

const filteredOrders = computed(() => {

  return props.orders.filter((item) => {

    if (
      !isAdmin.value &&
      item.user !== props.currentUser?.username
    ) {
      return false
    }

    return (

      !keyword.value ||

      item.code
        .toLowerCase()
        .includes(
          keyword.value.toLowerCase()
        )
    )
  })
})

const revenue = computed(() => {

  return props.orders.reduce(

    (sum,item)=>

      sum + item.total,

    0
  )
})

const processingCount = computed(() => {

  return props.orders.filter(

    item =>
      item.status ===
      'Đang xử lý'

  ).length
})

const shippingCount = computed(() => {

  return props.orders.filter(

    item =>
      item.status ===
      'Đang vận chuyển'

  ).length
})

function cancelOrder(item) {

  item.status = 'Đã hủy'
  emit('status', item.code, item.status)
}

function canReview(item) {
  if (item.status !== 'Đã giao hàng') return false

  if (!reviewForms[item.code]) {
    reviewForms[item.code] = {
      star: 5,
      content: ''
    }
  }

  return true
}

function submitReview(item) {
  const form = reviewForms[item.code]

  if (!form?.content) {
    alert('Vui lòng nhập nội dung đánh giá.')
    return
  }

  item.review = {
    star: form.star,
    content: form.content
  }
  emit('review', item.code, item.review)
}

function statusClass(status) {
  if (status === 'Đã giao hàng') return 'done'
  if (status === 'Đang xử lý') return 'processing'
  if (status === 'Đang vận chuyển') return 'shipping'
  if (status === 'Chờ xác nhận') return 'waiting'

  return 'cancel'
}
</script>
