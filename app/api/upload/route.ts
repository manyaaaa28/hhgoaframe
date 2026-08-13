import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { encodeCardId } from "@/lib/cardId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    // Optional landscape composite for the link preview; see lib/ogComposite.
    const ogFile = form.get("og") as File | null;

    const slug = nanoid(10);
    /* Follow whatever the client sent rather than forcing PNG — it uploads
       JPEGs to stay inside Vercel's 4.5MB server-upload limit, and a JPEG
       served as image/png fails to render in a link preview. */
    const upload = async (name: string, source: File) => {
      const type = source.type === "image/jpeg" ? "image/jpeg" : "image/png";
      const ext = type === "image/jpeg" ? "jpg" : "png";
      return put(`cards/${name}.${ext}`, Buffer.from(await source.arrayBuffer()), {
        access: "public",
        contentType: type,
      });
    };

    const blob = await upload(slug, file);
    const ogBlob = ogFile ? await upload(`${slug}-og`, ogFile) : null;

    const origin = req.nextUrl.origin;
    const cardId = encodeCardId(blob.url, ogBlob?.url);
    const cardUrl = `${origin}/card/${cardId}`;

    return NextResponse.json({ cardUrl, imageUrl: blob.url, ogUrl: ogBlob?.url ?? blob.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upload failed. Make sure BLOB_READ_WRITE_TOKEN is set on Vercel." },
      { status: 500 }
    );
  }
}
