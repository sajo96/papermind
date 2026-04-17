import { http, HttpResponse } from 'msw'
import { mockSourcesState } from './sources'

type PaperStage = 'ingesting' | 'parsing' | 'embedding' | 'notes' | 'graph' | 'done' | 'failed'
type TitleSource = 'crossref' | 'metadata' | 'scholarly' | 'heuristic' | 'raw_text' | 'llm' | 'unknown' | 'manual'

interface MockPaperStatus {
    source_id: string
    paper_id: string
    title: string
    pipeline_stage: PaperStage
    job_status: 'pending' | 'queued' | 'running' | 'done' | 'failed' | 'unknown'
    stage_updated_at: string
    error_message: string | null
    title_source: TitleSource
    title_confidence: number
}

interface WatchedFolder {
    id: string
    path: string
    notebook_id: string
    recursive: boolean
    active: boolean
    paper_count: number
    created_at: string
}

const now = () => new Date().toISOString()

const paperStatusStore = new Map<string, MockPaperStatus>([
    ['src-1', {
        source_id: 'src-1',
        paper_id: 'paper-1',
        title: 'Introduction to Machine Learning',
        pipeline_stage: 'done',
        job_status: 'done',
        stage_updated_at: now(),
        error_message: null,
        title_source: 'metadata',
        title_confidence: 0.94,
    }],
    ['src-2', {
        source_id: 'src-2',
        paper_id: 'paper-2',
        title: 'Deep Learning Architectures',
        pipeline_stage: 'done',
        job_status: 'done',
        stage_updated_at: now(),
        error_message: null,
        title_source: 'crossref',
        title_confidence: 0.97,
    }],
    ['src-3', {
        source_id: 'src-3',
        paper_id: 'paper-3',
        title: 'My ML Study Notes',
        pipeline_stage: 'done',
        job_status: 'done',
        stage_updated_at: now(),
        error_message: null,
        title_source: 'manual',
        title_confidence: 1,
    }],
])

const paperNotesStore = new Map<string, {
    one_line_summary: string
    key_findings: string[]
    methodology: string
    limitations: string[]
}>([
    ['paper-1', {
        one_line_summary: 'A practical overview of core machine learning foundations and model evaluation.',
        key_findings: [
            'Supervised learning dominates structured prediction tasks.',
            'Feature quality strongly influences model performance.',
            'Cross-validation improves generalization estimates.',
        ],
        methodology: 'Comparative evaluation across baseline models on benchmark datasets.',
        limitations: ['Limited domain transfer analysis', 'Small ablation set for hyperparameters'],
    }],
    ['paper-2', {
        one_line_summary: 'Deep architectures improve representation learning for complex perceptual tasks.',
        key_findings: [
            'Convolutional patterns improve visual feature extraction.',
            'Depth and skip connections stabilize training.',
            'Regularization remains critical for robust performance.',
        ],
        methodology: 'Architecture-level experiments with controlled optimization settings.',
        limitations: ['Compute-heavy training setup', 'Limited low-resource benchmarking'],
    }],
    ['paper-3', {
        one_line_summary: 'A concise personal synthesis of optimization and generalization concepts.',
        key_findings: [
            'Gradient descent variants trade speed for stability.',
            'Batch size influences noise and convergence behavior.',
            'Validation splits are essential for honest tuning.',
        ],
        methodology: 'Structured notes distilled from tutorials and reference papers.',
        limitations: ['Non-peer-reviewed source notes', 'No quantitative experiments'],
    }],
])

let watchedFolders: WatchedFolder[] = [
    {
        id: 'watch-1',
        path: '/Users/demo/ResearchPapers',
        notebook_id: 'nb-1',
        recursive: true,
        active: true,
        paper_count: 12,
        created_at: now(),
    },
]

function toStatusBySource(sourceId: string) {
    const status = paperStatusStore.get(sourceId)
    if (!status) return null

    return {
        paper_id: status.paper_id,
        title: status.title,
        pipeline_stage: status.pipeline_stage,
        job_status: status.job_status,
        stage_updated_at: status.stage_updated_at,
        error_message: status.error_message,
        title_source: status.title_source,
        title_confidence: status.title_confidence,
    }
}

function getNotebookId(value: string | undefined): string {
    if (!value) return ''
    const decoded = decodeURIComponent(value)
    return decoded.startsWith('notebook:') ? decoded.replace('notebook:', '') : decoded
}

