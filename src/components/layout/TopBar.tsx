import { Play, Square, AudioWaveform } from 'lucide-react';
import { GhostButton } from '../controls/GhostButton';
import { ToggleGroup } from '../controls/ToggleGroup';
import { Pill } from '../controls/Pill';
import './TopBar.css';

export interface TopBarProps {
  projectName: string;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  vultVersion: 'v0' | 'v1';
  onVultVersionChange: (v: 'v0' | 'v1') => void;
  sampleRate: number;
  bufferSize: number;
  onExport: () => void;
  onCommandPalette: () => void;
}

export function TopBar({
  projectName,
  isPlaying,
  onPlay,
  onStop,
  vultVersion,
  onVultVersionChange,
  sampleRate,
  bufferSize,
  onExport,
  onCommandPalette,
}: TopBarProps) {
  const parts = projectName.split('/');
  const folder = parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'examples';
  const file = parts[parts.length - 1];

  return (
    <div className="topbar">
      {/* Logo */}
      <div className="topbar__logo">
        <AudioWaveform className="topbar__logo-icon" size={16} />
        <span className="topbar__logo-text">DSPLab</span>
      </div>

      <div className="divider" style={{ height: 18 }} />

      {/* Breadcrumb */}
      <div className="topbar__breadcrumb">
        <span className="topbar__breadcrumb-folder">{folder}</span>
        <span className="topbar__breadcrumb-separator">/</span>
        <span className="topbar__breadcrumb-file">{file}</span>
      </div>

      <div className="topbar__spacer" />

      {/* Transport */}
      <div className="topbar__transport">
        <GhostButton active={isPlaying} onClick={onPlay} title="Play">
          <Play size={12} />
        </GhostButton>
        <GhostButton onClick={onStop} title="Stop">
          <Square size={12} />
        </GhostButton>
        <div className="divider" />
        <ToggleGroup
          options={[
            { value: 'v0' as const, label: 'v0' },
            { value: 'v1' as const, label: 'v1' },
          ]}
          value={vultVersion}
          onChange={onVultVersionChange}
        />
      </div>

      <div className="divider" />

      {/* Status pills */}
      <div className="topbar__pills">
        <Pill color="var(--accent-secondary)">{(sampleRate / 1000).toFixed(0)}kHz</Pill>
        <Pill color="var(--text-tertiary)">{bufferSize}</Pill>
      </div>

      {/* Export */}
      <GhostButton onClick={onExport} title="Export">
        Export ↓
      </GhostButton>

      {/* Command palette hint */}
      <button className="topbar__cmd-hint" onClick={onCommandPalette}>
        ⌘K
      </button>
    </div>
  );
}
