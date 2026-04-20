import { http, HttpResponse } from 'msw'
import type { AnnotationCreate, AnnotationResponse } from '@/lib/types/api'

// Simple in-memory store for annotations in mock mode
export const mockAnnotationsState = {
  annotations: [] as AnnotationResponse[],
}

export const annotationHandlers = [
  // GET /api/sources/:sourceId/annotations
  http.get('/api/sources/:sourceId/annotations', ({ params }) => {
    const { sourceId } = params
    const sourceAnnotations = mockAnnotationsState.annotations.filter(
      (a) => a.source_id === sourceId
    )
    return HttpResponse.json(sourceAnnotations)
  }),

  // POST /api/sources/:sourceId/annotations
  http.post('/api/sources/:sourceId/annotations', async ({ request, params }) => {
    const { sourceId } = params
    const body = (await request.json()) as AnnotationCreate

    const newAnnotation: AnnotationResponse = {
      id: `annotation-${Date.now()}`,
      source_id: sourceId as string,
      page_number: body.page_number,
      annotation_type: body.annotation_type,
      selected_text: body.selected_text,
      bounding_boxes: body.bounding_boxes,
      color: body.color,
      comment: body.comment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockAnnotationsState.annotations.push(newAnnotation)
    return HttpResponse.json(newAnnotation)
  }),

  // PATCH /api/annotations/:annotationId
  http.patch('/api/annotations/:annotationId', async ({ request, params }) => {
    const { annotationId } = params
    const body = (await request.json()) as Partial<AnnotationCreate>

    const idx = mockAnnotationsState.annotations.findIndex((a) => a.id === annotationId)
    if (idx === -1) {
      return new HttpResponse(null, { status: 404 })
    }

    const updatedAnnotation = {
      ...mockAnnotationsState.annotations[idx],
      ...body,
      updated_at: new Date().toISOString(),
    }

    mockAnnotationsState.annotations[idx] = updatedAnnotation
    return HttpResponse.json(updatedAnnotation)
  }),

  // DELETE /api/annotations/:annotationId
  http.delete('/api/annotations/:annotationId', ({ params }) => {
    const { annotationId } = params
    const idx = mockAnnotationsState.annotations.findIndex((a) => a.id === annotationId)
    
    if (idx !== -1) {
      mockAnnotationsState.annotations.splice(idx, 1)
    }

    return HttpResponse.json({ deleted: annotationId })
  }),

  // DELETE /api/sources/:sourceId/annotations
  http.delete('/api/sources/:sourceId/annotations', ({ params }) => {
    const { sourceId } = params
    
    mockAnnotationsState.annotations = mockAnnotationsState.annotations.filter(
      (a) => a.source_id !== sourceId
    )

    return HttpResponse.json({ cleared: sourceId })
  }),
]
