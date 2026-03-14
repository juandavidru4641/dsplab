import React from 'react';

interface PillProps {
  children: React.ReactNode;
  color: string;
}

export function Pill({ children, color }: PillProps) {
  return (
    <span
      className="pill"
      style={{
        color,
        background: `${color}15`,
      }}
    >
      {children}
    </span>
  );
}
