"use client";

import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Image as KonvaImage, Text, Transformer } from "react-konva";
import Konva from "konva";

/* The card is the Goa frame artwork with an ID strip underneath. The frame PNG
   is 2048x1152 with a transparent surround (art sits at x 338-1726, y 74-1074),
   so it drops straight onto the brand green and the strip below reads as part
   of the same composition. */
export const FRAME_W = 2048;
export const FRAME_H = 1152;
export const CARD_W = 2048;
export const CARD_H = 1440;

/** Left/right edges of the artwork, so the ID strip lines up with the board. */
const ART_L = 338;
const ART_R = 1726;

const GREEN = "#0b5c39";
const YELLOW = "#f4d913";
const PINK = "#ec1876";
const CREAM = "#f6f0de";
const INK = "#0a2a1c";

/* Photo window ratios, identical to the memories frame in EditorCanvas so both
   formats sit the photo in exactly the same place. */
const MAT = { x: 0.317 * FRAME_W, y: 0.248 * FRAME_H, w: 0.381 * FRAME_W, h: 0.475 * FRAME_H };
const BEVEL = { x: 0.32 * FRAME_W, y: 0.252 * FRAME_H, w: 0.375 * FRAME_W, h: 0.467 * FRAME_H };
const SLOT = { x: 0.322 * FRAME_W, y: 0.255 * FRAME_H, w: 0.371 * FRAME_W, h: 0.462 * FRAME_H };

/* ID strip. The frame art carries its own drop shadow and was drawn for a
   light background, so the card sits on cream and the details go on a green
   band — on a green card the artwork's board blends into the backdrop. */
const BAND_Y = 1120;
const EYEBROW_Y = 1150;
const NAME_Y = 1196;
const ROLE_Y = 1320;
const BOARD_Y = 1200;
const BOARD_H = 96;

