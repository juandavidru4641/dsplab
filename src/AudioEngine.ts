
export interface VultInstance {
  instance: any;
  process: Function;
  noteOn?: Function;
  noteOff?: Function;
  controlChange?: Function;
}

export type SourceType = 'oscillator' | 'live' | 'cv' | 'silence' | 'test_noise' | 'impulse' | 'step' | 'sweep';

export interface InputSource {
  name: string;
  type: SourceType;
  freq: number;
  value: number;
  deviceId?: string;
  oscType: 'sine' | 'sawtooth' | 'square' | 'triangle';
  isCycling?: boolean;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private scopeBuffer: Float32Array;
  private spectrumBuffer: Uint8Array;
  private isPlaying = false;
  private liveState: Record<string, any> = {};
  private probedStates: Record<string, Float32Array> = {};
  
  private sources: InputSource[] = [];
  private inputStream: MediaStream | null = null;
  private inputNode: MediaStreamAudioSourceNode | null = null;

  constructor() {
    this.scopeBuffer = new Float32Array(2048);
    this.spectrumBuffer = new Uint8Array(1024);
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
          this.liveState = event.data.state;
          if (event.data.probes) {
            this.probedStates = event.data.probes;
          }
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
    
    const liveSource = this.sources.find(s => s.type === 'live');
    if (liveSource && this.audioContext && this.workletNode) {
      try {
        if (this.inputStream) this.inputStream.getTracks().forEach(t => t.stop());
        this.inputStream = await navigator.mediaDevices.getUserMedia({
          audio: liveSource.deviceId ? { deviceId: { exact: liveSource.deviceId } } : true
        });
        if (this.inputNode) this.inputNode.disconnect();
        this.inputNode = this.audioContext.createMediaStreamSource(this.inputStream);
        this.inputNode.connect(this.workletNode);
      } catch (err) { console.error(err); }
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
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: vultCode })
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: text };
      }

      const compilation = await response.json();
      if (compilation.errors && Array.isArray(compilation.errors) && compilation.errors.length > 0) {
        return { success: false, error: compilation.errors[0].msg || "Compilation Error" };
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

  public getLiveState() { return this.liveState; }
  public getProbedStates() { return this.probedStates; }

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
