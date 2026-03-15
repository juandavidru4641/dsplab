import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Pill } from '../controls/Pill';
import { ToggleGroup } from '../controls/ToggleGroup';
import './ScopeView.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScopeViewProps {
  getScopeData: () => { l: Float32Array; r: Float32Array };
  getProbedData?: (name: string) => number[] | null;
  probes?: string[];
  triggerMode?: 'auto' | 'free';
  onTriggerModeChange?: (mode: 'auto' | 'free') => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG_COLOR = '#0a0a0a';
const GRID_MAJOR = 'rgba(255,255,255,0.06)';
const GRID_MINOR = 'rgba(255,255,255,0.03)';
const GRID_CENTER = 'rgba(255,255,255,0.08)';
const TRIGGER_COLOR = 'rgba(255,80,80,0.4)';

const CH1_COLOR = '#ff6b35';
const CH2_COLOR = '#4ecdc4';
const PROBE_COLOR = '#c678dd';

const MAJOR_COLS = 10;
const MAJOR_ROWS = 8;
const SUBDIVISIONS = 4;

/* ------------------------------------------------------------------ */
/*  Graticule offscreen canvas                                         */
/* ------------------------------------------------------------------ */

function drawGraticule(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
) {
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;
  if (!ctx) return;

  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  // Minor grid (subdivisions)
  ctx.strokeStyle = GRID_MINOR;
  ctx.lineWidth = 1;
  const subCols = MAJOR_COLS * SUBDIVISIONS;
  const subRows = MAJOR_ROWS * SUBDIVISIONS;
  ctx.beginPath();
  for (let i = 1; i < subCols; i++) {
    if (i % SUBDIVISIONS === 0) continue; // skip major lines
    const x = Math.round((w / subCols) * i) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < subRows; i++) {
    if (i % SUBDIVISIONS === 0) continue;
    const y = Math.round((h / subRows) * i) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Major grid
  ctx.strokeStyle = GRID_MAJOR;
  ctx.beginPath();
  for (let i = 1; i < MAJOR_COLS; i++) {
    const x = Math.round((w / MAJOR_COLS) * i) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < MAJOR_ROWS; i++) {
    const y = Math.round((h / MAJOR_ROWS) * i) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Center crosshair
  ctx.strokeStyle = GRID_CENTER;
  ctx.beginPath();
  const cx = Math.round(w / 2) + 0.5;
  const cy = Math.round(h / 2) + 0.5;
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Trace drawing helpers                                              */
/* ------------------------------------------------------------------ */

function drawTrace(
  ctx: CanvasRenderingContext2D,
  data: Float32Array | number[],
  color: string,
  w: number,
  centerY: number,
  amplitude: number,
  dashed?: boolean,
) {
  if (!data || data.length === 0) return;

  const len = data.length;
  const step = w / len;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 3;
  ctx.shadowColor = color + '80';

  if (dashed) {
    ctx.setLineDash([5, 5]);
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = i * step;
    const y = centerY - (data[i] as number) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Trigger helpers                                                    */
/* ------------------------------------------------------------------ */

function findTriggerPoint(data: Float32Array, threshold: number): number {
  const searchRange = data.length >>> 1;
  for (let i = 1; i < searchRange; i++) {
    if (data[i - 1] <= threshold && data[i] > threshold) {
      return i;
    }
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ScopeView: React.FC<ScopeViewProps> = ({
  getScopeData,
  getProbedData,
  probes = [],
  triggerMode: triggerModeProp,
  onTriggerModeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graticuleRef = useRef<HTMLCanvasElement | null>(null);
  const dimRef = useRef({ width: 800, height: 200, dpr: 1 });
  const rafRef = useRef<number>(0);
  const prevDataRef = useRef<{ l: Float32Array; r: Float32Array } | null>(null);

  // Internal trigger mode state (controlled or uncontrolled)
  const [internalTrigger, setInternalTrigger] = useState<'auto' | 'free'>(
    triggerModeProp ?? 'auto',
  );
  const triggerMode = triggerModeProp ?? internalTrigger;
  const handleTriggerChange = useCallback(
    (mode: 'auto' | 'free') => {
      if (onTriggerModeChange) onTriggerModeChange(mode);
      else setInternalTrigger(mode);
    },
    [onTriggerModeChange],
  );

  const threshold = 0.0;

  /* ---- Rebuild graticule on resize ---- */
  const rebuildGraticule = useCallback((w: number, h: number, dpr: number) => {
    let offscreen = graticuleRef.current;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      graticuleRef.current = offscreen;
    }
    offscreen.width = w * dpr;
    offscreen.height = h * dpr;
    drawGraticule(offscreen, w, h, dpr);
  }, []);

  /* ---- ResizeObserver ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        dimRef.current = { width: w, height: h, dpr };
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        rebuildGraticule(w, h, dpr);
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rebuildGraticule]);

  /* ---- RAF render loop ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width: w, height: h, dpr } = dimRef.current;
      const data = getScopeData();

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      // 2. Graticule (cached)
      if (graticuleRef.current) {
        ctx.drawImage(graticuleRef.current, 0, 0, w, h);
      }

      if (data) {
        // Trigger
        let startIdx = 0;
        const samplesToShow = data.l.length >>> 1;

        if (triggerMode === 'auto') {
          startIdx = findTriggerPoint(data.l, threshold);
        }

        const displayL = data.l.subarray(startIdx, startIdx + samplesToShow);
        const displayR = data.r.subarray(startIdx, startIdx + samplesToShow);

        const hasStereo = data.r && data.r.length > 0;
        const halfH = h / 2;

        if (hasStereo) {
          const quarterH = h / 4;
          // CH1 top half
          drawTrace(ctx, displayL, CH1_COLOR, w, quarterH, quarterH * 0.85);
          // CH2 bottom half
          drawTrace(ctx, displayR, CH2_COLOR, w, h * 0.75, quarterH * 0.85);
        } else {
          // Single channel
          drawTrace(ctx, displayL, CH1_COLOR, w, halfH, halfH * 0.85);
        }

        // 4. Trigger level indicator (auto mode only)
        if (triggerMode === 'auto') {
          const trigY = hasStereo
            ? h / 4 - threshold * (h / 4) * 0.85
            : halfH - threshold * halfH * 0.85;
          ctx.save();
          ctx.strokeStyle = TRIGGER_COLOR;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, trigY);
          ctx.lineTo(w, trigY);
          ctx.stroke();
          ctx.restore();
        }

        // Probed data
        if (probes.length > 0 && getProbedData) {
          const probedData = getProbedData(probes[0]);
          if (probedData && probedData.length > 0) {
            drawTrace(ctx, probedData, PROBE_COLOR, w, halfH, halfH * 0.85, true);
          }
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getScopeData, getProbedData, probes, triggerMode, threshold]);

  /* ---- Time/div readout ---- */
  const timeDivLabel = '1.0 ms/div';

  return (
    <div className="scope-view">
      <div className="scope-view__header">
        <span className="scope-view__title">SCOPE</span>

        <Pill color={CH1_COLOR}>CH1</Pill>
        <Pill color={CH2_COLOR}>CH2</Pill>

        <div className="scope-view__separator" />

        <ToggleGroup<'auto' | 'free'>
          options={[
            { value: 'auto', label: 'AUTO' },
            { value: 'free', label: 'FREE' },
          ]}
          value={triggerMode}
          onChange={handleTriggerChange}
        />

        <span className="scope-view__readout">{timeDivLabel}</span>
      </div>

      <div className="scope-view__canvas-container">
        <canvas ref={canvasRef} className="scope-view__canvas" />
      </div>
    </div>
  );
};

export default ScopeView;