export type IdPhoto = {
  image: HTMLImageElement | null;
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type IdSticker = {
  id: string;
  src: string;
  imgEl: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type Props = {
  photo: IdPhoto;
  name: string;
  role: string;
  title: string;
  code: string;
  displayWidth: number;
  onPhotoDrag: (offsetX: number, offsetY: number) => void;
  stickers: IdSticker[];
  selectedStickerId: string | null;
  onSelectSticker: (id: string | null) => void;
  onStickerUpdate: (id: string, partial: Partial<IdSticker>) => void;
  /* Passed as a prop rather than via forwardRef: this component is loaded with
     next/dynamic, which does not forward refs — a real ref would silently stay
     null and every export would come back empty. */
  cardRef?: React.Ref<IdCardHandle>;
};

export type IdCardHandle = {
  exportPNG: (targetWidth?: number) => string;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function roundRectPath(ctx: Konva.Context, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** next/font exposes generated family names via CSS variables; Konva needs the
    resolved string, not a var() reference. */
function useBrandFonts() {
  const [fonts, setFonts] = useState({
    display: "Georgia, serif",
    mono: "ui-monospace, monospace",
    ready: false,
  });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const display = cs.getPropertyValue("--font-display").trim();
    const mono = cs.getPropertyValue("--font-mono").trim();
    const resolved = {
      display: display ? `${display}, Georgia, serif` : "Georgia, serif",
      mono: mono ? `${mono}, ui-monospace, monospace` : "ui-monospace, monospace",
    };
    setFonts({ ...resolved, ready: false });
    // Repaint once webfonts load, otherwise the first frame — and an immediate
    // export — measures with fallback metrics.
    document.fonts?.ready.then(() => setFonts({ ...resolved, ready: true }));
  }, []);
  return fonts;
}

function measureText(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 20;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 20;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export default function IdCardCanvas({
  photo,
  name,
  role,
  title,
  code,
  displayWidth,
  onPhotoDrag,
  stickers,
  selectedStickerId,
  onSelectSticker,
  onStickerUpdate,
  cardRef,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const stickerNodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const fonts = useBrandFonts();
  const [frame, setFrame] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setFrame(img);
    img.src = "/hh-memories-frame.png";
  }, []);

  const scale = displayWidth / CARD_W;
  const stageW = CARD_W * scale;
  const stageH = CARD_H * scale;

  /* Keep the transformer bound to whichever sticker is selected. */
  useEffect(() => {
    if (!trRef.current) return;
    const node = selectedStickerId ? stickerNodeRefs.current[selectedStickerId] : null;
    trRef.current.nodes(node ? [node] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedStickerId, stickers]);

  useImperativeHandle(cardRef, () => ({
    exportPNG: (targetWidth = CARD_W) => {
      const stage = stageRef.current;
      if (!stage) return "";
      // Drop the selection handles so they don't bake into the export.
      trRef.current?.nodes([]);
      const url = stage.toDataURL({ pixelRatio: targetWidth / stageW, mimeType: "image/png" });
      const node = selectedStickerId ? stickerNodeRefs.current[selectedStickerId] : null;
      if (node) trRef.current?.nodes([node]);
      return url;
    },
  }));

  /* Cover-fit the photo into the window, then apply the user's zoom. */
  const fit = useMemo(() => {
    const img = photo.image;
    if (!img) return null;
    const base = Math.max(SLOT.w / img.width, SLOT.h / img.height);
    const drawScale = base * photo.zoom;
    const drawW = img.width * drawScale;
    const drawH = img.height * drawScale;
    return {
      drawW,
      drawH,
      minX: SLOT.x + SLOT.w - drawW,
      maxX: SLOT.x,
      minY: SLOT.y + SLOT.h - drawH,
      maxY: SLOT.y,
    };
  }, [photo.image, photo.zoom]);

  /* Clamped every render so a zoom change can't open a gap at the edges. */
  const photoPos = fit
    ? {
        x: clamp(SLOT.x + photo.offsetX, fit.minX, fit.maxX),
        y: clamp(SLOT.y + photo.offsetY, fit.minY, fit.maxY),
      }
    : { x: SLOT.x, y: SLOT.y };

  const displayName = (name.trim() || "YOUR NAME").toUpperCase();
  const nameSize = displayName.length > 22 ? 64 : displayName.length > 16 ? 78 : 96;
  const titleSize = title.length > 22 ? 36 : 44;

  /* Pink board hugs the title, right-aligned to the artwork edge. */
  const board = useMemo(() => {
    const width = measureText(title, `bold ${titleSize}px ${fonts.mono}`) + 64;
    return { width, x: ART_R - width };
    // fonts.ready re-measures once the real faces are available.
  }, [title, titleSize, fonts.mono, fonts.ready]);

  return (
    <Stage
      ref={stageRef}
      width={stageW}
      height={stageH}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelectSticker(null);
      }}
      onTouchStart={(e) => {
        if (e.target === e.target.getStage()) onSelectSticker(null);
      }}
    >
      <Layer>
        {/* Page */}
        <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={CREAM} />
        <Rect x={0} y={0} width={CARD_W} height={14} fill={GREEN} />
        <Rect x={0} y={BAND_Y} width={CARD_W} height={CARD_H - BAND_Y} fill={GREEN} />
        <Rect x={0} y={BAND_Y} width={CARD_W} height={10} fill={YELLOW} />

        {/* Photo, matted into the frame's window before the frame goes on top */}
        <Rect
          x={MAT.x}
          y={MAT.y}
          width={MAT.w}
          height={MAT.h}
          cornerRadius={18}
          fill={CREAM}
          stroke="#e8dfc4"
          strokeWidth={4}
        />
        <Rect x={BEVEL.x} y={BEVEL.y} width={BEVEL.w} height={BEVEL.h} cornerRadius={14} fill="#ffffff" />
        <Rect x={SLOT.x} y={SLOT.y} width={SLOT.w} height={SLOT.h} cornerRadius={10} fill="#0c0c0c" />
        <Group clipFunc={(ctx) => roundRectPath(ctx, SLOT.x, SLOT.y, SLOT.w, SLOT.h, 10)}>
          {photo.image && fit && (
            <KonvaImage
              image={photo.image}
              x={photoPos.x}
              y={photoPos.y}
              width={fit.drawW}
              height={fit.drawH}
              draggable
              onDragMove={(e) => {
                const node = e.target;
                node.x(clamp(node.x(), fit.minX, fit.maxX));
                node.y(clamp(node.y(), fit.minY, fit.maxY));
                onPhotoDrag(node.x() - SLOT.x, node.y() - SLOT.y);
              }}
            />
          )}
        </Group>
        {!photo.image && (
          <Text
            text="YOUR PHOTO"
            x={SLOT.x}
            y={SLOT.y + SLOT.h / 2 - 20}
            width={SLOT.w}
            align="center"
            fontFamily={fonts.mono}
            fontSize={40}
            fill={CREAM}
            opacity={0.5}
          />
        )}

        {/* The Goa frame itself, sitting over the photo edges */}
        {frame && <KonvaImage image={frame} x={0} y={0} width={FRAME_W} height={FRAME_H} listening={false} />}

        {/* ID strip */}
        <Text
          text="BUILDER ID · GOA, INDIA · 28–31 OCT 2026"
          x={ART_L}
          y={EYEBROW_Y}
          fontFamily={fonts.mono}
          fontStyle="bold"
          fontSize={32}
          fill={CREAM}
          opacity={0.75}
        />
        <Text
          text={displayName}
          x={ART_L}
          y={NAME_Y}
          width={board.x - ART_L - 40}
          wrap="none"
          ellipsis
          fontFamily={fonts.display}
          fontStyle="900"
          fontSize={nameSize}
          fill={YELLOW}
        />
        <Text
          text={(role.trim() || "STACK / ROLE").toUpperCase()}
          x={ART_L}
          y={ROLE_Y}
          width={board.x - ART_L - 40}
          wrap="none"
          ellipsis
          fontFamily={fonts.mono}
          fontStyle="bold"
          fontSize={38}
          fill={CREAM}
          opacity={0.85}
        />

        {/* Builder title board */}
        <Rect
          x={board.x}
          y={BOARD_Y}
          width={board.width}
          height={BOARD_H}
          cornerRadius={10}
          fill={PINK}
          stroke={INK}
          strokeWidth={7}
        />
        <Text
          text={title}
          x={board.x}
          y={BOARD_Y + (BOARD_H - titleSize * 1.2) / 2}
          width={board.width}
          align="center"
          wrap="none"
          ellipsis
          fontFamily={fonts.mono}
          fontStyle="bold"
          fontSize={titleSize}
          fill={CREAM}
        />
        <Text
          text={`${code} · #FrameInGoa`}
          x={ART_L}
          y={ROLE_Y}
          width={ART_R - ART_L}
          align="right"
          fontFamily={fonts.mono}
          fontStyle="bold"
          fontSize={34}
          fill={YELLOW}
        />
      </Layer>

      {/* Stickers ride above the frame so they can overlap the artwork */}
      <Layer>
        {stickers.map((s) => (
          <Group
            key={s.id}
            id={s.id}
            x={s.x}
            y={s.y}
            scaleX={s.scale}
            scaleY={s.scale}
            rotation={s.rotation}
            draggable
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
            <KonvaImage
              image={s.imgEl}
              width={s.imgEl.width}
              height={s.imgEl.height}
              offsetX={s.imgEl.width / 2}
              offsetY={s.imgEl.height / 2}
            />
          </Group>
        ))}
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke={YELLOW}
          anchorStroke={YELLOW}
          anchorFill={GREEN}
        />
      </Layer>
    </Stage>
  );
}
