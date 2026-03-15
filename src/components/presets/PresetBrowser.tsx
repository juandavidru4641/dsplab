import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useCommunityPresets, loadPresetCode } from '../../useCommunityPresets';
import type { CommunityPreset } from '../../useCommunityPresets';
import './PresetBrowser.css';

interface PresetBrowserProps {
  onLoad: (code: string, name?: string) => void;
}

const PresetBrowser: React.FC<PresetBrowserProps> = ({ onLoad }) => {
  const { groups, loading } = useCommunityPresets();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  // Flatten all presets
  const allPresets = useMemo(
    () =>
      groups.flatMap(g =>
        g.presets.map(p => ({ ...p, author: g.author }))
      ),
    [groups]
  );

  // Derive categories from preset data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of allPresets) {
      const cat = p.meta?.category || p.meta?.role;
      if (cat) cats.add(cat);
    }
    return ['all', ...Array.from(cats).sort()];
  }, [allPresets]);

  // Filter presets
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allPresets.filter(p => {
      if (activeCategory !== 'all') {
        const cat = p.meta?.category || p.meta?.role || '';
        if (cat !== activeCategory) return false;
      }
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          (p.meta?.description ?? '').toLowerCase().includes(q) ||
          (p.meta?.tags ?? []).some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allPresets, activeCategory, search]);

  const handleClick = async (preset: CommunityPreset & { author: string }) => {
    setLoadingPath(preset.path);
    try {
      const code = await loadPresetCode(preset.path);
      onLoad(code, preset.name);
    } catch (e) {
      console.error('Failed to load preset:', e);
    } finally {
      setLoadingPath(null);
    }
  };

  return (
    <div className="preset-browser">
      {/* Search bar */}
      <div className="preset-browser__search">
        <Search size={14} color="var(--text-muted)" />
        <input
          className="preset-browser__search-input"
          type="text"
          placeholder="Search presets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category filter */}
      <div className="preset-browser__categories">
        {categories.map(cat => (
          <button
            key={cat}
            className={`preset-browser__category-pill${activeCategory === cat ? ' preset-browser__category-pill--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Preset list */}
      {loading ? (
        <div className="preset-browser__status">Loading presets...</div>
      ) : filtered.length === 0 ? (
        <div className="preset-browser__status">No presets found</div>
      ) : (
        <div className="preset-browser__list">
          {filtered.map(p => (
            <div
              key={p.path}
              className="preset-browser__item"
              onClick={() => handleClick(p)}
              style={loadingPath === p.path ? { opacity: 0.5 } : undefined}
            >
              <span className="preset-browser__item-name">{p.name}</span>
              <span className="preset-browser__item-author">{p.author}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PresetBrowser;
