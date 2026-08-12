"use client";

import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Arc, Circle, Image as KonvaImage, Text } from "react-konva";
import Konva from "konva";
import StickerTransformer from "./StickerTransformer";

/* Lanyard badge, transcribed from the Claude Design "Builder ID Card" comp.
   The comp is authored at 420px wide on a 30px page margin, so every number
   below is its own px value passed through u() — that keeps this file diffable
   against the design instead of a pile of pre-multiplied constants. */
const DESIGN_W = 480; // 420 card + 30 margin each side
const DESIGN_H = 770;

export const CARD_W = 1080;
export const CARD_H = Math.round((CARD_W * DESIGN_H) / DESIGN_W);

const U = CARD_W / DESIGN_W;
const u = (n: number) => n * U;

const GREEN = "#0b5c39";
const GREEN_DARK = "#073d26";
const YELLOW = "#f4d913";
const PINK = "#ec1876";
const CREAM = "#f6f0de";
const INK = "#0a2a1c";

/* Card box, design px. */
const CARD = { x: 30, y: 30, w: 420, h: 710 };
/* Header centres inside its padding box (26 left / 100 right), which is what
   keeps it clear of the VERIFIED stamp. */
const HEAD_CX = CARD.x + 26 + (CARD.w - 26 - 100) / 2;

const PANEL = { x: CARD.x + 22, y: CARD.y + 100, w: 376, h: 526 };
const PHOTO_BOX = { x: CARD.x + 36, y: CARD.y + 114, size: 348 };
const PHOTO_BORDER = 5;

/* Konva centres a stroke on its path, so insetting by the full border width
   leaves a sliver of the dark fill showing inside the yellow frame. */
const PHOTO_INSET = PHOTO_BORDER / 2;
export const SLOT = {
  x: u(PHOTO_BOX.x + PHOTO_INSET),
  y: u(PHOTO_BOX.y + PHOTO_INSET),
  w: u(PHOTO_BOX.size - PHOTO_INSET * 2),
  h: u(PHOTO_BOX.size - PHOTO_INSET * 2),
};
/** The photo window is square, so this is the ratio the cropper enforces. */
export const PHOTO_ASPECT = 1;

/* Stickers land in the middle of the photo. */
export const DROP_X = SLOT.x + SLOT.w / 2;
export const DROP_Y = SLOT.y + SLOT.h / 2;

const NAME_Y = CARD.y + 476;
const PILL_Y = CARD.y + 519;
const PILL_H = 33;
const BOX_Y = CARD.y + 566;
const BOX_H = 42;
const PERF_Y = CARD.y + 644;
const FOOT_Y = CARD.y + 658;

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
  building: string;
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

/* Deselect when the tap misses every sticker. Testing `e.target === stage`
   doesn't work: the card paints a full-bleed background, so the stage itself is
   never the event target and the selection could never be cleared. Transformer
   anchors are excluded or grabbing a handle would deselect. */
function isOffSticker(e: Konva.KonvaEventObject<unknown>) {
  const t = e.target;
  return !t.findAncestor(".sticker", true) && !t.findAncestor("Transformer", true);
}

