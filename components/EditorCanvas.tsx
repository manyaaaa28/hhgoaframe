"use client";

import React, { useImperativeHandle, useRef, useEffect, useState } from "react";
import { Stage, Layer, Group, Rect, Image as KonvaImage, Text, Circle, Transformer } from "react-konva";
import Konva from "konva";
import { CANVAS_SIZE, Slot, FrameTheme } from "@/lib/layouts";
import { StickerArt, StickerKind } from "@/lib/stickers";

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

export type TeamInfo = {
  names: string[];
  builderClass: string;
};

type Props = {
  slots: Slot[];
  photos: PhotoState[];
  onPhotoDrag: (index: number, offsetX: number, offsetY: number) => void;
  activeSlot: number | null;
  stickers: StickerInstance[];
  onStickerUpdate: (id: string, partial: Partial<StickerInstance>) => void;
  selectedStickerId: string | null;
  onSelectSticker: (id: string | null) => void;
  team: TeamInfo;
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

export default function EditorCanvas({
  slots,
  photos,
  onPhotoDrag,
  activeSlot,
  stickers,
  onStickerUpdate,
  selectedStickerId,
  onSelectSticker,
  team,
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
    frame.src = "/hh-memories-frame.png";
  }, []);

  useImperativeHandle(canvasRef, () => ({
    exportPNG: (targetWidth = isHH ? 2048 : 1600) => {
      const stage = stageRef.current;
      if (!stage) return "";
      trRef.current?.nodes([]);
      const pixelRatio = targetWidth / stageW;
      const url = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
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
        if (e.target === e.target.getStage()) onSelectSticker(null);
      }}
      onTouchStart={(e) => {
        if (e.target === e.target.getStage()) onSelectSticker(null);
      }}
    >
      {/* Background / Frame chrome */}
      {isHH ? (
        <>
          <Layer listening={false}>
            {frameImage && (
              <KonvaImage
                image={frameImage}
                x={0}
                y={0}
                width={CANVAS_W}
                height={CANVAS_H}
              />
            )}
            {!frameImage && (
              <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#0b5c39" />
            )}
          </Layer>

          {/* White picture frame — only around the INNER photo rectangle */}
          <Layer listening={false}>
            {/* Outer shadow of the frame */}
            <Rect
              x={0.311 * CANVAS_W}
              y={0.242 * CANVAS_H}
              width={0.393 * CANVAS_W}
              height={0.487 * CANVAS_H}
              cornerRadius={Math.min(CANVAS_W, CANVAS_H) * 0.015}
              fill="#000000"
              opacity={0.18}
              listening={false}
            />
            {/* Outer cream frame border (like a real mat/frame) */}
            <Rect
              x={0.317 * CANVAS_W}
              y={0.248 * CANVAS_H}
              width={0.381 * CANVAS_W}
              height={0.475 * CANVAS_H}
              cornerRadius={Math.min(CANVAS_W, CANVAS_H) * 0.011}
              fill="#f6f0de"
              stroke="#e8dfc4"
              strokeWidth={4}
              listening={false}
            />
            {/* Inner white bevel */}
            <Rect
              x={0.320 * CANVAS_W}
              y={0.252 * CANVAS_H}
              width={0.375 * CANVAS_W}
              height={0.467 * CANVAS_H}
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
                x={0.317 * CANVAS_W}
                y={0.248 * CANVAS_H}
                width={0.381 * CANVAS_W}
                height={0.475 * CANVAS_H}
                stroke="#ff1744"
                strokeWidth={3}
                dash={[10, 8]}
                listening={false}
              />
              {/* Cyan: safe inner photo slot */}
              <Rect
                x={0.322 * CANVAS_W}
                y={0.255 * CANVAS_H}
                width={0.371 * CANVAS_W}
                height={0.462 * CANVAS_H}
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
          return (
            <Group
              key={i}
              x={px}
              y={py}
              clipFunc={(ctx) => clipForShape(ctx as unknown as Konva.Context, pw, ph, slot.shape)}
            >
              <Rect width={pw} height={ph} fill={slotBg} />
              {photo?.image && (
                <KonvaImage
                  image={photo.image}
                  width={photo.image.width * photo.scale}
                  height={photo.image.height * photo.scale}
                  x={pw / 2 - (photo.image.width * photo.scale) / 2 + photo.offsetX}
                  y={ph / 2 - (photo.image.height * photo.scale) / 2 + photo.offsetY}
                  draggable
                  onDragMove={(e) => {
                    const nx = e.target.x() - (pw / 2 - (photo.image!.width * photo.scale) / 2);
                    const ny = e.target.y() - (ph / 2 - (photo.image!.height * photo.scale) / 2);
                    onPhotoDrag(i, nx, ny);
                  }}
                />
              )}
              {!photo?.image && (
                <Text
                  text={`${i + 1}`}
                  width={pw}
                  height={ph}
                  align="center"
                  verticalAlign="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={Math.min(pw, ph) * 0.08}
                  fill="#f4d91388"
                />
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

      {/* Stickers */}
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
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke="#f4d913"
          anchorStroke="#f4d913"
          anchorFill="#0b5c39"
        />
      </Layer>
    </Stage>
  );
}
