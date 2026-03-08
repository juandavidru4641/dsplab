import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Cpu, Zap, Activity, Save, Download, Sliders, AudioWaveform, Code2, Database, History } from 'lucide-react';
import { AudioEngine } from './AudioEngine';
import type { InputSource, SourceType } from './AudioEngine';
import { MIDIController } from './MIDIController';
import VultEditor from './VultEditor';
import ScopeView from './ScopeView';
import LLMPane from './LLMPane';
import VirtualMIDI from './VirtualMIDI';
import StateInspector from './StateInspector';
import MultiScopeView from './MultiScopeView';
import { Knob } from './Knob';
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
  "Minimal": `fun process(input: real) : real {
  return input;
}

and noteOn(note: int, velocity: int, channel: int) {
}

and noteOff(note: int, channel: int) {
}

and controlChange(control: int, value: int, channel: int) {
}

and default() {
}
`,
  "vs80": `// --- 1. UTILITIES & MATH ---
fun pitchToRate(pitch: real) : real @[table(size=127,min=0.0,max=127.0)] {
    return 8.1757989156 * exp(0.05776226505 * pitch) / 44100.0;
}

// Anti-aliasing polynomial (PolyBLEP)
fun polyblep(phase: real, inc: real) : real {
    val t = phase / inc;
    if (t < 1.0) { 
        return t + t - t * t - 1.0; 
    } else if (t > (1.0 / inc) - 1.0) {
        val t2 = (t - (1.0 / inc));
        return t2 * t2 + t2 + t2 + 1.0;
    }
    return 0.0;
}

fun wrap_idx(idx_raw: int) : int {
    val out = 0;
    if (idx_raw < 0) { out = idx_raw + 1024; } else { out = idx_raw; }
    return out;
}

// --- 2. CS-80 CORE COMPONENTS ---

// Global LFO for PWM and Vibrato
fun cs80_lfo(rate: real) : real {
    mem phase: real;
    val inc = (0.1 + rate * 15.0) / 44100.0;
    phase = phase + inc;
    if (phase >= 1.0) { phase = phase - 1.0; }
    
    val out = 0.0;
    if (phase < 0.5) { out = phase * 4.0 - 1.0; } 
    else { out = 3.0 - phase * 4.0; }
    return out;
}

// CS-80 Oscillator - advances phase and returns the complex (Saw+Square) output.
// MUST be called before cs80_vco_sine each sample, as it advances the shared phase.
fun cs80_vco_complex(cv: real, pwm_base: real, pwm_mod: real) : real {
    mem phase: real;
    val inc = pitchToRate(clip(cv, 0.0, 127.0));
    
    phase = phase + inc;
    if (phase >= 1.0) { phase = phase - 1.0; }
    
    // 1. Anti-Aliased Sawtooth
    val saw = (1.0 - 2.0 * phase) + polyblep(phase, inc);
    
    // 2. Anti-Aliased Square / PWM
    val pw = clip(pwm_base + pwm_mod, 0.05, 0.95);
    val p2 = phase + 1.0 - pw;
    val p2_wrapped = 0.0;
    if (p2 >= 1.0) { p2_wrapped = p2 - 1.0; } else { p2_wrapped = p2; }
    
    val naive_sq = 0.0;
    if (phase < pw) { naive_sq = 1.0; } else { naive_sq = -1.0; }
    val sqr = naive_sq + polyblep(phase, inc) - polyblep(p2_wrapped, inc);
    
    return (saw + sqr) * 0.5;
}

// CS-80 Oscillator - returns the Pure Sine output from the SAME phase memory
// as cs80_vco_complex. Call this AFTER cs80_vco_complex each sample.
// The mem phase here refers to the same instance's phase when called on
// the same voice context. Both functions share state per-voice via Vult's
// instance model when called inside cs80_voice.
fun cs80_vco_sine(cv: real) : real {
    mem phase: real;
    // Phase is already advanced by cs80_vco_complex — just read it.
    // Pure Sine Wave (The secret to the CS-80's massive weight)
    return sin(phase * 6.2831853);
}

// Zero-Delay Feedback (ZDF) State Variable Filter (12dB/Octave)
// The CS-80 uses a 12dB HPF chained directly into a 12dB LPF.
fun cs80_svf(in_sig: real, cv: real, res: real, is_hp: bool) : real {
    mem ic1eq: real; 
    mem ic2eq: real;
    
    val g = clip(pitchToRate(cv) * 3.14159 * 2.0, 0.001, 0.99);
    val k = 2.0 - (clip(res, 0.0, 1.0) * 1.9); // Damping factor (High res = low k)
    
    val a1 = 1.0 / (1.0 + g * (g + k));
    val a2 = g * a1;
    val a3 = g * a2;
    
    val v3 = in_sig - ic2eq;
    val v1 = a1 * ic1eq + a2 * v3;
    val v2 = ic2eq + a2 * ic1eq + a3 * v3;
    
    ic1eq = 2.0 * v1 - ic1eq;
    ic2eq = 2.0 * v2 - ic2eq;
    
    val hp = in_sig - k * v1 - v2;
    val lp = v2;
    
    val out = 0.0;
    if (is_hp == true) { out = hp; } else { out = lp; }
    
    // Gentle analog saturation to prevent SVF blowup
    return tanh(out * 1.2); 
}

// Punchy Exponential Envelope
fun cs80_eg(gate: bool, a_cv: real, d_cv: real, s_cv: real, r_cv: real) : real {
    mem state: int; mem env_val: real; mem prev_gate: bool;
    
    if (gate == true && prev_gate == false) { state = 1; }
    if (gate == false && prev_gate == true) { state = 4; }
    prev_gate = gate;
    
    if (state == 1) { 
        env_val = env_val + (1.0 / (0.001 + a_cv * 2.0 * 44100.0));
        if (env_val >= 1.0) { env_val = 1.0; state = 2; }
    } else if (state == 2) { 
        env_val = env_val - (1.0 / (0.001 + d_cv * 2.0 * 44100.0));
        if (env_val <= s_cv) { env_val = s_cv; state = 3; }
    } else if (state == 3) { 
        if (env_val > s_cv) { env_val = env_val - 0.001; }
        if (env_val < s_cv) { env_val = env_val + 0.001; }
    } else if (state == 4) { 
        env_val = env_val - (1.0 / (0.001 + r_cv * 3.0 * 44100.0));
        if (env_val <= 0.0) { env_val = 0.0; state = 0; }
    } else {
        env_val = 0.0;
    }
    
    return env_val * env_val; // Exponential curve
}

// The Famous Blade Runner Ring Modulator (Per-Voice for expression)
fun cs80_ringmod(in_sig: real, env: real, depth: real, speed_base: real, speed_env_amt: real) : real {
    mem rm_phase: real;
    
    // Envelope drives the speed of the ring modulation sweep
    val current_speed = speed_base + (env * speed_env_amt * 80.0);
    val inc = current_speed / 44100.0;
    
    rm_phase = rm_phase + inc;
    if (rm_phase >= 1.0) { rm_phase = rm_phase - 1.0; }
    
    val rm_osc = sin(rm_phase * 6.2831853);
    
    // Blend dry signal with amplitude-modulated (Ring Mod) signal
    val dry = in_sig * (1.0 - depth);
    val wet = (in_sig * rm_osc) * depth;
    
    return dry + wet;
}

// --- 3. VOICE ARCHITECTURE & FX ---

fun cs80_voice(
    gate: bool, note: real, pb: real, lfo_val: real,
    saw_sqr_mix: real, sine_lvl: real, pwm_amt: real,
    hp_c: real, hp_res: real, lp_c: real, lp_res: real, filter_eg_amt: real,
    eg_a: real, eg_d: real, eg_s: real, eg_r: real,
    rm_depth: real, rm_speed: real, rm_env: real
) : real {
    
    val env = cs80_eg(gate, eg_a, eg_d, eg_s, eg_r);
    
    // Minor analog pitch instability
    val analog_drift = sin(note * 13.0) * 0.05; 
    val pitch = note + pb + analog_drift;
    
    // FIX: Split tuple return into two separate calls.
    // cs80_vco_complex advances phase; cs80_vco_sine reads the same phase.
    val complex_osc = cs80_vco_complex(pitch, 0.5, lfo_val * pwm_amt);
    val pure_sine   = cs80_vco_sine(pitch);
    
    // Filter Cascade: Complex Osc -> 12dB HPF -> 12dB LPF
    val cutoff_mod = (env * filter_eg_amt * 48.0);
    val hpf_out = cs80_svf(complex_osc * saw_sqr_mix, hp_c + (cutoff_mod * 0.5), hp_res, true);
    val lpf_out = cs80_svf(hpf_out, lp_c + cutoff_mod, lp_res, false);
    
    // THE CS-80 SECRET: Add the pure Sine wave directly to the VCA, bypassing the filters!
    val mixed_vca_in = lpf_out + (pure_sine * sine_lvl);
    
    // VCA
    val vca_out = mixed_vca_in * env;
    
    // Ring Modulator
    val final_out = cs80_ringmod(vca_out, env, rm_depth, rm_speed, rm_env);
    
    return final_out;
}

// CS-80 Symphonic Chorus & Tremolo
fun symphonic_chorus(in_sig: real, on: bool) : real {
    mem b1: array(real, 1024); 
    mem pos: int; 
    mem lfo_ph: real;
    
    if (on == false) { return in_sig; }
    
    pos = (pos + 1) % 1024;
    b1[pos] = in_sig;
    
    // 2.5 Hz lush sweep
    lfo_ph = lfo_ph + (2.5 / 44100.0);
    if (lfo_ph >= 1.0) { lfo_ph = lfo_ph - 1.0; }
    
    val sine1 = sin(lfo_ph * 6.28318);
    val sine2 = sin((lfo_ph + 0.5) * 6.28318); // 180 degree offset
    
    // Delay Time Modulation (Chorus)
    val tap1 = b1[wrap_idx(pos - 150 - int(sine1 * 35.0))];
    val tap2 = b1[wrap_idx(pos - 150 - int(sine2 * 35.0))];
    
    // Amplitude Modulation (Tremolo - subtle)
    val trem1 = 0.8 + (sine1 * 0.2);
    val trem2 = 0.8 + (sine2 * 0.2);
    
    return (in_sig * 0.4) + (tap1 * trem1 * 0.3) + (tap2 * trem2 * 0.3);
}

// --- 4. 6-VOICE HOST INTERFACE ---

fun process(input: real) : real {
    mem n1: real; mem g1: bool; 
    mem n2: real; mem g2: bool;
    mem n3: real; mem g3: bool; 
    mem n4: real; mem g4: bool;
    mem n5: real; mem g5: bool; 
    mem n6: real; mem g6: bool;
    
    mem pb: real; mem lfo_rate: real;
    mem saw_sqr_mix: real; mem sine_lvl: real; mem pwm_amt: real;
    mem hp_c: real; mem hp_res: real; mem lp_c: real; mem lp_res: real; mem eg_f: real;
    mem eg_a: real; mem eg_d: real; mem eg_s: real; mem eg_r: real;
    mem rm_depth: real; mem rm_speed: real; mem rm_env: real;
    mem symph_on: bool;

    val lfo = cs80_lfo(lfo_rate);

    val o1 = cs80_voice(g1, n1, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    val o2 = cs80_voice(g2, n2, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    val o3 = cs80_voice(g3, n3, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    val o4 = cs80_voice(g4, n4, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    val o5 = cs80_voice(g5, n5, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    val o6 = cs80_voice(g6, n6, pb, lfo, saw_sqr_mix, sine_lvl, pwm_amt, hp_c, hp_res, lp_c, lp_res, eg_f, eg_a, eg_d, eg_s, eg_r, rm_depth, rm_speed, rm_env);
    
    val dry = tanh((o1 + o2 + o3 + o4 + o5 + o6) * 0.25);
    
    return symphonic_chorus(dry, symph_on);
}

and noteOn(n: int, v: int, ch: int) {
    val rn = real(n);
    if (g1 == false) { n1 = rn; g1 = true; } 
    else if (g2 == false) { n2 = rn; g2 = true; }
    else if (g3 == false) { n3 = rn; g3 = true; }
    else if (g4 == false) { n4 = rn; g4 = true; }
    else if (g5 == false) { n5 = rn; g5 = true; }
    else if (g6 == false) { n6 = rn; g6 = true; }
    else { n1 = rn; g1 = true; } 
}

and noteOff(n: int, ch: int) {
    val rn = real(n);
    if (n1 == rn) { g1 = false; } 
    if (n2 == rn) { g2 = false; }
    if (n3 == rn) { g3 = false; }
    if (n4 == rn) { g4 = false; }
    if (n5 == rn) { g5 = false; }
    if (n6 == rn) { g6 = false; }
}

and controlChange(c: int, v: int, ch: int) {
    val val_norm = real(v) / 127.0;
    
    if (c == 30) { saw_sqr_mix = val_norm; }  // Mix between complex oscillators      
    else if (c == 31) { sine_lvl = val_norm; } // Pure Sine Bypass Volume                 
    else if (c == 32) { pwm_amt = val_norm; }  // PWM Depth                
    else if (c == 35) { lfo_rate = val_norm; } // Global LFO speed
    
    else if (c == 74) { lp_c = val_norm * 127.0; } // 12dB LPF
    else if (c == 71) { lp_res = val_norm; }       
    else if (c == 76) { hp_c = val_norm * 127.0; } // 12dB HPF
    else if (c == 77) { hp_res = val_norm; }       
    else if (c == 40) { eg_f = val_norm; }          // Filter Env Amount
    
    else if (c == 73) { eg_a = val_norm; }                    
    else if (c == 75) { eg_d = val_norm; }                    
    else if (c == 79) { eg_s = val_norm; }                    
    else if (c == 72) { eg_r = val_norm; }                    
    
    else if (c == 80) { rm_depth = val_norm; }        // Ring Modulator Intensity
    else if (c == 81) { rm_speed = val_norm * 40.0; } // Ring Modulator Base Speed
    else if (c == 82) { rm_env = val_norm; }          // Envelope to Ring Mod Speed Sweep
    
    else if (c == 45) { if (v > 64) { symph_on = true; } else { symph_on = false; } } 
}

and default() {
    g1 = false; g2 = false; g3 = false; g4 = false; g5 = false; g6 = false;
    
    // --- "TEARS IN RAIN" PRESET ---
    // The quintessential Vangelis CS-80 Brass. Massive sub-sine weight,
    // swept 12dB filters, and an envelope-driven ring modulation shimmer
    // on the attack of the note. Widened by the Symphonic Chorus.

    saw_sqr_mix = 1.0; sine_lvl = 0.6;           // Heavy Saw/Square mixed with huge Pure Sine
    pwm_amt = 0.02; lfo_rate = 0.15;               // Lush Pulse Width Modulation
    
    hp_c = 30.0; hp_res = 0.4;                   // 12dB HPF cuts extreme mud, adds vocal growl
    lp_c = 45.0; lp_res = 0.2;                   // 12dB LPF starts warm
    eg_f = 0.8;                                  // Envelope sweeps the LPF open
    
    eg_a = 0.01; eg_d = 0.3;                     // Sluggish, majestic brass attack
    eg_s = 0.5; eg_r = 0.35;                     // Lingering, singing release
    
    rm_depth = 0.15;                             // Subtle Ring Mod Shimmer
    rm_speed = 0.2; rm_env = 0.15;                // Envelope sweeps the Ring Mod frequency fast
    
    symph_on = false;                             // SYMPHONIC CHORUS/TREMOLO ENGAGED
}
`
};

