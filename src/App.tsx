import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Cpu, Zap, Activity, Save, Download, Sliders, AudioWaveform, Code2, Database } from 'lucide-react';
import { AudioEngine } from './AudioEngine';
import type { InputSource, SourceType } from './AudioEngine';
import { MIDIController } from './MIDIController';
import VultEditor from './VultEditor';
import ScopeView from './ScopeView';
import LLMPane from './LLMPane';
import VirtualMIDI from './VirtualMIDI';
import StateInspector from './StateInspector';
import './App.css';

const PRESETS: Record<string, string> = {
  "Biquad Filter": `fun biquad(x0: real, b0: real, b1: real, b2: real, a1: real, a2: real) : real {
  mem w1, w2;
  val w0 = x0 - a1 * w1 - a2 * w2;
  val y0 = b0 * w0 + b1 * w1 + b2 * w2;
  w2, w1 = w1, w0;
  return y0;
}

fun process(input: real) : real {
  mem cutoff_cc;
  val fc = cutoff_cc * 0.5 + 0.01;
  val b0 = fc; val b1 = fc; val b2 = 0.0;
  val a1 = -0.5; val a2 = 0.0;
  return biquad(input, b0, b1, b2, a1, a2);
}

fun noteOn(note: int, velocity: int, channel: int) { }
fun noteOff(note: int, channel: int) { }

fun controlChange(control: int, value: int, channel: int) {
  mem cutoff_cc;
  if (control == 30) {
    cutoff_cc = real(value) / 127.0;
  }
}
`,
  "Simple Volume": `fun process(input: real, volume: real) : real {
  return input * volume;
}
`,
  "vs20": `// POLYPHONIC MS-20 SYNTHESIZER
fun pitchToRate(pitch: real) : real @[table(size=127,min=0.0,max=127.0)] {
    return 8.1757989156 * exp(0.05776226505 * pitch) / 44100.0;
}

fun noise() : real {
    mem seed: int;
    if (seed == 0) { seed = 1; }
    seed = (seed * 25173 + 13849) % 65536;
    return (real(seed) / 65536.0) * 2.0 - 1.0;
}

fun ms20_mg(rate_cv: real, shape: real) : real {
    mem phase: real;
    val freq = 0.1 + rate_cv * 19.9; 
    val inc = freq / 44100.0;
    phase = (phase + inc) % 1.0;
    val tri_out = 0.0;
    val skew = clip(shape, 0.01, 0.99); 
    if (phase < skew) { tri_out = phase / skew; } else { tri_out = 1.0 - ((phase - skew) / (1.0 - skew)); }
    return (tri_out * 2.0 - 1.0);
}

fun ms20_vco(cv: real, wave: int, pw: real, ext_in: real) : real {
    mem phase: real;
    val rate = pitchToRate(clip(cv, 0.0, 127.0));
    phase = (phase + rate) % 1.0;
    val out = 0.0;
    if (wave == 0) {
        if (phase < 0.5) { out = phase * 4.0 - 1.0; } else { out = 3.0 - phase * 4.0; }
    } else if (wave == 1) { out = phase * 2.0 - 1.0; }
    else if (wave == 2) { if (phase < pw) { out = 1.0; } else { out = -1.0; } }
    else if (wave == 3) { val sq = 0.0; if (phase < 0.5) { sq = 1.0; } else { sq = -1.0; } out = ext_in * sq; }
    return out;
}

fun ms20_filter(in_sig: real, cv: real, res: real, is_hpf: bool) : real {
    mem d1: real; mem d2: real;
    val fc = clip(cv, 0.0, 127.0);
    val f = clip(pitchToRate(fc) * 3.14159265, 0.0001, 0.99); 
    val r = clip(res, 0.0, 1.0) * 2.0;
    val fb = r * tanh(d2); 
    val hp = (in_sig - d1 - fb) / (1.0 + f);
    val bp = d1 + f * hp;
    val lp = d2 + f * bp;
    d1, d2 = bp + f * hp, lp + f * bp; 
    return if is_hpf then hp else lp;
}

fun ms20_eg1(gate: bool, delay_cv: real, a_cv: real, r_cv: real) : real {
    mem state: int; mem env_val: real; mem timer: real;
    if (gate && state == 0) { state = 1; timer = 0.0; }
    if (!gate && state > 0) { state = 3; }
    val d_time = delay_cv * 2.0; 
    val a_rate = 1.0 / (0.001 + a_cv * 5.0 * 44100.0);
    val r_rate = 1.0 / (0.001 + r_cv * 5.0 * 44100.0);
    if (state == 1) { timer = timer + (1.0 / 44100.0); if (timer >= d_time) { state = 2; } }
    else if (state == 2) { env_val = env_val + a_rate; if (env_val >= 1.0) { env_val = 1.0; } }
    else if (state == 3) { env_val = env_val - r_rate; if (env_val <= 0.0) { env_val = 0.0; state = 0; } }
    return env_val;
}

fun ms20_eg2(gate: bool, hold_cv: real, a_cv: real, d_cv: real, s_cv: real, r_cv: real) : real {
    mem state: int; mem env_val: real; mem timer: real;
    if (gate && state == 0) { state = 1; timer = 0.0; }
    timer = timer + (1.0 / 44100.0);
    val hold_time = hold_cv * 3.0;
    val effective_gate = gate || (timer < hold_time);
    if (!effective_gate && state > 0 && state < 4) { state = 4; }
    val a_rate = 1.0 / (0.001 + a_cv * 5.0 * 44100.0);
    val d_rate = 1.0 / (0.001 + d_cv * 5.0 * 44100.0);
    val r_rate = 1.0 / (0.001 + r_cv * 5.0 * 44100.0);
    if (state == 1) { env_val = env_val + a_rate; if (env_val >= 1.0) { env_val = 1.0; state = 2; } }
    else if (state == 2) { env_val = env_val - d_rate; if (env_val <= s_cv) { env_val = s_cv; state = 3; } }
    else if (state == 3) { env_val = s_cv; }
    else if (state == 4) { env_val = env_val - r_rate; if (env_val <= 0.0) { env_val = 0.0; state = 0; } }
    return env_val;
}

fun ms20_voice(gate: bool, note: real, pb: real, mg_rate: real, mg_shape: real, v1_wave: int, v1_pw: real, v1_scale: real, v2_wave: int, v2_pitch: real, mix1: real, mix2: real, hp_c: real, hp_res: real, lp_c: real, lp_res: real, eg1_d: real, eg1_a: real, eg1_r: real, eg2_h: real, eg2_a: real, eg2_d: real, eg2_s: real, eg2_r: real, mod_mg_pitch: real, mod_mg_vcf: real, mod_eg2_vcf: real) : real {
    val mg_tri = ms20_mg(mg_rate, mg_shape);
    val eg1 = ms20_eg1(gate, eg1_d, eg1_a, eg1_r);
    val eg2 = ms20_eg2(gate, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r);
    val cv_pitch = note + (pb * 2.0) + (mg_tri * mod_mg_pitch * 12.0);
    val v1_out = if v1_wave == 3 then noise() else ms20_vco(cv_pitch + v1_scale, v1_wave, v1_pw, 0.0);
    val v2_out = ms20_vco(cv_pitch + v2_pitch, v2_wave, 0.5, ms20_vco(cv_pitch + v1_scale, 2, v1_pw, 0.0)); 
    val mixer = (v1_out * mix1) + (v2_out * mix2);
    val vcf_mod = (mg_tri * mod_mg_vcf * 24.0) + (eg2 * mod_eg2_vcf * 48.0);
    return ms20_filter(ms20_filter(mixer, hp_c + vcf_mod, hp_res, true), lp_c + vcf_mod, lp_res, false) * eg2;
}

fun process(input: real) : real {
    mem n1, n2, n3, n4: real;
    mem g1, g2, g3, g4: bool;
    mem pb, mg_rate, mg_shape, v1_pw, v1_scale, v2_pitch, mix1, mix2, hp_c, hp_res, lp_c, lp_res, eg1_d, eg1_a, eg1_r, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r, mod_mg_pitch, mod_mg_vcf, mod_eg2_vcf: real;
    mem v1_wave, v2_wave: int;
    
    val out1 = ms20_voice(g1, n1, pb, mg_rate, mg_shape, v1_wave, v1_pw, v1_scale, v2_wave, v2_pitch, mix1, mix2, hp_c, hp_res, lp_c, lp_res, eg1_d, eg1_a, eg1_r, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r, mod_mg_pitch, mod_mg_vcf, mod_eg2_vcf);
    val out2 = ms20_voice(g2, n2, pb, mg_rate, mg_shape, v1_wave, v1_pw, v1_scale, v2_wave, v2_pitch, mix1, mix2, hp_c, hp_res, lp_c, lp_res, eg1_d, eg1_a, eg1_r, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r, mod_mg_pitch, mod_mg_vcf, mod_eg2_vcf);
    val out3 = ms20_voice(g3, n3, pb, mg_rate, mg_shape, v1_wave, v1_pw, v1_scale, v2_wave, v2_pitch, mix1, mix2, hp_c, hp_res, lp_c, lp_res, eg1_d, eg1_a, eg1_r, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r, mod_mg_pitch, mod_mg_vcf, mod_eg2_vcf);
    val out4 = ms20_voice(g4, n4, pb, mg_rate, mg_shape, v1_wave, v1_pw, v1_scale, v2_wave, v2_pitch, mix1, mix2, hp_c, hp_res, lp_c, lp_res, eg1_d, eg1_a, eg1_r, eg2_h, eg2_a, eg2_d, eg2_s, eg2_r, mod_mg_pitch, mod_mg_vcf, mod_eg2_vcf);
    
    return (out1 + out2 + out3 + out4) * 0.25; 
}

and noteOn(note: int, velocity: int, channel: int) {
    val rnote = real(note);
    if (!g1) { n1 = rnote; g1 = true; }
    else if (!g2) { n2 = rnote; g2 = true; }
    else if (!g3) { n3 = rnote; g3 = true; }
    else if (!g4) { n4 = rnote; g4 = true; }
    else { n1 = rnote; g1 = true; } 
}

and noteOff(note: int, channel: int) {
    val rnote = real(note);
    if (n1 == rnote) { g1 = false; }
    if (n2 == rnote) { g2 = false; }
    if (n3 == rnote) { g3 = false; }
    if (n4 == rnote) { g4 = false; }
}

and controlChange(control: int, value: int, channel: int) {
    val v = real(value) / 127.0;
    if (control == 30) { v1_wave = int(v * 3.99); }
    else if (control == 31) { v1_pw = v; }
    else if (control == 32) { v2_wave = int(v * 3.99); }
    else if (control == 33) { v2_pitch = (v * 48.0) - 24.0; }
    else if (control == 34) { mix1 = v; }
    else if (control == 35) { mix2 = v; }
    else if (control == 36) { hp_c = v * 127.0; }
    else if (control == 37) { hp_res = v; }
    else if (control == 38) { lp_c = v * 127.0; }
    else if (control == 39) { lp_res = v; }
    else if (control == 40) { mod_eg2_vcf = v; }
    else if (control == 41) { mg_rate = v; }
}

and default() {
    g1 = false; g2 = false; g3 = false; g4 = false;
    n1 = 60.0; n2 = 60.0; n3 = 60.0; n4 = 60.0;
    pb = 0.0; mg_rate = 0.6; mg_shape = 0.5;
    v1_wave = 1; v1_pw = 0.5; v1_scale = 0.0;
    v2_wave = 2; v2_pitch = -12.05;
    mix1 = 0.6; mix2 = 0.6;
    hp_c = 24.0; hp_res = 0.65;
    lp_c = 40.0; lp_res = 0.75;
    eg1_d = 0.0; eg1_a = 0.0; eg1_r = 0.1;
    eg2_h = 0.0; eg2_a = 0.02; eg2_d = 0.3; eg2_s = 0.2; eg2_r = 0.1;
    mod_mg_pitch = 0.0; mod_mg_vcf = 0.0; mod_eg2_vcf = 0.65;
}
`
};

