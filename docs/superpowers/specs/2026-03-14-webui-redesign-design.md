# DSPLab Web UI Redesign — Design Spec

## Overview

Complete visual and architectural overhaul of the DSPLab web UI. Transform it from a functional-but-rough prototype into a professional-grade DSP IDE that feels like a premium tool on par with Ableton, Bitwig, VS Code, Figma, and Saleae Logic.

**Approach:** Phased ground-up rebuild. Every UI component is rebuilt from scratch with a cohesive design system. The audio engine, Vult compiler pipeline, and core state management are preserved — only the presentation layer changes.

## Aesthetic Direction

**Modern DAW / Ableton-Bitwig inspired.** Clean blacks, minimal chrome, warm-neutral palette. Professional and calm — no shouting buttons, no gimmicky effects. The UI should feel like a serious instrument, not a web app.

**Key references:**
- Ableton Live / Bitwig Studio — layout rhythm, transport controls, session view
- VS Code — activity bar, editor tabs, command palette, status bar
- Figma — contextual right sidebar, panel management
- Saleae Logic — scope/analyzer rendering quality, channel labels, precision
- AI-native tools — inline suggestions, always-accessible assistant

## Design System

### Color Palette

**Backgrounds (4-level depth hierarchy):**

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0a0a0a` | App canvas, scope/spectrum backgrounds |
| `--bg-surface` | `#111111` | Panels, cards, bottom dock |
| `--bg-elevated` | `#1a1a1a` | Inputs, controls, hover states |
| `--bg-control` | `#242424` | Buttons, knobs, interactive elements |

**Accent colors:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#ff6b35` | Active states, playhead, AI sparkle, Channel 1 (L) |
| `--accent-secondary` | `#4ecdc4` | Running state, active toggles, Channel 2 (R), note fills |
| `--accent-tertiary` | `#c678dd` | Channel 3, keywords in code, MIDI indicator |
| `--accent-warning` | `#e5c07b` | Compile status, near-clip meter |
| `--accent-success` | `#98c379` | Channel 4, ready states |

**Text:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#eeeeee` | Headings, active labels |
| `--text-secondary` | `#cccccc` | Body text, values |
| `--text-tertiary` | `#888888` | Descriptions, inactive labels |
| `--text-muted` | `#555555` | Disabled, hints |
| `--text-faint` | `#333333` | Borders doubling as text, ghosts |

**Borders:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#1a1a1a` | Panel separators |
| `--border-default` | `#222222` | Control borders |
| `--border-strong` | `#333333` | Hover borders, focus rings |

### Typography

| Role | Font | Size | Weight |
|------|------|------|--------|
| Heading | Inter | 13px | 600 |
| Body | Inter | 12px | 400 |
| Secondary | Inter | 11px | 400 |
| Code / Editor | Fira Code | 13px | 400 |
| Label | SF Mono fallback monospace | 10px | 400 |
| Readout | SF Mono fallback monospace | 10-11px | 400 |

### Spacing & Layout Rules

- **Base grid:** 4px
- **Panel gaps:** 2-3px (tight, Bitwig-style)
- **Inner padding:** 12px standard, 8px compact
- **Border radius:** 6px panels, 4px controls, 12px pills
- **Panel borders:** None — use background contrast for depth
- **Hover:** Lighten background by ~4%
- **Active/focus:** 2px left-border accent (activity bar) or border color change
- **Transitions:** 150ms ease-out for all interactive state changes

### Button Styles

**Default (ghost):** Transparent background, 1px `--border-default` border, `--text-tertiary` text. On hover: `--bg-elevated` background, `--border-strong` border, `--text-secondary` text.

**Active state (e.g. RUN while playing):** `--accent-secondary` background at 20% opacity, `--accent-secondary` border, `--accent-secondary` text.

**No solid-fill primary buttons.** The UI should be calm. Accent colors appear only for active/running states, not for calls to action.

### Status Pills

Rounded capsules (`border-radius: 12px`) with tinted backgrounds at 10-15% opacity of the text color. Used for: sample rate, buffer size, compile status, MIDI activity.

