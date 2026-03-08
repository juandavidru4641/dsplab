
class VultProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.vultInstance = null;
    this.sources = [];
    this.phases = [];
    this.sampleRate = 44100;
    this.telemetryCounter = 0;
    
    // Probing system
    this.activeProbes = []; // Names of variables to probe at audio rate
    this.probeBuffers = {}; // Float32Arrays for probed data
    this.bufferSize = 2048;
    this.bufferIdx = 0;

    // Trigger states for Impulse/Step
    this.genStates = [];

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateCode') {
        try {
          const factory = new Function(`
            ${data.jsCode}
            if (typeof vultProcess !== 'undefined') return vultProcess;
            if (typeof exports !== 'undefined' && exports.vultProcess) return exports.vultProcess;
            throw new Error("vultProcess not found");
          `);
          const VultConstructor = factory();
          this.vultInstance = new VultConstructor();
          const initFn = this.vultInstance.liveDefault || this.vultInstance.default;
          if (typeof initFn === 'function') initFn.call(this.vultInstance);
          this.port.postMessage({ type: 'status', success: true });
        } catch (err) {
          this.port.postMessage({ type: 'status', success: false, error: err.toString() });
        }
      } else if (type === 'setSources') {
        this.sources = data.sources || [];
        if (this.phases.length !== this.sources.length) {
          this.phases = new Array(this.sources.length).fill(0);
          this.genStates = new Array(this.sources.length).fill(0);
        }
      } else if (type === 'setProbes') {
        this.activeProbes = data.probes || [];
        this.activeProbes.forEach(p => {
          if (!this.probeBuffers[p]) this.probeBuffers[p] = new Float32Array(this.bufferSize);
        });
      } else if (type === 'trigger') {
        if (this.genStates[data.index] !== undefined) {
          this.genStates[data.index] = 1.0; // Trigger impulse or restart step/sweep
        }
      } else if (type === 'noteOn' || type === 'noteOff' || type === 'controlChange') {
        if (this.vultInstance) {
          const fnName = type === 'controlChange' ? (this.vultInstance.liveControlChange ? 'liveControlChange' : 'controlChange') :
                         type === 'noteOn' ? (this.vultInstance.liveNoteOn ? 'liveNoteOn' : 'noteOn') :
                         (this.vultInstance.liveNoteOff ? 'liveNoteOff' : 'noteOff');
          const fn = this.vultInstance[fnName];
          if (typeof fn === 'function') {
            if (type === 'noteOff') fn.call(this.vultInstance, data.note, data.channel);
            else if (type === 'noteOn') fn.call(this.vultInstance, data.note, data.velocity, data.channel);
            else fn.call(this.vultInstance, data.control, data.value, data.channel);
          }
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
        } else if (src.type === 'impulse') {
          inputValues.push(this.genStates[s]);
          this.genStates[s] = 0; // One-shot
        } else if (src.type === 'step') {
          inputValues.push(this.genStates[s]); // Persists until re-triggered
        } else if (src.type === 'sweep') {
          // Logarithmic sweep 20Hz -> 20kHz
          const duration = src.value || 2.0; // seconds
          this.phases[s] += 1.0 / (duration * this.sampleRate);
          if (this.phases[s] > 1.0) this.phases[s] = 1.0;
          const freq = 20 * Math.pow(1000, this.phases[s]);
          const sweepPhaseInc = freq / this.sampleRate;
          this.genStates[s] = (this.genStates[s] + sweepPhaseInc) % 1.0;
          inputValues.push(Math.sin(this.genStates[s] * 2 * Math.PI));
        } else if (src.type === 'cv') {
          inputValues.push(src.value || 0);
        } else if (src.type === 'live') {
          inputValues.push(liveInput ? liveInput[i] : 0);
        } else {
          inputValues.push(0);
        }
      }

      if (this.vultInstance) {
        const processFn = this.vultInstance.liveProcess || this.vultInstance.process;
        if (typeof processFn === 'function') {
          try {
            const result = processFn.apply(this.vultInstance, inputValues);
            
            // Collect Probes at Sample Rate
            this.activeProbes.forEach(p => {
              const val = this.vultInstance[p] !== undefined ? this.vultInstance[p] : (this.vultInstance.context ? this.vultInstance.context[p] : 0);
              this.probeBuffers[p][this.bufferIdx] = val;
            });
            this.bufferIdx = (this.bufferIdx + 1) % this.bufferSize;

            if (typeof result === 'object' && result !== null) {
              outputL[i] = result.t0 !== undefined ? result.t0 : 0;
              if (outputR) outputR[i] = result.t1 !== undefined ? result.t1 : outputL[i];
            } else {
              outputL[i] = typeof result === 'number' ? result : 0;
              if (outputR) outputR[i] = outputL[i];
            }
          } catch (e) {
            outputL[i] = outputR[i] = 0;
          }
        } else {
          outputL[i] = outputR[i] = 0;
        }
      } else {
        outputL[i] = outputR[i] = 0;
      }
    }

    // TELEMETRY & PROBE SYNC
    if (this.telemetryCounter++ > 20) {
      this.telemetryCounter = 0;
      const state = {};
      if (this.vultInstance.context) {
        for (const key in this.vultInstance.context) {
          const val = this.vultInstance.context[key];
          if (typeof val === 'number' || typeof val === 'boolean') state[key] = val;
        }
      }
      for (const key in this.vultInstance) {
        if (key === 'context') continue;
        const val = this.vultInstance[key];
        if (typeof val === 'number' || typeof val === 'boolean') state[key] = val;
      }
      
      // Send telemetry and audio-rate probe buffers
      this.port.postMessage({ 
        type: 'telemetry', 
        state,
        probes: this.probeBuffers 
      });
    }

    return true;
  }
}

registerProcessor('vult-processor', VultProcessor);
