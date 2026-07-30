const RAZORPAY_CHECKOUT_URL =
  'https://checkout.razorpay.com/v1/checkout.js'
const RAZORPAY_SCRIPT_ID = 'bidarena-razorpay-checkout'
const SCRIPT_LOAD_TIMEOUT = 20_000

let checkoutLoadPromise = null

function findCheckoutScript() {
  const identifiedScript = document.getElementById(
    RAZORPAY_SCRIPT_ID,
  )
  const isOfficialScript = (element) =>
    element?.tagName === 'SCRIPT' &&
    element.src === RAZORPAY_CHECKOUT_URL

  return (
    (isOfficialScript(identifiedScript) ? identifiedScript : null) ??
    [...document.scripts].find(isOfficialScript)
  )
}

export function loadRazorpayCheckout() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('Razorpay Checkout requires a browser environment'),
    )
  }

  if (typeof window.Razorpay === 'function') {
    return Promise.resolve(window.Razorpay)
  }

  if (checkoutLoadPromise) {
    return checkoutLoadPromise
  }

  checkoutLoadPromise = new Promise((resolve, reject) => {
    let script = findCheckoutScript()
    const createdHere = !script
    let timeoutId

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
    }

    const fail = (message) => {
      cleanup()

      if (createdHere || script.dataset.bidArenaCheckoutFailed === 'true') {
        script.remove()
      }

      checkoutLoadPromise = null
      reject(new Error(message))
    }

    const handleLoad = () => {
      script.dataset.bidArenaCheckoutLoaded = 'true'

      if (typeof window.Razorpay !== 'function') {
        script.dataset.bidArenaCheckoutFailed = 'true'
        fail('Razorpay Checkout loaded without a usable client')
        return
      }

      cleanup()
      resolve(window.Razorpay)
    }

    const handleError = () => {
      script.dataset.bidArenaCheckoutFailed = 'true'
      fail('Razorpay Checkout could not be loaded')
    }

    if (!script) {
      script = document.createElement('script')
      if (!document.getElementById(RAZORPAY_SCRIPT_ID)) {
        script.id = RAZORPAY_SCRIPT_ID
      }
      script.src = RAZORPAY_CHECKOUT_URL
      script.async = true
      script.dataset.bidArenaCheckout = 'true'
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    timeoutId = window.setTimeout(() => {
      script.dataset.bidArenaCheckoutFailed = 'true'
      fail('Razorpay Checkout took too long to load')
    }, SCRIPT_LOAD_TIMEOUT)

    if (createdHere) {
      document.head.append(script)
    } else if (script.dataset.bidArenaCheckoutLoaded === 'true') {
      window.queueMicrotask(handleLoad)
    }
  })

  return checkoutLoadPromise
}
