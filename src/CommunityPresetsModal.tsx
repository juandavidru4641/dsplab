import React, { useState, useEffect } from 'react';
import { X, Search, PackageOpen, Activity } from 'lucide-react';
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

  const filteredPresets = communityGroups.flatMap(group => 
    group.presets.filter((p: any) => 
      p.name.toLowerCase().includes(filter.toLowerCase()) || 
      p.author.toLowerCase().includes(filter.toLowerCase()) ||
      p.meta?.description?.toLowerCase().includes(filter.toLowerCase())
    ).map((p: any) => ({ ...p, author: group.author }))
  ).sort((a, b) => a.name.localeCompare(b.name));

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

  const allPresets = communityGroups.flatMap(group => 
    group.presets.map((p: any) => ({ ...p, author: group.author }))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredPresets = allPresets.filter(p => {
    const role = p.meta?.role || 'effect';
    const matchesFilter = activeFilter === 'all' || role === activeFilter;
    const matchesSearch = filter.length === 0 || 
      p.name.toLowerCase().includes(filter.toLowerCase()) || 
      p.author.toLowerCase().includes(filter.toLowerCase()) ||
      p.meta?.description?.toLowerCase().includes(filter.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  useEffect(() => {
    if (!selectedPreset && filteredPresets.length > 0) {
      setSelectedPreset(filteredPresets[0]);
    } else if (filteredPresets.length === 0) {
      setSelectedPreset(null);
    }
  }, [filter, activeFilter, communityGroups]);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'rgba(30,30,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
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
          <div style={{ width: '300px', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px', display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['all', 'instrument', 'effect', 'utility'].map(f => (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  flex: 1, background: activeFilter === f ? 'rgba(0,255,204,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${activeFilter === f ? 'rgba(0,255,204,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '6px', padding: '6px 0', color: activeFilter === f ? '#00ffcc' : '#888', fontSize: '10px',
                  fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s'
                }}>{f}</button>
              ))}
            </div>
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
              {communityLoading ? <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', padding: '20px' }}>Loading...</div> :
                filteredPresets.map(p => (
                  <div key={p.path} onClick={() => setSelectedPreset(p)} style={{
                    padding: '8px 20px', cursor: 'pointer',
                    background: selectedPreset?.path === p.path ? 'rgba(0,122,204,0.2)' : 'transparent',
                    borderLeft: `3px solid ${selectedPreset?.path === p.path ? '#007acc' : 'transparent'}`,
                    transition: 'background 0.2s'
                  }}>
                    <div style={{ fontWeight: 'bold', color: selectedPreset?.path === p.path ? '#fff' : '#aaa' }}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: '#666' }}>by {p.author}</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Right Panel: Details */}
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'rgba(0,0,0,0.2)' }}>
            {selectedPreset ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#00ffcc' }}>{selectedPreset.name}</div>
                <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>by {selectedPreset.author}</div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '4px', alignSelf: 'flex-start', fontSize: '10px', color: '#aaa', fontWeight: 'bold' }}>
                  TYPE: <span style={{ color: '#00ffcc' }}>{selectedPreset.meta?.role || 'Effect'}</span>
                </div>
                <p style={{ color: '#bbb', fontSize: '14px', lineHeight: 1.6 }}>{selectedPreset.meta?.description || 'No description provided.'}</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '20px' }}>
                  <button 
                    onClick={() => handleLoad(selectedPreset.path, selectedPreset.name)} 
                    disabled={loadingPreset === selectedPreset.path}
                    style={{
                      flex: 1, background: 'rgba(0,122,204,0.4)', border: '1px solid #007acc',
                      borderRadius: '6px', padding: '10px', color: '#fff', fontSize: '12px', fontWeight: 'bold',
                      cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    {loadingPreset === selectedPreset.path ? 'Loading...' : 'LOAD'}
                  </button>
                  <button 
                    onClick={() => handleInsert(selectedPreset.path)} 
                    disabled={loadingPreset === selectedPreset.path}
                    style={{
                      flex: 1, background: 'rgba(255,204,0,0.2)', border: '1px solid #ffcc00',
                      borderRadius: '6px', padding: '10px', color: '#ffcc00', fontSize: '12px', fontWeight: 'bold',
                      cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    {loadingPreset === selectedPreset.path ? 'Loading...' : 'INSERT'}
                  </button>
                </div>
              </div>
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