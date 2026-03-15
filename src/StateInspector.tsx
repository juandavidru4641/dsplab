import React, { useState, useEffect } from 'react';
import { Search, X, Activity, Edit2 } from 'lucide-react';
interface StateInspectorProps {
  onStateUpdate: (callback: (state: Record<string, any>, probes: Record<string, number[]>) => void) => () => void;
  onProbe: (name: string) => void;
  onSetState: (path: string, value: number) => void;
  activeProbes: string[];
}

const StateInspector: React.FC<StateInspectorProps> = ({ onStateUpdate, onProbe, onSetState, activeProbes }) => {
  const [state, setState] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Subscribe to state updates from the audio engine
    const unsubscribe = onStateUpdate((newState, _probes) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, [onStateUpdate]);

  const allKeys = Object.keys(state);
  const filteredKeys = allKeys.filter(k =>
    (showAll || k.includes('mem')) && k.toLowerCase().includes(filter.toLowerCase())
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={14} color="var(--text-tertiary)" />
        <input
          type="text"
          placeholder="Filter variables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '12px', outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
        />
        {filter && <X size={14} color="var(--text-tertiary)" style={{ cursor: 'pointer' }} onClick={() => setFilter('')} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show All
        </label>
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ fontSize: '9px', color: 'var(--text-tertiary)', padding: '4px', width: '55%' }}>VAR</th>
              <th style={{ fontSize: '9px', color: 'var(--text-tertiary)', padding: '4px', textAlign: 'right' }}>VALUE</th>
              <th style={{ width: '45px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map(key => {
              const isProbed = activeProbes.includes(key);
              const val = state[key];
              const isEditing = editingKey === key;

              return (
                <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{
                    fontSize: '9px',
                    color: 'var(--text-secondary)',
                    padding: '6px 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }} title={key}>
                    {key}
                  </td>
                  <td style={{
                    fontSize: '9px',
                    color: 'var(--accent-secondary)',
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
                        style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '4px', color: 'var(--accent-secondary)', fontSize: '9px', textAlign: 'right', padding: '2px 4px', outline: 'none' }}
                      />
                    ) : (
                      typeof val === 'number' ? val.toFixed(5) : String(val)
                    )}
                  </td>
                  <td style={{ padding: '4px', display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {typeof val === 'number' && (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() => startEdit(key, val)}
                          style={{ background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <Edit2
                            size={10}
                            style={{ color: 'var(--text-tertiary)' }}
                          />
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => onProbe(key)}
                          style={{ background: 'transparent', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <Activity
                            size={12}
                            style={{ color: isProbed ? 'var(--accent-secondary)' : 'var(--text-tertiary)' }}
                          />
                        </button>
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
