import React, { useEffect, useRef, useCallback } from 'react';
import './SpectrumView.css';

interface SpectrumViewProps {
  getSpectrumData: () => Uint8Array;
  getPeakFrequencies: (count?: number) => { energy: number; frequency: number }[];
  sampleRate?: number;
}

/* Log-frequency constants */
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const LOG_RANGE = LOG_MAX - LOG_MIN;

const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const MIN_DB = -96;
const MAX_DB = 0;
const DB_STEP = 12;
const DB_RANGE = MAX_DB - MIN_DB; // 96

const PAD_LEFT = 30;
const PAD_BOTTOM = 20;

function freqToX(freq: number, plotW: number): number {
  return (Math.log10(freq / MIN_FREQ) / LOG_RANGE) * plotW;
}

function xToFreq(x: number, plotW: number): number {
  const norm = x / plotW;
  return Math.pow(10, LOG_MIN + norm * LOG_RANGE);
}

function dbToY(dB: number, plotH: number): number {
  return (1 - (dB - MIN_DB) / DB_RANGE) * plotH;
}

function yToDb(y: number, plotH: number): number {
  return MIN_DB + (1 - y / plotH) * DB_RANGE;
}

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k`;
  return `${Math.round(freq)}`;
}

function formatFreqFull(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)} kHz`;
  return `${Math.round(freq)} Hz`;
}

