import assert from 'node:assert/strict'
import test from 'node:test'
import { createPaymentUrl, verifyVnpaySignature } from './vnpay.js'

process.env.VNPAY_TMN_CODE = 'TESTCODE'
process.env.VNPAY_HASH_SECRET = 'test-secret'
process.env.VNPAY_RETURN_URL = 'http://localhost:3001/api/payments/vnpay/return'

test('VNPay URL signature verifies and rejects altered parameters', () => {
  const paymentUrl = createPaymentUrl('SH123', 319000, '127.0.0.1')
  const params = Object.fromEntries(new URL(paymentUrl).searchParams.entries())

  assert.equal(verifyVnpaySignature(params), true)
  assert.equal(verifyVnpaySignature({ ...params, vnp_Amount: '1' }), false)
})