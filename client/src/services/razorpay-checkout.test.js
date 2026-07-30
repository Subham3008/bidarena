// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

const SCRIPT_ID = 'bidarena-razorpay-checkout'

afterEach(() => {
  document.getElementById(SCRIPT_ID)?.remove()
  Reflect.deleteProperty(window, 'Razorpay')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('loadRazorpayCheckout', () => {
  it('deduplicates simultaneous script requests', async () => {
    const { loadRazorpayCheckout } = await import(
      './razorpay-checkout.js'
    )

    const firstRequest = loadRazorpayCheckout()
    const secondRequest = loadRazorpayCheckout()
    const script = document.getElementById(SCRIPT_ID)

    expect(secondRequest).toBe(firstRequest)
    expect(
      document.querySelectorAll(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
      ),
    ).toHaveLength(1)

    window.Razorpay = vi.fn()
    script.dispatchEvent(new Event('load'))

    await expect(firstRequest).resolves.toBe(window.Razorpay)
  })

  it('removes a failed script and permits a clean retry', async () => {
    const { loadRazorpayCheckout } = await import(
      './razorpay-checkout.js'
    )

    const failedRequest = loadRazorpayCheckout()
    const failedAssertion = expect(failedRequest).rejects.toThrow(
      'Razorpay Checkout could not be loaded',
    )

    document
      .getElementById(SCRIPT_ID)
      .dispatchEvent(new Event('error'))

    await failedAssertion
    expect(document.getElementById(SCRIPT_ID)).toBeNull()

    const retryRequest = loadRazorpayCheckout()
    const retryScript = document.getElementById(SCRIPT_ID)

    expect(retryScript).not.toBeNull()
    window.Razorpay = vi.fn()
    retryScript.dispatchEvent(new Event('load'))

    await expect(retryRequest).resolves.toBe(window.Razorpay)
  })
})
