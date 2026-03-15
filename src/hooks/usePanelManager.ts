import { useState, useCallback, useRef } from 'react';

export type PanelId = 'editor' | 'inputs' | 'sequencer' | 'keyboard' | 'presets' | 'ai' | 'settings';

interface PanelState {
  activeRightPanel: PanelId | null;
  undockedPanels: Set<PanelId>;
}

/** Human-readable names for panels shown in the undocked window. */
const PANEL_LABELS: Record<PanelId, string> = {
  editor: 'Editor',
  inputs: 'Inputs',
  sequencer: 'Sequencer',
  keyboard: 'Keyboard',
  presets: 'Presets',
  ai: 'AI Assistant',
  settings: 'Settings',
};

/**
 * Build a minimal HTML document for an undocked panel window.
 * This is a placeholder — full React rendering via portals can be added later.
 */
function buildUndockedHTML(panelId: PanelId): string {
  const label = PANEL_LABELS[panelId];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DSPLab - ${label}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #111;
      color: #ccc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 12px;
    }
    h1 { font-size: 18px; color: #ff6b35; font-weight: 600; }
    p { font-size: 13px; color: #888; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(78, 205, 196, 0.15);
      color: #4ecdc4;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <span class="badge">Undocked</span>
  <h1>${label}</h1>
  <p>Panel undocked from main window.</p>
  <p style="margin-top:8px;font-size:11px;color:#555;">Close this window to re-dock the panel.</p>
</body>
</html>`;
}

export function usePanelManager(defaultPanel: PanelId | null = null) {
  const [state, setState] = useState<PanelState>({
    activeRightPanel: defaultPanel,
    undockedPanels: new Set(),
  });

  // Track open windows and broadcast channels so we can clean up
  const windowsRef = useRef<Map<PanelId, Window>>(new Map());
  const channelsRef = useRef<Map<PanelId, BroadcastChannel>>(new Map());

  const togglePanel = useCallback((panel: PanelId) => {
    setState((prev) => ({
      ...prev,
      activeRightPanel: prev.activeRightPanel === panel ? null : panel,
    }));
  }, []);

  const closePanel = useCallback(() => {
    setState((prev) => ({ ...prev, activeRightPanel: null }));
  }, []);

  const dockPanel = useCallback((panel: PanelId) => {
    // Close the undocked window if it exists
    const win = windowsRef.current.get(panel);
    if (win && !win.closed) {
      // Remove the beforeunload listener before closing to avoid recursion
      win.onbeforeunload = null;
      win.close();
    }
    windowsRef.current.delete(panel);

    // Close the broadcast channel
    const ch = channelsRef.current.get(panel);
    if (ch) {
      ch.close();
      channelsRef.current.delete(panel);
    }

    setState((prev) => {
      const next = new Set(prev.undockedPanels);
      next.delete(panel);
      return { ...prev, undockedPanels: next, activeRightPanel: panel };
    });
  }, []);

  const undockPanel = useCallback((panel: PanelId) => {
    // Don't open a second window for the same panel
    const existing = windowsRef.current.get(panel);
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }

    // Open a new browser window
    const win = window.open(
      '',
      `dsplab-panel-${panel}`,
      'width=400,height=600,menubar=no,toolbar=no',
    );

    if (!win) {
      // Pop-up blocked — fall back silently
      return;
    }

    // Write the placeholder HTML
    win.document.open();
    win.document.write(buildUndockedHTML(panel));
    win.document.close();

    // Set up a BroadcastChannel for future communication
    const channel = new BroadcastChannel(`dsplab-panel-${panel}`);
    channelsRef.current.set(panel, channel);
    windowsRef.current.set(panel, win);

    // When the undocked window is closed, re-dock the panel
    win.onbeforeunload = () => {
      dockPanel(panel);
    };

    // Update state
    setState((prev) => {
      const next = new Set(prev.undockedPanels);
      next.add(panel);
      return { ...prev, undockedPanels: next, activeRightPanel: null };
    });
  }, [dockPanel]);

  return {
    activeRightPanel: state.activeRightPanel,
    undockedPanels: state.undockedPanels,
    togglePanel,
    closePanel,
    undockPanel,
    dockPanel,
  };
}
