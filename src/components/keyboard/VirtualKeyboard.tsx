import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Slider } from '../controls/Slider';
import './VirtualKeyboard.css';

interface VirtualKeyboardProps {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onCC: (cc: number, value: number) => void;
  ccLabels?: Record<number, string>;
}

// Notes in an octave
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_NOTE_INDICES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const BLACK_NOTE_INDICES = [1, 3, 6, 8, 10]; // C# D# F# G# A#

// Black key positions relative to white keys (which white key gap they sit in)
// C#=between 0,1  D#=between 1,2  F#=between 3,4  G#=between 4,5  A#=between 5,6
const BLACK_KEY_WHITE_POS: Record<number, number> = {
  1: 1,   // C# after white key 0 (C)
  3: 2,   // D# after white key 1 (D)
  6: 4,   // F# after white key 3 (F)
  8: 5,   // G# after white key 4 (G)
  10: 6,  // A# after white key 5 (A)
};

// PC keyboard mapping (Ableton 2-row style)
// Lower row: Z..M => lower octave C..B
const LOWER_ROW_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
const LOWER_ROW_LABELS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
// Black keys in lower row via S, D, G, H, J (not used in standard mapping, but we'll keep simple)
const LOWER_BLACK_KEYS = ['s', 'd', '', 'g', 'h', 'j'];
const LOWER_BLACK_LABELS = ['S', 'D', '', 'G', 'H', 'J'];

// Upper row: Q..U => upper octave C..B
const UPPER_ROW_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u'];
const UPPER_ROW_LABELS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'];
const UPPER_BLACK_KEYS = ['2', '3', '', '5', '6', '7'];
const UPPER_BLACK_LABELS = ['2', '3', '', '5', '6', '7'];

function octaveName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 2; // MIDI convention: C3 = 48 => octave 3
  return `C${octave}`;
}

