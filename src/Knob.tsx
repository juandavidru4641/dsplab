import React, { useState, useEffect, useRef } from 'react';

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (val: number) => void;
  size?: number;
  color?: string;
  isFloat?: boolean;
}

export const Knob: React.FC<KnobProps> = ({ value, min, max, label, onChange, size = 32, color = '#ffcc00', isFloat = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const isFineMode = useRef(false);
  
  // Use a ref for onChange to prevent effect re-runs when parent passes new anonymous functions
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    isFineMode.current = e.shiftKey;
    document.body.style.cursor = 'ns-resize';
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    setIsDragging(true);
    startY.current = e.touches[0].clientY;
    startValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientY: number, shiftKey: boolean) => {
      const deltaY = startY.current - clientY;
      const range = max - min;
      
      // Standard: 400 pixels, Fine: 2000 pixels
      const pixelRange = (shiftKey || isFineMode.current) ? 2000 : 400;
      const step = range / pixelRange;
      
      let newValue = startValue.current + deltaY * step;
      newValue = Math.max(min, Math.min(max, newValue));
      
      if (isFloat) {
        onChangeRef.current(newValue);
      } else {
        onChangeRef.current(Math.round(newValue));
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientY, e.shiftKey);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      handleMove(e.touches[0].clientY, false);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isDragging, max, min, isFloat]); // Removed onChangeRef.current as dependency

  // SVG angle calculation: -135 to 135 degrees (270 degree sweep)
  const angle = ((value - min) / (max - min)) * 270 - 135;

  // Extract CC number from label if it follows the "[CC] Name" pattern
  const ccMatch = label.match(/^\[(\d+)\]\s*(.*)/);
  const ccNum = ccMatch ? ccMatch[1] : null;
  const paramName = ccMatch ? ccMatch[2] : label;

  return (
    <div className="knob-unit" style={{ width: size + 10, userSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
      {ccNum && (
        <div style={{ fontSize: '11px', fontWeight: '900', color: '#ffcc00', lineHeight: '1', marginBottom: '1px' }}>
          {ccNum}
        </div>
      )}
      <div className="knob-label" style={{ 
        fontSize: '9px', 
        color: '#ccc', 
        marginBottom: '2px', 
        textAlign: 'center', 
        whiteSpace: 'nowrap', 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        maxWidth: '100%',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {paramName}
      </div>
      
      <div 
        onMouseDown={onMouseDown} 
        onTouchStart={onTouchStart}
        style={{ 
          width: size, 
          height: size, 
          position: 'relative', 
          cursor: 'ns-resize',
          touchAction: 'none'
        }}
      >
        <svg width={size} height={size} viewBox="0 0 40 40">
          <circle cx="20" cy="22" r="16" fill="rgba(0,0,0,0.3)" />
          <circle cx="20" cy="20" r="18" fill="#1a1a1a" stroke="#444" strokeWidth="1" />
          <path 
            d="M 10 32 A 16 16 0 1 1 30 32" 
            fill="none" 
            stroke="#000" 
            strokeWidth="3" 
            strokeLinecap="round" 
          />
          <path 
            d="M 10 32 A 16 16 0 1 1 30 32" 
            fill="none" 
            stroke={color} 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeDasharray={`${((value - min) / (max - min)) * 75} 100`}
            style={{ 
              transition: isDragging ? 'none' : 'stroke-dasharray 0.15s ease-out',
              filter: `drop-shadow(0 0 2px ${color})` 
            }}
          />
          <g transform={`rotate(${angle} 20 20)`}>
            <circle cx="20" cy="20" r="13" fill="#2a2a2a" stroke="#111" strokeWidth="0.5" />
            <rect x="19" y="6" width="2" height="10" rx="1" fill={color} />
            <rect x="19.5" y="6" width="1" height="10" rx="0.5" fill="rgba(255,255,255,0.3)" />
          </g>
        </svg>
      </div>
      
      <div className="knob-value" style={{ 
        fontSize: '8px', 
        color: color, 
        marginTop: '2px', 
        textAlign: 'center',
        fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.3)',
        padding: '0 2px',
        borderRadius: '2px',
        minWidth: '24px'
      }}>
        {isFloat ? value.toFixed(2) : Math.round(value)}
      </div>
    </div>
  );
};