const SYSTEM_PROMPT = `
Role: Audio DSP Developer specialized in Vult. 
Entry: 'fun process(input: real, ...) : real'.
`;

const App: React.FC = () => {
  const [code, setCode] = useState(PRESETS["Biquad Filter"]);
  const [projectName, setProjectName] = useState("My Vult Project");
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [midiStatus, setMidiStatus] = useState('MIDI: Off');
  const [editorMarkers, setEditorMarkers] = useState<any[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [activeProbes, setActiveProbes] = useState<string[]>([]);
  
  const [inputs, setInputs] = useState<InputSource[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [midiInputs, setMidiInputs] = useState<any[]>([]);
  const [selectedMidiInput, setSelectedMidiInput] = useState<string>('all');
  
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
  const midiControllerRef = useRef<MIDIController | null>(null);
  const skipNextUpdateRef = useRef(false);

  const parseVultInputs = useCallback((vultCode: string) => {
    const match = vultCode.match(/fun\s+process\s*\(([^)]*)\)/);
    if (!match) return [];
    const params = match[1].split(',').map(arg => {
      const parts = arg.trim().split(':');
      return parts[0].trim();
    }).filter(n => n.length > 0);

    return params.map((name, i) => ({
      name,
      type: (i === 0) ? 'oscillator' : 'cv' as SourceType,
      freq: 440,
      value: 0.5,
      oscType: 'sine' as const
    }));
  }, []);

  useEffect(() => {
    const startup = async () => {
      try {
        const lastSession = localStorage.getItem('vult_session_code');
        const lastProjectName = localStorage.getItem('vult_session_name');
        
        let startCode = code;
        if (lastSession) {
          startCode = lastSession;
          setCode(lastSession);
        }
        
        setInputs(parseVultInputs(startCode));
        if (lastProjectName) setProjectName(lastProjectName);
        
        const projectsRaw = localStorage.getItem('vult_projects');
        if (projectsRaw) setSavedProjects(Object.keys(JSON.parse(projectsRaw)));
      } catch (err) {}

      const ae = audioEngineRef.current;
      midiControllerRef.current = new MIDIController(
        (n, v) => ae.sendNoteOn(n, v),
        (n) => ae.sendNoteOff(n),
        (c, v) => ae.sendControlChange(c, v),
        (s) => setMidiStatus(s)
      );
      await midiControllerRef.current.init();
      setMidiInputs(midiControllerRef.current?.getInputs() || []);
      ae.getDevices().then(setAudioDevices);
    };

    startup();
    return () => { audioEngineRef.current.stop(); };
  }, []);

  useEffect(() => {
    audioEngineRef.current.setSources(inputs);
  }, [inputs]);

  const handleTogglePlay = async () => {
    const ae = audioEngineRef.current;
    if (ae.getIsPlaying()) { ae.stop(); setIsPlaying(false); }
    else {
      await ae.start();
      const result = await ae.updateCode(code);
      if (result.success) {
        setStatus('Running');
        ae.setProbes(activeProbes);
      }
      else setStatus('Compile Error');
      setIsPlaying(true);
    }
  };

  const handleCodeChange = async (value: string | undefined) => {
    if (value === undefined) return;
    if (skipNextUpdateRef.current) {
      skipNextUpdateRef.current = false;
      return;
    }

    setCode(value);
    localStorage.setItem('vult_session_code', value);
    
    const newInputs = parseVultInputs(value);
    setInputs(prev => {
      if (prev.length === newInputs.length && prev.every((v, i) => v.name === newInputs[i].name)) {
        return prev;
      }
      return newInputs;
    });

    if (isPlaying) {
      const result = await audioEngineRef.current.updateCode(value);
      if (!result.success) {
        setStatus(`Compile Error`);
        const lineMatch = result.error.match(/line (\d+)/);
        if (lineMatch) {
          const line = parseInt(lineMatch[1]);
          setEditorMarkers([{
            startLineNumber: line,
            endLineNumber: line,
            startColumn: 1,
            endColumn: 100,
            message: result.error,
            severity: 8
          }]);
        }
      } else {
        setStatus('Running');
        setEditorMarkers([]);
      }
    }
  };

  const updateInput = (idx: number, patch: Partial<InputSource>) => {
    setInputs(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const toggleProbe = (name: string) => {
    setActiveProbes(prev => {
      const next = prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name].slice(-1);
      audioEngineRef.current.setProbes(next);
      return next;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setInputs(prev => prev.map(input => {
        if (input.type === 'cv' && input.isCycling) {
          const newValue = (Math.sin(Date.now() * 0.002) + 1) / 2;
          return { ...input, value: newValue };
        }
        return input;
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    const projects = JSON.parse(localStorage.getItem('vult_projects') || '{}');
    projects[projectName] = code;
    localStorage.setItem('vult_projects', JSON.stringify(projects));
    setSavedProjects(Object.keys(projects));
    setStatus('Saved');
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.vult`;
    a.click();
  };

  const handleExportCPP = async () => {
    setStatus('Generating C++...');
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, target: 'cpp' })
      });
      const data = await response.json();
      if (data.code) {
        const blob = new Blob([data.code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, '_')}.cpp`;
        a.click();
        setStatus('C++ Exported');
      } else {
        setStatus('Export Failed');
      }
    } catch (e) {
      setStatus('Network Error');
    }
  };

  const loadPreset = (name: string) => {
    const presetCode = PRESETS[name];
    if (presetCode) {
      skipNextUpdateRef.current = false;
      handleCodeChange(presetCode);
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo"><Zap color="#ffcc00" size={24} /><span>VULT</span></div>
        <div className="nav-item active" title="IDE"><Cpu size={18} /></div>
        <div className="nav-item" title="Save" onClick={handleSave}><Save size={18} /></div>
        <div className="nav-item" title="Download Vult" onClick={handleDownload}><Download size={18} /></div>
        <div className="nav-item" title="Export C++" onClick={handleExportCPP}><Code2 size={18} /></div>
        <div className={`nav-item ${showInspector ? 'active' : ''}`} title="State Inspector" onClick={() => setShowInspector(!showInspector)}><Database size={18} /></div>
        <div className="spacer" />
        <div className="midi-status-circle" title={midiStatus} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00ff00', marginBottom: '20px' }} />
      </div>

      <div className="main-content">
        <div className="toolbar">
          <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#ffcc00', fontWeight: 'bold', width: '120px' }} />
          <button className={`play-btn ${isPlaying ? 'playing' : ''}`} onClick={handleTogglePlay}>
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {isPlaying ? 'STOP' : 'RUN'}
          </button>
          
          <div className="divider" />
          
          <div className="control-group">
            <span className="label">PRESET</span>
            <select value="" onChange={(e) => loadPreset(e.target.value)}>
              <option value="" disabled>Load...</option>
              {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="control-group">
            <span className="label">MIDI</span>
            <select value={selectedMidiInput} onChange={(e) => {
              setSelectedMidiInput(e.target.value);
              midiControllerRef.current?.setInput(e.target.value === 'all' ? null : e.target.value);
            }}>
              <option value="all">All</option>
              {midiInputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div className="control-group">
            <span className="label">SAVED</span>
            <select value="" onChange={(e) => handleCodeChange(JSON.parse(localStorage.getItem('vult_projects') || '{}')[e.target.value])}>
              <option value="" disabled>Open...</option>
              {savedProjects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="spacer" />
          <div className="status-badge"><Activity size={14} />{status}</div>
        </div>

        <div className="editor-layout">
          <div className="editor-container">
            <div className="editor-wrapper" style={{ flex: 1, minHeight: 0 }}>
              <VultEditor 
                code={code} 
                onChange={handleCodeChange} 
                markers={editorMarkers} 
                getLiveState={() => audioEngineRef.current.getLiveState()}
              />
            </div>
            
            <div className="dsp-lab">
              <div className="section-title"><Sliders size={12} /> DSP LAB / INPUT ROUTING</div>
              <div className="input-strips">
                {inputs.map((input, i) => (
                  <div key={i} className="input-strip">
                    <div className="strip-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {input.name}
                      {(input.type === 'impulse' || input.type === 'step') && (
                        <Zap size={10} style={{ cursor: 'pointer', color: '#ffcc00' }} onClick={() => audioEngineRef.current.triggerGenerator(i)} />
                      )}
                    </div>
                    <select value={input.type} onChange={(e) => updateInput(i, { type: e.target.value as SourceType })}>
                      <option value="oscillator">Oscillator</option>
                      <option value="live">Live Audio</option>
                      <option value="cv">CV Slider</option>
                      <option value="impulse">Impulse</option>
                      <option value="step">Step</option>
                      <option value="sweep">Sweep</option>
                      <option value="test_noise">Test Noise</option>
                      <option value="silence">Silence</option>
                    </select>
                    
                    {input.type === 'oscillator' && (
                      <div className="strip-controls">
                        <select value={input.oscType} onChange={(e) => updateInput(i, { oscType: e.target.value as any })}>
                          <option value="sine">Sine</option>
                          <option value="sawtooth">Saw</option>
                          <option value="square">Square</option>
                          <option value="triangle">Tri</option>
                        </select>
                        <input type="number" value={input.freq} onChange={(e) => updateInput(i, { freq: parseFloat(e.target.value) })} style={{ width: '45px' }} />
                      </div>
                    )}
                    
                    {input.type === 'cv' && (
                      <div className="strip-controls" style={{ alignItems: 'center' }}>
                        <input type="range" min="0" max="1" step="0.01" value={input.value} onChange={(e) => updateInput(i, { value: parseFloat(e.target.value) })} />
                        <Activity 
                          size={12} 
                          style={{ cursor: "pointer", color: input.isCycling ? "#00ff00" : "#444" }} 
                          onClick={() => updateInput(i, { isCycling: !input.isCycling })}
                        />
                      </div>
                    )}
                    
                    {input.type === 'sweep' && (
                      <div className="strip-controls">
                        <input type="number" value={input.value} step="0.1" onChange={(e) => updateInput(i, { value: parseFloat(e.target.value) })} placeholder="Sec" />
                        <Play size={10} style={{ cursor: 'pointer', color: '#ffcc00' }} onClick={() => audioEngineRef.current.triggerGenerator(i)} />
                      </div>
                    )}

                    {input.type === 'live' && (
                      <select value={input.deviceId} onChange={(e) => updateInput(i, { deviceId: e.target.value })}>
                        {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Input'}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <VirtualMIDI 
              onCC={(cc, val) => audioEngineRef.current.sendControlChange(cc, val, 0)}
              onNoteOn={(note, vel) => audioEngineRef.current.sendNoteOn(note, vel, 0)}
              onNoteOff={(note) => audioEngineRef.current.sendNoteOff(note, 0)}
            />
          </div>
          
          <div className="side-panel">
            <div className="scope-section">
              <div className="section-title"><AudioWaveform size={12} /> DUAL-TRACE ANALYZER</div>
              <ScopeView 
                getScopeData={() => audioEngineRef.current.getScopeData()} 
                getSpectrumData={() => audioEngineRef.current.getSpectrumData()} 
                getProbedData={(name) => audioEngineRef.current.getProbedStates()[name] || null}
                probes={activeProbes}
              />
            </div>
            <div className="llm-section">
              {showInspector ? (
                <StateInspector 
                  getLiveState={() => audioEngineRef.current.getLiveState()} 
                  onProbe={toggleProbe}
                  activeProbes={activeProbes}
                />
              ) : (
                <LLMPane onGenerateCode={handleCodeChange} systemPrompt={SYSTEM_PROMPT} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
