import React, { useCallback, useRef } from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  orientation?: 'vertical' | 'horizontal';
  springReturn?: boolean;
  fillFromBottom?: boolean;
  onChange: (value: number) => void;
  onRelease?: () => void;
  width?: number;
  height?: number;
  label?: string;
  color?: string;
}

export function Slider({
  value,
  min,
  max,
  orientation = 'vertical',
  springReturn = false,
  fillFromBottom = false,
  onChange,
  onRelease,
  width,
  height,
  label,
  color,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const animFrame = useRef<number>(0);

  const isVertical = orientation === 'vertical';
  const containerWidth = width ?? (isVertical ? 18 : 70);
  const containerHeight = height ?? (isVertical ? 70 : 18);
  const center = (min + max) / 2;
  const range = max - min;
  const fraction = range === 0 ? 0 : (value - min) / range;
  const centerFraction = range === 0 ? 0.5 : (center - min) / range;

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const positionToValue = useCallback(
    (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      let ratio: number;
      if (isVertical) {
        ratio = 1 - (clientY - rect.top) / rect.height;
      } else {
        ratio = (clientX - rect.left) / rect.width;
      }
      ratio = clamp(ratio, 0, 1);
      return min + ratio * range;
    },
    [isVertical, min, range, value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const v = positionToValue(e.clientX, e.clientY);
      onChange(v);

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const mv = positionToValue(ev.clientX, ev.clientY);
        onChange(mv);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);

        if (springReturn) {
          onChange(center);
        }
        onRelease?.();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [positionToValue, onChange, onRelease, springReturn, center],
  );

  // Fill geometry
  let fillStart: string;
  let fillSize: string;

  if (springReturn) {
    // Fill from center to value
    if (isVertical) {
      if (fraction >= centerFraction) {
        fillStart = `${(1 - fraction) * 100}%`;
        fillSize = `${(fraction - centerFraction) * 100}%`;
      } else {
        fillStart = `${(1 - centerFraction) * 100}%`;
        fillSize = `${(centerFraction - fraction) * 100}%`;
      }
    } else {
      if (fraction >= centerFraction) {
        fillStart = `${centerFraction * 100}%`;
        fillSize = `${(fraction - centerFraction) * 100}%`;
      } else {
        fillStart = `${fraction * 100}%`;
        fillSize = `${(centerFraction - fraction) * 100}%`;
      }
    }
  } else if (fillFromBottom) {
    // Fill from min to value
    if (isVertical) {
      fillStart = `${(1 - fraction) * 100}%`;
      fillSize = `${fraction * 100}%`;
    } else {
      fillStart = '0%';
      fillSize = `${fraction * 100}%`;
    }
  } else {
    // Default: same as fillFromBottom
    if (isVertical) {
      fillStart = `${(1 - fraction) * 100}%`;
      fillSize = `${fraction * 100}%`;
    } else {
      fillStart = '0%';
      fillSize = `${fraction * 100}%`;
    }
  }

  const fillColor = color ?? 'var(--accent-secondary)';

  // Thumb position
  const thumbThickness = 13;
  const thumbPos = isVertical
    ? `${(1 - fraction) * 100}%`
    : `${fraction * 100}%`;

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: containerWidth,
    height: containerHeight,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    userSelect: 'none',
    touchAction: 'none',
  };

  const trackStyle: React.CSSProperties = {
    position: 'relative',
    width: isVertical ? containerWidth : '100%',
    height: isVertical ? '100%' : containerHeight,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
  };

  const fillStyle: React.CSSProperties = {
    position: 'absolute',
    background: fillColor,
    opacity: 0.6,
    borderRadius: 2,
    ...(isVertical
      ? { left: 1, right: 1, top: fillStart, height: fillSize }
      : { top: 1, bottom: 1, left: fillStart, width: fillSize }),
  };

  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    background: 'var(--bg-control)',
    border: '1px solid var(--border-strong)',
    borderRadius: 3,
    pointerEvents: 'none',
    ...(isVertical
      ? {
          left: 1,
          right: 1,
          height: thumbThickness,
          top: thumbPos,
          transform: 'translateY(-50%)',
        }
      : {
          top: 1,
          bottom: 1,
          width: thumbThickness,
          left: thumbPos,
          transform: 'translateX(-50%)',
        }),
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--font-size-tiny)',
    color: 'var(--text-tertiary)',
    textAlign: 'center',
    lineHeight: 1,
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      <div
        ref={trackRef}
        style={trackStyle}
        onPointerDown={handlePointerDown}
      >
        <div style={fillStyle} />
        <div style={thumbStyle} />
      </div>
      {label && <div style={labelStyle}>{label}</div>}
    </div>
  );
}
