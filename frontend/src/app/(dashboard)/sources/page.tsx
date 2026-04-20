'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { sourcesApi } from '@/lib/api/sources'
import { notebooksApi } from '@/lib/api/notebooks'
import { SourceListResponse, NotebookResponse } from '@/lib/types/api'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { AppShell } from '@/components/layout/AppShell'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  FileText, Link as LinkIcon, Upload, AlignLeft, Trash2,
  ArrowUpDown, Folder, FolderOpen, ChevronRight, ChevronDown
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getApiErrorKey } from '@/lib/utils/error-handler'

interface NotebookGroup {
  notebook: NotebookResponse
  sources: SourceListResponse[]
  loading: boolean
  loaded: boolean
}

const PAGE_SIZE = 30

export default function SourcesPage() {
  const { t, language } = useTranslation()
  const [notebookGroups, setNotebookGroups] = useState<NotebookGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [sortBy, setSortBy] = useState<'created' | 'updated'>('updated')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; source: SourceListResponse | null }>({
    open: false,
    source: null,
  })

  const router = useRouter()
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ---------- Fetch notebooks, then lazy-load sources per folder ----------

  const fetchNotebooks = useCallback(async () => {
    try {
      setLoading(true)
      const notebooks: NotebookResponse[] = await notebooksApi.list({ archived: false })
      setNotebookGroups(
        notebooks.map((nb) => ({ notebook: nb, sources: [], loading: false, loaded: false }))
      )
      // Auto-expand first notebook
      if (notebooks.length > 0) {
        setExpandedFolders(new Set([notebooks[0].id]))
        fetchSourcesForNotebook(notebooks[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch notebooks:', err)
      setError(t.sources.failedToLoad)
      toast.error(t.sources.failedToLoad)
    } finally {
      setLoading(false)
    }
  }, [t.sources.failedToLoad])

  const fetchSourcesForNotebook = useCallback(async (notebookId: string) => {
    setNotebookGroups((prev) =>
      prev.map((g) =>
        g.notebook.id === notebookId ? { ...g, loading: true } : g
      )
    )
    try {
      const data: SourceListResponse[] = await sourcesApi.list({
        notebook_id: notebookId,
        limit: PAGE_SIZE,
        offset: 0,
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      setNotebookGroups((prev) =>
        prev.map((g) =>
          g.notebook.id === notebookId
            ? { ...g, sources: data, loading: false, loaded: true }
            : g
        )
      )
    } catch (err) {
      console.error(`Failed to fetch sources for notebook ${notebookId}:`, err)
      toast.error(t.sources.failedToLoad)
      setNotebookGroups((prev) =>
        prev.map((g) =>
          g.notebook.id === notebookId ? { ...g, loading: false } : g
        )
      )
    }
  }, [sortBy, sortOrder, t.sources.failedToLoad])

  useEffect(() => {
    fetchNotebooks()
  }, [fetchNotebooks])

  // Re-fetch sources when sort changes, but only for already-loaded folders
  useEffect(() => {
    notebookGroups.forEach((g) => {
      if (g.loaded) fetchSourcesForNotebook(g.notebook.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder])

  // ---------- Folder toggle ----------

  const toggleFolder = useCallback((notebookId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(notebookId)) {
        next.delete(notebookId)
      } else {
        next.add(notebookId)
        // Lazy-load sources the first time a folder is opened
        const group = notebookGroups.find((g) => g.notebook.id === notebookId)
        if (group && !group.loaded && !group.loading) {
          fetchSourcesForNotebook(notebookId)
        }
      }
      return next
    })
  }, [notebookGroups, fetchSourcesForNotebook])

  // ---------- Flattened visible items for keyboard nav ----------

  const visibleItems = useMemo(() => {
    const items: Array<
      | { type: 'folder'; notebookId: string }
      | { type: 'file'; source: SourceListResponse; notebookId: string }
    > = []
    notebookGroups.forEach((g) => {
      items.push({ type: 'folder', notebookId: g.notebook.id })
      if (expandedFolders.has(g.notebook.id)) {
        g.sources.forEach((source) =>
          items.push({ type: 'file', source, notebookId: g.notebook.id })
        )
      }
    })
    return items
  }, [notebookGroups, expandedFolders])

  // ---------- Keyboard navigation ----------

  const scrollToSelectedRow = useCallback((index: number) => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    const rows = scrollContainer.querySelectorAll('tbody tr')
    const selectedRow = rows[index] as HTMLElement
    if (!selectedRow) return
    const containerRect = scrollContainer.getBoundingClientRect()
    const rowRect = selectedRow.getBoundingClientRect()
    if (rowRect.top < containerRect.top) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (rowRect.bottom > containerRect.bottom) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (visibleItems.length === 0) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, visibleItems.length - 1)
            setTimeout(() => scrollToSelectedRow(next), 0)
            return next
          })
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => {
            const next = Math.max(prev - 1, 0)
            setTimeout(() => scrollToSelectedRow(next), 0)
            return next
          })
          break
        case 'Enter':
          e.preventDefault()
          const item = visibleItems[selectedIndex]
          if (!item) return
          if (item.type === 'folder') toggleFolder(item.notebookId)
          else router.push(`/sources/${item.source.id}`)
          break
        case 'Home':
          e.preventDefault()
          setSelectedIndex(0)
          setTimeout(() => scrollToSelectedRow(0), 0)
          break
        case 'End':
          e.preventDefault()
          const last = visibleItems.length - 1
          setSelectedIndex(last)
          setTimeout(() => scrollToSelectedRow(last), 0)
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleItems, selectedIndex, router, toggleFolder, scrollToSelectedRow])

  useEffect(() => {
    if (visibleItems.length > 0 && tableRef.current) tableRef.current.focus()
  }, [visibleItems])

  // ---------- Helpers ----------

  const toggleSort = (field: 'created' | 'updated') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const getSourceIcon = (source: SourceListResponse) => {
    if (source.asset?.url) return <LinkIcon className="h-4 w-4" />
    if (source.asset?.file_path) return <Upload className="h-4 w-4" />
    return <AlignLeft className="h-4 w-4" />
  }

  const getSourceType = (source: SourceListResponse) => {
    if (source.asset?.url) return t.sources.type.link
    if (source.asset?.file_path) return t.sources.type.file
    return t.sources.type.text
  }

  const handleDeleteClick = useCallback((e: React.MouseEvent, source: SourceListResponse) => {
    e.stopPropagation()
    setDeleteDialog({ open: true, source })
  }, [])

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.source) return
    try {
      await sourcesApi.delete(deleteDialog.source.id)
      toast.success(t.sources.deleteSuccess)
      const deletedId = deleteDialog.source.id
      setNotebookGroups((prev) =>
        prev.map((g) => ({ ...g, sources: g.sources.filter((s) => s.id !== deletedId) }))
      )
      setDeleteDialog({ open: false, source: null })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string }
      console.error('Failed to delete source:', error)
      toast.error(t(getApiErrorKey(error.response?.data?.detail || error.message)))
    }
  }

  // ---------- Render guards ----------

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <p className="text-red-500">{error}</p>
        </div>
      </AppShell>
    )
  }

  if (notebookGroups.length === 0) {
    return (
      <AppShell>
        <EmptyState
          icon={FileText}
          title={t.sources.noSourcesYet}
          description={t.sources.allSourcesDescShort}
        />
      </AppShell>
    )
  }

  // ---------- Main render ----------

  return (
    <AppShell>
      <div className="flex flex-col h-full w-full max-w-none px-6 py-6">
        <div className="mb-6 flex-shrink-0">
          <h1 className="text-3xl font-bold">{t.sources.allSources}</h1>
          <p className="mt-2 text-muted-foreground">{t.sources.allSourcesDesc}</p>
        </div>

        <div ref={scrollContainerRef} className="flex-1 rounded-md border overflow-auto">
          <table
            ref={tableRef}
            tabIndex={0}
            className="w-full min-w-[800px] outline-none table-fixed"
          >
            <colgroup>
              <col className="w-auto" />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('created')}
                    className="h-8 px-2 hover:bg-muted"
                  >
                    {t.common.created_label}
                    <ArrowUpDown
                      className={cn(
                        'ml-2 h-3 w-3',
                        sortBy === 'created' ? 'opacity-100' : 'opacity-30'
                      )}
                    />
                    {sortBy === 'created' && (
                      <span className="ml-1 text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </Button>
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                  {t.common.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const isSelected = selectedIndex === index

                if (item.type === 'folder') {
                  const group = notebookGroups.find((g) => g.notebook.id === item.notebookId)!
                  const isExpanded = expandedFolders.has(item.notebookId)

                  return (
                    <tr
                      key={`folder-${item.notebookId}`}
                      onClick={() => {
                        setSelectedIndex(index)
                        toggleFolder(item.notebookId)
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        'border-b transition-colors cursor-pointer select-none',
                        isSelected ? 'bg-accent' : 'bg-muted/10 hover:bg-muted/30'
                      )}
                    >
                      <td colSpan={3} className="h-12 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </span>
                          {isExpanded ? (
                            <FolderOpen className="h-5 w-5 text-primary" />
                          ) : (
                            <Folder className="h-5 w-5 text-primary" />
                          )}
                          <span className="font-semibold">{group.notebook.name}</span>
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {group.notebook.source_count}
                          </Badge>
                          {group.loading && <LoadingSpinner className="h-3 w-3 ml-2" />}
                        </div>
                      </td>
                    </tr>
                  )
                }

                const { source } = item
                const sourceTypeLabel = getSourceType(source)

                return (
                  <tr
                    key={`file-${source.id}`}
                    onClick={() => {
                      setSelectedIndex(index)
                      router.push(`/sources/${source.id}`)
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'border-b transition-colors cursor-pointer',
                      isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                    )}
                  >
                    <td className="h-12 px-4 pl-12">
                      <div className="flex flex-col w-full min-w-0 overflow-hidden">
                        {/* Title and Icon Row */}
                        <div className="flex items-center gap-3">
                          <span className="font-medium truncate">
                            {source.title || t.sources.untitledSource}
                          </span>
                          <span
                            className="shrink-0 text-muted-foreground flex items-center"
                            title={sourceTypeLabel}
                            aria-label={sourceTypeLabel}
                          >
                            {getSourceIcon(source)}
                          </span>
                        </div>

                        {/* URL Row (if exists) */}
                        {source.asset?.url && (
                          <span className="text-xs text-muted-foreground truncate mt-0.5">
                            {source.asset.url}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="h-12 px-4 text-muted-foreground text-sm hidden sm:table-cell">
                      {formatDistanceToNow(new Date(source.created), {
                        addSuffix: true,
                        locale: getDateLocale(language),
                      })}
                    </td>

                    <td className="h-12 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteClick(e, source)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, source: deleteDialog.source })}
        title={t.sources.delete}
        description={t.sources.deleteConfirmWithTitle?.replace(
          '{title}',
          deleteDialog.source?.title || t.sources.untitledSource
        )}
        confirmText={t.common.delete}
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </AppShell>
  )
}