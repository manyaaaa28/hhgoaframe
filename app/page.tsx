"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { nanoid } from "nanoid";
import { layoutsForSize, LayoutTemplate, CANVAS_SIZE, HH_FRAME_W, HH_FRAME_H } from "@/lib/layouts";
import { fileToImage } from "@/lib/loadImage";
import { GOA_STICKERS, makeBadgeBoard, type BoardStyle } from "@/lib/goaStickers";
import { generateBuilderTitle } from "@/lib/builderTitle";
import { shareToX as shareImageToX } from "@/lib/share";
import { cascadeDrop, STICKER_SIZE_RATIO } from "@/lib/stickerDrop";
import CameraSheet from "@/components/CameraSheet";
import CropSheet from "@/components/CropSheet";
import type { EditorCanvasHandle, PhotoState, StickerInstance, Stroke, Tool } from "@/components/EditorCanvas";

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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [panel, setPanel] = useState<"stickers" | "pen" | null>(null);
  const [brush, setBrush] = useState({ color: "#cf3550", size: 18 });
  const [railTool, setRailTool] = useState<RailTool>("move");
  const [boardStyle, setBoardStyle] = useState<BoardStyle>("yellow");
  const [titleNudge, setTitleNudge] = useState(0);
  const [finishTries, setFinishTries] = useState(0);
  /** The auto-placed nameplate, tracked so edits update it instead of stacking copies. */
  const badgeIdRef = useRef<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [cropping, setCropping] = useState(false);

  const canvasRef = useRef<EditorCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const CW = layout?.canvasWidth ?? CANVAS_SIZE;
  const CH = layout?.canvasHeight ?? CANVAS_SIZE;
  const frameTheme = layout?.frameTheme ?? "classic";
  const isHH = frameTheme === "hacker-house";

  /* Each step is a new screen. Without this the editor inherits the scroll
     position from the step before, which on a phone drops you below the frame
     entirely — it reads as "the frame is missing", and canvas taps land off
     screen. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  useEffect(() => {
    function onResize() {
      if (!containerRef.current) return;
      const box = containerRef.current;
      const w = box.clientWidth - 8;
      const h = box.clientHeight - 8;
      if (w <= 0 || h <= 0) return;
      // The editor never scrolls, so the frame is contain-fitted into whatever
      // the shell leaves over. displaySize is the frame's long edge.
      const fit = Math.min(w / CW, h / CH);
      setDisplaySize(fit * Math.max(CW, CH));
    }
    onResize();
    window.addEventListener("resize", onResize);
    const ro = containerRef.current ? new ResizeObserver(onResize) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [step, CW, CH]);

  /* One frame, one photo: the landing button goes straight to the editor so
     nothing sits between the user and their picture. */
  function startSolo() {
    const solo = layoutsForSize(1)[0];
    setNames([""]);
    setStacks([""]);
    setLayout(solo);
    setPhotos(Array.from({ length: solo.slots.length }, emptyPhoto));
    setActiveSlot(0);
    setStep(1);
  }

  const builderName = names[0] ?? "";
  const builderStack = stacks[0] ?? "";
  const builderTitle = useMemo(
    () => generateBuilderTitle(builderName, builderStack, titleNudge),
    [builderName, builderStack, titleNudge]
  );
  /* The badge is the deliverable, so name and stack are required before the
     card can be finished — the brief asks for a badge, not a bare frame. */
  const detailsMissing = !builderName.trim() || !builderStack.trim();
  const finishNudge =
    finishTries && detailsMissing ? FINISH_NUDGES[(finishTries - 1) % FINISH_NUDGES.length] : null;

  /* The nameplate places itself as soon as both fields are filled and follows
     every keystroke after that, so the details can't be typed and then left
     off the image. It's still an ordinary sticker, so it stays draggable. */
  useEffect(() => {
    if (detailsMissing) {
      const id = badgeIdRef.current;
      if (id) {
        setStickers((prev) => prev.filter((s) => s.id !== id));
        badgeIdRef.current = null;
      }
      return;
    }
    const url = makeBadgeBoard(builderName, builderStack, builderTitle, boardStyle);
    const img = new window.Image();
    img.onload = () => {
      setStickers((prev) => {
        const id = badgeIdRef.current;
        if (id && prev.some((s) => s.id === id)) {
          // Keep wherever the user dragged it; only the artwork changes.
          return prev.map((s) => (s.id === id ? { ...s, src: url, imgEl: img } : s));
        }
        const newId = nanoid(6);
        badgeIdRef.current = newId;
        /* Sits along the bottom of the photo window like a caption, rather
           than in the middle of the user's face. */
        const slot = layout?.slots[0];
        const scale = (CW * 0.52) / Math.max(img.width, img.height, 1);
        const stripH = img.height * scale;
        const x = slot ? (slot.x + slot.w / 2) * CW : CW / 2;
        const y = slot ? (slot.y + slot.h) * CH - stripH / 2 - CH * 0.03 : CH * 0.7;
        return [
          ...prev,
          { id: newId, kind: "image" as const, src: url, imgEl: img, x, y, scale, rotation: 0 },
        ];
      });
    };
    img.src = url;
  }, [builderName, builderStack, builderTitle, boardStyle, detailsMissing, CW, CH, layout]);

  /* Straight to the cropper: the on-frame window is small and nobody found the
     drag-to-reposition, so framing happens once, large, before it lands. */
  const handleFile = useCallback(
    async (file: File) => {
      if (activeSlot === null || !layout) return;
      setBusy(true);
      try {
        const img = await fileToImage(file);
        setOriginal(img);
        setCropping(true);
      } catch {
        alert("Couldn't read that photo. Try another one?");
      } finally {
        setBusy(false);
      }
    },
    [activeSlot, layout]
  );

  /** Place an already-framed image into the active slot. */
  const placeImage = useCallback(
    (img: HTMLImageElement) => {
      if (activeSlot === null || !layout) return;
      const slot = layout.slots[activeSlot];
      const baseScale = Math.max((slot.w * CW) / img.width, (slot.h * CH) / img.height);
      setPhotos((prev) => {
        const next = [...prev];
        next[activeSlot] = { image: img, offsetX: 0, offsetY: 0, scale: baseScale, baseScale };
        return next;
      });
    },
    [activeSlot, layout, CW, CH]
  );

  /** Each slot has its own shape, so the cropper matches the one being filled. */
  const slotAspect =
    activeSlot !== null && layout
      ? (layout.slots[activeSlot].w * CW) / (layout.slots[activeSlot].h * CH)
      : 1;

  function updatePhotoDrag(index: number, offsetX: number, offsetY: number) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], offsetX, offsetY };
      return next;
    });
  }




  /* The rail mixes modes (pen, eraser, move, stickers) with one-shot actions
     (photo, crop, undo, delete). Both light up the button so the options bar
     always explains what just happened. */
  function runTool(id: RailTool) {
    setRailTool(id);
    if (id === "pen" || id === "eraser") {
      setTool(id === "pen" ? "brush" : "eraser");
      setSelectedStickerId(null);
      return;
    }
    setTool("select");
    if (id === "photo") fileInputRef.current?.click();
    else if (id === "camera") setCameraOpen(true);
    else if (id === "crop") setCropping(true);
    else if (id === "undo") setStrokes((v) => v.slice(0, -1));
    else if (id === "delete") {
      if (selectedStickerId) removeSelectedSticker();
      else {
        setStickers([]);
        setSelectedStickerId(null);
      }
    }
  }

  function removeSelectedSticker() {
    if (!selectedStickerId) return;
    setStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  }

  /* Delete/Backspace removes the selected sticker; Escape drops back to MOVE.
     Pen and eraser stop the sticker layer listening, so without a way out it
     looks like stickers have stopped responding entirely. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === "Escape" && !typing) {
        setTool("select");
        setRailTool("move");
        return;
      }
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

  /** Drops land where the pointer was; taps fan out from the middle of the frame.
      Sign boards come in wider than a sticker so the text is readable at the
      size it lands. */
  function addImageSticker(url: string, at?: { x: number; y: number }, sizeRatio = STICKER_SIZE_RATIO) {
    const img = new window.Image();
    img.onload = () => {
      const id = nanoid(6);
      const targetPx = CW * sizeRatio;
      const scale = targetPx / Math.max(img.width, img.height, 1);
      setStickers((prev) => {
        const spot = at ?? cascadeDrop(prev, CW / 2, CH / 2, CW, CH);
        return [
          ...prev,
          {
            id,
            kind: "image" as const,
            src: url,
            imgEl: img,
            x: spot.x,
            y: spot.y,
            scale,
            rotation: 0,
          },
        ];
      });
      setSelectedStickerId(id);
      // On a phone the tray sits below the frame, so a tap otherwise drops the
      // sticker onto a canvas that's scrolled off screen and looks like a no-op.
      containerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  /* Only callable while step 2 is on screen — the EditorCanvas is unmounted at
     the share step, so the URL captured on Finish is the one we keep. */
  function exportImage(): string {
    /* Above 1x because at 1x the photo window is only ~760px across, so a phone
       photo gets thrown away down to that — and the photo is the subject.
       Capped at 2000 because X rejects images over 5MB and a full 2x export of
       this canvas measures 5.06MB: the post would simply fail to attach. 2000
       lands at ~3MB, still ~1090px of the user's photo, and exports in half the
       time. The frame art is a 1400px bitmap either way. */
    const url = canvasRef.current?.exportPNG(Math.min(CW * 2, 2000)) || "";
    if (url) setExportedUrl(url);
    return url;
  }

  function download() {
    const url = exportedUrl || exportImage();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = isHH ? "hacker-house-memories.png" : "hhgoa-2026-frame.png";
    a.click();
  }

  async function shareToX() {
    setBusy(true);
    setShareNote(null);
    /* Name and title are required to reach this screen, so the caption always
       carries the badge's own details rather than a generic line. */
    const who = builderName.trim();
    const caption =
      `${who ? `${who} \u2014 ` : ""}${builderTitle}. ` +
      `Locked in for HH Goa 2026 \u{1F334} #FrameInGoa`;
    // Runs synchronously up to its first await, so the intent window it opens
    // still counts as user-initiated and survives the popup blocker.
    const problem = await shareImageToX({
      dataUrl: exportedUrl || exportImage(),
      filename: isHH ? "hacker-house-memories.png" : "hhgoa-2026-frame.png",
      caption,
    });
    setShareNote(problem);
    setBusy(false);
  }

  const slots = layout?.slots ?? [];

  return (
    <main style={{ minHeight: "100dvh", padding: "20px 16px 60px", maxWidth: 1400, margin: "0 auto" }}>
      {step !== 1 && <Header step={step} />}

      {step === 0 && <StepStart onStart={startSolo} />}

      {step === 1 && layout && (
        <div className="ed-shell">
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
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && handleStickerFiles(e.target.files)}
          />

          <div className="ed-top">
            <div className="ed-logo">HH</div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.18em" }}>HH GOA · 2026</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f2d21f", opacity: 0.5 }} />
              <div style={{ width: 26, height: 8, borderRadius: 4, background: "#f2d21f" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5f0e0", opacity: 0.3 }} />
            </div>
            <div className="ed-date" style={{ marginLeft: "auto", fontSize: 12, letterSpacing: "0.16em", opacity: 0.85 }}>
              GOA, INDIA · 28–31 OCT 2026
            </div>
          </div>

          <div className="ed-body">
            <div className="ed-rail">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => runTool(t.id)}
                  disabled={
                    (t.id === "crop" && !original) ||
                    (t.id === "undo" && !strokes.length) ||
                    (t.id === "delete" && !selectedStickerId && !stickers.length)
                  }
                  title={t.name}
                  aria-pressed={railTool === t.id}
                  className={`ed-tool${railTool === t.id ? " active" : ""}${t.id === "delete" ? " danger" : ""}`}
                >
                  <span className="glyph">{t.glyph}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>

            <div className="ed-main">
              <div className="ed-opts">
                <span className="label">{railTool.toUpperCase()}</span>
                <div className="rule" />

                {(railTool === "pen" || railTool === "eraser") && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                    <span style={{ fontWeight: 700, letterSpacing: "0.12em", fontSize: 10 }}>SIZE</span>
                    <input
                      type="range"
                      min={4}
                      max={128}
                      value={brush.size}
                      onChange={(e) => setBrush((b) => ({ ...b, size: Number(e.target.value) }))}
                      aria-label="Brush size"
                      style={{ width: 150, accentColor: "#cf3550" }}
                    />
                    <span style={{ width: 44 }}>{brush.size}px</span>
                  </div>
                )}

                {railTool === "pen" && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flex: "none" }}>
                    {PEN_COLORS.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => setBrush((b) => ({ ...b, color: hex }))}
                        aria-label={`Pen colour ${hex}`}
                        className={`ed-swatch${brush.color === hex ? " on" : ""}`}
                        style={{ background: hex }}
                      />
                    ))}
                  </div>
                )}

                {railTool === "stickers" && (
                  <div style={{ display: "flex", gap: 3, alignItems: "center", flex: "none" }}>
                    {ALL_STICKERS.map(({ id, url, label }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setTool("select");
                          addImageSticker(url);
                        }}
                        title={label}
                        aria-label={`Add ${label} sticker`}
                        className="ed-sticker"
                      >
                        <img src={url} alt="" />
                      </button>
                    ))}
                    <button
                      onClick={() => stickerInputRef.current?.click()}
                      title="Upload your own"
                      aria-label="Upload your own sticker"
                      className="ed-sticker"
                      style={{ fontSize: 15, fontWeight: 700 }}
                    >
                      ＋
                    </button>
                  </div>
                )}

                {railTool === "name" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
                    <input
                      className="mono"
                      value={builderName}
                      onChange={(e) => setNames([e.target.value])}
                      placeholder="Your name *"
                      maxLength={24}
                      aria-label="Your name"
                      style={detailInput}
                    />
                    <input
                      className="mono"
                      value={builderStack}
                      onChange={(e) => setStacks([e.target.value])}
                      placeholder="Stack / role *"
                      maxLength={28}
                      aria-label="Your stack or role"
                      style={detailInput}
                    />
                    <span
                      className="mono"
                      title="Your generated builder title"
                      style={{
                        background: "#ec1876",
                        color: "#f6f0de",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: "0.04em",
                        padding: "7px 10px",
                        borderRadius: 6,
                        whiteSpace: "nowrap",
                        opacity: detailsMissing ? 0.5 : 1,
                      }}
                    >
                      {builderTitle}
                    </span>
                    <button
                      onClick={() => setTitleNudge((n) => n + 1)}
                      className="ed-btn"
                      title="Roll a different builder title"
                    >
                      🎲
                    </button>
                    {(["yellow", "pink", "green"] as BoardStyle[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setBoardStyle(s)}
                        aria-label={`${s} nameplate`}
                        aria-pressed={boardStyle === s}
                        className={`ed-swatch${boardStyle === s ? " on" : ""}`}
                        style={{ background: BOARD_SWATCH[s] }}
                      />
                    ))}
                  </div>
                )}

                <span className="hint">{TOOL_HINTS[railTool]}</span>
              </div>

              <div
                className="ed-canvas"
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
                  outline: dragOverCanvas ? "3px solid #f2d21f" : undefined,
                  outlineOffset: -3,
                  cursor: tool === "select" ? "default" : "crosshair",
                }}
              >
                <EditorCanvas
                  canvasRef={canvasRef}
                  slots={slots}
                  photos={photos}
                  onPhotoDrag={updatePhotoDrag}
                  activeSlot={activeSlot}
                  onSlotSelect={(i, isEmpty) => {
                    setActiveSlot(i);
                    if (isEmpty) fileInputRef.current?.click();
                  }}
                  stickers={stickers}
                  onStickerUpdate={(id, partial) =>
                    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...partial } : s)))
                  }
                  selectedStickerId={selectedStickerId}
                  onSelectSticker={setSelectedStickerId}
                  team={{ names, builderClass: generateBuilderClass(stacks) }}
                  tool={tool}
                  brush={brush}
                  strokes={strokes}
                  onAddStroke={(st) => setStrokes((v) => [...v, st])}
                  displaySize={displaySize}
                  frameTheme={frameTheme}
                  canvasWidth={CW}
                  canvasHeight={CH}
                />
              </div>

              <div className="ed-foot">
                <span
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.06em",
                    opacity: finishNudge ? 1 : 0.85,
                    color: finishNudge ? "#f2d21f" : undefined,
                    fontWeight: finishNudge ? 700 : undefined,
                  }}
                >
                  {finishNudge ??
                    (!photos.every((p) => p.image)
                      ? "Tap an empty slot to add a photo"
                      : detailsMissing
                        ? "Add your name and stack in NAME to finish"
                        : "Looking good · drag your nameplate anywhere")}
                </span>
                <button className="ed-btn" style={{ marginLeft: "auto" }} onClick={() => setStep(0)}>
                  BACK
                </button>
                <button
                  className="ed-btn primary"
                  onClick={() => {
                    if (detailsMissing) {
                      setFinishTries((n) => n + 1);
                      runTool("name");
                      return;
                    }
                    exportImage();
                    setStep(2);
                  }}
                  disabled={photos.some((p) => !p.image)}
                  title={detailsMissing ? "Add your name and stack first" : undefined}
                >
                  FINISH →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <StepShare
          exportedUrl={exportedUrl}
          busy={busy}
          onDownload={download}
          onShare={shareToX}
          onBack={() => setStep(1)}
          note={shareNote}
        />
      )}

      {cropping && original && (
        <CropSheet
          image={original}
          aspect={slotAspect}
          onDone={(img) => {
            placeImage(img);
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

const PEN_COLORS = ["#123c2b", "#f5f0e0", "#cf3550", "#f2d21f", "#4a9fd4", "#e2782a"];

/** Swatch colours for the sign-board styles, matching lib/goaStickers. */
/* Shown when someone hits FINISH with the badge still blank. Cycles so a
   second try doesn't just repeat itself. */
const FINISH_NUDGES = [
  "Arre, no name no fame — fill it in first 🌴",
  "Susegad is fine, but a badge needs a name.",
  "Even the scooter has a name. Add yours 🛵",
  "Nameless badge? Not very ship-or-ship.",
];

const detailInput: React.CSSProperties = {
  width: 150,
  padding: "7px 10px",
  borderRadius: 7,
  border: "2px solid #0000002e",
  background: "#fffdf5",
  color: "#123c2b",
  fontSize: 13,
};

const BOARD_SWATCH: Record<BoardStyle, string> = {
  yellow: "#f4d913",
  pink: "#ec1876",
  green: "#0b5c39",
};

type RailTool =
  | "photo"
  | "camera"
  | "crop"
  | "stickers"
  | "name"
  | "pen"
  | "eraser"
  | "move"
  | "undo"
  | "delete";

const TOOLS: { id: RailTool; name: string; glyph: string }[] = [
  { id: "photo", name: "PHOTO", glyph: "▣" },
  { id: "camera", name: "CAMERA", glyph: "◉" },
  { id: "crop", name: "CROP", glyph: "✂" },
  { id: "stickers", name: "STICKERS", glyph: "☺" },
  { id: "name", name: "NAME", glyph: "T" },
  { id: "pen", name: "PEN", glyph: "✎" },
  { id: "eraser", name: "ERASER", glyph: "▭" },
  { id: "move", name: "MOVE", glyph: "✥" },
  { id: "undo", name: "UNDO", glyph: "↩" },
  { id: "delete", name: "DELETE", glyph: "✕" },
];

const TOOL_HINTS: Record<RailTool, string> = {
  photo: "Pick a photo from your device",
  camera: "Snap a photo with your camera",
  crop: "Drag to reframe your photo",
  stickers: "Tap a sticker to drop it on the frame",
  name: "Type a name or your stack, then drop it on as a sign board",
  pen: "Drag to doodle on the frame",
  eraser: "Scrub over a doodle to rub it out",
  move: "Drag photos, stickers and doodles around",
  undo: "Steps back one doodle",
  delete: "Removes the selected sticker",
};

/** Every sticker we ship, shown in the options bar strip. */
const ALL_STICKERS = [{ id: "seksi", url: "/sticker-seksi.webp", label: "सेक्सी" }, ...GOA_STICKERS];

function RailButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rail-btn${active ? " active" : ""}`}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.04em" }}>
        {label}
      </span>
    </button>
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
        border: `2px solid ${hot ? "#f4d913" : "#0b5c3944"}`,
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

function StepDots({ step, dark = false }: { step: number; dark?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            width: i === step ? 22 : 8,
            height: 8,
            borderRadius: 4,
            background: i <= step ? "var(--hh-yellow)" : dark ? "#0b5c3925" : "#ffffff33",
            transition: "all .2s",
          }}
        />
      ))}
    </div>
  );
}

function Header({ step }: { step: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 40,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <img src="/hhgoa-logo.svg" alt="HH Goa" style={{ height: 34, width: "auto" }} />
        <span
          className="mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--hh-yellow)",
            fontWeight: 600,
          }}
        >
          HH Goa · 2026
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {step > 0 && <StepDots step={step - 1} />}
        <span className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", opacity: 0.7 }}>
          GOA, INDIA · 28–31 OCT 2026
        </span>
      </div>
    </div>
  );
}

function StepStart({ onStart }: { onStart: () => void }) {
  return (
    <>
      <section className="hero-grid" style={{ margin: "0 auto 56px" }}>
        <div>
          <h1
            className="display"
            style={{
              fontWeight: 800,
              fontSize: "clamp(34px, 5vw, 62px)",
              lineHeight: 1.02,
              margin: "0 0 20px",
              color: "#ffffff",
            }}
          >
            Get your{" "}
            <span style={{ color: "var(--hh-yellow)", whiteSpace: "nowrap" }}>official frame</span>
            <br />
            for HH&nbsp;Goa 2026.
          </h1>
          <p className="mono" style={{ fontSize: 16, lineHeight: 1.6, color: "#f6f0deb0", maxWidth: 440, margin: "0 0 32px" }}>
            Drop in a photo, we wrap it in the real event badge. Ready to set as your X profile picture in one tap.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <button className="pill-btn" onClick={onStart}>
              Upload your photo →
            </button>
          </div>
        </div>

        {/* Product shot: the actual frame art inside a mock post. */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
            <div
              style={{
                background: "var(--hh-cream)",
                borderRadius: 20,
                padding: 18,
                boxShadow: "0 24px 50px rgba(0,0,0,.45)",
                transform: "rotate(2deg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: "2px solid var(--hh-green)",
                    background: "#0b5c3922",
                  }}
                />
                <div style={{ lineHeight: 1.25 }}>
                  <div className="display" style={{ fontWeight: 700, fontSize: 13, color: "var(--hh-green)" }}>
                    You, Builder
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "#0b5c3999" }}>@yourhandle</div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--hh-green)", marginBottom: 12, lineHeight: 1.5 }}>
                Locked in for HH Goa 2026 🌴 #FrameInGoa
              </div>
              <div
                style={{
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  aspectRatio: `${HH_FRAME_W} / ${HH_FRAME_H}`,
                  background: "var(--hh-cream)",
                }}
              >
                <img
                  src="/hh-memories-frame.webp"
                  alt="HH Goa 2026 frame"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#0b5c3966",
                    fontWeight: 600,
                  }}
                >
                  Your photo here
                </div>
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 10,
                    background: "var(--hh-green)",
                    color: "var(--hh-yellow)",
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "4px 8px",
                    borderRadius: 6,
                  }}
                >
                  HH Goa · 2026
                </div>
              </div>
            </div>
            <div
              className="mono"
              style={{
                position: "absolute",
                top: -16,
                right: -18,
                width: 70,
                height: 70,
                borderRadius: "50%",
                background: "var(--hh-pink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                textAlign: "center",
                color: "var(--hh-cream)",
                lineHeight: 1.15,
                boxShadow: "0 10px 20px rgba(0,0,0,.35)",
                border: "2px solid var(--hh-green-dark)",
                animation: "hh-float 4s ease-in-out infinite",
              }}
            >
              THIS
              <br />
              COULD
              <br />
              BE YOU
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function StepShare({
  exportedUrl,
  busy,
  onDownload,
  onShare,
  onBack,
  note,
}: {
  exportedUrl: string | null;
  busy: boolean;
  onDownload: () => void;
  onShare: () => void;
  onBack: () => void;
  note: string | null;
}) {
  return (
    <div className="note-card" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="eyebrow">Step 2 / 2</div>
      <h2 className="display" style={{ margin: "6px 0 14px", fontSize: 22 }}>
        You&apos;re framed 🌴
      </h2>
      {exportedUrl && (
        /* As large as the 1400px file can go before the browser has to invent
           pixels. Stretched to the full card it was asking for nearly twice
           what the file holds, which is what softened the linework. */
        <img
          src={exportedUrl}
          alt="Your HH Goa 2026 frame"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 820,
            height: "auto",
            margin: "0 auto",
            borderRadius: 14,
            boxShadow: "0 10px 24px rgba(0,0,0,.25)",
          }}
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
      {note && (
        /* Most notes are the next step, not a failure — only the ones that
           start with "Couldn't" have gone wrong, so only those read as red. */
        <p
          className="mono"
          style={{
            fontSize: 12,
            color: note.startsWith("Couldn't") ? "#a03820" : "var(--hh-green)",
            fontWeight: 600,
            marginTop: 12,
          }}
        >
          {note}
        </p>
      )}
      <button className="pill-btn ghost" onClick={onBack} style={{ marginTop: 14 }}>
        ← Edit again
      </button>
    </div>
  );
}
