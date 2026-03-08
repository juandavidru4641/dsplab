import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

const KNOB_CCS = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

const KEY_MAP: Record<string, number> = {
  'a': 0,  'w': 1,  's': 2,  'e': 3,  'd': 4,  'f': 5,  't': 6,  'g': 7,  'y': 8,  'h': 9,  'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14, 'p': 15, ';': 16, "'": 17
};

// Two octaves of keys
const KEYS = [
  { offset: 0, label: 'C', key: 'A', type: 'white' },
  { offset: 1, label: 'C#', key: 'W', type: 'black' },
  { offset: 2, label: 'D', key: 'S', type: 'white' },
  { offset: 3, label: 'D#', key: 'E', type: 'black' },
  { offset: 4, label: 'E', key: 'D', type: 'white' },
  { offset: 5, label: 'F', key: 'F', type: 'white' },
  { offset: 6, label: 'F#', key: 'T', type: 'black' },
  { offset: 7, label: 'G', key: 'G', type: 'white' },
  { offset: 8, label: 'G#', key: 'Y', type: 'black' },
  { offset: 9, label: 'A', key: 'H', type: 'white' },
  { offset: 10, label: 'A#', key: 'U', type: 'black' },
  { offset: 11, label: 'B', key: 'J', type: 'white' },
  { offset: 12, label: 'C', key: 'K', type: 'white' },
  { offset: 13, label: 'C#', key: 'O', type: 'black' },
  { offset: 14, label: 'D', key: 'L', type: 'white' },
  { offset: 15, label: 'D#', key: 'P', type: 'black' },
  { offset: 16, label: 'E', key: ';', type: 'white' },
  { offset: 17, label: 'F', key: "'", type: 'white' },
  { offset: 18, label: 'F#', key: '', type: 'black' },
  { offset: 19, label: 'G', key: '', type: 'white' },
  { offset: 20, label: 'G#', key: '', type: 'black' },
  { offset: 21, label: 'A', key: '', type: 'white' },
  { offset: 22, label: 'A#', key: '', type: 'black' },
  { offset: 23, label: 'B', key: '', type: 'white' },
  { offset: 24, label: 'C', key: '', type: 'white' },
];

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff }) => {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [kbEnabled, setKbEnabled] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>(
    KNOB_CCS.reduce((acc, cc) => ({ ...acc, [cc]: 64 }), {})
  );

  const baseNote = octave * 12 + 12;

  const handleNoteOn = useCallback((note: number) => {
    setActiveNotes(prev => {
      if (prev.has(note)) return prev;
      const next = new Set(prev);
      next.add(note);
      onNoteOn(note, velocity);
      return next;
    });
  }, [onNoteOn, velocity]);

  const handleNoteOff = useCallback((note: number) => {
    setActiveNotes(prev => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      onNoteOff(note);
      return next;
    });
  }, [onNoteOff]);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      
      if (key === 'z') { setOctave(prev => Math.max(0, prev - 1)); return; }
      if (key === 'x') { setOctave(prev => Math.min(8, prev + 1)); return; }
      if (key === 'c') { setVelocity(prev => Math.max(1, prev - 20)); return; }
      if (key === 'v') { setVelocity(prev => Math.min(127, prev + 20)); return; }

      if (!kbEnabled) return;
      if (e.repeat) return;

      const offset = KEY_MAP[key];
      if (offset !== undefined) handleNoteOn(baseNote + offset);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!kbEnabled) return;
      const offset = KEY_MAP[e.key.toLowerCase()];
      if (offset !== undefined) handleNoteOff(baseNote + offset);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [kbEnabled, baseNote, handleNoteOn, handleNoteOff]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: '#1a1a1a', borderTop: '1px solid #333' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: '#666' }}>OCTAVE</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>
              <ChevronLeft size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.max(0, o - 1))} />
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ffcc00', width: '15px', textAlign: 'center' }}>{octave - 2}</span>
              <ChevronRight size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.min(8, o + 1))} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: '#666' }}>VELOCITY</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>
              <Volume1 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.max(1, v - 20))} />
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ffcc00', width: '25px', textAlign: 'center' }}>{velocity}</span>
              <Volume2 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.min(127, v + 20))} />
            </div>
          </div>
        </div>

        <button 
          onClick={() => setKbEnabled(!kbEnabled)}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', 
            background: kbEnabled ? '#ffcc00' : '#333', color: kbEnabled ? '#000' : '#aaa',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '9px', fontWeight: 'bold'
          }}
        >
          {kbEnabled ? <Keyboard size={10} /> : <MousePointer2 size={10} />}
          {kbEnabled ? 'KB ENABLED' : 'MOUSE ONLY'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', overflowX: 'auto', paddingBottom: '5px' }}>
        {KNOB_CCS.map(cc => (
          <div key={cc} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '35px' }}>
            <div style={{ fontSize: '8px', color: '#888' }}>{cc}</div>
            <input 
              type="range" min="0" max="127" value={ccValues[cc]} 
              onChange={(e) => handleCCChange(cc, parseInt(e.target.value))}
              style={{ width: '30px', height: '30px', cursor: 'pointer' }}
            />
            <div style={{ fontSize: '9px', color: '#ffcc00' }}>{ccValues[cc]}</div>
          </div>
        ))}
      </div>

      <div style={{ 
        position: 'relative', 
        height: '100px', 
        display: 'flex', 
        justifyContent: 'center', 
        userSelect: 'none',
        overflowX: 'auto',
        paddingBottom: '5px'
      }}>
        <div style={{ position: 'relative', display: 'flex', width: 'fit-content' }}>
          {KEYS.map((k, i) => {
            const note = baseNote + k.offset;
            const isActive = activeNotes.has(note);
            const whiteKeysCount = KEYS.filter((x, idx) => x.type === 'white' && idx < i).length;

            if (k.type === 'white') {
              return (
                <div
                  key={k.offset}
                  onMouseDown={() => handleNoteOn(note)}
                  onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}
                  style={{
                    width: '30px',
                    height: '100px',
                    background: isActive ? '#ffcc00' : '#f0f0f0',
                    border: '1px solid #999',
                    borderTop: 'none',
                    borderRadius: '0 0 4px 4px',
                    cursor: 'pointer',
                    zIndex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingBottom: '8px',
                    color: isActive ? '#000' : '#bbb',
                    transition: 'background 0.1s',
                    flexShrink: 0
                  }}
                >
                  <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{k.key}</div>
                  <div style={{ fontSize: '7px' }}>{k.label}</div>
                </div>
              );
            } else {
              return (
                <div
                  key={k.offset}
                  onMouseDown={() => handleNoteOn(note)}
                  onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}
                  style={{
                    width: '20px',
                    height: '65px',
                    background: isActive ? '#ff4444' : '#222',
                    position: 'absolute',
                    left: `${whiteKeysCount * 30 + 20}px`,
                    zIndex: 2,
                    borderRadius: '0 0 3px 3px',
                    border: '1px solid #000',
                    borderTop: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingBottom: '6px',
                    color: isActive ? '#fff' : '#666',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    transition: 'background 0.1s',
                    flexShrink: 0
                  }}
                >
                  <div style={{ fontSize: '7px', fontWeight: 'bold' }}>{k.key}</div>
                </div>
              );
            }
          })}
        </div>
      </div>

    </div>
  );
};

export default VirtualMIDI;
