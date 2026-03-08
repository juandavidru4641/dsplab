import React, { useState, useEffect } from 'react';
import { Search, X, Activity, Edit2 } from 'lucide-react';

interface StateInspectorProps {
  onStateUpdate: (callback: (state: Record<string, any>) => void) => () => void;
  onProbe: (name: string) => void;
  onSetState: (path: string, value: number) => void;
  activeProbes: string[];
}

const StateInspector: React.FC<StateInspectorProps> = ({ onStateUpdate, onProbe, onSetState, activeProbes }) => {
  const [state, setState] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    const unsubscribe = onStateUpdate((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, [onStateUpdate]);

  const allKeys = Object.keys(state);
  const filteredKeys = allKeys.filter(k => 
    k.toLowerCase().includes(filter.toLowerCase())
  ).sort();

  const startEdit = (key: string, currentVal: any) => {
    setEditingKey(key);
    setEditValue(String(currentVal));
  };

  const commitEdit = () => {
    if (editingKey !== null) {
      const val = parseFloat(editValue);
      if (!isNaN(val)) {
        onSetState(editingKey, val);
      }
      setEditingKey(null);
    }
  };

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
              <th style={{ fontSize: '9px', color: '#666', padding: '4px', width: '55%' }}>VAR</th>
              <th style={{ fontSize: '9px', color: '#666', padding: '4px', textAlign: 'right' }}>VALUE</th>
              <th style={{ width: '45px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map(key => {
              const isProbed = activeProbes.includes(key);
              const val = state[key];
              const isEditing = editingKey === key;

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
                    {isEditing ? (
                      <input 
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                        style={{ width: '100%', background: '#000', border: '1px solid #ffcc00', color: '#ffcc00', fontSize: '9px', textAlign: 'right' }}
                      />
                    ) : (
                      typeof val === 'number' ? val.toFixed(5) : String(val)
                    )}
                  </td>
                  <td style={{ padding: '4px', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {typeof val === 'number' && (
                      <>
                        <Edit2 
                          size={10} 
                          style={{ cursor: 'pointer', color: '#444' }} 
                          onClick={() => startEdit(key, val)}
                        />
                        <Activity 
                          size={12} 
                          style={{ cursor: 'pointer', color: isProbed ? '#00ff00' : '#444' }} 
                          onClick={() => onProbe(key)}
                        />
                      </>
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
