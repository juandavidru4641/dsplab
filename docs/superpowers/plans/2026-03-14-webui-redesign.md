# DSPLab Web UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire DSPLab web UI from a rough prototype into a professional-grade DSP IDE with modern DAW aesthetics, Saleae-quality analysis tools, and premium interaction components.

**Architecture:** Phased ground-up rebuild of the presentation layer. The audio engine (`AudioEngine.ts`), MIDI controller (`MIDIController.ts`), Vult compiler pipeline (`vite.config.ts` middleware, `public/vultweb.js`), and LLM tools (`utils/llmTools.ts`, `utils/llmProviders.ts`) are preserved unchanged. All React components, CSS, and layout are rebuilt from scratch using a new design system. Components are split into smaller, focused files organized by feature.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7.3, Monaco Editor, Canvas 2D (scope/spectrum/meters), SVG (knobs), CSS custom properties (design tokens), Framer Motion (panel transitions), Lucide React (icons).

**Spec:** `docs/superpowers/specs/2026-03-14-webui-redesign-design.md`

---

## File Structure

### New files to create

```
src/
├── styles/
│   ├── tokens.css                    # All CSS custom properties (colors, typography, spacing)
│   ├── reset.css                     # Minimal CSS reset
│   ├── global.css                    # Global styles (body, scrollbars, selections)
│   └── components.css                # Shared component classes (pills, toggles, ghost buttons)
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx              # Top-level layout: top bar + activity bar + main + status bar
│   │   ├── AppShell.css              # AppShell layout styles
│   │   ├── TopBar.tsx                # Logo, breadcrumb, transport, status pills, cmd-k hint
│   │   ├── TopBar.css                # TopBar styles
│   │   ├── ActivityBar.tsx           # Left icon strip with panel toggles
│   │   ├── ActivityBar.css           # ActivityBar styles
│   │   ├── StatusBar.tsx             # Bottom status bar: ready, CPU, latency, version
│   │   ├── StatusBar.css             # StatusBar styles
│   │   ├── BottomDock.tsx            # Resizable bottom dock container
│   │   ├── BottomDock.css            # BottomDock styles
│   │   ├── RightPanel.tsx            # Slide-in/out right panel container
│   │   └── RightPanel.css            # RightPanel styles
│   ├── editor/
│   │   ├── EditorPane.tsx            # Tab bar + Monaco editor wrapper
│   │   └── EditorPane.css            # EditorPane styles
│   ├── analysis/
│   │   ├── ScopeView.tsx             # Saleae-quality oscilloscope (Canvas 2D)
│   │   ├── ScopeView.css             # ScopeView chrome styles (header, controls)
│   │   ├── SpectrumView.tsx          # Log-frequency spectrum analyzer (Canvas 2D)
│   │   ├── SpectrumView.css          # SpectrumView chrome styles
│   │   ├── VUMeter.tsx               # Vertical VU meter with peak hold (Canvas 2D)
│   │   ├── VUMeter.css               # VUMeter styles
│   │   ├── StatsView.tsx             # Signal metrics readout
│   │   ├── StatsView.css             # StatsView styles
│   │   └── MultiScopeView.tsx        # Multi-probe logic analyzer
│   ├── controls/
│   │   ├── Knob.tsx                  # SVG arc knob with value readout
│   │   ├── Knob.css                  # Knob styles
│   │   ├── GhostButton.tsx           # Ghost-style button component
│   │   ├── ToggleGroup.tsx           # Segmented toggle (e.g. AUTO/FREE, MELODY/DRUM)
│   │   ├── Pill.tsx                  # Status pill component
│   │   └── Slider.tsx                # Vertical/horizontal slider (for pitch bend, mod wheel, velocity)
│   ├── keyboard/
│   │   ├── VirtualKeyboard.tsx       # Compact piano keyboard with pitch/mod wheels
│   │   └── VirtualKeyboard.css       # Keyboard styles
│   ├── sequencer/
│   │   ├── StepSequencer.tsx         # Piano roll + drum mode sequencer
│   │   └── StepSequencer.css         # Sequencer styles
│   ├── inputs/
│   │   ├── InputsPanel.tsx           # Input source strips with knobs
│   │   └── InputsPanel.css           # InputsPanel styles
│   ├── ai/
│   │   ├── AIPanel.tsx               # AI assistant chat panel (wraps existing LLMPane logic)
│   │   └── AIPanel.css               # AIPanel styles
│   ├── presets/
│   │   ├── PresetBrowser.tsx         # Searchable preset browser with categories
│   │   └── PresetBrowser.css         # PresetBrowser styles
│   ├── palette/
│   │   ├── CommandPalette.tsx        # ⌘K command palette overlay
│   │   └── CommandPalette.css        # CommandPalette styles
│   └── shortcuts/
│       ├── ShortcutsOverlay.tsx      # Keyboard shortcuts help overlay
│       └── ShortcutsOverlay.css      # ShortcutsOverlay styles
├── hooks/
│   ├── useCodeParser.ts              # (existing, preserved)
│   ├── usePanelManager.ts            # Panel visibility/undocking state
│   ├── useCommandPalette.ts          # Command registration and filtering
│   └── useKeyboardShortcuts.ts       # Global keyboard shortcut handler
```

### Existing files to modify

```
src/App.tsx                           # Gut UI rendering, keep state/audio logic, delegate to AppShell
src/main.tsx                          # Update CSS imports (remove old, add new design system)
src/index.css                         # Replace with import of new styles/
src/theme.css                         # Delete (replaced by styles/tokens.css)
src/App.css                           # Delete (replaced by component-level CSS)
src/VultEditor.tsx                    # Keep Monaco logic, restyle to match new theme
index.html                            # Update meta theme-color
```

### Existing files preserved unchanged

```
src/AudioEngine.ts                    # Audio pipeline — no changes
src/MIDIController.ts                 # MIDI handling — no changes
src/utils/llmTools.ts                 # LLM tool definitions — no changes
src/utils/llmProviders.ts             # Provider config — no changes
src/utils/vultError.ts                # Error parsing — no changes
src/constants/presets.ts              # Presets data — no changes
src/constants/exportOptions.ts        # Export options — no changes
src/constants/systemPrompt.ts         # System prompt — no changes
src/hooks/useCodeParser.ts            # Code parsing — no changes
src/useCommunityPresets.ts            # Community presets — no changes
src/LLMPane.tsx                       # LLM chat logic — wrapped by AIPanel, not rewritten
src/components/CodeBlock.tsx          # Syntax highlighting — no changes
public/*                              # All public assets — no changes
vite.config.ts                        # Build config — no changes
```

---

## Chunk 1: Design System + Layout Shell

