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

/* The frame artwork was cropped to its own edges (it used to sit inside 2048x1152
   with ~650px of transparent padding, which exported as dead margin and shrank
   the board on screen). Everything below is normalized against the cropped
   1400x1008 art, so the board now fills the frame edge to edge. */
export const HH_FRAME_W = 1400;
export const HH_FRAME_H = 1008;

/* One photo, one frame — the real HH Goa artwork. The old "classic" plain-green
   frames were generic badges with a logo on them, which is exactly what this
   tool is not for, and the 2/3-person variants went with the squad picker. */
export const LAYOUTS: LayoutTemplate[] = [
  // Solo: 1 slot, pixel-aligned inside the frame's central white rounded window.
  {
    id: "hacker-house-exact",
    label: "Hacker गोव House",
    teamSize: 1,
    frameTheme: "hacker-house",
    canvasWidth: HH_FRAME_W,
    canvasHeight: HH_FRAME_H,
    slots: [{ x: 0.2310, y: 0.2200, w: 0.5427, h: 0.5280, shape: "rect" }],
  },
];

export const CANVAS_SIZE = 1080;

export function layoutsForSize(n: 1 | 2 | 3) {
  return LAYOUTS.filter((l) => l.teamSize === n);
}
