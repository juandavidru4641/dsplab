
export interface VultInstance {
  instance: any;
  process: Function;
  noteOn?: Function;
  noteOff?: Function;
  controlChange?: Function;
}

export type SourceType = 'oscillator' | 'lfo' | 'live' | 'cv' | 'silence' | 'test_noise' | 'impulse' | 'step' | 'sweep' | 'sample';

export interface InputSource {
  name: string;
  type: SourceType;
  freq: number;
  value: number;
  deviceId?: string;
  oscType: 'sine' | 'sawtooth' | 'square' | 'triangle';
  isCycling?: boolean;
  isLooping?: boolean;
  lfoRate?: number;
  lfoDepth?: number;
  lfoShape?: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private scopeBufferL: Float32Array;
  private scopeBufferR: Float32Array;
  private spectrumBuffer: Uint8Array;
  private floatSpectrumBuffer: Float32Array;
  private isPlaying = false;
  private liveState: Record<string, any> = {};
  private telemetryHistory: Record<string, any>[] = [];
  private probedStates: Record<string, number[]> = {};
  private audioMetrics: Record<string, number> = { peak: 0, rms: 0, clippingCount: 0, headroom: 0 };

  private sources: InputSource[] = [];
  private settings = {
    sampleRate: 0,       // 0 = use hardware default
    bufferSize: 512,
    inputDeviceId: 'default',
    outputDeviceId: 'default'
  };

  // Listeners for UI state updates
  private stateListeners: ((state: Record<string, any>, probes: Record<string, number[]>) => void)[] = [];
  private errorListeners: ((error: string) => void)[] = [];
  private seqStepListeners: ((step: number) => void)[] = [];
  private audioStatusListeners: ((status: { state: string; sampleRate: number }) => void)[] = [];
  private midiActListeners: ((kind: string) => void)[] = [];
  private compilerVersion: 'v0' | 'v1' = 'v0';

  constructor() {
    this.scopeBufferL = new Float32Array(8192);
    this.scopeBufferR = new Float32Array(8192);
    this.spectrumBuffer = new Uint8Array(4096);
    this.floatSpectrumBuffer = new Float32Array(4096);
  }

