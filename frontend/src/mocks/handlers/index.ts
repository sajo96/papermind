import { http, HttpResponse } from 'msw'
import { configHandlers } from './config'
import { authHandlers } from './auth'
import { notebookHandlers } from './notebooks'
import { sourceHandlers } from './sources'
import { noteHandlers } from './notes'
import { settingsHandlers } from './settings'
import { modelHandlers } from './models'
import { chatHandlers } from './chat'
import { searchHandlers } from './search'
import { papermindHandlers } from './papermind'
import { annotationHandlers } from './annotations'

export const handlers = [
  ...configHandlers,
  ...authHandlers,
  ...notebookHandlers,
  ...sourceHandlers,
  ...noteHandlers,
  ...settingsHandlers,
  ...modelHandlers,
  ...chatHandlers,
  ...searchHandlers,
  ...papermindHandlers,
  ...annotationHandlers,

  // Catch-all for any unhandled endpoints - return success to prevent errors
  http.all('/api/:path*', () => {
    return new HttpResponse(null, { status: 200 })
  }),
]