import React, { useEffect, useRef } from 'react';

interface MultiScopeViewProps {
  probes: string[];
  getProbedData: (name: string) => Float32Array | null;
}

const MultiScopeView: React.FC<MultiScopeViewProps> = ({ probes, getProbedData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const colors = [
      '#ffcc00', // Yellow
      '#00ff00', // Green
      '#00ccff', // Blue
      '#ff00ff', // Magenta
      '#ff5500', // Orange
      '#00ffaa', // Teal
    ];

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
      for (let i = 0; i < height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

      if (probes.length === 0) {
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO PROBES ACTIVE', width / 2, height / 2);
      }

      // Draw each probe in its own lane or overlaid
      const laneHeight = height / Math.max(1, probes.length);

      probes.forEach((probe, idx) => {
        const data = getProbedData(probe);
        if (!data) return;

        const color = colors[idx % colors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const sliceWidth = width / data.length;
        let x = 0;

        // Find min/max for auto-scaling
        let min = 0;
        let max = 0;
        for(let i=0; i<data.length; i++) {
          if (data[i] < min) min = data[i];
          if (data[i] > max) max = data[i];
        }
        const range = Math.max(0.0001, max - min);

        for (let i = 0; i < data.length; i++) {
          // Lane-based drawing
          const norm = (data[i] - min) / range;
          const y = (idx * laneHeight) + (laneHeight - norm * laneHeight * 0.8) - (laneHeight * 0.1);
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();

        // Label
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(probe, 5, (idx * laneHeight) + 12);
      });

      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [probes, getProbedData]);

  return (
    <div style={{ height: '250px', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden', marginTop: '10px' }}>
      <canvas ref={canvasRef} width={800} height={250} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default MultiScopeView;
