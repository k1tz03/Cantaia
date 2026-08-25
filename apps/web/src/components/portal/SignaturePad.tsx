"use client";

/**
 * Touch signature pad for the field portal.
 *
 * A signed daily report is what turns a list of hours into a "bon de régie"
 * the client can be billed against, so the capture has to work with a gloved
 * finger on a cracked screen: full-width canvas, thick stroke, one big Clear
 * button, no modal, no library.
 *
 * Output is a PNG data URL stored in site_reports.signature_data (migration 093).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { usePortalI18n } from "./portal-i18n";

interface SignaturePadProps {
  /** Existing signature (data URL) — rendered into the canvas on mount. */
  value: string | null;
  /** Called with the PNG data URL when a stroke ends, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

const CANVAS_HEIGHT = 160;
const STROKE_COLOR = "#FAFAFA";
const STROKE_WIDTH = 2.5;

export function SignaturePad({ value, onChange, disabled = false }: SignaturePadProps) {
  const { t } = usePortalI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(Boolean(value));
  const [hasContent, setHasContent] = useState(Boolean(value));

  /** (Re)size the backing store to the CSS size × DPR, then repaint `value`. */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const width = wrapper.clientWidth || 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(CANVAS_HEIGHT * dpr);
    canvas.style.width = "100%";
    canvas.style.height = `${CANVAS_HEIGHT}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = STROKE_COLOR;

    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, CANVAS_HEIGHT);
      img.src = value;
    }
  }, [value]);

  useEffect(() => {
    setupCanvas();
    // Rotating the phone must not wipe the signature — repaint from `value`.
    window.addEventListener("orientationchange", setupCanvas);
    return () => window.removeEventListener("orientationchange", setupCanvas);
  }, [setupCanvas]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    // Keep receiving moves even if the finger slides outside the canvas.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported — pointermove on the canvas is still enough */
    }
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A single tap must leave a visible dot.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    drawingRef.current = true;
    hasStrokeRef.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokeRef.current) return;
    setHasContent(true);
    try {
      onChange(canvas.toDataURL("image/png"));
    } catch {
      /* tainted canvas can't happen here (no external image) */
    }
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    setHasContent(false);
    onChange(null);
  }

  return (
    <div ref={wrapperRef} className="w-full">
      <div className="relative rounded-lg border border-dashed border-[#3F3F46] bg-[#27272A]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          // touch-none: signing must not scroll the page under the finger.
          className={
            "block w-full touch-none rounded-lg " +
            (disabled ? "cursor-default" : "cursor-crosshair")
          }
          aria-label={t("signHere")}
        />
        {!hasContent && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <PenLine className="h-5 w-5 text-[#A1A1AA]" aria-hidden="true" />
            <span className="text-[13px] text-[#A1A1AA]">{t("signHere")}</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[13px] leading-snug text-[#A1A1AA]">{t("signatureHint")}</p>
        {!disabled && hasContent && (
          <button
            type="button"
            onClick={handleClear}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-[#3F3F46] bg-[#27272A] px-3 text-[13px] font-semibold text-[#E4E4E7]"
          >
            <Eraser className="h-4 w-4" aria-hidden="true" />
            {t("clearSignature")}
          </button>
        )}
      </div>
    </div>
  );
}
