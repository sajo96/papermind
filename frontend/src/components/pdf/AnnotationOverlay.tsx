'use client'

import { useRef, useState } from 'react'
import { Trash2, Pencil, StickyNote, X } from 'lucide-react'
import type { AnnotationResponse } from '@/lib/types/api'

type AnnotationTool = 'highlight' | 'underline' | 'note' | 'eraser'

interface AnnotationOverlayProps {
    annotations: AnnotationResponse[]
    activeTool: AnnotationTool
    onDelete: (id: string) => void
    onNoteClick: (position: { x: number; y: number }, pageNumber: number) => void
    onUpdateNote: (id: string, comment: string) => void
    onMoveNote: (id: string, x: number, y: number) => void
    onAttachNote: (id: string) => void  // new — attach note to highlight/underline
    pageNumber: number
}

interface ContextMenu {
    id: string
    x: number
    y: number
    type: string
    comment: string
}

function getStyle(annotation: AnnotationResponse, isEraser: boolean) {
    const color = annotation.color || '#fef08a'
    const eraserStyle = isEraser
        ? { cursor: 'crosshair', outline: '2px dashed red', opacity: 0.3 }
        : {}
    if (annotation.annotation_type === 'underline') {
        return { backgroundColor: 'transparent', borderBottom: `3px solid ${color}`, borderRadius: 2, ...eraserStyle }
    }
    return {
        backgroundColor: color,
        opacity: isEraser ? 0.3 : 0.45,
        borderRadius: 2,
        cursor: isEraser ? 'crosshair' : 'default',
        ...(isEraser ? { outline: '2px dashed red' } : {}),
    }
}

