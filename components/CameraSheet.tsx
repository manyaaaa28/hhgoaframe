"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/* `<input capture>` only opens a camera on phones. On a laptop the browser
   ignores it and shows the same file picker as Gallery, so the Camera button
   reads as broken. getUserMedia works on both, so it's the primary path and
   the capture input stays as the fallback for anything that refuses. */
export default function CameraSheet({
  onCapture,
  onClose,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Called when no live camera is reachable — hands off to <input capture>. */
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onFallback();
        onClose();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stop();
        streamRef.current = stream;
        setLive(true);
        setError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error)?.name;
        setLive(false);
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera blocked. Allow camera access for this site in your browser settings, or use Gallery instead."
            : "No camera found on this device. Use Gallery instead."
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, onClose, onFallback]);

  const shoot = useCallback(() => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The preview is mirrored so it behaves like a mirror; mirror the capture
    // too, otherwise the saved shot is flipped from what the user framed.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "camera-shot.jpg", { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.92
    );
  }, [facing, onCapture, onClose]);

  return (
    <div
      role="dialog"
      aria-label="Take a photo"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#04180fee",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "3 / 4",
            borderRadius: 18,
            overflow: "hidden",
            background: "#0c0c0c",
            border: "3px solid #f4d913",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: facing === "user" ? "scaleX(-1)" : "none",
            }}
          />
          {error && (
            <p
              className="mono"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                padding: 24,
                fontSize: 13,
                color: "#f6f0de",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button className="pill-btn" onClick={shoot} disabled={!live}>
            📸 Capture
          </button>
          <button
            className="pill-btn ghost"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          >
            🔄 Flip
          </button>
          <button className="pill-btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {error && (
          <button
            className="pill-btn pink"
            style={{ marginTop: 12 }}
            onClick={() => {
              onFallback();
              onClose();
            }}
          >
            Use device camera app
          </button>
        )}
      </div>
    </div>
  );
}
