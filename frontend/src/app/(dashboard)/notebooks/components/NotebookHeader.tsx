'use client'

import { useState } from 'react'
import { NotebookResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Archive, ArchiveRestore, Trash2, Network } from 'lucide-react'
import { useUpdateNotebook } from '@/lib/hooks/use-notebooks'
import { NotebookDeleteDialog } from './NotebookDeleteDialog'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { InlineEdit } from '@/components/common/InlineEdit'
import { useTranslation } from '@/lib/hooks/use-translation'
import Link from 'next/link'
import { useRouter } from "next/navigation";

interface NotebookHeaderProps {
  notebook: NotebookResponse
}

export function NotebookHeader({ notebook }: NotebookHeaderProps) {
  const { t, language } = useTranslation()
  const dfLocale = getDateLocale(language)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const router = useRouter();

  const updateNotebook = useUpdateNotebook()

  const handleUpdateName = async (name: string) => {
    if (!name || name === notebook.name) return

    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { name }
    })
  }

  const handleUpdateDescription = async (description: string) => {
    if (description === notebook.description) return

    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { description: description || undefined }
    })
  }

  const handleArchiveToggle = () => {
    updateNotebook.mutate({
      id: notebook.id,
      data: { archived: !notebook.archived }
    })
  }

  return (
    <>
      <div className="border-b pb-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className=" flex text-primary w-8 mr-4 hover:bg-accent transition-colors"
                onClick={() => router.push('/notebooks')}
                type="button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-1">
              <InlineEdit
                id="notebook-name"
                name="notebook-name"
                value={notebook.name}
                onSave={handleUpdateName}
                className="text-2xl font-bold"
                inputClassName="text-2xl font-bold"
                placeholder={t.notebooks.namePlaceholder}
              />
              {notebook.archived && (
                <Badge variant="secondary">{t.notebooks.archived}</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Link href={`/notebooks/${encodeURIComponent(notebook.id)}/graph`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-primary/10 text-primary dark:hover:bg-primary dark:hover:text-white"
                >
                  <Network className="h-4 w-4 mr-2" />
                  Knowledge Map
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleArchiveToggle}
              >
                {notebook.archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4 mr-2 text-green-500" />
                    {t.notebooks.unarchive}
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2 text-orange-500" />
                    {t.notebooks.archive}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 dark:hover:bg-red-600 dark:hover:text-white"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t.common.delete}
              </Button>
            </div>
          </div>

          <InlineEdit
            id="notebook-description"
            name="notebook-description"
            value={notebook.description || ''}
            onSave={handleUpdateDescription}
            className="text-muted-foreground"
            inputClassName="text-muted-foreground"
            placeholder={t.notebooks.addDescription}
            multiline
            emptyText={t.notebooks.addDescription}
          />

          <div className="text-sm text-muted-foreground">
            {t.common.created.replace('{time}', formatDistanceToNow(new Date(notebook.created), { addSuffix: true, locale: dfLocale }))} •
            {t.common.updated.replace('{time}', formatDistanceToNow(new Date(notebook.updated), { addSuffix: true, locale: dfLocale }))}
          </div>
        </div>
      </div>

      <NotebookDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        notebookId={notebook.id}
        notebookName={notebook.name}
        redirectAfterDelete
      />
    </>
  )
}