import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Layers, Drum, Music } from 'lucide-react';

export interface Step {
  active: boolean;
  notes: number[];
  accent: boolean;
  slide: boolean;
}

export interface CCTrack {
  cc: number;
  steps: number[];
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
  ccTracks: CCTrack[];
  setCCTracks: React.Dispatch<React.SetStateAction<CCTrack[]>>;
  ccLabels: Record<number, string>;
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

const CCLane: React.FC<{ track: CCTrack, length: number, onChange: (steps: number[]) => void, onRemove: () => void, ccName: string }> = ({ track, length, onChange, onRemove, ccName }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawRef = useRef<{ step: number, val: number } | null>(null);

  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>, isStart: boolean) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xDist = e.clientX - rect.left - 14; 
    
    // Each step is 32px. 4 points per step = 8px per point. Center of step 1 is x=14.
    const stepIdx = Math.max(0, Math.min(length * 4 - 1, Math.round(xDist / 8)));
    const y = e.clientY - rect.top;
    const pctY = 1.0 - Math.max(0, Math.min(1, y / rect.height));
    const val = Math.floor(pctY * 127);
    
    const next = [...track.steps];
    while(next.length < 128) next.push(next[next.length-1] || 0); // Upgrade legacy arrays

    if (isStart || !lastDrawRef.current) {
      next[stepIdx] = val;
    } else {
      const last = lastDrawRef.current;
      const startStep = Math.min(last.step, stepIdx);
      const endStep = Math.max(last.step, stepIdx);
      const startVal = last.step === startStep ? last.val : val;
      const endVal = last.step === startStep ? val : last.val;
      
      for (let i = startStep; i <= endStep; i++) {
        if (endStep === startStep) {
          next[i] = startVal;
        } else {
          const t = (i - startStep) / (endStep - startStep);
          next[i] = Math.floor(startVal + t * (endVal - startVal));
        }
      }
    }
    
    lastDrawRef.current = { step: stepIdx, val };
    onChange(next);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    updateFromPointer(e, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    updateFromPointer(e, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    lastDrawRef.current = null;
  };

  const safeSteps = track.steps.length >= 128 ? track.steps : [...track.steps, ...Array(128 - track.steps.length).fill(track.steps[track.steps.length - 1] || 0)];
  const pts = safeSteps.slice(0, length * 4).map((val, i) => [i * 8 + 14, 40 - ((val || 0) / 127) * 40]);
  let svgD = pts.length > 0 ? `M ${pts[0][0]} ${pts[0][1]}` : "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i === 0 ? pts[pts.length - 1] : pts[i - 1]; // Use wrapped point for correct looping tangent
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : pts[0]; // Wrapped
    
    const cp1x = p1[0] + 8 / 3;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - 8 / 3;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    
    svgD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#111', padding: '6px 0', borderRadius: '4px', border: '1px solid #333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{ccName}</span>
        <button onClick={onRemove} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px' }}>&times;</button>
      </div>
      <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
        <div style={{ width: '50px', flexShrink: 0 }} /> {/* Label spacer sync with drum grid */}
        
        {/* Visual Background Grid */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {Array.from({length: 32}).map((_, i) => {
            const isActive = i < length;
            // Ghost bar visual indication behind the curve based on the primary 4x step
            const pct = isActive ? Math.max(0, Math.min(100, ((safeSteps[i * 4] || 0) / 127) * 100)) : 0;
            return (
              <div 
                key={i} 
                className={`cc-step seq-step-${i}`}
                style={{ width: '28px', flexShrink: 0, height: '40px', background: '#161b22', border: '1px solid #222', borderRadius: '2px', position: 'relative', opacity: isActive ? 1 : 0.3 }}
              >
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: 'var(--accent-primary)', borderRadius: '0 0 2px 2px', opacity: 0.15, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: '-12px', left: 0, width: '100%', textAlign: 'center', fontSize: '8px', color: '#55', opacity: isActive ? 1 : 0 }}>{safeSteps[i * 4] || 0}</div>
              </div>
            )
          })}
        </div>

        {/* SVG overlay for drawing the curve */}
        <svg style={{ position: 'absolute', left: '54px', top: 0, width: `${32 * 32}px`, height: '40px', pointerEvents: 'none' }}>
           <path d={svgD} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
           {safeSteps.slice(0, length * 4).map((val, i) => (
             <circle key={i} cx={i * 8 + 14} cy={40 - ((val || 0) / 127) * 40} r={i % 4 === 0 ? "2.5" : "1.5"} fill="var(--accent-primary)" opacity={0.8} />
           ))}
        </svg>