const SpectrumView: React.FC<SpectrumViewProps> = ({
  getSpectrumData,
  getPeakFrequencies,
  sampleRate = 48000,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensionsRef = useRef({ width: 800, height: 150, dpr: 1 });
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const peakHoldRef = useRef<Float32Array | null>(null);
  const peakHoldTimeRef = useRef<number>(0);
  const gridCanvasRef = useRef<OffscreenCanvas | null>(null);
  const gridDirtyRef = useRef(true);
  const f0Ref = useRef<HTMLSpanElement>(null);

  /* Build offscreen grid canvas */
  const drawGrid = useCallback((width: number, height: number, dpr: number) => {
    const oc = new OffscreenCanvas(width * dpr, height * dpr);
    const ctx = oc.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    const plotW = width - PAD_LEFT;
    const plotH = height - PAD_BOTTOM;

    /* Vertical grid lines (frequency) */
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    GRID_FREQS.forEach((freq) => {
      const x = PAD_LEFT + freqToX(freq, plotW);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotH);
      ctx.stroke();
    });

    /* Horizontal grid lines (dB) */
    for (let dB = MAX_DB; dB >= MIN_DB; dB -= DB_STEP) {
      const y = dbToY(dB, plotH);
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    /* Axis labels */
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#333333';

    /* Frequency labels along bottom */
    GRID_FREQS.forEach((freq) => {
      const x = PAD_LEFT + freqToX(freq, plotW);
      ctx.fillText(formatFreq(freq), x, plotH + 4);
    });

    /* dB labels along left */
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let dB = MAX_DB; dB >= MIN_DB; dB -= DB_STEP) {
      const y = dbToY(dB, plotH);
      ctx.fillText(`${dB}`, PAD_LEFT - 4, y);
    }

    return oc;
  }, []);

  /* Resize observer */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width > 0 && height > 0) {
        dimensionsRef.current = { width, height, dpr };
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        gridDirtyRef.current = true;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* Animation loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;

    const render = (time: number) => {
      const dt = lastTime > 0 ? (time - lastTime) / 1000 : 0;
      lastTime = time;

      const { width, height, dpr } = dimensionsRef.current;
      const plotW = width - PAD_LEFT;
      const plotH = height - PAD_BOTTOM;

      ctx.save();
      ctx.scale(dpr, dpr);

      /* Background */
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      /* Grid (cached) */
      if (gridDirtyRef.current) {
        gridCanvasRef.current = drawGrid(width, height, dpr) as OffscreenCanvas | null;
        gridDirtyRef.current = false;
      }
      if (gridCanvasRef.current) {
        ctx.drawImage(gridCanvasRef.current, 0, 0, width, height);
      }

      /* Spectrum data */
      const spectrumData = getSpectrumData();
      const binCount = spectrumData.length;
      const nyquist = sampleRate / 2;
      const fftSize = binCount * 2; // getByteFrequencyData returns fftSize/2 bins

      if (binCount > 0) {
        /* Peak hold update */
        if (!peakHoldRef.current || peakHoldRef.current.length !== binCount) {
          peakHoldRef.current = new Float32Array(binCount);
          peakHoldRef.current.fill(0);
        }
        const peakHold = peakHoldRef.current;
        const decayPerFrame = 3 * dt; // 3 dB/sec decay

        /* Convert byte data to dB and update peak hold */
        // AnalyserNode.getByteFrequencyData: 0 = silence, 255 = max
        // Map linearly: dB = (value / 255) * 96 - 96 => 0->-96dB, 255->0dB

        /* Build spectrum path */
        ctx.beginPath();
        let started = false;
        let lastX = PAD_LEFT;

        for (let i = 1; i < binCount; i++) {
          const freq = (i / fftSize) * sampleRate;
          if (freq < MIN_FREQ || freq > MAX_FREQ) continue;

          const x = PAD_LEFT + freqToX(freq, plotW);
          const dB = (spectrumData[i] / 255) * DB_RANGE + MIN_DB;
          const y = dbToY(dB, plotH);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
          lastX = x;

          /* Update peak hold */
          const dbVal = dB;
          if (dbVal > peakHold[i] - MIN_DB + MIN_DB) {
            peakHold[i] = spectrumData[i] / 255 * DB_RANGE; // store as positive offset from MIN_DB
          } else {
            peakHold[i] = Math.max(0, peakHold[i] - decayPerFrame * (DB_RANGE / 96));
          }
        }

        /* Close path for fill */
        ctx.lineTo(lastX, plotH);
        ctx.lineTo(PAD_LEFT, plotH);
        ctx.closePath();

        /* Fill gradient */
        const grad = ctx.createLinearGradient(0, 0, 0, plotH);
        grad.addColorStop(0, 'rgba(78,205,196,0.40)');
        grad.addColorStop(1, 'rgba(78,205,196,0.05)');
        ctx.fillStyle = grad;
        ctx.fill();

        /* Stroke curve */
        ctx.beginPath();
        started = false;
        for (let i = 1; i < binCount; i++) {
          const freq = (i / fftSize) * sampleRate;
          if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
          const x = PAD_LEFT + freqToX(freq, plotW);
          const dB = (spectrumData[i] / 255) * DB_RANGE + MIN_DB;
          const y = dbToY(dB, plotH);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(78,205,196,0.80)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        /* Peak hold stroke */
        ctx.beginPath();
        started = false;
        for (let i = 1; i < binCount; i++) {
          const freq = (i / fftSize) * sampleRate;
          if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
          const x = PAD_LEFT + freqToX(freq, plotW);
          const holdDb = (peakHold[i] / DB_RANGE) * DB_RANGE + MIN_DB;
          const y = dbToY(holdDb, plotH);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(78,205,196,0.50)';
        ctx.lineWidth = 1;
        ctx.stroke();

        /* Update F0 readout */
        const livePeaks = getPeakFrequencies(1);
        if (livePeaks.length > 0 && livePeaks[0].energy > 10 && f0Ref.current) {
          f0Ref.current.textContent = `F0: ${livePeaks[0].frequency.toFixed(1)} Hz`;
        } else if (f0Ref.current) {
          f0Ref.current.textContent = 'F0: ---';
        }
      }

      /* Hover crosshair */
      const mouse = mousePosRef.current;
      if (mouse) {
        const mx = mouse.x;
        const my = mouse.y;

        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        /* Vertical line */
        ctx.beginPath();
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx, plotH);
        ctx.stroke();

        /* Horizontal line */
        ctx.beginPath();
        ctx.moveTo(PAD_LEFT, my);
        ctx.lineTo(width, my);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();

        /* Readout labels near cursor */
        const hoverFreq = xToFreq(mx - PAD_LEFT, plotW);
        const hoverDb = yToDb(my, plotH);

        if (hoverFreq >= MIN_FREQ && hoverFreq <= MAX_FREQ && hoverDb >= MIN_DB && hoverDb <= MAX_DB) {
          ctx.font = '10px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';

          const freqText = formatFreqFull(hoverFreq);
          const dbText = `${hoverDb.toFixed(1)} dB`;

          /* Position labels avoiding edge overflow */
          const textX = mx + 8 < width - 80 ? mx + 8 : mx - 80;
          const textY = my - 8 > 12 ? my - 8 : my + 16;

          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(freqText, textX, textY);
          ctx.fillText(dbText, textX, textY + 12);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [getSpectrumData, getPeakFrequencies, sampleRate, drawGrid]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current = null;
  }, []);

  return (
    <div className="spectrum-view">
      <div className="spectrum-view__header">
        <span className="spectrum-view__title">SPECTRUM</span>
        <div className="spectrum-view__separator" />
        <span className="spectrum-view__f0" ref={f0Ref}>F0: ---</span>
      </div>
      <div
        className="spectrum-view__canvas-container"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="spectrum-view__canvas"
          style={{ pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
};

export default SpectrumView;
