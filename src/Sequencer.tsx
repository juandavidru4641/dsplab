import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Layers, Drum, Music } from 'lucide-react';

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
  length: number;
  setLength: (len: number) => void;
  gateLength: number;
  setGateLength: (len: number) => void;
  mode: 'melody' | 'drum';
  setMode: (m: 'melody' | 'drum') => void;
  drumTracks: any[];
  setDrumTracks: any;
  onSequencerStep?: (callback: (step: number) => void) => () => void;
  updateSequencer?: (data: any) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Melody grid note names (top to bottom)
const GRID_NOTES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

const DragNumber: React.FC<{ value: number, onChange: (v: number) => void, min: number, max: number, label?: string }> = ({ value, onChange, min, max, label }) => {
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
      const next = Math.max(min, Math.min(max, startValue.current + delta));
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
  }, [isDragging, value, onChange, min, max]);

  return (
    <div 
      onMouseDown={onMouseDown}
      style={{
        width: '100%', height: '18px', background: isDragging ? '#1a1f2e' : '#111', 
        border: isDragging ? '1px solid #7ec8ff' : '1px solid #333',
        borderRadius: '2px', color: isDragging ? '#7ec8ff' : '#aaa', 
        fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        cursor: 'ns-resize', userSelect: 'none', transition: 'all 0.1s'
      }}
      title={`Drag to change ${label || 'value'}`}
    >
      {value}
    </div>
  );
};

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, length, setLength, 
  gateLength, setGateLength, mode, setMode, drumTracks, setDrumTracks,
  onSequencerStep, updateSequencer 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);

  // Sync state to AudioWorklet
  useEffect(() => {
    if (updateSequencer) {
      updateSequencer({ isPlaying, bpm, steps, length, gateLength, mode, tracks: drumTracks });
    }
  }, [isPlaying, bpm, steps, length, gateLength, mode, drumTracks, updateSequencer]);

  // Listen for ticks from AudioWorklet
  useEffect(() => {
    if (onSequencerStep) {
      return onSequencerStep((step) => {
        setCurrentStep(step);
      });
    }
  }, [onSequencerStep]);

  const updateMelodyStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const updateDrumStep = (trackIdx: number, stepIdx: number, active: boolean) => {
    const next = [...drumTracks];
    const track = { ...next[trackIdx] };
    const st = [...track.steps];
    st[stepIdx] = { ...st[stepIdx], active };
    track.steps = st;
    next[trackIdx] = track;
    setDrumTracks(next);
  };

  const generateMelody = () => {
    if (mode === 'drum') {
       // Random drum pattern
       const next = [...drumTracks];
       for(let i=0; i<next.length; i++) {
         const t = {...next[i]};
         const st = [...t.steps];
         for(let s=0; s<length; s++) {
           st[s] = { ...st[s], active: Math.random() > (i === 0 ? 0.4 : 0.7) };
         }
         t.steps = st;
         next[i] = t;
       }
       setDrumTracks(next);
    } else {
      const root = 36 + Math.floor(Math.random() * 12);
      const PENTATONIC_SCALE = [0, 3, 5, 7, 10];
      setSteps(prev => prev.map((step, idx) => {
        if (idx >= length) return step; // Only randomize active length
        const scaleDegree = PENTATONIC_SCALE[Math.floor(Math.random() * PENTATONIC_SCALE.length)];
        const octaveShift = Math.floor(Math.random() * 2) * 12;
        return {
          active: Math.random() > 0.4,
          note: root + scaleDegree + octaveShift,
          accent: Math.random() > 0.7,
          slide: Math.random() > 0.8
        };
      }));
    }
  };

  const clearPattern = () => {
    if (mode === 'drum') {
      const next = drumTracks.map(t => ({...t, steps: t.steps.map((st:any) => ({...st, active: false, accent: false, slide: false}))}));
      setDrumTracks(next);
    } else {
      setSteps(steps.map(s => ({ ...s, active: false, accent: false, slide: false })));
    }
  }

  return (
    <div className="sequencer-container" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* Top Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', paddingBottom: '8px', borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
        
        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: '#111', padding: '2px', borderRadius: '4px', border: '1px solid #333' }}>
           <button onClick={() => setMode('melody')} style={{ background: mode === 'melody' ? '#222' : 'transparent', color: mode === 'melody' ? '#ffcc00' : '#666', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <Music size={10} /> MELODY
           </button>
           <button onClick={() => setMode('drum')} style={{ background: mode === 'drum' ? '#222' : 'transparent', color: mode === 'drum' ? '#ffcc00' : '#666', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <Drum size={10} /> DRUMS
           </button>
        </div>

        <div style={{ width: '1px', height: '16px', background: '#333' }} />

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
          title="Generate random sequence"
        >
          GEN
        </button>

        <button 
          onClick={clearPattern}
          style={{ 
            background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '4px 12px', 
            color: '#aaa', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.5px'
          }}
          title="Clear sequence"
        >
          CLEAR
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Timer size={12} color="#888" />
          <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 120)} className="bpm-input" style={{ width: '45px', padding: '2px 4px', fontSize: '11px', background: '#111', color: '#ffcc00', border: '1px solid #333', borderRadius: '3px', outline: 'none', fontFamily: 'monospace' }} />
          <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={12} color="#888" />
          <input 
            type="number" min="1" max="32" value={length} 
            onChange={(e) => setLength(Math.max(1, Math.min(32, parseInt(e.target.value) || 16)))} 
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

      {mode === 'melody' ? (
        <div className="melody-grid" style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowX: 'auto', paddingRight: '8px', paddingBottom: '8px' }}>
          
          <div style={{ display: 'flex', gap: '4px' }}>
            {/* Note Names Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '24px', flexShrink: 0 }}>
               {GRID_NOTES.map(noteIdx => {
                  const isBlackKey = [1, 3, 6, 8, 10].includes(noteIdx);
                  return (
                    <div key={noteIdx} style={{ height: '18px', background: isBlackKey ? '#0a0a0a' : '#1e1e1e', color: isBlackKey ? '#555' : '#888', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
                      {NOTES[noteIdx]}
                    </div>
                  )
               })}
            </div>

            {/* Stepper Columns */}
            {steps.slice(0, length).map((step, i) => {
              const stepNoteIdx = step.note % 12;
              const stepOctave = Math.floor(step.note / 12) - 1;

              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '28px', flexShrink: 0, paddingLeft: '2px', paddingRight: '2px', background: i === currentStep ? 'rgba(126, 200, 255, 0.05)' : 'transparent', borderRadius: '2px' }}>
                  {GRID_NOTES.map(noteIdx => {
                    const isMatch = stepNoteIdx === noteIdx;
                    const isActive = isMatch && step.active;
                    const isHoverVal = isMatch && !step.active;

                    // Piano roll cell colors
                    let bg = '#161b22';
                    if (isActive) bg = '#00ffcc';
                    else if (isHoverVal) bg = '#1a3333';
                    else if ([1, 3, 6, 8, 10].includes(noteIdx)) bg = '#0d1117'; 

                    return (
                      <div 
                        key={noteIdx}
                        onClick={() => {
                          if (isMatch) {
                            updateMelodyStep(i, { active: !step.active });
                          } else {
                            updateMelodyStep(i, { active: true, note: (stepOctave + 1)*12 + noteIdx });
                          }
                        }}
                        style={{ 
                          height: '18px', background: bg, borderRadius: '2px', cursor: 'pointer',
                          border: isActive ? '1px solid #fff' : i === currentStep ? '1px solid #7ec8ff33' : '1px solid #222'
                        }}
                      />
                    )
                  })}

                  {/* Controls under grid */}
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                     <DragNumber value={stepOctave} onChange={(v) => updateMelodyStep(i, { note: (v+1)*12 + stepNoteIdx })} min={0} max={9} label="Octave" />
                     
                     <div onClick={() => updateMelodyStep(i, { active: !step.active })} style={{ height: '14px', background: step.active ? '#ff3366' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Gate" />
                     <div onClick={() => updateMelodyStep(i, { accent: !step.accent })} style={{ height: '14px', background: step.accent ? '#ffcc00' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Accent" />
                     <div onClick={() => updateMelodyStep(i, { slide: !step.slide })} style={{ height: '14px', background: step.slide ? '#7ec8ff' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Slide" />
                     
                     <div style={{ fontSize: '9px', color: i === currentStep ? '#7ec8ff' : '#555', textAlign: 'center', marginTop: '2px', fontWeight: 'bold' }}>{i + 1}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="drum-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginTop: '4px' }}>
           <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div style={{ width: '50px' }} /> {/* Label spacer */}
              {Array.from({length: length}).map((_, i) => (
                <div key={i} style={{ width: '28px', fontSize: '9px', fontWeight: 'bold', color: i === currentStep ? '#7ec8ff' : '#555', textAlign: 'center' }}>{i + 1}</div>
              ))}
           </div>
           {drumTracks.map((track, tIdx) => (
             <div key={tIdx} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
               <div style={{ width: '40px', fontSize: '10px', fontWeight: 'bold', color: '#ffcc00', textAlign: 'right', paddingRight: '10px' }}>{track.name}</div>
               {track.steps.slice(0, length).map((st: any, i: number) => (
                 <div key={i} onClick={() => updateDrumStep(tIdx, i, !st.active)} style={{
                   width: '28px', height: '24px', background: st.active ? '#ff3366' : (Math.floor(i/4)%2 === 0 ? '#111' : '#161b22'),
                   borderRadius: '3px', cursor: 'pointer', border: currentStep === i ? '1px solid #7ec8ff' : '1px solid #222',
                   boxShadow: st.active ? '0 0 6px rgba(255, 51, 102, 0.3)' : 'none', transition: 'all 0.1s'
                 }} />
               ))}
             </div>
           ))}
        </div>
      )}

    </div>
  );
};

export default Sequencer;
