import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Send, Loader2, Settings, Activity, StopCircle, ChevronDown, ChevronRight, Maximize2, Trash2, Copy, Check, Brain, Terminal, MessageSquare, Zap, BookOpen, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-javascript';

export interface LLMPaneHandle {
  /** Programmatically send a message to the agent, as if the user typed it. */
  sendMessage: (text: string) => void;
}

interface LLMPaneProps {
  currentCode: string;
  onUpdateCode: (code: string) => Promise<{success: boolean, error?: string}>;
  onSetKnob: (cc: number, value: number) => void;
  onTriggerGenerator: (index: number) => void;
  onConfigureInput: (index: number, config: any) => void;
  onLoadPreset: (name: string) => void;
  onSaveSnapshot: (message: string) => void;
  onSetProbes: (probes: string[]) => void;
  onConfigureSequencer: (bpm?: number, steps?: any[], playing?: boolean) => void;
  getPresets: () => string[];
  getSequencerState: () => any;
  getTelemetry: () => Record<string, any>;
  getTelemetryHistory: () => Record<string, any>[];
  getSpectrum: () => number[];
  getPeakFrequencies: (count?: number) => {energy: number, frequency: number}[];
  getHarmonics: () => any;
  getSignalQuality: () => any;
  getAudioMetrics: () => Record<string, number>;
  systemPrompt: string;
}

