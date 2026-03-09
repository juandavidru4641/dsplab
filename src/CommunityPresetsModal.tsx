import React, { useState, useEffect } from 'react';
import { X, Search, PackageOpen, Activity } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { loadPresetCode } from './useCommunityPresets';

interface CommunityPresetsModalProps {
  onClose: () => void;
  onLoad: (code: string, name: string) => void;
  onInsert: (code: string) => void;
  communityGroups: any[];
  communityLoading: boolean;
}

const CommunityPresetsModal: React.FC<CommunityPresetsModalProps> = ({ onClose, onLoad, onInsert, communityGroups, communityLoading }) => {
  const [filter, setFilter] = useState('');
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);

  const handleLoad = async (path: string, name: string) => {
    setLoadingPreset(path);
    try {
      const code = await loadPresetCode(path);
      onLoad(code, name);
      onClose(); // Close modal after loading
    } catch (e) {
      console.error('Failed to load preset:', e);
      alert('Failed to load preset. Check console for details.');
    } finally {
      setLoadingPreset(null);
    }
  };

  const handleInsert = async (path: string) => {
    setLoadingPreset(path);
    try {
      const code = await loadPresetCode(path);
      onInsert(code);
      // Keep modal open for multiple inserts if desired, or close: onClose();
    } catch (e) {
      console.error('Failed to insert preset:', e);
      alert('Failed to insert preset. Check console for details.');
    } finally {
      setLoadingPreset(null);
    }
  };

  const [selectedPreset, setSelectedPreset] = useState<any | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeAuthor, setActiveAuthor] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [previewCode, setPreviewCode] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);

  const allPresets = communityGroups.flatMap(group => 
    group.presets.map((p: any) => ({ ...p, author: group.author }))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const authors = ['all', ...Array.from(new Set(allPresets.map(p => p.author)))];
  
  const allTags = allPresets.flatMap(p => p.meta?.tags || []);
  const tagFrequencies = allTags.reduce((acc, tag) => { acc[tag] = (acc[tag] || 0) + 1; return acc; }, {} as Record<string, number>);
  const topTags = Object.keys(tagFrequencies).sort((a, b) => tagFrequencies[b] - tagFrequencies[a]).slice(0, 10);
  const tagsToShow = showAllTags ? Object.keys(tagFrequencies).sort() : topTags;

  const filteredPresets = allPresets.filter(p => {
    const role = p.meta?.role || 'effect';
    const matchesRole = activeFilter === 'all' || role === activeFilter;
    const matchesAuthor = activeAuthor === 'all' || p.author === activeAuthor;
    const matchesTag = activeTag === 'all' || (p.meta?.tags || []).includes(activeTag);
    const matchesSearch = filter.length === 0 || 
      p.name.toLowerCase().includes(filter.toLowerCase()) || 
      p.author.toLowerCase().includes(filter.toLowerCase()) ||
      p.meta?.description?.toLowerCase().includes(filter.toLowerCase());
    return matchesRole && matchesAuthor && matchesTag && matchesSearch;
  });

  useEffect(() => {
    if (filteredPresets.length > 0) {
      const isSelectedPresetInList = filteredPresets.some(p => p.path === selectedPreset?.path);
      if (!isSelectedPresetInList) {
        setSelectedPreset(filteredPresets[0]);
      }
    } else {
      setSelectedPreset(null);
    }
  }, [filter, activeFilter, activeAuthor, activeTag, communityGroups]);

  useEffect(() => {
    if (selectedPreset) {
      setPreviewCode('// Loading preview...');
      loadPresetCode(selectedPreset.path)
        .then(code => setPreviewCode(code))
        .catch(() => setPreviewCode('// Could not load preview.'));
    }
  }, [selectedPreset]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'rgba(30,30,30,1)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
        width: '90vw', maxWidth: '1000px', height: '90vh', maxHeight: '800px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 15px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PackageOpen size={24} color="#00ffcc" />
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#00ffcc', letterSpacing: '1px', textShadow: '0 0 8px rgba(0,255,204,0.3)' }}>COMMUNITY LIBRARY</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Panel: Filters & List */}
          <div style={{ width: '350px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Search size={16} color="#888" />
              <input
                type="text" placeholder="Filter presets..." value={filter} onChange={(e) => setFilter(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', outline: 'none' }}
              />
            </div>
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
              <div style={{ padding: '5px 20px 10px', fontSize: '10px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase' }}>Categories</div>
              <div style={{ padding: '0 10px 10px', display: 'flex', gap: '6px' }}>
                {['all', 'instrument', 'effect', 'utility'].map(f => (
                  <button key={f} onClick={() => { setActiveFilter(f); setActiveAuthor('all'); setActiveTag('all'); }} style={{
                    flex: 1, background: activeFilter === f ? 'rgba(0,255,204,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${activeFilter === f ? 'rgba(0,255,204,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '6px', padding: '6px 0', color: activeFilter === f ? '#00ffcc' : '#888', fontSize: '10px',
                    fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s'
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ padding: '10px 20px', fontSize: '10px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Tags</div>
              <div style={{ padding: '10px 20px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tagsToShow.map(tag => (
                  <button key={tag} onClick={() => setActiveTag(tag)} style={{
                    background: activeTag === tag ? 'rgba(255,204,0,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${activeTag === tag ? 'rgba(255,204,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '4px', padding: '4px 8px', color: activeTag === tag ? '#ffcc00' : '#888', fontSize: '10px',
                    fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                  }}>{tag}</button>
                ))}
              </div>
              <div style={{ padding: '10px 20px', fontSize: '10px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Authors</div>
              {authors.map(author => (
                <div key={author} onClick={() => { setActiveAuthor(author); setActiveFilter('all'); setActiveTag('all'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 20px', cursor: 'pointer', background: activeAuthor === author ? 'rgba(0,122,204,0.2)' : 'transparent' }}>
                  <img src={`https://github.com/${author}.png`} style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <span style={{ fontWeight: 'bold', color: activeAuthor === author ? '#fff' : '#888' }}>{author}</span>
                </div>
              ))}
              <div style={{ padding: '10px 20px', fontSize: '10px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Presets</div>
              {communityLoading ? <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', padding: '20px' }}>Loading...</div> :
                filteredPresets.map(p => (
                  <div key={p.path} onClick={() => setSelectedPreset(p)} style={{ padding: '8px 20px', cursor: 'pointer', background: selectedPreset?.path === p.path ? 'rgba(0,122,204,0.2)' : 'transparent', borderLeft: `3px solid ${selectedPreset?.path === p.path ? '#007acc' : 'transparent'}` }}>
                    <div style={{ fontWeight: 'bold', color: selectedPreset?.path === p.path ? '#fff' : '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{p.name}</span>
                      <span style={{ fontSize: '9px', color: '#666', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{p.meta?.role?.slice(0,4).toUpperCase() || 'FX'}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Right Panel: Details */}
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
            {selectedPreset ? (
              <>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#00ffcc', letterSpacing: '0.5px' }}>{selectedPreset.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={`https://github.com/${selectedPreset.author}.png`} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ fontSize: '14px', color: '#aaa', fontWeight: 'bold' }}>by {selectedPreset.author}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid rgba(0,255,204,0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: '#00ffcc', fontWeight: 'bold' }}>
                      {selectedPreset.meta?.role || 'Effect'}
                    </div>
                    {(selectedPreset.meta?.tags || []).map((tag: string) => (
                      <div key={tag} style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: '#aaa', fontWeight: 'bold' }}>{tag}</div>
                    ))}
                  </div>
                  <p style={{ color: '#bbb', fontSize: '14px', lineHeight: 1.6, marginTop: '10px' }}>{selectedPreset.meta?.description || 'No description provided.'}</p>
                </div>
                <div style={{ flex: 1, minHeight: '100px', background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <Editor
                    height="100%"
                    language="vult"
                    theme="vs-dark"
                    value={previewCode}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      scrollBeyondLastLine: false,
                      glyphMargin: false,
                      lineNumbersMinChars: 3,
                    }}
                  />
                </div>
                <div style={{ padding: '20px', display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleLoad(selectedPreset.path, selectedPreset.name)} disabled={loadingPreset === selectedPreset.path} style={{ flex: 1, background: 'rgba(0,122,204,0.4)', border: '1px solid #007acc', borderRadius: '6px', padding: '12px', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                    {loadingPreset === selectedPreset.path ? <Activity size={16} className="animate-spin" /> : 'LOAD'}
                  </button>
                  <button onClick={() => handleInsert(selectedPreset.path)} disabled={loadingPreset === selectedPreset.path} style={{ flex: 1, background: 'rgba(255,204,0,0.2)', border: '1px solid #ffcc00', borderRadius: '6px', padding: '12px', color: '#ffcc00', fontWeight: 'bold', fontSize: '14px' }}>
                    {loadingPreset === selectedPreset.path ? <Activity size={16} className="animate-spin" /> : 'INSERT'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ color: '#666', textAlign: 'center', paddingTop: '50px' }}>
                {communityLoading ? 'Loading presets...' : 'No preset selected or available.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityPresetsModal;