import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ToggleGroup } from '../controls/ToggleGroup';
import { GhostButton } from '../controls/GhostButton';
import './StepSequencer.css';

export interface Step {
  active: boolean;
  notes: number[];
  accent: boolean;
  slide: boolean;
  velocity?: number;
}

interface StepSequencerProps {
  steps: Step[];
  onStepsChange: (steps: Step[]) => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  length: number;
  onLengthChange: (len: number) => void;
  gateLength: number;
  onGateLengthChange: (gate: number) => void;
  mode: 'melody' | 'drum';
  onModeChange: (mode: 'melody' | 'drum') => void;
  drumTracks: any[];
  onDrumTracksChange: (tracks: any[]) => void;
  ccTracks?: any[];
  onCCTracksChange?: (tracks: any[]) => void;
  currentStep?: number;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DRUM_LABELS = ['BD', 'SD', 'CH', 'OH'];

// C3 (48) through C5 (72) — 25 notes, displayed top to bottom
function buildNoteRange(): { midi: number; name: string; isCRow: boolean }[] {
  const range: { midi: number; name: string; isCRow: boolean }[] = [];
  for (let midi = 72; midi >= 48; midi--) {
    const noteName = NOTES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    range.push({
      midi,
      name: `${noteName}${octave}`,
      isCRow: midi % 12 === 0,
    });
  }
  return range;
}

const NOTE_RANGE = buildNoteRange();

export function StepSequencer({
  steps,
  onStepsChange,
  bpm,
  onBpmChange,
  isPlaying,
  onPlayToggle,
  length,
  onLengthChange,
  gateLength,
  onGateLengthChange,
  mode,
  onModeChange,
  drumTracks,
  onDrumTracksChange,
  ccTracks,
  onCCTracksChange,
  currentStep,
}: StepSequencerProps) {
  const [activePattern, setActivePattern] = useState(0);
  const [patternCount, setPatternCount] = useState(4);
  const [clipboard, setClipboard] = useState<Step[] | null>(null);
  const dragModeRef = useRef<'paint' | 'erase' | null>(null);
  const isDraggingRef = useRef(false);

  // Melody note toggle
  const toggleNote = useCallback(
    (stepIdx: number, midi: number) => {
      const next = [...steps];
      const step = { ...next[stepIdx] };
      const notes = step.notes ? [...step.notes] : [];
      const idx = notes.indexOf(midi);
      if (idx > -1) {
        notes.splice(idx, 1);
      } else {
        notes.push(midi);
      }
      step.notes = notes;
      step.active = notes.length > 0;
      next[stepIdx] = step;
      onStepsChange(next);
    },
    [steps, onStepsChange]
  );

  // Set a note (for drag painting)
  const setNote = useCallback(
    (stepIdx: number, midi: number, active: boolean) => {
      const next = [...steps];
      const step = { ...next[stepIdx] };
      const notes = step.notes ? [...step.notes] : [];
      const idx = notes.indexOf(midi);
      if (active && idx === -1) {
        notes.push(midi);
      } else if (!active && idx > -1) {
        notes.splice(idx, 1);
      } else {
        return; // no change
      }
      step.notes = notes;
      step.active = notes.length > 0;
      next[stepIdx] = step;
      onStepsChange(next);
    },
    [steps, onStepsChange]
  );

  // Drum toggle
  const toggleDrum = useCallback(
    (trackIdx: number, stepIdx: number) => {
      const next = [...drumTracks];
      const track = { ...next[trackIdx] };
      const st = [...track.steps];
      st[stepIdx] = { ...st[stepIdx], active: !st[stepIdx].active };
      track.steps = st;
      next[trackIdx] = track;
      onDrumTracksChange(next);
    },
    [drumTracks, onDrumTracksChange]
  );

  // Pattern actions
  const clearPattern = useCallback(() => {
    if (mode === 'drum') {
      const next = drumTracks.map((t: any) => ({
        ...t,
        steps: t.steps.map((st: any) => ({ ...st, active: false })),
      }));
      onDrumTracksChange(next);
    } else {
      onStepsChange(
        steps.map((s) => ({ ...s, active: false, notes: [], velocity: s.velocity }))
      );
    }
  }, [mode, steps, drumTracks, onStepsChange, onDrumTracksChange]);

  const randomPattern = useCallback(() => {
    if (mode === 'drum') {
      const next = drumTracks.map((t: any, tIdx: number) => ({
        ...t,
        steps: t.steps.map((st: any, i: number) => ({
          ...st,
          active: i < length && Math.random() > (tIdx === 0 ? 0.4 : 0.7),
        })),
      }));
      onDrumTracksChange(next);
    } else {
      const scale = [0, 2, 4, 7, 9]; // pentatonic
      const root = 48 + Math.floor(Math.random() * 12);
      onStepsChange(
        steps.map((step, idx) => {
          if (idx >= length) return step;
          if (Math.random() > 0.5) return { ...step, active: false, notes: [] };
          const degree = scale[Math.floor(Math.random() * scale.length)];
          const octave = Math.floor(Math.random() * 2) * 12;
          const midi = root + degree + octave;
          const clampedMidi = Math.max(48, Math.min(72, midi));
          return {
            ...step,
            active: true,
            notes: [clampedMidi],
            velocity: 64 + Math.floor(Math.random() * 64),
          };
        })
      );
    }
  }, [mode, steps, length, drumTracks, onStepsChange, onDrumTracksChange]);

  const copyPattern = useCallback(() => {
    setClipboard(steps.map((s) => ({ ...s })));
  }, [steps]);

  const pastePattern = useCallback(() => {
    if (clipboard) {
      onStepsChange(clipboard.map((s) => ({ ...s })));
    }
  }, [clipboard, onStepsChange]);

  // Mouse handlers for drag painting (melody)
  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, stepIdx: number, midi: number) => {
      e.preventDefault();
      const step = steps[stepIdx];
      const isActive = step.notes?.includes(midi);
      if (e.shiftKey) {
        dragModeRef.current = 'erase';
      } else {
        dragModeRef.current = isActive ? 'erase' : 'paint';
      }
      isDraggingRef.current = true;
      setNote(stepIdx, midi, dragModeRef.current === 'paint');
    },
    [steps, setNote]
  );

  const handleCellMouseEnter = useCallback(
    (stepIdx: number, midi: number) => {
      if (!isDraggingRef.current || !dragModeRef.current) return;
      setNote(stepIdx, midi, dragModeRef.current === 'paint');
    },
    [setNote]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragModeRef.current = null;
  }, []);

  // Playhead position calculation
  const playheadLeft = useMemo(() => {
    if (currentStep == null || currentStep < 0) return undefined;
    // Each cell is 1/length fraction of the rows container
    const fraction = (currentStep + 0.5) / length;
    return `${fraction * 100}%`;
  }, [currentStep, length]);

  // Visible steps
  const visibleSteps = steps.slice(0, length);

  return (
    <div className="step-sequencer" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Header */}
      <div className="step-sequencer__header">
        <span className="step-sequencer__title">SEQUENCER</span>
        <div className="step-sequencer__separator" />

        <ToggleGroup
          options={[
            { value: 'melody', label: 'MELODY' },
            { value: 'drum', label: 'DRUM' },
          ]}
          value={mode}
          onChange={onModeChange}
        />

        <div className="step-sequencer__separator" />

        <span className="step-sequencer__param-label">STEPS</span>
        <ToggleGroup
          options={[
            { value: '8', label: '8' },
            { value: '16', label: '16' },
            { value: '32', label: '32' },
            { value: '64', label: '64' },
          ]}
          value={String(length)}
          onChange={(v) => onLengthChange(parseInt(v, 10))}
        />

        <div className="step-sequencer__separator" />

        <span className="step-sequencer__param-label">BPM</span>
        <input
          type="number"
          className="step-sequencer__bpm-input"
          value={bpm}
          onChange={(e) => onBpmChange(parseInt(e.target.value, 10) || 120)}
          min={20}
          max={999}
        />

        <div className="step-sequencer__separator" />

        <span className="step-sequencer__param-label">SWING</span>
        <span className="step-sequencer__swing-display">50%</span>
      </div>

      {/* Grid */}
      {mode === 'melody' ? (
        <div className="step-sequencer__grid">
          {/* Note labels */}
          <div className="step-sequencer__labels">
            {NOTE_RANGE.map((note) => (
              <div
                key={note.midi}
                className={`step-sequencer__label${note.isCRow ? ' step-sequencer__label--c-row' : ''}`}
                style={{ height: 11 }}
              >
                {note.name}
              </div>
            ))}
          </div>

          {/* Note rows */}
          <div className="step-sequencer__rows">
            {NOTE_RANGE.map((note) => (
              <div key={note.midi} className="step-sequencer__row">
                {visibleSteps.map((step, stepIdx) => {
                  const isActive = step.notes?.includes(note.midi) && step.active;
                  const groupIdx = Math.floor(stepIdx / 4);
                  const isEvenGroup = groupIdx % 2 === 0;
                  let cls = 'step-sequencer__cell';
                  cls += isEvenGroup
                    ? ' step-sequencer__cell--even-group'
                    : ' step-sequencer__cell--odd-group';
                  if (note.isCRow) cls += ' step-sequencer__cell--c-row';
                  if (isActive) cls += ' step-sequencer__cell--active';
                  return (
                    <div
                      key={stepIdx}
                      className={cls}
                      onMouseDown={(e) => handleCellMouseDown(e, stepIdx, note.midi)}
                      onMouseEnter={() => handleCellMouseEnter(stepIdx, note.midi)}
                    />
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
            {playheadLeft != null && (
              <div
                className="step-sequencer__playhead"
                style={{ left: playheadLeft }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="step-sequencer__grid">
          {/* Drum labels */}
          <div className="step-sequencer__drum-labels">
            {drumTracks.slice(0, 4).map((track: any, tIdx: number) => (
              <div key={tIdx} className="step-sequencer__drum-label">
                {track.name || DRUM_LABELS[tIdx] || `D${tIdx + 1}`}
              </div>
            ))}
          </div>

          {/* Drum rows */}
          <div className="step-sequencer__rows">
            {drumTracks.slice(0, 4).map((track: any, tIdx: number) => (
              <div key={tIdx} className="step-sequencer__row step-sequencer__row--drum">
                {track.steps.slice(0, length).map((st: any, stepIdx: number) => {
                  const groupIdx = Math.floor(stepIdx / 4);
                  const isEvenGroup = groupIdx % 2 === 0;
                  let cls = 'step-sequencer__cell step-sequencer__cell--drum';
                  cls += isEvenGroup
                    ? ' step-sequencer__cell--even-group'
                    : ' step-sequencer__cell--odd-group';
                  if (st.active) cls += ' step-sequencer__cell--active';
                  return (
                    <div
                      key={stepIdx}
                      className={cls}
                      onClick={() => toggleDrum(tIdx, stepIdx)}
                    />
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
            {playheadLeft != null && (
              <div
                className="step-sequencer__playhead"
                style={{ left: playheadLeft }}
              />
            )}
          </div>
        </div>
      )}

      {/* Velocity lane */}
      <div className="step-sequencer__velocity-lane">
        {visibleSteps.map((step, idx) => {
          const vel = step.velocity ?? (step.active ? 100 : 0);
          const heightPct = (vel / 127) * 100;
          return (
            <div
              key={idx}
              className="step-sequencer__velocity-bar"
              style={{ height: `${heightPct}%` }}
              title={`Velocity: ${vel}`}
            />
          );
        })}
      </div>

      {/* Pattern controls */}
      <div className="step-sequencer__controls">
        <GhostButton onClick={clearPattern}>CLEAR</GhostButton>
        <GhostButton onClick={randomPattern}>RANDOM</GhostButton>
        <GhostButton onClick={copyPattern}>COPY</GhostButton>
        <GhostButton onClick={pastePattern}>PASTE</GhostButton>

        <div className="step-sequencer__controls-spacer" />

        <div className="step-sequencer__pattern-selector">
          {Array.from({ length: patternCount }).map((_, i) => (
            <button
              key={i}
              className={`step-sequencer__pattern-btn${i === activePattern ? ' step-sequencer__pattern-btn--active' : ''}`}
              onClick={() => setActivePattern(i)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="step-sequencer__pattern-btn step-sequencer__pattern-btn--add"
            onClick={() => setPatternCount((c) => Math.min(c + 1, 8))}
            title="Add pattern"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default StepSequencer;
