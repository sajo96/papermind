import { http, HttpResponse } from 'msw'

export const searchHandlers = [
  // GET /api/search/knowledge
  http.get('/api/search/knowledge', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')

    if (!q) {
      return HttpResponse.json({
        results: [],
        total: 0,
        message: 'Search query is required',
      })
    }

    return HttpResponse.json({
      results: [
        {
          id: 'result-1',
          title: 'Mock Result 1',
          content: `This is a mock search result for "${q}". It contains relevant information about your query.`,
          source_id: 'src-1',
          score: 0.95,
        },
      ],
      total: 1,
      message: 'Search completed successfully',
    })
  }),

  // POST /api/search/ask
  http.post('/api/search/ask', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      strategy: body.strategy,
      question: body.question,
      answer: 'This is a mock AI response based on your question.',
      sources: [],
      context_used: 0,
      tokens_used: 100,
    })
  }),

  // GET /api/search/strategies
  http.get('/api/search/strategies', () => {
    return HttpResponse.json([
      { id: 'summarize', name: 'Summarize', description: 'Generate a summary of relevant sources' },
      { id: 'extract', name: 'Extract', description: 'Extract key information from sources' },
      { id: 'answer', name: 'Answer Question', description: 'Answer a specific question based on sources' },
    ])
  }),
]