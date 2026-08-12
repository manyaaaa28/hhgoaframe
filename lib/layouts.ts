export type Slot = {
  x: number; // normalized 0-1
  y: number;
  w: number;
  h: number;
  shape: "rect" | "notch"; // notch = angled corner cut, for visual variety
};

export type FrameTheme = "classic" | "hacker-house";

export type LayoutTemplate = {
  id: string;
  label: string;
  teamSize: 1 | 2 | 3;
  slots: Slot[];
  frameTheme?: FrameTheme;
  canvasWidth?: number;
  canvasHeight?: number;
};

export const LAYOUTS: LayoutTemplate[] = [
  // --- HACKER HOUSE EXACT FRAME: SOLO (1-slot, pixel-aligned inside central white rounded frame) ---
  {
    id: "hacker-house-exact",
    label: "Hacker गोव House",
    teamSize: 1,
    frameTheme: "hacker-house",
    canvasWidth: 2048,
    canvasHeight: 1152,
    slots: [
      { x: 0.322, y: 0.255, w: 0.371, h: 0.462, shape: "rect" },
    ],
  },
  // --- HACKER HOUSE EXACT FRAME: DUO (2 vertical columns inside central frame) ---
  {
    id: "hacker-house-exact-2p",
    label: "Hacker गोव House",
    teamSize: 2,
    frameTheme: "hacker-house",
    canvasWidth: 2048,
    canvasHeight: 1152,
    slots: [
      { x: 0.322, y: 0.255, w: 0.179, h: 0.462, shape: "rect" },
      { x: 0.514, y: 0.255, w: 0.179, h: 0.462, shape: "rect" },
    ],
  },
  // --- HACKER HOUSE EXACT FRAME: TRIO (1 wide top + 2 narrow bottom) ---
  {
    id: "hacker-house-exact-3p",
    label: "Hacker गोव House",
    teamSize: 3,
    frameTheme: "hacker-house",
    canvasWidth: 2048,
    canvasHeight: 1152,
    slots: [
      { x: 0.322, y: 0.255, w: 0.371, h: 0.210, shape: "rect" },
      { x: 0.322, y: 0.477, w: 0.179, h: 0.238, shape: "rect" },
      { x: 0.514, y: 0.477, w: 0.179, h: 0.238, shape: "rect" },
    ],
  },

  // --- DUO ---
  {
    id: "duo-side",
    label: "Side by Side",
    teamSize: 2,
    slots: [
      { x: 0.07, y: 0.11, w: 0.4, h: 0.66, shape: "rect" },
      { x: 0.53, y: 0.11, w: 0.4, h: 0.66, shape: "rect" },
    ],
  },
  {
    id: "duo-stack",
    label: "Stacked",
    teamSize: 2,
    slots: [
      { x: 0.09, y: 0.09, w: 0.82, h: 0.335, shape: "notch" },
      { x: 0.09, y: 0.445, w: 0.82, h: 0.335, shape: "notch" },
    ],
  },

  // --- TRIO ---
  {
    id: "trio-grid",
    label: "Trio Grid",
    teamSize: 3,
    slots: [
      { x: 0.09, y: 0.09, w: 0.82, h: 0.42, shape: "rect" },
      { x: 0.09, y: 0.535, w: 0.385, h: 0.235, shape: "rect" },
      { x: 0.505, y: 0.535, w: 0.385, h: 0.235, shape: "rect" },
    ],
  },
  {
    id: "trio-offset",
    label: "Offset Stack",
    teamSize: 3,
    slots: [
      { x: 0.26, y: 0.075, w: 0.48, h: 0.3, shape: "notch" },
      { x: 0.07, y: 0.42, w: 0.4, h: 0.35, shape: "rect" },
      { x: 0.53, y: 0.42, w: 0.4, h: 0.35, shape: "rect" },
    ],
  },
];

export const CANVAS_SIZE = 1080;

export function layoutsForSize(n: 1 | 2 | 3) {
  return LAYOUTS.filter((l) => l.teamSize === n);
}
