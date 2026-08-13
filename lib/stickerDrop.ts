/**
 * Where a tapped sticker lands.
 *
 * Every tap used to drop on the exact same pixel, so stickers stacked into one
 * pile: clicking the one you wanted selected whichever was added last, because
 * the newer sticker is drawn on top and wins the hit test. A small diagonal
 * nudge wasn't enough either — stickers are ~14% of the canvas wide, so any
 * step shorter than half that still buries the previous one's centre.
 *
 * So taps fan around the drop point on a hexagonal ring. The radius has to clear
 * more than half a sticker: the selected sticker's resize handles reach further
 * still, and on touch Konva pads each anchor's hit area by another 10px, so a
 * ring that only cleared the artwork left neighbours untappable on a phone.
 *
 * The ring is a circle, not an ellipse — a flattened one puts the vertical
 * neighbours much closer than the horizontal ones, and those were exactly the
 * two that stayed unselectable. On a hexagon, adjacent centres sit one radius
 * apart, so the radius alone decides the clearance.
 *
 * One ring only holds six though. Keying the slot off the sticker count meant
 * the 7th tap wrapped back onto the 1st's exact pixel — pile rebuilt, and the
 * buried sticker unselectable again — and deleting one shifted the count so the
 * next tap reused a slot that was still occupied. So the search now walks
 * outward through as many rings as it needs and skips any slot that is already
 * taken, which also makes it correct after deletions and reorders.
 */
export const STICKER_SIZE_RATIO = 0.14;

type Point = { x: number; y: number };

export function cascadeDrop(
  existing: Point[],
  cx: number,
  cy: number,
  canvasWidth: number,
  canvasHeight: number
): Point {
  const ringStep = canvasWidth * 0.17;
  /* Anything closer than this counts as the same spot. Slightly under one ring
     step so neighbours on the same ring don't reject each other. */
  const minGap = ringStep * 0.9;
  /* Keep the whole sticker on the canvas — outer rings would otherwise push
     stickers past the edge where they can't be grabbed. */
  const margin = canvasWidth * STICKER_SIZE_RATIO * 0.6;
  const fit = (v: number, max: number) => Math.max(margin, Math.min(max - margin, v));

  for (let i = 0; i < 60; i++) {
    const ring = Math.floor(i / 6);
    /* Half-step each ring so the rings interleave instead of lining up spokes. */
    const angle = ((i % 6) / 6) * Math.PI * 2 + ring * (Math.PI / 6);
    const r = ringStep * (1 + ring * 0.55);
    const x = fit(cx + Math.cos(angle) * r, canvasWidth);
    const y = fit(cy + Math.sin(angle) * r, canvasHeight);
    /* Tested after clamping: two candidates pushed onto the same edge position
       would otherwise collide exactly the way the wrap-around used to. */
    if (existing.every((s) => Math.hypot(s.x - x, s.y - y) >= minGap)) return { x, y };
  }

  /* Genuinely crowded canvas: scatter near the middle rather than stack. */
  return {
    x: fit(cx + (Math.random() - 0.5) * ringStep, canvasWidth),
    y: fit(cy + (Math.random() - 0.5) * ringStep, canvasHeight),
  };
}
