
class VultProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.vultInstance = null;
    this.sources = [];
    this.phases = [];
    this.sampleRate = 44100;
    this.telemetryCounter = 0;

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateCode') {
        try {
          const factory = new Function(\`
            \${data.jsCode}
            if (typeof vultProcess !== 'undefined') return vultProcess;
            if (typeof exports !== 'undefined' && exports.vultProcess) return exports.vultProcess;
            throw new Error("Could not find vultProcess class in generated code.");
          \`);
          const VultConstructor = factory();
          this.vultInstance = new VultConstructor();
          const initFn = this.vultInstance.liveDefault || this.vultInstance.default;
          if (typeof initFn === 'function') initFn.call(this.vultInstance);
          this.port.postMessage({ type: 'status', success: true });
        } catch (err) {
          console.error("[Worklet] Update Error:", err);
          this.port.postMessage({ type: 'status', success: false, error: err.toString() });
        }
      } else if (type === 'setSources') {
        this.sources = data.sources || [];
        if (this.phases.length !== this.sources.length) {
          this.phases = new Array(this.sources.length).fill(0);
        }
      } else if (type === 'noteOn') {
        if (this.vultInstance) {
          const fn = this.vultInstance.liveNoteOn || this.vultInstance.noteOn;
          if (typeof fn === 'function') fn.call(this.vultInstance, data.note, data.velocity, data.channel);
        }
      } else if (type === 'noteOff') {
        if (this.vultInstance) {
          const fn = this.vultInstance.liveNoteOff || this.vultInstance.noteOff;
          if (typeof fn === 'function') fn.call(this.vultInstance, data.note, data.channel);
        }
      } else if (type === 'controlChange') {
        if (this.vultInstance) {
          const fn = this.vultInstance.liveControlChange || this.vultInstance.controlChange;
          if (typeof fn === 'function') fn.call(this.vultInstance, data.control, data.value, data.channel);
        }
      } else if (type === 'setSampleRate') {
        this.sampleRate = data.sampleRate || 44100;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const outputL = outputs[0] && outputs[0][0] ? outputs[0][0] : null;
    const outputR = outputs[0] && outputs[0][1] ? outputs[0][1] : outputL;
    if (!outputL) return true;

    const liveInput = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const numSamples = outputL.length;
    const numInputs = this.sources.length;

    for (let i = 0; i < numSamples; i++) {
      const inputValues = [];
      for (let s = 0; s < numInputs; s++) {
        const src = this.sources[s];
        if (!src) { inputValues.push(0); continue; }
        if (src.type === 'oscillator') {
          const phaseInc = (src.freq || 440) / this.sampleRate;
          this.phases[s] = (this.phases[s] + (isNaN(phaseInc) ? 0 : phaseInc)) % 1.0;
          const p = this.phases[s];
          if (src.oscType === 'sine') inputValues.push(Math.sin(p * 2 * Math.PI));
          else if (src.oscType === 'sawtooth') inputValues.push(p * 2 - 1);
          else if (src.oscType === 'square') inputValues.push(p < 0.5 ? 1 : -1);
          else if (src.oscType === 'triangle') inputValues.push(Math.abs(p * 4 - 2) - 1);
          else inputValues.push(0);
        } else if (src.type === 'cv') {
          inputValues.push(src.value || 0);
        } else if (src.type === 'live') {
          inputValues.push(liveInput ? liveInput[i] : 0);
        } else if (src.type === 'test_noise') {
          inputValues.push(Math.random() * 0.2 - 0.1);
        } else {
          inputValues.push(0);
        }
      }

      if (this.vultInstance) {
        const processFn = this.vultInstance.liveProcess || this.vultInstance.process;
        if (typeof processFn === 'function') {
          try {
            const result = processFn.apply(this.vultInstance, inputValues);
            if (typeof result === 'object' && result !== null) {
              outputL[i] = result.t0 !== undefined ? result.t0 : 0;
              if (outputR) outputR[i] = result.t1 !== undefined ? result.t1 : outputL[i];
            } else {
              outputL[i] = typeof result === 'number' ? result : 0;
              if (outputR) outputR[i] = outputL[i];
            }
          } catch (e) {
            outputL[i] = 0; if (outputR) outputR[i] = 0;
          }
        } else {
          outputL[i] = 0; if (outputR) outputR[i] = 0;
        }
      } else {
        outputL[i] = 0; if (outputR) outputR[i] = 0;
      }
    }

    // TELEMETRY: Snapshot memory state ~20 times per second
    if (this.vultInstance && this.telemetryCounter++ > 20) {
      this.telemetryCounter = 0;
      const state = {};
      
      // Capture context members
      if (this.vultInstance.context) {
        for (const key in this.vultInstance.context) {
          const val = this.vultInstance.context[key];
          if (typeof val === 'number' || typeof val === 'boolean') {
            state[key] = val;
          }
        }
      }
      
      // Capture instance members (some compilers put mem directly on this)
      for (const key in this.vultInstance) {
        if (key === 'context') continue;
        const val = this.vultInstance[key];
        if (typeof val === 'number' || typeof val === 'boolean') {
          state[key] = val;
        }
      }
      
      this.port.postMessage({ type: 'telemetry', state });
    }

    return true;
  }
}

registerProcessor('vult-processor', VultProcessor);
