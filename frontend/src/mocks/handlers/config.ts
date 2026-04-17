import { http, HttpResponse } from 'msw'

export const configHandlers = [
  // /api/config -- called by fetchConfig() in lib/config.ts
  http.get('/api/config', () => {
    return HttpResponse.json({
      version: '0.1.0-mock',
      dbStatus: 'online',
    })
  }),

  // /config -- called by the Next.js runtime-config route handler (app/config/route.ts)
  // When MSW is active, this route is reached via browser fetch, so the service worker
  // intercepts it. Return empty apiUrl so config.ts uses relative path (rewrites).
  http.get('/config', () => {
    return HttpResponse.json({
      apiUrl: '',
    })
  }),
]