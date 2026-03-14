import React, { useEffect, useRef } from 'react';
import './MultiScopeView.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MultiScopeViewProps {
  probes: string[];
  onStateUpdate: (
    callback: (state: Record<string, any>, probes: Record<string, number[]>) => void,
  ) => () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG_COLOR = '#0a0a0a';
const SEPARATOR_COLOR = 'rgba(255,255,255,0.06)';
const LABEL_BG = 'rgba(0,0,0,0.55)';
const NO_PROBES_COLOR = 'rgba(255,255,255,0.25)';

const CHANNEL_COLORS = [
  '#ff6b35',
  '#4ecdc4',
  '#c678dd',
  '#98c379',
  '#e5c07b',
  '#56b6c2',
];

const MAX_HISTORY = 5000;
const DISPLAY_SAMPLES = 1000;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MultiScopeView: React.FC<MultiScopeViewProps> = ({ probes, onStateUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimRef = useRef({ width: 800, height: 250, dpr: 1 });
  const rafRef = useRef<number>(0);
  const historyRef = useRef<Record<string, number[]>>({});

  /* ---- Subscribe to probe data ---- */
  useEffect(() => {
    const unsubscribe = onStateUpdate((_state, probesData) => {
      probes.forEach((probe) => {
        const newData = probesData[probe];
        if (newData && newData.length > 0) {
          if (!historyRef.current[probe]) historyRef.current[probe] = [];
          historyRef.current[probe].push(...newData);
          if (historyRef.current[probe].length > MAX_HISTORY) {
            historyRef.current[probe] = historyRef.current[probe].slice(-MAX_HISTORY);
          }
        }
      });
    });
    return unsubscribe;
  }, [onStateUpdate, probes]);

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
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  /* ---- RAF render loop ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width: w, height: h, dpr } = dimRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      if (probes.length === 0) {
        ctx.fillStyle = NO_PROBES_COLOR;
        ctx.font = '11px var(--font-mono, monospace)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NO PROBES ACTIVE', w / 2, h / 2);
        ctx.restore();
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const laneH = h / probes.length;

      probes.forEach((probe, idx) => {
        const color = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
        const laneY = idx * laneH;

        // Separator between rows
        if (idx > 0) {
          ctx.strokeStyle = SEPARATOR_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const sepY = Math.round(laneY) + 0.5;
          ctx.moveTo(0, sepY);
          ctx.lineTo(w, sepY);
          ctx.stroke();
        }

        const history = historyRef.current[probe];
        if (!history || history.length < 2) {
          // Draw label even with no data
          drawLabel(ctx, probe, '--', color, 5, laneY + 13);
          return;
        }

        const displayHistory = history.slice(-DISPLAY_SAMPLES);

        // Find min/max for normalization
        let min = displayHistory[0];
        let max = displayHistory[0];
        for (let i = 1; i < displayHistory.length; i++) {
          if (displayHistory[i] < min) min = displayHistory[i];
          if (displayHistory[i] > max) max = displayHistory[i];
        }
        const range = Math.max(0.0001, max - min);
        const isLogic = range === 1.0 && (min === 0 || min === -1);

        // Draw trace
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 2;
        ctx.shadowColor = color + '60';
        ctx.beginPath();

        const step = w / Math.max(1, DISPLAY_SAMPLES - 1);
        const padTop = laneH * 0.1;
        const usableH = laneH * 0.8;

        for (let i = 0; i < displayHistory.length; i++) {
          const norm = (displayHistory[i] - min) / range;
          const x = i * step;
          const y = laneY + laneH - padTop - norm * usableH;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            if (isLogic) {
              // Step-style rendering for logic signals
              const prevNorm = (displayHistory[i - 1] - min) / range;
              const prevY = laneY + laneH - padTop - prevNorm * usableH;
              ctx.lineTo(x, prevY);
            }
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Channel label
        const lastVal = displayHistory[displayHistory.length - 1];
        const valStr = typeof lastVal === 'number' ? lastVal.toFixed(4) : '...';
        drawLabel(ctx, probe, valStr, color, 5, laneY + 13);
      });

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [probes]);

  return (
    <div className="multi-scope-view">
      <div className="multi-scope-view__header">
        <span className="multi-scope-view__title">LOGIC</span>
      </div>
      <div className="multi-scope-view__canvas-container">
        <canvas ref={canvasRef} className="multi-scope-view__canvas" />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function drawLabel(
  ctx: CanvasRenderingContext2D,
  probe: string,
  value: string,
  color: string,
  x: number,
  y: number,
) {
  const text = `${probe}: ${value}`;
  ctx.font = 'bold 10px var(--font-mono, monospace)';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(x - 2, y - 11, tw + 8, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export { MultiScopeView };
export type { MultiScopeViewProps };
export default MultiScopeView;
