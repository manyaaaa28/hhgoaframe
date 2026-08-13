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

    if (res.ok && data.cardUrl) {
      const tweet = intent(caption, data.cardUrl);
      if (popup && !popup.closed) popup.location.href = tweet;
      else window.open(tweet, "_blank");
      return null;
    }

    /* No blob store configured (or the upload failed). Rather than dead-ending,
       put the image on the clipboard so attaching it is one paste, and open the
       composer with the caption already in it. A working share beats an error
       message. Downloading is the backstop for browsers that won't take an
       image on the clipboard (Firefox before 127, Safari after an await). */
    const copied = await copyImage(blob);
    if (!copied) saveFile(dataUrl, filename);
    const tweet = intent(caption);
    if (popup && !popup.closed) popup.location.href = tweet;
    else window.open(tweet, "_blank");
    return copied
      ? "Image copied — press ⌘V / Ctrl+V in the post to attach it."
      : "Image saved to your downloads — attach it to the post we just opened.";
  } catch {
    popup?.close();
    return "Couldn't prepare the image. Download it and attach it on X manually.";
  }
}

/* The composer of whoever is signed in on that device — so everyone posts from
   their own account, we never touch it. x.com/intent/post is the current
   canonical form: twitter.com/intent/tweet still works but redirects, and the
   extra hop is where mobile browsers sometimes drop the prefilled text. */
function intent(caption: string, url?: string) {
  const q = new URLSearchParams({ text: caption });
  if (url) q.set("url", url);
  return `https://x.com/intent/post?${q.toString()}`;
}

/** True if the PNG is now on the clipboard, ready to paste into the composer. */
async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    // The intent window we just opened may hold focus, and a clipboard write
    // from an unfocused document throws. Ask for it back first.
    window.focus();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

function saveFile(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
