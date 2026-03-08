# Vult-O-Mat

A web-based micro-IDE for testing, making, and rapid prototyping of [Vult DSP](https://modlfo.github.io/vult/) code.

<img width="1280" height="770" alt="image" src="https://github.com/user-attachments/assets/abd200ee-9447-456b-9405-b08b28c2e7a6" />


## Features

- **Live Vult Compilation:** Real-time transcompilation of Vult code to high-performance JavaScript.
- **High-Performance Audio:** Integrated via **AudioWorklet** for near-zero latency and sample-accurate processing.
- **DSP LAB / Modular Routing:** Dynamically parses your Vult `process` function and generates routable input strips.
  - **Signal Generators:** Sine, Saw, Square, Triangle oscillators.
  - **Live Hardware Input:** Route microphones or audio interfaces directly.
  - **CV Controls:** Manual sliders for parameter tweaking.
- **Professional MIDI Interface:**
  - **2-Octave Studio Keyboard:** computer keyboard mapping.
  - **Extended CC Controller:** 12 virtual knobs (CC 30-41) for deep parameter control.
  - **WebMIDI Support:** Connect external hardware controllers.
- **Advanced Visualization:** CRT-style analog Phosphor Scope and Spectrum Analyzer.
- **AI-Powered DSP Assistant:** Integrated Gemini LLM specifically tuned for Vult DSP development.
- **Hardware Ready:** Export your code to C++ for embedded platforms (Teensy, Daisy, etc.).

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

## How to use the Studio

1. **Select a Preset:** Use the toolbar to load examples like the **vs20** (Polyphonic MS-20 Synthesizer) or **Biquad Filter**.
2. **Press RUN:** Activates the audio engine and the compiler.
3. **Route Inputs:** Use the **DSP LAB** at the bottom to connect oscillators or noise to your function arguments.
4. **Play:** Use your computer keyboard (**A, S, D, F...**) to play notes and shift octaves with **Z/X**.
5. **Analyze:** Watch the real-time CRT scope to visualize your waveforms and frequency response.

---

Built with ❤️ for the Vult community.
