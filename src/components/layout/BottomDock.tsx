import { useCallback, useEffect, useRef, useState } from 'react';
import './BottomDock.css';

const STORAGE_KEY = 'dsplab-dock-height';
const MIN_HEIGHT = 80;
const DEFAULT_HEIGHT = 130;

function getMaxHeight(): number {
  return Math.floor(window.innerHeight * 0.5);
}

function loadHeight(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed >= MIN_HEIGHT) {
        return Math.min(parsed, getMaxHeight());
      }
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_HEIGHT;
}

function saveHeight(h: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(h));
  } catch {
    // localStorage unavailable
  }
}

interface BottomDockProps {
  children: React.ReactNode;
}

export function BottomDock({ children }: BottomDockProps) {
  const [height, setHeight] = useState(loadHeight);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startY.current = e.clientY;
      startHeight.current = height;
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const delta = startY.current - e.clientY;
      const next = Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), startHeight.current + delta));
      setHeight(next);
    },
    [dragging],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setHeight((h) => {
      saveHeight(h);
      return h;
    });
  }, [dragging]);

  // Clamp height when window resizes
  useEffect(() => {
    const onResize = () => {
      setHeight((h) => Math.min(h, getMaxHeight()));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="bottom-dock" style={{ height }}>
      <div
        className={`bottom-dock__handle${dragging ? ' bottom-dock__handle--dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {children}
    </div>
  );
}
