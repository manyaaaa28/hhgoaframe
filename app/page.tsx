"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { nanoid } from "nanoid";
import { layoutsForSize, LayoutTemplate, CANVAS_SIZE } from "@/lib/layouts";
import { fileToImage } from "@/lib/loadImage";
import { GOA_STICKERS } from "@/lib/goaStickers";
import type { EditorCanvasHandle, PhotoState, StickerInstance } from "@/components/EditorCanvas";

const EditorCanvas = dynamic(() => import("@/components/EditorCanvas"), { ssr: false });

/** Custom MIME so a sticker drag is distinguishable from a dragged image file. */
const STICKER_DND_TYPE = "application/x-hh-sticker";



function emptyPhoto(): PhotoState {
  return { image: null, offsetX: 0, offsetY: 0, scale: 1, baseScale: 1 };
}

function generateBuilderClass(stacks: string[]): string {
  const words = stacks
    .filter(Boolean)
    .map((s) => s.trim().split(/[\s,/]+/)[0].toUpperCase())
    .filter(Boolean);
  if (words.length === 0) return "GOA, INDIA · 28–31 OCT 2026";
  const unique = Array.from(new Set(words)).slice(0, 3);
  return unique.join(" × ") + (unique.length > 1 ? " CREW" : " BUILDER");
}