const SYSTEM_PROMPT = `
Role: Senior Audio DSP Engineer & Vult Language Expert.
Environment: Professional Real-time IDE with Live Telemetry, 12 CC Knobs (30-41), and 6-voice polyphony.

STRICT VULT LANGUAGE CONSTRAINTS:
1. DO NOT use 'and', 'or', 'not'. Use C-style '&&', '||', '!' operators ONLY.
2. EVERY statement MUST end with a semicolon ';'.
3. Use 'real' for all floating point operations and 'int' for indices/counters.
4. Entry point MUST be 'fun process(input: real, ...) : real'. Additional parameters (knobs) are mapped automatically.

LABORATORY WORKFLOW:
- Read: Use 'get_current_code' for full context or 'list_functions' to quickly map out the architecture and parameter signatures.
- Reference: Use 'get_vult_reference' if you are unsure about syntax, built-in functions, or operator precedence.
- Plan: Use 'write_plan' to document your approach before making complex changes.
- Edit: Use 'apply_diff' for small surgical fixes or 'edit_lines' for block-level changes. Use 'update_code' only for complete rewrites.
- History: Use 'store_snapshot' to save a named restore point before making risky or large changes. 
- Test: Use 'set_knob' or 'send_midi_cc' to manipulate parameters or 'trigger_generator' to test transient response.
- Verify: Use 'get_live_telemetry' for internal state, 'get_spectrum_data' for frequency analysis, and 'get_audio_metrics' to analyze signal quality. 

AUTONOMOUS EXECUTION:
- After calling 'get_current_code', you MUST immediately proceed to the 'Edit' phase. Do not end the turn just to say you have the code. 
- You are in an autonomous loop. Use tool calls sequentially to achieve the goal.
- If you need to make multiple changes, call 'tell' to update the user, then call the editing tools.
- NEVER end a turn until the requested feature is implemented and compiled successfully.

Persistence: If a tool fails (e.g. 'apply_diff' pattern not found), DO NOT give up. Try a different strategy immediately (e.g. 'edit_lines' or 'update_code'). Try at least 3 times with different approaches before asking for help.
Communication: Use 'tell' frequently to inform the user about your progress, findings, and planned next steps. NEVER end a turn abruptly without explaining your state.

COMMUNICATION STYLE:
- Act as a Senior DSP Research Scientist and Mentor. 
- Provide deep technical insights into OCaml-style Vult code generation.
- When the user asks a question, don't just answer; explain the underlying physical or mathematical principles (e.g., Fourier Transform, Z-domain stability, aliasing).
- Be extremely verbose and detailed about your internal state and planned actions.
- Use 'user_message' to provide status updates for complex multi-step operations.
- If a compilation error occurs, perform a detailed post-mortem analysis of the error trace before attempting a fix.
- Always verify your work using 'get_live_telemetry' and 'get_spectrum_data' to ensure the audible result matches your mathematical model.
`;

