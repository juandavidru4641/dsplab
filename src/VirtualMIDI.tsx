import React, { useState, useEffect, useRef } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';
import { Knob } from './Knob';
// @ts-ignore
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

const KNOB_CCS = [30, 31, 32, 35, 74, 71, 76, 77, 40, 73, 75, 79, 72, 80, 81, 82, 45];

const CC_LABELS: Record<number, string> = {
  30: 'SAW/SQR', 31: 'SINE LVL', 32: 'PWM AMT', 35: 'LFO RATE',
  74: 'LPF CUT', 71: 'LPF RES', 76: 'HPF CUT', 77: 'HPF RES', 40: 'F-EG AMT',
  73: 'ENV A', 75: 'ENV D', 79: 'ENV S', 72: 'ENV R',
  80: 'RM DPTH', 81: 'RM RATE', 82: 'RM ENV', 45: 'CHORUS'
};

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff }) => {
  const [kbEnabled, setKbEnabled] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    setCcValues(KNOB_CCS.reduce((acc, cc) => ({ ...acc, [cc]: 64 }), {}));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

  const firstNote = MidiNumbers.fromNote(`C${octave - 1}`);
  const lastNote = MidiNumbers.fromNote(`C${octave + 1}`);

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
            <ChevronLeft size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.max(1, o - 1))} />
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
        {KNOB_CCS.map(cc => (
          <Knob 
            key={cc} 
            label={CC_LABELS[cc] || `CC ${cc}`} 
            value={ccValues[cc] || 0} 
            min={0} 
            max={127} 
            onChange={(val) => handleCCChange(cc, val)} 
          />
        ))}
      </div>

      <div className="keyboard-container" ref={containerRef} style={{ height: '70px', background: '#111', padding: '5px 10px' }}>
        <Piano
          noteRange={{ first: firstNote, last: lastNote }}
          width={width - 20}
          playNote={(midiNumber: number) => onNoteOn(midiNumber, velocity)}
          stopNote={(midiNumber: number) => onNoteOff(midiNumber)}
          keyboardShortcuts={kbEnabled ? keyboardShortcuts : []}
        />
      </div>
    </div>
  );
};

export default VirtualMIDI;
