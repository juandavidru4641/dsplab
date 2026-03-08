
export interface VultInstance {
  instance: any;
  process: Function;
  noteOn?: Function;
  noteOff?: Function;
  controlChange?: Function;
}

export type SourceType = 'oscillator' | 'live' | 'cv' | 'silence' | 'test_noise' | 'impulse' | 'step' | 'sweep' | 'sample';

export interface InputSource {
  name: string;
  type: SourceType;
  freq: number;
  value: number;
  deviceId?: string;
  oscType: 'sine' | 'sawtooth' | 'square' | 'triangle';
  isCycling?: boolean;
  isLooping?: boolean;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private scopeBuffer: Float32Array;
  private spectrumBuffer: Uint8Array;
  private isPlaying = false;
  private liveState: Record<string, any> = {};
  private telemetryHistory: Record<string, any>[] = [];
  private probedStates: Record<string, number[]> = {};
  private audioMetrics: Record<string, number> = { peak: 0, rms: 0, clippingCount: 0, headroom: 0 };
  
  private sources: InputSource[] = [];

  // Listeners for UI state updates
  private stateListeners: ((state: Record<string, any>, probes: Record<string, number[]>) => void)[] = [];
  private errorListeners: ((error: string) => void)[] = [];

  constructor() {
    this.scopeBuffer = new Float32Array(2048);
    this.spectrumBuffer = new Uint8Array(1024);
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

  public async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch(e) { return []; }
  }

  public setSources(sources: InputSource[]) {
    this.sources = sources || [];
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setSources', data: { sources: this.sources } });
    }
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

  public async start() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      try {
        await this.audioContext.audioWorklet.addModule('/vult-processor.js');
      } catch (e) {
        throw new Error("AudioWorklet failed to load.");
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      this.workletNode = new AudioWorkletNode(this.audioContext, 'vult-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'telemetry') {
          this.liveState = event.data.state || {};
          
          // Maintain a rolling history of the last 20 states
          this.telemetryHistory.push({ ...this.liveState });
          if (this.telemetryHistory.length > 20) {
            this.telemetryHistory.shift();
          }

          const probes = event.data.probes || {};
          
          if (event.data.metrics) {
            this.audioMetrics = event.data.metrics;
          }
          
          // Notify listeners with both state and probes
          this.stateListeners.forEach(l => l(this.liveState, probes));
          
          if (event.data.probes) {
            this.probedStates = event.data.probes;
          }
        } else if (event.data.type === 'runtimeError') {
          this.errorListeners.forEach(l => l(event.data.error));
        } else if (event.data.type === 'status' && !event.data.success) {
          console.error("Worklet Error:", event.data.error);
        }
      };

      this.workletNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      this.workletNode.port.postMessage({ 
        type: 'setSampleRate', 
        data: { sampleRate: this.audioContext.sampleRate } 
      });
      this.workletNode.port.postMessage({ type: 'setSources', data: { sources: this.sources } });
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.isPlaying = true;
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
        body: JSON.stringify({ code: vultCode }),
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
        return { success: false, error: msg };
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

  public getLiveState() {
    return this.liveState;
  }

  public getTelemetryHistory() {
    return this.telemetryHistory;
  }
  public getProbedStates() { return this.probedStates; }
  public getAudioMetrics() { return this.audioMetrics; }

  public getScopeData() {
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.scopeBuffer as any);
    }
    return this.scopeBuffer;
  }

  public getSpectrumData() {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.spectrumBuffer as any);
    }
    return this.spectrumBuffer;
  }

  public getPeakFrequencies(count: number = 3) {
    if (!this.analyser || !this.audioContext) return [];
    this.analyser.getByteFrequencyData(this.spectrumBuffer as any);
    
    const bins = Array.from(this.spectrumBuffer).map((energy, index) => ({
      energy,
      frequency: Math.round(index * this.audioContext!.sampleRate / this.analyser!.fftSize)
    }));

    // Sort by energy descending and return top N unique frequencies
    return bins
      .sort((a, b) => b.energy - a.energy)
      .slice(0, count * 2) // Take a few more to filter out adjacent bins
      .filter((v, i, a) => i === 0 || Math.abs(v.frequency - a[i-1].frequency) > 50) // Filter close frequencies
      .slice(0, count);
  }

  public getHarmonics() {
    if (!this.analyser || !this.audioContext) return null;
    this.analyser.getByteFrequencyData(this.spectrumBuffer as any);
    
    const bins = this.spectrumBuffer;
    const binFreq = this.audioContext.sampleRate / this.analyser.fftSize;
    const binCount = this.analyser.frequencyBinCount;
    
    // Find fundamental (peak with highest energy between 40Hz and 5kHz)
    let maxEnergy = -1;
    let fundamentalBin = -1;
    const startBin = Math.floor(40/binFreq);
    const endBin = Math.min(binCount, Math.floor(5000/binFreq));

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
    if (!this.analyser || !this.audioContext) return null;
    this.analyser.getByteFrequencyData(this.spectrumBuffer as any);
    
    const bins = Array.from(this.spectrumBuffer);
    const minDb = this.analyser.minDecibels;
    const maxDb = this.analyser.maxDecibels;
    const range = maxDb - minDb;

    // Convert byte values to linear power
    const powers = bins.map(v => Math.pow(10, (minDb + (v / 255) * range) / 10));
    
    let totalPower = 0;
    let maxPower = 0;
    let maxBin = -1;

    for (let i = 0; i < powers.length; i++) {
      totalPower += powers[i];
      if (powers[i] > maxPower) {
        maxPower = powers[i];
        maxBin = i;
      }
    }

    if (totalPower === 0 || maxPower < 1e-9) return { error: "Signal too weak for analysis." };

    const noiseAndDistPower = totalPower - maxPower;
    const thdn = (noiseAndDistPower / totalPower) * 100;
    const snr = 10 * Math.log10(maxPower / (noiseAndDistPower + 1e-12));
    const peakDb = minDb + (bins[maxBin] / 255) * range;

    return {
      thdn_percent: thdn.toFixed(3) + "%",
      snr_db: snr.toFixed(2) + " dB",
      peak_level_db: peakDb.toFixed(2) + " dBFS",
      fundamental_hz: Math.round(maxBin * this.audioContext.sampleRate / this.analyser.fftSize)
    };
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

  public getIsPlaying() { return this.isPlaying; }
}
