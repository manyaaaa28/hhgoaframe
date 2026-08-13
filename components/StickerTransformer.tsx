"use client";

import React, { useEffect } from "react";
import { Transformer } from "react-konva";
import Konva from "konva";

/* Handle sizes here are screen pixels, straight up — no stage-scale maths.
   Konva's Transformer overrides getAbsoluteTransform() to return only its own
   local transform, so it ignores the stage scale and draws its anchors at
   their literal size on screen. Dividing by the scale on top of that (which
   this file used to do) inflated them: 6 "px" became 28px on a phone, where
   the stage sits at ~0.25. */
const ANCHOR_PX = 8; // how big the dot looks
const TOUCH_PX = 17; // how big it is to grab — see hitStrokeWidth below

export default function StickerTransformer({ trRef }: { trRef: React.RefObject<Konva.Transformer> }) {
  /* Three jobs, all needing the live transformer.
     1. enabledAnchors only hides the anchors it drops — Konva leaves them
        listening, so the four edge midpoints stay as invisible hit targets
        that swallow taps meant for whatever sticker sits under them.
     2. A fixed handle is still too big on a small sticker: the nameplate strip
        is only ~16px tall on a phone, so the dots covered more than half of
        it. Cap the handle against the sticker's own on-screen size.
     3. The dot is smaller than a fingertip, so give it back an invisible hit
        ring. hitStrokeWidth pads a shape's hit region by half its value on
        each side, so the grabbable width is size + hitStrokeWidth.
     Runs on every render because Konva rebuilds the anchors whenever the
     selection changes. */
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = tr.nodes()[0];
    if (!node) return;

    const rect = node.getClientRect(); // absolute, i.e. already screen pixels
    const size = Math.max(5, Math.min(ANCHOR_PX, Math.min(rect.width, rect.height) * 0.28));
    tr.anchorSize(size);
    tr.anchorCornerRadius(size / 2);
    tr.anchorStrokeWidth(1);
    tr.rotateAnchorOffset(Math.max(16, size * 2.2));

    tr.find<Konva.Shape>("._anchor").forEach((a) => {
      a.listening(a.isVisible());
      a.hitStrokeWidth(Math.max(0, TOUCH_PX - size));
    });
    tr.getLayer()?.batchDraw();
  });

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      keepRatio
      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
      anchorSize={ANCHOR_PX}
      anchorCornerRadius={ANCHOR_PX / 2}
      anchorStrokeWidth={1}
      borderStrokeWidth={1.2}
      borderDash={[5, 4]}
      /* Kept short so the rotate handle stays inside the canvas when a sticker
         sits near the top edge — outside it, the browser never sees the click. */
      rotateAnchorOffset={18}
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      borderStroke="#f4d913"
      anchorStroke="#0a2a1c"
      anchorFill="#f4d913"
      /* No padding and no boundBoxFunc on purpose: both silently swallowed
         drags on the bottom anchors. Konva's own minimum-size guard is enough. */
    />
  );
}