const CodeBlock = ({ code, language, onApply }: { code: string, language?: string, onApply?: (code: string) => void }) => {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (onApply) {
      onApply(code);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  };

  const highlighted = useMemo(() => {
    const lang = language || 'vult';
    const prismLang = Prism.languages[lang] || Prism.languages.clike;
    return Prism.highlight(code, prismLang, lang);
  }, [code, language]);

  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', fontSize: '10px', color: '#888' }}>
        <span style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}>{language || 'vult'}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCopy} style={{ background: 'transparent', border: 'none', color: copied ? '#00ff00' : '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'COPIED' : 'COPY'}
          </button>
          {onApply && (
            <button onClick={handleApply} style={{ background: 'transparent', border: 'none', color: applied ? '#00ff00' : 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 'bold' }}>
              {applied ? <Check size={12} /> : <Zap size={12} />} {applied ? 'APPLIED' : 'APPLY'}
            </button>
          )}
        </div>
      </div>
      <pre style={{ margin: 0, padding: '12px', fontSize: '11px', overflowX: 'auto', background: 'transparent' }}>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
};

type MessagePart = { 
  text?: string; 
  thought?: string; 
  functionCall?: any; 
  functionResponse?: any;
  thought_signature?: string;
  thoughtSignature?: string; // Handle both cases for API stability
};
type Message = { role: 'user' | 'model', parts: MessagePart[] };

const LLMPane = forwardRef<LLMPaneHandle, LLMPaneProps>(({ 
  currentCode, onUpdateCode, onSetKnob, onTriggerGenerator, 
  onConfigureInput, onLoadPreset, onSaveSnapshot, onSetProbes, onConfigureSequencer, 
  getPresets, getSequencerState, getTelemetry, getTelemetryHistory, getSpectrum, getPeakFrequencies, getHarmonics, getSignalQuality, getAudioMetrics, systemPrompt 
}, llmRef) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInspirationLoading, setIsInspirationLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [displayMessages, setDisplayMessages] = useState<{ 
    role: 'user' | 'assistant' | 'system' | 'thought', 
    content: string, 
    id: string,
    isStreaming?: boolean,
    choices?: {label: string, value: string}[]
  }[]>([]);

  const [provider, setProvider] = useState<'gemini' | 'openai' | 'anthropic'>('gemini');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-flash-lite-latest');
  const [showSettings, setShowSettings] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [currentTurn, setCurrentTurn] = useState(0);
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [agentMemory, setAgentMemory] = useState("");
  const [elapsedTurn, setElapsedTurn] = useState(0);
  const [elapsedSession, setElapsedSession] = useState(0);
  
  const [widgetState, setWidgetState] = useState(() => ({
    width: 360,
    height: 550,
    x: typeof window !== 'undefined' ? window.innerWidth - 380 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 570 : 0
  }));

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX - widgetState.x;
    const startY = e.clientY - widgetState.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setWidgetState(prev => ({ 
        ...prev, 
        x: Math.max(0, Math.min(window.innerWidth - prev.width, moveEvent.clientX - startX)), 
        y: Math.max(0, Math.min(window.innerHeight - prev.height, moveEvent.clientY - startY)) 
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = widgetState.width;
    const startHeight = widgetState.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setWidgetState(prev => ({
        ...prev,
        width: Math.max(300, startWidth + (moveEvent.clientX - startX)),
        height: Math.max(300, startHeight + (moveEvent.clientY - startY))
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(currentCode);
  const planRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const askUserResolverRef = useRef<((val: string) => void) | null>(null);
  const stopFlagRef = useRef(false);

  const handleSendMessage = (text: string) => {
    if (isLoading) return;
    setInput('');
    setIsLoading(true);
    addDisplayMsg('user', text);
    if (provider === 'gemini' && !apiKey) {
      addDisplayMsg('assistant', "API key missing. Open Settings to add your key.");
      setIsLoading(false);
      return;
    }
    const newMsg: Message = { role: 'user', parts: [{ text }] };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      setTimeout(() => processAgentLoop(updated), 0);
      return updated;
    });
  };
  const getFullSystemPrompt = () => {
    const memoryContext = agentMemory ? `\n### AGENT LONG-TERM MEMORY (PERSISTENT FACTS):\n${agentMemory}\n` : '';
    return `${systemPrompt}\n${memoryContext}\nALWAYS be verbose and detailed about your DSP logic and actions. Explain WHY you are making changes.`;
  };


  // Expose sendMessage so parent can trigger agent programmatically
  // (e.g. from Monaco editor right-click actions)
  useImperativeHandle(llmRef, () => ({
    sendMessage(text: string) {
      handleSendMessage(text);
    },
  }));

  useEffect(() => {
    const handleAskAgent = (e: any) => {
      if (e.detail?.prompt) {
        if (e.detail.autoSend) {
          handleSendMessage(e.detail.prompt);
        } else {
          setInput(e.detail.prompt);
        }
      }
    };
    window.addEventListener('dsplab:ask-agent', handleAskAgent);
    return () => window.removeEventListener('dsplab:ask-agent', handleAskAgent);
  }, [isLoading]); // Need isLoading dependency for handleSendMessage

  useEffect(() => { codeRef.current = currentCode; }, [currentCode]);

  useEffect(() => {
    const savedProvider = localStorage.getItem('llm_provider') as 'gemini' | 'openai' | 'anthropic';
    if (savedProvider) setProvider(savedProvider);
    const savedEndpoint = localStorage.getItem('llm_endpoint');
    if (savedEndpoint) setEndpoint(savedEndpoint);
    const savedKey = localStorage.getItem('llm_api_key');
    if (savedKey) setApiKey(savedKey);
    const savedModel = localStorage.getItem('llm_model_name');
    if (savedModel) setModelName(savedModel);
    const savedTokens = localStorage.getItem('llm_tokens');
    if (savedTokens) setTokens(JSON.parse(savedTokens));

    const savedMsgs = localStorage.getItem('llm_messages');
    if (savedMsgs) setMessages(JSON.parse(savedMsgs));

    const savedDisplayMsgs = localStorage.getItem('llm_display_messages');
    if (savedDisplayMsgs) setDisplayMessages(JSON.parse(savedDisplayMsgs));

    const savedMemory = localStorage.getItem('dsplab_agent_memory');
    if (savedMemory) setAgentMemory(savedMemory);
  }, []);

  // Persist messages whenever they change
  useEffect(() => {
    localStorage.setItem('llm_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('llm_display_messages', JSON.stringify(displayMessages));
  }, [displayMessages]);

  useEffect(() => {
    localStorage.setItem('dsplab_agent_memory', agentMemory);
  }, [agentMemory]);

  const handleClearChat = () => {
    setMessages([]);
    setDisplayMessages([]);
    localStorage.removeItem('llm_messages');
    localStorage.removeItem('llm_display_messages');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    let timer: number;
    if (isLoading) {
      timer = window.setInterval(() => {
        if (turnStartTime) setElapsedTurn(Math.floor((Date.now() - turnStartTime) / 1000));
        if (sessionStartTime) setElapsedSession(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLoading, turnStartTime, sessionStartTime]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, isLoading, status]);

  const handleSaveSettings = (newProvider: 'gemini' | 'openai' | 'anthropic', newEndpoint: string, key: string, model: string) => {
    setProvider(newProvider);
    setEndpoint(newEndpoint);
    setApiKey(key);
    setModelName(model);
    localStorage.setItem('llm_provider', newProvider);
    localStorage.setItem('llm_endpoint', newEndpoint);
    localStorage.setItem('llm_api_key', key);
    localStorage.setItem('llm_model_name', model);
  };

  const updateTokens = (usage: any) => {
    if (!usage) return;
    setTokens(prev => {
      const p = (usage.prompt_token_count || usage.prompt_tokens || 0);
      const c = (usage.candidates_token_count || usage.completion_tokens || 0);
      const t = (usage.total_token_count || usage.total_tokens || (p + c));
      
      const next = {
        prompt: prev.prompt + p,
        completion: prev.completion + c,
        total: prev.total + t
      };
      localStorage.setItem('llm_tokens', JSON.stringify(next));
      return next;
    });
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addDisplayMsg = (role: 'user' | 'assistant' | 'system' | 'thought', content: string, id: string = Math.random().toString(36), isStreaming = false, choices?: {label: string, value: string}[]) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedContent = role === 'system' ? `[${timestamp}] ${content}` : content;
    
    setDisplayMessages(prev => {
      if (isStreaming && prev.length > 0 && prev[prev.length - 1].id === id) {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: prev[prev.length - 1].content + content };
        return next;
      }
      return [...prev, { role, content: formattedContent, id, isStreaming, choices }];
    });
    // Auto-expand if it's a thought and streaming
    if (role === 'thought') {
      setExpandedThoughts(prev => new Set(prev).add(id));
    }
    return id;
  };

  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'info'>('chat');

  const suggestions = [
    { label: "High-end Reverb", prompt: "Implement a high-quality stereo FDN or Schroeder reverb. Use multiple allpass and comb filters." },
    { label: "Analog VCO", prompt: "Create a stable, anti-aliased oscillator with Saw, Square, and Sine outputs. Use PolyBLEP if needed." },
    { label: "Moog Ladder", prompt: "Implement a classic 4-pole Moog ladder resonant low-pass filter with non-linear saturation." },
    { label: "Polyphonic Kit", prompt: "Refactor the current code to support 8-voice polyphony using an array of instances and a voice allocator." }
  ];

  const finalizeStreamingMsg = (id: string) => {
    setDisplayMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], isStreaming: false };
        return next;
      }
      return prev;
    });
  };

  const getToolsDef = () => {
    return [
      {
        name: "complete_task",
        description: "Signals that the requested engineering goal is finished and has been verified. You MUST call this to end your autonomous loop. Provide a concise summary of the verification results.",
        parameters: {
          type: "OBJECT",
          properties: {
            verification_summary: { type: "STRING", description: "Technical proof that the code works (e.g. 'SNR is 80dB, harmonic peaks verified')." }
          },
          required: ["verification_summary"]
        }
      },
      {
        name: "show_function",
        description: "Returns the complete source code of a specific function by its name. Use this to inspect implementation details without reading the entire file.",
        parameters: {
          type: "OBJECT",
          properties: {
            function_name: { type: "STRING", description: "The name of the function to show." }
          },
          required: ["function_name"]
        }
      },
      {
        name: "delete_function",
        description: "Removes an entire function definition from the source code by its name.",
        parameters: {
          type: "OBJECT",
          properties: {
            function_name: { type: "STRING", description: "The name of the function to delete." }
          },
          required: ["function_name"]
        }
      },
      {
        name: "replace_function",
        description: "Replaces the entire body of a specific function by its name. This is faster and safer than line-based editing for functional updates.",
        parameters: {
          type: "OBJECT",
          properties: {
            function_name: { type: "STRING", description: "The name of the function to replace." },
            new_code: { type: "STRING", description: "The COMPLETE new definition of the function (starting with fun or and)." }
          },
          required: ["function_name", "new_code"]
        }
      },
      {
        name: "fix_boilerplate",
        description: "Automatically injects missing mandatory handlers (noteOn, noteOff, controlChange, default) if they are absent from the code.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "update_code",
        description: "CRITICAL: Overwrites the ENTIRE source code. You MUST provide the complete program including process, noteOn, noteOff etc. NEVER use this for partial snippets; use apply_diff or edit_lines for those.",
        parameters: {
          type: "OBJECT",
          properties: { new_code: { type: "STRING", description: "The COMPLETE new source code for the project." } },
          required: ["new_code"]
        }
      },
      {
        name: "edit_lines",
        description: "Replaces a specific block of lines in the code with new code.",
        parameters: {
          type: "OBJECT",
          properties: {
            start_line: { type: "NUMBER", description: "The 1-based line number to start replacing from (inclusive)." },
            end_line: { type: "NUMBER", description: "The 1-based line number to end replacing at (inclusive)." },
            new_code: { type: "STRING", description: "The new code to insert in place of those lines." }
          },
          required: ["start_line", "end_line", "new_code"]
        }
      },
      {
        name: "apply_diff",
        description: "Applies a surgical replacement in the code. Replaces 'old_string' with 'new_string'. Use significant context to avoid ambiguity.",
        parameters: {
          type: "OBJECT",
          properties: {
            old_string: { type: "STRING", description: "The exact literal text to find." },
            new_string: { type: "STRING", description: "The text to replace it with." }
          },
          required: ["old_string", "new_string"]
        }
      },
      {
        name: "grep_search",
        description: "Searches for a regex pattern in the current code and returns matching lines with numbers.",
        parameters: {
          type: "OBJECT",
          properties: { pattern: { type: "STRING", description: "The regex pattern to search for." } },
          required: ["pattern"]
        }
      },
      {
        name: "get_current_code",
        description: "Retrieves the current Vult code from the editor.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "set_knob",
        description: "Sets a virtual CC knob value (30-41). Values range from 0 to 127.",
        parameters: {
          type: "OBJECT",
          properties: {
            cc: { type: "NUMBER", description: "The CC number (30-41)." },
            value: { type: "NUMBER", description: "The value (0-127)." }
          },
          required: ["cc", "value"]
        }
      },
      {
        name: "send_midi_cc",
        description: "Sends a general MIDI CC message (0-127). Values range from 0 to 127.",
        parameters: {
          type: "OBJECT",
          properties: {
            cc: { type: "NUMBER", description: "The CC number (0-127)." },
            value: { type: "NUMBER", description: "The value (0-127)." }
          },
          required: ["cc", "value"]
        }
      },
      {
        name: "trigger_generator",
        description: "Triggers a laboratory generator (Impulse, Step, Sweep) on a specific input strip.",
        parameters: {
          type: "OBJECT",
          properties: { index: { type: "NUMBER", description: "The input strip index (0-based)." } },
          required: ["index"]
        }
      },
      {
        name: "configure_lab_input",
        description: "Configures a DSP Lab input strip type and parameters.",
        parameters: {
          type: "OBJECT",
          properties: {
            index: { type: "NUMBER", description: "The input strip index." },
            type: { type: "STRING", enum: ["oscillator", "cv", "impulse", "step", "sweep", "test_noise", "silence"], description: "The source type." },
            freq: { type: "NUMBER", description: "Frequency if oscillator." },
            oscType: { type: "STRING", enum: ["sine", "sawtooth", "square", "triangle"], description: "Oscillator shape." }
          },
          required: ["index", "type"]
        }
      },
      {
        name: "load_preset",
        description: "Loads one of the built-in Vult presets.",
        parameters: {
          type: "OBJECT",
          properties: { name: { type: "STRING", description: "The preset name." } },
          required: ["name"]
        }
      },
      {
        name: "configure_sequencer",
        description: "Configures the note roll sequencer. Use this to test patches with melodies.",
        parameters: {
          type: "OBJECT",
          properties: {
            bpm: { type: "NUMBER", description: "Tempo in BPM." },
            playing: { type: "BOOLEAN", description: "Whether the sequencer should be running." },
            steps: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  active: { type: "BOOLEAN" },
                  note: { type: "NUMBER", description: "MIDI note number." }
                }
              },
              description: "Full array of 16 steps."
            }
          }
        }
      },
      {
        name: "get_sequencer_state",
        description: "Returns the current state of the sequencer (BPM, steps, playing status).",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "list_presets",
        description: "Returns a list of available preset names.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_live_telemetry",
        description: "Retrieves current values of internal Vult variables. If the state is large, use the 'filter' parameter to find specific modules or variables. Results are capped at 100 by default to ensure performance.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter: { type: "STRING", description: "Optional regex pattern to filter keys (e.g. 'osc1' or 'filter')." },
            limit: { type: "NUMBER", description: "Max number of variables to return (default 100)." }
          }
        }
      },
      {
        name: "get_state",
        description: "Retrieves the value of a specific internal variable by its key path (e.g. 'voice1.env'). Use this for precise verification.",
        parameters: {
          type: "OBJECT",
          properties: {
            key: { type: "STRING", description: "The full path of the variable." }
          },
          required: ["key"]
        }
      },
      {
        name: "get_state_history",
        description: "Retrieves a list of recent values for a specific variable (max 10). Use this to track changes over time, like envelope sweeps or state transitions.",
        parameters: {
          type: "OBJECT",
          properties: {
            key: { type: "STRING", description: "The full path of the variable." },
            count: { type: "NUMBER", description: "Number of historical snapshots to return (default 5, max 10)." }
          },
          required: ["key"]
        }
      },
      {
        name: "get_spectrum_data",
        description: "Retrieves a snapshot of the current 1024-band frequency spectrum of the output signal. Use this to verify audio activity or filter performance.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_peak_frequencies",
        description: "Analyzes the current spectrum and returns the frequencies (in Hz) with the most energy. Useful for verifying oscillator pitch or resonant peaks.",
        parameters: {
          type: "OBJECT",
          properties: {
            count: { type: "NUMBER", description: "Number of peak frequencies to return (default 3)." }
          }
        }
      },
      {
        name: "get_harmonics",
        description: "Analyzes the harmonic content of the output signal. Identifies the fundamental frequency and the relative strength of the first 8 harmonics. Use this to verify waveform shapes (e.g. square vs sawtooth) or filter saturation.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_signal_quality",
        description: "Calculates advanced signal quality metrics including THD+N (Total Harmonic Distortion + Noise), SNR (Signal-to-Noise Ratio), and Peak Level in dBFS. Use this for high-precision technical audio analysis.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_audio_metrics",
        description: "Retrieves real-time audio metrics: Peak Level, RMS, Clipping Count, and Headroom (dB). It will wait the specified duration (in milliseconds) before taking the measurement, allowing audio to process.",
        parameters: { 
          type: "OBJECT", 
          properties: {
            wait_ms: { type: "NUMBER", description: "Time to wait in milliseconds before measuring (e.g., 500 or 1000). Default is 500." }
          } 
        }
      },
      {
        name: "ask_user",
        description: "Asks the user a question. Can include multiple choice options for quick responses.",
        parameters: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING", description: "The question to ask the user." },
            options: { 
              type: "ARRAY", 
              items: { 
                type: "OBJECT",
                properties: {
                  label: { type: "STRING", description: "Display text for the button." },
                  value: { type: "STRING", description: "Technical value returned to the agent when selected." }
                }
              },
              description: "Optional list of predefined choices for the user."
            }
          },
          required: ["question"]
        }
      },      {
        name: "user_message",
        description: "Displays a status message or update to the user.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING", description: "The message to display." }
          },
          required: ["message"]
        }
      },
      {
        name: "store_memory",
        description: "Stores a persistent technical fact, engineering preference, or project-specific detail in your long-term Prompt Memory. This memory persists across sessions and models. Use this to remember user stylistic choices, complex algorithm details, or verified DSP findings.",
        parameters: {
          type: "OBJECT",
          properties: {
            fact: { type: "STRING", description: "The specific fact or preference to remember (e.g. 'User prefers 0-1 range for all internal variables')." }
          },
          required: ["fact"]
        }
      },
      {
        name: "get_memory",
        description: "Retrieves all currently stored persistent memories from your long-term Prompt Memory. Use this at the start of a session or when uncertain about user preferences.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "multi_edit",
        description: "Applies multiple line-block edits in a single turn. Automatically handles line shifts. Provide edits in any order.",
        parameters: {
          type: "OBJECT",
          properties: {
            edits: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  start_line: { type: "NUMBER", description: "1-based start line." },
                  end_line: { type: "NUMBER", description: "1-based end line." },
                  new_code: { type: "STRING", description: "New code for this range." }
                },
                required: ["start_line", "end_line", "new_code"]
              }
            }
          },
          required: ["edits"]
        }
      },
      {
        name: "set_probes",
        description: "Configures which internal 'mem' variables should be active in the multi-trace scope (max 6).",
        parameters: {
          type: "OBJECT",
          properties: {
            probes: { type: "ARRAY", items: { type: "STRING" }, description: "List of variable paths (e.g. ['voice1.env', 'lfo_val'])." }
          },
          required: ["probes"]
        }
      },
      {
        name: "list_functions",
        description: "Parses the current code and returns a list of all defined function signatures (name, parameters, return type).",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_vult_reference",
        description: "Returns a concise technical reference guide for the Vult language (types, syntax, operators, and built-in functions).",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_development_plan",
        description: "Retrieves the currently documented internal development plan. Use this to ensure you are following the agreed-upon strategy.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "set_multiple_knobs",
        description: "Adjusts multiple laboratory knobs (MIDI CCs) in a single action. Use this for complex parameter setups.",
        parameters: {
          type: "OBJECT",
          properties: {
            knobs: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  cc: { type: "NUMBER", description: "The MIDI CC number (30-41)." },
                  value: { type: "NUMBER", description: "The value (0.0 to 1.0)." }
                },
                required: ["cc", "value"]
              }
            }
          },
          required: ["knobs"]
        }
      },
      {
        name: "write_plan",
        description: "Documents your multi-step plan internally before execution. Use this to break down complex DSP tasks.",
        parameters: {
          type: "OBJECT",
          properties: {
            plan: { type: "STRING", description: "The detailed step-by-step development plan." }
          },
          required: ["plan"]
        }
      },
      {
        name: "store_snapshot",
        description: "Saves a named version of the current code to the history. Use this to create restore points before making risky changes.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING", description: "A descriptive name or comment for this snapshot (like a commit message)." }
          },
          required: ["message"]
        }
      },
      {
        name: "tell",
        description: "Sends a status update, progress report, or informative message to the user while performing complex tasks.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING", description: "The message to display to the user." }
          },
          required: ["message"]
        }
      }
    ];
  };

  const callGeminiStream = async (currentMessages: Message[]) => {
    // Map history to Gemini API format, ensuring each part object 
    // contains ONLY one data field (oneof constraint).
    const mappedContents = currentMessages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: m.parts.flatMap(p => {
        const apiParts: any[] = [];
        // Metadata fields that should be preserved on split parts
        const metadata: any = {};
        if (p.thought_signature) metadata.thought_signature = p.thought_signature;
        if (p.thoughtSignature) metadata.thoughtSignature = p.thoughtSignature;

        if (p.thought) {
          apiParts.push({ thought: p.thought, ...metadata });
        }
        if (p.text) {
          apiParts.push({ text: p.text, ...metadata });
        }
        if (p.functionCall) {
          apiParts.push({ functionCall: p.functionCall, ...metadata });
        }
        if (p.functionResponse) {
          apiParts.push({ functionResponse: p.functionResponse, ...metadata });
        }

        if (apiParts.length === 0) return [{ text: "" }];
        return apiParts;
      })    }));

    const payload = {
      contents: mappedContents,
      systemInstruction: { 
        parts: [{ text: getFullSystemPrompt() }] 
      },
      tools: [{ functionDeclarations: getToolsDef() }],
      generationConfig: { temperature: 0.1 }
    };
    abortControllerRef.current = new AbortController();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      let msg = err.error?.message || response.statusText;
      if (response.status === 429) msg = "429: Quota exceeded or rate limited.";
      if (response.status === 401) msg = "401: Invalid API key.";
      throw new Error(msg);
    }    return response.body;
  };

  const callOpenAIStream = async (currentMessages: Message[]) => {
    const openaiMessages = [
      { role: "system", content: getFullSystemPrompt() }
    ];

    for (const msg of currentMessages) {
      if (msg.role === 'user') {
        let content = "";
        for (const p of msg.parts) {
          if (p.text) content += p.text + "\n";
          if (p.functionResponse) {
            content += `Function ${p.functionResponse.name} response: ${JSON.stringify(p.functionResponse.response)}\n`;
          }
        }
        openaiMessages.push({ role: "user", content });
      } else if (msg.role === 'model') {
        let content = "";
        for (const p of msg.parts) {
          if (p.text) content += p.text + "\n";
          if (p.functionCall) {
            content += `Called function ${p.functionCall.name} with ${JSON.stringify(p.functionCall.args)}\n`;
          }
        }
        openaiMessages.push({ role: "assistant", content });
      }
    }

    const oaiTools = getToolsDef().map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters.properties,
          required: t.parameters.required
        }
      }
    }));

    abortControllerRef.current = new AbortController();
    const url = endpoint || 'http://localhost:11434/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'dummy'}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: openaiMessages,
        stream: true,
        tools: oaiTools,
        temperature: 0.1
      }),
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      let msg = err.error?.message || response.statusText;
      if (response.status === 429) msg = "429: Quota exceeded or rate limited.";
      if (response.status === 401) msg = "401: Invalid API key.";
      throw new Error(msg);
    }    return response.body;
  };

  const callAnthropicStream = async (currentMessages: Message[]) => {
    const anthropicMessages = [];
    for (const msg of currentMessages) {
      if (msg.role === 'user') {
        let textContent = "";
        for (const p of msg.parts) {
          if (p.text) textContent += p.text + "\n";
          if (p.functionResponse) {
            textContent += `Function ${p.functionResponse.name} response: ${JSON.stringify(p.functionResponse.response)}\n`;
          }
        }
        anthropicMessages.push({ role: "user", content: textContent });
      } else if (msg.role === 'model') {
        let textContent = "";
        for (const p of msg.parts) {
          if (p.text) textContent += p.text + "\n";
          if (p.functionCall) {
            textContent += `Called function ${p.functionCall.name} with ${JSON.stringify(p.functionCall.args)}\n`;
          }
        }
        anthropicMessages.push({ role: "assistant", content: textContent });
      }
    }

    const anthropicTools = getToolsDef().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: t.parameters.properties,
        required: t.parameters.required
      }
    }));

    abortControllerRef.current = new AbortController();
    const url = endpoint || 'https://api.anthropic.com/v1/messages';
    
    // Anthropic-specific API settings
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // Required to bypass CORS from frontend
      },
      body: JSON.stringify({
        model: modelName,
        system: getFullSystemPrompt(),
        messages: anthropicMessages,
        max_tokens: 4000,
        stream: true,
        tools: anthropicTools,
        temperature: 0.1
      }),
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      let msg = err.error?.message || response.statusText;
      if (response.status === 429) msg = "429: Quota exceeded or rate limited.";
      if (response.status === 401) msg = "401: Invalid API key.";
      throw new Error(msg);
    }
    return response.body;
  };

  const handleStop = () => {
    stopFlagRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setStatus("Stopped.");
  };

  const processAgentLoop = async (initialMessages: Message[]) => {
    let currentConversation = [...initialMessages];
    stopFlagRef.current = false;
    let turnCount = 0;
    const MAX_TURNS = 50;
    setCurrentTurn(0);
    setSessionStartTime(Date.now());
    setElapsedSession(0);

    try {
      while (!stopFlagRef.current && turnCount < MAX_TURNS) {
        turnCount++;
        setCurrentTurn(turnCount);
        setTurnStartTime(Date.now());
        setElapsedTurn(0);
        setStatus(`Thinking (Turn ${turnCount})...`);        
        let modelParts: MessagePart[] = [];
        let currentTextId = "";
        let currentThoughtId = "";

        try {
          if (provider === 'gemini') {
            const stream = await callGeminiStream(currentConversation);
            if (!stream) break;
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            
            while (!stopFlagRef.current) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.substring(6));
                    
                    // Handle Gemini specific error candidates
                    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
                      throw new Error("Gemini Safety Filter triggered. The request was blocked.");
                    }

                    if (data.usageMetadata) updateTokens(data.usageMetadata);
                    
                    const incomingParts = data.candidates?.[0]?.content?.parts || [];
                    incomingParts.forEach((part: any, index: number) => {
                      if (!modelParts[index]) {
                        modelParts[index] = { ...part };
                      } else {
                        // Generic merge for all fields to preserve metadata like thought_signature
                        Object.keys(part).forEach(key => {
                          const target = modelParts[index] as any;
                          const source = part as any;
                          
                          // CONTENT fields: concatenate
                          if (key === 'text' || key === 'thought') {
                            target[key] = (target[key] || "") + source[key];
                          } 
                          // METADATA fields (signatures): assign, do not concatenate!
                          else if (key === 'thought_signature' || key === 'thoughtSignature') {
                            target[key] = source[key];
                          }
                          // OBJECT fields (functionCall): merge
                          else if (typeof part[key] === 'object' && part[key] !== null) {
                            target[key] = { 
                              ...(target[key] || {}), 
                              ...source[key] 
                            };
                          } else {
                            target[key] = source[key];
                          }
                        });
                      }

                      // Update UI
                      if (part.text) {
                        setStatus("Typing...");
                        if (!currentTextId) currentTextId = addDisplayMsg('assistant', "", undefined, true);
                        addDisplayMsg('assistant', part.text, currentTextId, true);
                      }
                      if (part.thought) {
                        setStatus("Thinking deeply...");
                        if (!currentThoughtId) currentThoughtId = addDisplayMsg('thought', "", undefined, true);
                        addDisplayMsg('thought', part.thought, currentThoughtId, true);
                      }
                    });
                  } catch (e) {
                    if (e instanceof Error && e.message.includes("Safety")) throw e;
                  }
                }
              }
            }
          } else if (provider === 'anthropic') {
            const stream = await callAnthropicStream(currentConversation);
            if (!stream) break;
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let currentToolCall: any = null;

            while (!stopFlagRef.current) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.substring(6));
                    if (data.type === 'message_start' && data.message?.usage) {
                      updateTokens({ prompt_tokens: data.message.usage.input_tokens });
                    }
                    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                      setStatus("Typing...");
                      if (!currentTextId) currentTextId = addDisplayMsg('assistant', "", undefined, true);
                      addDisplayMsg('assistant', data.delta.text, currentTextId, true);
                      let textPart = modelParts.find(p => p.text !== undefined);
                      if (!textPart) { textPart = { text: "" }; modelParts.push(textPart); }
                      textPart.text += data.delta.text;
                    }
                    if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
                      currentToolCall = { name: data.content_block.name, argsString: "" };
                    }
                    if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
                      if (currentToolCall) currentToolCall.argsString += data.delta.partial_json;
                    }
                    if (data.type === 'message_delta' && data.usage) {
                      updateTokens({ completion_tokens: data.usage.output_tokens });
                    }
                  } catch (e) {}
                }
              }
            }
            if (currentToolCall) {
              try { modelParts.push({ functionCall: { name: currentToolCall.name, args: JSON.parse(currentToolCall.argsString) } }); }
              catch(e) { console.error("Failed to parse tool args", currentToolCall.argsString); }
            }
          } else {
            const stream = await callOpenAIStream(currentConversation);
            if (!stream) break;
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let currentToolCall: any = null;

            while (!stopFlagRef.current) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.substring(6));
                    if (data.usage) updateTokens(data.usage);
                    const delta = data.choices?.[0]?.delta;
                    if (delta) {
                      if (delta.content) {
                        setStatus("Typing...");
                        if (!currentTextId) currentTextId = addDisplayMsg('assistant', "", undefined, true);
                        addDisplayMsg('assistant', delta.content, currentTextId, true);
                        let textPart = modelParts.find(p => p.text !== undefined);
                        if (!textPart) { textPart = { text: "" }; modelParts.push(textPart); }
                        textPart.text += delta.content;
                      }
                      if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                          if (tc.function?.name) { currentToolCall = { name: tc.function.name, argsString: tc.function.arguments || "" }; }
                          else if (tc.function?.arguments && currentToolCall) { currentToolCall.argsString += tc.function.arguments; }
                        }
                      }
                    }
                  } catch (e) {}
                }
              }
            }
            if (currentToolCall) {
              try { modelParts.push({ functionCall: { name: currentToolCall.name, args: JSON.parse(currentToolCall.argsString) } }); }
              catch(e) { console.error("Failed to parse tool args", currentToolCall.argsString); }
            }
          }
        } catch (err: any) {
          let userMsg = "Agent Error: " + err.message;
          if (err.message.includes("429") || err.message.toLowerCase().includes("quota")) {
            userMsg = "⚠️ API QUOTA EXCEEDED: You have hit the rate limit or run out of credits. Please wait a moment or check your API billing.";
          } else if (err.message.includes("401") || err.message.toLowerCase().includes("invalid api key")) {
            userMsg = "⚠️ INVALID API KEY: Please check your credentials in the settings (⚙️).";
          } else if (err.message.toLowerCase().includes("safety")) {
            userMsg = "⚠️ SAFETY FILTER: The AI provider blocked this response due to safety constraints.";
          }
          
          addDisplayMsg('system', userMsg);
          setStatus("API Error");
          setIsLoading(false);
          return;
        }

        if (currentTextId) finalizeStreamingMsg(currentTextId);
        if (currentThoughtId) finalizeStreamingMsg(currentThoughtId);

        if (stopFlagRef.current) break;

        currentConversation.push({ role: 'model', parts: modelParts });

        const functionCalls = modelParts.filter(p => !!p.functionCall).map(p => {
          const partIndex = modelParts.indexOf(p);
          return {
            ...p.functionCall,
            thought_signature: (modelParts[partIndex] as any).thought_signature || (modelParts[partIndex] as any).thoughtSignature
          };
        });

        if (functionCalls.length > 0) {
          let functionResponses: MessagePart[] = [];
          let isFinalizing = false;          
          const toolLabels: Record<string, string> = {
            'get_current_code': '[RESEARCH] Reading source code context',
            'grep_search': '[RESEARCH] Searching patterns',
            'apply_diff': '[ACTION] Applying surgical fix',
            'edit_lines': '[ACTION] Editing code block',
            'multi_edit': '[ACTION] Performing batch edits',
            'replace_function': '[ACTION] Replacing function block',
            'show_function': '[RESEARCH] Inspecting function',
            'delete_function': '[ACTION] Deleting function',
            'fix_boilerplate': '[ACTION] Restoring required handlers',
            'update_code': '[ACTION] Updating full code',
            'set_knob': '[TEST] Adjusting laboratory knob',
            'set_multiple_knobs': '[TEST] Configuring parameter block',
            'send_midi_cc': '[TEST] Sending MIDI command',
            'trigger_generator': '[TEST] Triggering lab signal',
            'configure_lab_input': '[TEST] Configuring DSP input',
            'load_preset': '[ACTION] Loading preset',
            'list_presets': '[RESEARCH] Browsing library',
            'get_live_telemetry': '[RESEARCH] Inspecting memory',
            'get_state': '[RESEARCH] Reading specific state',
            'get_state_history': '[RESEARCH] Tracking state history',
            'get_spectrum_data': '[RESEARCH] Analyzing spectrum',
            'get_peak_frequencies': '[RESEARCH] Finding peak frequencies',
            'get_harmonics': '[RESEARCH] Analyzing harmonics',
            'get_signal_quality': '[RESEARCH] Measuring signal quality',
            'get_audio_metrics': '[RESEARCH] Measuring audio quality',
            'user_message': '[STATUS] Sending status update',
            'ask_user': '[STATUS] Requesting guidance',
            'write_plan': '[PLAN] Documenting internal plan',
            'get_development_plan': '[PLAN] Reading internal plan',
            'store_snapshot': '[STATUS] Saving version snapshot',
            'list_functions': '[RESEARCH] Analyzing function signatures',
            'get_vult_reference': '[RESEARCH] Consulting language guide',
            'set_probes': '[RESEARCH] Configuring logic analyzer',
            'configure_sequencer': '[TEST] Programming sequencer',
            'get_sequencer_state': '[RESEARCH] Reading sequencer state',
            'tell': '[STATUS] Communicating'
          };
          for (const fc of functionCalls) {
            if (stopFlagRef.current) break;
            const name = fc.name.includes(':') ? fc.name.split(':').pop() : fc.name;
            const label = toolLabels[name || ''] || name;
            setStatus(`${label}...`);
            
            let result: any = {};
            if (name === 'get_current_code') {
              addDisplayMsg('system', `${label}`);
              result = { 
                code: codeRef.current, 
                next_step: "Code retrieved. ANALYZE the architecture and PROCEED IMMEDIATELY to implementation or testing. DO NOT stop the autonomous loop." 
              };
            } else if (name === 'grep_search') {
              const pattern = fc.args.pattern;
              addDisplayMsg('system', `[RESEARCH] Searching for pattern: "${pattern}"`);
              const lines = codeRef.current.split('\n');
              try {
                const regex = new RegExp(pattern, 'i');
                const matches = lines.map((l, i) => regex.test(l) ? `${i+1}: ${l}` : null).filter(Boolean);
                result = { 
                  matches: matches.length > 0 ? matches : ["No matches found."],
                  next_step: "Search complete. PROCEED IMMEDIATELY to act on these findings. DO NOT stop the loop."
                };
              } catch(e: any) { result = { error: e.message }; }
            } else if (name === 'apply_diff') {
              const { old_string, new_string } = fc.args;
              const summary = old_string.length > 30 ? old_string.substring(0, 27) + "..." : old_string;
              addDisplayMsg('system', `[ACTION] Replacing: "${summary}"`);
              
              if (codeRef.current.includes(old_string)) {
                const newCode = codeRef.current.replace(old_string, new_string);
                const res = await onUpdateCode(newCode);
                if (res.success) {
                  addDisplayMsg('system', `[ACTION] Applied surgical fix successfully.`);
                  result = { success: true, message: "Search-and-replace successful. Code is valid. Please verify the output on the scope." };
                } else {
                  addDisplayMsg('system', `[ACTION] Diff failed to compile:\n${res.error}`);
                  result = { success: false, error: res.error, context: "Your surgical replacement caused a compilation error. Re-check the logic." };
                }
              } else {
                addDisplayMsg('system', `[ACTION] Error: Could not find exact match for: "${summary}"`);
                result = { success: false, error: "Pattern not found." };
              }
            } else if (name === 'edit_lines') {
              const { start_line, end_line } = fc.args;
              addDisplayMsg('system', `[ACTION] Editing lines ${start_line} through ${end_line}`);
              const { new_code } = fc.args;
              const lines = codeRef.current.split('\n');
              if (start_line > 0 && end_line >= start_line && start_line <= lines.length) {
                const before = lines.slice(0, start_line - 1);
                const after = lines.slice(end_line);
                const updatedCode = [...before, new_code, ...after].join('\n');
                const res = await onUpdateCode(updatedCode);
                if (res.success) {
                  addDisplayMsg('system', `[ACTION] Successfully replaced lines ${start_line}-${end_line}.`);
                  result = { success: true, message: `Lines ${start_line}-${end_line} updated. Code is valid. You should now use get_live_telemetry or get_spectrum_data to verify behavior.` };
                } else {
                  addDisplayMsg('system', `[ACTION] Edit on lines ${start_line}-${end_line} failed to compile:\n${res.error}`);
                  result = { success: false, error: res.error, context: "The code you provided resulted in a compilation error. Please analyze the error and fix the logic." };
                }
              } else {
                addDisplayMsg('system', `[ACTION] Invalid line range: ${start_line}-${end_line}`);
                result = { success: false, error: "Invalid line ranges." };
              }
            } else if (name === 'multi_edit') {
              const edits = [...fc.args.edits];
              addDisplayMsg('system', `[ACTION] Applying ${edits.length} batch edits`);
              // Sort descending to handle line shifts
              edits.sort((a, b) => b.start_line - a.start_line);
              let workingLines = codeRef.current.split('\n');
              let ok = true;
              for (const e of edits) {
                if (e.start_line > 0 && e.end_line >= e.start_line && e.start_line <= workingLines.length) {
                  const before = workingLines.slice(0, e.start_line - 1);
                  const after = workingLines.slice(e.end_line);
                  workingLines = [...before, ...e.new_code.split('\n'), ...after];
                } else { ok = false; break; }
              }
              if (ok) {
                const res = await onUpdateCode(workingLines.join('\n'));
                if (res.success) {
                  addDisplayMsg('system', `[ACTION] Batch edits applied successfully.`);
                  result = { success: true };
                } else {
                  addDisplayMsg('system', `[ACTION] Batch failed to compile:\n${res.error}`);
                  result = { success: false, error: res.error };
                }
              } else {
                result = { success: false, error: "Invalid line ranges." };
              }
            } else if (name === 'set_probes') {
              addDisplayMsg('system', `[RESEARCH] Configuring logic analyzer probes: ${fc.args.probes.join(', ')}`);
              onSetProbes(fc.args.probes);
              result = { success: true };
            } else if (name === 'show_function') {
              const { function_name } = fc.args;
              addDisplayMsg('system', `[RESEARCH] Inspecting function: ${function_name}`);
              const code = codeRef.current;
              const regex = new RegExp(`(fun|and)\\s+${function_name}\\s*\\([^)]*\\)\\s*(?::\\s*[a-zA-Z_]\\w*)?\\s*{`, 'g');
              const match = regex.exec(code);
              if (match) {
                let braceCount = 1;
                let endIdx = -1;
                for (let i = match.index + match[0].length; i < code.length; i++) {
                  if (code[i] === '{') braceCount++;
                  if (code[i] === '}') braceCount--;
                  if (braceCount === 0) {
                    endIdx = i + 1;
                    break;
                  }
                }
                if (endIdx !== -1) {
                  result = { code: code.substring(match.index, endIdx) };
                } else {
                  result = { error: "Unbalanced braces in function body." };
                }
              } else {
                result = { error: `Function '${function_name}' not found.` };
              }
            } else if (name === 'delete_function') {
              const { function_name } = fc.args;
              addDisplayMsg('system', `[ACTION] Deleting function: ${function_name}`);
              const code = codeRef.current;
              const regex = new RegExp(`(fun|and)\\s+${function_name}\\s*\\([^)]*\\)\\s*(?::\\s*[a-zA-Z_]\\w*)?\\s*{`, 'g');
              const match = regex.exec(code);
              if (match) {
                let braceCount = 1;
                let endIdx = -1;
                for (let i = match.index + match[0].length; i < code.length; i++) {
                  if (code[i] === '{') braceCount++;
                  if (code[i] === '}') braceCount--;
                  if (braceCount === 0) {
                    endIdx = i + 1;
                    break;
                  }
                }
                if (endIdx !== -1) {
                  const updatedCode = code.substring(0, match.index) + code.substring(endIdx);
                  const res = await onUpdateCode(updatedCode);
                  result = { success: res.success, error: res.error };
                } else {
                  result = { error: "Unbalanced braces." };
                }
              } else {
                result = { error: `Function '${function_name}' not found.` };
              }
            } else if (name === 'replace_function') {
              const { function_name, new_code } = fc.args;
              addDisplayMsg('system', `[ACTION] Replacing function: ${function_name}`);
              const code = codeRef.current;
              // Regex to find function definition and body start
              const regex = new RegExp(`(fun|and)\\s+${function_name}\\s*\\([^)]*\\)\\s*(?::\\s*[a-zA-Z_]\\w*)?\\s*{`, 'g');
              const match = regex.exec(code);
              if (match) {
                const startIdx = match.index;
                let braceCount = 1;
                let endIdx = -1;
                for (let i = match.index + match[0].length; i < code.length; i++) {
                  if (code[i] === '{') braceCount++;
                  if (code[i] === '}') braceCount--;
                  if (braceCount === 0) {
                    endIdx = i + 1;
                    break;
                  }
                }
                if (endIdx !== -1) {
                  const updatedCode = code.substring(0, startIdx) + new_code + code.substring(endIdx);
                  const res = await onUpdateCode(updatedCode);
                  if (res.success) {
                    addDisplayMsg('system', `[ACTION] Successfully replaced function ${function_name}.`);
                    result = { success: true };
                  } else {
                    result = { success: false, error: res.error };
                  }
                } else {
                  result = { success: false, error: "Could not find end of function body (unbalanced braces)." };
                }
              } else {
                result = { success: false, error: `Function '${function_name}' not found with brace body.` };
              }
            } else if (name === 'fix_boilerplate') {
              addDisplayMsg('system', `[ACTION] Fixing mandatory boilerplate`);
              let code = codeRef.current;
              const required = [
                { name: 'noteOn', code: '\nand noteOn(note: int, velocity: int, channel: int) { }' },
                { name: 'noteOff', code: '\nand noteOff(note: int, channel: int) { }' },
                { name: 'controlChange', code: '\nand controlChange(control: int, value: int, channel: int) { }' },
                { name: 'default', code: '\nand default() { }' }
              ];
              let addedCount = 0;
              for (const req of required) {
                const hasFun = new RegExp(`fun\\s+${req.name}\\s*\\(`, 'g').test(code);
                const hasAnd = new RegExp(`and\\s+${req.name}\\s*\\(`, 'g').test(code);
                if (!hasFun && !hasAnd) {
                  code += req.code;
                  addedCount++;
                }
              }
              if (addedCount > 0) {
                const res = await onUpdateCode(code);
                result = { success: res.success, error: res.error, message: `Added ${addedCount} missing handlers.` };
              } else {
                result = { success: true, message: "Boilerplate already present." };
              }
            } else if (name === 'update_code') {
              addDisplayMsg('system', `[ACTION] Performing full code rewrite`);
              const res = await onUpdateCode(fc.args.new_code);
              if (res.success) {
                addDisplayMsg('system', `[ACTION] Entire code block updated and compiled.`);
                result = { success: true, message: "Full code update successful. Waiting for user approval. Perform verification tools if needed." };
              } else {
                addDisplayMsg('system', `[ACTION] Full rewrite failed to compile:\n${res.error}`);
                result = { success: false, error: res.error };
              }
            } else if (name === 'set_knob' || name === 'send_midi_cc') {
              const { cc, value } = fc.args;
              addDisplayMsg('system', `[TEST] Setting CC ${cc} to ${value}`);
              onSetKnob(cc, value);
              result = { success: true };
            } else if (name === 'set_multiple_knobs') {
              addDisplayMsg('system', `${label}`);
              fc.args.knobs.forEach((k: any) => onSetKnob(k.cc, k.value));
              result = { success: true };
            } else if (name === 'trigger_generator') {
              const idx = fc.args.index;
              addDisplayMsg('system', `[TEST] Triggering lab generator on strip ${idx + 1}`);
              onTriggerGenerator(idx);
              result = { success: true };
            } else if (name === 'configure_lab_input') {
              const { index, type } = fc.args;
              addDisplayMsg('system', `[TEST] Configuring lab strip ${index + 1} as ${type.toUpperCase()}`);
              onConfigureInput(index, fc.args);
              result = { success: true };
            } else if (name === 'load_preset') {
              const pName = fc.args.name;
              addDisplayMsg('system', `[ACTION] Loading library preset: "${pName}"`);
              onLoadPreset(pName);
              result = { success: true };
            } else if (name === 'configure_sequencer') {
              addDisplayMsg('system', `${label}`);
              onConfigureSequencer(fc.args.bpm, fc.args.steps, fc.args.playing);
              result = { success: true };
            } else if (name === 'get_sequencer_state') {
              addDisplayMsg('system', `${label}`);
              result = { state: getSequencerState() };
            } else if (name === 'list_presets') {
              addDisplayMsg('system', `[RESEARCH] Browsing preset library`);
              result = { presets: getPresets() };
            } else if (name === 'get_live_telemetry') {
              const { filter, limit = 100 } = fc.args;
              addDisplayMsg('system', `[RESEARCH] Inspecting internal memory states${filter ? ` (filter: ${filter})` : ''}`);
              const fullTelemetry = getTelemetry();
              let keys = Object.keys(fullTelemetry);
              
              if (filter) {
                try {
                  const regex = new RegExp(filter, 'i');
                  keys = keys.filter(k => regex.test(k));
                } catch(e) {}
              }
              
              const totalFound = keys.length;
              const resultKeys = keys.slice(0, limit);
              const telemetry: Record<string, any> = {};
              resultKeys.forEach(k => telemetry[k] = fullTelemetry[k]);
              
              result = { 
                telemetry, 
                count: resultKeys.length, 
                total: totalFound,
                message: totalFound > limit ? `Truncated to ${limit} items. Use 'filter' to see more specific keys.` : undefined
              };
            } else if (name === 'get_state') {
              const key = fc.args.key;
              addDisplayMsg('system', `[RESEARCH] Reading specific state: ${key}`);
              const telemetry = getTelemetry();
              if (telemetry[key] !== undefined) {
                 result = { [key]: telemetry[key] };
              } else {
                 // Try partial match if not found exactly
                 const matches = Object.keys(telemetry).filter(k => k.includes(key)).slice(0, 10);
                 if (matches.length > 0) {
                    const partial: Record<string, any> = {};
                    matches.forEach(m => partial[m] = telemetry[m]);
                    result = { error: `Key '${key}' not found exactly. Did you mean one of these?`, suggestions: partial };
                 } else {
                    result = { error: `Variable '${key}' not found in telemetry context.` };
                 }
              }
            } else if (name === 'get_state_history') {
              const key = fc.args.key;
              const count = Math.min(10, fc.args.count || 5);
              addDisplayMsg('system', `[RESEARCH] Tracking history: ${key}`);
              const history = getTelemetryHistory();
              const values = history.slice(-count).map(h => h[key]).filter(v => v !== undefined);
              result = { [key]: values.length > 0 ? values : "Variable not found in history." };
            } else if (name === 'get_spectrum_data') {
              addDisplayMsg('system', `[RESEARCH] Capturing frequency spectrum snapshot`);
              result = { spectrum: getSpectrum() };
            } else if (name === 'get_peak_frequencies') {
              addDisplayMsg('system', `[RESEARCH] Finding peak frequencies`);
              result = { peaks: getPeakFrequencies(fc.args.count) };
            } else if (name === 'get_harmonics') {
              addDisplayMsg('system', `[RESEARCH] Analyzing harmonics`);
              result = { analysis: getHarmonics() };
            } else if (name === 'get_signal_quality') {
              addDisplayMsg('system', `[RESEARCH] Measuring signal quality`);
              result = { quality: getSignalQuality() };
            } else if (name === 'get_audio_metrics') {
              const waitMs = fc.args.wait_ms || 500;
              addDisplayMsg('system', `[RESEARCH] Measuring output signal quality (RMS/Peak/Headroom) for ${waitMs}ms...`);
              await new Promise(r => setTimeout(r, waitMs));
              result = { metrics: getAudioMetrics() };
            } else if (name === 'user_message' || name === 'tell') {
              addDisplayMsg('assistant', fc.args.message);
              result = { success: true };
            } else if (name === 'list_functions') {
              addDisplayMsg('system', `[RESEARCH] Analyzing source code for function signatures`);
              const regex = /fun\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([a-zA-Z_]\w*))?/g;
              const functions = [];
              let match;
              while ((match = regex.exec(codeRef.current)) !== null) {
                functions.push({
                  name: match[1],
                  params: match[2].trim(),
                  returns: match[3] || 'void'
                });
              }
              result = { 
                functions: functions.length > 0 ? functions : "No functions found.",
                next_step: "Signatures retrieved. Use this to plan your calls and PROCEED IMMEDIATELY to implementation. DO NOT stop the loop."
              };
            } else if (name === 'get_vult_reference') {
              addDisplayMsg('system', `[RESEARCH] Consulting Vult technical reference`);
              result = {
                vult_syntax_guide: {
                  overview: "Vult is a transcompiler language for high-performance DSP. (V0: Stable classic, V1: Modern beta).",
                  declarations: {
                    mem: "Persistent state inside functions: 'mem x = 0.0;'. Global mem is INVALID.",
                    val: "Immutable local: 'val x = 1.0;'",
                    var: "Mutable local: 'var x = 0.0;'",
                    constant: "Global constant: 'constant pi = 3.14;' (V1 only)",
                    fun: "Function: 'fun f(x) { return x; }'",
                    and: "MANDATORY for state-sharing handlers: 'fun process(x) { ... } and noteOn(n,v,c) { ... }'",
                    enum: "Enumeration: 'enum Color { Red, Green, Blue }' (V1 only)",
                    record: "Record/Type: 'type point { val x:real; val y:real; }' (V1 only)"
                  },
                  v1_exclusive_features: {
                    pattern_matching: "match (x, y) { 1, 2 -> { f(); } _ -> { g(); } } (Supports tuples and wildcards)",
                    generic_arrays: "Declaration: 'mem buffer : array(real, 1024);' or param: 'fun f(a:array(real))'. Use 'size(a)' for length.",
                    iterators: "Loop: 'iter(i, count) { ... }' counts 0 to count-1.",
                    instance_arrays: "Array of stateful workers: 'mem oscs : array(osc_type, 4);' -> Call as 'oscs[i]:osc(f);'. Note: type name is 'funcname_type'.",
                    strings: "Type 'string', literals '\"hello\"', concat with '+', 'string(val)' conversion, 'length(s)' for size.",
                    specialization: "Compile-time params: 'fun add('n : int, x) { return n + x; }'. 'n' must be a literal at call site."
                  },
                  statement_rules: "STRICT: All statements MUST be assignments ('a=b;') or discards ('_=f();'). Standalone calls or expressions will FAIL.",
                  logic_operators: "C-style mandatory: &&, ||, ! (Do NOT use 'and', 'or', 'not' as keywords).",
                  math: "abs, exp, log, log10, sin, cos, tan, tanh, sqrt, pow, floor, ceil, clip(x, low, high), string(x), size(array), length(string)"
                },
                next_step: "Reference consulted. Ensure your patches follow version-specific syntax and PROCEED IMMEDIATELY."
              };
            } else if (name === 'write_plan') {
              planRef.current = fc.args.plan;
              addDisplayMsg('system', `${label}`);
              result = { success: true, next_step: "Plan recorded. PROCEED IMMEDIATELY to implementation. DO NOT stop the loop." };
            } else if (name === 'get_development_plan') {
              addDisplayMsg('system', `${label}`);
              result = { plan: planRef.current || "No plan documented yet." };
            } else if (name === 'store_snapshot') {
              addDisplayMsg('system', `[STATUS] Storing snapshot: "${fc.args.message}"`);
              onSaveSnapshot(fc.args.message);
              result = { success: true };
            } else if (name === 'complete_task') {
              addDisplayMsg('system', `[STATUS] Agent signaling task completion: ${fc.args.verification_summary}`);
              result = { success: true };
              isFinalizing = true;
            } else if (name === 'ask_user') {
              const question = fc.args.question;
              setStatus("User input required.");
              setIsLoading(false); 
              addDisplayMsg('assistant', question, undefined, false, fc.args.options);
              const userResponse = await new Promise<string>((resolve) => {
                askUserResolverRef.current = resolve;
              });
              askUserResolverRef.current = null;
              setIsLoading(true); 
              setStatus(`Thinking (Turn ${turnCount})...`);
              result = { response: userResponse };
            } else if (name === 'store_memory') {
              const fact = fc.args.fact;
              setAgentMemory(prev => {
                const updated = prev ? prev + "\n- " + fact : "- " + fact;
                return updated;
              });
              addDisplayMsg('system', `[MEMORY] Learning: "${fact}"`);
              result = { success: true, status: "Fact recorded in long-term memory." };
            } else if (name === 'get_memory') {
              addDisplayMsg('system', `[MEMORY] Recalling long-term memories...`);
              result = { memory: agentMemory || "No persistent memories stored yet." };
            }

            functionResponses.push({ 
              functionResponse: { name: fc.name, response: result },
              thought_signature: fc.thought_signature,
              thoughtSignature: fc.thought_signature
            } as any);
            }
            currentConversation.push({ role: 'user', parts: functionResponses });
            if (isFinalizing) break;
            } else {
            // STALL DETECTION: Auto-nudge if only text was returned
            addDisplayMsg('system', "[STATUS] Stall detected. Nudging agent to maintain momentum...");
            currentConversation.push({ 
              role: 'user', 
              parts: [{ text: "You provided a text summary without calling tools. This engineering task is NOT complete. PROCEED IMMEDIATELY to implement, verify, or finalize using the 'complete_task' tool. MAINTAIN AUTONOMOUS MOMENTUM." }] 
            });
            continue;
            }      }
      
      if (turnCount >= MAX_TURNS) {
        addDisplayMsg('system', `⚠️ Maximum turn limit (${MAX_TURNS}) reached. The agent was interrupted to prevent an infinite loop.`);
      } else if (stopFlagRef.current) {
        addDisplayMsg('system', "🛑 Agent cycle was manually stopped by the user.");
      } else {
        addDisplayMsg('system', "🏁 Agent task complete: The model has no further actions to perform.");
      }
      } catch (err: any) {
      if (err.name === 'AbortError' || stopFlagRef.current) {
        addDisplayMsg('system', "🛑 Agent cycle was manually stopped by the user.");
      } else {
        addDisplayMsg('assistant', `⚠️ Loop Error: ${err.message}`);
        console.error("Agent Loop Error:", err);
      }
      } finally {      setIsLoading(false);
      setStatus(null);
    }
    setMessages(currentConversation);
  };

  const handleSend = () => {
    if (askUserResolverRef.current) {
      const userInput = input;
      setInput('');
      addDisplayMsg('user', userInput);
      askUserResolverRef.current(userInput);
      return;
    }
    if (!input.trim() || isLoading) return;
    const userInput = input;
    setInput('');
    setIsLoading(true);
    addDisplayMsg('user', userInput);
    if (provider === 'gemini' && !apiKey) {
      addDisplayMsg('assistant', "API key missing. Click Settings.");
      setIsLoading(false);
      return;
    }
    const newUserMsg: Message = { role: 'user', parts: [{ text: userInput }] };
    processAgentLoop([...messages, newUserMsg]);
  };

  useEffect(() => {
    if (messages.length === 0 && !isLoading && !isInspirationLoading) {
      const savedMsgs = localStorage.getItem('llm_messages');
      if (!savedMsgs || JSON.parse(savedMsgs).length === 0) {
        addDisplayMsg('assistant', "Welcome to DSPLab. I am your Senior DSP Assistant. Would you like to start with a professional preset or a minimal template?", undefined, false, [
          { label: "Load CS-80 (vs80)", value: "load_preset:vs80" },
          { label: "Biquad Filter", value: "load_preset:Biquad Filter" },
          { label: "Minimal Template", value: "load_preset:Minimal" }
        ]);
      }
    }
  }, [messages.length, isLoading, isInspirationLoading]);

  const handleFeelCurious = async () => {
    if (isLoading || isInspirationLoading) return;
    addDisplayMsg('assistant', "I can either come up with a creative **Surprise** for you right now, or we can **Collaborate** on a specific musical vision. What would you prefer?", undefined, false, [
      { label: "Surprise Me (Instant)", value: "inspiration:instant" },
      { label: "Collaborate (Custom)", value: "inspiration:collaborate" }
    ]);
  };

  const executeInspiration = async (userBrief: string = "") => {
    setIsInspirationLoading(true);
    const msgId = addDisplayMsg('system', `[INSPIRATION] Consulting the DSP Architect...`, undefined, true);
    
    const inspirationPrompt = `You are a visionary DSP Architect. Come up with ONE highly creative, unique, and technically functional synthesizer or audio effect idea that can be implemented in Vult. 
    Focus on MUSICALITY and PLAYABILITY. ${userBrief ? `USER WISHES: ${userBrief}` : "Surprise me with something unique."}
    Provide only a concise 2-3 sentence engineering brief.`;

    try {
      let idea = "";
      if (provider === 'gemini') {
        const payload = {
          contents: [{ role: 'user', parts: [{ text: inspirationPrompt }] }],
          generationConfig: { temperature: 0.9 }
        };
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        idea = data.candidates?.[0]?.content?.parts?.[0]?.text || "A unique resonant filter.";
      } else if (provider === 'anthropic') {
        const response = await fetch(endpoint || 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: modelName || 'claude-3-7-sonnet-20250219',
            messages: [{ role: 'user', content: inspirationPrompt }],
            max_tokens: 1000,
            temperature: 0.9
          })
        });
        const data = await response.json();
        idea = data.content?.[0]?.text || "A unique modulation effect.";
      } else {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: inspirationPrompt }],
            temperature: 0.9
          })
        });
        const data = await response.json();
        idea = data.choices?.[0]?.message?.content || "A unique modulation effect.";
      }

      finalizeStreamingMsg(msgId);
      setIsInspirationLoading(false);
      addDisplayMsg('assistant', `💡 [IDEA] ${idea}`);
      
      setIsLoading(true);
      const newUserMsg: Message = { role: 'user', parts: [{ text: `I like that idea: "${idea}". Please implement it fully in Vult now. Ensure all mandatory MIDI and boilerplate handlers are present.` }] };
      processAgentLoop([...messages, newUserMsg]);

    } catch (err: any) {
      finalizeStreamingMsg(msgId);
      addDisplayMsg('system', `[ERROR] Failed to get inspiration: ${err.message}`);
      setIsInspirationLoading(false);
    }
  };

  const handleChoice = (val: string) => {
    if (askUserResolverRef.current) {
      addDisplayMsg('user', `Selected: ${val}`);
      askUserResolverRef.current(val);
    } else if (val.startsWith('load_preset:')) {
      const name = val.split(':')[1];
      onLoadPreset(name);
      addDisplayMsg('user', `Action: Load Preset "${name}"`);
      addDisplayMsg('system', `[ACTION] Loading laboratory preset: ${name}`);
    } else if (val === 'inspiration:instant') {
      addDisplayMsg('user', "Selected: Surprise Me");
      executeInspiration();
    } else if (val === 'inspiration:collaborate') {
      addDisplayMsg('user', "Selected: Collaborate");
      addDisplayMsg('assistant', "Excellent. Let's design something tailored. What's the core **Vibe** we should aim for?", undefined, false, [
        { label: "Analog (Warm/Noisy)", value: "insp_vibe:Analog" },
        { label: "FM (Digital/Metallic)", value: "insp_vibe:FM" },
        { label: "Physical (Acoustic/Resonant)", value: "insp_vibe:Physical" },
        { label: "Hybrid (Modern/Complex)", value: "insp_vibe:Hybrid" }
      ]);
    } else if (val.startsWith('insp_vibe:')) {
      const vibe = val.split(':')[1];
      addDisplayMsg('user', `Vibe: ${vibe}`);
      addDisplayMsg('assistant', `Got it, ${vibe} it is. Now, what kind of **Sound** should we focus on?`, undefined, false, [
        { label: "Deep Bass", value: `insp_final:${vibe} Bass` },
        { label: "Lead / Solo", value: `insp_final:${vibe} Lead` },
        { label: "Ethereal Pad", value: `insp_final:${vibe} Pad` },
        { label: "Percussive / Drum", value: `insp_final:${vibe} Percussion` }
      ]);
    } else if (val.startsWith('insp_final:')) {
      const brief = val.split(':')[1];
      addDisplayMsg('user', `Type: ${brief}`);
      executeInspiration(brief);
    }
  };

  if (isMinimized) {
    return (
      <motion.div 
        layoutId="llm-widget"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ 
          position: 'fixed', bottom: '20px', right: '20px', 
          background: 'rgba(26, 26, 26, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', 
          borderRadius: '24px', padding: '10px 20px', 
          display: 'flex', alignItems: 'center', gap: '10px', 
          cursor: 'pointer', zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={() => setIsMinimized(false)}
        whileHover={{ scale: 1.05, background: 'rgba(40, 40, 40, 0.9)' }}
      >
        <Maximize2 size={14} color="#888" />
        <Activity size={16} color={isLoading ? "var(--accent-primary)" : "#00ff00"} className={isLoading ? "animate-pulse" : ""} />
        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{status || "DSP Agent"}</span>
      </motion.div>
    );
  }

  return (
    <motion.div 
      layoutId="llm-widget"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ 
        position: 'fixed', top: `${widgetState.y}px`, left: `${widgetState.x}px`, 
        width: `${widgetState.width}px`, height: `${widgetState.height}px`, 
        display: 'flex', flexDirection: 'column', 
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', 
        background: 'rgba(24, 24, 27, 0.85)', backdropFilter: 'blur(16px)', 
        zIndex: 9999, boxShadow: '0 12px 48px rgba(0,0,0,0.7)', 
        overflow: 'hidden' 
      }}
    >
      {/* HEADER */}
      <div 
        onMouseDown={handleDragStart}
        style={{ 
          padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          background: 'rgba(0,0,0,0.3)', cursor: 'grab' 
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setIsMinimized(true)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}>
            <ChevronDown size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={12} color="var(--accent-primary)" />
              <span style={{ fontWeight: 800, fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px' }}>DSP AGENT</span>
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '1px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              PRO: {tokens.total.toLocaleString()} TOKENS | {currentTurn > 0 && `TURN: ${currentTurn} (${formatTime(elapsedTurn)}) | `} SES: {formatTime(elapsedSession)}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            onClick={() => setActiveTab('chat')}
            style={{ padding: '6px', borderRadius: '6px', background: activeTab === 'chat' ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === 'chat' ? 'var(--accent-primary)' : '#666', cursor: 'pointer' }}
          >
            <MessageSquare size={16} />
          </button>
          <button 
            onClick={() => setActiveTab('memory')}
            style={{ padding: '6px', borderRadius: '6px', background: activeTab === 'memory' ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === 'memory' ? 'var(--accent-primary)' : '#666', cursor: 'pointer' }}
          >
            <Brain size={16} />
          </button>
          <button 
            onClick={() => setActiveTab('info')}
            style={{ padding: '6px', borderRadius: '6px', background: activeTab === 'info' ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: activeTab === 'info' ? 'var(--accent-primary)' : '#666', cursor: 'pointer' }}
          >
            <BookOpen size={16} />
          </button>
          <button 
            onClick={handleFeelCurious} 
            disabled={isLoading || isInspirationLoading}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px' }}
            title="I Feel Curious (Get Inspiration)"
          >
            <Sparkles size={16} />
          </button>
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'transparent', border: 'none', color: showSettings ? 'var(--accent-primary)' : '#666', cursor: 'pointer', padding: '6px' }}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', background: '#111', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['gemini', 'anthropic', 'openai'].map(p => (
                  <button 
                    key={p}
                    onClick={() => handleSaveSettings(p as any, endpoint, apiKey, modelName)}
                    style={{ flex: 1, padding: '6px', fontSize: '10px', fontWeight: 'bold', borderRadius: '4px', background: provider === p ? 'var(--accent-primary)' : '#222', color: provider === p ? '#000' : '#888', border: 'none', cursor: 'pointer' }}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
              <input type="password" placeholder="API Key..." value={apiKey} onChange={(e) => handleSaveSettings(provider, endpoint, e.target.value, modelName)} style={{ background: '#000', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                 <input type="text" placeholder="Model..." value={modelName} onChange={(e) => handleSaveSettings(provider, endpoint, apiKey, e.target.value)} style={{ flex: 1, background: '#000', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                 <button onClick={handleClearChat} style={{ padding: '8px', background: '#411', color: '#f55', border: '1px solid #622', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={16} /></button>
              </div>
              <button 
                onClick={() => { setTokens({ prompt: 0, completion: 0, total: 0 }); localStorage.removeItem('llm_tokens'); }}
                style={{ fontSize: '10px', background: '#222', color: '#888', border: '1px solid #333', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
              >
                RESET STATISTICS
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* PROGRESS BAR */}
        <div style={{ height: '2px', width: '100%', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
          {isLoading && (
            <motion.div 
              style={{ height: '100%', background: 'var(--accent-primary)', position: 'absolute' }}
              animate={{ width: ['0%', '100%'], left: ['0%', '0%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>

        {activeTab === 'chat' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {displayMessages.map((m) => (
              <div 
                key={m.id} 
                style={{ 
                  alignSelf: m.role === 'user' ? 'flex-end' : (m.role === 'assistant' ? 'flex-start' : 'center'),
                  maxWidth: m.role === 'system' || m.role === 'thought' ? '100%' : '90%',
                  width: m.role === 'system' || m.role === 'thought' ? '100%' : 'auto',
                }}
              >
                {m.role === 'thought' ? (
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div 
                      onClick={() => toggleThought(m.id)}
                      style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <Terminal size={12} color={m.isStreaming ? 'var(--accent-primary)' : '#666'} />
                      <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#666', letterSpacing: '0.5px' }}>
                        {m.isStreaming ? 'COGNITIVE TRACE ACTIVE...' : 'PLANNING TRACE'}
                      </span>
                      {expandedThoughts.has(m.id) ? <ChevronDown size={14} color="#444" /> : <ChevronRight size={14} color="#444" />}
                    </div>
                    {expandedThoughts.has(m.id) && (
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ padding: '10px 12px', fontSize: '11px', color: '#777', borderTop: '1px solid rgba(255,255,255,0.03)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                      >
                        {m.content}
                      </motion.div>
                    )}
                  </div>
                ) : m.role === 'system' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <Activity size={10} color="#444" />
                    <span style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>{m.content}</span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div style={{ 
                      background: m.role === 'user' ? 'rgba(0, 122, 204, 0.4)' : 'rgba(255, 255, 255, 0.05)',
                      color: '#eee',
                      padding: '12px 16px',
                      borderRadius: '16px',
                      borderBottomRightRadius: m.role === 'user' ? '2px' : '16px',
                      borderBottomLeftRadius: m.role === 'assistant' ? '2px' : '16px',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      backdropFilter: 'blur(8px)'
                    }}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeStr = String(children).replace(/\n$/, '');
                            return !inline ? (
                              <CodeBlock 
                                code={codeStr} 
                                language={match ? match[1] : undefined} 
                                onApply={codeStr.includes('fun') || codeStr.includes('and') ? (c) => onUpdateCode(c) : undefined}
                              />
                            ) : (
                              <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px', fontSize: '12px' }} {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                    {m.choices && (
                      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {m.choices.map(c => (
                          <motion.button 
                            key={c.value} 
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => handleChoice(c.value)} 
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-primary)', padding: '6px 14px', borderRadius: '10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {c.label}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {status && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', color: '#666', fontSize: '11px', fontStyle: 'italic' }}>
                <Loader2 size={14} className="animate-spin" /> {status}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {activeTab === 'memory' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Brain size={24} color="var(--accent-primary)" />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Long-term Memory</h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Persistent facts learned during development.</p>
              </div>
            </div>
            
            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px' }}>
              {agentMemory ? (
                <div style={{ whiteSpace: 'pre-wrap', color: '#bbb', fontSize: '12px', lineHeight: '1.8', fontFamily: 'monospace' }}>
                  {agentMemory}
                </div>
              ) : (
                <p style={{ color: '#555', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', padding: '40px 0' }}>
                  No persistent memories stored in this session.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <BookOpen size={24} color="var(--accent-primary)" />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Reference & State</h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Laboratory metrics and Vult documentation context.</p>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#888', display: 'flex', flexDirection: 'column', gap: '8px' }}>
               {Object.entries(getTelemetry()).slice(0, 20).map(([k, v]) => (
                 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '4px' }}>
                   <span style={{ color: '#666' }}>{k}</span>
                   <span style={{ color: '#fff', fontWeight: 'bold' }}>{String(v)}</span>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}>
        {activeTab === 'chat' && messages.length < 10 && (
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
             {suggestions.map(s => (
               <button 
                 key={s.label}
                 onClick={() => setInput(s.prompt)}
                 style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', fontSize: '10px', cursor: 'pointer' }}
               >
                 {s.label}
               </button>
             ))}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                   isLoading ? handleStop() : handleSend();
                } else if (e.key === 'Enter' && !isLoading && input.trim()) {
                   handleSend();
                }
              }} 
              placeholder={askUserResolverRef.current ? "Thinking..." : "Message Agent (Cmd+Enter)..."} 
              style={{ 
                width: '100%', 
                background: 'rgba(0,0,0,0.4)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '12px', 
                padding: '12px 16px', 
                color: '#fff', 
                fontSize: '13px', 
                outline: 'none',
                transition: 'all 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={isLoading ? handleStop : handleSend} 
            disabled={!isLoading && !input.trim()} 
            style={{ 
              background: isLoading ? '#622' : (!input.trim() ? '#222' : 'var(--accent-primary)'), 
              border: 'none', 
              borderRadius: '12px', 
              width: '44px', 
              height: '44px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: (!isLoading && !input.trim()) ? 'not-allowed' : 'pointer', 
              color: isLoading ? '#f55' : (!input.trim() ? '#444' : '#000'), 
            }}
          >
            {isLoading ? <StopCircle size={20} /> : <Send size={20} />}
          </motion.button>
        </div>
      </div>

      <div 
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px', cursor: 'se-resize', zIndex: 10000,
          background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%)'
        }}
      />
    </motion.div>
  );
});

LLMPane.displayName = 'LLMPane';
export default LLMPane;