## Layout Architecture

### Overall Structure

```
┌──────────────────────────────────────────────────────────────┐
│  TOP BAR (38px)                                              │
│  Logo │ Breadcrumb │ ··· │ Transport │ Status Pills │ ⌘K    │
├────┬─────────────────────────────────────────────┬───────────┤
│    │                                             │           │
│ A  │  EDITOR (flex: 1)                           │  RIGHT    │
│ C  │  Tab bar                                    │  PANEL    │
│ T  │  Monaco editor with inline AI suggestions   │  (slide   │
│ I  │                                             │   in/out) │
│ V  │                                             │           │
│ I  │                                             │  AI /     │
│ T  │                                             │  Inputs / │
│ Y  │                                             │  Seq /    │
│    │                                             │  MIDI /   │
│ B  ├─────────────┬───────────────────┬───────────┤  Presets  │
│ A  │  SCOPE      │  SPECTRUM         │  METERS   │           │
│ R  │  (flex: 3)  │  (flex: 2)        │  (flex:1) │           │
│    │             │                   │           │           │
│ 44 │  Bottom dock, resizable height  │           │           │
│ px │  Default ~130px, drag to resize │           │           │
├────┴─────────────┴───────────────────┴───────────┴───────────┤
│  STATUS BAR (22px)                                           │
│  ● Ready │ CPU 2.4% │ Latency 2.7ms │ ··· │ Vult 0.4.15    │
└──────────────────────────────────────────────────────────────┘
```

### Top Bar (38px)

Left to right:
1. **Logo** — small waveform icon + "DSPLab" text
2. **Divider**
3. **Project breadcrumb** — `examples / moog-ladder.vult` (clickable for project switching)
4. **Spacer**
5. **Transport cluster** — Play/Stop buttons (ghost style, teal when active), Vult version toggle (v0/v1)
6. **Divider**
7. **Status pills** — sample rate, buffer size
8. **Export button** — ghost style
9. **Command palette hint** — `⌘K` in muted monospace

### Activity Bar (44px, left)

Vertical icon strip. Each icon toggles the corresponding right panel or view:
1. **Editor** `{ }` — always active as main view
2. **Inputs** (knob icon) — oscillator, LFO, CV, audio input controls
3. **Sequencer** (grid icon) — step sequencer
4. **Keyboard** (piano icon) — virtual MIDI keyboard
5. **Presets** (list icon) — preset browser
6. *Spacer*
7. **AI Assistant** (sparkle icon) — LLM chat panel
8. **Settings** (gear icon) — configuration

Active icon has: `--bg-elevated` background + 2px left border in `--accent-secondary`.

### Editor Area (center)

- **Tab bar** at top — file tabs with close buttons, active tab has bottom border in `--accent-secondary`
- **Monaco editor** — Vult syntax highlighting using the design system colors
- **Inline AI suggestions** — ghost text in `--accent-secondary` at ~20% opacity, with accept hint (`⌥↵`)
- **Line numbers** — `--text-muted`, right-aligned with 16px margin to code

### Bottom Dock (resizable, default 130px)

Persistent analysis strip. Three panels side by side:

**Scope (flex: 3):**
- Header: "SCOPE" label + channel pills (CH1 in orange, CH2 in teal) + trigger mode toggle (AUTO/FREE) + time/div readout
- Display: `--bg-base` background with proper graticule grid
- Traces: antialiased, Saleae-quality rendering (see Scope section below)
- Resizable by dragging the top edge of the dock

**Spectrum (flex: 2):**
- Header: "SPECTRUM" label + detected F0 readout
- Display: logarithmic frequency axis, dB Y-axis (see Spectrum section below)

**Meters (flex: 1):**
- VU meter bars (L/R) with gradient: teal → amber → orange (bottom to top)
- Peak hold indicators (thin horizontal line that decays)
- Stats readout below: RMS, Peak, THD, SNR in monospace

### Right Panel (slide in/out, ~240px)

Toggled by activity bar icons. Slides in from the right with a 150ms ease-out transition. Contains whichever tool is selected:

