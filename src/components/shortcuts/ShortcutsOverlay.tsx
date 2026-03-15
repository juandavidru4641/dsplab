import React from 'react';
import './ShortcutsOverlay.css';

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: { key: string; meta?: boolean; shift?: boolean; description: string; category: string }[];
}

function formatKey(shortcut: { key: string; meta?: boolean; shift?: boolean }): string {
  const parts: string[] = [];
  if (shortcut.meta) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    parts.push(isMac ? '\u2318' : 'Ctrl');
  }
  if (shortcut.shift) parts.push('\u21E7');
  const keyLabel = shortcut.key === 'Space' ? 'Space' : shortcut.key.toUpperCase();
  parts.push(keyLabel);
  return parts.join(' + ');
}

const ShortcutsOverlay: React.FC<ShortcutsOverlayProps> = ({ isOpen, onClose, shortcuts }) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const categories: Record<string, typeof shortcuts> = {};
  for (const s of shortcuts) {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  }

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>&times;</button>
        </div>
        <div className="shortcuts-grid">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category} className="shortcuts-category">
              <h3 className="shortcuts-category-heading">{category}</h3>
              {items.map((s, i) => (
                <div key={i} className="shortcuts-row">
                  <span className="shortcuts-label">{s.description}</span>
                  <kbd className="shortcuts-key">{formatKey(s)}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShortcutsOverlay;
export type { ShortcutsOverlayProps };
