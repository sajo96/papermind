'use client'

import { useEffect, useState } from 'react'

let workerStartPromise: Promise<void> | null = null
let hasStartedWorker = false

async function ensureMockWorkerStarted(): Promise<void> {
  if (hasStartedWorker) {
    return
  }

  if (workerStartPromise) {
    return workerStartPromise
  }

  workerStartPromise = (async () => {
    const { worker } = await import('@/mocks/browser')

    if (!worker) {
      throw new Error('MSW worker is unavailable in this runtime')
    }

    await worker.start({
      onUnhandledRequest: 'bypass',
    })

    hasStartedWorker = true
    console.log('[MSW] Mock API enabled')
  })()

  try {
    await workerStartPromise
  } catch (error) {
    workerStartPromise = null
    throw error
  }
}

export function MswProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MOCK_API !== 'true') {
      setReady(true)
      return
    }

    let isActive = true

    ensureMockWorkerStarted()
      .catch((error) => {
        if (isActive) {
          console.error('[MSW] Failed to start:', error)
        }
      })
      .finally(() => {
        if (isActive) {
          setReady(true)
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  if (!ready) return null

  return <>{children}</>
}