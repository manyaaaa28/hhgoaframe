"use client";

import React, { useEffect } from "react";
import { Transformer } from "react-konva";
import Konva from "konva";

/* The Stage is scaled down to fit the screen (≈0.17 on a phone, ≈0.3 on a
   laptop) and a Transformer is sized in canvas units, so Konva's 10px default
   anchors render under 2px on screen — visible, but impossible to grab, which
   is why stickers "don't rotate". Every measurement here is divided by the
   stage scale so the handles stay a constant size on screen at any zoom. */
export default function StickerTransformer({
  trRef,
  scale,
  canvasWidth,
}: {
  trRef: React.RefObject<Konva.Transformer>;
  scale: number;
  canvasWidth: number;
}) {
  /* Screen-constant sizing, but capped as a share of the canvas. On a phone the
     stage scale is ~0.25, so an uncapped anchor becomes ~95 canvas units — wide
     enough to blanket neighbouring stickers, which then can't be tapped at all.

     ANCHOR_PX is the handle's size in screen pixels. 14 read as chunky dots
     against a stage this small; 9 sits out of the way and is still an easy
     target, because Konva pads each anchor's hit area on touch well beyond
     what it draws. */
  const ANCHOR_PX = 9;
  const px = (n: number) => Math.min(n / scale, canvasWidth * (n / ANCHOR_PX) * 0.026);

  /* Two jobs, both needing the live transformer.
     1. enabledAnchors only hides the anchors it drops — Konva leaves them
        listening, so the four edge midpoints stay as invisible hit targets
        that swallow taps meant for whatever sticker sits under them.
     2. A screen-constant handle is still far too big on a small sticker: the
        nameplate strip is only ~16px tall on a phone, so 9px dots covered
        more than half of it. The handle is capped against the selected
        sticker's own on-screen size, so it shrinks with what it's holding.
     Runs on every render because Konva rebuilds the anchors whenever the
     selection changes. */
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    tr.find("._anchor").forEach((a) => a.listening(a.isVisible()));

    const node = tr.nodes()[0];
    if (!node) return;
    const rect = node.getClientRect(); // absolute, so already in screen pixels
    const smallestSide = Math.min(rect.width, rect.height);
    const screenPx = Math.max(4, Math.min(ANCHOR_PX, smallestSide * 0.32));
    tr.anchorSize(screenPx / scale);
    tr.anchorCornerRadius(screenPx / 2 / scale);
    tr.anchorStrokeWidth(Math.max(0.75, screenPx * 0.13) / scale);
    tr.rotateAnchorOffset(Math.max(9, screenPx * 1.7) / scale);
    tr.getLayer()?.batchDraw();
  });
  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      keepRatio
      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
      anchorSize={px(ANCHOR_PX)}
      anchorCornerRadius={px(ANCHOR_PX / 2)}
      anchorStrokeWidth={px(1.2)}
      borderStrokeWidth={px(1.2)}
      borderDash={[px(5), px(4)]}
      /* Kept short so the rotate handle stays inside the canvas when a sticker
         sits near the top edge — outside it, the browser never sees the click. */
      rotateAnchorOffset={px(16)}
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      borderStroke="#f4d913"
      anchorStroke="#0a2a1c"
      anchorFill="#f4d913"
      /* No padding and no boundBoxFunc on purpose: both silently swallowed
         drags on the bottom anchors. Konva's own minimum-size guard is enough. */
    />
  );
}
