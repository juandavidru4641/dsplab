import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface StateInspectorProps {
  getLiveState: () => Record<string, any>;
}

const StateInspector: React.FC<StateInspectorProps> = ({ getLiveState }) => {
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
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
              <th style={{ fontSize: '10px', color: '#666', padding: '4px' }}>VARIABLE</th>
              <th style={{ fontSize: '10px', color: '#666', padding: '4px', textAlign: 'right' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map(key => (
              <tr key={key} style={{ borderBottom: '1px solid #252525' }}>
                <td style={{ fontSize: '11px', color: '#aaa', padding: '6px 4px', fontFamily: 'monospace' }}>{key}</td>
                <td style={{ fontSize: '11px', color: '#ffcc00', padding: '6px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {typeof state[key] === 'number' ? state[key].toFixed(4) : String(state[key])}
                </td>
              </tr>
            ))}
            {filteredKeys.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '11px' }}>
                  No active memory cells found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StateInspector;
