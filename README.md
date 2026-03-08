# Vult-O-Mat

A development environment and diagnostic laboratory for the Vult DSP language.

<img width="3248" height="1956" alt="image" src="https://github.com/user-attachments/assets/9765091d-cac8-4ad8-81dd-fb08855cd5a0" />

Vult-O-Mat integrates a low-latency AudioWorklet execution engine with server-side compilation and high-frequency telemetry. It provides a specialized workspace for designing, testing, and verifying audio algorithms intended for embedded hardware and desktop applications.

## Integrated AI Agent

The IDE features an autonomous agent designed to assist with DSP development. It has direct access to the development environment through a set of specialized tools.

*   **Autonomous Iteration:** The agent performs trial compilations of its code. If the compiler returns an error, the agent analyzes the trace and attempts to correct the logic autonomously.
*   **Surgical Editing:** Uses precise line-editing and diff-based tools to modify specific blocks of code while maintaining the integrity of the surrounding architecture.
*   **Hardware Control:** The agent can manipulate virtual CC knobs and laboratory generators to test the response of the current patch.
*   **Verification Loop:** Can read internal memory states, capture frequency spectrum data, and analyze technical audio metrics (Peak, RMS, Headroom) to verify behavioral correctness.
*   **Multi-Provider Support:** Supports both the Gemini 2.0 streaming API and local OpenAI-compatible endpoints (Ollama, LM Studio).
*   **Transparency:** Features a side-by-side diff view for final user approval of agent-proposed changes and collapsible internal reasoning logs.

## Diagnostic Laboratory

*   **Dual-Trace Oscilloscope:** High-DPI visualization featuring a main output trace and a secondary probe trace with adjustable gain, zoom, and stable rising-edge triggering.
*   **Logarithmic Spectrum Analyzer:** A high-resolution frequency analyzer mapped to a logarithmic scale for precise monitoring of the bass and mid-range response.
*   **Multi-Trace Logic Analyzer:** Roll-mode plotter for internal variables. Boolean states are rendered with sharp logic transitions for timing verification.
*   **Live Telemetry Inspector:** Real-time view of every internal memory variable with the ability to inject values directly into the running DSP engine.
*   **Technical Metrics:** Integrated monitoring of signal headroom, clipping counts, and RMS levels.

## Laboratory Gear & Performance

*   **Adaptive Virtual Keyboard:** A responsive MIDI keyboard that scales based on viewport width. Features slide-play support and tactile feedback.
*   **High-Resolution Controllers:** Industrial-style SVG knobs with 400-pixel sweep sensitivity and shift-click fine-tuning for precise parameter control.
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
Vult-O-Mat expects a standard Vult process function:
```vult
fun process(input: real, cutoff: real) : real {
  // Your DSP logic here
  return result;
}
```
