import React, { useState, useEffect, useRef } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';
import { Knob } from './Knob';

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  ccLabels: Record<number, string>;
  initialState?: Record<string, any>;
}

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff, ccLabels, initialState }) => {
  const [kbEnabled, setKbEnabled] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>({});
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for state accessed in global event listeners
  const octaveRef = useRef(octave);
  const velocityRef = useRef(velocity);

  useEffect(() => {
    octaveRef.current = octave;
    velocityRef.current = velocity;
  }, [octave, velocity]);

  useEffect(() => {
    setCcValues(prev => {
      const next = { ...prev };
      Object.keys(ccLabels).forEach(cc => {
        const num = parseInt(cc);
        const varName = ccLabels[num].toLowerCase();
        const actualVar = Object.keys(initialState || {}).find(k => k.toLowerCase().endsWith('.' + varName) || k.toLowerCase() === varName);
        if (actualVar && initialState![actualVar] !== undefined && typeof initialState![actualVar] === 'number') {
          next[num] = Math.round(initialState![actualVar] * 127);
        } else if (next[num] === undefined) {
          next[num] = 64;
        }
      });
      return next;
    });
  }, [ccLabels, initialState]);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

  const playNote = (midi: number) => {
    if (midi < 0 || midi > 127) return;
    onNoteOn(midi, velocityRef.current);
    setActiveNotes(prev => Array.from(new Set([...prev, midi])));
  };

  const stopNote = (midi: number) => {
    if (midi < 0 || midi > 127) return;
    onNoteOff(midi);
    setActiveNotes(prev => prev.filter(n => n !== midi));
  };

  useEffect(() => {
    if (!kbEnabled) return;

    const activeKeyNotes: Record<string, number> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      const key = e.key.toLowerCase();
      
      if (key === 'z') {
        setOctave(o => Math.max(0, o - 1));
      } else if (key === 'x') {
        setOctave(o => Math.min(8, o + 1));
      } else if (key === 'c') {
        setVelocity(v => Math.max(1, v - 20));
      } else if (key === 'v') {
        setVelocity(v => Math.min(127, v + 20));
      } else {
        const abletonMapping: Record<string, number> = {
          'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7,
          'y': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14,
          'p': 15, ';': 16, "'": 17
        };
        const offset = abletonMapping[key];
        if (offset !== undefined && !activeKeyNotes[key]) {
          const startMidi = (octaveRef.current + 1) * 12;
          const note = startMidi + offset;
          activeKeyNotes[key] = note;
          playNote(note);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const note = activeKeyNotes[key];
      if (note !== undefined) {
        stopNote(note);
        delete activeKeyNotes[key];
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      Object.values(activeKeyNotes).forEach(note => stopNote(note));
    };
  }, [kbEnabled]);

  const firstNote = (octave + 1) * 12;
  const lastNote = firstNote + 24; // 2 octaves

  const whiteKeys = [];
  for (let i = firstNote; i <= lastNote; i++) {
    const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
    if (!isBlack) {
      const hasBlackNext = i + 1 <= lastNote && [1, 3, 6, 8, 10].includes((i + 1) % 12);
      whiteKeys.push({ midi: i, blackMidi: hasBlackNext ? i + 1 : null });
    }
  }

  return (
    <div className="virtual-midi-panel">
      <div className="midi-controls-row">
        <div className="midi-group">
          <span className="mini-label">OCTAVE</span>
          <div className="stepper">
            <ChevronLeft size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.max(0, o - 1))} />
            <span className="stepper-value">{octave - 2}</span>
            <ChevronRight size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.min(8, o + 1))} />
          </div>
        </div>
        <div className="midi-group">
          <span className="mini-label">VELOCITY</span>
          <div className="stepper">
            <Volume1 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.max(1, v - 20))} />
            <span className="stepper-value">{velocity}</span>
            <Volume2 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.min(127, v + 20))} />
          </div>
        </div>
        <div className="spacer" />
        <button className={`kb-toggle ${kbEnabled ? 'active' : ''}`} onClick={() => setKbEnabled(!kbEnabled)}>
          {kbEnabled ? <Keyboard size={10} /> : <MousePointer2 size={10} />}
          {kbEnabled ? 'KB ON' : 'MOUSE'}
        </button>
      </div>

      <div className="knobs-row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: '20px', padding: '15px' }}>
        {Object.keys(ccLabels).sort((a, b) => parseInt(a) - parseInt(b)).map(ccStr => {
          const cc = parseInt(ccStr);
          return (
            <div key={cc} style={{ flex: '0 0 auto' }}>
              <Knob 
                label={`[${cc}] ${ccLabels[cc]}`} 
                value={ccValues[cc] || 64} 
                min={0} 
                max={127} 
                size={44}
                onChange={(val) => handleCCChange(cc, val)} 
              />
            </div>
          );
        })}
      </div>

      <div className="keyboard-container" ref={containerRef} style={{ height: '100px', background: 'var(--bg-surface-elevated)', borderTop: '1px solid var(--border-subtle)', padding: '10px 15px', overflowX: 'auto', overflowY: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', height: '100%', minWidth: '400px', maxWidth: '800px', margin: '0 auto', flex: 1 }}>
          {whiteKeys.map(wk => (
            <div
              key={wk.midi}
              onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); playNote(wk.midi); }}
              onPointerEnter={(e) => { if (e.buttons > 0) playNote(wk.midi); }}
              onPointerUp={() => stopNote(wk.midi)}
              onPointerLeave={() => stopNote(wk.midi)}
              style={{
                flex: 1,
                position: 'relative',
                border: '1px solid var(--border-subtle)',
                background: activeNotes.includes(wk.midi) ? 'var(--accent-primary)' : 'linear-gradient(to bottom, #dcdcdc 0%, #ffffff 100%)',
                borderRadius: '0 0 6px 6px',
                boxShadow: activeNotes.includes(wk.midi) ? 'inset 0 2px 5px rgba(0,0,0,0.3)' : 'inset 0 -4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.4)',
                marginRight: '2px',
                cursor: 'pointer',
              }}
            >
              {activeNotes.includes(wk.midi) && <div style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', filter: 'blur(1px)' }} />}
              {wk.blackMidi && (
                <div
                  onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.releasePointerCapture(e.pointerId); playNote(wk.blackMidi!); }}
                  onPointerEnter={(e) => { e.stopPropagation(); if (e.buttons > 0) playNote(wk.blackMidi!); }}
                  onPointerUp={(e) => { e.stopPropagation(); stopNote(wk.blackMidi!); }}
                  onPointerLeave={(e) => { e.stopPropagation(); stopNote(wk.blackMidi!); }}
                  style={{
                    position: 'absolute',
                    right: '-25%',
                    width: '50%',
                    height: '60%',
                    background: activeNotes.includes(wk.blackMidi) ? 'var(--accent-danger)' : 'linear-gradient(to bottom, #444 0%, var(--bg-surface) 100%)',
                    zIndex: 10,
                    borderRadius: '0 0 4px 4px',
                    border: '1px solid var(--border-subtle)',
                    borderTop: 'none',
                    boxShadow: activeNotes.includes(wk.blackMidi) ? '0 1px 2px rgba(0,0,0,0.8)' : '1px 2px 4px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VirtualMIDI;
