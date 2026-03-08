import React, { useState, useEffect } from 'react';
import { Search, X, Activity } from 'lucide-react';

interface StateInspectorProps {
  getLiveState: () => Record<string, any>;
  onProbe: (name: string) => void;
  activeProbes: string[];
}

const StateInspector: React.FC<StateInspectorProps> = ({ getLiveState, onProbe, activeProbes }) => {
  const [state, setState] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setState(getLiveState());
    }, 100);
    return () => clearInterval(interval);
  }, [getLiveState]);

  const filteredKeys = Object.keys(state).filter(k => 
    k.toLowerCase().includes(filter.toLowerCase())
  ).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', borderLeft: '1px solid #333' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={14} color="#666" />
        <input 
          type="text" 
          placeholder="Filter variables..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '12px', outline: 'none' }}
        />
        {filter && <X size={14} color="#666" style={{ cursor: 'pointer' }} onClick={() => setFilter('')} />}
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Fira Code', monospace" }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
              <th style={{ fontSize: '9px', color: '#666', padding: '4px' }}>VAR</th>
              <th style={{ fontSize: '9px', color: '#666', padding: '4px', textAlign: 'right' }}>VALUE</th>
              <th style={{ width: '20px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map(key => {
              const isProbed = activeProbes.includes(key);
              return (
                <tr key={key} style={{ borderBottom: '1px solid #252525' }}>
                  <td style={{ fontSize: '9px', color: '#aaa', padding: '6px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key}</td>
                  <td style={{ fontSize: '9px', color: '#ffcc00', padding: '6px 4px', textAlign: 'right' }}>
                    {typeof state[key] === 'number' ? state[key].toFixed(5) : String(state[key])}
                  </td>
                  <td style={{ padding: '4px' }}>
                    {typeof state[key] === 'number' && (
                      <Activity 
                        size={12} 
                        style={{ cursor: 'pointer', color: isProbed ? '#00ff00' : '#444' }} 
                        onClick={() => onProbe(key)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StateInspector;
