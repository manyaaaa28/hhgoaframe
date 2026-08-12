/**
 * A card id is just the blob URL(s) encoded, so no database is needed.
 * Newer cards carry two URLs — the full portrait image the page displays, and a
 * landscape composite used as the og:image — joined by "|". Older single-URL
 * ids keep working and use the same URL for both.
 */

export function encodeCardId(url: string, ogUrl?: string): string {
  const payload = ogUrl ? `${url}|${ogUrl}` : url;
  return Buffer.from(payload, "utf-8").toString("base64url");
}

export type DecodedCard = { imageUrl: string; ogUrl: string };

export function decodeCard(id: string): DecodedCard | null {
  try {
    const raw = Buffer.from(id, "base64url").toString("utf-8");
    if (!raw) return null;
    const [imageUrl, ogUrl] = raw.split("|");
    if (!imageUrl) return null;
    return { imageUrl, ogUrl: ogUrl || imageUrl };
  } catch {
    return null;
  }
}

export function decodeCardId(id: string): string | null {
  return decodeCard(id)?.imageUrl ?? null;
}