- **AI Assistant** — chat interface with message history, code diffs, apply/dismiss buttons, input field
- **Inputs** — oscillator/LFO/CV/audio input strips with knobs
- **Sequencer** — step sequencer (see Sequencer section)
- **Keyboard** — virtual MIDI keyboard (see Keyboard section)
- **Presets** — searchable preset browser with categories and favorites
- **Settings** — audio config, theme, keybindings

Panel header has: title, undock button (⧉), close button (×).

**Undocking:** Any right panel can be torn off into a floating window (using window.open or a portal). The floating panel maintains a bidirectional connection with the main app.

### Status Bar (22px)

Left to right:
1. **Status indicator** — colored dot (teal = ready, amber = compiling, red = error) + label
2. **Divider**
3. **CPU usage** — monospace, `--text-muted`
4. **Latency** — monospace, `--text-muted`
5. **Spacer**
6. **Vult version** — `--text-faint`
7. **Divider**
8. **Command palette shortcut** — `⌘K Command Palette` in `--text-faint`

## Component Specifications

### Knobs

SVG-based arc knobs with:
- **Track:** 270-degree arc in `--bg-control`, 3px stroke
- **Value arc:** Same path, colored with channel/accent color, length proportional to value
- **Center:** Filled circle in `--bg-elevated`
- **Indicator line:** From center toward value position, colored to match arc
- **Value readout:** Below knob, monospace, in accent color
- **Label:** Below value, `--text-muted`, uppercase 9px

Two sizes:
- **Standard:** 48px diameter, for input strips
- **Compact:** 36px diameter, for inline controls

Interaction: vertical drag (400px sweep), shift+drag for fine-tuning, double-click to reset.

### Scope (Saleae-quality)

Canvas 2D rendering with:
- **Background:** `--bg-base`
- **Graticule:** 8x10 major grid at ~6% white opacity, subdivisions at ~3%
- **Center crosshair:** Slightly brighter than major grid
- **Traces:** Antialiased lines with 1.5-2px stroke width, per-channel colors
- **Trigger level:** Horizontal dashed line indicator on Y-axis (draggable)
- **Channel labels:** Colored pills on left edge (CH1, CH2)
- **Readouts:** Time/div and V/div in correct corners, monospace, `--text-muted`
- **Trigger mode:** AUTO/FREE/SINGLE toggle in header
- **Measurement cursors:** Optional time-delta and voltage-delta cursors on click-drag
- **Performance:** requestAnimationFrame loop, only redraw on new data

### Spectrum Analyzer

Canvas 2D rendering with:
- **Background:** `--bg-base`
- **Frequency axis:** Logarithmic, 20Hz–20kHz, with grid lines at 100, 1k, 10k Hz
- **Amplitude axis:** dB scale, 0 to -96 dB (or configurable range), grid lines every 12dB
- **Curve:** Filled area with gradient (accent color at 80% opacity top → 10% bottom) + solid stroke on top
- **Peak hold:** Secondary stroke that decays slowly (configurable decay rate)
- **Hover crosshair:** Vertical + horizontal lines with frequency/dB readout at cursor
- **F0 detection:** Detected fundamental frequency displayed in header
- **Windowing label:** Show active FFT window type (Hann, Blackman, etc.)
- **Axis labels:** Frequency ticks at bottom, dB ticks at left, monospace `--text-faint`

### VU Meters

Canvas or CSS rendering:
- **Bar style:** Vertical, 10-12px wide, rounded bottom corners
- **Gradient:** `--accent-secondary` (bottom 75%) → `--accent-warning` (75-90%) → `--accent-primary` (90-100%)
- **Peak hold:** 2px horizontal line that rises instantly, falls at ~3dB/sec
- **Clip indicator:** If signal hits 0dBFS, bar top flashes `--accent-primary`
- **Labels:** L/R below bars, dB scale on the side (0, -12, -24, -inf)
- **Ballistics:** PPM-style (fast attack ~1ms, slow release ~1.5s)

### Virtual MIDI Keyboard