  public onStateUpdate(callback: (state: Record<string, any>, probes: Record<string, number[]>) => void) {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== callback);
    };
  }

  public onRuntimeError(callback: (error: string) => void) {
    this.errorListeners.push(callback);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== callback);
    };
  }

  public onSequencerStep(callback: (step: number) => void) {
    this.seqStepListeners.push(callback);
    return () => {
      this.seqStepListeners = this.seqStepListeners.filter(l => l !== callback);
    };
  }

  public onMidiActivity(callback: (kind: string) => void) {
    this.midiActListeners.push(callback);
    return () => {
      this.midiActListeners = this.midiActListeners.filter(l => l !== callback);
    };
  }

  public onAudioStatusUpdate(callback: (status: { state: string; sampleRate: number }) => void) {
    this.audioStatusListeners.push(callback);
    if (this.audioContext) {
      callback({ state: this.audioContext.state, sampleRate: this.audioContext.sampleRate });
    }
    return () => {
      this.audioStatusListeners = this.audioStatusListeners.filter(l => l !== callback);
    };
  }

  public async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (e) { return []; }
  }

  public async getAvailableDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(d => d.label && d.label.length > 0);
      if (!hasLabels && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        } catch (e) { /* permission denied */ }
      }
      const updatedDevices = await navigator.mediaDevices.enumerateDevices();
      return {
        inputs: updatedDevices.filter(d => d.kind === 'audioinput'),
        outputs: updatedDevices.filter(d => d.kind === 'audiooutput')
      };
    } catch (e) {
      return { inputs: [], outputs: [] };
    }
  }

  public setSources(sources: InputSource[]) {
    this.sources = sources || [];
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setSources', data: { sources: this.sources } });
    }
  }

  public async updateSettings(newSettings: Partial<typeof this.settings>) {
    const changed = Object.keys(newSettings).some(k => (newSettings as any)[k] !== (this.settings as any)[k]);
    if (!changed) return;
    this.settings = { ...this.settings, ...newSettings };
    // Settings are applied on next start() — no need to rebuild context mid-playback
  }

  public getSettings() {
    return { ...this.settings };
  }

  public setProbes(probes: string[]) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setProbes', data: { probes } });
    }
  }

  public setState(path: string, value: number) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setState', data: { path, value } });
    }
  }

  public setSampleData(index: number, buffer: Float32Array) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setSampleData', data: { index, buffer } });
    }
  }

  public triggerGenerator(index: number) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'trigger', data: { index } });
    }
  }

  public initContextSync() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext.addEventListener('statechange', () => {
        this.audioStatusListeners.forEach(l => l({
          state: this.audioContext!.state,
          sampleRate: this.audioContext!.sampleRate
        }));
      });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(e => console.error("Error resuming AudioContext:", e));
    }
  }

  public async start() {
    this.initContextSync();
    if (!this.workletNode) {
      try {
        await this.audioContext!.audioWorklet.addModule('/vult-processor.js');
      } catch (e) {
        throw new Error("AudioWorklet failed to load.");
      }

      this.splitter = this.audioContext!.createChannelSplitter(2);

      this.analyserL = this.audioContext!.createAnalyser();
      this.analyserL.fftSize = 8192;
      this.analyserL.smoothingTimeConstant = 0.85;
      
      this.analyserR = this.audioContext!.createAnalyser();
      this.analyserR.fftSize = 8192;
      this.analyserR.smoothingTimeConstant = 0.85;

      this.workletNode = new AudioWorkletNode(this.audioContext!, 'vult-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'telemetry') {
          this.liveState = event.data.state || {};
          this.telemetryHistory.push({ ...this.liveState });
          if (this.telemetryHistory.length > 20) this.telemetryHistory.shift();
          const probes = event.data.probes || {};
          if (event.data.metrics) this.audioMetrics = event.data.metrics;
          this.stateListeners.forEach(l => l(this.liveState, probes));
          if (event.data.probes) this.probedStates = event.data.probes;
        } else if (event.data.type === 'runtimeError') {
          this.errorListeners.forEach(l => l(event.data.error));
        } else if (event.data.type === 'seqStep') {
          this.seqStepListeners.forEach(l => l(event.data.step));
        } else if (event.data.type === 'midiAct') {
          this.midiActListeners.forEach(l => l(event.data.kind));
        } else if (event.data.type === 'status' && !event.data.success) {
          console.error("Worklet Error:", event.data.error);
        }
      };

      this.workletNode.connect(this.splitter);
      this.splitter.connect(this.analyserL, 0, 0);
      this.splitter.connect(this.analyserR, 1, 0);
      
      // Connect L + R back into destination via a merger so you can hear both channels properly
      const merger = this.audioContext!.createChannelMerger(2);
      this.analyserL.connect(merger, 0, 0);
      this.analyserR.connect(merger, 0, 1);
      merger.connect(this.audioContext!.destination);

      this.workletNode.port.postMessage({
        type: 'setSampleRate',
        data: { sampleRate: this.audioContext!.sampleRate }
      });
      this.workletNode.port.postMessage({ type: 'setSources', data: { sources: this.sources } });

      // Notify audio status listeners
      this.audioStatusListeners.forEach(l => l({
        state: this.audioContext!.state,
        sampleRate: this.audioContext!.sampleRate
      }));
    }

    if (this.audioContext!.state === 'suspended') {
      await this.audioContext!.resume();
    }
    this.isPlaying = true;
  }

  public setCompilerVersion(version: 'v0' | 'v1') {
    this.compilerVersion = version;
  }

  public stop() {
    if (this.audioContext) {
      this.audioContext.suspend();
    }
    this.isPlaying = false;
  }


  public async updateCode(vultCode: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: vultCode, version: this.compilerVersion }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: text };
      }

      const compilation = await response.json();
      if (compilation.errors && Array.isArray(compilation.errors) && compilation.errors.length > 0) {
        const msg = compilation.errors[0].msg || "Compilation Error";
        console.error("Vult Compile Error:", msg);
        return { success: false, error: msg, rawErrors: compilation.errors };
      }

      const jsCode = compilation.code;
      if (this.workletNode) {
        this.workletNode.port.postMessage({ type: 'updateCode', data: { jsCode } });
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: "Network Error: " + err.toString() };
    }
  }

  public async compileCheck(vultCode: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for bg checks

      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: vultCode, version: this.compilerVersion }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: text };
      }

      const compilation = await response.json();
      if (compilation.errors && Array.isArray(compilation.errors) && compilation.errors.length > 0) {
        const msg = compilation.errors[0].msg || "Compilation Error";
        return { success: false, error: msg, rawErrors: compilation.errors };
      }

      return { success: true };
    } catch (err: any) {
      if (err.name === 'AbortError') return { success: true }; // Ignore timeouts for bg checks
      return { success: false, error: "Network Error: " + err.toString() };
    }
  }

  public getLiveState() {
    return this.liveState;
  }

  public getTelemetryHistory() {
    return this.telemetryHistory;
  }
  public getProbedStates() { return this.probedStates; }
  public getAudioMetrics() { return this.audioMetrics; }

  public getScopeData() {
    if (this.analyserL) {
      this.analyserL.getFloatTimeDomainData(this.scopeBufferL as any);
    }
    if (this.analyserR) {
      this.analyserR.getFloatTimeDomainData(this.scopeBufferR as any);
    }
    return { l: this.scopeBufferL, r: this.scopeBufferR };
  }

  public getSpectrumData() {
    if (this.analyserL) {
      this.analyserL.getByteFrequencyData(this.spectrumBuffer as any);
    }
    return this.spectrumBuffer;
  }

  public getPeakFrequencies(count: number = 3) {
    if (!this.analyserL || !this.audioContext) return [];
    this.analyserL.getByteFrequencyData(this.spectrumBuffer as any);

    const bins = Array.from(this.spectrumBuffer).map((energy, index) => ({
      energy,
      frequency: Math.round(index * this.audioContext!.sampleRate / this.analyserL!.fftSize)
    }));

    // Sort by energy descending and return top N unique frequencies
    return bins
      .sort((a, b) => b.energy - a.energy)
      .slice(0, count * 2) // Take a few more to filter out adjacent bins
      .filter((v, i, a) => i === 0 || Math.abs(v.frequency - a[i - 1].frequency) > 50) // Filter close frequencies
      .slice(0, count);
  }

  public getHarmonics() {
    if (!this.analyserL || !this.audioContext) return null;
    this.analyserL.getByteFrequencyData(this.spectrumBuffer as any);

    const bins = this.spectrumBuffer;
    const binFreq = this.audioContext.sampleRate / this.analyserL.fftSize;
    const binCount = this.analyserL.frequencyBinCount;

    // Find fundamental (peak with highest energy between 40Hz and 5kHz)
    let maxEnergy = -1;
    let fundamentalBin = -1;
    const startBin = Math.floor(40 / binFreq);
    const endBin = Math.min(binCount, Math.floor(5000 / binFreq));

    for (let i = startBin; i < endBin; i++) {
      if (bins[i] > maxEnergy) {
        maxEnergy = bins[i];
        fundamentalBin = i;
      }
    }

    if (fundamentalBin === -1 || maxEnergy < 10) return { error: "No signal detected or fundamental too weak." };

    const fundamental = fundamentalBin * binFreq;
    const harmonics = [];

    for (let h = 1; h <= 8; h++) {
      const targetFreq = fundamental * h;
      const targetBin = Math.round(targetFreq / binFreq);

      if (targetBin >= binCount) break;

      // Look at small window around target bin for the local peak
      let localMax = 0;
      const windowStart = Math.max(0, targetBin - 1);
      const windowEnd = Math.min(binCount - 1, targetBin + 1);
      for (let w = windowStart; w <= windowEnd; w++) {
        if (bins[w] > localMax) localMax = bins[w];
      }

      harmonics.push({
        harmonic: h,
        frequency: Math.round(targetFreq),
        energy: localMax,
        relative_db: 20 * Math.log10((localMax + 1e-6) / (maxEnergy + 1e-6))
      });
    }

    return { fundamental: Math.round(fundamental), harmonics };
  }

  public getSignalQualityMetrics() {
    if (!this.analyserL || !this.audioContext) return null;
    this.analyserL.getByteFrequencyData(this.spectrumBuffer as any);

    const bins = this.spectrumBuffer;
    const minDb = this.analyserL.minDecibels;
    const maxDb = this.analyserL.maxDecibels;
    const range = maxDb - minDb;

    let totalPower = 0;
    let maxPower = 0;
    let maxBin = -1;

    // Single-pass power calculation
    for (let i = 0; i < bins.length; i++) {
      const db = minDb + (bins[i] / 255) * range;
      const power = Math.pow(10, db / 10);
      totalPower += power;
      if (power > maxPower) {
        maxPower = power;
        maxBin = i;
      }
    }

    if (totalPower === 0 || maxPower < 1e-9) return { error: "Signal too weak for analysis." };

    const noiseAndDistPower = Math.max(0, totalPower - maxPower);
    const thdn = (noiseAndDistPower / totalPower) * 100;
    const snr = 10 * Math.log10(maxPower / (noiseAndDistPower + 1e-12));
    const peakDb = minDb + (bins[maxBin] / 255) * range;

    return {
      thdn_percent: thdn.toFixed(3) + "%",
      snr_db: snr.toFixed(2) + " dB",
      peak_level_db: peakDb.toFixed(2) + " dBFS",
      fundamental_hz: Math.round(maxBin * this.audioContext.sampleRate / this.analyserL.fftSize)
    };
  }

  private computeChannelStats(analyser: AnalyserNode, timeBuffer: Float32Array): { display: Record<string, string>, rmsLinear: number, peakLinear: number } {
    const stats: Record<string, string> = {};
    const sampleRate = this.audioContext!.sampleRate;

    // --- Time-domain stats ---
    analyser.getFloatTimeDomainData(timeBuffer as any);
    const len = timeBuffer.length;
    let sum = 0, sumSq = 0, peak = 0;
    for (let i = 0; i < len; i++) {
        const s = timeBuffer[i];
        sum += s;
        sumSq += s * s;
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
    }

    const dc = sum / len;
    const rms = Math.sqrt(sumSq / len);
    const rmsDb = rms > 1e-10 ? 20 * Math.log10(rms) : -Infinity;
    const peakDb = peak > 1e-10 ? 20 * Math.log10(peak) : -Infinity;
    const crest = rms > 1e-10 ? peak / rms : 0;
    const crestDb = crest > 1.0 ? 20 * Math.log10(crest) : 0;

    stats['RMS'] = rmsDb > -100 ? (rmsDb > 0 ? '+' : '') + rmsDb.toFixed(1) + ' dBFS' : '—';
    stats['Peak'] = peakDb > -100 ? (peakDb > 0 ? 'CLIP +' : '') + peakDb.toFixed(1) + ' dBFS' : '—';
    stats['Crest'] = crest > 1.0 ? crestDb.toFixed(1) + ' dB' : '—';
    stats['DC'] = Math.abs(dc) > 1e-5 ? (dc * 1000).toFixed(2) + ' m' : '~0';

    // --- Frequency-domain stats ---
    analyser.getFloatFrequencyData(this.floatSpectrumBuffer as any);
    const fBins = this.floatSpectrumBuffer;
    const fftSize = analyser.fftSize;
    const binFreq = sampleRate / fftSize;
    const binCount = analyser.frequencyBinCount;

    const powers = new Float64Array(binCount);
    let totalPower = 0;
    let maxPower = 0;
    let fundamentalBin = -1;

    const startBin = Math.max(1, Math.floor(30 / binFreq));
    const endBin = Math.min(binCount, Math.floor(8000 / binFreq));

    for (let i = 1; i < binCount; i++) {
        const db = fBins[i];
        if (db < -150) { powers[i] = 0; continue; }
        const p = Math.pow(10, db / 10);
        powers[i] = p;
        totalPower += p;
        if (i >= startBin && i < endBin && p > maxPower) {
            maxPower = p;
            fundamentalBin = i;
        }
    }

    if (totalPower < 1e-15 || fundamentalBin < 0) {
        stats['SNR'] = '—';
        stats['THD+N'] = '—';
        stats['F0'] = '—';
    } else {
        const fundamentalHz = Math.round(fundamentalBin * binFreq);
        // Reduce window to ±4 to prevent overlapping harmonics at low frequencies (e.g. 50Hz)
        const windowHalf = 4;
        const usedBins = new Uint8Array(binCount);
        let signalPower = 0;
        let fundamentalPower = 0;

        for (let h = 1; h <= 10; h++) {
            const targetBin = Math.round(fundamentalBin * h);
            if (targetBin >= binCount) break;
            const lo = Math.max(1, targetBin - windowHalf);
            const hi = Math.min(binCount - 1, targetBin + windowHalf);
            let windowPower = 0;
            for (let b = lo; b <= hi; b++) {
                if (!usedBins[b]) {
                    windowPower += powers[b];
                    usedBins[b] = 1;
                }
            }
            signalPower += windowPower;
            if (h === 1) fundamentalPower = windowPower;
        }

        const noisePower = Math.max(0, totalPower - signalPower);
        const harmonicDistortion = Math.max(0, signalPower - fundamentalPower);
        const snr = fundamentalPower > 1e-15 && noisePower > 1e-15 ? 10 * Math.log10(fundamentalPower / noisePower) : (fundamentalPower > 1e-15 ? 120 : 0);
        const thdnRatio = fundamentalPower > 1e-15 ? (harmonicDistortion + noisePower) / fundamentalPower : 0;
        const thdnPercent = thdnRatio * 100;

        stats['SNR'] = snr > 0.1 ? snr.toFixed(1) + ' dB' : '—';
        stats['THD+N'] = thdnPercent < 999 ? thdnPercent.toFixed(2) + '%' : '—';
        stats['F0'] = fundamentalHz + ' Hz';
    }

    return { display: stats, rmsLinear: rms, peakLinear: peak };
  }

  public getDSPStats(): Record<string, any> {
    if (!this.analyserL || !this.audioContext) return {};

    const statsL = this.computeChannelStats(this.analyserL, this.scopeBufferL);
    const result: Record<string, any> = {
        L: statsL.display,
        Fs: (this.audioContext.sampleRate / 1000).toFixed(1) + ' kHz'
    };

    // Always attempt to return R if analyserR exists
    if (this.analyserR) {
        const statsR = this.computeChannelStats(this.analyserR, this.scopeBufferR);
        result.R = statsR.display;
    }

    return result;
  }

  public sendNoteOn(note: number, velocity: number, channel: number = 0) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'noteOn', data: { note, velocity, channel } });
    }
  }

  public sendNoteOff(note: number, channel: number = 0) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'noteOff', data: { note, channel } });
    }
  }

  public sendControlChange(cc: number, val: number, channel: number = 0) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'controlChange', data: { control: cc, value: val, channel } });
    }
  }

  public setSequencer(data: { isPlaying: boolean, bpm: number, steps: any[], length: number }) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setSequencer', data });
    }
  }
  public getIsPlaying() { return this.isPlaying; }

  public getAudioStatus() {
    return {
      state: this.audioContext?.state || 'suspended',
      sampleRate: this.audioContext?.sampleRate || 0
    };
  }
}
