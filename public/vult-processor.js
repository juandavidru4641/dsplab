
// Vult Runtime for AudioWorklet
const vultRuntime = `
  var random = Math.random;
  var irandom = function() { return Math.floor(Math.random() * 4294967296); };
  var eps = function() { return 1e-18; };
  var pi = function() { return Math.PI; };
  var clip = function(x, low, high) { return x < low ? low : (x > high ? high : x); };
  var not = function(x) { return x === 0 ? 1 : 0; };
  var real = function(x) { return parseFloat(x); };
  var int = function(x) { return parseInt(x) | 0; };
  var sin = Math.sin;
  var cos = Math.cos;
  var tan = Math.tan;
  var tanh = Math.tanh;
  var abs = Math.abs;
  var exp = Math.exp;
  var log = Math.log;
  var floor = Math.floor;
  var sqrt = Math.sqrt;
  var pow = Math.pow;
  var log10 = Math.log10;
  var set = function(a, i, v) { if(a) a[i] = v; };
  var get = function(a, i) { return a ? a[i] : 0; };
  var makeArray = function(size, v) { return new Array(size).fill(v); };
  var wrap_array = function(a) { return a; };
  var int_to_float = function(i) { return i; };
  var float_to_int = function(f) { return Math.floor(f) | 0; };
`;

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
    
    this.discoveredKeys = [];

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateCode') {
        try {
          this.vultInstance = null;
          const body = vultRuntime + "\n" +
                       "var exports = {};\n" + data.jsCode + "\n" +
                       "if (typeof vultProcess !== 'undefined') return vultProcess;\n" +
                       "if (typeof exports !== 'undefined' && exports.vultProcess) return exports.vultProcess;\n" +
                       "return null;";
          const factory = new Function(body);
          const VultConstructor = factory();
          if (!VultConstructor) throw new Error("vultProcess class not found");
          
          const instance = new VultConstructor();
          instance._processFn = instance.liveProcess || instance.process;
          
          const initFn = instance.liveDefault || instance.default;
          if (typeof initFn === 'function') initFn.call(instance);
          
          this.vultInstance = instance;
          this.discoverVariables();
          
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
            try {
              if (type === 'noteOff') method.call(this.vultInstance, data.note, data.channel);
              else if (type === 'noteOn') method.call(this.vultInstance, data.note, data.velocity, data.channel);
              else method.call(this.vultInstance, data.control, data.value, data.channel);
            } catch(e) {}
          }
        }
      }
    };
  }

  // Optimized discovery: ignore large arrays and internal noise
  discoverVariables() {
    this.discoveredKeys = [];
    if (!this.vultInstance) return;
    const seen = new Set();
    
    const scan = (obj, prefix = "", depth = 0) => {
      if (depth > 4 || !obj || typeof obj !== 'object' || seen.has(obj)) return;
      
      // SKIP LARGE ARRAYS / TABLES (Crucial for performance)
      if (Array.isArray(obj) && obj.length > 32) return;
      if (Object.keys(obj).length > 64) return; 

      seen.add(obj);
      const keys = Object.getOwnPropertyNames(obj);
      for (const key of keys) {
        // Filter out internal Vult noise and methods
        if (key === 'context' || key === '_ctx' || key === '_processFn' || 
            key.startsWith('live') || key.startsWith('Live_') || 
            key.startsWith('_inst') || // Hidden instances are often noise
            !isNaN(parseInt(key)) || // Skip numeric indices (arrays)
            typeof obj[key] === 'function') continue;
        
        const val = obj[key];
        const fullKey = prefix ? prefix + "." + key : key;

        if (typeof val === 'number' || typeof val === 'boolean') {
          this.discoveredKeys.push({ path: fullKey, segments: fullKey.split('.') });
        } else if (typeof val === 'object' && val !== null) {
          scan(val, fullKey, depth + 1);
        }
      }
    };

    if (this.vultInstance.context) scan(this.vultInstance.context);
    if (this.vultInstance._ctx) scan(this.vultInstance._ctx);
    scan(this.vultInstance);
  }

  getQuickState() {
    const state = {};
    if (!this.vultInstance) return state;
    for (const item of this.discoveredKeys) {
      let current = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
      for (const segment of item.segments) {
        if (current) current = current[segment];
        else break;
      }
      if (typeof current === 'number' || typeof current === 'boolean') {
        state[item.path] = current;
      }
    }
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

      if (this.vultInstance && this.vultInstance._processFn) {
        try {
          const result = this.vultInstance._processFn.apply(this.vultInstance, inputValues);
          
          if (this.activeProbes.length > 0) {
            this.activeProbes.forEach(p => {
              const parts = p.split('.');
              let target = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
              for(const part of parts) { if(target) target = target[part]; }
              if (this.probeBuffers[p]) this.probeBuffers[p][this.bufferIdx] = typeof target === 'number' ? target : 0;
            });
            this.bufferIdx = (this.bufferIdx + 1) % this.bufferSize;
          }

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
    }

    if (this.vultInstance && this.telemetryCounter++ > 30) {
      this.telemetryCounter = 0;
      const state = this.getQuickState();
      this.port.postMessage({ type: 'telemetry', state, probes: this.probeBuffers });
    }

    return true;
  }
}

registerProcessor('vult-processor', VultProcessor);
