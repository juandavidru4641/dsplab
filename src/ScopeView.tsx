import React, { useEffect, useRef } from 'react';

interface ScopeViewProps {
  getScopeData: () => Float32Array;
  getSpectrumData: () => Uint8Array;
  getProbedData?: (name: string) => Float32Array | null;
  probes?: string[];
}

const ScopeView: React.FC<ScopeViewProps> = ({ getScopeData, getSpectrumData, getProbedData, probes = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const render = () => {
      const scopeData = getScopeData();
      const spectrumData = getSpectrumData();
      const width = canvas.width;
      const height = canvas.height;
      const halfHeight = height / 2;

      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
      for (let i = 0; i < height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

      // Spectrum
      ctx.fillStyle = 'rgba(0, 100, 255, 0.1)';
      const barWidth = width / 128;
      for (let i = 0; i < 128; i++) {
        const val = spectrumData[i * Math.floor(spectrumData.length / 128)];
        const barHeight = (val / 255) * height * 0.8;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
      }

      // Main Output Trace (Trace A)
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff00';
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let sliceWidth = width / scopeData.length;
      let x = 0;
      for (let i = 0; i < scopeData.length; i++) {
        const y = (scopeData[i] * halfHeight * 0.9) + halfHeight;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      // Probed Trace (Trace B - if active)
      if (probes.length > 0 && getProbedData) {
        const probedData = getProbedData(probes[0]);
        if (probedData) {
          ctx.shadowColor = '#ffcc00';
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]); // Dashed for trace B
          ctx.beginPath();
          x = 0;
          sliceWidth = width / probedData.length;
          for (let i = 0; i < probedData.length; i++) {
            const y = (probedData[i] * halfHeight * 0.9) + halfHeight;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.shadowBlur = 0;
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [getScopeData, getSpectrumData, getProbedData, probes]);

  return (
    <div style={{ height: '200px', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={800} height={200} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default ScopeView;
