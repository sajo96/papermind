"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, X, ExternalLink, Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GraphNode } from "./types";

export default function PaperPanel({
    notebookId,
    paperNode,
    onClose,
    onConceptClick,
}: {
    notebookId: string;
    paperNode: GraphNode;
    onClose: () => void;
    onConceptClick: (cId: string) => void;
}) {
    const isPlaceholderText = (value: string | undefined | null) => {
        const raw = String(value || "").trim().toLowerCase();
        if (!raw) return true;
        return (
            raw.includes("methodology details unavailable") ||
            raw.includes("limitations not explicitly stated") ||
            raw === "n/a" ||
            raw === "none"
        );
    };

    const normalizeNotePayload = (payload: any) => {
        const note = payload?.note ? payload.note : payload;
        const methodology = !isPlaceholderText(note?.methodology) ? String(note?.methodology || "").trim() : "";

        const limitationsRaw = Array.isArray(note?.limitations) ? note.limitations : [];
        const limitations = limitationsRaw
            .map((item: unknown) => String(item || "").trim())
            .filter((item: string) => !isPlaceholderText(item));

        return {
            ...note,
            methodology,
            limitations,
        };
    };

    // Fetch detailed generated AI note for this paper using our API endpoint
    const internalPaperId = paperNode.id;

    const fetchPaperNote = async () => {
        // Check if the paper's source is still being processed — don't
        // trigger a second generation while the pipeline is running.
        try {
            const statusRes = await fetch(
                `/api/sources?notebook_id=${encodeURIComponent(notebookId)}`
            );
            if (statusRes.ok) {
                const sources = await statusRes.json();
                const paperSource = (Array.isArray(sources)
                    ? sources.find(
                        (s: Record<string, unknown>) =>
                            s.title === paperNode.label ||
                            s.id === paperNode.id
                    )
                    : null) as Record<string, unknown> | null;
                if (
                    paperSource &&
                    (paperSource.status === "running" ||
                        paperSource.status === "new" ||
                        paperSource.status === "queued")
                ) {
                    return null;
                }
            }
        } catch {
            // Ignore — fall through to normal fetch
        }

        const res = await fetch(`/api/papermind/note/${encodeURIComponent(internalPaperId)}`);
        if (res.status === 404) {
            const generateRes = await fetch('/api/papermind/generate_note', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paper_id: internalPaperId, regenerate: false }),
            });
            if (!generateRes.ok) return null;
            const generatedPayload = await generateRes.json();
            return normalizeNotePayload(generatedPayload);
        }
        if (!res.ok) throw new Error("Failed to block note");
        const payload = await res.json();
        return normalizeNotePayload(payload);
    };

    const { data: aiNote, isLoading, error } = useQuery({
        queryKey: ["paperNote", internalPaperId],
        queryFn: fetchPaperNote,
    });

    return (
        <div className="h-full w-full min-h-0 flex flex-col bg-background/95 backdrop-blur-md">
            {/* Header */}
            <div className="flex-none p-4 pb-2 border-b flex justify-between items-start gap-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight leading-tight line-clamp-2">
                        {paperNode.label}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 gap-2 flex items-center">
                        {paperNode.year && <span>{paperNode.year}</span>}
                        {paperNode.authors && <span>•</span>}
                        {paperNode.authors && <span className="line-clamp-1">{paperNode.authors.join(", ")}</span>}
                    </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                    <div className="p-4 px-6 pt-6 flex flex-col gap-6">
                        {paperNode.doi && (
                            <a
                                href={`https://doi.org/${paperNode.doi}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                            >
                                <ExternalLink className="h-3 w-3" /> doi.org/{paperNode.doi}
                            </a>
                        )}

                        {/* Fallback tags from graph concepts (while loading AI note or if no AI note) */}
                        {paperNode.concepts && (
                            <div className="flex flex-wrap gap-2">
                                {paperNode.concepts.map((c) => (
                                    <Badge
                                        key={c}
                                        variant="secondary"
                                        className="cursor-pointer hover:bg-muted"
                                        onClick={() => onConceptClick(c)}
                                    >
                                        {c.replace("concept:", "").replace("_", " ")}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
                                <Loader2 className="animate-spin" />
                                <span className="text-sm">Loading generated AI note...</span>
                            </div>
                        ) : error ? (
                            <div className="text-destructive text-sm p-4 border border-destructive/20 rounded bg-destructive/10">
                                Note generation failed: {String(error)}
                            </div>
                        ) : aiNote ? (
                            <div className="flex flex-col gap-6 text-sm">
                                <div className="bg-muted/40 p-4 rounded-xl text-primary/90 font-medium italic border leading-relaxed">
                                    "{aiNote.one_line_summary}"
                                </div>

                                <div>
                                    <h4 className="font-semibold text-foreground border-b pb-1 mb-3">Key Findings</h4>
                                    <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground marker:text-muted-foreground/60">
                                        {aiNote.key_findings?.map((f: string, i: number) => (
                                            <li key={i}>{f}</li>
                                        ))}
                                    </ul>
                                </div>

                                {aiNote.methodology && (
                                    <div>
                                        <h4 className="font-semibold text-foreground border-b pb-1 mb-3">Methodology</h4>
                                        <p className="text-muted-foreground leading-relaxed">{aiNote.methodology}</p>
                                    </div>
                                )}

                                {aiNote.limitations && aiNote.limitations.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-foreground border-b pb-1 mb-3">Limitations</h4>
                                        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground marker:text-muted-foreground/60">
                                            {aiNote.limitations.map((l: string, i: number) => (
                                                <li key={i}>{l}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-muted-foreground text-sm p-4 italic">
                                No AI Note generated yet. Try rebuilding the graph or triggering /api/papermind/generate_note.
                            </div>
                        )}

                        <div className="pb-8"></div>
                    </div>
                </ScrollArea>
            </div>

            {/* Footer controls */}
            <div className="flex-none p-4 mt-auto border-t bg-muted/20">
                <Link
                    href={`/notebooks/${encodeURIComponent(notebookId)}`}
                    className="flex w-full"
                >
                    <Button className="w-full gap-2" variant="outline">
                        <Link2 className="h-4 w-4" /> Open Full Note
                    </Button>
                </Link>
            </div>
        </div>
    );
}