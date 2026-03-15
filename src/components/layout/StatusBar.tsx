import './StatusBar.css';

export interface StatusBarProps {
  status: 'ready' | 'compiling' | 'error';
  cpuPercent: number;
  latencyMs: number;
  vultVersion: string;
}

const statusLabels: Record<StatusBarProps['status'], string> = {
  ready: 'Ready',
  compiling: 'Compiling...',
  error: 'Error',
};

export function StatusBar({ status, cpuPercent, latencyMs, vultVersion }: StatusBarProps) {
  return (
    <div className="status-bar">
      {/* Status indicator */}
      <div className="status-bar__status">
        <span className={`status-bar__dot status-bar__dot--${status}`} />
        <span className="status-bar__label">{statusLabels[status]}</span>
      </div>

      <div className="divider" style={{ height: 12 }} />

      {/* Metrics */}
      <span className="status-bar__metric">CPU {cpuPercent.toFixed(1)}%</span>
      <span className="status-bar__metric">Latency {latencyMs.toFixed(1)}ms</span>

      <div className="status-bar__spacer" />

      {/* Vult version */}
      <span className="status-bar__version">Vult {vultVersion}</span>

      <div className="divider" style={{ height: 12 }} />

      {/* Command palette hint */}
      <span className="status-bar__cmd">⌘K Command Palette</span>
    </div>
  );
}
