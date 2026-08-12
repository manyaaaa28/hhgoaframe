"use client";

import React, { useImperativeHandle, useRef, useEffect, useState } from "react";
import { Stage, Layer, Group, Rect, Image as KonvaImage, Text, Circle, Line } from "react-konva";
import Konva from "konva";
import { CANVAS_SIZE, Slot, FrameTheme } from "@/lib/layouts";
import { StickerArt, StickerKind } from "@/lib/stickers";
import StickerTransformer from "./StickerTransformer";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export type PhotoState = {
  image: HTMLImageElement | null;
  offsetX: number;
  offsetY: number;
  scale: number;
  baseScale: number;
};

export type StickerInstance = {
  id: string;
  kind: StickerKind;
  src?: string;          // data URL for image stickers
  imgEl?: HTMLImageElement; // pre-loaded image element (not serialized)
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type Stroke = {
  points: number[];
  color: string;
  size: number;
  erase: boolean;
};

/** "select" moves photos and stickers; the others paint on the doodle layer. */
export type Tool = "select" | "brush" | "eraser";

export type TeamInfo = {
  names: string[];
  builderClass: string;
};

type Props = {
  slots: Slot[];
  photos: PhotoState[];
  onPhotoDrag: (index: number, offsetX: number, offsetY: number) => void;
  activeSlot: number | null;
  /** Tapping a slot on the canvas picks it; an empty one also asks for a file. */
  onSlotSelect?: (index: number, isEmpty: boolean) => void;
  stickers: StickerInstance[];
  onStickerUpdate: (id: string, partial: Partial<StickerInstance>) => void;
  selectedStickerId: string | null;
  onSelectSticker: (id: string | null) => void;
  team: TeamInfo;
  tool: Tool;
  brush: { color: string; size: number };
  strokes: Stroke[];
  onAddStroke: (s: Stroke) => void;
  displaySize: number;
  frameTheme?: FrameTheme;
  canvasWidth?: number;
  canvasHeight?: number;
  /* Passed as a prop rather than via forwardRef: this component is loaded with
     next/dynamic, which does not forward refs — a real ref would silently stay
     null and every export would come back empty. */
  canvasRef?: React.Ref<EditorCanvasHandle>;
};

export type EditorCanvasHandle = {
  exportPNG: (targetWidth?: number) => string;
};

function clipForShape(ctx: Konva.Context, w: number, h: number, shape: Slot["shape"]) {
  const r = 14;
  ctx.beginPath();
  if (shape === "notch") {
    const cut = Math.min(w, h) * 0.16;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - cut, 0);
    ctx.lineTo(w, cut);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
  } else {
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
  }
  ctx.closePath();
}

/* Deselect when the tap misses every sticker. Testing `e.target === stage`
   doesn't work: both canvases paint a full-bleed background Rect, so the stage
   itself is never the event target and the selection could never be cleared.
   Transformer anchors are excluded or grabbing a handle would deselect. */
function isOffSticker(e: Konva.KonvaEventObject<unknown>) {
  const t = e.target;
  return !t.findAncestor(".sticker", true) && !t.findAncestor("Transformer", true);
}

