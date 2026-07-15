interface PayFastOnsiteOptions {
  uuid: string
}

type PayFastOnsiteCallback = (completed: boolean) => void

declare global {
  interface Window {
    payfast_do_onsite_payment?: (
      options: PayFastOnsiteOptions,
      callback: PayFastOnsiteCallback,
    ) => void
  }
}

export async function openPayFastOnsite(options: {
  engineUrl: string
  onsiteUuid: string
}) {
  await loadPayFastEngine(options.engineUrl)

  if (!window.payfast_do_onsite_payment) {
    throw new Error('PayFast Onsite did not load.')
  }

  return new Promise<'completed' | 'closed'>((resolve) => {
    window.payfast_do_onsite_payment?.(
      { uuid: options.onsiteUuid },
      (completed) => resolve(completed ? 'completed' : 'closed'),
    )
  })
}

async function loadPayFastEngine(engineUrl: string) {
  if (window.payfast_do_onsite_payment) {
    return
  }

  const existing = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[data-payfast-onsite-engine]'),
  ).find((candidate) => candidate.src === engineUrl)
  const script = existing ?? document.createElement('script')

  if (!existing) {
    script.async = true
    script.dataset.payfastOnsiteEngine = 'true'
    script.src = engineUrl
    document.head.append(script)
  }

  await new Promise<void>((resolve, reject) => {
    if (script.dataset.loaded === 'true') {
      resolve()
      return
    }

    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true'
        resolve()
      },
      { once: true },
    )
    script.addEventListener(
      'error',
      () => {
        script.remove()
        reject(new Error('PayFast Onsite could not be loaded.'))
      },
      { once: true },
    )
  })
}
