import React from 'react';
import { TopBar } from './TopBar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import './AppShell.css';

export interface AppShellProps {
  // TopBar props
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
  // ActivityBar props
  activePanel: string | null;
  onPanelToggle: (panel: string) => void;
  // StatusBar props
  status: 'ready' | 'compiling' | 'error';
  cpuPercent: number;
  latencyMs: number;
  vultVersion_display?: string;
  // Content
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
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
  activePanel,
  onPanelToggle,
  status,
  cpuPercent,
  latencyMs,
  vultVersion_display = '0.4.15',
  rightPanel,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar
        projectName={projectName}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onStop={onStop}
        vultVersion={vultVersion}
        onVultVersionChange={onVultVersionChange}
        sampleRate={sampleRate}
        bufferSize={bufferSize}
        onExport={onExport}
        onCommandPalette={onCommandPalette}
      />
      <div className="app-shell__body">
        <ActivityBar activePanel={activePanel} onPanelToggle={onPanelToggle} />
        <div className="app-shell__main">
          {children}
        </div>
        {rightPanel}
      </div>
      <StatusBar
        status={status}
        cpuPercent={cpuPercent}
        latencyMs={latencyMs}
        vultVersion={vultVersion_display}
      />
    </div>
  );
}