export default function IdCardCanvas({
  photo,
  name,
  role,
  building,
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

  /* Cover-fit the photo into the square window, then apply the user's zoom. */
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

  const displayName = name.trim() || "Your Name";
  const nameSize = displayName.length > 20 ? 22 : displayName.length > 14 ? 27 : 32;
  const pillText = title.toUpperCase();
  const pillSize = pillText.length > 26 ? 9 : 11;

  /* The pink pill hugs its label. */
  const pill = useMemo(() => {
    const w = measureText(pillText, `700 ${u(pillSize)}px ${fonts.mono}`) + u(36);
    return { w, x: CARD_W / 2 - w / 2 };
    // fonts.ready re-measures once the real faces are available.
  }, [pillText, pillSize, fonts.mono, fonts.ready]);

  const boxW = (PANEL.w - 28 - 8) / 2; // panel padding 14 each side, 8px gap

  const infoBox = (key: string, x: number, label: string, value: string) => (
    <Group key={key} listening={false}>
      <Rect
        x={u(x)}
        y={u(BOX_Y)}
        width={u(boxW)}
        height={u(BOX_H)}
        cornerRadius={u(10)}
        fill="#0b5c390d"
        stroke="#0b5c3955"
        strokeWidth={u(1.5)}
        dash={[u(5), u(4)]}
      />
      <Text
        text={label}
        x={u(x)}
        y={u(BOX_Y + 8)}
        width={u(boxW)}
        align="center"
        fontFamily={fonts.mono}
        fontStyle="700"
        fontSize={u(8)}
        letterSpacing={u(0.8)}
        fill="#0b5c3990"
      />
      <Text
        text={value}
        x={u(x + 6)}
        y={u(BOX_Y + 21)}
        width={u(boxW - 12)}
        align="center"
        wrap="none"
        ellipsis
        fontFamily={fonts.mono}
        fontStyle="700"
        fontSize={u(11.5)}
        fill={GREEN_DARK}
      />
    </Group>
  );

  return (
    <Stage
      ref={stageRef}
      width={stageW}
      height={stageH}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (isOffSticker(e)) onSelectSticker(null);
      }}
      onTouchStart={(e) => {
        if (isOffSticker(e)) onSelectSticker(null);
      }}
    >
      <Layer>
        {/* Page behind the badge — also what the torn ticket edges are cut from */}
        <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={GREEN_DARK} listening={false} />

        {/* Card body, clipped so the sun rays and torn edges stay inside it */}
        <Group
          clipFunc={(ctx) =>
            roundRectPath(ctx as unknown as Konva.Context, u(CARD.x), u(CARD.y), u(CARD.w), u(CARD.h), u(26))
          }
        >
          <Rect x={u(CARD.x)} y={u(CARD.y)} width={u(CARD.w)} height={u(CARD.h)} fill={GREEN} listening={false} />

          {Array.from({ length: 15 }).map((_, i) => (
            <Arc
              key={i}
              x={CARD_W / 2}
              y={u(CARD.y + 60)}
              innerRadius={u(52)}
              outerRadius={u(130)}
              angle={6}
              rotation={i * 24}
              fill={YELLOW}
              opacity={0.32}
              listening={false}
            />
          ))}

          <Text
            text="BUILDER ID · 2026"
            x={u(HEAD_CX - 150)}
            y={u(CARD.y + 24)}
            width={u(300)}
            align="center"
            fontFamily={fonts.mono}
            fontStyle="700"
            fontSize={u(10)}
            letterSpacing={u(2.2)}
            fill={YELLOW}
            listening={false}
          />
          <Text
            text="HH GOA"
            x={u(HEAD_CX - 150)}
            y={u(CARD.y + 42)}
            width={u(300)}
            align="center"
            fontFamily={fonts.display}
            fontStyle="900"
            fontSize={u(26)}
            fill="#ffffff"
            shadowColor={GREEN_DARK}
            shadowOffsetY={u(3)}
            shadowBlur={0}
            listening={false}
          />
          <Text
            text="GOA, INDIA · 28–31 OCT 2026"
            x={u(HEAD_CX - 150)}
            y={u(CARD.y + 76)}
            width={u(300)}
            align="center"
            fontFamily={fonts.mono}
            fontSize={u(10)}
            letterSpacing={u(1)}
            fill="#f6f0decc"
            listening={false}
          />

          {/* VERIFIED BUILDER stamp */}
          <Group x={u(CARD.x + CARD.w - 14 - 29)} y={u(CARD.y + 16 + 29)} rotation={-14} listening={false}>
            <Circle radius={u(29)} stroke={YELLOW} strokeWidth={u(2.5)} dash={[u(7), u(5)]} />
            <Text
              text={"VERIFIED\nBUILDER\n★"}
              x={u(-29)}
              y={u(-14)}
              width={u(58)}
              align="center"
              lineHeight={1.3}
              fontFamily={fonts.mono}
              fontStyle="700"
              fontSize={u(7)}
              letterSpacing={u(0.4)}
              fill={YELLOW}
            />
          </Group>

          {/* Cream photo panel */}
          <Rect
            x={u(PANEL.x)}
            y={u(PANEL.y)}
            width={u(PANEL.w)}
            height={u(PANEL.h)}
            cornerRadius={u(18)}
            fill={CREAM}
            shadowColor="#000000"
            shadowOpacity={0.3}
            shadowBlur={u(28)}
            shadowOffsetY={u(14)}
            listening={false}
          />

          {/* Photo window */}
          <Rect
            x={u(PHOTO_BOX.x)}
            y={u(PHOTO_BOX.y)}
            width={u(PHOTO_BOX.size)}
            height={u(PHOTO_BOX.size)}
            cornerRadius={u(12)}
            fill={GREEN_DARK}
            stroke={YELLOW}
            strokeWidth={u(PHOTO_BORDER)}
            listening={false}
          />
          <Group
            clipFunc={(ctx) =>
              roundRectPath(ctx as unknown as Konva.Context, SLOT.x, SLOT.y, SLOT.w, SLOT.h, u(8))
            }
          >
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
              y={SLOT.y + SLOT.h / 2 - u(8)}
              width={SLOT.w}
              align="center"
              fontFamily={fonts.mono}
              fontStyle="700"
              fontSize={u(13)}
              letterSpacing={u(1.5)}
              fill={CREAM}
              opacity={0.55}
              listening={false}
            />
          )}

          <Text
            text={displayName}
            x={u(PANEL.x + 8)}
            y={u(NAME_Y)}
            width={u(PANEL.w - 16)}
            align="center"
            wrap="none"
            ellipsis
            fontFamily={fonts.display}
            fontStyle="900"
            fontSize={u(nameSize)}
            fill={GREEN_DARK}
            listening={false}
          />

          {/* Builder title pill */}
          <Rect
            x={pill.x}
            y={u(PILL_Y)}
            width={pill.w}
            height={u(PILL_H)}
            cornerRadius={u(PILL_H / 2)}
            fill={PINK}
            stroke={INK}
            strokeWidth={u(2)}
            listening={false}
          />
          <Text
            text={pillText}
            x={pill.x}
            y={u(PILL_Y) + (u(PILL_H) - u(pillSize) * 1.25) / 2}
            width={pill.w}
            align="center"
            wrap="none"
            ellipsis
            fontFamily={fonts.mono}
            fontStyle="700"
            fontSize={u(pillSize)}
            letterSpacing={u(0.4)}
            fill={CREAM}
            listening={false}
          />

          {infoBox("stack", PANEL.x + 14, "STACK", role.trim() || "Your stack")}
          {infoBox("building", PANEL.x + 14 + boxW + 8, "BUILDING", building.trim() || "Your project")}

          {/* Ticket perforation */}
          <Rect x={u(CARD.x)} y={u(PERF_Y)} width={u(CARD.w)} height={u(2)} fill="#f6f0de55" listening={false} />
          <Circle x={u(CARD.x)} y={u(PERF_Y)} radius={u(14)} fill={GREEN_DARK} listening={false} />
          <Circle x={u(CARD.x + CARD.w)} y={u(PERF_Y)} radius={u(14)} fill={GREEN_DARK} listening={false} />

          {/* Footer */}
          <Text
            text="BADGE ID"
            x={u(CARD.x + 26)}
            y={u(FOOT_Y)}
            fontFamily={fonts.mono}
            fontStyle="700"
            fontSize={u(8)}
            letterSpacing={u(1)}
            fill="#f6f0de80"
            listening={false}
          />
          <Text
            text={code}
            x={u(CARD.x + 26)}
            y={u(FOOT_Y + 13)}
            fontFamily={fonts.mono}
            fontStyle="700"
            fontSize={u(13)}
            letterSpacing={u(0.4)}
            fill={YELLOW}
            listening={false}
          />
          <Text
            text="#FrameInGoa 🌴"
            x={u(CARD.x)}
            y={u(FOOT_Y + 9)}
            width={u(CARD.w - 26)}
            align="right"
            fontFamily={fonts.mono}
            fontStyle="700"
            fontSize={u(13)}
            fill={CREAM}
            listening={false}
          />

          {/* Palm silhouettes */}
          <Text
            text="🌴"
            x={u(CARD.x - 4)}
            y={u(CARD.y + CARD.h - 38)}
            fontSize={u(44)}
            opacity={0.14}
            rotation={-8}
            listening={false}
          />
          <Text
            text="🌴"
            x={u(CARD.x + CARD.w - 42)}
            y={u(CARD.y + CARD.h - 36)}
            fontSize={u(38)}
            opacity={0.12}
            rotation={10}
            listening={false}
          />
        </Group>

        {/* Outline drawn after the clip so the stroke isn't half cut off */}
        <Rect
          x={u(CARD.x)}
          y={u(CARD.y)}
          width={u(CARD.w)}
          height={u(CARD.h)}
          cornerRadius={u(26)}
          stroke={GREEN_DARK}
          strokeWidth={u(3)}
          listening={false}
        />

        {/* Lanyard hole */}
        <Circle
          x={CARD_W / 2}
          y={u(CARD.y - 1)}
          radius={u(15)}
          fill={GREEN_DARK}
          stroke={GREEN}
          strokeWidth={u(5)}
          listening={false}
        />
      </Layer>

      {/* Stickers ride above the card so they can overlap the artwork */}
      <Layer>
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
        <StickerTransformer trRef={trRef} scale={scale} canvasWidth={CARD_W} />
      </Layer>
    </Stage>
  );
}
