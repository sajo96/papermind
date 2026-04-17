import { http, HttpResponse } from 'msw'
import { mockSources, mockNotes } from '../data'

let sources = [...mockSources]

export const sourceHandlers = [
  // GET /api/sources
  http.get('/api/sources', ({ request }) => {
    const url = new URL(request.url)
    const notebookId = url.searchParams.get('notebook_id')
    const type = url.searchParams.get('type')

    let filtered = sources
    if (notebookId) {
      filtered = sources.filter(s => s.notebooks?.includes(notebookId))
    }
    if (type) {
      // Mock type filtering - in real app this would filter by asset type
    }

    return HttpResponse.json(filtered)
  }),

  // GET /api/sources/:id
  http.get('/api/sources/:id', ({ params }) => {
    const source = sources.find(s => s.id === params.id)
    if (!source) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json(source)
  }),

  // POST /api/sources
  http.post('/api/sources', async ({ request }) => {
    const body = await request.json() as any
    const newSource = {
      id: `src-${Date.now()}`,
      title: body.title || 'New Source',
      topics: body.topics || [],
      asset: body.asset || null,
      embedded: false,
      embedded_chunks: 0,
      insights_count: 0,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      full_text: '',
      notebooks: body.notebook_id ? [body.notebook_id] : [],
      status: 'new' as const,
    }
    sources.unshift(newSource)
    return HttpResponse.json(newSource)
  }),

  // PUT /api/sources/:id
  http.put('/api/sources/:id', async ({ params, request }) => {
    const body = await request.json()
    const idx = sources.findIndex(s => s.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })

    sources[idx] = {
      ...sources[idx],
      ...body,
      updated: new Date().toISOString(),
    }
    return HttpResponse.json(sources[idx])
  }),

  // DELETE /api/sources/:id
  http.delete('/api/sources/:id', ({ params }) => {
    const idx = sources.findIndex(s => s.id === params.id)
    if (idx !== -1) sources.splice(idx, 1)
    return HttpResponse.json({ message: 'Source deleted' })
  }),

  // POST /api/sources/:id/embed
  http.post('/api/sources/:id/embed', async ({ params, request }) => {
    const body = await request.json()
    const idx = sources.findIndex(s => s.id === params.id)
    if (idx !== -1) {
      sources[idx].embedded = true
      sources[idx].embedded_chunks = body.chunk_count || 3
    }
    return HttpResponse.json({
      message: 'Source embedded successfully',
      chunks: sources[idx]?.embedded_chunks || 3,
    })
  }),

  // GET /api/sources/:id/status
  http.get('/api/sources/:id/status', ({ params }) => {
    const source = sources.find(s => s.id === params.id)
    if (!source) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      status: 'complete',
      message: 'Source processing completed',
      processing_info: {},
      command_id: null,
    })
  }),

  // GET /api/sources/:id/notes
  http.get('/api/sources/:id/notes', ({ params }) => {
    const sourceNotes = mockNotes.filter(n => n.source_id === params.id)
    return HttpResponse.json(sourceNotes)
  }),

  // GET /api/papermind/sources/:id/preview
  http.get('/api/papermind/sources/:id/preview', ({ params }) => {
    const source = sources.find(s => s.id === params.id)
    if (!source) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      title: source.title,
      preview_text: source.full_text.substring(0, 200) + '...',
      insights_count: source.insights_count,
    })
  }),
]