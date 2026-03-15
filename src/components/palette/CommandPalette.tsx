import React, { useEffect, useRef, useState, useCallback } from 'react';
import './CommandPalette.css';

interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  commands: { id: string; label: string; shortcut?: string; category: string }[];
  onExecute: (id: string) => void;
  onClose: () => void;
}

function highlightMatch(label: string, query: string): React.ReactNode {
  if (!query) return label;
  const lower = label.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark>{label.slice(idx, idx + query.length)}</mark>
      {label.slice(idx + query.length)}
    </>
  );
}

export function CommandPalette({
  isOpen,
  query,
  onQueryChange,
  commands,
  onExecute,
  onClose,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when commands or query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [commands.length, query]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the element is in the DOM
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('.command-palette-item');
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < commands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : commands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (commands[selectedIndex]) {
            onExecute(commands[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [commands, selectedIndex, onExecute, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="command-palette-list" ref={listRef}>
          {commands.length === 0 ? (
            <div className="command-palette-empty">No matching commands</div>
          ) : (
            commands.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`command-palette-item${
                  i === selectedIndex ? ' command-palette-item--selected' : ''
                }`}
                onClick={() => onExecute(cmd.id)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="command-palette-item-label">
                  {highlightMatch(cmd.label, query)}
                </span>
                {cmd.shortcut && (
                  <span className="command-palette-shortcut">
                    {cmd.shortcut}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
