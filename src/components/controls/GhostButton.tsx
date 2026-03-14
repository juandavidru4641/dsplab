import React from 'react';

interface GhostButtonProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export function GhostButton({ children, active, onClick, title, className }: GhostButtonProps) {
  return (
    <button
      className={`ghost-btn ${active ? 'ghost-btn--active' : ''} ${className ?? ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
