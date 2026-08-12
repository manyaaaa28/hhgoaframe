/**
 * X renders `summary_large_image` link previews at roughly 1.91:1, so a card
 * posted at any other ratio gets centre-cropped — for the ID card that means
 * losing the name strip and the top of the frame. This builds a 1200x630
 * composite holding the whole card on the brand green, used only as the
 * og:image; the downloaded file and the card page keep the full-size original.
 */

const OG_W = 1200;
const OG_H = 630;

const GREEN = "#0b5c39";
const YELLOW = "#f4d913";

export async function buildOgComposite(cardDataUrl: string): Promise<Blob | null> {
  const card = new Image();
  card.src = cardDataUrl;
  try {
    await card.decode();
  } catch {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = OG_W;
  canvas.height = OG_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, OG_W, OG_H);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(0, 0, OG_W, 10);
  ctx.fillRect(0, OG_H - 10, OG_W, 10);

  // Contain-fit so the whole card survives, whatever its aspect ratio.
  const pad = 22;
  const fit = Math.min((OG_W - pad * 2) / card.width, (OG_H - pad * 2) / card.height);
  const cardW = card.width * fit;
  const cardH = card.height * fit;
  const cardX = (OG_W - cardW) / 2;
  const cardY = (OG_H - cardH) / 2;
  ctx.drawImage(card, cardX, cardY, cardW, cardH);
  // Nothing is set in the side gutters — the card art already carries the
  // wordmark and #FrameInGoa, and gutter copy clips at this card width.

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
