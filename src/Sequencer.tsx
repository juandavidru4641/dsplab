import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Music, Zap, FastForward } from 'lucide-react';

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
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, onNoteOn, onNoteOff 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);
  const lastNoteRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const updateStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const tick = () => {
    setCurrentStep(prev => {
      const next = (prev + 1) % steps.length;
      const step = steps[next];
      const prevStep = steps[prev >= 0 ? prev : steps.length - 1];

      // Handle Slide/Legato logic
      // If previous step was sliding and this one is active, we don't noteOff the previous one yet
      // Or if this step is active, we trigger it.
      
      if (step.active) {
        const velocity = step.accent ? 127 : 100;
        
        // If sliding from previous active note, we could potentially skip noteOff
        // for some synth engines to interpret as legato.
        if (lastNoteRef.current !== null && !prevStep.slide) {
          onNoteOff(lastNoteRef.current);
        }

        onNoteOn(step.note, velocity);
        lastNoteRef.current = step.note;
      } else {
        // Not active, kill last note if it wasn't already killed
        if (lastNoteRef.current !== null) {
          onNoteOff(lastNoteRef.current);
          lastNoteRef.current = null;
        }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '5px' }}>
        <div className="section-title" style={{ margin: 0 }}><Music size={12} /> TB-STYLE SEQUENCER</div>
        
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ 
            background: isPlaying ? '#ff4444' : '#00ff00', 
            border: 'none', borderRadius: '4px', padding: '4px 12px', 
            color: '#000', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          {isPlaying ? 'STOP' : 'RUN'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Timer size={12} color="#666" />
          <input 
            type="number" value={bpm} 
            onChange={(e) => setBpm(parseInt(e.target.value))} 
            className="bpm-input"
          />
          <span style={{ fontSize: '8px', color: '#666' }}>BPM</span>
        </div>
      </div>

      <div className="step-grid">
        {steps.map((step, i) => (
          <div key={i} className={`step-column ${i === currentStep ? 'current' : ''}`}>
            {/* Note Gate LED */}
            <div 
              onClick={() => updateStep(i, { active: !step.active })}
              className={`step-led gate ${step.active ? 'active' : ''}`}
              title="Gate"
            />
            
            {/* Accent Toggle */}
            <div 
              onClick={() => updateStep(i, { accent: !step.accent })}
              className={`step-led accent ${step.accent ? 'active' : ''}`}
              title="Accent"
            >
              <Zap size={8} color={step.accent ? "#000" : "#444"} />
            </div>

            {/* Slide Toggle */}
            <div 
              onClick={() => updateStep(i, { slide: !step.slide })}
              className={`step-led slide ${step.slide ? 'active' : ''}`}
              title="Slide"
            >
              <FastForward size={8} color={step.slide ? "#000" : "#444"} />
            </div>

            {/* Visual Note Selector */}
            <div className="note-selector-mini">
              <select 
                value={step.note} 
                onChange={(e) => updateStep(i, { note: parseInt(e.target.value) })}
                className="step-note-select"
              >
                {Array.from({ length: 127 }).map((_, n) => (
                  <option key={n} value={n}>{NOTES[n % 12]}{Math.floor(n / 12) - 1}</option>
                ))}
              </select>
            </div>
            
            <div className="step-number">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sequencer;
