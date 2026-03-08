import React, { useState, useEffect } from 'react';
import { Search, X, Activity } from 'lucide-react';

interface StateInspectorProps {
  onStateUpdate: (callback: (state: Record<string, any>) => void) => () => void;
  onProbe: (name: string) => void;
  activeProbes: string[];
}

const StateInspector: React.FC<StateInspectorProps> = ({ onStateUpdate, onProbe, activeProbes }) => {
  const [state, setState] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    // Subscribe to state updates from the audio engine
    const unsubscribe = onStateUpdate((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, [onStateUpdate]);

  const allKeys = Object.keys(state);
  const filteredKeys = allKeys.filter(k => 
    k.toLowerCase().includes(filter.toLowerCase())
  ).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', borderLeft: '1px solid #333', overflow: 'hidden' }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Fira Code', monospace", tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
              <th style={{ fontSize: '9px', color: '#666', padding: '4px', width: '60%' }}>VAR</th>
              <th style={{ fontSize: '9px', color: '#666', padding: '4px', textAlign: 'right' }}>VALUE</th>
              <th style={{ width: '25px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map(key => {
              const isProbed = activeProbes.includes(key);
              const val = state[key];
              return (
                <tr key={key} style={{ borderBottom: '1px solid #252525' }}>
                  <td style={{ 
                    fontSize: '9px', 
                    color: '#aaa', 
                    padding: '6px 4px', 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis' 
                  }} title={key}>
                    {key}
                  </td>
                  <td style={{ 
                    fontSize: '9px', 
                    color: '#ffcc00', 
                    padding: '6px 4px', 
                    textAlign: 'right',
                    overflow: 'hidden'
                  }}>
                    {typeof val === 'number' ? val.toFixed(5) : String(val)}
                  </td>
                  <td style={{ padding: '4px', textAlign: 'center' }}>
                    {typeof val === 'number' && (
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
            {allKeys.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '40px 10px', textAlign: 'center', color: '#555', fontSize: '11px' }}>
                  Waiting for telemetry...<br/>
                  (Ensure Vult code is RUNNING)
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