export const papermindHandlers = [
    // POST /api/papermind/upload-async
    http.post('/api/papermind/upload-async', async ({ request }) => {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const notebookId = String(formData.get('notebook_id') || 'nb-1')

        const sourceId = `src-${Date.now()}`
        const paperId = `paper-${Date.now()}`
        const title = file?.name?.replace(/\.[^.]+$/, '') || 'Uploaded Paper'

        mockSourcesState.sources.unshift({
            id: sourceId,
            title,
            topics: ['paper', 'uploaded'],
            asset: {
                file_path: `/uploads/${file?.name || `${sourceId}.pdf`}`,
                url: '',
            },
            embedded: true,
            embedded_chunks: 6,
            insights_count: 2,
            created: now(),
            updated: now(),
            full_text: 'Mock uploaded paper content for PaperMind preview.',
            notebooks: [notebookId],
            status: 'completed',
        })

        paperStatusStore.set(sourceId, {
            source_id: sourceId,
            paper_id: paperId,
            title,
            pipeline_stage: 'done',
            job_status: 'done',
            stage_updated_at: now(),
            error_message: null,
            title_source: 'manual',
            title_confidence: 1,
        })

        paperNotesStore.set(paperId, {
            one_line_summary: 'A newly uploaded paper was ingested and summarized in mock mode.',
            key_findings: [
                'Ingestion pipeline completed in mock mode.',
                'Embeddings and notes were generated.',
            ],
            methodology: 'Simulated ingestion pipeline in MSW mock handler.',
            limitations: ['Mock content only'],
        })

        return HttpResponse.json({
            source_id: sourceId,
            paper_id: paperId,
            title,
            atom_count: 42,
            similarity_edge_count: 18,
            tag_count: 6,
            note_id: `note-${Date.now()}`,
            status: 'complete',
        })
    }),

    // GET /api/papermind/papers/source/:sourceId/status
    http.get('/api/papermind/papers/source/:sourceId/status', ({ params }) => {
        const sourceId = String(params.sourceId || '')
        const status = toStatusBySource(sourceId)
        if (!status) {
            return new HttpResponse(null, { status: 404 })
        }
        return HttpResponse.json(status)
    }),

    // POST /api/papermind/papers/:paperId/retry
    http.post('/api/papermind/papers/:paperId/retry', ({ params }) => {
        const paperId = String(params.paperId || '')
        const entry = Array.from(paperStatusStore.values()).find((item) => item.paper_id === paperId)
        if (!entry) {
            return new HttpResponse(null, { status: 404 })
        }

        entry.pipeline_stage = 'parsing'
        entry.job_status = 'running'
        entry.stage_updated_at = now()
        entry.error_message = null

        return HttpResponse.json({
            status: 'queued',
            paper_id: paperId,
        })
    }),

    // PATCH /api/papermind/papers/:paperId/title
    http.patch('/api/papermind/papers/:paperId/title', async ({ params, request }) => {
        const paperId = String(params.paperId || '')
        const body = await request.json() as { title?: string }
        const entry = Array.from(paperStatusStore.values()).find((item) => item.paper_id === paperId)

        if (!entry || !body.title) {
            return new HttpResponse(null, { status: 404 })
        }

        entry.title = body.title.trim()
        entry.title_source = 'manual'
        entry.title_confidence = 1
        entry.stage_updated_at = now()

        const source = mockSourcesState.sources.find((item) => item.id === entry.source_id)
        if (source) {
            source.title = entry.title
            source.updated = now()
        }

        return HttpResponse.json({
            paper_id: paperId,
            source_id: entry.source_id,
            title: entry.title,
            title_source: 'manual',
            title_confidence: 1,
        })
    }),

    // GET /api/papermind/graph/:notebookId
    http.get('/api/papermind/graph/:notebookId', ({ params, request }) => {
        const notebookId = getNotebookId(String(params.notebookId || ''))
        const url = new URL(request.url)
        const conceptFilter = url.searchParams.get('concept_filter')?.trim().toLowerCase()

        const notebookSources = mockSourcesState.sources.filter((source) => source.notebooks?.includes(notebookId))
        const statuses = notebookSources
            .map((source) => toStatusBySource(source.id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))

        const paperNodes = notebookSources.map((source, index) => ({
            id: statuses[index]?.paper_id || source.id,
            type: 'paper',
            label: statuses[index]?.title || source.title || `Paper ${index + 1}`,
            year: 2022 + (index % 3),
            authors: ['PaperMind Team'],
            doi: `10.5555/mock.${index + 1}`,
            atom_count: 20 + index * 5,
            concepts: (source.topics || []).map((topic) => `concept:${topic.replace(/\s+/g, '_').toLowerCase()}`),
        }))

        const conceptSet = new Set<string>()
        paperNodes.forEach((paper) => {
            (paper.concepts || []).forEach((concept) => {
                if (!conceptFilter || concept.toLowerCase().includes(conceptFilter)) {
                    conceptSet.add(concept)
                }
            })
        })

        const conceptNodes = Array.from(conceptSet).map((concept) => ({
            id: concept,
            type: 'concept',
            label: concept.replace('concept:', '').replace(/_/g, ' '),
        }))

        const taggedEdges = paperNodes.flatMap((paper) =>
            (paper.concepts || [])
                .filter((concept) => conceptSet.has(concept))
                .map((concept) => ({
                    source: paper.id,
                    target: concept,
                    type: 'tagged_with',
                    weight: 1,
                }))
        )

        const similarityEdges = paperNodes.length > 1
            ? [{
                source: paperNodes[0].id,
                target: paperNodes[1].id,
                type: 'concept_similarity',
                weight: 0.82,
                label: 'shared concepts',
            }]
            : []

        const edges = [...taggedEdges, ...similarityEdges]

        return HttpResponse.json({
            nodes: [...paperNodes, ...conceptNodes],
            edges,
            meta: {
                paper_count: paperNodes.length,
                concept_count: conceptNodes.length,
                concept_options: conceptNodes.map((node) => node.id),
                edge_count: edges.length,
                generated_at: now(),
            },
        })
    }),

    // GET /api/papermind/note/:paperId
    http.get('/api/papermind/note/:paperId', ({ params }) => {
        const paperId = String(params.paperId || '')
        const note = paperNotesStore.get(paperId)
        if (!note) {
            return new HttpResponse(null, { status: 404 })
        }
        return HttpResponse.json({
            paper_id: paperId,
            note,
        })
    }),

    // POST /api/papermind/generate_note
    http.post('/api/papermind/generate_note', async ({ request }) => {
        const body = await request.json() as { paper_id?: string }
        const paperId = body.paper_id || `paper-${Date.now()}`

        const note = paperNotesStore.get(paperId) || {
            one_line_summary: 'Mock-generated note for PaperMind graph panel.',
            key_findings: ['This is a generated mock note.'],
            methodology: 'Synthetic note generation via MSW.',
            limitations: ['Mock data'],
        }

        paperNotesStore.set(paperId, note)

        return HttpResponse.json({
            paper_id: paperId,
            note,
        })
    }),

    // GET /api/papermind/watch
    http.get('/api/papermind/watch', ({ request }) => {
        const url = new URL(request.url)
        const notebookId = url.searchParams.get('notebook_id')
        const rows = notebookId
            ? watchedFolders.filter((folder) => folder.notebook_id === notebookId)
            : watchedFolders
        return HttpResponse.json(rows)
    }),

    // POST /api/papermind/watch
    http.post('/api/papermind/watch', async ({ request }) => {
        const body = await request.json() as { path?: string; notebook_id?: string; recursive?: boolean }
        if (!body.path || !body.notebook_id) {
            return new HttpResponse(null, { status: 400 })
        }

        const row: WatchedFolder = {
            id: `watch-${Date.now()}`,
            path: body.path,
            notebook_id: body.notebook_id,
            recursive: Boolean(body.recursive),
            active: true,
            paper_count: 0,
            created_at: now(),
        }
        watchedFolders = [row, ...watchedFolders]
        return HttpResponse.json(row)
    }),

    // DELETE /api/papermind/watch/:id
    http.delete('/api/papermind/watch/:id', ({ params }) => {
        const folderId = String(params.id || '')
        watchedFolders = watchedFolders.filter((row) => row.id !== folderId)
        return HttpResponse.json({ success: true })
    }),

    // POST /api/papermind/watch/:id/scan
    http.post('/api/papermind/watch/:id/scan', ({ params }) => {
        const folderId = String(params.id || '')
        watchedFolders = watchedFolders.map((row) =>
            row.id === folderId
                ? { ...row, paper_count: row.paper_count + 1 }
                : row
        )
        return HttpResponse.json({
            status: 'ok',
            id: folderId,
        })
    }),
]