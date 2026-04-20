'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useNavigation } from '@/lib/hooks/use-navigation'
import { PdfViewer } from '@/components/pdf/PdfViewer'
import { useSource } from '@/lib/hooks/use-sources'

export default function PdfReaderPage() {
  const router = useRouter()
  const params = useParams()
  const navigation = useNavigation()

  const sourceId = params?.sourceId
    ? decodeURIComponent(params.sourceId as string)
    : ''

  // Fetch source details for title and notebook context
  const { data: source, isLoading: sourceLoading } = useSource(sourceId)

  // Custom back handler that looks at the source's linked notebooks
  const handleBackClick = useCallback(() => {
    if (source?.notebooks && source.notebooks.length > 0) {
      // Go to the specific notebook where this PDF belongs
      router.push(`/notebooks/${source.notebooks[0]}`)
    } else {
      // Fallback to the main notebooks page if it's unassigned
      router.push('/notebooks')
    }
  }, [router, source])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background z-50 shrink-0 relative">
        {/* Back button left */}
        <div className="flex items-center min-w-[90px]">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
            onClick={handleBackClick} // <-- Updated handler here
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </Button>
        </div>
        
        {/* Centered PDF title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full flex justify-center pointer-events-none">
          <span className="font-semibold text-base text-foreground truncate max-w-[60vw] text-center">
            {sourceLoading ? 'Loading...' : source?.title || 'PDF'}
          </span>
        </div>
        
        {/* Right side empty for symmetry */}
        <div className="min-w-[90px]" />
      </div>

      {/* PDF viewer fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <PdfViewer sourceId={sourceId} />
      </div>
    </div>
  )
}