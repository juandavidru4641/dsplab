
class VultProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.vultInstance = null;
    this.sources = [];
    this.phases = [];
    this.sampleRate = 44100;
    this.telemetryCounter = 0;
    this.bufferSize = 2048;
    this.bufferIdx = 0;
    this.activeProbes = [];
    this.probeBuffers = {};
    this.genStates = [];

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateCode') {
        try {
          const factory = new Function(`
            var exports = {};
            ${data.jsCode}
            if (typeof vultProcess !== 'undefined') return vultProcess;
            if (typeof exports !== 'undefined' && exports.vultProcess) return exports.vultProcess;
            return null;
          `);
          const VultConstructor = factory();
          if (!VultConstructor) throw new Error("vultProcess class not found");
          
          this.vultInstance = new VultConstructor();
          const initFn = this.vultInstance.liveDefault || this.vultInstance.default;
          if (typeof initFn === 'function') initFn.call(this.vultInstance);
          
          console.log("[Worklet] Vult instance loaded.");
          this.port.postMessage({ type: 'status', success: true });
        } catch (err) {
          console.error("[Worklet] Update Error:", err);
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
        if (this.genStates[data.index] !== undefined) this.genStates[data.index] = 1.0;
      } else if (type === 'noteOn' || type === 'noteOff' || type === 'controlChange') {
        if (this.vultInstance) {
          const method = type === 'noteOn' ? (this.vultInstance.liveNoteOn || this.vultInstance.noteOn) :
                         type === 'noteOff' ? (this.vultInstance.liveNoteOff || this.vultInstance.noteOff) :
                         (this.vultInstance.liveControlChange || this.vultInstance.controlChange);
          if (typeof method === 'function') {
            if (type === 'noteOff') method.call(this.vultInstance, data.note, data.channel);
            else if (type === 'noteOn') method.call(this.vultInstance, data.note, data.velocity, data.channel);
            else method.call(this.vultInstance, data.control, data.value, data.channel);
          }
        }
      }
    };
  }

  // Robust state collector
  collectState() {
    if (!this.vultInstance) return { "_status": "No instance" };
    const state = {};
    
    // We scan the instance and its common context holders
    const targets = [
      { obj: this.vultInstance.context, prefix: "" },
      { obj: this.vultInstance._ctx, prefix: "" },
      { obj: this.vultInstance, prefix: "" }
    ];

    targets.forEach(({ obj, prefix }) => {
      if (!obj || typeof obj !== 'object') return;
      
      // Use both getOwnPropertyNames and a standard for...in to be sure
      const keys = new Set([
        ...Object.getOwnPropertyNames(obj),
        ...Object.keys(obj)
      ]);

      keys.forEach(key => {
        // Skip noise and recursion
        if (key === 'context' || key === '_ctx' || key === 'process' || key.startsWith('live')) return;
        
        const val = obj[key];
        const fullKey = prefix ? prefix + "." + key : key;

        if (typeof val === 'number') {
          state[fullKey] = val;
        } else if (typeof val === 'boolean') {
          state[fullKey] = val;
        } else if (val && typeof val === 'object' && !Array.isArray(val) && prefix === "") {
          // One level of nesting for objects like 'adsr' or 'filter' state
          for (const subKey in val) {
            const subVal = val[subKey];
            if (typeof subVal === 'number' || typeof subVal === 'boolean') {
              state[key + "." + subKey] = subVal;
            }
          }
        }
      });
    });

    return state;
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
          const phaseInc = (src.freq || 440) / 44100;
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
        } else if (src.type === 'impulse') {
          inputValues.push(this.genStates[s]);
          this.genStates[s] = 0;
        } else if (src.type === 'step') {
          inputValues.push(this.genStates[s]);
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
            
            // PROBE SYNC
            this.activeProbes.forEach(p => {
              const ctx = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
              let val = 0;
              if (p.includes('.')) {
                const parts = p.split('.');
                let current = ctx;
                for(const part of parts) { if(current) current = current[part]; }
                val = typeof current === 'number' ? current : 0;
              } else {
                val = ctx[p] !== undefined ? ctx[p] : this.vultInstance[p];
              }
              if (this.probeBuffers[p]) this.probeBuffers[p][this.bufferIdx] = typeof val === 'number' ? val : 0;
            });
            this.bufferIdx = (this.bufferIdx + 1) % this.bufferSize;

            if (typeof result === 'object' && result !== null) {
              outputL[i] = result.t0 || 0;
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

    if (this.telemetryCounter++ > 30) {
      this.telemetryCounter = 0;
      const state = this.collectState();
      this.port.postMessage({ type: 'telemetry', state, probes: this.probeBuffers });
    }

    return true;
  }
}

registerProcessor('vult-processor', VultProcessor);
