Show HN: VultLab – AI-Assisted DSP Workbench and Synth/FX Creator

VultLab is a complete, browser-based diagnostic workbench for building synthesizers and audio effects. It uses the Vult DSP language (OCaml-style DSL) to create highly optimized algorithms that can be instantly executed in the browser or exported as C++ for embedded hardware like Daisy, Teensy, or custom Eurorack modules.

The workbench integrates an autonomous AI Agent that acts as a collaborative sound designer. It is capable of surgical code refactoring, fixing feedback loop stability, and performing real-time spectral analysis to verify its own work.

Key Features:

AI-Assisted Creation: Integrated LLM partner that understands DSP principles and OCaml-style syntax for collaborative synth and effect development.

Diagnostic Laboratory: Logarithmic FFT, dual-trace oscilloscope, and multi-trace logic analyzer for internal state monitoring and frequency verification.

Zero-Latency Prototyping: 128-sample block execution in isolated AudioWorklets with high-frequency telemetry.

Melodic Testing: 16-step expressive sequencer with accent and slide support for polyphonic and legato verification.

Embedded Export: One-click transcompilation to optimized C++ headers for hardware deployment.

Repository: https://github.com/DatanoiseTV/vult-o-mat
Vult Language: https://vult-dsp.github.io/vult/
