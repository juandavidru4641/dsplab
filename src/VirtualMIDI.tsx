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
      if (key === 'z') { setOctave(o => Math.max(0, o - 1)); return; }
      if (key === 'x') { setOctave(o => Math.min(8, o + 1)); return; }
      if (key === 'c') { setVelocity(v => Math.max(1, v - 20)); return; }
      if (key === 'v') { setVelocity(v => Math.min(127, v + 20)); return; }
      if (!kbEnabled || e.repeat) return;
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
    <div className="virtual-midi-panel">
      <div className="midi-controls-row">
        <div className="midi-group">
          <span className="mini-label">OCTAVE</span>
          <div className="stepper">
            <ChevronLeft size={10} onClick={() => setOctave(o => Math.max(0, o - 1))} />
            <span className="stepper-value">{octave - 2}</span>
            <ChevronRight size={10} onClick={() => setOctave(o => Math.min(8, o + 1))} />
          </div>
        </div>
        <div className="midi-group">
          <span className="mini-label">VELOCITY</span>
          <div className="stepper">
            <Volume1 size={10} onClick={() => setVelocity(v => Math.max(1, v - 20))} />
            <span className="stepper-value">{velocity}</span>
            <Volume2 size={10} onClick={() => setVelocity(v => Math.min(127, v + 20))} />
          </div>
        </div>
        <div className="spacer" />
        <button className={`kb-toggle ${kbEnabled ? 'active' : ''}`} onClick={() => setKbEnabled(!kbEnabled)}>
          {kbEnabled ? <Keyboard size={10} /> : <MousePointer2 size={10} />}
          {kbEnabled ? 'KB ON' : 'MOUSE'}
        </button>
      </div>

      <div className="knobs-row">
        {KNOB_CCS.map(cc => (
          <div key={cc} className="knob-unit">
            <div className="knob-label">{cc}</div>
            <input type="range" min="0" max="127" value={ccValues[cc]} onChange={(e) => handleCCChange(cc, parseInt(e.target.value))} />
            <div className="knob-value">{ccValues[cc]}</div>
          </div>
        ))}
      </div>

      <div className="keyboard-container">
        <div className="keyboard-inner">
          {KEYS.map((k, i) => {
            const note = baseNote + k.offset;
            const isActive = activeNotes.has(note);
            const whiteKeysCount = KEYS.filter((x, idx) => x.type === 'white' && idx < i).length;
            
            if (k.type === 'white') {
              return (
                <div key={k.offset} className={`key white ${isActive ? 'active' : ''}`}
                  onMouseDown={() => handleNoteOn(note)} onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}>
                  <div className="key-label">{k.key}</div>
                  <div className="note-name">{k.label}</div>
                </div>
              );
            } else {
              return (
                <div key={k.offset} className={`key black ${isActive ? 'active' : ''}`}
                  style={{ left: `${whiteKeysCount * 30 - 10}px` }}
                  onMouseDown={() => handleNoteOn(note)} onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}>
                  <div className="key-label">{k.key}</div>
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
