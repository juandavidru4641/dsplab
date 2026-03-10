import React, { useEffect, useRef, useState } from 'react';

interface StatsViewProps {
  getDSPStats: () => Record<string, string | number>;
}

const StatsView: React.FC<StatsViewProps> = ({ getDSPStats }) => {
  const [stats, setStats] = useState<Record<string, string | number>>({});
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    const update = () => setStats(getDSPStats());
    update();
    intervalRef.current = window.setInterval(update, 500);
    return () => window.clearInterval(intervalRef.current);
  }, [getDSPStats]);

  const entries = Object.entries(stats);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
      border: '1px solid #333', background: '#080808', borderRadius: '6px',
      padding: '6px 12px', overflow: 'hidden', flexWrap: 'wrap',
    }}>
      {entries.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '3px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '8px', color: '#555', fontWeight: 'bold', textTransform: 'uppercase' }}>{key}</span>
          <span style={{ fontSize: '10px', color: '#ccc', fontWeight: 'bold', fontFamily: 'monospace' }}>{String(val)}</span>
        </div>
      ))}
    </div>
  );
};

export default StatsView;
