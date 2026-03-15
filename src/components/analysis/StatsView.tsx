import React, { useEffect, useRef, useState } from 'react';
import VUMeter from './VUMeter';
import './StatsView.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatsViewProps {
  getDSPStats: () => Record<string, any> | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse a display string like "-12.4 dBFS" into a dB number. */
function parseDb(s: string | undefined): number {
  if (!s || s === '—' || s === '--') return -Infinity;
  const m = s.match(/([-+]?\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : -Infinity;
}

/** Parse a display string like "0.03%" into a number. */
function parsePercent(s: string | undefined): number {
  if (!s || s === '—' || s === '--') return NaN;
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** Convert dB value to 0-1 linear level, clamped. */
function dbToLevel(db: number): number {
  if (!isFinite(db) || db <= -100) return 0;
  const level = Math.pow(10, db / 20);
  return Math.max(0, Math.min(1, level));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const StatsView: React.FC<StatsViewProps> = ({ getDSPStats }) => {
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const result = getDSPStats();
      // Only update if we got something with data
      if (result && Object.keys(result).length > 0) {
        setStats(result);
      }
    };
    update();
    intervalRef.current = window.setInterval(update, 100);
    return () => window.clearInterval(intervalRef.current);
  }, [getDSPStats]);

  // AudioEngine returns { L: { RMS: "...", Peak: "...", ... }, R: { ... }, Fs: "..." }
  const left = stats?.L as Record<string, string> | undefined;
  const right = stats?.R as Record<string, string> | undefined;

  // Derive VU meter levels from parsed dB values
  const leftRmsDb = parseDb(left?.RMS);
  const rightRmsDb = parseDb(right?.RMS);
  const leftPeakDb = parseDb(left?.Peak);
  const rightPeakDb = parseDb(right?.Peak);

  const leftLevel = dbToLevel(leftRmsDb);
  const rightLevel = dbToLevel(rightRmsDb);
  const leftPeak = dbToLevel(leftPeakDb);
  const rightPeak = dbToLevel(rightPeakDb);

  // Build display rows from left channel display strings
  const rows: Array<{ label: string; value: string; good?: boolean }> = left
    ? [
        { label: 'RMS', value: left.RMS || '--' },
        { label: 'Peak', value: left.Peak || '--' },
        {
          label: 'THD',
          value: left['THD+N'] || left.THD || '--',
          good: parsePercent(left['THD+N'] || left.THD) < 1,
        },
        { label: 'SNR', value: left.SNR || '--' },
      ]
    : [
        { label: 'RMS', value: '--' },
        { label: 'Peak', value: '--' },
        { label: 'THD', value: '--' },
        { label: 'SNR', value: '--' },
      ];

  return (
    <div className="stats-view">
      <div className="stats-view__header">
        <span className="stats-view__title">STATS</span>
      </div>
      <div className="stats-view__body">
        <div className="stats-view__meters">
          <VUMeter level={leftLevel} peak={leftPeak} label="L" />
          <VUMeter level={rightLevel} peak={rightPeak} label="R" />
        </div>
        <div className="stats-view__table">
          {rows.map((row) => (
            <div className="stats-view__row" key={row.label}>
              <span className="stats-view__label">{row.label}</span>
              <span
                className={`stats-view__value${row.good ? ' stats-view__value--good' : ''}`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export { StatsView };
export type { StatsViewProps };
export default StatsView;
