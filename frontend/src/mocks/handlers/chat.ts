import { http, HttpResponse } from 'msw'

export const chatHandlers = [
  // GET /api/chat/sessions
  http.get('/api/chat/sessions', () => {
    return HttpResponse.json([])
  }),

  // POST /api/chat/sessions
  http.post('/api/chat/sessions', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      id: `chat-${Date.now()}`,
      notebook_id: body.notebook_id,
      model_id: body.model_id,
      title: 'New Chat Session',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    })
  }),

  // GET /api/chat/sessions/:id/messages
  http.get('/api/chat/sessions/:id/messages', ({ params }) => {
    return HttpResponse.json({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello!',
          created: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hello! How can I help you today?',
          created: new Date().toISOString(),
        },
      ],
    })
  }),

  // POST /api/chat/sessions/:id/messages
  http.post('/api/chat/sessions/:id/messages', async ({ params, request }) => {
    const body = await request.json()
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: body.message,
      created: new Date().toISOString(),
    })
  }),
]