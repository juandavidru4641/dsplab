import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Zap, Activity, Download, Sliders, Code2, History, Music, Keyboard, Code, Wrench, HardDrive, PackageOpen } from 'lucide-react';
import { AudioEngine } from './AudioEngine';
import type { InputSource, SourceType } from './AudioEngine';
import { MIDIController } from './MIDIController';
import VultEditor from './VultEditor';
import type { VultEditorHandle } from './VultEditor';
import ScopeView from './ScopeView';
import SpectrumView from './SpectrumView';
import StatsView from './StatsView';
import LLMPane from './LLMPane';
import VirtualMIDI from './VirtualMIDI';
import StateInspector from './StateInspector';
import MultiScopeView from './MultiScopeView';
import Sequencer from './Sequencer';
import type { Step } from './Sequencer';
import { Knob } from './Knob';
import CommunityPresetsModal from './CommunityPresetsModal';
import { useCommunityPresets, loadPresetCode } from './useCommunityPresets';
import './App.css';

const PRESETS: Record<string, string> = {
  "Biquad Filter": `fun biquad(x0: real, b0: real, b1: real, b2: real, a1: real, a2: real) : real {
  mem w1, w2;
  val w0 = x0 - a1 * w1 - a2 * w2;
  val y0 = b0 * w0 + b1 * w1 + b2 * w2;
  w2, w1 = w1, w0;
  return y0;
}

fun process(input: real) {
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
  "Simple Volume": `fun process(input: real, volume: real) {
  return input * volume;
}
`,
  "Minimal": `fun process(input: real) {
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
  "vs80": `// =============================================================================
// VULT CS-80 "FAT EDITION" - V15 (DUAL VCO + SATURATION + LOW-SHELF)
// Ultimate low-end weight and harmonic richness.
// =============================================================================

// --- 1. UTILITIES & MATH ---

fun pitchToRate(pitch: real) : real @[table(size=127,min=0.0,max=127.0)] {
    return 8.1757989156 * exp(0.05776226505 * pitch) / 44100.0;
}

fun polyblep(phase: real, inc: real) : real {
    val t = phase / inc;
    if (t < 1.0) { return t + t - t * t - 1.0; } 
    else if (t > (1.0 / inc) - 1.0) {
        val t2 = (t - (1.0 / inc));
        return t2 * t2 + t2 + t2 + 1.0;
    }
    return 0.0;
}

fun wrap_idx(idx_raw: int, size: int) : int {
    val out = idx_raw % size;
    if (out < 0) { out = out + size; }
    return out;
}

fun lerp(a: real, b: real, t: real) : real {
    return a + (b - a) * t;
}

// --- 2. CORE COMPONENTS ---

fun cs80_vibrato(rate: real, depth: real) : real {
    mem phase: real;
    val inc = (0.5 + rate * 10.0) / 44100.0;
    phase = phase + inc;
    if (phase >= 1.0) { phase = phase - 1.0; }
    return sin(phase * 6.2831853) * depth * 0.5;
}

fun cs80_vco(cv: real, pwm_base: real, pwm_mod: real) : real {
    mem phase: real;
    val inc = pitchToRate(clip(cv, 0.0, 127.0));
    phase = phase + inc;
    if (phase >= 1.0) { phase = phase - 1.0; }
    val saw = (1.0 - 2.0 * phase) + polyblep(phase, inc);
    val pw = clip(pwm_base + pwm_mod, 0.1, 0.9);
    val p2 = phase + 1.0 - pw;
    val p2_wrapped = if p2 >= 1.0 then p2 - 1.0 else p2;
    val naive_sq = if phase < pw then 1.0 else -1.0;
    val sqr = naive_sq + polyblep(phase, inc) - polyblep(p2_wrapped, inc);
    return (saw + sqr) * 0.5;
}

fun cs80_sub_osc(cv: real) : real {
    mem phase: real;
    val inc = pitchToRate(clip(cv - 12.0, 0.0, 127.0));
    phase = phase + inc;
    if (phase >= 1.0) { phase = phase - 1.0; }
    val pw = 0.5;
    val p2 = phase + 1.0 - pw;
    val p2_wrapped = if p2 >= 1.0 then p2 - 1.0 else p2;
    val naive_sq = if phase < pw then 1.0 else -1.0;
    val sqr = naive_sq + polyblep(phase, inc) - polyblep(p2_wrapped, inc);
    val tri = if phase < 0.5 then 4.0 * phase - 1.0 else 3.0 - 4.0 * phase;
    return sqr * 0.6 + tri * 0.4;
}

fun cs80_pitch_eg(gate: bool, start_pitch: real, time: real) : real {
    mem env: real;
    mem prev_gate: bool;
    val rate = 1.0 / (0.001 + time * 1.0 * 44100.0);
    if (gate == true) {
        if (prev_gate == false) { env = start_pitch; }
        env = env + (0.0 - env) * rate;
    } else {
        env = 0.0;
    }
    prev_gate = gate;
    return env;
}

fun cs80_filter(in_sig: real, cv: real, res: real, is_hp: bool) : real {
    mem ic1eq: real; mem ic2eq: real;
    val g = clip(pitchToRate(cv) * 3.14159 * 2.0, 0.001, 0.9);
    val k = 2.0 - (clip(res, 0.0, 1.0) * 1.9);
    val a1 = 1.0 / (1.0 + g * (g + k));
    val a2 = g * a1;
    val a3 = g * a2;
    val v3 = in_sig - ic2eq;
    val v1 = a1 * ic1eq + a2 * v3;
    val v2 = ic2eq + a2 * ic1eq + a3 * v3;
    ic1eq = 2.0 * v1 - ic1eq;
    ic2eq = 2.0 * v2 - ic2eq;
    val out = if is_hp == true then in_sig - k * v1 - v2 else v2;
    return out;
}

fun adsr(gate: bool, a: real, d: real, s: real, r: real) : real {
    mem state: int; mem v: real; mem prev_gate: bool;
    val a_r = 1.0 / (0.001 + a * 2.0 * 44100.0);
    val d_r = 1.0 / (0.01 + d * 4.0 * 44100.0);
    val r_r = 1.0 / (0.01 + r * 5.0 * 44100.0);
    if (gate == true) {
        if (prev_gate == false) { state = 1; v = 0.0; }
        if (state == 1) { v = v + a_r; if (v >= 1.0) { v = 1.0; state = 2; } }
        else if (state == 2) { v = v + (s - v) * d_r; }
    } else {
        state = 0;
        v = v + (0.0 - v) * r_r;
    }
    prev_gate = gate;
    return v;
}

// --- 3. EFFECTS ---

fun roland_chorus(in_sig: real, depth: real) : real {
    mem b1: array(real, 1024); mem pos: int; mem lfo: real;
    pos = (pos + 1) % 1024;
    b1[pos] = in_sig;
    lfo = lfo + (0.6 / 44100.0);
    if (lfo >= 1.0) { lfo = 0.0; }
    val tri = if lfo < 0.5 then lfo * 4.0 - 1.0 else 3.0 - lfo * 4.0;
    val mod_depth = depth * 150.0;
    val offset1 = 660.0 + (tri * mod_depth);
    val offset2 = 660.0 - (tri * mod_depth);
    
    val i1 = int(offset1); val f1 = offset1 - real(i1);
    val t1 = lerp(b1[wrap_idx(pos - i1, 1024)], b1[wrap_idx(pos - i1 - 1, 1024)], f1);
    
    val i2 = int(offset2); val f2 = offset2 - real(i2);
    val t2 = lerp(b1[wrap_idx(pos - i2, 1024)], b1[wrap_idx(pos - i2 - 1, 1024)], f2);
    
    return in_sig * 0.5 + t1 * 0.25 + t2 * 0.25;
}

fun pitch_shifter(in_sig: real) : real {
    mem buffer: array(real, 2048);
    mem write_ptr: int;
    mem phase: real;
    
    write_ptr = (write_ptr + 1) % 2048;
    buffer[write_ptr] = in_sig;
    
    phase = phase + (1.0 / 2048.0); 
    if (phase >= 1.0) { phase = phase - 1.0; }
    
    val mod1 = (1.0 - phase) * 2048.0;
    val phase2 = if phase + 0.5 >= 1.0 then phase - 0.5 else phase + 0.5;
    val mod2 = (1.0 - phase2) * 2048.0;
    
    val i1 = int(mod1); val f1 = mod1 - real(i1);
    val tap1 = lerp(buffer[wrap_idx(write_ptr - i1, 2048)], buffer[wrap_idx(write_ptr - i1 - 1, 2048)], f1);
    
    val i2 = int(mod2); val f2 = mod2 - real(i2);
    val tap2 = lerp(buffer[wrap_idx(write_ptr - i2, 2048)], buffer[wrap_idx(write_ptr - i2 - 1, 2048)], f2);
    
    val fade = if phase < 0.5 then phase * 2.0 else 2.0 - phase * 2.0;
    return tap1 * fade + tap2 * (1.0 - fade);
}

fun shimmer_reverb(in_sig: real, mix: real, decay: real, shimmer: real, lush: real, damp: real) : real {
    mem d1: array(real, 1031); mem d2: array(real, 1381);
    mem d3: array(real, 1619); mem d4: array(real, 1979);
    mem p1: int; mem p2: int; mem p3: int; mem p4: int;
    mem s1: real; mem s2: real; mem s3: real; mem s4: real;
    mem lp: real; mem dc: real; mem lfo: real;

    p1 = (p1 + 1) % 1031; p2 = (p2 + 1) % 1381;
    p3 = (p3 + 1) % 1619; p4 = (p4 + 1) % 1979;

    lfo = lfo + (0.15 / 44100.0);
    if (lfo >= 1.0) { lfo = 0.0; }
    val mod = sin(lfo * 6.2831853) * lush * 12.0;

    // Hadamard Matrix
    val f1 = 0.5 * (s1 + s2 + s3 + s4);
    val f2 = 0.5 * (s1 - s2 + s3 - s4);
    val f3 = 0.5 * (s1 + s2 - s3 - s4);
    val f4 = 0.5 * (s1 - s2 - s3 + s4);

    // Shimmer + Soft Clipping for stability
    val shim_in = tanh((f1 + f2 + f3 + f4) * 0.5);
    val shim_sig = pitch_shifter(shim_in) * shimmer * 1.2;
    
    // Damping & DC Block
    lp = lp + (shim_sig - lp) * (1.0 - damp * 0.9);
    dc = dc + (f1 - dc) * 0.001;

    // Conservative feedback gain (max 0.85)
    val fb = decay * 0.85;
    
    // Inject shimmer and feedback with tanh safety
    d1[p1] = in_sig + tanh((f1 - dc) * fb + lp * 0.5);
    d2[p2] = in_sig + tanh((f2 - dc) * fb);
    d3[p3] = in_sig + tanh((f3 - dc) * fb);
    d4[p4] = in_sig + tanh((f4 - dc) * fb);

    // Linear Interpolated Reads
    val i1 = int(10.0 + mod); val fr1 = (10.0 + mod) - real(i1);
    s1 = lerp(d1[wrap_idx(p1 - i1, 1031)], d1[wrap_idx(p1 - i1 - 1, 1031)], fr1);
    
    val i2 = int(10.0 + mod); val fr2 = (10.0 + mod) - real(i2);
    s2 = lerp(d2[wrap_idx(p2 - i2, 1381)], d2[wrap_idx(p2 - i2 - 1, 1381)], fr2);
    
    val i3 = int(10.0 + mod); val fr3 = (10.0 + mod) - real(i3);
    s3 = lerp(d3[wrap_idx(p3 - i3, 1619)], d3[wrap_idx(p3 - i3 - 1, 1619)], fr3);
    
    val i4 = int(10.0 + mod); val fr4 = (10.0 + mod) - real(i4);
    s4 = lerp(d4[wrap_idx(p4 - i4, 1979)], d4[wrap_idx(p4 - i4 - 1, 1979)], fr4);

    val wet = (s1 + s2 + s3 + s4) * 0.25;
    return in_sig + wet * mix;
}

// --- 4. VOICE ARCHITECTURE ---

fun cs80_voice(
    gate: bool, note: real, pb: real, vib: real,
    pwm_amt: real, sub_amt: real, detune: real, drive: real,
    hp_c: real, lp_c: real, res: real,
    eg_a: real, eg_d: real, eg_s: real, eg_r: real,
    p_start: real, p_time: real
) : real {
    val amp_env = adsr(gate, eg_a, eg_d, eg_s, eg_r);
    val pit_env = cs80_pitch_eg(gate, p_start, p_time);
    val pitch = note + pb + vib + pit_env;
    
    // Dual VCO with Detune
    val osc1 = cs80_vco(pitch, 0.5, vib * pwm_amt);
    val osc2 = cs80_vco(pitch + detune * 0.5, 0.5, vib * pwm_amt);
    val sub = cs80_sub_osc(pitch);
    
    // Mix and Saturate
    val mixed = (osc1 + osc2) * 0.5 + sub * sub_amt;
    val driven = tanh(mixed * (1.0 + drive * 4.0));
    
    val hpf = cs80_filter(driven, hp_c, 0.1, true);
    val lpf = cs80_filter(hpf, lp_c + (amp_env * 70.0), res, false);
    
    return tanh(lpf * amp_env);
}

// --- 5. HOST INTERFACE ---

fun low_shelf(in_sig: real, freq: real, gain: real) : real {
    mem lp: real;
    val alpha = pitchToRate(freq) * 3.14159 * 2.0;
    lp = lp + (in_sig - lp) * alpha;
    return in_sig + lp * gain;
}

fun process(input: real) {
    mem n1: real; mem n2: real; mem n3: real; mem n4: real; mem n5: real; mem n6: real;
    mem g1: bool; mem g2: bool; mem g3: bool; mem g4: bool; mem g5: bool; mem g6: bool;
    mem pb: real; mem vib_rate: real; mem vib_depth: real; mem pwm_amt: real; mem sub_amt: real;
    mem detune: real; mem drive: real;
    mem hp_c: real; mem lp_c: real; mem res: real; mem eg_a: real; mem eg_d: real; mem eg_s: real; mem eg_r: real;
    mem p_start: real; mem p_time: real; mem chorus_depth: real; mem vol: real;
    mem rev_mix: real; mem rev_decay: real; mem rev_shimmer: real; mem rev_lush: real; mem rev_damp: real;
    mem voice_ptr: int;

    val vib = cs80_vibrato(vib_rate, vib_depth);

    val o1 = cs80_voice(g1, n1, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    val o2 = cs80_voice(g2, n2, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    val o3 = cs80_voice(g3, n3, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    val o4 = cs80_voice(g4, n4, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    val o5 = cs80_voice(g5, n5, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    val o6 = cs80_voice(g6, n6, pb, vib, pwm_amt, sub_amt, detune, drive, hp_c, lp_c, res, eg_a, eg_d, eg_s, eg_r, p_start, p_time);
    
    val mix = (o1 + o2 + o3 + o4 + o5 + o6) * 0.25;
    val chorused = roland_chorus(mix, chorus_depth);
    val reverbed = shimmer_reverb(chorused, rev_mix, rev_decay, rev_shimmer, rev_lush, rev_damp);
    // Final Bass Boost (Low Shelf at 150Hz)
    val final_out = low_shelf(reverbed, 30.0, 0.5);
    return final_out * vol, final_out * vol;
}

and noteOn(n: int, v: int, ch: int) {
    val rn = real(n);
    voice_ptr = (voice_ptr + 1) % 6;
    if (voice_ptr == 0) { n1 = rn; g1 = true; }
    else if (voice_ptr == 1) { n2 = rn; g2 = true; }
    else if (voice_ptr == 2) { n3 = rn; g3 = true; }
    else if (voice_ptr == 3) { n4 = rn; g4 = true; }
    else if (voice_ptr == 4) { n5 = rn; g5 = true; }
    else if (voice_ptr == 5) { n6 = rn; g6 = true; }
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
    val vn = real(v) / 127.0;
    if (c == 30) { vib_rate = vn; }
    else if (c == 31) { vib_depth = vn; }
    else if (c == 32) { pwm_amt = vn; }
    else if (c == 38) { sub_amt = vn; }
    else if (c == 39) { detune = vn; }
    else if (c == 40) { drive = vn; }
    else if (c == 74) { lp_c = vn * 100.0; }
    else if (c == 71) { res = vn; }
    else if (c == 76) { hp_c = vn * 100.0; }
    else if (c == 73) { eg_a = vn; }
    else if (c == 75) { eg_d = vn; }
    else if (c == 79) { eg_s = vn; }
    else if (c == 72) { eg_r = vn; }
    else if (c == 80) { p_start = (vn - 0.5) * 12.0; }
    else if (c == 81) { p_time = vn; }
    else if (c == 82) { chorus_depth = vn; }
    else if (c == 33) { rev_mix = vn; }
    else if (c == 34) { rev_decay = vn; }
    else if (c == 35) { rev_shimmer = vn; }
    else if (c == 36) { rev_lush = vn; }
    else if (c == 37) { rev_damp = vn; }
    else if (c == 41) { vol = vn; }
}

and default() {
    vib_rate = 0.4; vib_depth = 0.1; pwm_amt = 0.2; sub_amt = 0.5;
    detune = 0.15; drive = 0.3;
    lp_c = 40.0; hp_c = 20.0; res = 0.5;
    eg_a = 0.01; eg_d = 0.2; eg_s = 0.4; eg_r = 0.2;
    p_start = 0.5; p_time = 0.05; 
    chorus_depth = 0.7; vol = 0.8;
    rev_mix = 0.4; rev_decay = 0.8; rev_shimmer = 0.5; rev_lush = 0.5; rev_damp = 0.3;
    voice_ptr = 0;
}
`
};

const SYSTEM_PROMPT_BASE = `
Role: Senior DSP Research Scientist and Mentor. 
Environment: DSPLab – A Professional Real-time IDE with Live Telemetry, 12 CC Knobs (30-41), and 6-voice polyphony.

VULT COMPILER INFORMATION:
- VERSION CONTEXT: Check the "VULT VERSION CONTEXT" for the currently active version (V0 or V1).
- V0 (0.4.15): Classic Vult syntax. Stable.
- V1 (1.x): Modern Vult syntax. Stricter type-checking, more features.

STRUCTURAL STATE & HANDLERS (CRITICAL):
1. MANDATORY 'and' USAGE: To share a single state instance across 'process', 'noteOn', 'noteOff', and 'controlChange', you MUST define them as mutually recursive functions using the 'and' keyword. 
   EXAMPLE:
   fun process(input: real) { ... }
   and noteOn(n:int, v:int, ch:int) { ... }
   and noteOff(n:int, ch:int) { ... }
   and controlChange(cc:int, v:int, ch:int) { ... }
   and default() { ... }

CORE LANGUAGE SPECS:
- Types: Use 'real' (float), 'int' (integer), 'bool' (boolean). V1 supports 'byte' and 'string'.
- Statements: EVERY statement MUST end with a semicolon ';'.
- Entry point: 'fun process(input: real, ...)' can return 'real' (Mono) or multiple values (Stereo, e.g. 'return L, R;').
- Return points: All return points in a function MUST return the same type/arity.
- CC Mapping: CCs 30-41 are automatically available as knobs. Implement logic in 'controlChange' and store in 'mem' variables.

V1 SPECIFIC FEATURES (V1 only):
- Enumerations: 'enum e { One, Two }'.
- Record Types: 'type point { val x:real; val y:real; }'. Access with 'p.x'.
- Constants: 'constant pi = 3.14;' (Global allowed).
- Iter Loops: 'iter(i, count) { ... }' counts from 0 to count-1.
- Generic Arrays: 'array(real, size)'. Use 'size(data)' for length. 'val x = data[i];'.
- Instance Arrays: 'mem oscs : array(osc_type, 4);'. Called as 'oscs[i]:osc(f);'. 
- Pattern Matching: 'match (x) { 0 -> { ... } _ -> { ... } }'. Support tuples: 'match (x, y) { 1, 2 -> ... }'.
- Strings: 'string' type, literals '"..."', concat '+', 'string(val)', 'length(s)'.
- Specialization: Parameters prefixed with ' (e.g., ''n : int') are evaluated at compile-time.

LABORATORY WORKFLOW:
- Read: Use 'get_current_code' for context or 'list_functions'.
- Reference: Use 'get_vult_reference' for syntax.
- Plan: Use 'write_plan' to document your strategy.
- Edit: Use 'apply_diff' or 'edit_lines'. Use 'fix_boilerplate' for structurally broken files.
- Verify: Use 'get_live_telemetry', 'get_spectrum_data', and 'get_audio_metrics'.

AUTONOMOUS EXECUTION:
- DO NOT PERFORM 'RESEARCH-ONLY' TURNS. If you call 'get_current_code' or 'list_functions', you MUST also call an editing or testing tool in the same turn or the very next turn.
- TREAT 'write_plan' AS A STARTING ACTION, NEVER AN ENDING ACTION. You MUST implement at least one change after planning in the same turn.
- You are in an autonomous loop. Use tool calls sequentially to achieve the goal. DO NOT wait for user confirmation unless using 'ask_user'.
- Always verify your work using 'get_live_telemetry' and 'get_spectrum_data' to ensure the audible result matches your mathematical model.
`;

const App: React.FC = () => {
  const [code, setCode] = useState(PRESETS["vs80"]);
  const [projectName, setProjectName] = useState(() => {
    return localStorage.getItem('vult_session_name') || "My Vult Project";
  });
  
  const updateProjectName = (name: string) => {
    setProjectName(name);
    localStorage.setItem('vult_session_name', name);
  };
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vultVersion, setVultVersion] = useState<'v0' | 'v1'>('v0');
  const [status, setStatus] = useState('Idle');
  const [_audioStatus, setAudioStatus] = useState<{ state: string; sampleRate: number }>({ state: 'suspended', sampleRate: 0 });
  const [editorMarkers, setEditorMarkers] = useState<any[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [activeProbes, setActiveProbes] = useState<string[]>([]);
  const [diffMode, setDiffMode] = useState(false);
  const [originalCode, setOriginalCode] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [codeHistory, setCodeHistory] = useState<{timestamp: number, code: string, msg: string}[]>([]);
  
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ code: string; name: string } | null>(null);
  
  const [seqSteps, setSeqSteps] = useState<Step[]>(Array.from({ length: 32 }, () => ({ active: false, notes: [], accent: false, slide: false })));
  const [seqBpm, setSeqBpm] = useState(120);
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [seqLength, setSeqLength] = useState(16);
  const [seqGateLength, setSeqGateLength] = useState(0.5);
  const [seqMode, setSeqMode] = useState<'melody' | 'drum'>('melody');
  const [seqDrumTracks, setSeqDrumTracks] = useState<any[]>(() => [
    { name: 'BD', note: 36, steps: Array(32).fill(null).map(() => ({ active: false, accent: false })) },
    { name: 'SD', note: 38, steps: Array(32).fill(null).map(() => ({ active: false, accent: false })) },
    { name: 'CH', note: 42, steps: Array(32).fill(null).map(() => ({ active: false, accent: false })) },
    { name: 'OH', note: 46, steps: Array(32).fill(null).map(() => ({ active: false, accent: false })) },
  ]);
  const [seqCCTracks, setSeqCCTracks] = useState<any[]>([]);

  const midiNoteLedRef = useRef<HTMLDivElement>(null);
  const midiCcLedRef = useRef<HTMLDivElement>(null);
  const midiPulseTimeouts = useRef<{ note: any, cc: any }>({ note: null, cc: null });
  
  const [inputs, setInputs] = useState<InputSource[]>([]);
  const [midiInputs, setMidiInputs] = useState<any[]>([]);
  const [selectedMidiInput, setSelectedMidiInput] = useState<string>('all');

  const [showCommunity, setShowCommunity] = useState(false);
  const [midiReady, setMidiReady] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileView, setMobileView] = useState<'editor' | 'lab' | 'panels'>('editor');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTarget, setExportTarget] = useState('c');
  const [exportJavaPrefix, setExportJavaPrefix] = useState('com.example');
  const [exportStatus, setExportStatus] = useState('');

  // Community presets (fetched from GitHub)
  const { groups: communityGroups, loading: communityLoading } = useCommunityPresets();

  // UI States
  const [labHeight, setLabHeight] = useState(250);
  const [sidePanelWidth, setSidePanelWidth] = useState(380);
  const [activeLabTab, setActiveLabTab] = useState<'lab' | 'seq' | 'midi'>('lab');
  
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
  const midiControllerRef = useRef<MIDIController | null>(null);
  const skipNextUpdateRef = useRef(false);
  const codeDebounceTimerRef = useRef<any>(null);
  const vultEditorRef = useRef<VultEditorHandle>(null);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  const parseVultCCs = useCallback((vultCode: string) => {
    const ccMap: Record<number, string> = {};
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
    if (Object.keys(ccMap).length === 0) {
      return { 30: 'SAW/SQR', 31: 'SINE LVL', 32: 'PWM AMT', 35: 'LFO RATE' };
    }
    return ccMap;
  }, []);

  const [ccLabels, setCcLabels] = useState<Record<number, string>>({});

  const saveSnapshot = useCallback((msg: string = "Manual Snapshot") => {
    setCodeHistory(prev => {
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
      oscType: 'sine' as const,
      lfoRate: 1.0,
      lfoDepth: 1.0,
      lfoShape: 'sine' as const
    }));
  }, []);

  useEffect(() => {
    const startup = async () => {
      try {
        const lastSession = localStorage.getItem('vult_session_code');
        const lastProjectName = localStorage.getItem('vult_session_name');
        const historyRaw = localStorage.getItem('vult_code_history');
        if (historyRaw) setCodeHistory(JSON.parse(historyRaw));
        
        const preference = localStorage.getItem('vult_restore_preference') || 'ask';
        
        if (lastSession && lastSession.trim().length > 10) {
          if (preference === 'always') {
            setCode(lastSession);
            setInputs(parseVultInputs(lastSession));
            setCcLabels(parseVultCCs(lastSession));
            if (lastProjectName) updateProjectName(lastProjectName);
          } else if (preference === 'ask') {
            setPendingRestore({ code: lastSession, name: lastProjectName || 'My Vult Project' });
            setShowRestoreModal(true);
            // Default to Minimal until they decide
            const defaultCode = PRESETS["Minimal"];
            setCode(defaultCode);
            setInputs(parseVultInputs(defaultCode));
            setCcLabels(parseVultCCs(defaultCode));
          } else {
            const defaultCode = PRESETS["Minimal"];
            setCode(defaultCode);
            setInputs(parseVultInputs(defaultCode));
            setCcLabels(parseVultCCs(defaultCode));
          }
        } else {
          const defaultCode = PRESETS["Minimal"];
          setCode(defaultCode);
          setInputs(parseVultInputs(defaultCode));
          setCcLabels(parseVultCCs(defaultCode));
        }
        
        const projectsRaw = localStorage.getItem('vult_projects');
        if (projectsRaw) setSavedProjects(Object.keys(JSON.parse(projectsRaw)));
      } catch (err) {}

      const ae = audioEngineRef.current;
      midiControllerRef.current = new MIDIController(
        (n, v) => {
          ae.sendNoteOn(n, v);
          if (midiNoteLedRef.current) {
            midiNoteLedRef.current.style.background = '#00ff00'; // Green for Note On
            if (midiPulseTimeouts.current.note) clearTimeout(midiPulseTimeouts.current.note);
            midiPulseTimeouts.current.note = setTimeout(() => { if (midiNoteLedRef.current) midiNoteLedRef.current.style.background = '#333'; }, 100);
          }
        },
        (n) => {
          ae.sendNoteOff(n);
          if (midiNoteLedRef.current) {
            midiNoteLedRef.current.style.background = 'var(--accent-success)'; // Green for Note Off
            if (midiPulseTimeouts.current.note) clearTimeout(midiPulseTimeouts.current.note);
            midiPulseTimeouts.current.note = setTimeout(() => { if (midiNoteLedRef.current) midiNoteLedRef.current.style.background = '#333'; }, 100);
          }
        },
        (c, v) => {
          ae.sendControlChange(c, v);
          if (midiCcLedRef.current) {
            midiCcLedRef.current.style.background = 'var(--accent-success)'; // Green for CC
            if (midiPulseTimeouts.current.cc) clearTimeout(midiPulseTimeouts.current.cc);
            midiPulseTimeouts.current.cc = setTimeout(() => { if (midiCcLedRef.current) midiCcLedRef.current.style.background = '#333'; }, 100);
          }
        },
        (_s) => {
          // Midi status string no longer displayed, but still update inputs
          setMidiInputs(midiControllerRef.current?.getInputs() || []);
        }
      );
      // MIDI init is deferred — browser requires a user gesture.
      // It is triggered by handleEnableMIDI or implicitly on first RUN press.
      ae.getDevices().then(devices => {
        setAudioDevices(devices);
      });
      ae.onRuntimeError(() => setStatus('Runtime Crash'));
      ae.onAudioStatusUpdate(setAudioStatus);
      ae.onMidiActivity((kind) => {
        const isNote = kind.startsWith('note');
        const ref = isNote ? midiNoteLedRef : midiCcLedRef;
        const color = 'var(--accent-success)';
        if (ref.current) {
           ref.current.style.background = color;
           ref.current.style.boxShadow = `0 0 5px ${color}`;
           clearTimeout(midiPulseTimeouts.current[isNote ? 'note' : 'cc']);
           midiPulseTimeouts.current[isNote ? 'note' : 'cc'] = setTimeout(() => {
              if (ref.current) {
                 ref.current.style.background = '#333';
                 ref.current.style.boxShadow = 'none';
              }
           }, 80);
        }
      });
    };
    startup();
    return () => { audioEngineRef.current.stop(); };
  }, []);

  useEffect(() => {
    audioEngineRef.current.setCompilerVersion(vultVersion);
    const triggerRecompile = async () => {
      const playing = audioEngineRef.current.getIsPlaying();
      if (playing) {
        const result = await audioEngineRef.current.updateCode(code);
        if (!result.success) { setStatus('Compile Error'); setEditorMarkers(parseVultError(result)); }
        else { setStatus('Running'); setEditorMarkers([]); }
      } else {
        const result = await audioEngineRef.current.compileCheck(code);
        if (!result.success) { setStatus('Syntax Error'); setEditorMarkers(parseVultError(result)); }
        else { setStatus('Idle'); setEditorMarkers([]); }
      }
    };
    triggerRecompile();
  }, [vultVersion]);


  useEffect(() => {
    const timer = setInterval(() => { saveSnapshot("Autosave"); }, 300000);
    return () => clearInterval(timer);
  }, [saveSnapshot]);

  useEffect(() => { audioEngineRef.current.setSources(inputs); }, [inputs]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // MIDI must be initialised from a user gesture — call this on first interaction
  const handleEnableMIDI = async () => {
    if (!midiControllerRef.current || midiReady) return;
    await midiControllerRef.current.init();
    const ready = midiControllerRef.current.isInitialized();
    setMidiReady(ready);
    setMidiInputs(midiControllerRef.current.getInputs());
  };

  const handleTogglePlay = async () => {
    const ae = audioEngineRef.current;
    if (ae.getIsPlaying()) { ae.stop(); setIsPlaying(false); setSeqPlaying(false); }
    else {
      // Create context synchronously inside click handler to appease Chrome Autoplay Policy
      ae.initContextSync();
      
      // Attempt MIDI init in the background — never block audio on MIDI failure
      if (midiControllerRef.current && !midiReady) {
        midiControllerRef.current.init().then(() => {
          setMidiReady(midiControllerRef.current!.isInitialized());
          setMidiInputs(midiControllerRef.current!.getInputs());
        }).catch(() => { /* MIDI unavailable — audio still works */ });
      }

      try {
        await ae.start();
      } catch (e: any) {
        setStatus('Audio Error: ' + (e?.message ?? e));
        return;
      }
      const result = await ae.updateCode(code);
      if (result.success) { setStatus('Running'); ae.setProbes(activeProbes); setEditorMarkers([]); }
      else { setStatus('Compile Error'); setEditorMarkers(parseVultError(result)); }
      setIsPlaying(true);
      setSeqPlaying(true);
    }
  };

  const parseVultError = (result: any) => {
    let markers: any[] = [];
    if (result.rawErrors && Array.isArray(result.rawErrors)) {
      result.rawErrors.forEach((err: any) => {
        if (err.row !== undefined && err.row !== null) {
          const r = parseInt(err.row) + 1;
          const c = parseInt(err.column) + 1;
          markers.push({ startLineNumber: r, endLineNumber: r, startColumn: c, endColumn: c + 3, message: err.msg || err.text, severity: 8 });
        }
      });
    }

    if (markers.length === 0 && result.error) {
       const errorStr = typeof result.error === 'string' ? result.error : '';
       const lineMatch = errorStr.match(/line (\d+)/i);
       const colMatch = errorStr.match(/column (\d+)/i) || errorStr.match(/characters (\d+)/i);
       if (lineMatch) {
         const line = parseInt(lineMatch[1]);
         const col = colMatch ? parseInt(colMatch[1]) : 1;
         markers.push({ startLineNumber: line, endLineNumber: line, startColumn: col, endColumn: col + 1, message: errorStr.replace(/Errors in the program:\s*/, '').trim(), severity: 8 });
       }
    }
    return markers;
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    if (skipNextUpdateRef.current) { skipNextUpdateRef.current = false; return; }
    
    // Check if it's actually different to avoid redundant state updates
    if (value === code) return;

    setCode(value);
    localStorage.setItem('vult_session_code', value);
    setCcLabels(parseVultCCs(value));
    const newInputs = parseVultInputs(value);
    setInputs(prev => (prev.length === newInputs.length && prev.every((v, i) => v.name === newInputs[i].name)) ? prev : newInputs);
    
    // Live Syntax Checking / Compilation Debounce
    if (codeDebounceTimerRef.current) clearTimeout(codeDebounceTimerRef.current);
    codeDebounceTimerRef.current = setTimeout(async () => {
      // Determine what state we're running based on the live variable
      // Wait, we can't reliably read 'isPlaying' if it's stale in the closure, 
      // but 'isPlaying' is in the dependencies since it's an inline async arrow... wait, 'handleCodeChange' 
      // isn't wrapped in useCallback so it's fresh each render. 
      // Actually, safest is to check audioEngineRef directly.
      const playing = audioEngineRef.current.getIsPlaying();
      if (playing) {
        const result = await audioEngineRef.current.updateCode(value);
        if (!result.success) { setStatus('Compile Error'); setEditorMarkers(parseVultError(result)); }
        else { setStatus('Running'); setEditorMarkers([]); }
      } else {
        const result = await audioEngineRef.current.compileCheck(value);
        if (!result.success) { setStatus('Syntax Error'); setEditorMarkers(parseVultError(result)); }
        else { setStatus('Idle'); setEditorMarkers([]); }
      }
    }, 400);
  };

  const updateInput = (idx: number, patch: Partial<InputSource>) => {
    setInputs(prev => { const next = [...prev]; next[idx] = { ...next[idx], ...patch }; return next; });
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
    const floatData = audioBuffer.getChannelData(0);
    audioEngineRef.current.setSampleData(idx, floatData);
    updateInput(idx, { name: file.name.split('.')[0] });
    ctx.close();
  };

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

  const EXPORT_OPTIONS: { value: string; label: string; ext: string; mime: string }[] = [
    { value: 'c',        label: 'C / C++',              ext: '.cpp',  mime: 'text/x-c' },
    { value: 'c-pd',     label: 'C / C++ (Pure Data)',  ext: '.cpp',  mime: 'text/x-c' },
    { value: 'c-teensy', label: 'C / C++ (Teensy)',     ext: '.cpp',  mime: 'text/x-c' },
    { value: 'js',       label: 'JavaScript',           ext: '.js',   mime: 'text/javascript' },
    { value: 'lua',      label: 'Lua',                  ext: '.lua',  mime: 'text/x-lua' },
    { value: 'java',     label: 'Java',                 ext: '.java', mime: 'text/x-java' },
  ];

  const handleExport = async () => {
    const opt = EXPORT_OPTIONS.find(o => o.value === exportTarget);
    if (!opt) return;
    setExportStatus('Generating...');
    try {
      const body: Record<string, string> = { code, target: exportTarget };
      if (exportTarget === 'java') body.javaPrefix = exportJavaPrefix;
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data.code) {
        const blob = new Blob([data.code], { type: opt.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, '_')}${opt.ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setExportStatus('Done');
        setTimeout(() => { setExportStatus(''); setShowExportModal(false); }, 800);
      } else {
        const msg = data.errors?.[0]?.msg || 'Export failed';
        setExportStatus('Error: ' + msg.substring(0, 80));
      }
    } catch (e) {
      setExportStatus('Network error');
    }
  };

  const handleLoadCode = useCallback((newCode: string) => {
    if (!newCode) return;
    skipNextUpdateRef.current = false; // Reset by default
    setActiveProbes([]);
    audioEngineRef.current.setProbes([]);
    setEditorMarkers([]);
    setDiffMode(false);
    setOriginalCode('');
    
    // Determine if we need to skip the next editor update
    // If the code is identical to what state already has, setCode won't trigger a re-render/effect,
    // so we must force the editor to reset manually.
    const isActuallyChangingState = newCode !== code;

    if (!isActuallyChangingState) {
      vultEditorRef.current?.setValue(newCode);
    } else {
      skipNextUpdateRef.current = true;
      setCode(newCode);
    }
    
    localStorage.setItem('vult_session_code', newCode);

    const newCCLabels = parseVultCCs(newCode);
    setCcLabels(newCCLabels);
    
    setSeqCCTracks(Object.keys(newCCLabels).map(ccStr => ({
      cc: parseInt(ccStr),
      steps: Array(128).fill(0)
    })));

    setInputs(parseVultInputs(newCode));

    if (isPlaying) {
      setStatus('Loading...');
      audioEngineRef.current.updateCode(newCode).then(result => {
        if (result.success) setStatus('Running');
        else {
          setStatus('Compile Error');
          setEditorMarkers(parseVultError(result));
        }
      });
    } else {
      setStatus('Idle');
      // Even if not playing, check syntax to show markers
      audioEngineRef.current.compileCheck(newCode).then(result => {
        if (!result.success) {
          setStatus('Compile Error');
          setEditorMarkers(parseVultError(result));
        }
      });
    }
  }, [isPlaying, code, parseVultCCs, parseVultInputs]);

  const loadPreset = (name: string) => {
    const presetCode = PRESETS[name];
    if (presetCode) {
      skipNextUpdateRef.current = false;
      handleLoadCode(presetCode);
    }
  };

  const handleNewProject = useCallback(() => {
    const freshCode = PRESETS["Minimal"];
    handleLoadCode(freshCode);
    updateProjectName("New Vult Project");
  }, [handleLoadCode, updateProjectName]);

  const handleAgentUpdateCode = async (newCode: string) => {
    if (!diffMode) setOriginalCode(code);
    setCode(newCode);
    const result = await audioEngineRef.current.updateCode(newCode);
    if (result.success) { saveSnapshot("Agent Update"); setDiffMode(true); setEditorMarkers([]); setStatus('Trial Compile OK'); return { success: true, message: "Code compiled successfully. Waiting for user to ACCEPT changes." }; }
    else { setDiffMode(false); setEditorMarkers(parseVultError(result)); setStatus('Compile Error'); return { success: false, error: result.error }; }
  };

  const handleAcceptDiff = async () => {
    const newCode = code;
    localStorage.setItem('vult_session_code', newCode);
    setInputs(parseVultInputs(newCode));
    if (isPlaying) {
      const result = await audioEngineRef.current.updateCode(newCode);
      if (result.success) { setStatus('Running'); setEditorMarkers([]); }
      else { setStatus('Compile Error'); setEditorMarkers(parseVultError(result)); }
    }
    setDiffMode(false);
    setOriginalCode('');
  };

  const handleRejectDiff = () => { setCode(originalCode); setDiffMode(false); setOriginalCode(''); };



  // Improved Resizing logic
  const startResizing = (setter: React.Dispatch<React.SetStateAction<number>>, min: number, max: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    let lastY = e.clientY;
    
    const handleMove = (moveEvent: MouseEvent) => {
      const delta = lastY - moveEvent.clientY;
      lastY = moveEvent.clientY; // Update anchor point to current position
      setter(prev => Math.max(min, Math.min(max, prev + delta)));
    };
    
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = 'default';
    };
    
    document.body.style.cursor = 'ns-resize';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const startResizingH = (setter: React.Dispatch<React.SetStateAction<number>>, min: number, max: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    let lastX = e.clientX;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = lastX - moveEvent.clientX; // Left drag increases right panel width
      lastX = moveEvent.clientX;
      setter(prev => Math.max(min, Math.min(max, prev + delta)));
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = 'default';
    };

    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const getCodeSummary = (codeStr: string) => {
    const lines = codeStr.split('\n');
    // Find the first line that isn't whitespace or a decorative comment
    const firstMeaningfulLine = lines.find(l => {
      const t = l.trim();
      // Skip empty lines, decorative comments like // ===, and header comments
      return t.length > 0 && !t.match(/^\/\/[\s=*-]*$/) && !t.startsWith('// ---');
    });
    const summary = firstMeaningfulLine || lines[0] || "";
    return summary.substring(0, 100).trim();
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <Zap color="var(--accent-primary)" size={22} />
          <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--accent-primary)', letterSpacing: '1px' }}>DSPLAB</span>
        </div>
        {isMobile ? (
          <>
            <div className={`nav-item ${mobileView === 'editor' ? 'active' : ''}`} onClick={() => setMobileView('editor')}>
              <Code size={20} /><span className="nav-label">Editor</span>
            </div>
            <div className={`nav-item ${mobileView === 'lab' ? 'active' : ''}`} onClick={() => setMobileView('lab')}>
              <Sliders size={20} /><span className="nav-label">Lab</span>
            </div>
            <div className={`nav-item ${mobileView === 'panels' ? 'active' : ''}`} onClick={() => setMobileView('panels')}>
              <Activity size={20} /><span className="nav-label">Panels</span>
            </div>
          </>
        ) : (
          <>
            <div className={`nav-item ${showInspector ? 'active' : ''}`} title="State Inspector" onClick={() => { setShowInspector(!showInspector); setShowHistory(false); setShowCommunity(false); setShowExportModal(false); }}>
              <Wrench size={22} /><span className="nav-label">Inspect</span>
            </div>
            
            <div className={`nav-item ${showHistory ? 'active' : ''}`} title="Version History" onClick={() => { setShowHistory(!showHistory); setShowInspector(false); setShowCommunity(false); setShowExportModal(false); }}>
              <History size={22} /><span className="nav-label">History</span>
            </div>

            <div className="spacer" style={{ flex: 1 }} />

            <div className={`nav-item ${showCommunity ? 'active' : ''}`} title="Community Presets" onClick={() => { setShowCommunity(!showCommunity); setShowHistory(false); setShowInspector(false); setShowExportModal(false); }}>
              <PackageOpen size={22} /><span className="nav-label">Library</span>
            </div>

            <div className="nav-item" title="Save Project to Local Storage" onClick={handleSave}>
              <HardDrive size={22} /><span className="nav-label">Save</span>
            </div>

            <div className="nav-item" title="Download .vult source" onClick={handleDownload}>
              <Download size={22} /><span className="nav-label">Download</span>
            </div>

            <div className={`nav-item ${showExportModal ? 'active' : ''}`} title="Export Code" onClick={() => { setShowExportModal(!showExportModal); setExportStatus(''); setShowHistory(false); setShowCommunity(false); setShowInspector(false); }}>
              <Code2 size={22} /><span className="nav-label">Export</span>
            </div>
          </>
        )}
        <div className="spacer" />
        {/* No longer showing midi-status-circle here */} 
        </div>

        <div className="main-content">
        <div className="toolbar">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--accent-primary)',
              fontWeight: '800',
              width: '140px',
              padding: '6px 12px',
              borderRadius: '6px',
              outline: 'none',
              fontSize: '12px',
              transition: 'all 0.2s',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
          <button className={`play-btn ${isPlaying ? 'playing' : ''}`} onClick={handleTogglePlay}>
            {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            {isPlaying ? 'STOP' : 'RUN'}
          </button>

          <select
            value={vultVersion}
            onChange={(e) => setVultVersion(e.target.value as 'v0' | 'v1')}
            title="Vult Compiler Version"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-color)',
              padding: '6px 12px',
              borderRadius: '6px',
              outline: 'none',
              fontSize: '12px',
              cursor: 'pointer',
              marginLeft: '8px',
              fontFamily: 'monospace'
            }}
          >
            <option value="v0">Vult 0.4.15</option>
            <option value="v1">Vult v1</option>
          </select>

          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '10px' }}>
              <div ref={midiNoteLedRef} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#333', transition: 'background 0.05s' }} title="MIDI Note Activity" />
              <div ref={midiCcLedRef} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#333', transition: 'background 0.05s' }} title="MIDI CC Activity" />
            </div>
          )}

          {isPlaying && (
            <div className="running-indicator" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
              <div className="led-blink" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ffcc', boxShadow: '0 0 8px #00ffcc' }} />
              <span style={{ fontSize: '10px', color: '#00ffcc', fontWeight: 'bold', letterSpacing: '1px' }}>ACTIVE</span>
            </div>
          )}

          <div className="divider" />          <div className="control-group">
            <span className="label">PRESET</span>
            <select value="" onChange={async (e) => {
              const val = e.target.value;
              if (!val) return;
              if (val.startsWith('community:')) {
                const path = val.slice('community:'.length);
                try {
                  const code = await loadPresetCode(path);
                  const name = path.split('/').pop()?.replace(/\.vult$/, '').replace(/[_-]/g, ' ') ?? 'preset';
                  handleLoadCode(code);
                  setProjectName(name);
                } catch { setStatus('Load Error'); }
              } else {
                loadPreset(val);
              }
            }}>
              <option value="" disabled>Load...</option>
              <optgroup label="Built-in">
                {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
              </optgroup>
              {communityGroups.length > 0 && communityGroups.map(group => {
                const byRole: Record<string, typeof group.presets> = {};
                for (const p of group.presets) {
                  const r = p.meta?.role ?? 'effect';
                  if (!byRole[r]) byRole[r] = [];
                  byRole[r].push(p);
                }
                const roleOrder = ['instrument', 'effect', 'utility'] as const;
                const rolesPresent = roleOrder.filter(r => byRole[r]?.length);
                return rolesPresent.map(role => (
                  <optgroup key={`${group.author}-${role}`} label={`Community / ${group.author} — ${role[0].toUpperCase() + role.slice(1)}s`}>
                    {byRole[role].map(p => (
                      <option key={p.path} value={`community:${p.path}`}>{p.name}</option>
                    ))}
                  </optgroup>
                ));
              })}
              {communityLoading && <optgroup label="Community"><option disabled>Loading...</option></optgroup>}
            </select>
          </div>
          <div className="control-group"><span className="label">MIDI</span><select value={selectedMidiInput} onChange={(e) => { setSelectedMidiInput(e.target.value); midiControllerRef.current?.setInput(e.target.value === 'all' ? null : e.target.value); }}><option value="all">All</option>{midiInputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <div className="control-group">
            <span className="label">SAVED</span>
            <select value="" style={{ width: '120px' }} onChange={(e) => {
              const val = e.target.value;
              if (val === "NEW") {
                handleNewProject();
              } else if (val) {
                const projects = JSON.parse(localStorage.getItem('vult_projects') || '{}');
                const savedCode = projects[val];
                if (savedCode) {
                  handleLoadCode(savedCode);
                  updateProjectName(val);
                }
              }
            }}>
              <option value="" disabled>Project...</option>
              <option value="NEW">+ New Project</option>
              {savedProjects.length > 0 && <optgroup label="Saved">
                {savedProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </optgroup>}
            </select>
          </div>
          <div className="spacer" />
          {((status === 'Idle' && !isPlaying) || status.includes('Error') || status.includes('Crash')) && (
            <div className={`status-badge ${(status === 'Compile Error' || status === 'Runtime Crash') ? 'error' : ''}`} style={{ marginLeft: 'auto' }}><Activity size={14} />{status}</div>
          )}
        </div>

        <div className="editor-layout">
          <div className="editor-container" style={{ display: isMobile && mobileView !== 'editor' && mobileView !== 'lab' ? 'none' : 'flex' }}>
            <div className="editor-wrapper" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <VultEditor ref={vultEditorRef} code={code} onChange={handleCodeChange} markers={editorMarkers} onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)} diffMode={diffMode} originalCode={originalCode} />
              {diffMode && (
                <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 100 }}>
                  <button onClick={handleRejectDiff} style={{ background: '#444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>REJECT</button>
                  <button onClick={handleAcceptDiff} style={{ background: '#007acc', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>ACCEPT & COMPILE</button>
                </div>
              )}
            </div>
            
            {/* TABBED LABORATORY RACK */}
            {!isMobile && <div className="resize-handle" onMouseDown={startResizing(setLabHeight, 100, 800)} />}
            <div className="lab-rack" style={{ height: isMobile ? '100%' : `${labHeight}px`, flex: isMobile ? 1 : 'none', display: isMobile && mobileView !== 'lab' ? 'none' : 'flex', flexDirection: 'column', background: '#1a1a1a', overflowY: 'auto' }}>
              <div className="lab-tabs" style={{ display: 'flex', background: '#111', borderBottom: '1px solid #333', flexShrink: 0 }}>
                <div className={`lab-tab ${activeLabTab === 'lab' ? 'active' : ''}`} onClick={() => setActiveLabTab('lab')} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', color: activeLabTab === 'lab' ? '#00ff00' : '#666', borderRight: '1px solid #333', background: activeLabTab === 'lab' ? '#1a1a1a' : 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={12} /> INPUTS
                </div>
                <div className={`lab-tab ${activeLabTab === 'seq' ? 'active' : ''}`} onClick={() => { setActiveLabTab('seq'); if (labHeight < 400) setLabHeight(550); }} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', color: activeLabTab === 'seq' ? '#00ff00' : '#666', borderRight: '1px solid #333', background: activeLabTab === 'seq' ? '#1a1a1a' : 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Music size={12} /> SEQUENCER
                </div>
                <div className={`lab-tab ${activeLabTab === 'midi' ? 'active' : ''}`} onClick={() => setActiveLabTab('midi')} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', color: activeLabTab === 'midi' ? '#00ff00' : '#666', borderRight: '1px solid #333', background: activeLabTab === 'midi' ? '#1a1a1a' : 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Keyboard size={12} /> MIDI
                </div>
              </div>

              <div className="lab-content" style={{ flex: 1, overflow: 'hidden', background: '#0a0a0a' }}>
                {activeLabTab === 'lab' && (
                  <div className="dsp-lab" style={{ height: '100%', overflowY: 'auto' }}>
                    <div className="input-strips">
                      {inputs.map((input, i) => (
                        <div key={i} className="input-strip" style={{ position: 'relative' }}>
                          <div className="strip-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.5px', color: 'var(--accent-primary)', textShadow: '0 0 5px rgba(var(--accent-primary-rgb),0.4)' }}>
                              {input.name.toUpperCase()}
                            </span>
                            {(input.type === 'impulse' || input.type === 'step') && (
                              <button onClick={() => audioEngineRef.current.triggerGenerator(i)} style={{ background: 'rgba(var(--accent-primary-rgb),0.1)', border: '1px solid rgba(var(--accent-primary-rgb),0.3)', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Zap size={10} color="var(--accent-primary)" />
                              </button>
                            )}
                          </div>
                          
                          <select value={input.type} onChange={(e) => updateInput(i, { type: e.target.value as SourceType })} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary-bright)', fontSize: '10px', padding: '4px', borderRadius: '4px', width: '100%', outline: 'none' }}>
                            <option value="cv">DC / Constant</option>
                            <option value="lfo">LFO</option>
                            <option value="oscillator">Audio Osc</option>
                            <option value="live">Live Audio In</option>
                            <option value="sample">Sample Playback</option>
                            <option value="impulse">Impulse (Trigger)</option>
                            <option value="test_noise">Noise Generator</option>
                          </select>

                          <div className="strip-controls" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '8px 4px', marginTop: '4px', minHeight: '100px' }}>
                            {input.type === 'oscillator' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
                                <select value={input.oscType} onChange={(e) => updateInput(i, { oscType: e.target.value as any })} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--accent-cyan)', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', outline: 'none', width: '90%', textAlign: 'center' }}>
                                  <option value="sine">SINE</option><option value="sawtooth">SAW</option><option value="square">SQUARE</option><option value="triangle">TRI</option>
                                </select>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <Knob label="FREQ" value={input.freq} min={0.1} max={20000} onChange={(val) => updateInput(i, { freq: val })} size={32} color="#00ffcc" isFloat />
                                </div>
                              </div>
                            )}

                            {input.type === 'lfo' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
                                <select value={input.lfoShape || 'sine'} onChange={(e) => updateInput(i, { lfoShape: e.target.value as any })} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)', fontSize: '9px', padding: '2px 4px', borderRadius: '4px', outline: 'none', width: '90%', textAlign: 'center' }}>
                                  <option value="sine">SINE</option><option value="triangle">TRI</option><option value="square">SQUARE</option><option value="sawtooth">SAW</option>
                                </select>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <Knob label="RATE" value={input.lfoRate || 1} min={0.1} max={50} onChange={(val) => updateInput(i, { lfoRate: val })} size={28} color="var(--accent-primary)" isFloat />
                                  <Knob label="DEPTH" value={input.lfoDepth || 1} min={0} max={10} onChange={(val) => updateInput(i, { lfoDepth: val })} size={28} color="#ff4444" isFloat />
                                </div>
                              </div>
                            )}

                            {input.type === 'cv' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                <Knob label="VALUE" value={input.value} min={0} max={1} isFloat={true} onChange={(val) => updateInput(i, { value: val })} size={40} color="var(--accent-primary)" />
                                <button onClick={() => updateInput(i, { isCycling: !input.isCycling })} style={{ background: input.isCycling ? 'rgba(0,255,0,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${input.isCycling ? 'rgba(0,255,0,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '9px', color: input.isCycling ? '#00ff00' : '#888', fontWeight: 'bold' }}>
                                  AUTO SWEEP
                                </button>
                              </div>
                            )}

                            {input.type === 'sample' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input type="file" accept="audio/*" onChange={(e) => e.target.files && handleSampleUpload(i, e.target.files[0])} style={{ display: 'none' }} id={`sample-${i}`} />
                                  <label htmlFor={`sample-${i}`} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '9px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>LOAD FILE</label>
                                  <button onClick={() => audioEngineRef.current.triggerGenerator(i)} style={{ background: 'rgba(0,255,0,0.2)', border: '1px solid rgba(0,255,0,0.4)', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Play size={10} color="#00ff00" />
                                  </button>
                                </div>
                                <button onClick={() => updateInput(i, { isLooping: !input.isLooping })} style={{ background: input.isLooping ? 'rgba(0,255,204,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${input.isLooping ? 'rgba(0,255,204,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '9px', color: input.isLooping ? '#00ffcc' : '#888', fontWeight: 'bold' }}>
                                  LOOP: {input.isLooping ? 'ON' : 'OFF'}
                                </button>
                              </div>
                            )}

                            {input.type === 'live' && (
                              <select value={input.deviceId} onChange={(e) => updateInput(i, { deviceId: e.target.value })} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '9px', padding: '4px', borderRadius: '4px', outline: 'none', maxWidth: '90%' }}>
                                <option value="default">Default Mic</option>
                                {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Input'}</option>)}
                              </select>
                            )}

                            {input.type === 'impulse' && (
                              <div style={{ color: '#666', fontSize: '9px', textAlign: 'center', fontStyle: 'italic' }}>1-sample trigger. Click header zap to fire.</div>
                            )}
                            
                            {input.type === 'test_noise' && (
                              <div style={{ color: '#00ffcc', fontSize: '9px', textAlign: 'center', fontWeight: 'bold' }}>White Noise Active</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeLabTab === 'seq' && (
                  <div className="sequencer-panel" style={{ height: '100%', overflowY: 'auto' }}>
                    <Sequencer 
                      steps={seqSteps} 
                      setSteps={setSeqSteps} 
                      bpm={seqBpm} 
                      setBpm={setSeqBpm} 
                      isPlaying={seqPlaying} 
                      setIsPlaying={setSeqPlaying} 
                      length={seqLength} 
                      setLength={setSeqLength} 
                      gateLength={seqGateLength}
                      setGateLength={setSeqGateLength}
                      mode={seqMode}
                      setMode={setSeqMode}
                      drumTracks={seqDrumTracks}
                      setDrumTracks={setSeqDrumTracks}
                      ccTracks={seqCCTracks}
                      setCCTracks={setSeqCCTracks}
                      ccLabels={ccLabels}
                      onSequencerStep={(cb) => audioEngineRef.current.onSequencerStep(cb)}
                      updateSequencer={(data) => audioEngineRef.current.setSequencer(data as any)}
                    />
                  </div>
                )}
                {activeLabTab === 'midi' && (
                  <div className="virtual-midi-panel" style={{ height: '100%', overflowY: 'auto' }}>
                    {!midiReady && (
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: '10px', background: '#151515' }}>
                        <div style={{ flex: 1, fontSize: '11px', color: '#888' }}>
                          MIDI not yet enabled — browser requires a click first.
                        </div>
                        <button
                          onClick={handleEnableMIDI}
                          style={{ background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '3px', padding: '5px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0 }}
                        >
                          Enable MIDI
                        </button>
                      </div>
                    )}
                    <VirtualMIDI 
                      onCC={(cc, val) => audioEngineRef.current.sendControlChange(cc, val, 0)} 
                      onNoteOn={(note, vel) => audioEngineRef.current.sendNoteOn(note, vel, 0)} 
                      onNoteOff={(note) => audioEngineRef.current.sendNoteOff(note, 0)} 
                      ccLabels={ccLabels} 
                      initialState={audioEngineRef.current.getLiveState()}
                    />
                  </div>
                )}
              </div>
            </div>
            </div>

            {!isMobile && mobileView !== 'panels' && (
            <div className="resize-handle-h" onMouseDown={startResizingH(setSidePanelWidth, 200, 600)} />
            )}
            <div className="side-panel" style={{ display: isMobile && mobileView !== 'panels' ? 'none' : 'flex', width: isMobile ? '100%' : `${sidePanelWidth}px` }}>
            <div className="scope-section">
              <div style={{ flex: '1 0 180px', minHeight: '180px' }}>
                <ScopeView getScopeData={() => audioEngineRef.current.getScopeData()} getProbedData={(name) => audioEngineRef.current.getProbedStates()[name] || null} probes={activeProbes} />
              </div>
              <div style={{ flex: '0 0 120px', height: '120px' }}>
                <SpectrumView 
                  getSpectrumData={() => audioEngineRef.current.getSpectrumData()} 
                  getPeakFrequencies={(count) => audioEngineRef.current.getPeakFrequencies(count)} 
                />
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <StatsView getDSPStats={() => audioEngineRef.current.getDSPStats()} />
              </div>
            </div>
            <div className="llm-section">
              {showHistory ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', borderLeft: '1px solid #333' }}>
                  <div style={{ padding: '12px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '14px', color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><History size={16} /> VERSION HISTORY</div>
                    <button onClick={() => saveSnapshot("Manual Snapshot")} style={{ background: '#333', border: '1px solid #444', color: 'var(--accent-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>SNAPSHOT</button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {codeHistory.length === 0 && <div style={{ padding: '20px', color: '#666', textAlign: 'center', fontSize: '12px' }}>No snapshots yet.</div>}
                    {codeHistory.map((entry, idx) => (
                      <div key={idx} style={{ padding: '10px', borderBottom: '1px solid #333', cursor: 'pointer', background: code === entry.code ? '#2d2d2d' : 'transparent', borderRadius: '4px', marginBottom: '4px', transition: 'all 0.2s' }} onClick={() => { setOriginalCode(code); setCode(entry.code); setDiffMode(true); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{entry.msg}</span><span style={{ fontSize: '9px', color: '#666' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span></div>
                        <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getCodeSummary(entry.code)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : showInspector ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <StateInspector onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)} onProbe={toggleProbe} onSetState={(path, val) => audioEngineRef.current.setState(path, val)} activeProbes={activeProbes} />
                  </div>
                  {activeProbes.length > 0 && (
                    <div className="mini-scope-section" style={{ height: '300px', padding: '10px', background: '#111', borderTop: '1px solid #333' }}>
                      <div className="section-title"><Activity size={12} /> PROBE SCOPE (MULTI-TRACE)</div>
                      <MultiScopeView probes={activeProbes} onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)} />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                  Use sidebar to open Inspector or History
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restore Session Modal */}
      {showRestoreModal && pendingRestore && (
        <div className="modal-overlay restore-session-overlay">
          <div className="modal-content restore-modal glass-morphism">
            <div className="restore-icon-container">
              <PackageOpen size={40} color="var(--accent-primary)" />
            </div>
            <h2>Restore Session?</h2>
            <p>We found an unsaved session from your last visit: <strong>{pendingRestore.name}</strong>. Would you like to continue where you left off?</p>
            
            <div className="restore-actions">
              <button 
                className="btn-restore-primary"
                onClick={() => {
                  setCode(pendingRestore.code);
                  setProjectName(pendingRestore.name);
                  setInputs(parseVultInputs(pendingRestore.code));
                  setCcLabels(parseVultCCs(pendingRestore.code));
                  setShowRestoreModal(false);
                }}
              >
                Restore Session
              </button>
              <button 
                className="btn-restore-secondary"
                onClick={() => {
                  handleNewProject();
                  setShowRestoreModal(false);
                }}
              >
                Start Fresh
              </button>
            </div>
            
            <label className="dont-ask-checkbox">
              <input 
                type="checkbox" 
                onChange={(e) => {
                  const pref = e.target.checked ? 'always' : 'ask';
                  localStorage.setItem('vult_restore_preference', pref);
                }}
              />
              <span>Don't ask me again (Always restore)</span>
            </label>
          </div>
        </div>
      )}

      <LLMPane 
        currentCode={code} 
        onUpdateCode={handleAgentUpdateCode} 
        onSetKnob={(cc, val) => audioEngineRef.current.sendControlChange(cc, val, 0)} 
        onTriggerGenerator={(idx) => audioEngineRef.current.triggerGenerator(idx)} 
        onConfigureInput={(idx, config) => updateInput(idx, config)} 
        onLoadPreset={(name) => loadPreset(name)} 
        onSaveSnapshot={(msg) => saveSnapshot(msg)} 
        onSetProbes={(probes) => { setActiveProbes(probes); audioEngineRef.current.setProbes(probes); }} 
        onConfigureSequencer={(bpm, steps, playing) => { if (bpm !== undefined) setSeqBpm(bpm); if (steps !== undefined) setSeqSteps(steps); if (playing !== undefined) setSeqPlaying(playing); }} 
        getPresets={() => Object.keys(PRESETS)} 
        getSequencerState={() => ({ bpm: seqBpm, steps: seqSteps, playing: seqPlaying })} 
        getTelemetry={() => audioEngineRef.current.getLiveState()} 
        getTelemetryHistory={() => audioEngineRef.current.getTelemetryHistory()} 
        getSpectrum={() => Array.from(audioEngineRef.current.getSpectrumData())} 
        getPeakFrequencies={(count) => audioEngineRef.current.getPeakFrequencies(count)} 
        getHarmonics={() => audioEngineRef.current.getHarmonics()} 
        getSignalQuality={() => audioEngineRef.current.getSignalQualityMetrics()} 
        getAudioMetrics={() => audioEngineRef.current.getAudioMetrics()} 
        systemPrompt={SYSTEM_PROMPT_BASE + `\nVULT VERSION CONTEXT: The compiler is currently set to: ${vultVersion === 'v0' ? 'Vult 0.4.15' : 'Vult v1'}.`} 
      />

      {showExportModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
          <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
            padding: '24px', width: '340px', display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Export Code</span>
              <span style={{ color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }} onClick={() => setShowExportModal(false)}>×</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Language</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {EXPORT_OPTIONS.map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                    borderRadius: '4px', cursor: 'pointer',
                    background: exportTarget === opt.value ? '#252525' : 'transparent',
                    border: `1px solid ${exportTarget === opt.value ? '#444' : 'transparent'}`,
                  }}> 
                    <input
                      type="radio"
                      name="exportTarget"
                      value={opt.value}
                      checked={exportTarget === opt.value}
                      onChange={() => setExportTarget(opt.value)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    <span style={{ color: exportTarget === opt.value ? '#e0e0e0' : '#888', fontSize: '13px' }}>{opt.label}</span>
                    <span style={{ marginLeft: 'auto', color: '#444', fontSize: '11px', fontFamily: 'monospace' }}>{opt.ext}</span>
                  </label>
                ))}
              </div>
            </div>

            {exportTarget === 'java' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Java Package Prefix</label>
                <input
                  type="text"
                  value={exportJavaPrefix}
                  onChange={e => setExportJavaPrefix(e.target.value)}
                  placeholder="com.example"
                  style={{
                    background: '#111', border: '1px solid #333', borderRadius: '4px',
                    color: '#e0e0e0', padding: '7px 10px', fontSize: '13px', fontFamily: 'monospace'
                  }}
                />
              </div>
            )}

            {exportStatus && (
              <div style={{
                padding: '8px 10px', borderRadius: '4px', fontSize: '12px',
                background: exportStatus.startsWith('Error') ? '#2a1515' : '#151a15',
                color: exportStatus.startsWith('Error') ? '#ff6666' : '#66cc66',
                border: `1px solid ${exportStatus.startsWith('Error') ? '#5a2020' : '#205a20'}`,
                wordBreak: 'break-word'
              }}>{exportStatus}</div>
            )}

            <button
              onClick={handleExport}
              disabled={exportStatus === 'Generating...'}
              style={{
                background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: '4px',
                padding: '9px 0', fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px',
                textTransform: 'uppercase', cursor: exportStatus === 'Generating...' ? 'not-allowed' : 'pointer',
                opacity: exportStatus === 'Generating...' ? 0.6 : 1
              }}
            >
              {exportStatus === 'Generating...' ? 'Generating...' : 'Export'}
            </button>
          </div>
        </div>
      )}

      {showCommunity && (
        <CommunityPresetsModal
          onClose={() => setShowCommunity(false)}
          onLoad={(code, name) => {
            handleLoadCode(code);
            setProjectName(name);
            setShowCommunity(false);
          }}
          onInsert={(code) => {
            vultEditorRef.current?.insertAtCursor(code);
            // Do not close modal on insert, allow multiple inserts
          }}
          communityGroups={communityGroups}
          communityLoading={communityLoading}
        />
      )}
    </div>
  );
};
export default App;
