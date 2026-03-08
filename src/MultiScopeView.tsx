import React, { useEffect, useRef, useState } from 'react';

interface MultiScopeViewProps {
  probes: string[];
  getProbedData: (name: string) => Float32Array | null;
}

const MultiScopeView: React.FC<MultiScopeViewProps> = ({ probes, getProbedData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Record<string, number[]>>({});
  const [timebase, setTimebase] = useState(500); // Number of points to show

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
        animationFrame = requestAnimationFrame(render);
        return;
      }

      // Update History from latest probe data
      probes.forEach(probe => {
        const data = getProbedData(probe);
        if (data) {
          if (!historyRef.current[probe]) historyRef.current[probe] = [];
          // Capture the latest value from the audio block for plotting
          const latestVal = data[data.length - 1];
          historyRef.current[probe].push(latestVal);
          // Keep history limited to 2x timebase for smooth scrolling
          if (historyRef.current[probe].length > timebase) {
            historyRef.current[probe].shift();
          }
        }
      });

      const laneHeight = height / probes.length;

      probes.forEach((probe, idx) => {
        const history = historyRef.current[probe];
        if (!history || history.length < 2) return;

        const color = colors[idx % colors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const sliceWidth = width / (timebase - 1);
        
        // Auto-scale logic
        let min = Math.min(...history);
        let max = Math.max(...history);
        let range = Math.max(0.0001, max - min);

        history.forEach((val, i) => {
          const norm = (val - min) / range;
          const x = i * sliceWidth;
          const y = (idx * laneHeight) + (laneHeight - norm * laneHeight * 0.8) - (laneHeight * 0.1);
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Label and Value
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.fillText(`${probe}: ${history[history.length-1].toFixed(4)}`, 5, (idx * laneHeight) + 12);
      });

      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [probes, getProbedData, timebase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <span style={{ fontSize: '8px', color: '#666' }}>TIMEBASE</span>
        <input 
          type="range" min="100" max="2000" value={timebase} 
          onChange={(e) => setTimebase(parseInt(e.target.value))}
          style={{ width: '80px', height: '10px' }}
        />
      </div>
      <div style={{ height: '250px', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
        <canvas ref={canvasRef} width={800} height={250} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

export default MultiScopeView;
