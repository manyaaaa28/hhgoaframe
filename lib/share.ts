import { buildOgComposite } from "./ogComposite";

/** A File is cheap to build and canShare only inspects its type, so this tells
 *  us synchronously — inside the click handler — which branch we'll take. */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  /* Desktop Chrome, Brave and Edge expose navigator.share too, but it opens the
     OS share sheet — AirDrop, Messages, Notes — and X isn't in it, so a button
     that says "Share to X" ends up never opening X. Only phones and tablets get
     the sheet, where the X app is in it and takes the image straight into a
     post; everything else goes to the composer, which is what a desktop user
     is asking for. */
  const touchFirst =
    window.matchMedia?.("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  if (!touchFirst) return false;
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    return !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

export type ShareResult = {
  /** What to tell the user, if anything. */
  note: string | null;
  /** X's composer, when we opened it. Shown as a link too, because a blocked
   *  popup is silent — the user just sees nothing happen. */
  composerUrl?: string;
};

/**
 * Share the generated PNG to X.
 *
 * Phones get the native share sheet, which attaches the real image to the post.
 * Everything else opens X's composer with the caption filled in, and carries
 * the image over either as an og:image on a card page (when a blob store is
 * configured) or on the clipboard, one paste away.
 *
 * Must be called directly from a click handler: the composer window is opened
 * synchronously up front, because a `window.open` after the upload `await` is
 * outside the user gesture and every desktop browser blocks it.
 */
export async function shareToX({
  dataUrl,
  filename,
  caption,
}: {
  dataUrl: string;
  filename: string;
  /** Given the link to put in the post, returns the finished post text. The
   *  link is the card page when one was uploaded — it shows the graphic and
   *  carries the "make your own" button — and the site itself otherwise. */
  caption: (link: string) => string;
}): Promise<ShareResult> {
  if (!dataUrl) return { note: "Nothing to share yet — add a photo first." };

  const native = canShareFiles();
  const popup = native ? null : window.open("about:blank", "_blank");

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });

    if (native) {
      try {
        await navigator.share({ files: [file], text: caption(location.origin) });
        return { note: null };
      } catch (err) {
        // A cancelled share sheet is a decision, not a failure — don't then go
        // upload the image and open a post the user just backed out of.
        if ((err as Error)?.name === "AbortError") return { note: null };
      }
    }

    /* Vercel caps a server upload at 4.5MB for the whole request, and the PNG
       alone is ~3MB before the composite is added — a busier photo would 413.
       Both copies go up as JPEG: they are only ever seen inside a link preview
       or a card page, and the download keeps the full-quality PNG. */
    const form = new FormData();
    const jpeg = await toJpeg(dataUrl);
    form.append("file", new File([jpeg ?? blob], jpeg ? "card.jpg" : filename, {
      type: jpeg ? "image/jpeg" : "image/png",
    }));
    // X crops link previews to ~1.91:1; without this the card loses its edges.
    const og = await buildOgComposite(dataUrl);
    if (og) form.append("og", new File([og], "og.jpg", { type: "image/jpeg" }));

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.cardUrl) {
      // The link is already in the text, so no separate url param — X would
      // render it twice.
      const tweet = intent(caption(data.cardUrl));
      return { note: open(popup, tweet), composerUrl: tweet };
    }

    /* No blob store configured (or the upload failed). Rather than dead-ending,
       put the image on the clipboard so attaching it is one paste, and open the
       composer with the caption already in it. A working share beats an error
       message. Downloading is the backstop for browsers that won't take an
       image on the clipboard (Firefox before 127, Safari after an await). */
    const copied = await copyImage(blob);
    if (!copied) saveFile(dataUrl, filename);
    const tweet = intent(caption(location.origin));
    const blocked = open(popup, tweet);
    return {
      note:
        blocked ??
        (copied
          ? "Image copied — press ⌘V / Ctrl+V in the post to attach it."
          : "Image saved to your downloads — attach it to the post we just opened."),
      composerUrl: tweet,
    };
  } catch {
    popup?.close();
    return { note: "Couldn't prepare the image. Download it and attach it on X manually." };
  }
}

/** Point the window we opened up front at X, or open one now if we have none.
 *  Returns a note when the browser blocked it — Brave and Safari both do,
 *  silently, and then nothing at all appears to happen. */
function open(popup: Window | null, url: string): string | null {
  if (popup && !popup.closed) {
    popup.location.href = url;
    return null;
  }
  if (window.open(url, "_blank")) return null;
  return "Your browser blocked the pop-up — use the link below to open X.";
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

/** A JPEG copy of the graphic, capped at 1600px wide — small enough to upload,
 *  large enough for the card page. Null if the browser can't produce one. */
async function toJpeg(dataUrl: string, maxW = 1600): Promise<Blob | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxW / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  } catch {
    return null;
  }
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