**Compact design — 50-60px key height max.**

Layout (left to right):
1. **Pitch bend wheel** (18px wide, vertical slider, spring-return to center)
2. **Mod wheel** (18px wide, vertical slider, fill from bottom)
3. **Piano keys** (flex: 1)

Key styling:
- **White keys:** Subtle top-to-bottom gradient (light gray to slightly darker), 1px border, rounded bottom corners (3-4px)
- **Black keys:** Dark gradient, slight drop shadow for depth, 55% of white key height
- **Pressed white:** Darker gradient + inset shadow, colored bottom edge showing velocity
- **Pressed black:** Slightly lighter + inset shadow, colored bottom edge
- **Velocity visualization:** Thin colored bar at bottom of pressed key (teal for white, orange for black), height/opacity proportional to velocity

Header controls:
- Octave range selector (- / C3-C5 / +)
- Velocity slider with value readout
- Sustain pedal toggle (mapped to Space bar)

Interaction:
- Mouse click + drag across keys for glissando
- PC keyboard mapping (Ableton 2-row style: Z-M = lower octave, Q-U = upper octave)
- Velocity determined by vertical click position on key (top = soft, bottom = hard)
- Key labels show on C notes and PC keyboard mappings

### Step Sequencer

**Compact, tight grid — Bitwig step-sequencer inspired.**

Header controls:
- Mode toggle: MELODY / DRUM
- Step count: 8 / 16 / 32 / 64
- BPM (editable)
- Swing (percentage)

**Melody mode (piano roll):**
- Note labels on left edge (C3 through C5, monospace, `--text-faint`)
- Grid cells: tiny (10-12px rows), alternating subtle shade for beat grouping (groups of 4)
- C-note rows slightly brighter for orientation
- Active notes: filled with `--accent-secondary` at 40% opacity, 1px border at 60%
- Click to toggle notes, drag to paint, shift-drag to erase
- Playhead: 2px vertical line in `--accent-primary` with subtle glow/shadow

**Velocity lane:**
- Below grid, 20px tall
- Vertical bars per step, height = velocity
- Same color as note fills

**Pattern controls:**
- Bottom row: Clear / Random / Copy / Paste (ghost buttons)
- Pattern selector: numbered squares (1, 2, 3, 4, +) for pattern chaining

**Drum mode:**
- 4 labeled rows: BD, SD, CH, OH (or customizable)
- Toggle pads instead of piano roll
- Active pads filled with accent color
- Same velocity lane below

### Command Palette

Triggered by `⌘K` (or configurable shortcut).

- **Overlay:** Centered, 500px wide, dark modal with backdrop blur
- **Search input:** Large, auto-focused, monospace placeholder "Type a command..."
- **Results list:** Filtered as you type, shows command name + shortcut + category
- **Categories:** File, Edit, View, Audio, Export, AI, Navigation
- **Keyboard navigation:** Arrow keys to select, Enter to execute, Escape to close
- **Fuzzy matching:** Match on command name, not just prefix

Commands include:
- Toggle panels (inputs, sequencer, keyboard, presets, AI)
- Run / Stop
- Export (C++, Java, Teensy, Daisy, JUCE)
- Switch Vult version
- Change sample rate / buffer size
- Open preset browser
- New project / Save / Load
- Toggle scope mode (L+R / X-Y)
- Theme settings

### Preset Browser

Right panel view with:
- **Search bar** at top with filter icon
- **Category tabs or tree:** Filters, Oscillators, Effects, Synths, Utilities, User
- **Preset list:** Name + author + tags, click to load
- **Favorites:** Star toggle on each preset, filter to show favorites only
- **Community section:** Pull from dsplab-projects repo
- **Preview:** Hover or click to preview (load without committing)

### Keyboard Shortcuts Overlay

Triggered by `⌘/` or from command palette.

- **Full-screen overlay** with categorized shortcut grid
- **Categories:** Editor, Transport, Panels, Sequencer, Keyboard, Navigation
- **Format:** Action name on left, shortcut key combo on right
- **Searchable:** Filter shortcuts by typing
- **Dismiss:** Click outside or press Escape

