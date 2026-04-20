'use client'

import { useState, useMemo } from 'react'
import {
    Highlighter,
    Underline,
    StickyNote,
    ZoomIn,
    ZoomOut,
    Eraser,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/hooks/use-translation'

type AnnotationTool = 'highlight' | 'underline' | 'note' | 'eraser'

const HIGHLIGHT_COLORS = [
    '#fef08a', // yellow
    '#86efac', // green
    '#93c5fd', // blue
    '#f9a8d4', // pink
    '#fca5a5', // red
    '#d8b4fe', // purple
]

interface PdfToolbarProps {
    currentPage: number
    numPages: number | null
    zoom: number
    activeTool: AnnotationTool
    activeColor: string
    isClearing?: boolean
    onToolChange: (tool: AnnotationTool) => void
    onColorChange: (color: string) => void
    onZoomIn: () => void
    onZoomOut: () => void
}

export function PdfToolbar({
    currentPage,
    numPages,
    zoom,
    activeTool,
    activeColor,
    onToolChange,
    onColorChange,
    onZoomIn,
    onZoomOut,
}: PdfToolbarProps) {
    const { t } = useTranslation()

    const pageLabel = useMemo(() => {
        if (!t.pdfReader?.pageOf) return `${currentPage} / ${numPages || 0}`
        return t.pdfReader.pageOf
            .replace('{page}', String(currentPage))
            .replace('{total}', String(numPages || 0))
    }, [currentPage, numPages, t.pdfReader?.pageOf])

    const toolButtons: Array<{ key: AnnotationTool; icon: typeof Highlighter; label: string }> = [
        { key: 'highlight', icon: Highlighter, label: t.pdfReader.tools.highlight },
        { key: 'underline', icon: Underline, label: t.pdfReader.tools.underline },
        { key: 'note', icon: StickyNote, label: t.pdfReader.tools.note },
        { key: 'eraser', icon: Eraser, label: 'Eraser' },
    ]

    const showColorPicker = activeTool === 'highlight' || activeTool === 'underline'

    return (
        <div className="flex items-center gap-1 px-2 py-1 border-b">
            {/* Left: Annotation Tools */}
            <div className="flex items-center gap-1">
                {toolButtons.map(tool => {
                    const Icon = tool.icon
                    const isActive = activeTool === tool.key
                    return (
                        <Tooltip key={tool.key}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={isActive ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => onToolChange(tool.key)}
                                    aria-label={tool.label}
                                    className={
                                        tool.key === 'eraser' && isActive
                                            ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950 dark:text-red-400'
                                            : ''
                                    }
                                >
                                    <Icon size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{tool.label}</TooltipContent>
                        </Tooltip>
                    )
                })}
            </div>

            {/* Color Swatches */}
            {showColorPicker && (
                <>
                    <Separator orientation="vertical" className="h-6 mx-1" />
                    <div className="flex items-center gap-1.5">
                        {HIGHLIGHT_COLORS.map(color => {
                            const isSelected = activeColor === color
                            return (
                                <Tooltip key={color}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => onColorChange(color)}
                                            className="w-5 h-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                            style={{
                                                backgroundColor: color,
                                                // Visible ring in both light and dark mode
                                                boxShadow: isSelected
                                                    ? '0 0 0 2px white, 0 0 0 4px #6366f1'
                                                    : '0 0 0 1px rgba(0,0,0,0.2)',
                                            }}
                                            aria-label={`Color ${color}`}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent>{color}</TooltipContent>
                                </Tooltip>
                            )
                        })}
                    </div>
                </>
            )}

            {/* Page label — center */}
            <div className="flex-1 flex justify-center">
                <span className="text-xs text-muted-foreground">{pageLabel}</span>
            </div>

            {/* Right: Zoom Controls */}
            <div className="flex items-center gap-1">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={onZoomOut} aria-label={t.pdfReader.zoomOut}>
                            <ZoomOut size={16} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.pdfReader.zoomOut}</TooltipContent>
                </Tooltip>

                <span className="text-xs font-medium min-w-[42px] text-center tabular-nums">
                    {Math.round(zoom * 100)}%
                </span>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={onZoomIn} aria-label={t.pdfReader.zoomIn}>
                            <ZoomIn size={16} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.pdfReader.zoomIn}</TooltipContent>
                </Tooltip>
            </div>
        </div>
    )
}