import crypto from 'node:crypto'

const ignoredFields = new Set(['vnp_SecureHash', 'vnp_SecureHashType'])

function serializeParams(params) {
  return Object.keys(params)
    .filter((key) => !ignoredFields.has(key))
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
    .join('&')
}

function getHashSecret() {
  const secret = process.env.VNPAY_HASH_SECRET
  if (!secret) throw new Error('Chưa cấu hình VNPAY_HASH_SECRET trong file .env.')
  return secret
}

export function createPaymentUrl(orderCode, amount, ipAddress) {
  const merchantCode = process.env.VNPAY_TMN_CODE
  const returnUrl = process.env.VNPAY_RETURN_URL
  if (!merchantCode || !returnUrl) {
    throw new Error('Chưa cấu hình VNPAY_TMN_CODE hoặc VNPAY_RETURN_URL trong file .env.')
  }

  const createDate = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: merchantCode,
    vnp_Amount: String(Math.round(amount * 100)),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderCode,
    vnp_OrderInfo: `Thanh toan don hang ${orderCode}`,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddress,
    vnp_CreateDate: createDate
  }
  const signature = crypto.createHmac('sha512', getHashSecret())
    .update(serializeParams(params), 'utf8')
    .digest('hex')
  const baseUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

  return `${baseUrl}?${serializeParams(params)}&vnp_SecureHash=${signature}`
}

export function verifyVnpaySignature(params) {
  const receivedHash = params.vnp_SecureHash
  if (typeof receivedHash !== 'string' || !/^[a-f\d]{128}$/i.test(receivedHash)) return false

  const expectedHash = crypto.createHmac('sha512', getHashSecret())
    .update(serializeParams(params), 'utf8')
    .digest()
  const actualHash = Buffer.from(receivedHash, 'hex')

  return actualHash.length === expectedHash.length &&
    crypto.timingSafeEqual(actualHash, expectedHash)
}