### AI Assistant Panel

Right panel view:
- **Message history** — user messages in `--bg-elevated`, AI responses with left border in `--accent-primary` at 25% opacity
- **Code diffs** — syntax highlighted, in darker code-block style with green for additions
- **Action buttons** — Apply / Dismiss below code suggestions (ghost style)
- **Input field** — bottom-pinned, rounded, with send button
- **Tool call indicators** — collapsible sections showing what the AI is doing
- **Inline editor integration** — AI suggestions appear as ghost text in the editor, not just in the panel

### Inputs Panel

Right panel view with vertical strips for each input source:
- **Source selector:** Dropdown or tabs (Oscillator, LFO, CV, Audio In, Sample, Test)
- **Per-source controls:** Knobs for frequency/rate, waveform selector, depth/amplitude
- **Audio input:** Gain knob + input level meter
- **Sample:** File picker + waveform display + loop toggle
- **Test generators:** Impulse, Noise, Step, Sweep with appropriate controls

### State Inspector

Accessible from AI panel or as a sub-tab:
- **Table view:** Variable name, current value, type
- **Live updating:** Values refresh in real-time from running Vult code
- **Editable:** Click a value to inject a new one
- **Probe toggle:** Enable/disable telemetry probing per variable

## New Features

### Dark Theme (single, perfected)

One dark theme, done extremely well. No light theme. All colors defined as CSS custom properties on `:root` for easy future theming.

### Panel Undocking

Any right panel can be "torn off" via the ⧉ button:
- Opens in a new browser window (window.open)
- Maintains live connection to main app via BroadcastChannel or SharedWorker
- Undocked panels remember their position/size
- Re-docking snaps them back to the right panel

### Responsive / Mobile

- At <768px: activity bar moves to bottom, right panel becomes full-screen overlay
- Bottom dock stacks vertically (scope on top, spectrum below)
- Keyboard and sequencer become full-width overlays

## Implementation Phases

### Phase 1: Design System + Layout Shell
- CSS custom properties (all tokens above)
- New layout structure (top bar, activity bar, editor area, bottom dock, right panel, status bar)
- Panel show/hide toggling from activity bar
- Resizable bottom dock (drag handle)
- Right panel slide-in/out animation
- Status bar with live data

### Phase 2: Analysis Tools
- Rebuild ScopeView with Saleae-quality Canvas rendering
- Rebuild SpectrumView with proper log-frequency axis and dB scale
- New VU meter component with peak hold and proper ballistics
- Rebuild StatsView with new visual style
- Rebuild MultiScopeView

### Phase 3: Interaction Tools
- Rebuild VirtualMIDI keyboard (compact, pitch bend, mod wheel, velocity)
- Rebuild Sequencer (piano roll, drum mode, velocity lane, patterns)
- Rebuild Knob component (SVG arc style)
- Rebuild input strips with new knobs and layout

### Phase 4: New Features
- Command palette (⌘K)
- Keyboard shortcuts overlay
- Preset browser with search, categories, favorites
- Panel undocking
- Inline AI suggestions in editor
- Improved AI panel with code diffs and apply/dismiss

### Phase 5: Polish
- Transition animations (150ms ease-out everywhere)
- Hover states on all interactive elements
- Loading states and skeleton screens
- Error states with helpful messages
- Mobile/responsive layout
- Performance optimization (Canvas rendering, memoization)

## Non-Goals

- Light theme (not in scope)
- Drag-and-drop panel rearrangement (too complex, fixed layout is fine)
- Plugin system for custom panels
- Multi-window editor (single editor is sufficient)
- Undo/redo for UI state (only for code editing, which Monaco handles)

## Success Criteria

The redesign is successful when:
1. A DSP engineer sees it and thinks "this is a serious tool"
2. The scope and spectrum look as clean as Saleae Logic
3. The keyboard and sequencer feel usable, not like afterthoughts
4. Every panel and control follows the same visual language
5. The layout feels spacious despite showing dense information
6. Navigation is fast via command palette and keyboard shortcuts
