"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { nanoid } from "nanoid";
import { fileToImage } from "@/lib/loadImage";
import { generateBuilderTitle, generateBuilderCode } from "@/lib/builderTitle";
import { shareToX as shareImageToX } from "@/lib/share";
import { GOA_STICKERS } from "@/lib/goaStickers";
import { cascadeDrop, STICKER_SIZE_RATIO } from "@/lib/stickerDrop";
import CameraSheet from "@/components/CameraSheet";
import CropSheet from "@/components/CropSheet";
import { CARD_W, CARD_H, DROP_X, DROP_Y, PHOTO_ASPECT } from "@/components/IdCardCanvas";
import type { IdCardHandle, IdPhoto, IdSticker } from "@/components/IdCardCanvas";

const IdCardCanvas = dynamic(() => import("@/components/IdCardCanvas"), { ssr: false });

/* The cropped frame art is 1400px wide; exporting a little above that keeps the
   uploaded photo detailed without visibly softening the line art. */
const EXPORT_WIDTH = 1600;

/** Custom MIME so a sticker drag is distinguishable from a dragged image file. */
const STICKER_DND_TYPE = "application/x-hh-sticker";


export default function BuilderIdPage() {
  const [photo, setPhoto] = useState<IdPhoto>({ image: null, offsetX: 0, offsetY: 0, zoom: 1 });
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [building, setBuilding] = useState("");
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [cropping, setCropping] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [displayWidth, setDisplayWidth] = useState(420);
  const [stickers, setStickers] = useState<IdSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [dragOverTray, setDragOverTray] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const cardRef = useRef<IdCardHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  const title = useMemo(() => generateBuilderTitle(name, role, nudge), [name, role, nudge]);
  const code = useMemo(() => generateBuilderCode(name, role), [name, role]);

  useEffect(() => {
    function onResize() {
      if (!previewRef.current) return;
      setDisplayWidth(Math.min(previewRef.current.clientWidth, 720));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Straight to the cropper: it's the only place the framing is big enough to
     see, and it removes the guesswork of nudging the photo in the card window. */
  const handleFile = useCallback(async (file: File) => {
    setLoadingPhoto(true);
    try {
      const image = await fileToImage(file);
      setOriginal(image);
      setCropping(true);
    } catch {
      alert("Couldn't read that photo. Try another one?");
    } finally {
      setLoadingPhoto(false);
    }
  }, []);

  /** Drops land under the pointer; taps fan out from the middle of the photo. */
  function addSticker(url: string, at?: { x: number; y: number }) {
    const img = new window.Image();
    img.onload = () => {
      const id = nanoid(6);
      const targetPx = CARD_W * STICKER_SIZE_RATIO;
      setStickers((prev) => {
        const spot = at ?? cascadeDrop(prev.length, DROP_X, DROP_Y, CARD_W);
        return [
          ...prev,
          {
            id,
            src: url,
            imgEl: img,
            x: spot.x,
            y: spot.y,
            scale: targetPx / Math.max(img.width, img.height, 1),
            rotation: 0,
          },
        ];
      });
      setSelectedStickerId(id);
      // On a phone the tray sits below the card, so a tap otherwise drops the
      // sticker onto a canvas that's scrolled off screen and looks like a no-op.
      stageWrapRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    img.src = url;
  }

  function addStickerFiles(files: FileList, at?: { x: number; y: number }) {
    Array.from(files).forEach((file, i) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        // Nudge each extra file so a multi-drop doesn't stack into one pile.
        if (src) addSticker(src, at && { x: at.x + i * 60, y: at.y + i * 60 });
      };
      reader.readAsDataURL(file);
    });
  }

  function dropPoint(e: React.DragEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / CARD_W;
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    return {
      x: clamp((e.clientX - rect.left) / scale, CARD_W),
      y: clamp((e.clientY - rect.top) / scale, CARD_H),
    };
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverCanvas(false);
    const at = dropPoint(e);
    const url = e.dataTransfer.getData(STICKER_DND_TYPE);
    if (url) {
      addSticker(url, at);
      return;
    }
    if (e.dataTransfer.files?.length) addStickerFiles(e.dataTransfer.files, at);
  }

  function removeSelectedSticker() {
    if (!selectedStickerId) return;
    setStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  }

  /* Delete/Backspace removes the selected sticker, as long as the user isn't
     typing in the name or stack fields. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (!selectedStickerId) return;
      e.preventDefault();
      removeSelectedSticker();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function exportCard(): string {
    return cardRef.current?.exportPNG(EXPORT_WIDTH) || "";
  }

  function download() {
    const url = exportCard();
    if (!url) return;
    const slug = (name.trim() || "builder").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `hhgoa-2026-builder-id-${slug}.png`;
    a.click();
  }

  const caption = `${name.trim() ? `${name.trim()}: ` : ""}${title}. Building at HH Goa 2026 🌴 #FrameInGoa`;

  async function shareToX() {
    setSharing(true);
    setShareNote(null);
    // Runs synchronously up to its first await, so the intent window it opens
    // still counts as user-initiated and survives the popup blocker.
    const problem = await shareImageToX({
      dataUrl: exportCard(),
      filename: "hhgoa-2026-builder-id.png",
      caption,
    });
    setShareNote(problem);
    setSharing(false);
  }

  const ready = !!photo.image;

  return (
    <main style={{ minHeight: "100dvh", padding: "20px 16px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div className="eyebrow">HH GOA · 2026</div>
        <h1 className="display" style={{ fontSize: 34, margin: "4px 0 2px", color: "var(--hh-yellow)" }}>
          Builder ID Card
        </h1>
        <p className="mono" style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
          GOA, INDIA · 28–31 OCT 2026
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        {/* Live preview */}
        <div style={{ flex: "1 1 560px", minWidth: 280 }}>
          {/* The card is cream, so a white mat would merge with it — an ink
              ring plus lift is what separates it from the green page. */}
          <div
            ref={previewRef}
            style={{
              display: "flex",
              justifyContent: "center",
              border: "3px solid #0a2a1c",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 18px 40px rgba(0,0,0,.42)",
            }}
          >
            <div
              ref={stageWrapRef}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDragOverCanvas(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCanvas(false);
              }}
              onDrop={handleCanvasDrop}
              style={{
                width: displayWidth,
                lineHeight: 0,
                outline: dragOverCanvas ? "4px solid var(--hh-yellow)" : "4px solid transparent",
                outlineOffset: -6,
                transition: "outline-color .15s",
              }}
            >
              <IdCardCanvas
                cardRef={cardRef}
                photo={photo}
                name={name}
                role={role}
                building={building}
                title={title}
                code={code}
                displayWidth={displayWidth}
                onPhotoDrag={(offsetX, offsetY) =>
                  setPhoto((p) => ({ ...p, offsetX, offsetY }))
                }
                stickers={stickers}
                selectedStickerId={selectedStickerId}
                onSelectSticker={setSelectedStickerId}
                onStickerUpdate={(id, partial) =>
                  setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...partial } : s)))
                }
              />
            </div>
          </div>
          {ready && (
            <p className="mono" style={{ fontSize: 11, opacity: 0.7, marginTop: 10, textAlign: "center" }}>
              ✂ Use Crop to reframe your photo · tap a sticker to move, resize or spin it
            </p>
          )}

          {/* Sticker tray */}
          <div className="note-card" style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ color: "#0b5c3999" }}>
              Stickers. Drag one onto the card, or tap to drop it in the middle
            </div>
            <div className="sticker-tray" style={{ marginTop: 10 }}>
              {[{ id: "seksi", url: "/sticker-seksi.webp", label: "सेक्सी" }, ...GOA_STICKERS].map(
                ({ id, url, label }) => (
                  <StickerTile key={id} url={url} label={label} onAdd={() => addSticker(url)} />
                )
              )}
              <button
                onClick={() => stickerInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTray(true);
                }}
                onDragLeave={() => setDragOverTray(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTray(false);
                  addStickerFiles(e.dataTransfer.files);
                }}
                style={{
                  width: 72,
                  height: 72,
                  padding: 6,
                  border: `2px solid ${dragOverTray ? "#f4d913" : "#0b5c3944"}`,
                  borderRadius: 12,
                  background: dragOverTray ? "#f4d91318" : "#0b5c3911",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 20 }}>＋</span>
                <span
                  className="mono"
                  style={{ fontSize: 8, opacity: 0.7, lineHeight: 1.2, textAlign: "center" }}
                >
                  Custom
                </span>
              </button>
            </div>
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && addStickerFiles(e.target.files)}
            />
            {stickers.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={removeSelectedSticker}
                  disabled={!selectedStickerId}
                  className="pill-btn pink"
                  style={{ padding: "8px 14px", fontSize: 12, boxShadow: "none" }}
                >
                  🗑 Remove sticker
                </button>
                <button
                  onClick={() => {
                    setStickers([]);
                    setSelectedStickerId(null);
                  }}
                  className="pill-btn ghost"
                  style={{ padding: "8px 14px", fontSize: 12, color: "#0b5c39", borderColor: "#0b5c3944" }}
                >
                  Clear all ({stickers.length})
                </button>
                <span className="mono" style={{ fontSize: 11, opacity: 0.65 }}>
                  {selectedStickerId ? "Delete key works too" : "Tap a sticker to select it"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="note-card" style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div className="eyebrow">Step 1 · your photo</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 18px" }}>
            <button className="pill-btn" onClick={() => fileInputRef.current?.click()} disabled={loadingPhoto}>
              {loadingPhoto ? "Reading…" : "🖼 Gallery"}
            </button>
            <button className="pill-btn pink" onClick={() => setCameraOpen(true)} disabled={loadingPhoto}>
              📷 Camera
            </button>
            {original && (
              <button
                className="pill-btn ghost"
                onClick={() => setCropping(true)}
                style={{ color: "#0b5c39", borderColor: "#0b5c3944" }}
              >
                ✂ Crop
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            hidden
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />


          <div className="eyebrow">Step 2 · your details</div>
          <div style={{ display: "grid", gap: 10, margin: "10px 0 18px" }}>
            <input
              className="mono"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
            <input
              className="mono"
              placeholder="Stack / role, e.g. React, design"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={inputStyle}
            />
            <input
              className="mono"
              placeholder="What are you building?"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div className="eyebrow">Your builder title</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "10px 0 18px",
              flexWrap: "wrap",
            }}
          >
            <span
              className="mono"
              style={{
                background: "#ec1876",
                color: "#f6f0de",
                fontWeight: 700,
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 6,
                border: "2px solid #0a2a1c",
              }}
            >
              {title}
            </span>
            <button
              className="pill-btn ghost"
              onClick={() => setNudge((n) => n + 1)}
              style={{ padding: "6px 12px", fontSize: 12, color: "#0b5c39", borderColor: "#0b5c3944" }}
            >
              🎲 Reroll
            </button>
          </div>

          <div style={{ borderTop: "1px solid #0b5c3322", paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="pill-btn" onClick={download} disabled={!ready}>
                ⬇ Download
              </button>
              <button className="pill-btn pink" onClick={shareToX} disabled={!ready || sharing}>
                {sharing ? "Preparing…" : "𝕏 Share to X"}
              </button>
            </div>
            {!ready && (
              <p className="mono" style={{ fontSize: 11, opacity: 0.7, marginTop: 10 }}>
                Add a photo to download or share.
              </p>
            )}
            {shareNote && (
              <p className="mono" style={{ fontSize: 11, color: "#f4d913", marginTop: 10 }}>
                {shareNote}
              </p>
            )}
          </div>

          <Link
            href="/"
            className="mono"
            style={{ display: "inline-block", marginTop: 18, fontSize: 12, color: "var(--hh-cream)", opacity: 0.75 }}
          >
            ← Team memories frame instead
          </Link>
        </div>
      </div>

      {cropping && original && (
        <CropSheet
          image={original}
          aspect={PHOTO_ASPECT}
          onDone={(image) => {
            setPhoto({ image, offsetX: 0, offsetY: 0, zoom: 1 });
            setCropping(false);
          }}
          onCancel={() => setCropping(false)}
        />
      )}

      {cameraOpen && (
        <CameraSheet
          onCapture={handleFile}
          onClose={() => setCameraOpen(false)}
          onFallback={() => cameraInputRef.current?.click()}
        />
      )}
    </main>
  );
}

/** Tray tile. HTML5 drag for pointers, click-to-add as the touch fallback. */
function StickerTile({ url, label, onAdd }: { url: string; label: string; onAdd: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <button
      onClick={onAdd}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(STICKER_DND_TYPE, url);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      title={label}
      aria-label={label}
      style={{
        width: 72,
        height: 72,
        padding: 6,
        border: `2px solid ${hot ? "#f4d913" : "#0b5c3944"}`,
        borderRadius: 12,
        background: hot ? "#f4d91318" : "#0b5c3911",
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={url}
        alt={label}
        draggable={false}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", pointerEvents: "none" }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "2px solid #0b5c3944",
  background: "#ffffff",
  color: "#073d26",
  fontSize: 14,
};
