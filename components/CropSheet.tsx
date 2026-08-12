"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* Cropper for the uploaded photo.
   Dragging the photo inside the tiny on-card window was the only way to reframe
   it, which nobody found, and the zoom slider grew the shot from its centre so
   faces drifted out of view. Here the photo is shown large with the real crop
   window on top: drag to move, pinch or slide to zoom, and what you see is what
   gets baked in — the card then just receives an already-framed image. */
export default function CropSheet({
  image,
  aspect,
  onDone,
  onCancel,
}: {
  image: HTMLImageElement;
  aspect: number;
  onDone: (cropped: HTMLImageElement) => void;
  onCancel: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    function measure() {
      const el = frameRef.current;
      if (!el) return;
      const w = el.clientWidth;
      setBox({ w, h: w / aspect });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [aspect]);

  const base = useMemo(
    () => (box.w ? Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight) : 0),
    [box, image]
  );
  const drawScale = base * zoom;
  const dw = image.naturalWidth * drawScale;
  const dh = image.naturalHeight * drawScale;

  const clampOff = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(box.w - dw, o.x)),
      y: Math.min(0, Math.max(box.h - dh, o.y)),
    }),
    [box, dw, dh]
  );

  // Start centred, and keep the frame filled whenever the zoom changes.
  useEffect(() => {
    if (!box.w) return;
    setOff((o) => clampOff(o.x === 0 && o.y === 0 ? { x: (box.w - dw) / 2, y: (box.h - dh) / 2 } : o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h]);
  useEffect(() => {
    setOff((o) => clampOff(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOff(clampOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  }
  function endDrag() {
    drag.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZoom(Math.min(5, Math.max(1, (pinch.current.zoom * d) / pinch.current.dist)));
    }
  }

  function apply() {
    // Map the on-screen crop window back to source pixels.
    const sx = -off.x / drawScale;
    const sy = -off.y / drawScale;
    const sw = box.w / drawScale;
    const sh = box.h / drawScale;
    const outW = Math.min(1600, Math.max(600, Math.round(sw)));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = Math.round(outW / aspect);
    const ctx = canvas.getContext("2d");
    if (!ctx) return onCancel();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const out = new window.Image();
    out.onload = () => onDone(out);
    out.src = canvas.toDataURL("image/jpeg", 0.92);
  }

  return (
    <div
      role="dialog"
      aria-label="Crop your photo"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "#04180fee",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="eyebrow" style={{ marginBottom: 10, textAlign: "center" }}>
          Drag to move · pinch or slide to zoom
        </div>
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => (pinch.current = null)}
          onWheel={(e) => setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.0015)))}
          style={{
            position: "relative",
            width: "100%",
            height: box.h || undefined,
            aspectRatio: box.h ? undefined : `${aspect}`,
            overflow: "hidden",
            borderRadius: 14,
            border: "3px solid var(--hh-yellow)",
            background: "#0c0c0c",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: off.x,
              top: off.y,
              width: dw,
              height: dh,
              maxWidth: "none",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        </div>

        <input
          type="range"
          min={1}
          max={5}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          style={{ width: "100%", accentColor: "#ec1876", marginTop: 14 }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
          <button className="pill-btn" onClick={apply}>
            ✓ Use this crop
          </button>
          <button className="pill-btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
