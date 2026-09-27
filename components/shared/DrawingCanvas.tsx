'use client';

import { Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { MAX_DRAWING_BYTES } from '@/lib/engine/drawings';
import { BRUSH_SIZES, CANVAS_BACKGROUND, CANVAS_COLORS } from '@/lib/palette';
import { Button } from './Button';

interface Stroke {
  color: string;
  size: number;
  points: [number, number][];
}

const SIZE = 480; // logical canvas resolution
const EXPORT_SIZES = [480, 400, 320, 256];
const COLOR_NAMES = ['Ink', 'Purple', 'Pink', 'Mint', 'Peach', 'White'];
const SIZE_NAMES = ['Thin', 'Medium', 'Thick'];

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.fillStyle = CANVAS_BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size * scale;
    if (s.points.length === 1) {
      const [x, y] = s.points[0];
      ctx.beginPath();
      ctx.arc(x * scale, y * scale, (s.size * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * scale, y * scale) : ctx.lineTo(x * scale, y * scale)));
    ctx.stroke();
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export drawing'))), 'image/png'),
  );
}

/** Exports a PNG under 200 KB (FR-11), stepping the resolution down if needed. */
export async function exportStrokes(strokes: Stroke[]): Promise<Blob> {
  for (const size of EXPORT_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    paint(ctx, strokes, size / SIZE);
    const blob = await toBlob(canvas);
    if (blob.size <= MAX_DRAWING_BYTES) return blob;
  }
  throw new Error('Drawing is too detailed to send. Try clearing some of it.');
}

interface DrawingCanvasProps {
  onSubmit: (png: Blob) => Promise<void> | void;
  submitLabel?: string;
}

/**
 * Touch drawing with pointer events (SRD §5): 6 palette colors, 3 brush sizes,
 * undo and clear.
 */
export function DrawingCanvas({ onSubmit, submitLabel = 'Done drawing' }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const [color, setColor] = useState<string>(CANVAS_COLORS[0]);
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redraw = useCallback((list: Stroke[]) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, list, 1);
  }, []);

  useEffect(() => redraw(strokes), [strokes, redraw]);

  function point(e: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * SIZE * 10) / 10,
      Math.round(((e.clientY - rect.top) / rect.height) * SIZE * 10) / 10,
    ];
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { color, size, points: [point(e)] };
    redraw([...strokes, drawing.current]);
  }

  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    const s = drawing.current;
    if (!s) return;
    s.points.push(point(e));
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pts = s.points;
    const [x0, y0] = pts[pts.length - 2];
    const [x1, y1] = pts[pts.length - 1];
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function onUp() {
    const s = drawing.current;
    drawing.current = null;
    if (s) setStrokes((prev) => [...prev, s]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(await exportStrokes(strokes));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the drawing.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        aria-label="Drawing canvas"
        role="img"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="aspect-square w-full touch-none rounded-2xl ring-4 ring-plum-deep"
        style={{ backgroundColor: CANVAS_BACKGROUND }}
      />
      <div className="flex items-center justify-between gap-2" role="group" aria-label="Colors">
        {CANVAS_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label={COLOR_NAMES[i]}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={`h-11 w-11 rounded-full ring-2 transition-transform duration-150 ${
              color === c ? 'scale-110 ring-4 ring-pink' : 'ring-plum-deep'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-2" role="group" aria-label="Brush size">
          {BRUSH_SIZES.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-label={SIZE_NAMES[i]}
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              className={`flex h-12 flex-1 items-center justify-center rounded-xl ${size === s ? 'bg-pink' : 'bg-plum-raised'}`}
            >
              <span className="rounded-full bg-peach" style={{ width: Math.max(6, s), height: Math.max(6, s) }} />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Undo"
          disabled={strokes.length === 0 || busy}
          onClick={() => setStrokes((prev) => prev.slice(0, -1))}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-plum-raised disabled:opacity-40"
        >
          <Undo2 aria-hidden className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label="Clear"
          disabled={strokes.length === 0 || busy}
          onClick={() => setStrokes([])}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-plum-raised disabled:opacity-40"
        >
          <Trash2 aria-hidden className="h-6 w-6" />
        </button>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-pink">
          {error}
        </p>
      )}
      <Button size="lg" block onClick={submit} disabled={busy || strokes.length === 0}>
        {busy ? 'Sending…' : submitLabel}
      </Button>
    </div>
  );
}