const App: React.FC = () => {
  const [code, setCode] = useState(PRESETS["vs80"]);
  const [projectName, setProjectName] = useState("My Vult Project");
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [midiStatus, setMidiStatus] = useState('MIDI: Off');
  const [editorMarkers, setEditorMarkers] = useState<any[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [activeProbes, setActiveProbes] = useState<string[]>([]);
  const [diffMode, setDiffMode] = useState(false);
  const [originalCode, setOriginalCode] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [codeHistory, setCodeHistory] = useState<{timestamp: number, code: string, msg: string}[]>([]);
  
  const [inputs, setInputs] = useState<InputSource[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [midiInputs, setMidiInputs] = useState<any[]>([]);
  const [selectedMidiInput, setSelectedMidiInput] = useState<string>('all');
  
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
  const midiControllerRef = useRef<MIDIController | null>(null);
  const skipNextUpdateRef = useRef(false);

  const parseVultCCs = useCallback((vultCode: string) => {
    const ccMap: Record<number, string> = {};
    // Extract CC mapping from if/else logic
    // Pattern: if (c == 30) { param = val; } // Label
    const regex = /(?:if|else\s+if)\s*\(\s*(?:c|control)\s*==\s*(\d+)\s*\)\s*\{?\s*([a-zA-Z_]\w*)\s*=[^;]+;?\s*\}?\s*(?:\/\/+(.*))?/g;
    
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(vultCode)) !== null) {
      const cc = parseInt(match[1]);
      const varName = match[2];
      const comment = match[3]?.trim();
      
      if (varName && !['if', 'else', 'val', 'mem', 'real', 'int', 'bool', 'return'].includes(varName)) {
        ccMap[cc] = comment || varName.toUpperCase();
      }
    }
    
    // Return standard fallback if no CCs found to prevent UI from being empty
    if (Object.keys(ccMap).length === 0) {
      return { 30: 'SAW/SQR', 31: 'SINE LVL', 32: 'PWM AMT', 35: 'LFO RATE' };
    }
    return ccMap;
  }, []);

  const [ccLabels, setCcLabels] = useState<Record<number, string>>({});

  const saveSnapshot = useCallback((msg: string = "Manual Snapshot") => {
    setCodeHistory(prev => {
      // Don't save if identical to last snapshot
      if (prev[0] && prev[0].code === code && msg === "Autosave") return prev;
      const next = [{ timestamp: Date.now(), code, msg }, ...prev].slice(0, 100);
      localStorage.setItem('vult_code_history', JSON.stringify(next));
      return next;
    });
  }, [code]);

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
        const historyRaw = localStorage.getItem('vult_code_history');
        
        if (historyRaw) setCodeHistory(JSON.parse(historyRaw));
        
        let startCode = code;
        if (lastSession) {
          startCode = lastSession;
          setCode(lastSession);
        }
        
        setInputs(parseVultInputs(startCode));
        setCcLabels(parseVultCCs(startCode));
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

      ae.onRuntimeError((err) => {
        setStatus('Runtime Crash');
        console.error("DSP Runtime Crash:", err);
      });
    };

    startup();
    return () => { audioEngineRef.current.stop(); };
  }, []);

  // Autosave Logic
  useEffect(() => {
    const timer = setInterval(() => {
      saveSnapshot("Autosave");
    }, 300000); // Autosave every 5 minutes
    return () => clearInterval(timer);
  }, [saveSnapshot]);

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
        setEditorMarkers([]);
      }
      else {
        setStatus('Compile Error');
        console.error("Vult Compile Error:", result.error);
        const marker = parseVultError(result.error);
        if (marker) {
          setEditorMarkers([marker]);
        }
      }
      setIsPlaying(true);
    }
  };

  const parseVultError = (errorStr: string) => {
    const lineMatch = errorStr.match(/line (\d+)/i);
    const colMatch = errorStr.match(/column (\d+)/i) || errorStr.match(/characters (\d+)/i);
    
    if (lineMatch) {
      const line = parseInt(lineMatch[1]);
      const col = colMatch ? parseInt(colMatch[1]) : 1;
      return {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: col,
        endColumn: col + 1,
        message: errorStr.replace(/Errors in the program:\\s*/, '').trim(),
        severity: 8
      };
    }
    return null;
  };

  const handleCodeChange = async (value: string | undefined) => {
    if (value === undefined) return;
    if (skipNextUpdateRef.current) {
      skipNextUpdateRef.current = false;
      return;
    }

    setCode(value);
    localStorage.setItem('vult_session_code', value);
    
    setCcLabels(parseVultCCs(value));
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
        const marker = parseVultError(result.error);
        if (marker) {
          setEditorMarkers([marker]);
        } else {
          setEditorMarkers([]);
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
      const next = prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name].slice(-6);
      audioEngineRef.current.setProbes(next);
      return next;
    });
  };

  const handleSampleUpload = async (idx: number, file: File) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const floatData = audioBuffer.getChannelData(0); // Mono for now
    audioEngineRef.current.setSampleData(idx, floatData);
    updateInput(idx, { name: file.name.split('.')[0] });
    ctx.close(); // Clean up
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
    saveSnapshot("Manual Project Save");
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

  const handleAgentUpdateCode = async (newCode: string) => {
    // Capture the original stable code before the agent's first attempt
    if (!diffMode) {
      setOriginalCode(code);
    }

    // Update code immediately so agent sees its work and markers align
    setCode(newCode);
    
    // Trial compilation to give agent feedback
    const result = await audioEngineRef.current.updateCode(newCode);
    
    if (result.success) {
      saveSnapshot("Agent Update");
      setDiffMode(true); // Only show side-by-side diff after success
      setEditorMarkers([]);
      setStatus('Trial Compile OK');
      return { success: true, message: "Code compiled successfully. Waiting for user to ACCEPT changes." };
    } else {
      setDiffMode(false); // Stay in/revert to standard editor on failure
      const marker = parseVultError(result.error);
      if (marker) setEditorMarkers([marker]);
      setStatus('Compile Error');
      return { success: false, error: result.error };
    }
  };

  const handleAcceptDiff = async () => {
    const newCode = code;
    localStorage.setItem('vult_session_code', newCode);
    
    const newInputs = parseVultInputs(newCode);
    setInputs(newInputs);

    if (isPlaying) {
      const result = await audioEngineRef.current.updateCode(newCode);
      if (result.success) {
        setStatus('Running');
        setEditorMarkers([]);
      } else {
        setStatus('Compile Error');
        const marker = parseVultError(result.error);
        if (marker) setEditorMarkers([marker]);
      }
    }
    setDiffMode(false);
    setOriginalCode('');
  };

  const handleRejectDiff = () => {
    setCode(originalCode);
    setDiffMode(false);
    setOriginalCode('');
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo"><Zap color="#ffcc00" size={24} /><span>VULT</span></div>
        <div className="nav-item active" title="IDE"><Cpu size={18} /></div>
        <div className="nav-item" title="Save" onClick={handleSave}><Save size={18} /></div>
        <div className="nav-item" title="Download Vult" onClick={handleDownload}><Download size={18} /></div>
        <div className="nav-item" title="Export C++" onClick={handleExportCPP}><Code2 size={18} /></div>
        <div className={`nav-item ${showHistory ? 'active' : ''}`} title="History" onClick={() => { setShowHistory(!showHistory); setShowInspector(false); }}><History size={18} /></div>
        <div className={`nav-item ${showInspector ? 'active' : ''}`} title="State Inspector" onClick={() => { setShowInspector(!showInspector); setShowHistory(false); }}><Database size={18} /></div>
        <div className="spacer" />
        <div className="midi-status-circle" title={midiStatus} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00ff00', marginBottom: '20px' }} />
      </div>

      <div className="main-content">
        <div className="toolbar">
          <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#ffcc00', fontWeight: 'bold', width: '120px' }} />
          <button className={`play-btn \${isPlaying ? 'playing' : ''}`} onClick={handleTogglePlay}>
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
          <div className={`status-badge ${ (status === 'Compile Error' || status === 'Runtime Crash') ? 'error' : ''}`}><Activity size={14} />{status}</div>
        </div>

        <div className="editor-layout">
          <div className="editor-container">
            <div className="editor-wrapper" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <VultEditor 
                code={code} 
                onChange={handleCodeChange} 
                markers={editorMarkers} 
                onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)}
                diffMode={diffMode}
                originalCode={originalCode}
              />
              {diffMode && (
                <div style={{ 
                  position: 'absolute', 
                  bottom: '20px', 
                  right: '20px', 
                  display: 'flex', 
                  gap: '10px', 
                  zIndex: 100 
                }}>
                  <button 
                    onClick={handleRejectDiff}
                    style={{ background: '#444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    REJECT
                  </button>
                  <button 
                    onClick={handleAcceptDiff}
                    style={{ background: '#007acc', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    ACCEPT & COMPILE
                  </button>
                </div>
              )}
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
                      <option value="sample">Sample File</option>
                      <option value="live">Live Audio</option>
                      <option value="cv">CV Slider</option>
                      <option value="impulse">Impulse</option>
                      <option value="step">Step</option>
                      <option value="sweep">Sweep</option>
                      <option value="test_noise">Test Noise</option>
                      <option value="silence">Silence</option>
                    </select>
                    
                    {input.type === 'oscillator' && (
                      <div className="strip-controls" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <select value={input.oscType} onChange={(e) => updateInput(i, { oscType: e.target.value as any })} style={{ marginBottom: '4px', width: '100%' }}>
                          <option value="sine">Sine</option>
                          <option value="sawtooth">Saw</option>
                          <option value="square">Square</option>
                          <option value="triangle">Tri</option>
                        </select>
                        <Knob 
                          label="FREQ" 
                          value={input.freq} 
                          min={20} 
                          max={20000} 
                          onChange={(val) => updateInput(i, { freq: val })} 
                          size={36} 
                        />
                      </div>
                    )}

                    {input.type === 'sample' && (
                      <div className="strip-controls" style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <input type="file" accept="audio/*" onChange={(e) => e.target.files && handleSampleUpload(i, e.target.files[0])} style={{ display: 'none' }} id={`sample-${i}`} />
                        <label htmlFor={`sample-${i}`} style={{ cursor: 'pointer', fontSize: '8px', color: '#ffcc00', border: '1px solid #444', padding: '2px 4px' }}>LOAD</label>
                        <Play size={10} style={{ cursor: 'pointer', color: '#00ff00', margin: '0 4px' }} onClick={() => audioEngineRef.current.triggerGenerator(i)} />
                        <Activity 
                          size={12} 
                          style={{ cursor: "pointer", color: input.isLooping ? "#00ff00" : "#444" }} 
                          onClick={() => updateInput(i, { isLooping: !input.isLooping })}
                        />
                      </div>
                    )}
                    
                    {input.type === 'cv' && (
                      <div className="strip-controls" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <Knob 
                          label="VALUE" 
                          value={input.value} 
                          min={0} 
                          max={1} 
                          isFloat={true}
                          onChange={(val) => updateInput(i, { value: val })} 
                          size={36} 
                        />
                        <div style={{ marginTop: '4px' }}>
                          <Activity 
                            size={12} 
                            style={{ cursor: "pointer", color: input.isCycling ? "#00ff00" : "#444" }} 
                            onClick={() => updateInput(i, { isCycling: !input.isCycling })}
                          />
                        </div>
                      </div>
                    )}
                    
                    {input.type === 'sweep' && (
                      <div className="strip-controls" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <Knob 
                          label="TIME(s)" 
                          value={input.value} 
                          min={0.1} 
                          max={10.0} 
                          isFloat={true}
                          onChange={(val) => updateInput(i, { value: val })} 
                          size={36} 
                        />
                        <Play size={10} style={{ cursor: 'pointer', color: '#ffcc00', marginTop: '4px' }} onClick={() => audioEngineRef.current.triggerGenerator(i)} />
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
              ccLabels={ccLabels}
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
              {showHistory ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', borderLeft: '1px solid #333' }}>
                  <div style={{ padding: '12px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '14px', color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <History size={16} /> VERSION HISTORY
                    </div>
                    <button 
                      onClick={() => saveSnapshot("Manual Snapshot")}
                      style={{ background: '#333', border: '1px solid #444', color: '#ffcc00', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                    >
                      SNAPSHOT
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {codeHistory.length === 0 && (
                      <div style={{ padding: '20px', color: '#666', textAlign: 'center', fontSize: '12px' }}>No snapshots yet.</div>
                    )}
                    {codeHistory.map((entry, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          padding: '10px', 
                          borderBottom: '1px solid #333', 
                          cursor: 'pointer',
                          background: code === entry.code ? '#2d2d2d' : 'transparent',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          transition: 'all 0.2s'
                        }}
                        onClick={() => {
                          setOriginalCode(code);
                          setCode(entry.code);
                          setDiffMode(true);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: '#ffcc00', fontWeight: 'bold' }}>{entry.msg}</span>
                          <span style={{ fontSize: '9px', color: '#666' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {entry.code.substring(0, 100).replace(/\n/g, ' ')}...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : showInspector ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <StateInspector 
                      onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)} 
                      onProbe={toggleProbe}
                      onSetState={(path, val) => audioEngineRef.current.setState(path, val)}
                      activeProbes={activeProbes}
                    />
                  </div>
                  {activeProbes.length > 0 && (
                    <div className="mini-scope-section" style={{ height: '300px', padding: '10px', background: '#111', borderTop: '1px solid #333' }}>
                      <div className="section-title"><Activity size={12} /> PROBE SCOPE (MULTI-TRACE)</div>
                      <MultiScopeView 
                        probes={activeProbes} 
                        onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <LLMPane 
                  currentCode={code}
                  onUpdateCode={handleAgentUpdateCode} 
                  onSetKnob={(cc, val) => audioEngineRef.current.sendControlChange(cc, val, 0)}
                  onTriggerGenerator={(idx) => audioEngineRef.current.triggerGenerator(idx)}
                  onConfigureInput={(idx, config) => updateInput(idx, config)}
                  onLoadPreset={(name) => loadPreset(name)}
                  onSaveSnapshot={(msg) => saveSnapshot(msg)}
                  onSetProbes={(probes) => {
                    setActiveProbes(probes);
                    audioEngineRef.current.setProbes(probes);
                  }}
                  getPresets={() => Object.keys(PRESETS)}
                  getTelemetry={() => audioEngineRef.current.getLiveState()}
                  getSpectrum={() => Array.from(audioEngineRef.current.getSpectrumData())}
                  getAudioMetrics={() => audioEngineRef.current.getAudioMetrics()}
                  systemPrompt={SYSTEM_PROMPT} 
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
