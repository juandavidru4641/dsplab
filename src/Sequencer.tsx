import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Music } from 'lucide-react';

export interface Step {
  active: boolean;
  note: number;
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
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, onNoteOn, onNoteOff 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);
  const lastNoteRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const toggleStep = (idx: number) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], active: !next[idx].active };
      return next;
    });
  };

  const updateNote = (idx: number, note: number) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], note };
      return next;
    });
  };

  const tick = () => {
    setCurrentStep(prev => {
      const next = (prev + 1) % steps.length;
      
      // Stop previous note
      if (lastNoteRef.current !== null) {
        onNoteOff(lastNoteRef.current);
        lastNoteRef.current = null;
      }

      // Play current note if active
      const step = steps[next];
      if (step && step.active) {
        onNoteOn(step.note, 100);
        lastNoteRef.current = step.note;
      }

      return next;
    });
  };

  useEffect(() => {
    if (isPlaying) {
      const interval = (60 / bpm) * 1000 / 4; // 16th notes
      timerRef.current = window.setInterval(tick, interval);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (lastNoteRef.current !== null) {
        onNoteOff(lastNoteRef.current);
        lastNoteRef.current = null;
      }
      setCurrentStep(-1);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, steps]);

  return (
    <div className="sequencer-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div className="section-title" style={{ margin: 0 }}><Music size={12} /> NOTE SEQUENCER</div>
        
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ 
            background: isPlaying ? '#ff4444' : '#007acc', 
            border: 'none', borderRadius: '4px', padding: '4px 12px', 
            color: '#fff', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          {isPlaying ? 'STOP' : 'PLAY'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Timer size={12} color="#666" />
          <input 
            type="number" value={bpm} 
            onChange={(e) => setBpm(parseInt(e.target.value))} 
            style={{ width: '40px', background: '#000', border: '1px solid #444', color: '#ffcc00', fontSize: '10px', padding: '2px' }}
          />
          <span style={{ fontSize: '8px', color: '#666' }}>BPM</span>
        </div>
      </div>

      <div className="step-grid">
        {steps.map((step, i) => (
          <div key={i} className="step-unit">
            <div 
              onClick={() => toggleStep(i)}
              className={`step-led ${step.active ? 'active' : ''} ${i === currentStep ? 'current' : ''}`}
            />
            <select 
              value={step.note} 
              onChange={(e) => updateNote(i, parseInt(e.target.value))}
              className="step-note-select"
            >
              {Array.from({ length: 127 }).map((_, n) => (
                <option key={n} value={n}>{NOTES[n % 12]}{Math.floor(n / 12) - 1}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sequencer;
