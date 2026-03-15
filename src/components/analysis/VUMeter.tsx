import React, { useEffect, useRef } from 'react';
import './VUMeter.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VUMeterProps {
  level: number;      // 0-1 normalized current level
  peak?: number;      // 0-1 normalized peak level (if not provided, compute internally)
  label?: string;     // e.g., "L" or "R"
  width?: number;     // default 12
  height?: number;    // default 80
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG_COLOR = '#0a0a0a';
const PEAK_DECAY_RATE = 0.002;    // ~3dB/sec mapped to level units per frame at 60fps
const RELEASE_FACTOR = 0.92;      // exponential decay for ~1.5s release
const CLIP_THRESHOLD = 0.95;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const VUMeter: React.FC<VUMeterProps> = ({
  level,
  peak: externalPeak,
  label,
  width = 12,
  height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    displayLevel: 0,
    peakHold: 0,
    clipFlash: 0,
  });
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const render = (time: number) => {
      const dt = prevTimeRef.current ? (time - prevTimeRef.current) / 1000 : 1 / 60;
      prevTimeRef.current = time;

      const state = stateRef.current;
      const clampedLevel = Math.max(0, Math.min(1, level));

      // PPM ballistics: fast attack (~1 frame), slow release (~1.5s exponential)
      if (clampedLevel > state.displayLevel) {
        state.displayLevel = clampedLevel; // instant attack
      } else {
        state.displayLevel *= RELEASE_FACTOR; // exponential release
      }

      // Peak hold with decay
      const currentPeak = externalPeak != null
        ? Math.max(0, Math.min(1, externalPeak))
        : clampedLevel;

      if (currentPeak > state.peakHold) {
        state.peakHold = currentPeak;
      } else {
        state.peakHold = Math.max(0, state.peakHold - PEAK_DECAY_RATE * dt * 60);
      }

      // Clip detection
      if (clampedLevel >= CLIP_THRESHOLD) {
        state.clipFlash = 1;
      } else {
        state.clipFlash = Math.max(0, state.clipFlash - dt * 4);
      }

      // Draw
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = BG_COLOR;
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 2);
      ctx.fill();

      // Fill bar from bottom with gradient
      const barHeight = state.displayLevel * height;
      if (barHeight > 0) {
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#4ecdc4');       // bottom (0%)
        gradient.addColorStop(0.75, '#e5c07b');    // 75%
        gradient.addColorStop(0.90, '#ff6b35');    // 90-100%
        gradient.addColorStop(1.0, '#ff6b35');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, height - barHeight, width, barHeight);
      }

      // Peak hold line
      if (state.peakHold > 0.01) {
        const peakY = height - state.peakHold * height;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, peakY);
        ctx.lineTo(width, peakY);
        ctx.stroke();
      }

      // Clip indicator
      if (state.clipFlash > 0) {
        ctx.fillStyle = `rgba(255, 50, 50, ${state.clipFlash * 0.8})`;
        ctx.fillRect(0, 0, width, 4);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [level, externalPeak, width, height]);

  return (
    <div className="vu-meter">
      <canvas
        ref={canvasRef}
        className="vu-meter__canvas"
        style={{ width, height }}
      />
      {label && <span className="vu-meter__label">{label}</span>}
    </div>
  );
};

export { VUMeter };
export type { VUMeterProps };
export default VUMeter;
