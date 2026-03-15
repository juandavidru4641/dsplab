import React, { useCallback } from 'react';
import type { InputSource, SourceType } from '../../AudioEngine';
import { Knob } from '../controls/Knob';
import { ToggleGroup } from '../controls/ToggleGroup';
import { Zap, Play } from 'lucide-react';
import './InputsPanel.css';

interface InputsPanelProps {
  inputs: InputSource[];
  onInputChange: (index: number, changes: Partial<InputSource>) => void;
  onTrigger?: (index: number) => void;
  onSampleUpload?: (index: number, file: File) => void;
  audioDevices?: MediaDeviceInfo[];
}

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'cv', label: 'DC' },
  { value: 'oscillator', label: 'Osc' },
  { value: 'lfo', label: 'LFO' },
  { value: 'live', label: 'Audio' },
  { value: 'sample', label: 'Sample' },
  { value: 'impulse', label: 'Impulse' },
  { value: 'test_noise', label: 'Noise' },
];

const WAVE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sine', label: 'SIN' },
  { value: 'sawtooth', label: 'SAW' },
  { value: 'square', label: 'SQR' },
  { value: 'triangle', label: 'TRI' },
];

function InputStrip({
  input,
  index,
  onChange,
  onTrigger,
  onSampleUpload,
  audioDevices,
}: {
  input: InputSource;
  index: number;
  onChange: (changes: Partial<InputSource>) => void;
  onTrigger?: () => void;
  onSampleUpload?: (file: File) => void;
  audioDevices?: MediaDeviceInfo[];
}) {
  const handleSourceChange = useCallback(
    (value: string) => onChange({ type: value as SourceType }),
    [onChange],
  );

  return (
    <div className="inputs-strip">
      <div className="inputs-strip__header">
        <span className="inputs-strip__name">{input.name.toUpperCase()}</span>
        {(input.type === 'impulse' || input.type === 'step') && onTrigger && (
          <button className="inputs-strip__trigger" onClick={onTrigger} title="Fire trigger">
            <Zap size={10} />
          </button>
        )}
      </div>

      <div className="inputs-strip__source">
        <ToggleGroup
          options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={input.type}
          onChange={handleSourceChange}
        />
      </div>

      <div className="inputs-strip__controls">
        {input.type === 'oscillator' && (
          <>
            <ToggleGroup
              options={WAVE_OPTIONS}
              value={input.oscType}
              onChange={(v) => onChange({ oscType: v as InputSource['oscType'] })}
            />
            <div className="inputs-strip__knobs">
              <Knob
                label="FREQ"
                value={input.freq}
                min={20}
                max={20000}
                onChange={(val) => onChange({ freq: val })}
                color="var(--accent-cyan)"
              />
            </div>
          </>
        )}

        {input.type === 'lfo' && (
          <>
            <ToggleGroup
              options={WAVE_OPTIONS}
              value={input.lfoShape || 'sine'}
              onChange={(v) => onChange({ lfoShape: v as InputSource['lfoShape'] })}
            />
            <div className="inputs-strip__knobs">
              <Knob
                label="RATE"
                value={input.lfoRate || 1}
                min={0.1}
                max={50}
                onChange={(val) => onChange({ lfoRate: val })}
              />
              <Knob
                label="DEPTH"
                value={input.lfoDepth || 1}
                min={0}
                max={1}
                defaultValue={1}
                onChange={(val) => onChange({ lfoDepth: val })}
                color="var(--accent-danger, #f14c4c)"
              />
            </div>
          </>
        )}

        {input.type === 'cv' && (
          <div className="inputs-strip__knobs">
            <Knob
              label="VALUE"
              value={input.value}
              min={0}
              max={1}
              defaultValue={0.5}
              onChange={(val) => onChange({ value: val })}
            />
          </div>
        )}

        {input.type === 'live' && (
          <div className="inputs-strip__info">
            <select
              className="inputs-strip__select"
              value={input.deviceId || 'default'}
              onChange={(e) => onChange({ deviceId: e.target.value })}
            >
              <option value="default">Default Mic</option>
              {audioDevices?.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Input'}
                </option>
              ))}
            </select>
          </div>
        )}

        {input.type === 'sample' && (
          <div className="inputs-strip__sample">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) =>
                e.target.files && onSampleUpload?.(e.target.files[0])
              }
              style={{ display: 'none' }}
              id={`inputs-sample-${index}`}
            />
            <label htmlFor={`inputs-sample-${index}`} className="inputs-strip__file-btn">
              LOAD FILE
            </label>
            {onTrigger && (
              <button className="inputs-strip__play-btn" onClick={onTrigger} title="Play sample">
                <Play size={10} />
              </button>
            )}
          </div>
        )}

        {input.type === 'impulse' && (
          <div className="inputs-strip__info-text">
            1-sample trigger. Click zap to fire.
          </div>
        )}

        {input.type === 'test_noise' && (
          <div className="inputs-strip__info-text inputs-strip__info-text--active">
            White Noise Active
          </div>
        )}
      </div>
    </div>
  );
}

export function InputsPanel({
  inputs,
  onInputChange,
  onTrigger,
  onSampleUpload,
  audioDevices,
}: InputsPanelProps) {
  return (
    <div className="inputs-panel">
      {inputs.length === 0 && (
        <div className="inputs-panel__empty">
          No inputs detected. Write a Vult <code>process()</code> function with parameters.
        </div>
      )}
      {inputs.map((input, i) => (
        <InputStrip
          key={i}
          input={input}
          index={i}
          onChange={(changes) => onInputChange(i, changes)}
          onTrigger={onTrigger ? () => onTrigger(i) : undefined}
          onSampleUpload={onSampleUpload ? (file) => onSampleUpload(i, file) : undefined}
          audioDevices={audioDevices}
        />
      ))}
    </div>
  );
}

export default InputsPanel;
