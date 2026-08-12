/**
 * Where a tapped sticker lands.
 *
 * Every tap used to drop on the exact same pixel, so stickers stacked into one
 * pile: clicking the one you wanted selected whichever was added last, because
 * the newer sticker is drawn on top and wins the hit test. A small diagonal
 * nudge wasn't enough either — stickers are ~16% of the canvas wide, so any
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
 */
export const STICKER_SIZE_RATIO = 0.14;

export function cascadeDrop(index: number, cx: number, cy: number, canvasWidth: number) {
  const angle = ((index % 6) / 6) * Math.PI * 2;
  const r = canvasWidth * 0.17;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}
