import React, { useState, useEffect, useRef } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';
import { Knob } from './Knob';
// @ts-ignore
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  ccLabels: Record<number, string>;
}

const KEY_WIDTH = 22; // Targeted width for a white key

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff, ccLabels }) => {
  const [kbEnabled, setKbEnabled] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [numWhiteKeys, setNumWhiteKeys] = useState(25);

  useEffect(() => {
    setCcValues(prev => {
      const next = { ...prev };
      Object.keys(ccLabels).forEach(cc => {
        const num = parseInt(cc);
        if (next[num] === undefined) next[num] = 64;
      });
      return next;
    });
  }, [ccLabels]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.offsetWidth;
        if (newWidth > 0) {
          setWidth(newWidth);
          setNumWhiteKeys(Math.floor((newWidth - 20) / KEY_WIDTH));
        }
      }
    };
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    updateWidth();
    return () => observer.disconnect();
  }, []);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

  const startMidi = (octave + 1) * 12; 
  const firstNote = startMidi;
  const totalNotes = Math.floor((numWhiteKeys / 7) * 12);
  const lastNote = Math.min(127, firstNote + totalNotes);

  const keyboardShortcuts = KeyboardShortcuts.create({
    firstNote: firstNote,
    lastNote: lastNote,
    keyboardConfig: KeyboardShortcuts.HOME_ROW,
  });

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

      <div className="knobs-row">
        {Object.keys(ccLabels).sort((a, b) => parseInt(a) - parseInt(b)).map(ccStr => {
          const cc = parseInt(ccStr);
          return (
            <Knob 
              key={cc} 
              label={ccLabels[cc]} 
              value={ccValues[cc] || 64} 
              min={0} 
              max={127} 
              onChange={(val) => handleCCChange(cc, val)} 
            />
          );
        })}
      </div>

      <div className="keyboard-container" ref={containerRef} style={{ height: '70px', background: '#000', padding: '2px 10px', overflow: 'hidden' }}>
        {width > 0 && (
          <Piano
            noteRange={{ first: firstNote, last: lastNote }}
            width={width - 20}
            playNote={(midiNumber: number) => onNoteOn(midiNumber, velocity)}
            stopNote={(midiNumber: number) => onNoteOff(midiNumber)}
            keyboardShortcuts={kbEnabled ? keyboardShortcuts : []}
          />
        )}
      </div>
    </div>
  );
};

export default VirtualMIDI;
