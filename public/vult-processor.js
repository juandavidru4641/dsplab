
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
    
    this.activeProbes = [];
    this.probeHistory = {}; 
    
    this.genStates = [];
    this.sampleBuffers = {}; 
    this.discoveredKeys = [];

    // Audio Metrics
    this.metrics = {
      peak: 0,
      rms: 0,
      clippingCount: 0,
      headroom: 0
    };

    // Crash handling
    this.errorCount = 0;
    this.isCrashed = false;
    this.lastError = null;

    // Deferred code compilation — stored here by onmessage, applied in process()
    this._pendingCode = null;

    this.seqState = {
      isPlaying: false,
      bpm: 120,
      length: 16,
      gateLength: 0.5,
      mode: 'melody',
      steps: [],
      tracks: [],
      currentStep: -1,
      sampleCounter: 0,
      activeNotes: [],
      activeDrumNotes: []
    };

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateCode') {
        // IMPORTANT: Do NOT compile (new Function) here in onmessage.
        // In Chrome, onmessage shares the audio render thread. If new Function()
        // takes >2.9ms to parse/JIT the VS-80 code, it misses the audio block
        // deadline and Chrome fires 'renderer error'. Instead, defer to process().
        this._pendingCode = data.jsCode;
      } else if (type === 'setSources') {
        this.sources = data.sources || [];
        // Only re-init if lengths changed to prevent phase reset on simple updates
        if (this.phases.length !== this.sources.length) {
          this.phases = new Array(this.sources.length).fill(0);
          this.genStates = new Array(this.sources.length).fill(0);
        }
      } else if (type === 'setSampleData') {
        this.sampleBuffers[data.index] = data.buffer;
        this.phases[data.index] = 0;
      } else if (type === 'setState') {
        if (this.vultInstance) {
          const parts = data.path.split('.');
          let target = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
          for (let i = 0; i < parts.length - 1; i++) {
            if (target) target = target[parts[i]];
          }
          if (target && target[parts[parts.length - 1]] !== undefined) {
            target[parts[parts.length - 1]] = data.value;
          }
        }
      } else if (type === 'setProbes') {
        this.activeProbes = data.probes || [];
        this.activeProbes.forEach(p => {
          if (!this.probeHistory[p]) this.probeHistory[p] = [];
        });
      } else if (type === 'trigger') {
        if (this.genStates[data.index] !== undefined) {
          this.genStates[data.index] = 1.0;
          this.phases[data.index] = 0;
        }
      } else if (type === 'noteOn' || type === 'noteOff' || type === 'controlChange') {
        this.handleMIDIEvents(type, data);
      } else if (type === 'setSequencer') {
        this.seqState = { ...this.seqState, ...data };
        if (data.isPlaying === false) {
          this.killLastNote();
          this.seqState.currentStep = -1;
          this.seqState.sampleCounter = 0;
        }
      } else if (type === 'setSampleRate') {
        this.sampleRate = data.sampleRate || 44100;
      }
    };
  }

  handleMIDIEvents(type, data) {
    if (this.vultInstance && !this.isCrashed) {
      const method = type === 'noteOn' ? (this.vultInstance.liveNoteOn || this.vultInstance.noteOn) :
                     type === 'noteOff' ? (this.vultInstance.liveNoteOff || this.vultInstance.noteOff) :
                     (this.vultInstance.liveControlChange || this.vultInstance.controlChange);
      if (typeof method === 'function') {
        try {
          if (type === 'noteOff') method.call(this.vultInstance, data.note, data.channel || 0);
          else if (type === 'noteOn') method.call(this.vultInstance, data.note, data.velocity, data.channel || 0);
          else method.call(this.vultInstance, data.control, data.value, data.channel || 0);
          
          // Notify the UI thread for LED blinking (throttled to relieve React CPU load)
          if (!this.lastMidiTime) this.lastMidiTime = {};
          if ((currentTime - (this.lastMidiTime[type] || 0)) > 0.05) {
             this.port.postMessage({ type: 'midiAct', kind: type });
             this.lastMidiTime[type] = currentTime;
          }
        } catch(e) {
          this.handleRuntimeCrash(e);
        }
      }
    }
  }

  killLastNote() {
    if (this.seqState.activeNotes && this.seqState.activeNotes.length > 0) {
      this.seqState.activeNotes.forEach(n => this.handleMIDIEvents('noteOff', { note: n }));
      this.seqState.activeNotes = [];
    }
  }

  handleRuntimeCrash(e) {
    if (this.isCrashed) return;
    this.isCrashed = true;
    this.lastError = e.toString();
    console.error("[Worklet] Runtime Crash:", e);
    this.port.postMessage({ type: 'runtimeError', error: this.lastError });
  }

  discoverVariables() {
    this.discoveredKeys = [];
    if (!this.vultInstance) return;
    const seen = new Set();
    const scan = (obj, prefix = "", depth = 0) => {
      if (depth > 4 || !obj || typeof obj !== 'object' || seen.has(obj)) return;
      if (Array.isArray(obj) && obj.length > 32) return;
      if (Object.keys(obj).length > 64) return; 
      seen.add(obj);
      const keys = Object.getOwnPropertyNames(obj);
      for (const key of keys) {
        if (key === 'context' || key === '_ctx' || key === '_processFn' || key.startsWith('live') || key.startsWith('Live_') || key.startsWith('_inst') || !isNaN(parseInt(key)) || typeof obj[key] === 'function') continue;
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
        if (current) current = current[segment]; else break;
      }
      if (typeof current === 'number') state[item.path] = current;
      else if (typeof current === 'boolean') state[item.path] = current ? 1.0 : 0.0;
    }
    return state;
  }

  process(inputs, outputs, parameters) {
    // Apply deferred code compilation (moved here from onmessage to avoid
    // blocking the render thread — see updateCode handler comment).
    if (this._pendingCode !== null) {
      const jsCode = this._pendingCode;
      this._pendingCode = null;
      try {
        this.vultInstance = null;
        this.isCrashed = false;
        this.errorCount = 0;

        const body = vultRuntime + "\n" +
                     "var exports = {};\n" +
                     jsCode + "\n" +
                     "if (typeof vultProcess !== 'undefined') return vultProcess;\n" +
                     "if (typeof VultProcess !== 'undefined') return VultProcess;\n" +
                     "if (typeof exports !== 'undefined' && exports.vultProcess) return exports.vultProcess;\n" +
                     "if (typeof exports !== 'undefined' && exports.VultProcess) return exports.VultProcess;\n" +
                     "if (typeof Vult !== 'undefined') return Vult;\n" +
                     "return null;";

        const factory = new Function(body);
        const VultConstructor = factory();
        if (!VultConstructor) throw new Error("Vult process class not found in compiled JS");

        const instance = new VultConstructor();

        // Fix Vult compiler arity bug for mono returns:
        // liveProcess(input) calls Live_process(context, input) but
        // for mono returns, Live_process(input) only takes 1 arg (no ctx).
        // Detect this and create a corrected wrapper.
        if (instance.Live_process && instance.liveProcess) {
          const innerArity = instance.Live_process.length;  // expected params
          if (innerArity === 1) {
            // Mono: Live_process(input) — no context param
            instance.liveProcess = function(input) {
              return instance.Live_process(input);
            };
          }
        }

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
      // Output silence for this block while the new instance settles
      const outputL = outputs[0] && outputs[0][0] ? outputs[0][0] : null;
      const outputR = outputs[0] && outputs[0][1] ? outputs[0][1] : outputL;
      if (outputL) for (let i = 0; i < outputL.length; i++) { outputL[i] = 0; if (outputR) outputR[i] = 0; }
      return true;
    }

    const outputL = outputs[0] && outputs[0][0] ? outputs[0][0] : null;
    const outputR = outputs[0] && outputs[0][1] ? outputs[0][1] : outputL;
    if (!outputL) return true;

    if (this.isCrashed) {
      for (let i = 0; i < outputL.length; i++) {
        outputL[i] = outputR[i] = 0;
      }
      return true;
    }

    // inputs is empty (numberOfInputs: 0) — live audio is handled via getUserMedia separately
    const liveInput = (inputs && inputs[0] && inputs[0][0]) ? inputs[0][0] : null;
    const numSamples = outputL.length;
    const numInputs = this.sources.length;

    let blockPeak = 0;
    let sumSq = 0;
    let blockClips = 0;

    const samplesPerTick = Math.floor((60 / (this.seqState.bpm || 120)) * this.sampleRate / 4);

    for (let i = 0; i < numSamples; i++) {
      
      // Handle Sequencer Tick
      if (this.seqState.isPlaying && ((this.seqState.mode === 'melody' && this.seqState.steps && this.seqState.steps.length > 0) || (this.seqState.mode === 'drum' && this.seqState.tracks))) {
        if (this.seqState.sampleCounter <= 0) {
          this.seqState.currentStep = (this.seqState.currentStep + 1) % (this.seqState.length || 16);
          this.seqState.sampleCounter = samplesPerTick;

          if (this.seqState.mode === 'drum') {
            if (this.seqState.activeDrumNotes) {
              this.seqState.activeDrumNotes.forEach(n => this.handleMIDIEvents('noteOff', { note: n }));
            }
            this.seqState.activeDrumNotes = [];
            const tracks = this.seqState.tracks || [];
            tracks.forEach(track => {
              const step = track.steps[this.seqState.currentStep];
              if (step && step.active) {
                const vel = step.accent ? 127 : 100;
                this.handleMIDIEvents('noteOn', { note: track.note, velocity: vel, channel: 9 });
                this.seqState.activeDrumNotes.push(track.note);
              }
            });
          } else {
            const step = this.seqState.steps[this.seqState.currentStep];
            const prevIdx = (this.seqState.currentStep + this.seqState.length - 1) % this.seqState.length;
            const prevStep = this.seqState.steps[prevIdx];

            if (step && step.active && step.notes && step.notes.length > 0) {
              const vel = step.accent ? 127 : 100;
              if (this.seqState.activeNotes.length > 0 && (!prevStep || !prevStep.slide)) {
                this.killLastNote();
              }
              
              // Only trigger notes that aren't already active if sliding
              const newNotes = step.notes;
              newNotes.forEach(n => {
                if (!this.seqState.activeNotes.includes(n)) {
                  this.handleMIDIEvents('noteOn', { note: n, velocity: vel });
                }
              });

              // If slide is off and we didn't kill notes above, we might need to kill notes that aren't in the new set
              if (prevStep && prevStep.slide) {
                this.seqState.activeNotes.forEach(n => {
                  if (!newNotes.includes(n)) {
                    this.handleMIDIEvents('noteOff', { note: n });
                  }
                });
              }

              this.seqState.activeNotes = [...newNotes];
            } else {
              this.killLastNote();
            }
          }



          if (this.seqState.currentStep % 1 === 0) {
            this.port.postMessage({ type: 'seqStep', step: this.seqState.currentStep });
          }
        } else {
          const gateLength = this.seqState.gateLength !== undefined ? this.seqState.gateLength : 0.5;
          const offThreshold = Math.floor(samplesPerTick * (1.0 - gateLength));

          if (this.seqState.sampleCounter === offThreshold) {
            if (this.seqState.mode === 'drum') {
              if (this.seqState.activeDrumNotes) {
                this.seqState.activeDrumNotes.forEach(n => this.handleMIDIEvents('noteOff', { note: n }));
                this.seqState.activeDrumNotes = [];
              }
            } else {
              const step = this.seqState.steps[this.seqState.currentStep];
              if (step && !step.slide) {
                 this.killLastNote();
              }
            }
          }
        }
        this.seqState.sampleCounter--;

        // CC Automation (Catmull-Rom Spline Interpolation over 4 sub-steps per sequence step)
        if (this.seqState.ccTracks && this.seqState.ccTracks.length > 0) {
           if (!this.lastSentCC) this.lastSentCC = {};
           
           this.seqState.ccTracks.forEach(track => {
              const res = 4;
              const len = (this.seqState.length || 16) * res;
              
              const currentSubStepFloat = (this.seqState.currentStep * res) + (res * (1.0 - (Math.max(0, this.seqState.sampleCounter) / samplesPerTick)));
              const currentSubStep = Math.floor(currentSubStepFloat);
              const t = currentSubStepFloat - currentSubStep;
              
              const v0 = track.steps[(currentSubStep - 1 + len) % len];
              const v1 = track.steps[currentSubStep % len];
              const v2 = track.steps[(currentSubStep + 1) % len];
              const v3 = track.steps[(currentSubStep + 2) % len];
              
              if (v1 !== undefined && v2 !== undefined && v0 !== undefined && v3 !== undefined) {
                 const c0 = v1;
                 const c1 = 0.5 * (v2 - v0);
                 const c2 = v0 - 2.5 * v1 + 2 * v2 - 0.5 * v3;
                 const c3 = -0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3;
                 
                 const smoothValRaw = c0 + c1*t + c2*t*t + c3*t*t*t;
                 const smoothVal = Math.max(0, Math.min(127, Math.floor(smoothValRaw)));
                 
                 if (this.lastSentCC[track.cc] !== smoothVal) {
                    this.lastSentCC[track.cc] = smoothVal;
                    this.handleMIDIEvents('controlChange', { control: track.cc, value: smoothVal });
                 }
              }
           });
        }
      }

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
        } else if (src.type === 'lfo') {
          const rate = src.lfoRate || 1;
          const depth = src.lfoDepth || 1;
          const phaseInc = rate / this.sampleRate;
          this.phases[s] = (this.phases[s] + phaseInc) % 1.0;
          const p = this.phases[s];
          let val = 0;
          if (src.lfoShape === 'sine') val = Math.sin(p * 2 * Math.PI);
          else if (src.lfoShape === 'sawtooth') val = p * 2 - 1;
          else if (src.lfoShape === 'square') val = p < 0.5 ? 1 : -1;
          else if (src.lfoShape === 'triangle') val = Math.abs(p * 4 - 2) - 1;
          
          inputValues.push(val * depth);
        } else if (src.type === 'sample') {
          const buffer = this.sampleBuffers[s];
          if (buffer) {
            let pos = Math.floor(this.phases[s]);
            if (pos < buffer.length) {
              inputValues.push(buffer[pos]);
              this.phases[s]++;
            } else if (src.isLooping) {
              this.phases[s] = 0;
              inputValues.push(buffer[0]);
              this.phases[s]++;
            } else {
              inputValues.push(0);
            }
          } else {
            inputValues.push(0);
          }
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
          
          let outL = 0;
          let outR = 0;
          if (typeof result === 'object' && result !== null) {
            if (Array.isArray(result)) {
              outL = result[0] || 0;
              outR = result.length > 1 ? result[1] : outL;
            } else if ('_0' in result) {
              outL = result._0 || 0;
              outR = '_1' in result ? result._1 : outL;
            } else {
              outL = result.t0 || 0;
              outR = result.t1 !== undefined ? result.t1 : outL;
            }
          } else if (result !== undefined) {
            outL = typeof result === 'number' ? result : 0;
            outR = outL;
          } else {
            // Vult JS target returns tuples by mutating the context and returning undefined
            // The property names depend on the function name, e.g. liveProcess_ret_0, process_ret_0
            let ctx = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
            if (ctx) {
              // Cache the return keys on first discovery
              if (!this.vultInstance._retKey0) {
                for (const key in ctx) {
                  if (key.endsWith('_ret_0')) {
                    this.vultInstance._retKey0 = key;
                    this.vultInstance._retKey1 = key.replace('_ret_0', '_ret_1');
                    this.vultInstance._retCtx = ctx;
                    break;
                  }
                }
                if (!this.vultInstance._retKey0 && ctx.ret_0 !== undefined) {
                  this.vultInstance._retKey0 = 'ret_0';
                  this.vultInstance._retKey1 = 'ret_1';
                  this.vultInstance._retCtx = ctx;
                }
              }
              if (this.vultInstance._retKey0) {
                const rc = this.vultInstance._retCtx;
                outL = rc[this.vultInstance._retKey0] || 0;
                outR = rc[this.vultInstance._retKey1] !== undefined ? rc[this.vultInstance._retKey1] : outL;
              }
            }
          }
          
          if (isNaN(outL) || !isFinite(outL)) outL = 0;
          if (isNaN(outR) || !isFinite(outR)) outR = 0;

          const absL = Math.abs(outL);
          const absR = Math.abs(outR);
          if (absL > blockPeak) blockPeak = absL;
          if (absR > blockPeak) blockPeak = absR;
          if (absL > 0.999 || absR > 0.999) blockClips++;

          sumSq += (outL * outL + outR * outR) / 2;

          // Digital clipping at 0dBFS (1.0)
          const clippedL = outL > 1.0 ? 1.0 : (outL < -1.0 ? -1.0 : outL);
          const clippedR = outR > 1.0 ? 1.0 : (outR < -1.0 ? -1.0 : outR);

          outputL[i] = clippedL;
          if (outputR) outputR[i] = clippedR;

          this.errorCount = 0; 

        } catch (e) {
          this.errorCount++;
          outputL[i] = (outputR ? outputR[i] = 0 : 0);
          if (this.errorCount > 100) {
            this.handleRuntimeCrash(e);
            break;
          }
        }
      } else {
        outputL[i] = (outputR ? outputR[i] = 0 : 0);
      }
    }

    // Update global metrics
    this.metrics.peak = blockPeak;
    this.metrics.rms = Math.sqrt(sumSq / numSamples);
    this.metrics.clippingCount = blockClips;
    this.metrics.headroom = this.metrics.peak > 0 ? 20 * Math.log10(1.0 / this.metrics.peak) : 100;

    // TELEMETRY & PROBE COLLECTION
    if (this.vultInstance) {
      this.activeProbes.forEach(p => {
        const parts = p.split('.');
        let target = this.vultInstance.context || this.vultInstance._ctx || this.vultInstance;
        for(const part of parts) { if(target && target[part] !== undefined) target = target[part]; else break; }
        
        let val = 0;
        if (typeof target === 'number') val = target;
        else if (typeof target === 'boolean') val = target ? 1.0 : 0.0;
        
        if (!this.probeHistory[p]) this.probeHistory[p] = [];
        this.probeHistory[p].push(val);
      });

      if (this.telemetryCounter++ > 23) {
        this.telemetryCounter = 0;
        const state = this.getQuickState();
        this.port.postMessage({ 
          type: 'telemetry', 
          state, 
          probes: this.probeHistory,
          metrics: this.metrics
        });
        for (const key in this.probeHistory) { this.probeHistory[key] = []; }
      }
    }

    return true;
  }
}

registerProcessor('vult-processor', VultProcessor);
