import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PackageOpen } from 'lucide-react';
import { AudioEngine } from './AudioEngine';
import type { InputSource, SourceType } from './AudioEngine';
import { MIDIController } from './MIDIController';
import VultEditor from './VultEditor';
import type { VultEditorHandle } from './VultEditor';
import ScopeView from './components/analysis/ScopeView';
import SpectrumView from './components/analysis/SpectrumView';
import StatsView from './components/analysis/StatsView';
import { AIPanel } from './components/ai/AIPanel';
import StateInspector from './StateInspector';
import MultiScopeView from './components/analysis/MultiScopeView';
import { VirtualKeyboard } from './components/keyboard/VirtualKeyboard';
import { StepSequencer } from './components/sequencer/StepSequencer';
import type { Step } from './components/sequencer/StepSequencer';
import { InputsPanel } from './components/inputs/InputsPanel';
import PresetBrowser from './components/presets/PresetBrowser';
import JSZip from 'jszip';
import { PRESETS } from './constants/presets';
import { SYSTEM_PROMPT_BASE } from './constants/systemPrompt';
import { EXPORT_OPTIONS } from './constants/exportOptions';
import { parseVultError } from './utils/vultError';
import { AppShell } from './components/layout/AppShell';
import { BottomDock } from './components/layout/BottomDock';
import { RightPanel } from './components/layout/RightPanel';
import EditorPane from './components/editor/EditorPane';
import { usePanelManager } from './hooks/usePanelManager';
import type { PanelId } from './hooks/usePanelManager';
import { useCommandPalette } from './hooks/useCommandPalette';
import type { Command } from './hooks/useCommandPalette';
import { CommandPalette } from './components/palette/CommandPalette';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import type { Shortcut } from './hooks/useKeyboardShortcuts';
import ShortcutsOverlay from './components/shortcuts/ShortcutsOverlay';
import './styles/legacy.css';