export default function EditorCanvas({
  slots,
  photos,
  onPhotoDrag,
  activeSlot,
  onSlotSelect,
  stickers,
  onStickerUpdate,
  selectedStickerId,
  onSelectSticker,
  team,
  tool,
  brush,
  strokes,
  onAddStroke,
  displaySize,
  frameTheme = "classic",
  canvasWidth: cw,
  canvasHeight: ch,
  canvasRef,
}: Props) {
  const trRef = useRef<Konva.Transformer>(null);
  const stickerNodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const stageRef = useRef<Konva.Stage>(null);
  const CANVAS_W = cw ?? CANVAS_SIZE;
  const CANVAS_H = ch ?? CANVAS_SIZE;
  const isHH = frameTheme === "hacker-house";

  // scale = fit canvas into displaySize bounding box, preserving aspect ratio
  const scale =
    CANVAS_W >= CANVAS_H
      ? displaySize / CANVAS_W
      : displaySize / CANVAS_H;
  const stageW = CANVAS_W * scale;
  const stageH = CANVAS_H * scale;

  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const logo = new window.Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => setLogoImage(logo);
    logo.src = "/hhgoa-logo.svg";

    const frame = new window.Image();
    frame.crossOrigin = "anonymous";
    frame.onload = () => setFrameImage(frame);
    frame.src = "/hh-memories-frame.webp";
  }, []);

  useImperativeHandle(canvasRef, () => ({
    exportPNG: (targetWidth = 1600) => {
      const stage = stageRef.current;
      if (!stage) return "";
      // Drop the selection handles so they don't bake into the export, then put
      // them back — nothing else re-attaches them until the selection changes.
      trRef.current?.nodes([]);
      const pixelRatio = targetWidth / stageW;
      const url = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
      const node = selectedStickerId ? stickerNodeRefs.current[selectedStickerId] : null;
      if (node) trRef.current?.nodes([node]);
      return url;
    },
  }));

  React.useEffect(() => {
    if (trRef.current) {
      const node = selectedStickerId ? stickerNodeRefs.current[selectedStickerId] : null;
      trRef.current.nodes(node ? [node] : []);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selectedStickerId, stickers]);

  /* Freehand doodles. The draft stroke lives here so the line follows the
     pointer without a React round-trip per sample; it's handed up on release. */
  const [draft, setDraft] = useState<Stroke | null>(null);
  const drawing = useRef(false);
  const painting = tool !== "select";

  function canvasPoint() {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const inv = stage.getAbsoluteTransform().copy().invert();
    const p = inv.point(pos);
    return [p.x, p.y];
  }

  function startStroke() {
    const p = canvasPoint();
    if (!p) return;
    drawing.current = true;
    setDraft({ points: p, color: brush.color, size: brush.size, erase: tool === "eraser" });
  }
  function extendStroke() {
    if (!drawing.current) return;
    const p = canvasPoint();
    if (!p) return;
    setDraft((d) => (d ? { ...d, points: [...d.points, ...p] } : d));
  }
  function endStroke() {
    if (!drawing.current) return;
    drawing.current = false;
    setDraft((d) => {
      if (d && d.points.length >= 2) onAddStroke(d);
      return null;
    });
  }

  const slotBg = isHH ? "#0c0c0c" : "#0a4a2c";
  const activeStroke = isHH ? "#f4d913" : "#f4d913";
  const SHOW_DEBUG_BOX = false;

  return (
    <Stage
      ref={stageRef}
      width={stageW}
      height={stageH}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (painting) return startStroke();
        if (isOffSticker(e)) onSelectSticker(null);
      }}
      onTouchStart={(e) => {
        if (painting) {
          e.evt.preventDefault();
          return startStroke();
        }
        if (isOffSticker(e)) onSelectSticker(null);
      }}
      onMouseMove={extendStroke}
      onTouchMove={(e) => {
        if (painting) e.evt.preventDefault();
        extendStroke();
      }}
      onMouseUp={endStroke}
      onTouchEnd={endStroke}
      onMouseLeave={endStroke}
    >
      {/* Background / Frame chrome */}
      {isHH ? (
        <>
          <Layer listening={false}>
            {/* Always painted: the frame art is transparent around the board, and
                a transparent PNG posted to X renders on whatever the client
                picks — usually black. */}
            <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#f6f0de" />
            {frameImage && (
              <KonvaImage image={frameImage} x={0} y={0} width={CANVAS_W} height={CANVAS_H} />
            )}
          </Layer>

          {/* White picture frame — only around the INNER photo rectangle */}
          <Layer listening={false}>
            {/* Outer shadow of the frame */}
            <Rect
              x={0.2149 * CANVAS_W}
              y={0.2052 * CANVAS_H}
              width={0.5749 * CANVAS_W}
              height={0.5566 * CANVAS_H}
              cornerRadius={Math.min(CANVAS_W, CANVAS_H) * 0.015}
              fill="#000000"
              opacity={0.18}
              listening={false}
            />
            {/* Outer cream frame border (like a real mat/frame) */}
            <Rect
              x={0.2237 * CANVAS_W}
              y={0.2120 * CANVAS_H}
              width={0.5574 * CANVAS_W}
              height={0.5429 * CANVAS_H}
              cornerRadius={Math.min(CANVAS_W, CANVAS_H) * 0.011}
              fill="#f6f0de"
              stroke="#e8dfc4"
              strokeWidth={4}
              listening={false}
            />
            {/* Inner white bevel */}
            <Rect
              x={0.2281 * CANVAS_W}
              y={0.2166 * CANVAS_H}
              width={0.5486 * CANVAS_W}
              height={0.5337 * CANVAS_H}
              cornerRadius={Math.min(CANVAS_W, CANVAS_H) * 0.008}
              stroke="#ffffff"
              strokeWidth={2}
              opacity={0.9}
              listening={false}
            />
          </Layer>

          {/* Debug boxes (updated to correct coordinates) */}
          {SHOW_DEBUG_BOX && (
            <Layer listening={false}>
              {/* Red: outer picture frame boundary */}
              <Rect
                x={0.2237 * CANVAS_W}
                y={0.2120 * CANVAS_H}
                width={0.5574 * CANVAS_W}
                height={0.5429 * CANVAS_H}
                stroke="#ff1744"
                strokeWidth={3}
                dash={[10, 8]}
                listening={false}
              />
              {/* Cyan: safe inner photo slot */}
              <Rect
                x={0.2310 * CANVAS_W}
                y={0.2200 * CANVAS_H}
                width={0.5427 * CANVAS_W}
                height={0.5280 * CANVAS_H}
                stroke="#00e5ff"
                strokeWidth={2}
                dash={[6, 6]}
                listening={false}
              />
            </Layer>
          )}
        </>
      ) : (
        <Layer listening={false}>
          <Rect x={0} y={0} width={CANVAS_SIZE} height={CANVAS_SIZE} fill="#0b5c39" />
        </Layer>
      )}

      {/* Photo slots */}
      <Layer>
        {slots.map((slot, i) => {
          const px = slot.x * CANVAS_W;
          const py = slot.y * CANVAS_H;
          const pw = slot.w * CANVAS_W;
          const ph = slot.h * CANVAS_H;
          const photo = photos[i];
          /* The image is cover-fit (scale >= baseScale), so it always covers the
             slot — clamping the corner to [slot - overflow, 0] is what stops a
             drag or a zoom change from opening a black gap at the edge. */
          const drawW = (photo?.image?.width ?? 0) * (photo?.scale ?? 1);
          const drawH = (photo?.image?.height ?? 0) * (photo?.scale ?? 1);
          const centeredX = pw / 2 - drawW / 2;
          const centeredY = ph / 2 - drawH / 2;
          const photoX = clamp(centeredX + (photo?.offsetX ?? 0), Math.min(pw - drawW, 0), 0);
          const photoY = clamp(centeredY + (photo?.offsetY ?? 0), Math.min(ph - drawH, 0), 0);
          return (
            <Group
              key={i}
              x={px}
              y={py}
              clipFunc={(ctx) => clipForShape(ctx as unknown as Konva.Context, pw, ph, slot.shape)}
              onClick={() => onSlotSelect?.(i, !photo?.image)}
              onTap={() => onSlotSelect?.(i, !photo?.image)}
            >
              <Rect width={pw} height={ph} fill={slotBg} />
              {photo?.image && (
                <KonvaImage
                  image={photo.image}
                  width={drawW}
                  height={drawH}
                  x={photoX}
                  y={photoY}
                  draggable={!painting}
                  onDragMove={(e) => {
                    const node = e.target;
                    node.x(clamp(node.x(), Math.min(pw - drawW, 0), 0));
                    node.y(clamp(node.y(), Math.min(ph - drawH, 0), 0));
                    onPhotoDrag(i, node.x() - centeredX, node.y() - centeredY);
                  }}
                />
              )}
              {!photo?.image && (
                <>
                  <Text
                    text={`+`}
                    width={pw}
                    height={ph}
                    align="center"
                    verticalAlign="middle"
                    offsetY={Math.min(pw, ph) * 0.07}
                    fontFamily="var(--font-mono)"
                    fontSize={Math.min(pw, ph) * 0.16}
                    fill="#f4d913aa"
                    listening={false}
                  />
                  <Text
                    text={`ADD PHOTO ${i + 1}`}
                    width={pw}
                    height={ph}
                    align="center"
                    verticalAlign="middle"
                    offsetY={-Math.min(pw, ph) * 0.06}
                    fontFamily="var(--font-mono)"
                    fontStyle="bold"
                    fontSize={Math.min(pw, ph) * 0.055}
                    letterSpacing={Math.min(pw, ph) * 0.006}
                    fill="#f4d913aa"
                    listening={false}
                  />
                </>
              )}
              {activeSlot === i && (
                <Rect width={pw} height={ph} stroke={activeStroke} strokeWidth={4} listening={false} />
              )}
            </Group>
          );
        })}
      </Layer>

      {/* Classic frame chrome (only for "classic" theme) */}
      {!isHH && (
        <Layer listening={false}>
          <Rect
            x={18}
            y={18}
            width={CANVAS_SIZE - 36}
            height={CANVAS_SIZE - 36}
            cornerRadius={22}
            stroke="#f6f0de"
            strokeWidth={6}
          />
          <Rect
            x={26}
            y={26}
            width={CANVAS_SIZE - 52}
            height={CANVAS_SIZE - 52}
            cornerRadius={16}
            stroke="#ec1876"
            strokeWidth={2}
          />
          <Circle x={40} y={40} radius={46} fill="#f4d913" opacity={0.9} />
          <Circle x={40} y={40} radius={46} stroke="#0b5c39" strokeWidth={2} />

          <Group x={CANVAS_SIZE - 226} y={34}>
            <Rect
              width={192}
              height={58}
              cornerRadius={29}
              fill="#f6f0de"
              stroke="#f4d913"
              strokeWidth={2}
            />
            {logoImage && (
              <KonvaImage
                image={logoImage}
                x={12}
                y={6}
                width={46}
                height={46 * (logoImage.height / logoImage.width)}
              />
            )}
            <Rect x={68} y={13} width={2} height={30} fill="#0b5c3933" />
            <Rect x={140} y={12} width={36} height={20} cornerRadius={10} fill="#ec1876" />
            <Text
              text="'26"
              x={140}
              y={16}
              width={36}
              align="center"
              fontFamily="var(--font-mono)"
              fontStyle="bold"
              fontSize={12}
              fill="#f6f0de"
            />
            <Text
              text="2:47 PM STUDIO"
              x={12}
              y={44}
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="#0b5c3999"
            />
          </Group>

          <Rect
            x={30}
            y={CANVAS_SIZE * 0.805}
            width={CANVAS_SIZE - 60}
            height={CANVAS_SIZE * 0.135}
            cornerRadius={14}
            fill="#f6f0de"
          />
          <Text
            text={team.names.filter(Boolean).join("  ×  ") || "YOUR TEAM"}
            x={50}
            y={CANVAS_SIZE * 0.805 + 14}
            width={CANVAS_SIZE - 100}
            fontFamily="var(--font-display)"
            fontStyle="700"
            fontSize={26}
            fill="#0b5c39"
            ellipsis
            wrap="none"
          />
          <Text
            text={team.builderClass || "GOA, INDIA · 28–31 OCT 2026"}
            x={50}
            y={CANVAS_SIZE * 0.805 + 50}
            width={CANVAS_SIZE - 100}
            fontFamily="var(--font-mono)"
            fontSize={15}
            fill="#ec1876"
            fontStyle="bold"
            ellipsis
            wrap="none"
          />
          <Text
            text="#FrameInGoa"
            x={50}
            y={CANVAS_SIZE * 0.805 + 78}
            fontFamily="var(--font-mono)"
            fontSize={13}
            fill="#0b5c39aa"
          />
        </Layer>
      )}

      {/* Doodles. Its own layer so the eraser's destination-out only cuts
          strokes, never the frame or the photo underneath. */}
      <Layer listening={false}>
        {[...strokes, ...(draft ? [draft] : [])].map((l, i) => (
          <Line
            key={i}
            points={l.points}
            stroke={l.color}
            strokeWidth={l.size}
            tension={0.35}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation={l.erase ? "destination-out" : "source-over"}
          />
        ))}
      </Layer>

      {/* Stickers */}
      <Layer listening={!painting}>
        {stickers.map((s) => (
          <Group
            key={s.id}
            id={s.id}
            name="sticker"
            x={s.x}
            y={s.y}
            scaleX={s.scale}
            scaleY={s.scale}
            rotation={s.rotation}
            draggable={!painting}
            ref={(node) => {
              stickerNodeRefs.current[s.id] = node;
            }}
            onClick={() => onSelectSticker(s.id)}
            onTap={() => onSelectSticker(s.id)}
            onDragEnd={(e) => onStickerUpdate(s.id, { x: e.target.x(), y: e.target.y() })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Group;
              onStickerUpdate(s.id, {
                x: node.x(),
                y: node.y(),
                scale: node.scaleX(),
                rotation: node.rotation(),
              });
            }}
          >
            {s.imgEl ? (
              <KonvaImage
                image={s.imgEl}
                width={s.imgEl.width}
                height={s.imgEl.height}
                offsetX={s.imgEl.width / 2}
                offsetY={s.imgEl.height / 2}
              />
            ) : (
              <StickerArt kind={s.kind} />
            )}
          </Group>
        ))}
        <StickerTransformer trRef={trRef} scale={scale} canvasWidth={CANVAS_W} />
      </Layer>
    </Stage>
  );
}