export function AnnotationOverlay({
    annotations,
    activeTool,
    onDelete,
    onNoteClick,
    onUpdateNote,
    onMoveNote,
    onAttachNote,
    pageNumber,
}: AnnotationOverlayProps) {
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [openNoteId, setOpenNoteId] = useState<string | null>(null) // which note is expanded
    const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)
    const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isEraser = activeTool === 'eraser'
    const isNoteTool = activeTool === 'note'

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isNoteTool) return
        if (e.target !== e.currentTarget) return
        const rect = e.currentTarget.getBoundingClientRect()
        onNoteClick(
            {
                x: (e.clientX - rect.left) / rect.width,
                y: (e.clientY - rect.top) / rect.height,
            },
            pageNumber
        )
    }

    const handleNoteMouseDown = (e: React.MouseEvent, annotation: AnnotationResponse) => {
        if (isEraser) return
        e.stopPropagation()

        const box = annotation.bounding_boxes[0]
        dragRef.current = {
            id: annotation.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: box.x1,
            origY: box.y1,
        }

        // Track if mouse actually moved during drag
        let didDrag = false

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!dragRef.current || !overlayRef.current) return

            const dist = Math.hypot(
                moveEvent.clientX - dragRef.current.startX,
                moveEvent.clientY - dragRef.current.startY
            )
            // Only count as a drag if moved more than 4px
            if (dist < 4) return
            didDrag = true

            const overlayRect = overlayRef.current.getBoundingClientRect()
            const dx = (moveEvent.clientX - dragRef.current.startX) / overlayRect.width
            const dy = (moveEvent.clientY - dragRef.current.startY) / overlayRect.height
            const newX = Math.max(0, Math.min(0.85, dragRef.current.origX + dx))
            const newY = Math.max(0, Math.min(0.9, dragRef.current.origY + dy))

            const capturedId = dragRef.current.id
            if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current)
            moveTimeoutRef.current = setTimeout(() => {
                onMoveNote(capturedId, newX, newY)
            }, 150)
        }

        const handleMouseUp = () => {
            // Only open note if it was a clean click, not a drag
            if (!didDrag) {
                setOpenNoteId(annotation.id)
            }
            dragRef.current = null
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }

    const handleContextMenu = (e: React.MouseEvent, annotation: AnnotationResponse) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({
            id: annotation.id,
            x: e.clientX,
            y: e.clientY,
            type: annotation.annotation_type,
            comment: annotation.comment || '',
        })
    }

    const startEdit = () => {
        if (!contextMenu) return
        setEditingId(contextMenu.id)
        setEditText(contextMenu.comment)
        setOpenNoteId(contextMenu.id)
        setContextMenu(null)
    }

    const saveEdit = (id: string) => {
        onUpdateNote(id, editText)
        setEditingId(null)
        setEditText('')
    }

    const closeContext = () => setContextMenu(null)

    const noteAnnotations = annotations.filter(a => a.annotation_type === 'note')
    const otherAnnotations = annotations.filter(a => a.annotation_type !== 'note')

    return (
        <>
            <div
                ref={overlayRef}
                className="absolute pointer-events-none"
                style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }}
            >
                {/* Note tool click layer */}
                {isNoteTool && (
                    <div
                        className="absolute inset-0 pointer-events-auto cursor-crosshair"
                        style={{ zIndex: 1 }}
                        onClick={handleOverlayClick}
                    />
                )}

                {/* Highlights & Underlines */}
                {otherAnnotations.map(annotation =>
                    annotation.bounding_boxes.map((box, i) => (
                        <div
                            key={`${annotation.id}-${i}`}
                            className="absolute pointer-events-auto group"
                            style={{
                                left: `${box.x1 * 100}%`,
                                top: `${box.y1 * 100}%`,
                                width: `${(box.x2 - box.x1) * 100}%`,
                                height: `${(box.y2 - box.y1) * 100}%`,
                                ...getStyle(annotation, isEraser),
                            }}
                            onClick={() => isEraser && onDelete(annotation.id)}
                            onContextMenu={e => handleContextMenu(e, annotation)}
                        >
                            {/* Show attached comment on hover if exists */}
                            {annotation.comment && !isEraser && (
                                <div className="hidden group-hover:block absolute z-50 left-0 -top-8 bg-white dark:bg-zinc-900 border shadow-md px-2 py-1 text-xs rounded-md pointer-events-none whitespace-nowrap max-w-48 truncate">
                                    💬 {annotation.comment}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* Sticky Notes — collapsed icon → expanded card */}
                {noteAnnotations.map(annotation => {
                    const box = annotation.bounding_boxes[0]
                    const isOpen = openNoteId === annotation.id
                    const isEditing = editingId === annotation.id

                    return (
                        <div
                            key={annotation.id}
                            className="absolute pointer-events-auto"
                            style={{
                                left: `${box.x1 * 100}%`,
                                top: `${box.y1 * 100}%`,
                                zIndex: isOpen ? 10 : 4,
                                userSelect: 'none',
                            }}
                            onMouseDown={e => !isOpen && handleNoteMouseDown(e, annotation)}
                            onContextMenu={e => handleContextMenu(e, annotation)}
                        >
                            {isOpen ? (
                                // Expanded note card
                                <div
                                    className="w-52 shadow-xl rounded-sm border border-yellow-300 overflow-hidden"
                                    style={{ background: annotation.color || '#fef08a' }}
                                    onMouseDown={e => e.stopPropagation()} // prevent drag when open
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-2 py-1 bg-yellow-400/60 cursor-grab"
                                        onMouseDown={e => handleNoteMouseDown(e, annotation)}
                                    >
                                        <span className="text-xs font-semibold text-yellow-900">Note</span>
                                        <button
                                            className="text-yellow-800 hover:text-yellow-900"
                                            onClick={e => { e.stopPropagation(); setOpenNoteId(null); setEditingId(null) }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Body */}
                                    <div className="px-2 py-1.5 min-h-[60px]">
                                        {isEditing ? (
                                            <textarea
                                                autoFocus
                                                value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                onBlur={() => saveEdit(annotation.id)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && !e.shiftKey) saveEdit(annotation.id)
                                                    if (e.key === 'Escape') { setEditingId(null); setOpenNoteId(null) }
                                                }}
                                                className="w-full text-xs bg-transparent resize-none outline-none text-yellow-900 dark:text-yellow-100 min-h-[60px]"
                                                rows={4}
                                                onMouseDown={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <p
                                                className="text-xs text-yellow-900 whitespace-pre-wrap break-words cursor-text"
                                                onDoubleClick={() => {
                                                    setEditingId(annotation.id)
                                                    setEditText(annotation.comment || '')
                                                }}
                                            >
                                                {annotation.comment || (
                                                    <span className="opacity-40 italic">Double-click to edit…</span>
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {/* Quoted text */}
                                    {annotation.selected_text && (
                                        <div className="px-2 pb-1.5 border-t border-yellow-300/50">
                                            <p className="text-[10px] text-yellow-800/60 italic line-clamp-1">
                                                "{annotation.selected_text}"
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Collapsed — just the icon
                                <div
                                    className={`
                    flex items-center justify-center w-6 h-6 rounded-full shadow-md
                    transition-opacity cursor-pointer
                    opacity-70 hover:opacity-100
                    ${isEraser ? 'bg-red-400' : 'bg-amber-400 dark:bg-amber-500'}
                    ring-2 ring-white dark:ring-zinc-800
                  `}
                                    onClick={e => {
                                        e.stopPropagation()
                                        if (isEraser) onDelete(annotation.id)
                                    }}
                                >
                                    <StickyNote size={13} className="text-white" />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={closeContext} />
                    <div
                        className="fixed z-50 bg-white dark:bg-zinc-900 border shadow-lg rounded-md py-1 min-w-[160px]"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        {contextMenu.type === 'note' && (
                            <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                                onClick={startEdit}
                            >
                                <Pencil size={13} />
                                Edit Note
                            </button>
                        )}
                        {/* Attach note to highlight/underline */}
                        {(contextMenu.type === 'highlight' || contextMenu.type === 'underline') && (
                            <button
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                                onClick={() => {
                                    onAttachNote(contextMenu.id)
                                    closeContext()
                                }}
                            >
                                <StickyNote size={13} />
                                {contextMenu.comment ? 'Edit Note' : 'Add Note'}
                            </button>
                        )}
                        <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => { onDelete(contextMenu.id); closeContext() }}
                        >
                            <Trash2 size={13} />
                            Delete
                        </button>
                    </div>
                </>
            )}
        </>
    )
}