### Task 1: Design Tokens

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/reset.css`
- Create: `src/styles/global.css`

- [ ] **Step 1: Create `src/styles/tokens.css`**

All CSS custom properties from the design spec — backgrounds, accents, text, borders, typography, spacing, radii, transitions.

```css
:root {
  /* Backgrounds */
  --bg-base: #0a0a0a;
  --bg-surface: #111111;
  --bg-elevated: #1a1a1a;
  --bg-control: #242424;

  /* Accent Colors */
  --accent-primary: #ff6b35;
  --accent-secondary: #4ecdc4;
  --accent-tertiary: #c678dd;
  --accent-warning: #e5c07b;
  --accent-success: #98c379;

  /* Text */
  --text-primary: #eeeeee;
  --text-secondary: #cccccc;
  --text-tertiary: #888888;
  --text-muted: #555555;
  --text-faint: #333333;

  /* Borders */
  --border-subtle: #1a1a1a;
  --border-default: #222222;
  --border-strong: #333333;

  /* Typography */
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
  --font-size-heading: 13px;
  --font-size-body: 12px;
  --font-size-secondary: 11px;
  --font-size-label: 10px;
  --font-size-tiny: 9px;
  --font-size-code: 13px;

  /* Spacing */
  --space-unit: 4px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --panel-gap: 2px;
  --panel-padding: 12px;
  --panel-padding-compact: 8px;

  /* Radii */
  --radius-panel: 6px;
  --radius-control: 4px;
  --radius-pill: 12px;

  /* Transitions */
  --transition-fast: 150ms ease-out;

  /* Layout dimensions */
  --topbar-height: 38px;
  --activity-bar-width: 44px;
  --status-bar-height: 22px;
  --bottom-dock-default-height: 130px;
  --right-panel-width: 240px;

  /* Channel colors (aliases) */
  --channel-1: var(--accent-primary);
  --channel-2: var(--accent-secondary);
  --channel-3: var(--accent-tertiary);
  --channel-4: var(--accent-success);
}
```

- [ ] **Step 2: Create `src/styles/reset.css`**

Minimal CSS reset — box-sizing, margin/padding reset, font smoothing.

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: var(--font-ui);
  font-size: var(--font-size-body);
  color: var(--text-secondary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button {
  font: inherit;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

input, select, textarea {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  outline: none;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}
```

- [ ] **Step 3: Create `src/styles/global.css`**

Global utility styles — selection colors, focus outlines.

```css
::selection {
  background: rgba(78, 205, 196, 0.3);
  color: var(--text-primary);
}

:focus-visible {
  outline: 1px solid var(--accent-secondary);
  outline-offset: -1px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/
git commit -m "feat: add design system tokens, reset, and global styles"
```

---

### Task 2: Shared Component Primitives

**Files:**
- Create: `src/styles/components.css`
- Create: `src/components/controls/GhostButton.tsx`
- Create: `src/components/controls/ToggleGroup.tsx`
- Create: `src/components/controls/Pill.tsx`

- [ ] **Step 1: Create `src/styles/components.css`**

Shared classes for ghost buttons, pills, toggle groups, dividers.

```css
/* Ghost Button */
.ghost-btn {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  font-size: var(--font-size-label);
  color: var(--text-tertiary);
  background: transparent;
  transition: all var(--transition-fast);
  user-select: none;
  white-space: nowrap;
}
.ghost-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--border-strong);
  color: var(--text-secondary);
}
.ghost-btn--active {
  background: rgba(78, 205, 196, 0.12);
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
}

/* Pill */
.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-tiny);
  font-family: var(--font-mono);
  white-space: nowrap;
}

/* Toggle Group */
.toggle-group {
  display: inline-flex;
  background: var(--bg-base);
  border-radius: var(--radius-control);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}
.toggle-group__item {
  padding: 2px 8px;
  font-size: var(--font-size-tiny);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}
.toggle-group__item:hover {
  color: var(--text-tertiary);
}
.toggle-group__item--active {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

/* Divider */
.divider {
  width: 1px;
  height: 16px;
  background: var(--border-default);
  flex-shrink: 0;
  align-self: center;
}

/* Label */
.label {
  font-size: var(--font-size-label);
  font-family: var(--font-mono);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}
```

- [ ] **Step 2: Create `GhostButton.tsx`**

