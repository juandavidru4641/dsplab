import { useState, useCallback } from 'react';

export type PanelId = 'editor' | 'inputs' | 'sequencer' | 'keyboard' | 'presets' | 'ai' | 'settings';

interface PanelState {
  activeRightPanel: PanelId | null;
  undockedPanels: Set<PanelId>;
}

export function usePanelManager(defaultPanel: PanelId | null = null) {
  const [state, setState] = useState<PanelState>({
    activeRightPanel: defaultPanel,
    undockedPanels: new Set(),
  });

  const togglePanel = useCallback((panel: PanelId) => {
    setState((prev) => ({
      ...prev,
      activeRightPanel: prev.activeRightPanel === panel ? null : panel,
    }));
  }, []);

  const closePanel = useCallback(() => {
    setState((prev) => ({ ...prev, activeRightPanel: null }));
  }, []);

  const undockPanel = useCallback((panel: PanelId) => {
    setState((prev) => {
      const next = new Set(prev.undockedPanels);
      next.add(panel);
      return { ...prev, undockedPanels: next, activeRightPanel: null };
    });
  }, []);

  const dockPanel = useCallback((panel: PanelId) => {
    setState((prev) => {
      const next = new Set(prev.undockedPanels);
      next.delete(panel);
      return { ...prev, undockedPanels: next, activeRightPanel: panel };
    });
  }, []);

  return {
    activeRightPanel: state.activeRightPanel,
    undockedPanels: state.undockedPanels,
    togglePanel,
    closePanel,
    undockPanel,
    dockPanel,
  };
}
