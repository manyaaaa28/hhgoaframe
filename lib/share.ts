import { buildOgComposite } from "./ogComposite";

/** A File is cheap to build and canShare only inspects its type, so this tells
 *  us synchronously — inside the click handler — which branch we'll take. */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    return !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Share the generated PNG to X.
 *
 * Phones get the native share sheet, which attaches the real image to the
 * tweet. Everything else uploads the image and opens an intent link whose card
 * page carries the graphic as its og:image.
 *
 * Must be called directly from a click handler: the intent window is opened
 * synchronously up front, because a `window.open` after the upload `await` is
 * outside the user gesture and every desktop browser blocks it.
 *
 * @returns null on success, or a message to show the user.
 */
export async function shareToX({
  dataUrl,
  filename,
  caption,
}: {
  dataUrl: string;
  filename: string;
  caption: string;
}): Promise<string | null> {
  if (!dataUrl) return "Nothing to share yet — add a photo first.";

  const native = canShareFiles();
  const popup = native ? null : window.open("about:blank", "_blank");

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });

    if (native) {
      try {
        await navigator.share({ files: [file], text: caption });
        return null;
      } catch (err) {
        // A cancelled share sheet is a decision, not a failure — don't then go
        // upload the image and open a tweet the user just backed out of.
        if ((err as Error)?.name === "AbortError") return null;
      }
    }

    const form = new FormData();
    form.append("file", file);
    // X crops link previews to ~1.91:1; without this the card loses its edges.
    const og = await buildOgComposite(dataUrl);
    if (og) form.append("og", new File([og], "og.png", { type: "image/png" }));

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.cardUrl) throw new Error(data.error || "upload failed");

    const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      caption
    )}&url=${encodeURIComponent(data.cardUrl)}`;

    if (popup && !popup.closed) popup.location.href = tweet;
    else window.open(tweet, "_blank");
    return null;
  } catch {
    popup?.close();
    return "Couldn't reach the server — download the image and attach it on X manually.";
  }
}
