# Vult-O-Mat

A professional-grade, high-performance web-based IDE and diagnostic laboratory for the **Vult DSP language**.

Vult-O-Mat combines a low-latency AudioWorklet execution engine with industrial-scale server-side compilation and real-time visual telemetry, providing an unparalleled environment for developing high-quality audio algorithms for embedded hardware and desktop plugins.

## 🚀 Key Features

### 🛠️ Industrial-Scale IDE
*   **Monaco Editor Integration:** Full Vult syntax highlighting and real-time error checking.
*   **Stack-Size Compiler Bridge:** Powered by a Node.js bridge with a **1GB stack size**, allowing for the compilation of massive recursive patches that would crash standard browsers.
*   **Precise Error Marking:** Compiler errors are parsed and visually anchored to the exact line and column in your code.

### 🧪 Diagnostic Laboratory
*   **Dual-Trace Oscilloscope:** Phosphor-glow visualization featuring a main output trace and a secondary yellow probe trace.
*   **Multi-Trace Probe Scope (Roll Mode):** A dedicated logic analyzer view that plots internal Vult variables over time. Supports up to 6 simultaneous traces in parallel lanes with auto-scaling.
*   **Live State Inspector:** A searchable memory viewer showing every internal `mem` variable. 
*   **Memory Injection:** Click and edit any variable in the inspector to force the internal DSP state in real-time.

### 🎹 Live Performance & Routing
*   **Adaptive Virtual Keyboard:** A responsive, draggable 25+ key piano that scales its octave count based on your screen width. Supports "Slide Play" and Ableton-style character mapping.
*   **DSP LAB Panel:** Dynamically generates input strips based on your Vult `process` function signature.
*   **Advanced Signal Sources:** 
    *   **Oscillators:** Sine, Saw, Square, Tri with frequency control.
    *   **Lab Gear:** Impulse, Step, and Sweep generators for testing filter stability and frequency response.
    *   **Sample Support:** Load `.wav`/`.mp3` files directly into your DSP chain.
    *   **Live Audio:** Route hardware inputs directly into your Vult code.

### 🔌 Hardware Export
*   **C++ Transcompilation:** One-click export of your prototypes to professional-grade C++ headers and source files, ready for use on Teensy, Daisy, or custom Eurorack hardware.

## 🛠️ Getting Started

### Installation
```bash
npm install
```

### Development
Starts the Vite dev server and the Industrial Compiler Bridge:
```bash
npm run dev
```

### Build
Generates a production-ready bundle:
```bash
npm run build
```

## 📐 DSP Entry Point
Vult-O-Mat expects a standard Vult process function:
```vult
fun process(input: real, cutoff: real) : real {
  // Your DSP logic here
  return result;
}
```

---
Built with ❤️ for the Vult DSP Community.
