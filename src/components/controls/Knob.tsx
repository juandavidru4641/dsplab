import { useCallback, useRef } from 'react';
import './Knob.css';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  label?: string;
  color?: string;
  size?: 'standard' | 'compact';
  onChange: (value: number) => void;
}

const DRAG_RANGE_PX = 400;
const START_ANGLE_DEG = 135;
const SWEEP_DEG = 270;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function clampAndStep(val: number, min: number, max: number, step?: number): number {
  let v = Math.max(min, Math.min(max, val));
  if (step !== undefined && step > 0) {
    v = Math.round((v - min) / step) * step + min;
    v = Math.max(min, Math.min(max, v));
  }
  return v;
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  if (Math.abs(value) < 10) return value.toFixed(2);
  if (Math.abs(value) < 100) return value.toFixed(1);
  return Math.round(value).toString();
}

export function Knob({
  value,
  min,
  max,
  step,
  defaultValue,
  label,
  color,
  size = 'standard',
  onChange,
}: KnobProps) {
  const dragState = useRef<{ startY: number; startValue: number } | null>(null);

  const diameter = size === 'compact' ? 36 : 48;
  const cx = diameter / 2;
  const cy = diameter / 2;
  const strokeWidth = 3;
  const arcRadius = (diameter - strokeWidth) / 2;
  const indicatorOuterR = arcRadius - 2;
  const indicatorInnerR = indicatorOuterR * 0.35;

  const normalized = max > min ? (value - min) / (max - min) : 0;
  const accentColor = color ?? 'var(--accent-primary)';

  const trackPath = describeArc(cx, cy, arcRadius, START_ANGLE_DEG, START_ANGLE_DEG + SWEEP_DEG);

  const valueEndDeg = START_ANGLE_DEG + normalized * SWEEP_DEG;
  const valuePath =
    normalized > 0.001
      ? describeArc(cx, cy, arcRadius, START_ANGLE_DEG, valueEndDeg)
      : undefined;

  const indicatorEnd = polarToCartesian(cx, cy, indicatorOuterR, valueEndDeg);
  const indicatorStart = polarToCartesian(cx, cy, indicatorInnerR, valueEndDeg);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startValue: value };

      const handleMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const dy = dragState.current.startY - ev.clientY;
        const sensitivity = ev.shiftKey ? 0.1 : 1;
        const range = max - min;
        const delta = (dy / DRAG_RANGE_PX) * range * sensitivity;
        const newValue = clampAndStep(dragState.current.startValue + delta, min, max, step);
        onChange(newValue);
      };

      const handleUp = () => {
        dragState.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [value, min, max, step, onChange],
  );

  const handleDoubleClick = useCallback(() => {
    if (defaultValue !== undefined) {
      onChange(clampAndStep(defaultValue, min, max, step));
    }
  }, [defaultValue, min, max, step, onChange]);

  return (
    <div className="knob" onDoubleClick={handleDoubleClick}>
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        onPointerDown={handlePointerDown}
      >
        {/* Track arc */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--bg-control)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Center circle */}
        <circle cx={cx} cy={cy} r={arcRadius * 0.45} fill="var(--bg-elevated)" />
        {/* Indicator line */}
        <line
          x1={indicatorStart.x}
          y1={indicatorStart.y}
          x2={indicatorEnd.x}
          y2={indicatorEnd.y}
          stroke={accentColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <span className="knob__value" style={{ color: accentColor }}>
        {formatValue(value)}
      </span>
      {label && <span className="knob__label">{label}</span>}
    </div>
  );
}
