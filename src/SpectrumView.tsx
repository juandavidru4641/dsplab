import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Activity, Copy, Check } from 'lucide-react';

interface SpectrumViewProps {
  getSpectrumData: () => Uint8Array;
  getPeakFrequencies: (count?: number) => { energy: number; frequency: number }[];
}

const SpectrumView: React.FC<SpectrumViewProps> = ({ getSpectrumData, getPeakFrequencies }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<{ energy: number; frequency: number }[]>([]);
  const peaksRef = useRef<{ energy: number; frequency: number }[]>([]);
  const dimensionsRef = useRef({ width: 800, height: 150, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);

        if (width > 0 && height > 0) {
          dimensionsRef.current = { width, height, dpr };
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    let lastPeakUpdate = 0;

    const render = (time: number) => {
      const { width, height, dpr } = dimensionsRef.current;
      const spectrumData = getSpectrumData();

      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Grid Y (Amplitude)
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
      ctx.font = '9px monospace';

      for (let i = 1; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Spectrum (Logarithmic scale)
      const binCount = spectrumData.length;
      if (binCount > 0) {
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, 'rgba(0, 200, 255, 0.0)');
        gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 200, 255, 0.8)');

        ctx.fillStyle = gradient;

        const minLogFreq = Math.log10(20);
        const maxLogFreq = Math.log10(20000);
        const logRange = maxLogFreq - minLogFreq;

        ctx.beginPath();
        ctx.moveTo(0, height);

        const nyquist = 22050; // Approx default sampleRate / 2

        let prevX = 0;
        for (let i = 0; i < binCount; i++) {
          const freq = (i / binCount) * nyquist;
          if (freq < 20) continue;

          const normX = (Math.log10(freq) - minLogFreq) / logRange;
          const x = normX * width;
          const val = spectrumData[i];
          const barHeight = (val / 255) * height;
          const y = height - barHeight;

          ctx.lineTo(x, y);
          prevX = x;
        }

        ctx.lineTo(prevX, height);
        ctx.lineTo(width, height);
        ctx.fill();

        // Draw circles on live peaks (every frame — fast tracking)
        const livePeaks = getPeakFrequencies(3);
        livePeaks.forEach(p => {
          if (p.frequency >= 20 && p.frequency <= 20000) {
            const normX = (Math.log10(p.frequency) - minLogFreq) / logRange;
            const x = normX * width;
            const y = height - (p.energy / 255) * height;

            // Outer glow
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 204, 0, 0.2)';
            ctx.fill();

            // Inner dot
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ffcc00';
            ctx.fill();
          }
        });

        // Update text readouts with EMA smoothing (slow — every 1s)
        if (time - lastPeakUpdate > 1000) {
          lastPeakUpdate = time;
          const rawPeaks = getPeakFrequencies(5);
          const prev = peaksRef.current;
          const alpha = 0.3;

          if (prev.length === 0 || rawPeaks.length === 0) {
            peaksRef.current = rawPeaks.slice(0, 3);
          } else {
            const blended: { energy: number; frequency: number }[] = [];
            const usedOld = new Set<number>();

            for (const rp of rawPeaks) {
              let bestIdx = -1;
              let bestDist = Infinity;
              for (let j = 0; j < prev.length; j++) {
                if (usedOld.has(j)) continue;
                const dist = Math.abs(rp.frequency - prev[j].frequency);
                if (dist < bestDist) { bestDist = dist; bestIdx = j; }
              }

              if (bestIdx >= 0 && bestDist < 200) {
                usedOld.add(bestIdx);
                blended.push({
                  frequency: Math.round(prev[bestIdx].frequency * (1 - alpha) + rp.frequency * alpha),
                  energy: Math.round(prev[bestIdx].energy * (1 - alpha) + rp.energy * alpha),
                });
              } else {
                blended.push(rp);
              }

              if (blended.length >= 3) break;
            }
            peaksRef.current = blended;
          }
          setPeaks([...peaksRef.current]);
        }
      }

      // Draw Grid X (Frequency labels)
      const labelFreqs = [100, 500, 1000, 5000, 10000];
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.textAlign = 'center';

      const minLogFreq = Math.log10(20);
      const logRange = Math.log10(20000) - minLogFreq;

      labelFreqs.forEach(freq => {
        const normX = (Math.log10(freq) - minLogFreq) / logRange;
        const x = normX * width;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillText(`${freq >= 1000 ? freq / 1000 + 'k' : freq}Hz`, x, height - 5);
      });

      ctx.restore();

      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [getSpectrumData, getPeakFrequencies]);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (peaks.length === 0) return;
    const text = peaks.map((p, i) => `P${i + 1}: ${p.frequency} Hz (energy: ${p.energy})`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [peaks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #222', background: '#080808', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={12} color="#00c8ff" />
        <span style={{ fontSize: '10px', color: '#00c8ff', fontWeight: 'bold', letterSpacing: '0.5px' }}>SPECTRUM</span>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: '60px' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      <div style={{ padding: '6px 12px', borderTop: '1px solid #222', background: '#080808', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          {peaks.length > 0 ? peaks.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: '#555', fontWeight: 'bold' }}>P{i + 1}</span>
              <span style={{ fontSize: '12px', color: '#ffcc00', fontWeight: 'bold', fontFamily: 'monospace' }}>{p.frequency}</span>
              <span style={{ fontSize: '9px', color: '#666' }}>Hz</span>
            </div>
          )) : (
            <span style={{ fontSize: '10px', color: '#444' }}>—</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          disabled={peaks.length === 0}
          style={{
            background: copied ? 'rgba(0,255,100,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${copied ? 'rgba(0,255,100,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '4px',
            padding: '3px 8px',
            cursor: peaks.length > 0 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: copied ? '#00ff66' : '#888',
            fontSize: '9px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
          }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
    </div>
  );
};

export default SpectrumView;