export function VirtualKeyboard({ onNoteOn, onNoteOff, onCC }: VirtualKeyboardProps) {
  const [baseOctave, setBaseOctave] = useState(3); // C3
  const [velocity, setVelocity] = useState(100);
  const [sustain, setSustain] = useState(false);
  const [pitchBend, setPitchBend] = useState(8192);
  const [modWheel, setModWheel] = useState(0);
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const mouseNoteRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const keysContainerRef = useRef<HTMLDivElement>(null);
  const sustainedNotesRef = useRef<Set<number>>(new Set());

  const numOctaves = 2;
  const baseMidi = (baseOctave + 2) * 12; // C3 = 48 when baseOctave=3

  const rangeLabel = `${octaveName(baseMidi)}\u2013${octaveName(baseMidi + numOctaves * 12)}`;

  // Build key data
  const { whiteKeys, blackKeys } = useMemo(() => {
    const whites: Array<{
      midi: number;
      name: string;
      octaveIndex: number;
      whiteIndex: number;
      hint?: string;
    }> = [];
    const blacks: Array<{
      midi: number;
      name: string;
      whitePosition: number; // which white key it's positioned after
      hint?: string;
    }> = [];

    for (let oct = 0; oct < numOctaves; oct++) {
      const octBase = baseMidi + oct * 12;
      // White keys
      for (let i = 0; i < WHITE_NOTE_INDICES.length; i++) {
        const noteIdx = WHITE_NOTE_INDICES[i];
        const midi = octBase + noteIdx;
        const whiteIndex = oct * 7 + i;
        const hintKeys = oct === 0 ? LOWER_ROW_LABELS : UPPER_ROW_LABELS;
        whites.push({
          midi,
          name: NOTE_NAMES[noteIdx],
          octaveIndex: oct,
          whiteIndex,
          hint: hintKeys[i],
        });
      }
      // Black keys
      for (const noteIdx of BLACK_NOTE_INDICES) {
        const midi = octBase + noteIdx;
        const whitePos = BLACK_KEY_WHITE_POS[noteIdx];
        const globalWhitePos = oct * 7 + whitePos;

        // Hint labels for black keys
        const blackIdx = BLACK_NOTE_INDICES.indexOf(noteIdx);
        const hintKeys = oct === 0 ? LOWER_BLACK_LABELS : UPPER_BLACK_LABELS;
        const hint = hintKeys[blackIdx] || undefined;

        blacks.push({
          midi,
          name: NOTE_NAMES[noteIdx],
          whitePosition: globalWhitePos,
          hint,
        });
      }
    }
    return { whiteKeys: whites, blackKeys: blacks };
  }, [baseMidi, numOctaves]);

  const totalWhiteKeys = numOctaves * 7;

  // Note on/off helpers
  const noteOn = useCallback(
    (note: number, vel: number) => {
      setPressedNotes((prev) => {
        const next = new Set(prev);
        next.add(note);
        return next;
      });
      onNoteOn(note, vel);
    },
    [onNoteOn],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (sustain) {
        sustainedNotesRef.current.add(note);
        return;
      }
      setPressedNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      onNoteOff(note);
    },
    [onNoteOff, sustain],
  );

  // Sustain toggle
  const toggleSustain = useCallback(() => {
    setSustain((prev) => {
      if (prev) {
        // Releasing sustain: send noteOff for all sustained notes
        sustainedNotesRef.current.forEach((note) => {
          onNoteOff(note);
          setPressedNotes((p) => {
            const next = new Set(p);
            next.delete(note);
            return next;
          });
        });
        sustainedNotesRef.current.clear();
      }
      return !prev;
    });
  }, [onNoteOff]);

  // Mouse interaction: velocity based on Y position within key
  const getVelocityFromEvent = useCallback(
    (e: React.PointerEvent | PointerEvent, element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      const yRatio = (e.clientY - rect.top) / rect.height;
      // Top = soft (~40), bottom = hard (~127)
      return Math.round(40 + yRatio * 87);
    },
    [],
  );

  const getMidiFromElement = useCallback((el: HTMLElement): number | null => {
    const midi = el.getAttribute('data-midi');
    return midi ? parseInt(midi, 10) : null;
  }, []);

  const handleKeyPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const keyEl = target.closest('[data-midi]') as HTMLElement | null;
      if (!keyEl) return;

      const midi = getMidiFromElement(keyEl);
      if (midi === null) return;

      const vel = getVelocityFromEvent(e, keyEl);
      noteOn(midi, vel);
      mouseNoteRef.current = midi;
      isDraggingRef.current = true;

      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [noteOn, getVelocityFromEvent, getMidiFromElement],
  );

  const handleKeyPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el) return;
      const keyEl = el.closest('[data-midi]') as HTMLElement | null;
      if (!keyEl) return;

      const midi = getMidiFromElement(keyEl);
      if (midi === null) return;

      if (midi !== mouseNoteRef.current) {
        // Glissando
        if (mouseNoteRef.current !== null) {
          noteOff(mouseNoteRef.current);
        }
        const vel = getVelocityFromEvent(e, keyEl);
        noteOn(midi, vel);
        mouseNoteRef.current = midi;
      }
    },
    [noteOn, noteOff, getVelocityFromEvent, getMidiFromElement],
  );

  const handleKeyPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>) => {
      if (mouseNoteRef.current !== null) {
        noteOff(mouseNoteRef.current);
        mouseNoteRef.current = null;
      }
      isDraggingRef.current = false;
    },
    [noteOff],
  );

  // PC keyboard mapping
  const buildKeyMap = useCallback((): Map<string, number> => {
    const map = new Map<string, number>();
    const lowerBase = baseMidi;
    const upperBase = baseMidi + 12;

    // Lower octave white keys: Z X C V B N M => C D E F G A B
    LOWER_ROW_KEYS.forEach((key, i) => {
      map.set(key, lowerBase + WHITE_NOTE_INDICES[i]);
    });
    // Lower octave black keys: S D _ G H J => C# D# _ F# G# A#
    LOWER_BLACK_KEYS.forEach((key, i) => {
      if (key) map.set(key, lowerBase + BLACK_NOTE_INDICES[i]);
    });

    // Upper octave white keys: Q W E R T Y U => C D E F G A B
    UPPER_ROW_KEYS.forEach((key, i) => {
      map.set(key, upperBase + WHITE_NOTE_INDICES[i]);
    });
    // Upper octave black keys: 2 3 _ 5 6 7 => C# D# _ F# G# A#
    UPPER_BLACK_KEYS.forEach((key, i) => {
      if (key) map.set(key, upperBase + BLACK_NOTE_INDICES[i]);
    });

    return map;
  }, [baseMidi]);

  useEffect(() => {
    const keyMap = buildKeyMap();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      // Space for sustain
      if (e.code === 'Space') {
        e.preventDefault();
        toggleSustain();
        return;
      }

      const key = e.key.toLowerCase();
      const midi = keyMap.get(key);
      if (midi !== undefined && !pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.add(key);
        noteOn(midi, velocity);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = keyMap.get(key);
      if (midi !== undefined && pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.delete(key);
        noteOff(midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [buildKeyMap, noteOn, noteOff, velocity, toggleSustain]);

  // Pitch bend handler
  const handlePitchBend = useCallback(
    (value: number) => {
      setPitchBend(value);
      onCC(128, value);
    },
    [onCC],
  );

  // Mod wheel handler
  const handleModWheel = useCallback(
    (value: number) => {
      setModWheel(value);
      onCC(1, Math.round(value));
    },
    [onCC],
  );

  return (
    <div className="vk-container">
      {/* Header controls */}
      <div className="vk-header">
        <div className="vk-octave-selector">
          <button
            className="vk-octave-btn"
            onClick={() => setBaseOctave((o) => Math.max(0, o - 1))}
          >
            &minus;
          </button>
          <span className="vk-octave-label">{rangeLabel}</span>
          <button
            className="vk-octave-btn"
            onClick={() => setBaseOctave((o) => Math.min(7, o + 1))}
          >
            +
          </button>
        </div>

        <div className="vk-vel-group">
          <span className="vk-vel-label">VEL</span>
          <Slider
            value={velocity}
            min={1}
            max={127}
            orientation="horizontal"
            onChange={setVelocity}
            width={60}
            height={12}
          />
          <span className="vk-vel-value">{velocity}</span>
        </div>

        <button
          className={`vk-sustain-btn${sustain ? ' active' : ''}`}
          onClick={toggleSustain}
        >
          SUSTAIN
          <span className="vk-sustain-hint">Space</span>
        </button>
      </div>

      {/* Body: wheels + piano */}
      <div className="vk-body">
        {/* Wheels */}
        <div className="vk-wheels">
          <div className="vk-wheel">
            <span className="vk-wheel-label">PITCH</span>
            <Slider
              value={pitchBend}
              min={0}
              max={16383}
              orientation="vertical"
              springReturn={true}
              onChange={handlePitchBend}
              width={18}
              height={55}
            />
          </div>
          <div className="vk-wheel">
            <span className="vk-wheel-label">MOD</span>
            <Slider
              value={modWheel}
              min={0}
              max={127}
              orientation="vertical"
              fillFromBottom={true}
              onChange={handleModWheel}
              width={18}
              height={55}
            />
          </div>
        </div>

        {/* Piano keys */}
        <div
          className="vk-keys-wrapper"
          ref={keysContainerRef}
          onPointerDown={handleKeyPointerDown}
          onPointerMove={handleKeyPointerMove}
          onPointerUp={handleKeyPointerUp}
        >
          <div className="vk-keys">
            {/* White keys */}
            {whiteKeys.map((wk) => {
              const isC = wk.name === 'C';
              const octNum = Math.floor(wk.midi / 12) - 2;
              return (
                <div
                  key={wk.midi}
                  className={`vk-white-key${pressedNotes.has(wk.midi) ? ' pressed' : ''}`}
                  data-midi={wk.midi}
                >
                  {isC && (
                    <span className="vk-c-label">
                      C{octNum}
                    </span>
                  )}
                  {wk.hint && <span className="vk-key-hint">{wk.hint}</span>}
                </div>
              );
            })}

            {/* Black keys */}
            {blackKeys.map((bk) => {
              const leftPercent = (bk.whitePosition / totalWhiteKeys) * 100;
              const widthPercent = (0.6 / totalWhiteKeys) * 100;
              return (
                <div
                  key={bk.midi}
                  className={`vk-black-key${pressedNotes.has(bk.midi) ? ' pressed' : ''}`}
                  data-midi={bk.midi}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                >
                  <div className="vk-black-key-inner" data-midi={bk.midi}>
                    {bk.hint && <span className="vk-key-hint">{bk.hint}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