export default function Page() {
  const [step, setStep] = useState(0);
  const [teamSize, setTeamSize] = useState<1 | 2 | 3 | null>(null);
  const [layout, setLayout] = useState<LayoutTemplate | null>(null);
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [stickers, setStickers] = useState<StickerInstance[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [dragOverSticker, setDragOverSticker] = useState(false);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [stacks, setStacks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [displaySize, setDisplaySize] = useState(560);

  const canvasRef = useRef<EditorCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const CW = layout?.canvasWidth ?? CANVAS_SIZE;
  const CH = layout?.canvasHeight ?? CANVAS_SIZE;
  const frameTheme = layout?.frameTheme ?? "classic";
  const isHH = frameTheme === "hacker-house";

  useEffect(() => {
    function onResize() {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      setDisplaySize(Math.min(w, 1060));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step]);

  function pickTeamSize(n: 1 | 2 | 3) {
    setTeamSize(n);
    setNames(Array(n).fill(""));
    setStacks(Array(n).fill(""));
    setStep(1);
  }

  function pickLayout(l: LayoutTemplate) {
    setLayout(l);
    setPhotos(Array.from({ length: l.slots.length }, emptyPhoto));
    setActiveSlot(0);
    setStep(2);
  }

  const handleFile = useCallback(
    async (file: File) => {
      if (activeSlot === null || !layout) return;
      setBusy(true);
      try {
        const img = await fileToImage(file);
        const slot = layout.slots[activeSlot];
        const sw = slot.w * CW;
        const sh = slot.h * CH;
        const baseScale = Math.max(sw / img.width, sh / img.height);
        setPhotos((prev) => {
          const next = [...prev];
          next[activeSlot] = { image: img, offsetX: 0, offsetY: 0, scale: baseScale, baseScale };
          return next;
        });
      } catch (err) {
        alert("Couldn't read that photo. Try another one?");
      } finally {
        setBusy(false);
      }
    },
    [activeSlot, layout, CW, CH]
  );

  function updatePhotoDrag(index: number, offsetX: number, offsetY: number) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], offsetX, offsetY };
      return next;
    });
  }

  function setZoom(index: number, scale: number) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], scale };
      return next;
    });
  }



  function removeSelectedSticker() {
    if (!selectedStickerId) return;
    setStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  }

  /** Drops land where the pointer was; taps land in the middle of the frame. */
  function addImageSticker(url: string, at?: { x: number; y: number }) {
    const img = new window.Image();
    img.onload = () => {
      const id = nanoid(6);
      const targetPx = Math.min(450, CW * 0.25);
      const scale = targetPx / Math.max(img.width, img.height, 1);
      setStickers((prev) => [
        ...prev,
        {
          id,
          kind: "image" as const,
          src: url,
          imgEl: img,
          x: at?.x ?? CW / 2,
          y: at?.y ?? CH / 2,
          scale,
          rotation: 0,
        },
      ]);
      setSelectedStickerId(id);
    };
    img.src = url;
  }

  function handleStickerFiles(files: FileList, at?: { x: number; y: number }) {
    Array.from(files).forEach((file, i) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        if (!src) return;
        // nudge each extra file so a multi-drop doesn't stack into one pile
        addImageSticker(src, at && { x: at.x + i * 40, y: at.y + i * 40 });
      };
      reader.readAsDataURL(file);
    });
  }

  /* Stage is rendered at this scale, so screen px ÷ scale = canvas px. */
  const canvasScale = CW >= CH ? displaySize / CW : displaySize / CH;

  function dropPoint(e: React.DragEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
    return {
      x: clamp((e.clientX - rect.left) / canvasScale, CW),
      y: clamp((e.clientY - rect.top) / canvasScale, CH),
    };
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverCanvas(false);
    const at = dropPoint(e);
    const url = e.dataTransfer.getData(STICKER_DND_TYPE);
    if (url) {
      addImageSticker(url, at);
      return;
    }
    if (e.dataTransfer.files?.length) handleStickerFiles(e.dataTransfer.files, at);
  }

  function exportImage(): string {
    const url = canvasRef.current?.exportPNG(isHH ? 2048 : 1600) || "";
    setExportedUrl(url);
    return url;
  }

  function download() {
    const url = exportImage();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = isHH ? "hacker-house-memories.png" : "hhgoa-2026-frame.png";
    a.click();
  }

  async function shareToX() {
    const url = exportImage();
    if (!url) return;
    const caption = `Locked in for HH Goa 2026 🌴 ${
      names.filter(Boolean).length ? `— ${names.filter(Boolean).join(" x ")}` : ""
    } #FrameInGoa`;

    const blob = await (await fetch(url)).blob();
    const file = new File([blob], "hhgoa-2026-frame.png", { type: "image/png" });

    if (typeof navigator.share === "function" && (navigator as any).canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption });
        return;
      } catch {
        // fall through to link share if user cancels/unsupported
      }
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.cardUrl) {
        const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          caption
        )}&url=${encodeURIComponent(data.cardUrl)}`;
        window.open(tweet, "_blank");
      } else {
        alert("Upload failed — download the image and attach it manually on X.");
      }
    } catch {
      alert("Couldn't reach the server — download the image and attach it manually on X.");
    } finally {
      setBusy(false);
    }
  }

  const slots = layout?.slots ?? [];

  return (
    <main style={{ minHeight: "100dvh", padding: "20px 16px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <Header step={step} />

      {step === 0 && <StepTeamSize onPick={pickTeamSize} />}

      {step === 1 && teamSize && (
        <StepLayout
          teamSize={teamSize}
          onPick={pickLayout}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && layout && (
        <div>
          {/* Full-width canvas preview — outside the white card.
              The frame art is the same green as the page, so the stage sits on
              a white mat with a black border to read as a print. The mat is a
              separate wrapper: containerRef is measured for the stage size and
              for sticker drop coordinates, so it must stay padding-free. */}
          <div
            style={{
              background: "#ffffff",
              border: "3px solid #0a2a1c",
              borderRadius: 16,
              padding: 12,
              marginBottom: 20,
              boxShadow: "0 18px 40px rgba(0,0,0,.42)",
            }}
          >
            <div
              ref={containerRef}
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
                width: "100%",
                position: "relative",
                lineHeight: 0,
                outline: dragOverCanvas ? "3px dashed var(--hh-yellow)" : "3px dashed transparent",
                outlineOffset: 4,
                borderRadius: 6,
                overflow: "hidden",
                transition: "outline-color .15s",
              }}
            >
              <EditorCanvas
                canvasRef={canvasRef}
                slots={slots}
                photos={photos}
                onPhotoDrag={updatePhotoDrag}
                activeSlot={activeSlot}
                stickers={stickers}
                onStickerUpdate={(id, partial) =>
                  setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...partial } : s)))
                }
                selectedStickerId={selectedStickerId}
                onSelectSticker={setSelectedStickerId}
                team={{ names, builderClass: generateBuilderClass(stacks) }}
                displaySize={displaySize}
                frameTheme={frameTheme}
                canvasWidth={CW}
                canvasHeight={CH}
              />
            </div>
          </div>

          {/* Narrower controls card */}
          <div className="note-card" style={{ maxWidth: 640, margin: "0 auto" }}>
            <div className="eyebrow">Step 3 / 4</div>
            <h2 className="display" style={{ margin: "6px 0 14px", fontSize: 22 }}>
              {isHH ? "Attach your pic" : "Fill your frame"}
            </h2>

            {/* Slot picker */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 10px" }}>
              {slots.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlot(i)}
                  className="pill-btn"
                  style={{
                    padding: "8px 16px",
                    fontSize: 12,
                    background: activeSlot === i ? "#f4d913" : "#ffffff22",
                    color: activeSlot === i ? "#0b5c39" : "#f6f0de",
                    boxShadow: "none",
                    backgroundImage: "none",
                    paddingBottom: 8,
                  }}
                >
                  {isHH ? `Pic ${i + 1}` : `Slot ${i + 1}`} {photos[i]?.image ? "✓" : ""}
                </button>
              ))}
            </div>

            {/* Upload controls */}
            {activeSlot !== null && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <button className="pill-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  📁 Gallery
                </button>
                <button className="pill-btn pink" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                  📷 Camera
                </button>
                {photos[activeSlot]?.image && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 160 }}>
                    <span className="mono" style={{ fontSize: 12 }}>Zoom</span>
                    <input
                      type="range"
                      min={photos[activeSlot].baseScale}
                      max={photos[activeSlot].baseScale * 3}
                      step={0.001}
                      value={photos[activeSlot].scale}
                      onChange={(e) => setZoom(activeSlot, parseFloat(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </div>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="user" hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={stickerInputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => e.target.files && handleStickerFiles(e.target.files)} />

            {/* Names / stack fields - classic only */}
            {!isHH && (
              <div style={{ borderTop: "1px dashed #0b5c3933", paddingTop: 14, marginTop: 6 }}>
                <div className="eyebrow" style={{ color: "#0b5c3999" }}>Personalize</div>
                {Array.from({ length: teamSize ?? 1 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                    <input className="mono" placeholder={`Name ${i + 1}`} value={names[i] || ""}
                      onChange={(e) => setNames((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                      style={inputStyle} />
                    <input className="mono" placeholder="Stack / role" value={stacks[i] || ""}
                      onChange={(e) => setStacks((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                      style={inputStyle} />
                  </div>
                ))}
              </div>
            )}

            {/* Sticker tray */}
            <div style={{ borderTop: "1px dashed #0b5c3933", paddingTop: 14, marginTop: 14 }}>
              <div className="eyebrow" style={{ color: "#0b5c3999" }}>
                Stickers — drag one onto the frame, or tap to drop it in the middle
              </div>

              {/* Predefined sticker thumbnails */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {[{ id: "seksi", url: "/sticker-seksi.png", label: "सेक्सी" }, ...GOA_STICKERS].map(
                  ({ id, url, label }) => (
                    <StickerTile
                      key={id}
                      url={url}
                      label={label}
                      onAdd={() => addImageSticker(url)}
                    />
                  )
                )}

                {/* Custom image upload tile */}
                <button
                  onClick={() => stickerInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOverSticker(true); }}
                  onDragLeave={() => setDragOverSticker(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOverSticker(false); handleStickerFiles(e.dataTransfer.files); }}
                  style={{
                    width: 80,
                    height: 80,
                    padding: 6,
                    border: `2px dashed ${dragOverSticker ? "#f4d913" : "#0b5c3966"}`,
                    borderRadius: 12,
                    background: dragOverSticker ? "#f4d91318" : "#0b5c3911",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 22 }}>＋</span>
                  <span className="mono" style={{ fontSize: 9, opacity: 0.7, lineHeight: 1.2, textAlign: "center" as const }}>Custom image</span>
                </button>
              </div>

              {selectedStickerId && (
                <button
                  onClick={removeSelectedSticker}
                  className="pill-btn pink"
                  style={{ marginTop: 12, padding: "8px 14px", fontSize: 12, boxShadow: "none", backgroundImage: "none", paddingBottom: 8 }}
                >
                  🗑 Remove selected sticker
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 640, margin: "18px auto 0" }}>
            <button className="pill-btn ghost" onClick={() => setStep(1)}>Back</button>
            <button
              className="pill-btn pink"
              onClick={() => { exportImage(); setStep(3); }}
              disabled={photos.some((p) => !p.image)}
            >
              Finish →
            </button>
          </div>
          {photos.some((p) => !p.image) && (
            <p className="mono" style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: "center" }}>
              {isHH ? "Attach a pic to continue." : "Fill every slot to continue."}
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <StepShare
          exportedUrl={exportedUrl}
          busy={busy}
          onDownload={download}
          onShare={shareToX}
          onBack={() => setStep(2)}
          onRegenerate={exportImage}
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
        const ghost = e.currentTarget.querySelector("img");
        if (ghost) e.dataTransfer.setDragImage(ghost, ghost.width / 2, ghost.height / 2);
      }}
      title={label}
      aria-label={`Add ${label} sticker`}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        width: 80,
        height: 80,
        padding: 6,
        border: `2px dashed ${hot ? "#f4d913" : "#0b5c3966"}`,
        borderRadius: 12,
        background: hot ? "#f4d91318" : "#0b5c3911",
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 0.15s, background 0.15s",
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
  flex: 1,
  padding: "10px 12px",
  borderRadius: 8,
  border: "2px solid #0b5c3933",
  background: "#ffffffaa",
  color: "#0b5c39",
  fontSize: 13,
};

function Header({ step }: { step: number }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 22 }}>
      <div className="eyebrow">HH GOA · 2026</div>
      <h1 className="display" style={{ fontSize: 34, margin: "4px 0 2px", color: "var(--hh-yellow)" }}>
        Frame Generator
      </h1>
      <p className="mono" style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
        GOA, INDIA · 28–31 OCT 2026
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: i === step ? 22 : 8,
              height: 8,
              borderRadius: 4,
              background: i <= step ? "var(--hh-yellow)" : "#ffffff33",
              transition: "all .2s",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StepTeamSize({ onPick }: { onPick: (n: 1 | 2 | 3) => void }) {
  return (
    <>
      <Link
        href="/id"
        className="note-card"
        style={{
          display: "block",
          marginBottom: 14,
          textDecoration: "none",
          borderLeft: "8px solid var(--hh-pink)",
        }}
      >
        <div className="eyebrow">Solo? Try this instead</div>
        <h2 className="display" style={{ margin: "6px 0 4px", fontSize: 22 }}>
          Builder ID Card →
        </h2>
        <p className="mono" style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
          Your photo, name and stack on an HH Goa event badge. One screen, download or post it straight to X.
        </p>
      </Link>

      <div className="note-card">
        <div className="eyebrow">Step 1 / 4</div>
      <h2 className="display" style={{ margin: "6px 0 4px", fontSize: 22 }}>
        How many builders?
      </h2>
      <p className="mono" style={{ fontSize: 13, opacity: 0.75, margin: "0 0 18px" }}>
        HH Goa teams run 1–3 people. Pick your squad size.
      </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[1, 2, 3].map((n) => (
            <button key={n} className="pill-btn" onClick={() => onPick(n as 1 | 2 | 3)} style={{ flex: 1, minWidth: 90 }}>
              {n} {n === 1 ? "solo" : "builders"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepLayout({
  teamSize,
  onPick,
  onBack,
}: {
  teamSize: 1 | 2 | 3;
  onPick: (l: LayoutTemplate) => void;
  onBack: () => void;
}) {
  const options = layoutsForSize(teamSize);
  return (
    <div className="note-card">
      <div className="eyebrow">Step 2 / 4</div>
      <h2 className="display" style={{ margin: "6px 0 4px", fontSize: 22 }}>
        Pick your frame
      </h2>
      <p className="mono" style={{ fontSize: 13, opacity: 0.75, margin: "0 0 18px" }}>
        Choose the exact frame style you want.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: options.length > 2 ? "1fr 1fr" : "1fr", gap: 14 }}>
        {options.map((l) => {
          const isHH = l.frameTheme === "hacker-house";
          const cw = l.canvasWidth ?? 1080;
          const ch = l.canvasHeight ?? 1080;
          const ar = isHH ? `${cw} / ${ch}` : "1 / 1";
          return (
            <button
              key={l.id}
              onClick={() => onPick(l)}
              style={{
                border: isHH ? "3px solid #f4d913" : "2px solid #0b5c3933",
                borderRadius: 12,
                padding: 10,
                background: "#ffffffaa",
                cursor: "pointer",
                gridColumn: isHH ? options.length > 2 ? "1 / -1" : undefined : undefined,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: ar,
                  background: isHH
                    ? "#f6f0de"
                    : "#0b5c39",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {isHH ? (
                  <>
                    <img
                      src="/hh-memories-frame.png"
                      alt="Hacker House Frame"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {l.slots.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          left: `${s.x * 100}%`,
                          top: `${s.y * 100}%`,
                          width: `${s.w * 100}%`,
                          height: `${s.h * 100}%`,
                          background: "#0c0c0c55",
                          border: "2px dashed #f4d913",
                          borderRadius: 6,
                          boxSizing: "border-box",
                        }}
                      />
                    ))}
                    <div
                      style={{
                        position: "absolute",
                        left: 10,
                        bottom: 10,
                        fontSize: "0.6em",
                        color: "#0b5c39",
                        background: "#f6f0de",
                        padding: "2px 6px",
                        borderRadius: 999,
                        fontFamily: "monospace",
                      }}
                    >
                      🌴🏍💻 EXACT
                    </div>
                  </>
                ) : (
                  l.slots.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: `${s.x * 100}%`,
                        top: `${s.y * 100}%`,
                        width: `${s.w * 100}%`,
                        height: `${s.h * 100}%`,
                        background: "#f4d91355",
                        border: "1.5px solid #f4d913",
                        borderRadius: s.shape === "notch" ? 4 : 6,
                      }}
                    />
                  ))
                )}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 12,
                  marginTop: 8,
                  color: isHH ? "#a03820" : "#0b5c39",
                  fontWeight: 700,
                }}
              >
                {l.label}
              </div>
            </button>
          );
        })}
      </div>
      <button className="pill-btn ghost" onClick={onBack} style={{ marginTop: 18 }}>
        Back
      </button>
    </div>
  );
}

function StepShare({
  exportedUrl,
  busy,
  onDownload,
  onShare,
  onBack,
  onRegenerate,
}: {
  exportedUrl: string | null;
  busy: boolean;
  onDownload: () => void;
  onShare: () => void;
  onBack: () => void;
  onRegenerate: () => void;
}) {
  useEffect(() => {
    onRegenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="note-card">
      <div className="eyebrow">Step 4 / 4</div>
      <h2 className="display" style={{ margin: "6px 0 14px", fontSize: 22 }}>
        You&apos;re framed 🌴
      </h2>
      {exportedUrl && (
        <img
          src={exportedUrl}
          alt="Your HH Goa 2026 frame"
          style={{ width: "100%", borderRadius: 14, boxShadow: "0 10px 24px rgba(0,0,0,.25)" }}
        />
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button className="pill-btn" onClick={onDownload}>
          ⬇ Download
        </button>
        <button className="pill-btn pink" onClick={onShare} disabled={busy}>
          {busy ? "Preparing…" : "𝕏 Share to X"}
        </button>
      </div>
      <button className="pill-btn ghost" onClick={onBack} style={{ marginTop: 14 }}>
        ← Edit again
      </button>
    </div>
  );
}
