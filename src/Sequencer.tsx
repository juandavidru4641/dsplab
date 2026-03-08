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
  onSequencerStep?: (callback: (step: number) => void) => () => void;
  updateSequencer?: (data: { isPlaying: boolean, bpm: number, steps: Step[], length: number }) => void;
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
        width: '32px', height: '18px', background: '#000', border: '1px solid #444',
        borderRadius: '3px', color: '#00ff00', fontSize: '8px', fontWeight: 'bold',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize',
        userSelect: 'none', transition: 'border-color 0.2s'
      }}
    >
      {noteName}{octave}
    </div>
  );
};

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, length, setLength, 
  onSequencerStep, updateSequencer 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);

  // Sync state to AudioWorklet
  useEffect(() => {
    if (updateSequencer) {
      updateSequencer({ isPlaying, bpm, steps, length });
    }
  }, [isPlaying, bpm, steps, length, updateSequencer]);

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
            background: isPlaying ? '#ff4444' : '#00ff00', 
            border: 'none', borderRadius: '4px', padding: '2px 10px', 
            color: '#000', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}
        >
          {isPlaying ? <Square size={8} fill="currentColor" /> : <Play size={8} fill="currentColor" />}
          {isPlaying ? 'STOP' : 'RUN'}
        </button>

        <button 
          onClick={generateMelody}
          style={{ 
            background: '#333', border: '1px solid #444', borderRadius: '4px', padding: '2px 10px', 
            color: '#ffcc00', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer'
          }}
        >
          GEN
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Timer size={10} color="#666" />
          <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))} className="bpm-input" style={{ width: '35px', padding: '1px 3px', fontSize: '10px' }} />
          <span style={{ fontSize: '7px', color: '#666' }}>BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Layers size={10} color="#666" />
          <input 
            type="number" min="1" max="16" value={length} 
            onChange={(e) => setLength(Math.max(1, Math.min(16, parseInt(e.target.value))))} 
            className="bpm-input" 
            style={{ width: '30px', padding: '1px 3px', fontSize: '10px' }}
          />
          <span style={{ fontSize: '7px', color: '#666' }}>LEN</span>
        </div>
      </div>

      <div className="step-grid">
        {steps.slice(0, length).map((step, i) => (
          <div key={i} className={`step-column ${i === currentStep ? 'current' : ''}`} style={{ padding: '2px' }}>
            <div 
              onClick={() => updateStep(i, { active: !step.active })}
              className={`step-led gate ${step.active ? 'active' : ''}`}
              style={{ width: '18px', height: '14px' }}
            />
            <div 
              onClick={() => updateStep(i, { accent: !step.accent })}
              className={`step-led accent ${step.accent ? 'active' : ''}`}
              style={{ width: '18px', height: '14px' }}
            >
              <Zap size={6} color={step.accent ? "#000" : "#444"} />
            </div>
            <div 
              onClick={() => updateStep(i, { slide: !step.slide })}
              className={`step-led slide ${step.slide ? 'active' : ''}`}
              style={{ width: '18px', height: '14px' }}
            >
              <FastForward size={6} color={step.slide ? "#000" : "#444"} />
            </div>
            <NoteInput value={step.note} onChange={(val) => updateStep(i, { note: val })} />
            <div className="step-number" style={{ fontSize: '7px' }}>{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sequencer;