const App: React.FC = () => {
  const [code, setCode] = useState(PRESETS["Minimal"]);
  const [projectName, setProjectName] = useState(() => {
    return localStorage.getItem('vult_session_name') || "My Vult Project";
  });
  
  const updateProjectName = (name: string) => {
    setProjectName(name);
    localStorage.setItem('vult_session_name', name);
  };
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vultVersion, setVultVersion] = useState<'v0' | 'v1'>('v1');
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
  const [seqCurrentStep, setSeqCurrentStep] = useState(-1);

  const midiNoteLedRef = useRef<HTMLDivElement>(null);
  const midiCcLedRef = useRef<HTMLDivElement>(null);
  const midiPulseTimeouts = useRef<{ note: any, cc: any }>({ note: null, cc: null });
  
  const [inputs, setInputs] = useState<InputSource[]>([]);
  const [midiInputs, setMidiInputs] = useState<any[]>([]);
  const [selectedMidiInput, setSelectedMidiInput] = useState<string>('all');


  const [midiReady, setMidiReady] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileView, setMobileView] = useState<'editor' | 'lab' | 'panels'>('editor');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTarget, setExportTarget] = useState('c');
  const [exportJavaPrefix, setExportJavaPrefix] = useState('com.example');
  const [exportTemplate, setExportTemplate] = useState('default');

  const handleExportTargetChange = (target: string) => {
    setExportTarget(target);
    if (target === 'c-pd') setExportTemplate('pd');
    else if (target === 'c-teensy') setExportTemplate('teensy');
    else if (target === 'c-juce') setExportTemplate('vult');
    else if (target === 'c') setExportTemplate('default');
  };
  const [exportStatus, setExportStatus] = useState('');


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
    
    // Pattern 1: if (control == 30) { label = ... }
    const ifRegex = /(?:if|else\s+if)\s*\(\s*(?:c|control|cc)\s*==\s*(\d+)\s*\)\s*\{?\s*(?:val|var)?\s*([a-zA-Z_]\w*)\s*=[^;]+;?\s*\}?\s*(?:\/\/+(.*))?/g;
    let match;
    ifRegex.lastIndex = 0;
    while ((match = ifRegex.exec(vultCode)) !== null) {
      const cc = parseInt(match[1]);
      const varName = match[2];
      const comment = match[3]?.trim();
      if (varName && !['if', 'else', 'val', 'mem', 'real', 'int', 'bool', 'return'].includes(varName)) {
        ccMap[cc] = comment || varName.toUpperCase().replace(/_CC$/, '');
      }
    }

    // Pattern 2: match (c) { 30 -> label = ... }
    const matchRegex = /(\d+)\s*->\s*\{?\s*(?:val|var)?\s*([a-zA-Z_]\w*)\s*=[^;]+;?\s*\}?\s*(?:\/\/+(.*))?/g;
    matchRegex.lastIndex = 0;
    while ((match = matchRegex.exec(vultCode)) !== null) {
      const cc = parseInt(match[1]);
      const varName = match[2];
      const comment = match[3]?.trim();
      if (varName && !['if', 'else', 'val', 'mem', 'real', 'int', 'bool', 'return'].includes(varName)) {
        ccMap[cc] = comment || varName.toUpperCase().replace(/_CC$/, '');
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
    const match = vultCode.match(/(?:fun|and)\s+process\s*\(([^)]*)\)/);
    if (!match) return [];
    const params = match[1].split(',').map(arg => {
      const parts = arg.trim().split(/\s*:\s*/);
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

  // Sync sequencer state to AudioWorklet
  useEffect(() => {
    audioEngineRef.current.setSequencer({
      isPlaying: seqPlaying, bpm: seqBpm, steps: seqSteps,
      length: seqLength, gateLength: seqGateLength, mode: seqMode,
      tracks: seqDrumTracks, ccTracks: seqCCTracks,
    } as any);
  }, [seqPlaying, seqBpm, seqSteps, seqLength, seqGateLength, seqMode, seqDrumTracks, seqCCTracks]);

  // Listen for sequencer step ticks from AudioWorklet
  useEffect(() => {
    return audioEngineRef.current.onSequencerStep((step: number) => {
      setSeqCurrentStep(step);
    });
  }, []);

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

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    if (skipNextUpdateRef.current) { skipNextUpdateRef.current = false; return; }
    
    // Check if it's actually different to avoid redundant state updates
    if (value === code) return;

    setCode(value);
    localStorage.setItem('vult_session_code', value);
    const newLabels = parseVultCCs(value);
    setCcLabels(newLabels);
    
    // Sync sequencer tracks without resetting existing step data if possible
    setSeqCCTracks(prev => {
      const newCCs = Object.keys(newLabels).map(Number);
      const existingCCs = prev.map(t => t.cc);
      
      // If nothing changed in the SET of CCs, just return prev
      if (newCCs.length === existingCCs.length && newCCs.every(cc => existingCCs.includes(cc))) {
        return prev;
      }
      
      // Otherwise, rebuild but keep existing steps for matches
      return newCCs.sort((a,b) => a-b).map(cc => {
        const existing = prev.find(t => t.cc === cc);
        return existing || { cc, steps: Array(128).fill(0) };
      });
    });

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

  const handleExport = async () => {
    const opt = EXPORT_OPTIONS.find(o => o.value === exportTarget);
    if (!opt) return;
    setExportStatus('Generating...');
    try {
      const body: Record<string, string> = { code, target: exportTarget, template: exportTemplate };
      if (exportTarget === 'java') body.javaPrefix = exportJavaPrefix;
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      if (data.files) {
        const zip = new JSZip();
        for (const [filename, content] of Object.entries(data.files)) {
          zip.file(filename, content as string);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, '_')}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        setExportStatus('Done');
        setTimeout(() => { setExportStatus(''); setShowExportModal(false); }, 800);
      } else if (data.code) {
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

  const panelManager = usePanelManager(null);

  const paletteCommands: Command[] = useMemo(() => [
    { id: 'toggle-editor', label: 'Toggle Editor Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('editor') },
    { id: 'toggle-inputs', label: 'Toggle Inputs Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('inputs') },
    { id: 'toggle-sequencer', label: 'Toggle Sequencer Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('sequencer') },
    { id: 'toggle-keyboard', label: 'Toggle MIDI Keyboard Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('keyboard') },
    { id: 'toggle-presets', label: 'Toggle Presets Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('presets') },
    { id: 'toggle-ai', label: 'Toggle AI Assistant Panel', shortcut: '', category: 'Panels', action: () => panelManager.togglePanel('ai') },
    { id: 'run', label: 'Run', shortcut: '', category: 'Transport', action: () => { if (!isPlaying) handleTogglePlay(); } },
    { id: 'stop', label: 'Stop', shortcut: '', category: 'Transport', action: () => { if (isPlaying) { audioEngineRef.current.stop(); setIsPlaying(false); setSeqPlaying(false); } } },
    { id: 'export', label: 'Export Code', shortcut: '', category: 'Project', action: () => setShowExportModal(true) },
    { id: 'vult-v0', label: 'Switch to Vult v0', shortcut: '', category: 'Settings', action: () => setVultVersion('v0') },
    { id: 'vult-v1', label: 'Switch to Vult v1', shortcut: '', category: 'Settings', action: () => setVultVersion('v1') },
    { id: 'save', label: 'Save Project', shortcut: '⌘S', category: 'Project', action: handleSave },
    { id: 'download', label: 'Download .vult File', shortcut: '', category: 'Project', action: handleDownload },
    { id: 'new-project', label: 'New Project', shortcut: '', category: 'Project', action: handleNewProject },
  ], [isPlaying, handleTogglePlay, handleSave, handleDownload, handleNewProject, panelManager]);

  const commandPalette = useCommandPalette(paletteCommands);

  const [showShortcuts, setShowShortcuts] = useState(false);

  const panelIds: PanelId[] = ['inputs', 'sequencer', 'keyboard', 'presets', 'ai'];

  const shortcuts: Shortcut[] = useMemo(() => [
    { key: 'Space', action: handleTogglePlay, description: 'Play / Stop', category: 'Transport' },
    { key: 'k', meta: true, action: () => commandPalette.open(), description: 'Command Palette', category: 'General' },
    { key: '/', meta: true, action: () => setShowShortcuts(prev => !prev), description: 'Toggle Shortcuts', category: 'General' },
    { key: '1', meta: true, action: () => panelManager.togglePanel('inputs'), description: 'Toggle Inputs', category: 'Panels' },
    { key: '2', meta: true, action: () => panelManager.togglePanel('sequencer'), description: 'Toggle Sequencer', category: 'Panels' },
    { key: '3', meta: true, action: () => panelManager.togglePanel('keyboard'), description: 'Toggle Keyboard', category: 'Panels' },
    { key: '4', meta: true, action: () => panelManager.togglePanel('presets'), description: 'Toggle Presets', category: 'Panels' },
    { key: '5', meta: true, action: () => panelManager.togglePanel('ai'), description: 'Toggle AI', category: 'Panels' },
  ], [handleTogglePlay, commandPalette.open, panelManager]);

  useKeyboardShortcuts(shortcuts);

  const panelTitles: Record<PanelId, string> = {
    editor: 'Editor',
    inputs: 'Inputs',
    sequencer: 'Sequencer',
    keyboard: 'MIDI Keyboard',
    presets: 'Presets',
    ai: 'AI Assistant',
    settings: 'Settings',
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
    <>
      <AppShell
        projectName={projectName}
        isPlaying={isPlaying}
        onPlay={handleTogglePlay}
        onStop={() => { audioEngineRef.current.stop(); setIsPlaying(false); setSeqPlaying(false); }}
        vultVersion={vultVersion}
        onVultVersionChange={setVultVersion}
        sampleRate={audioEngineRef.current?.audioContext?.sampleRate || 48000}
        bufferSize={128}
        onExport={() => setShowExportModal(true)}
        onCommandPalette={commandPalette.open}
        activePanel={panelManager.activeRightPanel}
        onPanelToggle={(panel: string) => panelManager.togglePanel(panel as PanelId)}
        status={status.includes('Error') || status.includes('Crash') ? 'error' : status === 'Running' ? 'ready' : 'ready'}
        cpuPercent={0}
        latencyMs={128 / (audioEngineRef.current?.audioContext?.sampleRate || 48000) * 1000}
        rightPanel={
          panelManager.activeRightPanel ? (
            <RightPanel
              visible={!!panelManager.activeRightPanel}
              title={panelTitles[panelManager.activeRightPanel] || ''}
              onClose={panelManager.closePanel}
              onUndock={() => panelManager.activeRightPanel && panelManager.undockPanel(panelManager.activeRightPanel)}
            >
              {panelManager.activeRightPanel === 'ai' && (
                <AIPanel
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
              )}
              {panelManager.activeRightPanel === 'sequencer' && (
                <StepSequencer
                  steps={seqSteps}
                  onStepsChange={setSeqSteps}
                  bpm={seqBpm}
                  onBpmChange={setSeqBpm}
                  isPlaying={seqPlaying}
                  onPlayToggle={() => setSeqPlaying(p => !p)}
                  length={seqLength}
                  onLengthChange={setSeqLength}
                  gateLength={seqGateLength}
                  onGateLengthChange={setSeqGateLength}
                  mode={seqMode}
                  onModeChange={setSeqMode}
                  drumTracks={seqDrumTracks}
                  onDrumTracksChange={setSeqDrumTracks}
                  ccTracks={seqCCTracks}
                  onCCTracksChange={setSeqCCTracks}
                  currentStep={seqCurrentStep}
                />
              )}
              {panelManager.activeRightPanel === 'keyboard' && (
                <VirtualKeyboard
                  onNoteOn={(note, vel) => audioEngineRef.current.sendNoteOn(note, vel, 0)}
                  onNoteOff={(note) => audioEngineRef.current.sendNoteOff(note, 0)}
                  onCC={(cc, val) => audioEngineRef.current.sendControlChange(cc, val, 0)}
                  ccLabels={ccLabels}
                />
              )}
              {panelManager.activeRightPanel === 'inputs' && (
                <InputsPanel
                  inputs={inputs}
                  onInputChange={updateInput}
                  onTrigger={(idx) => audioEngineRef.current.triggerGenerator(idx)}
                  onSampleUpload={handleSampleUpload}
                  audioDevices={audioDevices}
                />
              )}
              {panelManager.activeRightPanel === 'presets' && (
                <PresetBrowser
                  onLoad={(presetCode, name) => {
                    handleLoadCode(presetCode);
                    if (name) setProjectName(name);
                  }}
                />
              )}
            </RightPanel>
          ) : null
        }
      >
        <EditorPane
          ref={vultEditorRef}
          fileName={projectName + '.vult'}
          code={code}
          onChange={(value: string) => handleCodeChange(value)}
          markers={editorMarkers}
          diffMode={diffMode}
          diffCode={originalCode}
          onStateUpdate={(cb) => audioEngineRef.current.onStateUpdate(cb)}
        />
        {diffMode && (
          <div style={{ position: 'absolute', bottom: '20px', right: '20px', display: 'flex', gap: '10px', zIndex: 100 }}>
            <button onClick={handleRejectDiff} style={{ background: '#444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>REJECT</button>
            <button onClick={handleAcceptDiff} style={{ background: '#007acc', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>ACCEPT & COMPILE</button>
          </div>
        )}
        <BottomDock>
          <div style={{ display: 'flex', gap: 8, height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: '2 1 0', minWidth: 0 }}>
              <ScopeView getScopeData={() => audioEngineRef.current.getScopeData()} getProbedData={(name) => audioEngineRef.current.getProbedStates()[name] || null} probes={activeProbes} />
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <SpectrumView
                getSpectrumData={() => audioEngineRef.current.getSpectrumData()}
                getPeakFrequencies={(count) => audioEngineRef.current.getPeakFrequencies(count)}
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <StatsView getDSPStats={() => audioEngineRef.current.getDSPStats()} />
            </div>
          </div>
        </BottomDock>
      </AppShell>

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

      {showExportModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-panel)', padding: '24px', width: '340px',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>Export</span>
              <span
                style={{
                  color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1,
                  background: 'transparent', border: 'none', padding: '2px 6px', borderRadius: 'var(--radius-control)',
                  transition: 'var(--transition-fast)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-control)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => setShowExportModal(false)}
              >&times;</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Language</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {EXPORT_OPTIONS.map(opt => (
                  <label key={opt.value} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                    borderRadius: 'var(--radius-control)', cursor: 'pointer',
                    background: exportTarget === opt.value ? 'var(--bg-control)' : 'transparent',
                    border: `1px solid ${exportTarget === opt.value ? 'var(--border-strong)' : 'transparent'}`,
                    transition: 'var(--transition-fast)',
                  }}>
                    <input
                      type="radio"
                      name="exportTarget"
                      value={opt.value}
                      checked={exportTarget === opt.value}
                      onChange={() => handleExportTargetChange(opt.value)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    <span style={{ color: exportTarget === opt.value ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '13px' }}>{opt.label}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 'var(--font-size-secondary)', fontFamily: 'var(--font-mono)' }}>{opt.ext}</span>
                  </label>
                ))}
              </div>
            </div>

            {exportTarget === 'java' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Java Package Prefix</label>
                <input
                  type="text"
                  value={exportJavaPrefix}
                  onChange={e => setExportJavaPrefix(e.target.value)}
                  placeholder="com.example"
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-control)',
                    color: 'var(--text-primary)', padding: '7px 10px', fontSize: '13px', fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
            )}

            {exportTarget === 'c' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Template</label>
                <select
                  value={exportTemplate}
                  onChange={e => setExportTemplate(e.target.value)}
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-control)',
                    color: 'var(--text-primary)', padding: '7px 10px', fontSize: '13px',
                  }}
                >
                  <option value="default">Default</option>
                  <option value="none">None</option>
                  <option value="arduino">Arduino</option>
                  <option value="teensy">Teensy</option>
                  <option value="pd">Pure Data</option>
                  <option value="max">Max/MSP</option>
                  <option value="modelica">Modelica</option>
                  <option value="performance">Performance</option>
                </select>
              </div>
            )}

            {exportStatus && (
              <div style={{
                padding: '8px 10px', borderRadius: 'var(--radius-control)', fontSize: 'var(--font-size-body)',
                background: exportStatus.startsWith('Error') ? 'rgba(255, 107, 53, 0.1)' : 'rgba(78, 205, 196, 0.1)',
                color: exportStatus.startsWith('Error') ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                border: `1px solid ${exportStatus.startsWith('Error') ? 'rgba(255, 107, 53, 0.3)' : 'rgba(78, 205, 196, 0.3)'}`,
                wordBreak: 'break-word',
              }}>
                {exportStatus === 'Generating...'
                  ? <span style={{ color: 'var(--text-muted)' }}>{exportStatus}</span>
                  : exportStatus}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exportStatus === 'Generating...'}
              style={{
                background: 'var(--accent-primary)', color: '#000', border: 'none',
                borderRadius: 'var(--radius-control)', padding: '9px 0', fontWeight: 600,
                fontSize: 'var(--font-size-body)', letterSpacing: '1px', textTransform: 'uppercase',
                cursor: exportStatus === 'Generating...' ? 'not-allowed' : 'pointer',
                opacity: exportStatus === 'Generating...' ? 0.6 : 1,
                transition: 'var(--transition-fast)',
              }}
            >
              {exportStatus === 'Generating...' ? 'Generating...' : 'Export'}
            </button>
          </div>
        </div>
      )}


      <CommandPalette
        isOpen={commandPalette.isOpen}
        query={commandPalette.query}
        onQueryChange={commandPalette.setQuery}
        commands={commandPalette.filteredCommands}
        onExecute={commandPalette.execute}
        onClose={commandPalette.close}
      />

      <ShortcutsOverlay
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
      />
    </>
  );
};
export default App;