        {/* Capture overlay for smooth paint interactions */}
        <div 
           ref={containerRef}
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
           style={{ position: 'absolute', left: '54px', top: 0, width: `${length * 32}px`, height: '40px', cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>
    </div>
  );
};

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, length, setLength, 
  gateLength, setGateLength, mode, setMode, drumTracks, setDrumTracks,
  ccTracks, setCCTracks, ccLabels,
  onSequencerStep, updateSequencer 
}) => {
  const [genPoly, setGenPoly] = useState(false);
  const [genScale, setGenScale] = useState<'minor' | 'major' | 'pentatonic'>('pentatonic');


  // Sync state to AudioWorklet
  useEffect(() => {
    if (updateSequencer) {
      updateSequencer({ isPlaying, bpm, steps, length, gateLength, mode, tracks: drumTracks, ccTracks });
    }
  }, [isPlaying, bpm, steps, length, gateLength, mode, drumTracks, ccTracks, updateSequencer]);

  // Listen for ticks from AudioWorklet
  useEffect(() => {
    // Instead of syncing via React State, map DOM nodes visually via ID selector.
    // This solves massive visual re-render latency loops in large track blocks entirely.
    let lastStep = -1;
    return onSequencerStep?.((step) => {
      if (lastStep !== -1) {
        document.querySelectorAll(`.seq-step-${lastStep}`).forEach(el => el.classList.remove('active-step'));
      }
      document.querySelectorAll(`.seq-step-${step}`).forEach(el => el.classList.add('active-step'));
      lastStep = step;
    });
  }, [onSequencerStep]);

  const updateMelodyStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const toggleNoteInStep = (stepIdx: number, note: number) => {
    setSteps(prev => {
      const next = [...prev];
      const step = { ...next[stepIdx] };
      const notes = step.notes ? [...step.notes] : [];
      const noteIdx = notes.indexOf(note);
      if (noteIdx > -1) {
        notes.splice(noteIdx, 1);
      } else {
        notes.push(note);
      }
      step.notes = notes;
      step.active = notes.length > 0;
      next[stepIdx] = step;
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
      const SCALES = {
        pentatonic: [0, 2, 4, 7, 9],
        minor: [0, 2, 3, 5, 7, 8, 10],
        major: [0, 2, 4, 5, 7, 9, 11]
      };
      
      const root = 36 + Math.floor(Math.random() * 12);
      const scale = SCALES[genScale];
      
      setSteps(prev => prev.map((step, idx) => {
        if (idx >= length) return step;
        
        // Rhythmic pattern logic
        const density = 0.5;
        const isActive = Math.random() < density;
        
        if (!isActive) return { ...step, active: false, notes: [] };

        const notes: number[] = [];
        const count = genPoly ? (Math.random() > 0.7 ? 3 : (Math.random() > 0.4 ? 2 : 1)) : 1;
        
        for(let i=0; i<count; i++) {
          const degree = scale[Math.floor(Math.random() * scale.length)];
          const octave = Math.floor(Math.random() * 2) * 12;
          const n = root + degree + octave;
          if (!notes.includes(n)) notes.push(n);
        }

        return {
          active: true,
          notes,
          accent: Math.random() > 0.8,
          slide: Math.random() > 0.9
        };
      }));
    }
  };

  const clearPattern = () => {
    if (mode === 'drum') {
      const next = drumTracks.map(t => ({...t, steps: t.steps.map((st:any) => ({...st, active: false, accent: false, slide: false}))}));
      setDrumTracks(next);
    } else {
      setSteps(prev => prev.map(s => ({ ...s, active: false, accent: false, slide: false, notes: [] })));
    }
  }

  return (
    <div className="sequencer-container" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* Top Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', paddingBottom: '8px', borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
        
        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: '#111', padding: '2px', borderRadius: '4px', border: '1px solid #333' }}>
           <button onClick={() => setMode('melody')} style={{ background: mode === 'melody' ? '#222' : 'transparent', color: mode === 'melody' ? 'var(--accent-primary)' : '#666', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <Music size={10} /> MELODY
           </button>
           <button onClick={() => setMode('drum')} style={{ background: mode === 'drum' ? '#222' : 'transparent', color: mode === 'drum' ? 'var(--accent-primary)' : '#666', border: 'none', borderRadius: '3px', padding: '4px 8px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            onClick={generateMelody}
            style={{ 
              background: '#161b22', border: '1px solid #30363d', borderRadius: '4px 0 0 4px', padding: '4px 12px', 
              color: '#7ec8ff', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.5px'
            }}
            title="Generate random sequence"
          >
            GEN
          </button>
          <button 
            onClick={() => setGenPoly(!genPoly)}
            style={{ 
              background: genPoly ? '#1a3333' : '#161b22', border: '1px solid #30363d', borderLeft: 'none', borderRadius: '0 4px 4px 0', padding: '4px 8px', 
              color: genPoly ? '#00ffcc' : '#555', fontSize: '8px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.5px'
            }}
            title="Toggle Polyphonic Generation"
          >
            POLY
          </button>
          {mode === 'melody' && (
            <select 
              value={genScale} 
              onChange={(e) => setGenScale(e.target.value as any)}
              style={{ background: '#161b22', border: '1px solid #30363d', color: '#888', borderRadius: '4px', fontSize: '9px', padding: '3px 6px', outline: 'none' }}
            >
              <option value="pentatonic">Pentatonic</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
            </select>
          )}
        </div>

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
          <Timer size={14} color="#888" />
          <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 120)} className="bpm-input" style={{ width: '60px', padding: '4px 6px', fontSize: '12px', background: '#111', color: 'var(--accent-primary)', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }} />
          <span style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} color="#888" />
          <input 
            type="number" min="1" max="32" value={length} 
            onChange={(e) => setLength(Math.max(1, Math.min(32, parseInt(e.target.value) || 16)))} 
            className="bpm-input" 
            style={{ width: '50px', padding: '4px 6px', fontSize: '12px', background: '#111', color: 'var(--accent-primary)', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
          />
          <span style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>LEN</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input 
            type="number" step="0.1" min="0.1" max="1.0" value={gateLength} 
            onChange={(e) => setGateLength(Math.max(0.1, Math.min(1.0, parseFloat(e.target.value) || 0.5)))} 
            className="bpm-input" 
            style={{ width: '55px', padding: '4px 6px', fontSize: '12px', background: '#111', color: 'var(--accent-primary)', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
          />
          <span style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' }}>GATE</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '16px', display: 'flex', flexDirection: 'column' }}>
        {mode === 'melody' ? (
          <div className="melody-grid" style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '8px' }}>
          
          <div style={{ display: 'flex', gap: '4px' }}>
            {/* Note Names Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '50px', flexShrink: 0, alignItems: 'flex-end', paddingRight: '8px', boxSizing: 'border-box' }}>
               {GRID_NOTES.map(noteIdx => {
                  const isBlackKey = [1, 3, 6, 8, 10].includes(noteIdx);
                  return (
                    <div key={noteIdx} style={{ height: '18px', background: isBlackKey ? '#0a0a0a' : 'var(--bg-base)', color: isBlackKey ? '#555' : '#888', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
                      {NOTES[noteIdx]}
                    </div>
                  )
               })}
            </div>

            {/* Stepper Columns */}
            {steps.map((step, i) => {
              const isActiveStep = i < length;
              // For visualization of octave, we'll use the first note or default to middle C octave
              const firstNote = (step.notes && step.notes.length > 0) ? step.notes[0] : 60;
              const displayOctave = Math.floor(firstNote / 12) - 1;

              return (
                <div key={i} className={`melody-col seq-step-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '28px', flexShrink: 0, background: 'transparent', borderRadius: '2px', opacity: isActiveStep ? 1 : 0.3, pointerEvents: isActiveStep ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                  {GRID_NOTES.map(noteIdx => {
                    const absNote = (displayOctave + 1) * 12 + noteIdx;
                    const isNoteActive = step.notes && step.notes.includes(absNote);
                    const isActive = isNoteActive && step.active;

                    // Piano roll cell colors
                    let bg = '#161b22';
                    if (isActive) bg = '#00ffcc';
                    else if ([1, 3, 6, 8, 10].includes(noteIdx)) bg = '#0d1117'; 

                    return (
                      <div 
                        key={noteIdx}
                        className={`melody-cell seq-step-${i} ${isActive ? 'is-active-note' : ''}`}
                        onClick={() => toggleNoteInStep(i, absNote)}
                        style={{ 
                          height: '18px', background: bg, borderRadius: '2px', cursor: 'pointer',
                          border: isActive ? '1px solid #fff' : '1px solid #222'
                        }}
                      />
                    )
                  })}

                  {/* Controls under grid */}
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                     <DragNumber 
                        value={displayOctave} 
                        onChange={(v) => {
                          const diff = (v - displayOctave) * 12;
                          const nextNotes = (step.notes || []).map(n => Math.max(0, Math.min(127, n + diff)));
                          updateMelodyStep(i, { notes: nextNotes });
                        }} 
                        min={0} max={9} label="Octave" 
                     />
                     
                     <div onClick={() => updateMelodyStep(i, { active: !step.active })} style={{ height: '14px', background: step.active ? '#ff3366' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Gate" />
                     <div onClick={() => updateMelodyStep(i, { accent: !step.accent })} style={{ height: '14px', background: step.accent ? 'var(--accent-primary)' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Accent" />
                     <div onClick={() => updateMelodyStep(i, { slide: !step.slide })} style={{ height: '14px', background: step.slide ? '#7ec8ff' : '#222', borderRadius: '2px', cursor: 'pointer', border: '1px solid #111' }} title="Slide" />
                     
                     <div className={`step-number seq-step-${i}`} style={{ textAlign: 'center', marginTop: '2px' }}>{i + 1}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="drum-grid" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div style={{ width: '50px', flexShrink: 0 }} /> {/* Label spacer */}
              {Array.from({length: 32}).map((_, i) => (
                <div key={i} className={`step-number seq-step-${i}`} style={{ width: '28px', flexShrink: 0, textAlign: 'center', opacity: i < length ? 1 : 0.3, transition: 'opacity 0.2s' }}>{i + 1}</div>
              ))}
           </div>
           {drumTracks.map((track, tIdx) => (
             <div key={tIdx} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
               <div style={{ width: '50px', flexShrink: 0, fontSize: '10px', fontWeight: 'bold', color: 'var(--accent-primary)', textAlign: 'right', paddingRight: '10px', boxSizing: 'border-box' }}>{track.name}</div>
               {track.steps.map((st: any, i: number) => (
                 <div key={i} className={`drum-cell seq-step-${i}`} onClick={() => updateDrumStep(tIdx, i, !st.active)} style={{
                   width: '28px', flexShrink: 0, height: '24px', background: st.active ? '#ff3366' : (Math.floor(i/4)%2 === 0 ? '#111' : '#161b22'),
                   borderRadius: '3px', cursor: 'pointer', border: '1px solid #222',
                   boxShadow: st.active ? '0 0 6px rgba(255, 51, 102, 0.3)' : 'none', transition: 'all 0.1s', opacity: i < length ? 1 : 0.3, pointerEvents: i < length ? 'auto' : 'none'
                 }} />
               ))}
             </div>
           ))}
        </div>
      )}

      {/* CC Automation Lanes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
         {ccTracks.map((track, i) => (
           <CCLane 
             key={`cc-${track.cc}`} 
             track={track} 
             length={length} 
             onChange={st => setCCTracks(prev => prev.map((t, tidx) => tidx === i ? { ...t, steps: st } : t))}
             onRemove={() => setCCTracks(prev => prev.filter((_, tidx) => tidx !== i))}
             ccName={`CC ${track.cc} (${ccLabels[track.cc] || 'Unknown'})`}
           />
         ))}

         {/* Add CC button drop menu */}
         <div style={{ paddingLeft: '54px' }}>
           <select 
             value="" 
             onChange={(e) => {
               const cc = parseInt(e.target.value);
               if (!ccTracks.find(t => t.cc === cc)) {
                 setCCTracks(prev => [...prev, { cc, steps: Array(128).fill(0) }]);
               }
             }}
             style={{ background: '#161b22', border: '1px solid #30363d', color: '#aaa', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', outline: 'none', cursor: 'pointer' }}
           >
             <option value="" disabled>+ Add CC Lane...</option>
             {Object.entries(ccLabels).map(([cc, label]) => (
                <option key={cc} value={cc} disabled={ccTracks.some(t => t.cc === parseInt(cc))}>
                  CC {cc} - {label}
                </option>
             ))}
           </select>
         </div>
      </div>
      
      </div>

    </div>
  );
};

export default Sequencer;
