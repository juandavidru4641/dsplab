import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Zap, FastForward, Layers } from 'lucide-react';

export interface Step {
  active: boolean;
  note: number;
  accent: boolean;
  slide: boolean;
}

interface SequencerProps {
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  bpm: number;
  setBpm: (bpm: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  length: number;
  setLength: (len: number) => void;
  gateLength: number;
  setGateLength: (len: number) => void;
  onSequencerStep?: (callback: (step: number) => void) => () => void;
  updateSequencer?: (data: { isPlaying: boolean, bpm: number, steps: Step[], length: number, gateLength: number }) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PENTATONIC_SCALE = [0, 3, 5, 7, 10]; // Minor Pentatonic intervals

const NoteInput: React.FC<{ value: number, onChange: (val: number) => void }> = ({ value, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const delta = Math.floor((startY.current - e.clientY) / 5);
      const next = Math.max(0, Math.min(127, startValue.current + delta));
      if (next !== value) onChange(next);
    };
    const handleUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, value, onChange]);

  const noteName = NOTES[value % 12];
  const octave = Math.floor(value / 12) - 1;

  return (
    <div 
      onMouseDown={onMouseDown}
      className={`note-selector-drag ${isDragging ? 'dragging' : ''}`}
      style={{
        width: '36px', height: '22px', background: isDragging ? '#1a1f2e' : '#111', border: isDragging ? '1px solid #7ec8ff' : '1px solid #333',
        borderRadius: '3px', color: isDragging ? '#7ec8ff' : '#00ff00', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize',
        userSelect: 'none', transition: 'all 0.15s', marginTop: '4px'
      }}
      title="Drag up/down to change pitch"
    >
      {noteName}{octave}
    </div>
  );
};

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, length, setLength, 
  gateLength, setGateLength,
  onSequencerStep, updateSequencer 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);

  // Sync state to AudioWorklet
  useEffect(() => {
    if (updateSequencer) {
      updateSequencer({ isPlaying, bpm, steps, length, gateLength });
    }
  }, [isPlaying, bpm, steps, length, gateLength, updateSequencer]);

  // Listen for ticks from AudioWorklet
  useEffect(() => {
    if (onSequencerStep) {
      return onSequencerStep((step) => {
        setCurrentStep(step);
      });
    }
  }, [onSequencerStep]);

  const updateStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const generateMelody = () => {
    const root = 36 + Math.floor(Math.random() * 12);
    const newSteps = steps.map(() => {
      const scaleDegree = PENTATONIC_SCALE[Math.floor(Math.random() * PENTATONIC_SCALE.length)];
      const octaveShift = Math.floor(Math.random() * 2) * 12;
      return {
        active: Math.random() > 0.4,
        note: root + scaleDegree + octaveShift,
        accent: Math.random() > 0.7,
        slide: Math.random() > 0.8
      };
    });
    setSteps(newSteps);
  };

  return (
    <div className="sequencer-container" style={{ padding: '5px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ 
            background: isPlaying ? '#ff3366' : '#22863a', 
            border: 'none', borderRadius: '4px', padding: '4px 12px', 
            color: '#fff', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px'
          }}
        >
          {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          {isPlaying ? 'STOP' : 'RUN'}
        </button>

        <button 
          onClick={generateMelody}
          style={{ 
            background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '4px 12px', 
            color: '#7ec8ff', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.5px'
          }}
          title="Generate random pentatonic sequence"
        >
          GEN
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Timer size={12} color="#888" />
          <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 120)} className="bpm-input" style={{ width: '45px', padding: '2px 4px', fontSize: '11px', background: '#111', color: '#ffcc00', border: '1px solid #333', borderRadius: '3px', outline: 'none', fontFamily: 'monospace' }} />
          <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={12} color="#888" />
          <input 
            type="number" min="1" max="16" value={length} 
            onChange={(e) => setLength(Math.max(1, Math.min(16, parseInt(e.target.value) || 16)))} 
            className="bpm-input" 
            style={{ width: '40px', padding: '2px 4px', fontSize: '11px', background: '#111', color: '#ffcc00', border: '1px solid #333', borderRadius: '3px', outline: 'none', fontFamily: 'monospace' }}
          />
          <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>LEN</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input 
            type="number" step="0.1" min="0.1" max="1.0" value={gateLength} 
            onChange={(e) => setGateLength(Math.max(0.1, Math.min(1.0, parseFloat(e.target.value) || 0.5)))} 
            className="bpm-input" 
            style={{ width: '45px', padding: '2px 4px', fontSize: '11px', background: '#111', color: '#ffcc00', border: '1px solid #333', borderRadius: '3px', outline: 'none', fontFamily: 'monospace' }}
          />
          <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>GATE</span>
        </div>
      </div>

      <div className="step-grid" style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
        {steps.slice(0, length).map((step, i) => (
          <div key={i} className={`step-column ${i === currentStep ? 'current' : ''}`} style={{ 
            padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
            background: i === currentStep ? '#1a1f2e' : (Math.floor(i/4)%2 === 0 ? '#111' : '#161b22'),
            border: i === currentStep ? '1px solid #7ec8ff' : '1px solid #222',
            borderRadius: '4px', minWidth: '40px', transition: 'all 0.1s'
          }}>
            <div className="step-number" style={{ fontSize: '9px', color: i === currentStep ? '#7ec8ff' : '#666', fontWeight: 'bold', marginBottom: '2px' }}>{i + 1}</div>
            <div 
              onClick={() => updateStep(i, { active: !step.active })}
              className={`step-led gate ${step.active ? 'active' : ''}`}
              title="Gate (Active)"
              style={{ width: '24px', height: '16px', background: step.active ? '#ff3366' : '#222', borderRadius: '2px', cursor: 'pointer', boxShadow: step.active ? '0 0 6px rgba(255, 51, 102, 0.4)' : 'none', border: '1px solid #111' }}
            />
            <div 
              onClick={() => updateStep(i, { accent: !step.accent })}
              className={`step-led accent ${step.accent ? 'active' : ''}`}
              title="Accent (High Velocity)"
              style={{ width: '24px', height: '16px', background: step.accent ? '#ffcc00' : '#222', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #111' }}
            >
              <Zap size={10} color={step.accent ? "#000" : "#555"} />
            </div>
            <div 
              onClick={() => updateStep(i, { slide: !step.slide })}
              className={`step-led slide ${step.slide ? 'active' : ''}`}
              title="Slide (Tie Note)"
              style={{ width: '24px', height: '16px', background: step.slide ? '#00ffcc' : '#222', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #111' }}
            >
              <FastForward size={10} color={step.slide ? "#000" : "#555"} />
            </div>
            <NoteInput value={step.note} onChange={(val) => updateStep(i, { note: val })} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sequencer;
