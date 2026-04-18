import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// Only set up the worker on the client side
let _worker: ReturnType<typeof setupWorker> | null = null

if (typeof window !== 'undefined') {
  _worker = setupWorker(...handlers)
}

export const worker = _worker