```tsx
import React from 'react';

interface GhostButtonProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export function GhostButton({ children, active, onClick, title, className }: GhostButtonProps) {
  return (
    <button
      className={`ghost-btn ${active ? 'ghost-btn--active' : ''} ${className ?? ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Create `ToggleGroup.tsx`**

```tsx
import React from 'react';

interface ToggleGroupProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="toggle-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`toggle-group__item ${opt.value === value ? 'toggle-group__item--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `Pill.tsx`**

```tsx
import React from 'react';

interface PillProps {
  children: React.ReactNode;
  color: string;
}

export function Pill({ children, color }: PillProps) {
  return (
    <span
      className="pill"
      style={{
        color,
        background: `${color}15`,
      }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/styles/components.css src/components/controls/
git commit -m "feat: add shared UI primitives (GhostButton, ToggleGroup, Pill)"
```

---

### Task 3: Layout Shell — AppShell + TopBar + ActivityBar + StatusBar

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/AppShell.css`
- Create: `src/components/layout/TopBar.tsx`
- Create: `src/components/layout/TopBar.css`
- Create: `src/components/layout/ActivityBar.tsx`
- Create: `src/components/layout/ActivityBar.css`
- Create: `src/components/layout/StatusBar.tsx`
- Create: `src/components/layout/StatusBar.css`

- [ ] **Step 1: Create `TopBar.tsx` and `TopBar.css`**

Top bar with: logo (waveform SVG + "DSPLab"), project breadcrumb, transport cluster (play/stop ghost buttons, vult version toggle), status pills (sample rate, buffer size), export button, ⌘K hint.

Props: `projectName: string`, `isPlaying: boolean`, `onPlay: () => void`, `onStop: () => void`, `vultVersion: 'v0' | 'v1'`, `onVultVersionChange: (v: 'v0' | 'v1') => void`, `sampleRate: number`, `bufferSize: number`, `onExport: () => void`, `onCommandPalette: () => void`.

Layout: `display: flex; align-items: center; height: var(--topbar-height); background: var(--bg-surface); border-radius: var(--radius-panel); padding: 0 12px; gap: 10px;`

- [ ] **Step 2: Create `ActivityBar.tsx` and `ActivityBar.css`**

Vertical icon strip. Icons: Editor ({} ), Inputs (knob), Sequencer (grid), Keyboard (piano), Presets (list), spacer, AI (sparkle ✦), Settings (gear). Active icon gets left border accent + elevated background.

Props: `activePanel: string | null`, `onPanelToggle: (panel: string) => void`.

Use Lucide React icons: `Code2`, `Disc3`, `Grid3x3`, `Piano`, `List`, `Sparkles`, `Settings`.

Layout: `width: var(--activity-bar-width); display: flex; flex-direction: column; align-items: center; padding: 10px 0; gap: 4px; background: var(--bg-base);`

- [ ] **Step 3: Create `StatusBar.tsx` and `StatusBar.css`**

Status bar with: ready indicator (colored dot + label), CPU usage, latency, spacer, Vult version, ⌘K command palette hint.

Props: `status: 'ready' | 'compiling' | 'error'`, `cpuPercent: number`, `latencyMs: number`, `vultVersion: string`.

Layout: `height: var(--status-bar-height); display: flex; align-items: center; padding: 0 10px; gap: 12px; background: var(--bg-base); border-radius: var(--radius-control);`

Status dot colors: ready = `--accent-secondary`, compiling = `--accent-warning`, error = `--accent-primary`.

- [ ] **Step 4: Create `AppShell.tsx` and `AppShell.css`**

Top-level layout container composing: TopBar, ActivityBar, main content area (children), StatusBar. Does not manage content — just layout positioning.

```
.app-shell { display: flex; flex-direction: column; height: 100vh; gap: var(--panel-gap); padding: var(--panel-gap); background: var(--bg-base); }
.app-shell__body { flex: 1; display: flex; gap: var(--panel-gap); min-height: 0; }
.app-shell__main { flex: 1; display: flex; flex-direction: column; gap: var(--panel-gap); min-width: 0; }
```

Props: Pass through all TopBar/ActivityBar/StatusBar props, plus `children` for the main content area (editor + bottom dock) and `rightPanel` for the right panel content.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add layout shell (AppShell, TopBar, ActivityBar, StatusBar)"
```

---

### Task 4: Bottom Dock + Right Panel Containers

**Files:**
- Create: `src/components/layout/BottomDock.tsx`
- Create: `src/components/layout/BottomDock.css`
- Create: `src/components/layout/RightPanel.tsx`
- Create: `src/components/layout/RightPanel.css`

- [ ] **Step 1: Create `BottomDock.tsx` and `BottomDock.css`**

Resizable container for scope/spectrum/meters. Has a drag handle on the top edge to resize height. Default height from `--bottom-dock-default-height`. Min height 80px, max height 50% of viewport.

Layout: horizontal flex with `gap: var(--panel-gap)`. Children are passed in and flex to fill.

Resize: `onMouseDown` on the drag handle starts tracking mouse movement, updates height via state. Cursor changes to `ns-resize` during drag. Store height in localStorage for persistence.

```css
.bottom-dock { display: flex; gap: var(--panel-gap); flex-shrink: 0; position: relative; }
.bottom-dock__handle { position: absolute; top: -2px; left: 0; right: 0; height: 4px; cursor: ns-resize; z-index: 1; }
.bottom-dock__handle:hover { background: var(--accent-secondary); opacity: 0.3; border-radius: 2px; }
```

- [ ] **Step 2: Create `RightPanel.tsx` and `RightPanel.css`**

Slide-in/out panel on the right side. Animated with CSS transform (`translateX(100%)` when hidden, `translateX(0)` when visible). `transition: transform var(--transition-fast)`.

Header: panel title, undock button (⧉), close button (×).

Props: `visible: boolean`, `title: string`, `onClose: () => void`, `onUndock: () => void`, `children: React.ReactNode`.

```css
.right-panel { width: var(--right-panel-width); background: var(--bg-base); border-radius: var(--radius-panel); display: flex; flex-direction: column; overflow: hidden; transition: transform var(--transition-fast), opacity var(--transition-fast); flex-shrink: 0; }
.right-panel--hidden { width: 0; opacity: 0; overflow: hidden; pointer-events: none; }
.right-panel__header { padding: 10px 12px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
.right-panel__body { flex: 1; overflow-y: auto; min-height: 0; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/BottomDock.tsx src/components/layout/BottomDock.css src/components/layout/RightPanel.tsx src/components/layout/RightPanel.css
git commit -m "feat: add BottomDock (resizable) and RightPanel (slide-in/out) containers"
```

---

### Task 5: Panel Manager Hook

**Files:**
- Create: `src/hooks/usePanelManager.ts`

- [ ] **Step 1: Create `usePanelManager.ts`**

Manages which right panel is active and panel undocking state.

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePanelManager.ts
git commit -m "feat: add usePanelManager hook for panel visibility state"
```

---

### Task 6: Editor Pane Wrapper

**Files:**
- Create: `src/components/editor/EditorPane.tsx`
- Create: `src/components/editor/EditorPane.css`

- [ ] **Step 1: Create `EditorPane.tsx` and `EditorPane.css`**

Wraps the existing `VultEditor` component with the new tab bar styling. Renders a tab bar at top (active file name with close button, accent bottom border) and the Monaco editor below.

Tab bar: `background: var(--bg-base)`, active tab has `border-bottom: 2px solid var(--accent-secondary)`, inactive tabs show in `--text-muted`. Right side of tab bar shows cursor position (Ln/Col).

Props: Same as current VultEditor props plus `fileName: string`.

```css
.editor-pane { flex: 1; background: var(--bg-surface); border-radius: var(--radius-panel); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.editor-pane__tabs { display: flex; align-items: center; padding: 4px 8px; gap: 2px; flex-shrink: 0; background: var(--bg-base); border-radius: var(--radius-panel) var(--radius-panel) 0 0; }
.editor-pane__tab { padding: 4px 12px; border-radius: var(--radius-control) var(--radius-control) 0 0; font-size: var(--font-size-label); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 6px; }
.editor-pane__tab--active { background: var(--bg-surface); color: var(--text-secondary); border-bottom: 2px solid var(--accent-secondary); }
.editor-pane__editor { flex: 1; min-height: 0; }
.editor-pane__cursor-pos { margin-left: auto; font-size: var(--font-size-tiny); color: var(--text-faint); font-family: var(--font-mono); }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/
git commit -m "feat: add EditorPane with styled tab bar wrapping Monaco editor"
```

---

### Task 7: Wire Up Layout — Replace Old App Rendering

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Delete: `src/App.css`
- Delete: `src/theme.css`
- Modify: `src/index.css`

- [ ] **Step 1: Update `src/main.tsx`**

Replace old CSS imports with new design system:
```tsx
// Remove: import './index.css'
// Add:
import './styles/reset.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
```

- [ ] **Step 2: Update `src/index.css`**

Replace entire contents with just the new style imports (or make it empty and import from main.tsx directly). Keep the file as a single import aggregator if preferred, or remove it and import individually in main.tsx.

- [ ] **Step 3: Refactor `src/App.tsx` rendering**

Keep ALL existing state management, audio engine setup, MIDI handling, LLM integration, project persistence, compile logic, and event handlers. Only replace the JSX return with the new layout structure:

```tsx
return (
  <AppShell
    // TopBar props
    projectName={projectName}
    isPlaying={isPlaying}
    onPlay={handlePlay}
    onStop={handleStop}
    vultVersion={vultVersion}
    onVultVersionChange={setVultVersion}
    sampleRate={sampleRate}
    bufferSize={bufferSize}
    onExport={() => setShowExportDialog(true)}
    onCommandPalette={() => setShowCommandPalette(true)}
    // ActivityBar props
    activePanel={panelManager.activeRightPanel}
    onPanelToggle={panelManager.togglePanel}
    // StatusBar props
    status={compileStatus}
    cpuPercent={cpuPercent}
    latencyMs={latencyMs}
    // Right panel
    rightPanel={
      panelManager.activeRightPanel ? (
        <RightPanel
          visible={!!panelManager.activeRightPanel}
          title={panelTitles[panelManager.activeRightPanel]}
          onClose={panelManager.closePanel}
          onUndock={() => panelManager.undockPanel(panelManager.activeRightPanel!)}
        >
          {/* Panel content based on activeRightPanel */}
          {panelManager.activeRightPanel === 'ai' && <LLMPane {...llmProps} />}
          {panelManager.activeRightPanel === 'inputs' && /* input strips */ null}
          {panelManager.activeRightPanel === 'sequencer' && <Sequencer {...seqProps} />}
          {panelManager.activeRightPanel === 'keyboard' && <VirtualMIDI {...midiProps} />}
        </RightPanel>
      ) : null
    }
  >
    {/* Main content: editor + bottom dock */}
    <EditorPane
      fileName={projectName + '.vult'}
      code={code}
      onChange={setCode}
      markers={markers}
    />
    <BottomDock>
      <ScopeView getScopeData={getScopeData} />
      <SpectrumView getSpectrumData={getSpectrumData} />
      <StatsView getDSPStats={getDSPStats} />
    </BottomDock>
  </AppShell>
);
```

Note: At this point, ScopeView/SpectrumView/StatsView are still the OLD components — they'll be rebuilt in Phase 2. The old Sequencer and VirtualMIDI components are used temporarily until Phase 3 rebuilds them. The layout shell is the priority here.

- [ ] **Step 4: Delete old style files**

Remove `src/App.css` and `src/theme.css`. Ensure any remaining component-specific styles from old App.css that are still needed by unrebuilt components (ScopeView, SpectrumView, Sequencer, VirtualMIDI, LLMPane) are temporarily preserved — either inline in those components or in a `src/styles/legacy.css` file that will be deleted when those components are rebuilt.

- [ ] **Step 5: Test the layout shell**

Run `npm run dev` and verify:
- Top bar renders with logo, breadcrumb, transport, status pills
- Activity bar renders on left with icons
- Editor fills center area with Monaco editor working
- Bottom dock renders (old scope/spectrum for now)
- Status bar renders at bottom
- Clicking activity bar icons toggles right panel
- Right panel slides in/out
- Bottom dock resize handle works
- No console errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up new layout shell, replace old App rendering"
```

---

## Chunk 2: Analysis Tools (Scope, Spectrum, Meters)

### Task 8: SVG Knob Component

**Files:**
- Create: `src/components/controls/Knob.tsx`
- Create: `src/components/controls/Knob.css`

- [ ] **Step 1: Create new `Knob.tsx`**

SVG arc-style knob replacing the old `src/Knob.tsx`. 270-degree sweep arc.

Structure:
- Outer arc track: `--bg-control` colored, 3px stroke
- Value arc: accent-colored, length proportional to normalized value
- Center circle: `--bg-elevated` fill
- Indicator line: from center toward value angle
- Value text below: monospace, accent colored
- Label text below value: `--text-muted`, uppercase

Two sizes: `size="standard"` (48px) and `size="compact"` (36px).

Interaction: `onPointerDown` starts drag tracking via `pointermove` on window. Vertical drag maps to value change (400px = full range). Shift held = 10x finer resolution. Double-click resets to default. Touch-compatible via pointer events.

Props: `value: number`, `min: number`, `max: number`, `step?: number`, `defaultValue?: number`, `label?: string`, `color?: string`, `size?: 'standard' | 'compact'`, `onChange: (value: number) => void`.

- [ ] **Step 2: Commit**

```bash
git add src/components/controls/Knob.tsx src/components/controls/Knob.css
git commit -m "feat: add SVG arc Knob component with drag interaction"
```

---

### Task 9: Slider Component

**Files:**
- Create: `src/components/controls/Slider.tsx`

- [ ] **Step 1: Create `Slider.tsx`**

Vertical or horizontal slider for pitch bend, mod wheel, velocity. Spring-return option (pitch bend returns to center on release).

Props: `value: number`, `min: number`, `max: number`, `orientation: 'vertical' | 'horizontal'`, `springReturn?: boolean`, `fillFromBottom?: boolean`, `onChange: (value: number) => void`, `onRelease?: () => void`, `width?: number`, `height?: number`.

Render: Container div with track background, fill div (from bottom or from center for spring-return), thumb div. Pointer events for drag.

Styling: Track `--bg-surface`, fill with accent gradient, thumb with `--bg-control` + `--border-strong` border.

- [ ] **Step 2: Commit**

```bash
git add src/components/controls/Slider.tsx
git commit -m "feat: add Slider component with vertical/horizontal and spring-return"
```

---

### Task 10: Scope View — Saleae-Quality Rebuild

**Files:**
- Create: `src/components/analysis/ScopeView.tsx`
- Create: `src/components/analysis/ScopeView.css`

- [ ] **Step 1: Create new `ScopeView.tsx`**

Complete Canvas 2D rebuild. This is the most visually critical component.

**Canvas rendering layers (drawn in order):**

1. **Background fill:** `--bg-base`
2. **Graticule grid:**
   - 8×10 major grid: 1px lines at 6% white opacity
   - 4×5 subdivisions within each major cell: 1px lines at 3% white opacity
   - Center crosshair (horizontal + vertical): slightly brighter than major grid (~8%)
3. **Traces:**
   - Antialiased lines using `ctx.lineWidth = 1.5`, `ctx.lineCap = 'round'`, `ctx.lineJoin = 'round'`
   - Channel 1: `--channel-1` (orange)
   - Channel 2: `--channel-2` (teal)
   - Use `ctx.beginPath()` + `ctx.moveTo/lineTo` for each sample, connected with lines
   - Optional: slight glow via shadow (`ctx.shadowBlur = 3, ctx.shadowColor = channelColor`)
4. **Trigger level indicator:** Horizontal dashed line at trigger threshold Y-position, in `--text-faint`

**Header controls (CSS, above canvas):**
- Label "SCOPE" in `--text-primary` bold
- Channel pills: CH1 (orange bg tint), CH2 (teal bg tint)
- Trigger mode toggle: AUTO / FREE / SINGLE (ToggleGroup)
- Time/div readout: monospace, `--text-muted`
- Gain controls per channel

**Props:** Same as current ScopeView: `getScopeData`, `getProbedData`, `probes`. Plus new: `triggerMode`, `onTriggerModeChange`.

**Performance:** Use `requestAnimationFrame`. Only redraw when new data arrives. Cache graticule as a separate offscreen canvas (draw once on resize, composite each frame).

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis/ScopeView.tsx src/components/analysis/ScopeView.css
git commit -m "feat: rebuild ScopeView with Saleae-quality Canvas rendering"
```

---

### Task 11: Spectrum Analyzer — Proper Log-Frequency Rebuild

**Files:**
- Create: `src/components/analysis/SpectrumView.tsx`
- Create: `src/components/analysis/SpectrumView.css`

- [ ] **Step 1: Create new `SpectrumView.tsx`**

Canvas 2D rendering with technically correct display.

**Canvas rendering:**

1. **Background:** `--bg-base`
2. **Grid:**
   - Vertical lines at log-spaced frequency points: 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k Hz
   - Horizontal lines at dB intervals: every 12dB from 0 to -96dB
   - Grid lines at 4% white opacity
3. **Spectrum curve:**
   - Map FFT bins to x-axis using `log10(freq/20) / log10(20000/20)` for pixel position
   - Draw filled area: `ctx.beginPath()`, trace the curve, then close at bottom
   - Fill gradient: accent-secondary at 40% opacity at top → 5% at bottom
   - Stroke on top: accent-secondary at 80%, 1.5px
4. **Peak hold:** Second stroke in same color at 50% opacity, updated with slow decay (3dB/sec)
5. **Hover crosshair:** On mousemove, draw vertical + horizontal dashed lines at cursor, with frequency (Hz) and amplitude (dB) readout near cursor
6. **Axis labels:**
   - Bottom: frequency labels at grid points, monospace `--text-faint`
   - Left: dB labels at grid points, monospace `--text-faint`

**Header:**
- Label "SPECTRUM" in `--text-primary` bold
- Detected F0 readout: `F0: 440.2 Hz` in monospace
- FFT window label (Hann)

**Props:** `getSpectrumData`, `getPeakFrequencies`, `sampleRate: number`.

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis/SpectrumView.tsx src/components/analysis/SpectrumView.css
git commit -m "feat: rebuild SpectrumView with log-frequency Canvas rendering"
```

---

### Task 12: VU Meter Component

**Files:**
- Create: `src/components/analysis/VUMeter.tsx`
- Create: `src/components/analysis/VUMeter.css`

- [ ] **Step 1: Create `VUMeter.tsx`**

Canvas 2D vertical VU meter with peak hold.

**Rendering:**
- Background: `--bg-base`, rounded corners
- Fill bar from bottom: gradient from `--accent-secondary` (0-75%) → `--accent-warning` (75-90%) → `--accent-primary` (90-100%)
- Peak hold: 2px horizontal line at peak position, rises instantly, decays at ~3dB/sec
- Clip indicator: if signal exceeds 0dBFS, top of bar flashes `--accent-primary`

**Ballistics:** PPM-style — fast attack (~1 frame), slow release (~1.5s).

**Props:** `level: number` (0-1 normalized), `peak: number` (0-1), `label?: string`, `width?: number`, `height?: number`.

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis/VUMeter.tsx src/components/analysis/VUMeter.css
git commit -m "feat: add VUMeter component with peak hold and gradient"
```

---

### Task 13: Stats View Rebuild

**Files:**
- Create: `src/components/analysis/StatsView.tsx`
- Create: `src/components/analysis/StatsView.css`

- [ ] **Step 1: Create new `StatsView.tsx`**

Compact stats readout with VU meters. Combines the VUMeter component (L/R pair) with a stats table.

Layout: VU meters on left (L/R pair), stats table on right.

Stats table: rows of label/value pairs in monospace. Labels in `--text-muted`, values in `--text-secondary`. THD value colored `--accent-secondary` when < 1%.

Rows: RMS (dB), Peak (dB), THD (%), SNR (dB).

**Props:** `getDSPStats` (same as current).

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis/StatsView.tsx src/components/analysis/StatsView.css
git commit -m "feat: rebuild StatsView with VU meters and styled readouts"
```

---

### Task 14: MultiScope View Rebuild

**Files:**
- Create: `src/components/analysis/MultiScopeView.tsx`

- [ ] **Step 1: Create new `MultiScopeView.tsx`**

Multi-probe logic analyzer view. Same rendering approach as ScopeView but with up to 6 stacked channels, each with its own color from the channel palette.

Each channel row: channel label pill on left, waveform trace on right. Shared time axis.

Rendering: Single canvas, divide height into N equal rows. Draw horizontal separators between rows. Each row renders its trace in the corresponding channel color.

**Props:** Same as current: `probes`, `onStateUpdate`.

- [ ] **Step 2: Commit**

```bash
git add src/components/analysis/MultiScopeView.tsx
git commit -m "feat: rebuild MultiScopeView multi-probe logic analyzer"
```

---

### Task 15: Wire Up Analysis Tools

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace old analysis imports with new ones**

Update imports in App.tsx to use new analysis components from `src/components/analysis/`. Remove old `src/ScopeView.tsx`, `src/SpectrumView.tsx`, `src/StatsView.tsx`, `src/MultiScopeView.tsx` imports. Wire new components into the BottomDock.

The new StatsView includes VU meters, so the bottom dock now has: ScopeView (flex: 3), SpectrumView (flex: 2), StatsView with meters (flex: 1).

- [ ] **Step 2: Delete old analysis component files**

Remove: `src/ScopeView.tsx`, `src/SpectrumView.tsx`, `src/StatsView.tsx`, `src/MultiScopeView.tsx`.

- [ ] **Step 3: Test analysis tools**

Run `npm run dev`. Verify:
- Scope renders with proper graticule, traces display when audio is running
- Spectrum shows log-frequency axis with correct labels
- VU meters animate with audio
- Stats readout updates in real-time
- Bottom dock resize still works
- No console errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire up rebuilt analysis tools, remove old components"
```

---

## Chunk 3: Interaction Tools (Keyboard, Sequencer, Inputs)

### Task 16: Virtual Keyboard Rebuild

**Files:**
- Create: `src/components/keyboard/VirtualKeyboard.tsx`
- Create: `src/components/keyboard/VirtualKeyboard.css`

- [ ] **Step 1: Create `VirtualKeyboard.tsx` and `VirtualKeyboard.css`**

Compact keyboard (50-60px key height) with pitch bend, mod wheel, and proper key styling.

**Layout:** Horizontal flex — pitch bend wheel (18px), mod wheel (18px), gap, piano keys (flex: 1).

**Wheels:** Use the Slider component with `orientation="vertical"`. Pitch bend: `springReturn={true}`. Mod wheel: `fillFromBottom={true}`.

**Piano keys:** Render 2 octaves by default (C3-C5 = 15 white keys). Use CSS for key styling:
- White keys: `background: linear-gradient(to bottom, #e0e0e0, #c8c8c8 90%, #b0b0b0)`, `border-radius: 0 0 3px 3px`, `border: 1px solid #999`
- Black keys: `background: linear-gradient(to bottom, #2a2a2a, #1a1a1a 85%, #111)`, absolute positioned at 55% height, `box-shadow: 0 2px 3px rgba(0,0,0,0.5)`
- Pressed keys: Darker gradient + inset shadow + colored bottom edge (3px) showing velocity
- White pressed bottom edge: `--accent-secondary`
- Black pressed bottom edge: `--accent-primary`
- C-note labels at bottom of white keys

**Keyboard mapping:** Same Ableton 2-row layout as current (Z-M = lower, Q-U = upper).

**Header:** Octave selector (−/range/+), velocity slider, sustain button (Space bar hint).

**Interaction:** Mouse click with velocity from Y-position. Drag across keys for glissando. `onPointerDown`/`onPointerMove`/`onPointerUp`.

**Props:** `onNoteOn: (note: number, velocity: number) => void`, `onNoteOff: (note: number) => void`, `onCC: (cc: number, value: number) => void`, `ccLabels?: Record<number, string>`.

- [ ] **Step 2: Commit**

```bash
git add src/components/keyboard/
git commit -m "feat: rebuild VirtualKeyboard with compact keys, pitch/mod wheels"
```

---

### Task 17: Step Sequencer Rebuild

**Files:**
- Create: `src/components/sequencer/StepSequencer.tsx`
- Create: `src/components/sequencer/StepSequencer.css`

- [ ] **Step 1: Create `StepSequencer.tsx` and `StepSequencer.css`**

Piano roll sequencer with melody and drum modes.

**Header controls:**
- Mode toggle: MELODY / DRUM (ToggleGroup)
- Step count: 8 / 16 / 32 / 64 (ToggleGroup)
- BPM: editable number input with monospace styling
- Swing: percentage display

**Melody mode:**
- Note labels on left (C3-C5, monospace, `--text-faint`)
- Grid: cells are 10-12px tall, use CSS grid or a single canvas for performance
- Beat grouping: alternate groups of 4 steps with slightly different backgrounds
- C-note rows slightly brighter for orientation
- Active notes: `--accent-secondary` at 40% opacity with 1px border at 60%
- Click to toggle, drag to paint, Shift+drag to erase
- Playhead: 2px vertical line in `--accent-primary` with glow

**Drum mode:**
- 4 rows: BD, SD, CH, OH (labeled on left)
- Larger pad cells, toggle on click
- Active pads filled with accent color

**Velocity lane:** Below grid, 20px tall. Vertical bars per step.

**Pattern controls:** Bottom row with Clear / Random / Copy / Paste (ghost buttons). Pattern selector: numbered squares (1-4) + add button.

**Props:** Match current Sequencer interface: `steps`, `bpm`, `isPlaying`, `length`, `gateLength`, `mode`, `drumTracks`, `ccTracks`, plus callbacks for all state changes.

- [ ] **Step 2: Commit**

```bash
git add src/components/sequencer/
git commit -m "feat: rebuild StepSequencer with piano roll and drum modes"
```

---

### Task 18: Inputs Panel Rebuild

**Files:**
- Create: `src/components/inputs/InputsPanel.tsx`
- Create: `src/components/inputs/InputsPanel.css`

- [ ] **Step 1: Create `InputsPanel.tsx` and `InputsPanel.css`**

Right-panel view for input source configuration. Vertical layout with input strips.

**Source selector:** Tabs or dropdown at top — Oscillator, LFO, CV, Audio In, Sample, Test.

**Per source, render controls using new Knob component:**
- **Oscillator:** Waveform selector (ToggleGroup: sine/saw/square/tri), Frequency knob (0.1-20kHz), Amplitude knob
- **LFO:** Waveform selector, Rate knob (0.1-50Hz), Depth knob
- **CV:** Value knob (0-1), Auto-sweep toggle
- **Audio In:** Gain knob + small VU meter showing input level
- **Sample:** File picker button, loop toggle
- **Test:** Type selector (impulse/noise/step/sweep), appropriate controls per type

Each strip has a muted header label and controls in a compact vertical layout.

**Props:** Match what App.tsx currently passes for input configuration — source type, parameters, callbacks.

- [ ] **Step 2: Commit**

```bash
git add src/components/inputs/
git commit -m "feat: rebuild InputsPanel with knob controls per source type"
```

---

### Task 19: Wire Up Interaction Tools

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace old interaction component imports**

Update App.tsx to use new components: `VirtualKeyboard` (from `components/keyboard/`), `StepSequencer` (from `components/sequencer/`), `InputsPanel` (from `components/inputs/`). Wire them into the RightPanel based on `activeRightPanel` state.

- [ ] **Step 2: Delete old interaction component files**

Remove: `src/Sequencer.tsx`, `src/VirtualMIDI.tsx`, `src/Knob.tsx`.

- [ ] **Step 3: Test interaction tools**

Run `npm run dev`. Verify:
- Keyboard renders with compact keys, pitch/mod wheels work
- Notes play when clicking keys or pressing keyboard shortcuts
- Sequencer renders grid, can toggle notes, playhead moves
- Inputs panel shows knobs for each source type
- All panels open/close correctly from activity bar
- No console errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire up rebuilt interaction tools, remove old components"
```

---

## Chunk 4: New Features

### Task 20: Command Palette

**Files:**
- Create: `src/hooks/useCommandPalette.ts`
- Create: `src/components/palette/CommandPalette.tsx`
- Create: `src/components/palette/CommandPalette.css`

- [ ] **Step 1: Create `useCommandPalette.ts`**

Hook that manages command registration and fuzzy filtering.

```tsx
interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}
```

Accepts a list of commands. Provides: `filteredCommands(query: string)` using simple substring matching on label (case-insensitive), `isOpen`, `open()`, `close()`, `execute(id)`.

- [ ] **Step 2: Create `CommandPalette.tsx` and `CommandPalette.css`**

Modal overlay triggered by ⌘K.

- Centered, 500px wide, `--bg-surface` background, `--radius-panel` radius, backdrop blur
- Search input: large, auto-focused, monospace, placeholder "Type a command..."
- Results list: scrollable, max 10 visible. Each result shows: command label (left), shortcut badge (right), category in `--text-muted`
- Arrow keys navigate, Enter executes, Escape closes
- Results highlight matching substring in `--accent-secondary`
- Clicking a result executes it

Register commands for: toggle all panels, run/stop, export targets, switch vult version, change sample rate, new project, save, load preset.

- [ ] **Step 3: Wire into App.tsx**

Add `useCommandPalette` hook in App.tsx. Register all commands. Add `⌘K` keyboard listener (and `Ctrl+K` on non-Mac). Render `<CommandPalette>` when open. Pass command palette trigger to TopBar's ⌘K button.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCommandPalette.ts src/components/palette/ src/App.tsx
git commit -m "feat: add command palette with fuzzy search and keyboard nav"
```

---

### Task 21: Keyboard Shortcuts Hook + Overlay

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Create: `src/components/shortcuts/ShortcutsOverlay.tsx`
- Create: `src/components/shortcuts/ShortcutsOverlay.css`

- [ ] **Step 1: Create `useKeyboardShortcuts.ts`**

Global keyboard shortcut handler. Registers shortcuts and dispatches to callbacks. Ignores events when focus is in input/textarea/Monaco editor.

Shortcuts to register:
- `Space` — toggle play/stop (when not in editor)
- `⌘K` / `Ctrl+K` — command palette
- `⌘/` / `Ctrl+/` — shortcuts overlay
- `⌘1-6` — toggle panels (inputs, sequencer, keyboard, presets, AI, settings)
- `⌘E` — focus editor
- `Escape` — close current overlay/panel

- [ ] **Step 2: Create `ShortcutsOverlay.tsx` and `ShortcutsOverlay.css`**

Full-screen overlay with categorized shortcut grid.

- Backdrop blur, dark overlay
- Grid of categories (Editor, Transport, Panels, Sequencer, Keyboard, Navigation)
- Each category: heading + list of action/shortcut pairs
- Shortcut keys rendered in `--bg-control` pill-style badges
- Searchable: filter input at top
- Dismiss: click outside or Escape

- [ ] **Step 3: Wire into App.tsx**

Add keyboard shortcuts hook. Render overlay when open.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/components/shortcuts/
git commit -m "feat: add global keyboard shortcuts and help overlay"
```

---

### Task 22: Preset Browser

**Files:**
- Create: `src/components/presets/PresetBrowser.tsx`
- Create: `src/components/presets/PresetBrowser.css`

- [ ] **Step 1: Create `PresetBrowser.tsx` and `PresetBrowser.css`**

Right-panel view replacing the old `CommunityPresetsModal`.

- **Search bar** at top with search icon
- **Category filter:** Tabs or pills — All, Filters, Oscillators, Effects, Synths, Utilities, User
- **Preset list:** Scrollable list of items. Each item shows: name (primary text), author (secondary), tags (pills). Click to load.
- **Favorites:** Star toggle on each preset, filter toggle for favorites-only
- **Loading state:** Skeleton placeholders while community presets load
- **Empty state:** "No presets found" with helpful text

Uses the existing `useCommunityPresets` hook for data.

**Props:** `onLoad: (code: string) => void`, `onInsert: (code: string) => void`.

- [ ] **Step 2: Replace old CommunityPresetsModal references in App.tsx**

Wire PresetBrowser into the right panel when `activeRightPanel === 'presets'`. Remove old modal-based preset browser.

- [ ] **Step 3: Delete `src/CommunityPresetsModal.tsx`**

- [ ] **Step 4: Commit**

```bash
git add src/components/presets/ src/App.tsx
git commit -m "feat: add preset browser panel replacing old modal"
```

---

### Task 23: AI Panel Restyle

**Files:**
- Create: `src/components/ai/AIPanel.tsx`
- Create: `src/components/ai/AIPanel.css`

- [ ] **Step 1: Create `AIPanel.tsx` and `AIPanel.css`**

Wrapper/restyler for the existing `LLMPane` component. The LLMPane has 2292 lines of complex LLM logic — we do NOT rewrite it. Instead, AIPanel wraps it and applies new CSS.

- Override LLMPane's inline styles with new design system classes
- User messages: `--bg-elevated` background, rounded corners
- AI messages: left border in `--accent-primary` at 25% opacity
- Code diffs: dark code-block style (`--bg-base` bg), green for additions
- Apply/Dismiss buttons: ghost style
- Input field: bottom-pinned, `--bg-surface` bg, rounded, with ghost send button
- Tool call sections: collapsible with muted styling

**Props:** Pass through all LLMPane props.

- [ ] **Step 2: Wire into App.tsx**

Replace direct LLMPane usage in the right panel with AIPanel wrapper.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/
git commit -m "feat: add AIPanel wrapper with new design system styling"
```

---

### Task 24: State Inspector Restyle

**Files:**
- Modify: `src/StateInspector.tsx`

- [ ] **Step 1: Restyle StateInspector**

Apply design system classes to the existing StateInspector component. This component is only 136 lines, so direct restyling is fine.

- Table: monospace font, `--bg-surface` background
- Variable names: `--text-secondary`
- Values: `--accent-secondary` for numbers
- Edit inputs: `--bg-elevated` background with `--border-default` border
- Probe toggles: ghost button style
- Filter input: styled like command palette search

- [ ] **Step 2: Commit**

```bash
git add src/StateInspector.tsx
git commit -m "feat: restyle StateInspector with design system"
```

---

## Chunk 5: Polish + Final Integration

### Task 25: Monaco Editor Theme Sync

**Files:**
- Modify: `src/VultEditor.tsx` (or `src/components/editor/EditorPane.tsx`)

- [ ] **Step 1: Update Monaco theme**

Define a custom Monaco theme using the design system tokens:
- Editor background: `--bg-surface` (#111111)
- Line numbers: `--text-muted`
- Keywords (fun, val, mem, return, if, else): `--accent-tertiary` (#c678dd)
- Function names: `#dcdcaa` (warm yellow, matching VS Code default)
- Types (real, int, bool): `--accent-secondary` (#4ecdc4)
- Variables: `#9cdcfe` (light blue)
- Numbers: `--accent-success` (#98c379)
- Strings: `--accent-success`
- Comments: `--text-muted`
- Selection: `--accent-secondary` at 20% opacity
- Current line highlight: `--bg-elevated` at 50%

Register the theme via `monaco.editor.defineTheme()` before editor creation.

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/EditorPane.tsx
git commit -m "feat: sync Monaco editor theme with design system tokens"
```

---

### Task 26: Export Dialog Restyle

**Files:**
- Modify: `src/App.tsx` (export dialog section)

- [ ] **Step 1: Restyle export dialog**

The export dialog is currently rendered inline in App.tsx. Restyle it with:
- Modal overlay: backdrop blur, centered
- Background: `--bg-surface`, `--radius-panel` radius
- Header: "Export" in `--text-primary`
- Export options: list of ghost buttons, one per target (C++, Pure Data, Teensy, JUCE, JavaScript, Lua, Java)
- Each button shows target name + icon
- Close button: ghost style × in top right

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: restyle export dialog with design system"
```

---

### Task 27: Inline AI Suggestions in Editor

**Files:**
- Modify: `src/components/editor/EditorPane.tsx`

- [ ] **Step 1: Implement inline ghost text suggestions**

Use Monaco's `InlineCompletionProvider` API to show AI-generated ghost text in the editor.

Register an inline completion provider for the Vult language that:
- Triggers after a brief pause (500ms debounce) when the user stops typing
- Sends the current code context to the LLM (reuse existing LLM infrastructure from LLMPane)
- Renders suggestions as ghost text in `--accent-secondary` at 20% opacity
- Shows `⌥↵ accept` hint next to the ghost text
- On `Alt+Enter`, accepts the suggestion and inserts it

Use `monaco.languages.registerInlineCompletionsProvider` with custom styling via CSS class injection on the ghost text decoration.

If the LLM integration proves too complex for inline suggestions (requires streaming, context management), fall back to a simpler approach: show the last AI suggestion from the AI panel as ghost text at the cursor position.

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/EditorPane.tsx
git commit -m "feat: add inline AI ghost text suggestions in editor"
```

---

### Task 28: Panel Undocking Implementation

**Files:**
- Modify: `src/hooks/usePanelManager.ts`
- Modify: `src/components/layout/RightPanel.tsx`

- [ ] **Step 1: Implement undock logic in `usePanelManager.ts`**

When `undockPanel(panelId)` is called:
1. Open a new browser window via `window.open('', panelId, 'width=400,height=600')`
2. Write a minimal HTML document into the new window
3. Use `ReactDOM.createRoot` to render the panel component into the new window
4. Set up a `BroadcastChannel` named `dsplab-panel-${panelId}` for bidirectional state sync between main window and undocked window
5. On the undocked window's `beforeunload` event, call `dockPanel(panelId)` to re-dock

The `usePanelManager` hook should expose a `renderUndockedPanel(panelId)` method that returns the React element for the undocked panel, and manage the BroadcastChannel lifecycle.

- [ ] **Step 2: Update RightPanel undock button handler**

Wire the ⧉ button's `onUndock` callback to actually call `usePanelManager.undockPanel()` with the current panel ID.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePanelManager.ts src/components/layout/RightPanel.tsx
git commit -m "feat: implement panel undocking with BroadcastChannel sync"
```

---

### Task 29: Responsive / Mobile Layout

**Files:**
- Modify: `src/components/layout/AppShell.css`
- Modify: `src/components/layout/ActivityBar.css`
- Modify: `src/components/layout/BottomDock.css`
- Modify: `src/components/layout/RightPanel.css`

- [ ] **Step 1: Add responsive breakpoints**

At `@media (max-width: 768px)`:

**AppShell:** Change body flex-direction so activity bar moves to bottom.

```css
@media (max-width: 768px) {
  .app-shell__body {
    flex-direction: column;
  }
}
```

**ActivityBar:** Switch from vertical column to horizontal row at bottom.

```css
@media (max-width: 768px) {
  .activity-bar {
    width: 100%;
    height: var(--topbar-height);
    flex-direction: row;
    justify-content: space-around;
    order: 1; /* push to bottom */
  }
}
```

**BottomDock:** Stack vertically instead of horizontal.

```css
@media (max-width: 768px) {
  .bottom-dock {
    flex-direction: column;
    height: auto;
    max-height: 50vh;
  }
}
```

**RightPanel:** Become full-screen overlay instead of side panel.

```css
@media (max-width: 768px) {
  .right-panel {
    position: fixed;
    inset: 0;
    width: 100%;
    z-index: 100;
    border-radius: 0;
  }
}
```

- [ ] **Step 2: Test on mobile viewport**

Open browser dev tools, toggle device emulation. Verify layout adapts at 768px breakpoint.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/*.css
git commit -m "feat: add responsive layout for mobile (<768px)"
```

---

### Task 30: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update meta theme-color and favicon**

Change `<meta name="theme-color" content="#0a0a0a">` to match `--bg-base`. Keep the rest of index.html as-is.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "chore: update meta theme-color to match new design system"
```

---

### Task 31: Cleanup Old Files + Final Verification

**Files:**
- Delete any remaining old component files that haven't been cleaned up
- Verify no dead imports

- [ ] **Step 1: Remove remaining legacy files**

Check and remove any old component files still in `src/`:
- `src/ScopeView.tsx` (if not already removed)
- `src/SpectrumView.tsx` (if not already removed)
- `src/StatsView.tsx` (if not already removed)
- `src/MultiScopeView.tsx` (if not already removed)
- `src/Sequencer.tsx` (if not already removed)
- `src/VirtualMIDI.tsx` (if not already removed)
- `src/Knob.tsx` (if not already removed)
- `src/CommunityPresetsModal.tsx` (if not already removed)
- `src/App.css` (if not already removed)
- `src/theme.css` (if not already removed)
- `src/styles/legacy.css` (if created as temporary during Task 7)

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Fix any build errors.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev` and verify the full checklist:

Layout:
- [ ] Top bar: logo, breadcrumb, transport, pills, export, ⌘K hint
- [ ] Activity bar: all icons present, click toggles panels
- [ ] Editor: Monaco loads, syntax highlighting works, tabs display
- [ ] Bottom dock: scope, spectrum, meters all render and animate
- [ ] Status bar: status dot, CPU, latency, version
- [ ] Right panel: slides in/out, shows correct content per icon
- [ ] Bottom dock: resize via drag handle

Analysis:
- [ ] Scope: graticule grid, antialiased traces, trigger mode toggle
- [ ] Spectrum: log-frequency axis, dB scale, filled curve, hover crosshair
- [ ] VU meters: gradient fill, peak hold, proper ballistics
- [ ] Stats: RMS, Peak, THD, SNR update in real time

Interaction:
- [ ] Keyboard: compact keys, pitch/mod wheels, PC keyboard plays notes
- [ ] Sequencer: melody grid, drum mode, velocity lane, playhead
- [ ] Inputs: knob controls for each source type
- [ ] AI panel: chat works, code suggestions display

Features:
- [ ] ⌘K: command palette opens, fuzzy search works, commands execute
- [ ] ⌘/: shortcuts overlay displays
- [ ] Presets: browser shows community presets, search works
- [ ] Export: dialog opens with all targets
- [ ] Inline AI: ghost text suggestions appear in editor
- [ ] Panel undocking: ⧉ button opens panel in new window
- [ ] Responsive: layout adapts at <768px breakpoint

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete UI redesign — cleanup and final verification"
```
