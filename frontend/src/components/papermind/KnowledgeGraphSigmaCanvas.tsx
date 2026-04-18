"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { GraphData, GraphNode } from "./types";
import { CANVAS_THEMES, DEFAULT_THEME, edgeColor, nodeColor, type CanvasTheme } from "./sigma/themes";

type Props = {
    graphData?: GraphData;
    onPaperClick: (node: GraphNode) => void;
};

const KIND_INDEX: Record<string, number> = {
    paper: 0,
    concept: 1,
    atom: 2,
    author: 3,
    concept_similarity: 0,
    cites: 1,
    similar_to: 2,
    tagged_with: 3,
};

function sizeBoostForOrder(order: number): number {
    if (order <= 12) return 2.8;
    if (order <= 24) return 2.4;
    if (order <= 50) return 1.9;
    if (order <= 120) return 1.45;
    return 1.0;
}

function normalizeWeight(raw: number, min: number, max: number): number {
    if (!Number.isFinite(raw)) return 0.5;
    const range = Math.max(0.0001, max - min);
    return Math.max(0, Math.min(1, (raw - min) / range));
}

type EndpointRef = string | { id?: string } | null | undefined;

function endpointId(endpoint: EndpointRef): string {
    if (typeof endpoint === "string") return endpoint;
    if (endpoint && typeof endpoint === "object" && typeof endpoint.id === "string") {
        return endpoint.id;
    }
    return "";
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

export default function KnowledgeGraphSigmaCanvas({ graphData, onPaperClick }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<Sigma | null>(null);
    const stopLoopRef = useRef<(() => void) | null>(null);
    const [theme, setTheme] = useState<CanvasTheme>(DEFAULT_THEME);
    const themeRef = useRef<CanvasTheme>(DEFAULT_THEME);
    themeRef.current = theme;

    const nodeById = useMemo(() => {
        const map = new Map<string, GraphNode>();
        (graphData?.nodes || []).forEach((n) => map.set(n.id, n));
        return map;
    }, [graphData]);

    useEffect(() => {
        if (!containerRef.current || !graphData) return;

        const graph = new Graph();
        const edgeDegree = new Map<string, number>();
        let minRawEdgeWeight = Number.POSITIVE_INFINITY;
        let maxRawEdgeWeight = Number.NEGATIVE_INFINITY;

        for (const e of graphData.links) {
            const sourceId = endpointId(e.source as EndpointRef);
            const targetId = endpointId(e.target as EndpointRef);
            if (!sourceId || !targetId) continue;
            edgeDegree.set(sourceId, (edgeDegree.get(sourceId) || 0) + 1);
            edgeDegree.set(targetId, (edgeDegree.get(targetId) || 0) + 1);
            if (Number.isFinite(e.weight)) {
                minRawEdgeWeight = Math.min(minRawEdgeWeight, e.weight);
                maxRawEdgeWeight = Math.max(maxRawEdgeWeight, e.weight);
            }
        }
        if (!Number.isFinite(minRawEdgeWeight)) minRawEdgeWeight = 0;
        if (!Number.isFinite(maxRawEdgeWeight)) maxRawEdgeWeight = 1;
        const maxDegree = Math.max(1, ...edgeDegree.values(), 1);
        const nodeSizeBoost = sizeBoostForOrder(graphData.nodes.length);

        for (const node of graphData.nodes) {
            const x = typeof node.x === "number" ? node.x : (Math.random() - 0.5) * 1000;
            const y = typeof node.y === "number" ? node.y : (Math.random() - 0.5) * 1000;
            const connectivity = (edgeDegree.get(node.id) || 0) / maxDegree;
            const groupIndex = KIND_INDEX[node.type] ?? 0;
            graph.addNode(node.id, {
                label: node.label,
                x,
                y,
                size:
                    node.type === "paper"
                        ? Math.max(2.5, (2.4 + connectivity * 4.2) * nodeSizeBoost)
                        : Math.max(1.8, (1.6 + connectivity * 1.8) * Math.max(1.05, nodeSizeBoost * 0.9)),
                color: nodeColor(themeRef.current, connectivity, groupIndex),
                kind: node.type,
                connectivity,
                groupIndex,
                fullLabel: node.label,
            });
        }

        graphData.links.forEach((edge, idx) => {
            const sourceId = endpointId(edge.source as EndpointRef);
            const targetId = endpointId(edge.target as EndpointRef);
            if (!sourceId || !targetId) return;
            if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) return;

            const key = `${edge.type}:${sourceId}:${targetId}:${idx}`;
            if (graph.hasEdge(key)) return;

            const w = normalizeWeight(edge.weight || 0, minRawEdgeWeight, maxRawEdgeWeight);
            const groupIndex = KIND_INDEX[edge.type] ?? 0;

            graph.addEdgeWithKey(key, sourceId, targetId, {
                size: 0.35 + w * 1.15,
                color: edgeColor(themeRef.current, w),
                label: edge.label,
                kind: edge.type,
                weightNorm: w,
                groupIndex,
            });
        });

        // Warm-up so first frame is already clustered.
        if (graph.order > 2 && graph.size > 0) {
            try {
                forceAtlas2.assign(graph, {
                    iterations: 80,
                    settings: {
                        gravity: 0.28,
                        scalingRatio: 10,
                        strongGravityMode: false,
                        slowDown: 1.9,
                        barnesHutOptimize: graph.order > 500,
                    },
                });
            } catch {
                // Keep fallback random coordinates if FA2 fails for any reason.
            }
        }

        const renderer = new Sigma(graph, containerRef.current, {
            renderEdgeLabels: false,
            labelRenderedSizeThreshold: 16,
            defaultNodeType: "circle",
            defaultEdgeType: "line",
            defaultDrawNodeHover: (ctx, data, settings) => {
                const label =
                    asString((data as { fullLabel?: unknown }).fullLabel) ||
                    asString(data.label) ||
                    "";
                if (!label) return;
                const fontSize = 12;
                const font = asString((settings as { labelFont?: unknown }).labelFont) || "sans-serif";
                ctx.font = `${fontSize}px ${font}`;
                const textWidth = ctx.measureText(label).width;
                const padding = 6;
                const x = data.x + (data.size || 4) + 5;
                const y = data.y - (fontSize + padding * 2) / 2;

                ctx.fillStyle = "rgba(20,20,20,0.88)";
                ctx.beginPath();
                ctx.roundRect(x, y, textWidth + padding * 2, fontSize + padding * 2, 4);
                ctx.fill();
                ctx.fillStyle = themeRef.current.nodeLabelColor;
                ctx.textBaseline = "middle";
                ctx.fillText(label, x + padding, data.y);
            },
        });

        const applyThemeToGraph = () => {
            const t = themeRef.current;
            graph.forEachNode((id, attrs) => {
                const connectivity = typeof attrs.connectivity === "number" ? attrs.connectivity : 0;
                const groupIndex = typeof attrs.groupIndex === "number" ? attrs.groupIndex : 0;
                graph.setNodeAttribute(
                    id,
                    "color",
                    nodeColor(t, connectivity, groupIndex)
                );
            });
            graph.forEachEdge((id, attrs) => {
                const weightNorm = typeof attrs.weightNorm === "number" ? attrs.weightNorm : 0.5;
                graph.setEdgeAttribute(id, "color", edgeColor(t, weightNorm));
            });
        };
        applyThemeToGraph();

        // Guaranteed continuous simulation loop.
        if (graph.order > 2 && graph.size > 0) {
            const simSettings = {
                ...forceAtlas2.inferSettings(graph),
                gravity: 0.34,
                scalingRatio: 10,
                slowDown: 2.1,
                barnesHutOptimize: graph.order > 500,
            };
            let active = true;
            let raf = 0;
            let last = 0;
            const frameGap = graph.order > 1000 ? 52 : 34;

            const tick = (ts: number) => {
                if (!active) return;
                if (ts - last >= frameGap) {
                    last = ts;
                    try {
                        forceAtlas2.assign(graph, {
                            iterations: 1,
                            settings: simSettings,
                        });
                        applyThemeToGraph();
                        renderer.refresh();
                    } catch {
                        // If a tick fails, keep the last valid frame.
                    }
                }
                raf = window.requestAnimationFrame(tick);
            };

            raf = window.requestAnimationFrame(tick);
            stopLoopRef.current = () => {
                active = false;
                window.cancelAnimationFrame(raf);
            };
        }

        renderer.on("clickNode", ({ node }: { node: string }) => {
            const graphNode = nodeById.get(String(node));
            if (graphNode?.type === "paper") {
                onPaperClick(graphNode);
            }
        });

        rendererRef.current = renderer;

        return () => {
            if (stopLoopRef.current) {
                stopLoopRef.current();
                stopLoopRef.current = null;
            }
            renderer.kill();
            rendererRef.current = null;
        };
    }, [graphData, nodeById, onPaperClick, theme]);

    return (
        <div className="relative h-full w-full" style={{ background: theme.background }}>
            <div ref={containerRef} className="h-full w-full" />
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 p-2 backdrop-blur-sm">
                {CANVAS_THEMES.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        title={t.name}
                        aria-label={`Use ${t.name} theme`}
                        onClick={() => setTheme(t)}
                        className="h-3.5 w-3.5 rounded-full border"
                        style={{
                            background: `linear-gradient(135deg, ${nodeColor(t, 0.2, 0)} 0%, ${nodeColor(t, 0.95, 2)} 100%)`,
                            borderColor: theme.id === t.id ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.25)",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
