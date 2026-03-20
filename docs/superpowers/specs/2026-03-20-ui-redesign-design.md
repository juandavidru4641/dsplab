# DSPLab UI Redesign — VS Code-Inspired Layout

## Summary

Redesign the DSPLab layout to follow VS Code conventions: left sidebar (replacing the current right panel), tabbed bottom panel for all analysis/instrument views, warm desaturated color palette, and improved contrast/accessibility.

## Layout Architecture

### Current → New

```
CURRENT:                              NEW (VS Code-inspired):
┌─ TopBar ──────────────────────┐     ┌─ TopBar ──────────────────────┐
├─ ActivityBar │ Editor │ Right─┤     ├─ ActivityBar │ Sidebar│Editor─┤
│  (left 44px) │ (flex) │ Panel │     │  (left 42px) │(240px) │(flex) │
│              │        │(240px)│     │              │ pushes │       │
│              │        │       │     │              │ editor │       │
├──────────────┴────────┴───────┤     ├──────────────┴────────┴───────┤
│ BottomDock (130px fixed)      │     │ Bottom Panel (tabbed, 180px)  │
│ [Scope] [Spectrum] [Stats]    │     │ SCOPE|SPECTRUM|STATS|SEQ|KEYS │
├───────────────────────────────┤     ├───────────────────────────────┤
│ StatusBar                     │     │ StatusBar + Ln/Col            │
└───────────────────────────────┘     └───────────────────────────────┘
```

### Sidebar (replaces RightPanel)

- Opens to the LEFT of the editor, between activity bar and editor (VS Code pattern)
- Width: 240px (resizable via drag handle)
- Clicking an active sidebar icon toggles it closed
- Panels rendered in sidebar: Inputs, Presets, AI, Settings
- The sidebar pushes the editor — no overlay/float behavior

### Bottom Panel (replaces BottomDock)

- Tabbed interface like VS Code's Terminal/Problems/Output panel
- Default height: 180px (up from 130px), resizable, collapsible
- Tabs: **SCOPE** | **SPECTRUM** | **STATS** | **SEQUENCER** | **KEYBOARD**
- Each tab gets the full panel width (no side-by-side cramming)
- Tab-specific controls appear in the tab bar's right side (e.g., CH1/CH2 pills, trigger mode for Scope)
- Active tab indicated by bottom border accent (VS Code style)
- Sequencer and Keyboard move here from the right panel — they need horizontal space

### Activity Bar

- Width: 42px (from 44px)
- Icon color raised from #555 to #666 (inactive), #bbb (active)
- Active indicator: left border 2px accent + subtle background fill
- Tooltips on hover with panel name
- Icons (top to bottom): Code Editor, Inputs, Sequencer, Keyboard, Presets, [spacer], AI, Settings
- Clicking Code Editor closes sidebar and focuses editor
- Clicking Sequencer/Keyboard activates the corresponding bottom panel tab (not sidebar)

### Top Bar

- Same structure, refined grouping with visible separators
- Transport controls grouped: `[▶ Play] [■ Stop]`
- Version toggle: `[v0 | v1]` with tooltip "Vult compiler version"
- Audio info: `48kHz` pill + `128` buffer size
- Export button: subtle border (not just text)
- Command palette hint: `⌘K`

### Status Bar

- Cursor position (Ln X, Col Y) moves here from the editor tab bar
- Left side: status dot + "Ready" | CPU% | Latency
- Right side: Ln/Col | Vult version | ⌘K hint

### Editor Tab Bar

- Active tab: top border accent color (VS Code style), not background change
- Close button visibility improved

## Color Palette

### Accent Colors (Warm & Desaturated)

| Token | Current | New | Rationale |
|-------|---------|-----|-----------|
| `--accent-primary` | `#ff6b35` | `#d4754a` | Less neon, warmer, easier on eyes |
| `--accent-secondary` | `#4ecdc4` | `#5ab5ad` | Slightly desaturated teal |
| `--accent-tertiary` | `#c678dd` | `#b07acc` | Softer purple |
| `--accent-success` | `#98c379` | `#8fbf6e` | Slightly muted green |
| `--accent-warning` | `#e5c07b` | `#d4b86a` | Slightly muted yellow |

### Text Colors (Accessibility Fix)

| Token | Current | New | Contrast on #111 |
|-------|---------|-----|-------------------|
| `--text-primary` | `#eeeeee` | `#eeeeee` | No change (13.9:1) |
| `--text-secondary` | `#cccccc` | `#bbbbbb` | Slightly dimmer but still 9.4:1 |
| `--text-tertiary` | `#888888` | `#888888` | No change (4.8:1, passes AA) |
| `--text-muted` | `#555555` | `#777777` | Was 2.6:1 → now 4.0:1 |
| `--text-faint` | `#333333` | `#4a4a4a` | Was 1.5:1 → now 2.3:1 (decorative only) |

### Border Colors

| Token | Current | New |
|-------|---------|-----|
| `--border-subtle` | `#1a1a1a` | `#1e1e1e` |
| `--border-default` | `#222222` | `#282828` |
| `--border-strong` | `#333333` | `#333333` |

### Background Colors

| Token | Current | New |
|-------|---------|-----|
| `--bg-base` | `#0a0a0a` | `#0a0a0a` (no change) |
| `--bg-surface` | `#111111` | `#141414` (slightly lighter for panel distinction) |
| `--bg-elevated` | `#1a1a1a` | `#1a1a1a` (no change) |
| `--bg-control` | `#242424` | `#242424` (no change) |

## Component Changes

### BottomDock → BottomPanel

- Remove the current side-by-side flex layout
- Add tab bar with tab state management
- Render only the active tab's content (Scope, Spectrum, Stats, Sequencer, Keyboard)
- Move tab-specific controls (CH1/CH2, trigger mode, ms/div) into the tab bar
- Default height: 180px, min: 80px, max: 50vh
- Keep the existing resize drag handle

### RightPanel → Sidebar

- Change position from right of editor to left (between activity bar and editor)
- Remove undock button (not needed in VS Code model)
- Keep close button (x)
- Panel header with title
- Scrollable body

### ActivityBar

- Add tooltip attribute to each icon button
- Brighten inactive icon color
- Route Sequencer/Keyboard clicks to bottom panel tab activation instead of sidebar
- Add active background fill in addition to left border

### AppShell

- Reorder flex children: TopBar → [ActivityBar | Sidebar | Editor] → BottomPanel → StatusBar
- Sidebar is conditionally rendered between ActivityBar and Editor

### EditorPane

- Remove cursor position display from tab bar
- Pass cursor position up to StatusBar via props/context

## Files to Modify

### Core layout:
- `src/components/layout/AppShell.tsx` + `.css` — reorder children, add sidebar slot
- `src/components/layout/BottomDock.tsx` + `.css` → rename/refactor to BottomPanel with tabs
- `src/components/layout/RightPanel.tsx` + `.css` → refactor to Sidebar (left-positioned)
- `src/components/layout/ActivityBar.tsx` + `.css` — tooltips, routing, colors
- `src/components/layout/StatusBar.tsx` + `.css` — add cursor position
- `src/components/layout/TopBar.tsx` + `.css` — grouping refinements

### Tokens:
- `src/styles/tokens.css` — all color/spacing changes

### Editor:
- `src/components/editor/EditorPane.tsx` + `.css` — remove cursor position from tab bar

### App orchestration:
- `src/App.tsx` — update panel management to support sidebar vs bottom panel routing

## Out of Scope

- Settings panel content (separate task)
- Mobile responsive layout changes
- AI panel internal redesign
- New features or functionality
