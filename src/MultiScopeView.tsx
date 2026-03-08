import React, { useEffect, useRef, useState } from 'react';

interface MultiScopeViewProps {
  probes: string[];
  onStateUpdate: (callback: (state: Record<string, any>, probes: Record<string, number[]>) => void) => () => void;
}

const MultiScopeView: React.FC<MultiScopeViewProps> = ({ probes, onStateUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Record<string, number[]>>({});
  const [timebase, setTimebase] = useState(1000);
  const dimensionsRef = useRef({ width: 800, height: 250, dpr: 1 });

  useEffect(() => {
    // Subscribe to fresh data packets only
    const unsubscribe = onStateUpdate((_state, probesData) => {
      probes.forEach(probe => {
        const newData = probesData[probe];
        if (newData && newData.length > 0) {
          if (!historyRef.current[probe]) historyRef.current[probe] = [];
          historyRef.current[probe].push(...newData);
          // Limit history to max possible timebase
          if (historyRef.current[probe].length > 5000) {
            historyRef.current[probe] = historyRef.current[probe].slice(-5000);
          }
        }
      });
    });
    return unsubscribe;
  }, [onStateUpdate, probes]);

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

    const colors = [
      '#ffcc00', '#00ff00', '#00ccff', '#ff00ff', '#ff5500', '#00ffaa',
    ];

    const render = () => {
      const { width, height, dpr } = dimensionsRef.current;
      
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
      for (let i = 0; i < height; i += 20) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

      if (probes.length === 0) {
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO PROBES ACTIVE', width / 2, height / 2);
        ctx.restore();
        animationFrame = requestAnimationFrame(render);
        return;
      }

      const laneHeight = height / probes.length;

      probes.forEach((probe, idx) => {
        let history = historyRef.current[probe] || [];
        if (history.length < 2) return;

        const displayHistory = history.slice(-timebase);

        if (idx > 0) {
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, idx * laneHeight); ctx.lineTo(width, idx * laneHeight); ctx.stroke();
        }

        const color = colors[idx % colors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const sliceWidth = width / (timebase - 1);
        
        let min = displayHistory[0];
        let max = displayHistory[0];
        for (let i = 1; i < displayHistory.length; i++) {
          if (displayHistory[i] < min) min = displayHistory[i];
          if (displayHistory[i] > max) max = displayHistory[i];
        }
        let range = Math.max(0.0001, max - min);
        const isLogic = range === 1.0 && (min === 0 || min === -1);

        displayHistory.forEach((val, i) => {
          const norm = (val - min) / range;
          const x = i * sliceWidth;
          const y = (idx * laneHeight) + (laneHeight - norm * laneHeight * 0.8) - (laneHeight * 0.1);
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            if (isLogic) {
              const prevNorm = (displayHistory[i-1] - min) / range;
              ctx.lineTo(x, (idx * laneHeight) + (laneHeight - prevNorm * laneHeight * 0.8) - (laneHeight * 0.1));
            }
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        ctx.font = 'bold 10px monospace';
        const labelText = `${probe}: ${displayHistory[displayHistory.length-1].toFixed(4)}`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(2, (idx * laneHeight) + 2, textWidth + 6, 14);
        ctx.fillStyle = color;
        ctx.fillText(labelText, 5, (idx * laneHeight) + 12);
      });

      ctx.restore();
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [probes, timebase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <span style={{ fontSize: '8px', color: '#666' }}>TIMEBASE</span>
        <input 
          type="range" min="100" max="5000" value={timebase} 
          onChange={(e) => setTimebase(parseInt(e.target.value))}
          style={{ width: '80px', height: '10px' }}
        />
      </div>
      <div style={{ flex: 1, border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden', minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  );
};

export default MultiScopeView;
