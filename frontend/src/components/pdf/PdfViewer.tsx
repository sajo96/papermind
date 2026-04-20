'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import '@/lib/pdf-polyfills'
import { Document, Page } from 'react-pdf'
import { Loader2, FileX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PdfToolbar } from './PdfToolbar'
import { AnnotationOverlay } from './AnnotationOverlay'
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useUpdateAnnotation,
} from '@/lib/hooks/use-annotations'
import { useTranslation } from '@/lib/hooks/use-translation'
import { createMockPdfBytes, getPdfUrl } from '@/lib/utils/pdf'
import type { AnnotationCreate } from '@/lib/types/api'
import '@/lib/pdf-worker'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

interface PdfViewerProps {
  sourceId: string
}

type AnnotationTool = 'highlight' | 'underline' | 'note' | 'eraser'

export function PdfViewer({ sourceId }: PdfViewerProps) {
  const { t } = useTranslation()
  const [numPages, setNumPages] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1.0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('highlight')
  const [activeColor, setActiveColor] = useState('#fef08a')
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const { data: annotationsData } = useAnnotations(sourceId)
  const createAnnotation = useCreateAnnotation(sourceId)
  const deleteAnnotation = useDeleteAnnotation(sourceId)
  const updateAnnotation = useUpdateAnnotation(sourceId) // added
  const annotations = Array.isArray(annotationsData) ? annotationsData : []

  const pageLabel = useMemo(() => {
    if (!t.pdfReader?.pageOf) return `${currentPage} / ${numPages || 0}`
    return t.pdfReader.pageOf
      .replace('{page}', String(currentPage))
      .replace('{total}', String(numPages || 0))
  }, [currentPage, numPages, t.pdfReader?.pageOf])

  const pdfFile = useMemo(() => {
    if (process.env.NEXT_PUBLIC_MOCK_API === 'true') {
      return { data: createMockPdfBytes(sourceId) }
    }
    const file: { url: string; httpHeaders?: Record<string, string> } = {
      url: getPdfUrl(sourceId),
    }
    if (typeof window !== 'undefined') {
      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        try {
          const parsed = JSON.parse(authStorage)
          const token = parsed?.state?.token
          if (token) file.httpHeaders = { Authorization: `Bearer ${token}` }
        } catch {
          // no-op
        }
      }
    }
    return file
  }, [sourceId])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setCurrentPage(1)
    setLoading(false)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error)
    setError(t.pdfReader.loadError)
    setLoading(false)
  }

  const handlePageChange = (page: number) => {
    if (!numPages) return
    const targetPage = Math.max(1, Math.min(page, numPages))
    setCurrentPage(targetPage)
    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5))

  useEffect(() => {
    const container = document.getElementById('pdf-scroll-container')
    if (!container) return
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(prev =>
        e.deltaY < 0 ? Math.min(prev + 0.1, 3) : Math.max(prev - 0.1, 0.5)
      )
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // Highlight/underline saves instantly on mouse up — no popup
  const handleSelection = (pageNumber: number, container: HTMLDivElement) => {
    if (activeTool === 'eraser' || activeTool === 'note') return

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const selectedText = selectionObj.toString().trim()
    if (!selectedText) return

    const range = selectionObj.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return

    const pageRect = container.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0)
    if (rects.length === 0 || pageRect.width === 0 || pageRect.height === 0) return

    const boundingBoxes = rects.map(rect => ({
      x1: (rect.left - pageRect.left) / pageRect.width,
      y1: (rect.top - pageRect.top) / pageRect.height,
      x2: (rect.right - pageRect.left) / pageRect.width,
      y2: (rect.bottom - pageRect.top) / pageRect.height,
    }))

    selectionObj.removeAllRanges()

    // Instant save — no popup
    createAnnotation.mutate({
      page_number: pageNumber,
      annotation_type: activeTool,
      selected_text: selectedText,
      bounding_boxes: boundingBoxes,
      color: activeColor,
      comment: undefined,
    })
  }

  // Click anywhere on page to drop a sticky note
  const handleNoteClick = async (
    position: { x: number; y: number },
    pageNumber: number
  ) => {
    await createAnnotation.mutateAsync({
      page_number: pageNumber,
      annotation_type: 'note',
      selected_text: '',
      bounding_boxes: [{
        x1: position.x,
        y1: position.y,
        x2: position.x + 0.15,
        y2: position.y + 0.1,
      }],
      color: activeColor,
      comment: '',
    })
  }

  // Save edited note text
  const handleUpdateNote = async (id: string, comment: string) => {
    await updateAnnotation.mutateAsync({ id, comment })
  }

  // Drag note to new position
  const handleMoveNote = async (id: string, x: number, y: number) => {
    const ann = annotations.find(a => a.id === id)
    if (!ann) return
    const box = ann.bounding_boxes[0]
    const w = box.x2 - box.x1
    const h = box.y2 - box.y1
    await updateAnnotation.mutateAsync({
      id,
      bounding_boxes: [{ x1: x, y1: y, x2: x + w, y2: y + h }],
    })
  }

  // Opens an inline edit for attaching a comment to a highlight/underline
  const [attachingId, setAttachingId] = useState<string | null>(null)
  const [attachText, setAttachText] = useState('')

  const handleAttachNote = (id: string) => {
    const ann = annotations.find(a => a.id === id)
    setAttachingId(id)
    setAttachText(ann?.comment || '')
  }

  const handleSaveAttachedNote = async () => {
    if (!attachingId) return
    await updateAnnotation.mutateAsync({ id: attachingId, comment: attachText })
    setAttachingId(null)
    setAttachText('')
  }

  const handleDeleteAnnotation = async (id: string) => {
    await deleteAnnotation.mutateAsync(id)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <FileX size={40} className="text-muted-foreground" />
        <p>{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          {t.pdfReader.tryAgain}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PdfToolbar
        currentPage={currentPage}
        numPages={numPages}
        zoom={zoom}
        activeTool={activeTool}
        activeColor={activeColor}
        onToolChange={setActiveTool}
        onColorChange={setActiveColor}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      <div
        id="pdf-scroll-container"
        className="flex-1 overflow-auto bg-muted/30 p-4 pl-2 flex flex-col items-center"
      >
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin" />
          </div>
        )}

        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          error={<span>{t.pdfReader.loadError}</span>}
        >
          {Array.from({ length: numPages || 0 }, (_, index) => {
            const pageNumber = index + 1
            const pageAnnotations = annotations.filter(ann => ann.page_number === pageNumber)

            return (
              <div
                key={pageNumber}
                ref={node => { pageRefs.current[pageNumber] = node }}
                className="relative mb-4 shadow-md"
                onMouseUp={event => handleSelection(pageNumber, event.currentTarget)}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={zoom}
                  onRenderSuccess={() => {
                    const canvas = pageRefs.current[pageNumber]?.querySelector('canvas')
                    if (canvas && pageRefs.current[pageNumber]) {
                      pageRefs.current[pageNumber]!.style.width = `${canvas.offsetWidth}px`
                      pageRefs.current[pageNumber]!.style.height = `${canvas.offsetHeight}px`
                    }
                  }}
                />
                { }
                <AnnotationOverlay
                  annotations={pageAnnotations}
                  activeTool={activeTool}
                  onDelete={handleDeleteAnnotation}
                  onNoteClick={handleNoteClick}
                  onUpdateNote={handleUpdateNote}
                  onMoveNote={handleMoveNote}
                  onAttachNote={handleAttachNote}
                  pageNumber={pageNumber}
                />
              </div>
            )
          })}
        </Document>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center justify-center gap-2 py-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage <= 1}
        >
          {t.pdfReader.previous}
        </Button>
        <span className="text-sm">{pageLabel}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={!numPages || currentPage >= numPages}
        >
          {t.pdfReader.next}
        </Button>
      </div>
      {attachingId && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-zinc-900 border shadow-xl rounded-lg p-3 w-72">
          <p className="text-xs text-muted-foreground mb-2">Add note to annotation</p>
          <textarea
            autoFocus
            value={attachText}
            onChange={e => setAttachText(e.target.value)}
            className="w-full text-sm border rounded p-2 resize-none outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
            placeholder="Type your note…"
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => setAttachingId(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveAttachedNote}>Save</Button>
          </div>
        </div>
      )}
    </div>
  )
}