type RGB = [number, number, number];

export interface CanvasTheme {
    id: string;
    name: string;
    background: string;
    nodeMin: RGB;
    nodeMax: RGB;
    palette: RGB[];
    edgeMin: RGB;
    edgeMax: RGB;
    nodeLabelColor: string;
}

function lerp(a: RGB, b: RGB, t: number): string {
    const clamped = Math.max(0, Math.min(1, t));
    const r = Math.round(a[0] + (b[0] - a[0]) * clamped);
    const g = Math.round(a[1] + (b[1] - a[1]) * clamped);
    const bl = Math.round(a[2] + (b[2] - a[2]) * clamped);
    return `rgb(${r},${g},${bl})`;
}

function modulate(base: RGB, connectivity: number): string {
    const factor = 0.62 + Math.max(0, Math.min(1, connectivity)) * 0.38;
    return `rgb(${Math.round(base[0] * factor)},${Math.round(base[1] * factor)},${Math.round(base[2] * factor)})`;
}

export function nodeColor(theme: CanvasTheme, connectivity: number, groupIndex?: number): string {
    if (groupIndex !== undefined && theme.palette.length > 0) {
        return modulate(theme.palette[groupIndex % theme.palette.length], connectivity);
    }
    return lerp(theme.nodeMin, theme.nodeMax, connectivity);
}

export function edgeColor(theme: CanvasTheme, weight: number): string {
    return lerp(theme.edgeMin, theme.edgeMax, weight);
}

export const CANVAS_THEMES: CanvasTheme[] = [
    {
        id: "steel-violet",
        name: "Steel Violet",
        background: "#1a1a1a",
        nodeMin: [100, 115, 175],
        nodeMax: [130, 50, 230],
        palette: [
            [140, 80, 220],
            [80, 140, 210],
            [180, 70, 160],
            [90, 170, 180],
            [200, 100, 120],
            [110, 120, 200],
        ],
        edgeMin: [30, 30, 45],
        edgeMax: [80, 65, 160],
        nodeLabelColor: "#8899b0",
    },
    {
        id: "midnight",
        name: "Midnight",
        background: "#12141c",
        nodeMin: [70, 90, 150],
        nodeMax: [100, 140, 255],
        palette: [
            [90, 130, 240],
            [60, 180, 190],
            [150, 90, 220],
            [80, 190, 140],
            [180, 80, 160],
            [100, 160, 210],
        ],
        edgeMin: [25, 28, 50],
        edgeMax: [55, 80, 170],
        nodeLabelColor: "#7088b0",
    },
    {
        id: "aurora",
        name: "Aurora",
        background: "#141a1a",
        nodeMin: [60, 160, 140],
        nodeMax: [140, 60, 220],
        palette: [
            [60, 190, 160],
            [140, 80, 210],
            [80, 160, 220],
            [200, 90, 140],
            [100, 200, 100],
            [180, 140, 60],
        ],
        edgeMin: [25, 40, 38],
        edgeMax: [70, 100, 150],
        nodeLabelColor: "#88b0a8",
    },
];

export const DEFAULT_THEME = CANVAS_THEMES[0];
