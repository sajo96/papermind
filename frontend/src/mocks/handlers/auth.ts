import { http, HttpResponse } from 'msw'

export const authHandlers = [
  // /api/auth/status -- called by checkAuthRequired() to determine if auth is enabled
  http.get('/api/auth/status', () => {
    return HttpResponse.json({
      auth_enabled: false,
    })
  }),
]