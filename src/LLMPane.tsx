import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Settings, Activity, StopCircle, ChevronDown, ChevronRight } from 'lucide-react';

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
  getSpectrum: () => number[];
  getPeakFrequencies: (count?: number) => {energy: number, frequency: number}[];
  getAudioMetrics: () => Record<string, number>;
  systemPrompt: string;
}

type MessagePart = { 
  text?: string; 
  thought?: string; 
  functionCall?: any; 
  functionResponse?: any;
  thought_signature?: string;
  thoughtSignature?: string; // Handle both cases for API stability
};
type Message = { role: 'user' | 'model', parts: MessagePart[] };

const LLMPane: React.FC<LLMPaneProps> = ({ 
  currentCode, onUpdateCode, onSetKnob, onTriggerGenerator, 
  onConfigureInput, onLoadPreset, onSaveSnapshot, onSetProbes, onConfigureSequencer, 
  getPresets, getSequencerState, getTelemetry, getSpectrum, getPeakFrequencies, getAudioMetrics, systemPrompt 
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [displayMessages, setDisplayMessages] = useState<{ 
    role: 'user' | 'assistant' | 'system' | 'thought', 
    content: string, 
    id: string,
    isStreaming?: boolean,
    choices?: {label: string, value: string}[]
  }[]>([]);

  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-2.0-flash-lite-preview-02-05');
  const [showSettings, setShowSettings] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [currentTurn, setCurrentTurn] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(currentCode);
  const planRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const askUserResolverRef = useRef<((val: string) => void) | null>(null);
  const stopFlagRef = useRef(false);

  useEffect(() => { codeRef.current = currentCode; }, [currentCode]);

  useEffect(() => {
    const savedProvider = localStorage.getItem('llm_provider') as 'gemini' | 'openai';
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
  }, []);

  // Persist messages whenever they change
  useEffect(() => {
    localStorage.setItem('llm_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('llm_display_messages', JSON.stringify(displayMessages));
  }, [displayMessages]);

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
    scrollToBottom();
  }, [displayMessages, isLoading, status]);

  const handleSaveSettings = (newProvider: 'gemini' | 'openai', newEndpoint: string, key: string, model: string) => {
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
    setDisplayMessages(prev => {
      if (isStreaming && prev.length > 0 && prev[prev.length - 1].id === id) {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: prev[prev.length - 1].content + content };
        return next;
      }
      return [...prev, { role, content, id, isStreaming, choices }];
    });
    return id;
  };

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
        description: "Retrieves the current values of all internal Vult variables (live telemetry).",
        parameters: { type: "OBJECT", properties: {} }
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
        name: "get_audio_metrics",
        description: "Retrieves real-time audio metrics: Peak Level, RMS, Clipping Count, and Headroom (dB). Use this to check if the output is clipping or distorted.",
        parameters: { type: "OBJECT", properties: {} }
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
        parts: [{ text: systemPrompt + "\nALWAYS be verbose and detailed about your DSP logic and actions. Explain WHY you are making changes." }] 
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
      { role: "system", content: systemPrompt + "\nALWAYS be verbose and detailed about your DSP logic and actions. Explain WHY you are making changes." }
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
    
    try {
      while (!stopFlagRef.current && turnCount < MAX_TURNS) {
        turnCount++;
        setCurrentTurn(turnCount);
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

        const functionCalls = modelParts.filter(p => !!p.functionCall).map(p => p.functionCall);

        if (functionCalls.length > 0) {
          let functionResponses: MessagePart[] = [];
          
          const toolLabels: Record<string, string> = {
            'get_current_code': '[RESEARCH] Reading source code context',
            'grep_search': '[RESEARCH] Searching patterns',
            'apply_diff': '[ACTION] Applying surgical fix',
            'edit_lines': '[ACTION] Editing code block',
            'multi_edit': '[ACTION] Performing batch edits',
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
            'get_spectrum_data': '[RESEARCH] Analyzing spectrum',
            'get_peak_frequencies': '[RESEARCH] Finding peak frequencies',
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
              result = { code: codeRef.current };
            } else if (name === 'grep_search') {
              const pattern = fc.args.pattern;
              addDisplayMsg('system', `[RESEARCH] Searching for pattern: "${pattern}"`);
              const lines = codeRef.current.split('\n');
              try {
                const regex = new RegExp(pattern, 'i');
                const matches = lines.map((l, i) => regex.test(l) ? `${i+1}: ${l}` : null).filter(Boolean);
                result = { matches: matches.length > 0 ? matches : ["No matches found."] };
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
              addDisplayMsg('system', `[RESEARCH] Inspecting internal memory states`);
              result = { telemetry: getTelemetry() };
            } else if (name === 'get_state') {
              const key = fc.args.key;
              const telemetry = getTelemetry();
              addDisplayMsg('system', `[RESEARCH] Reading state: ${key}`);
              result = { [key]: telemetry[key] !== undefined ? telemetry[key] : "Variable not found." };
            } else if (name === 'get_spectrum_data') {
              addDisplayMsg('system', `[RESEARCH] Capturing frequency spectrum snapshot`);
              result = { spectrum: getSpectrum() };
            } else if (name === 'get_peak_frequencies') {
              addDisplayMsg('system', `[RESEARCH] Finding peak frequencies`);
              result = { peaks: getPeakFrequencies(fc.args.count) };
            } else if (name === 'get_audio_metrics') {
              addDisplayMsg('system', `[RESEARCH] Measuring output signal quality (RMS/Peak/Headroom)`);
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
              result = { functions: functions.length > 0 ? functions : "No functions found." };
            } else if (name === 'get_vult_reference') {
              addDisplayMsg('system', `[RESEARCH] Consulting Vult technical reference`);
              result = {
                reference: {
                  types: "real (float), int (integer), bool (boolean), array(type, size)",
                  keywords: "fun (function), mem (persistent state), val (local constant), if/else, and (parallel definitions), return",
                  operators: "Standard arithmetic (+, -, *, /, %), Comparison (==, !=, <, >, <=, >=), Logic (&&, ||, !)",
                  built_ins: "abs(x), exp(x), log(x), sin(x), cos(x), tan(x), tanh(x), sqrt(x), pow(x,y), floor(x), clip(x, low, high), real(int), int(real)",
                  entry_point: "fun process(input: real, ...) : real"
                }
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
            }

            functionResponses.push({ functionResponse: { name: fc.name, response: result } });
          }
          currentConversation.push({ role: 'user', parts: functionResponses });
        } else {
          break; // Agent finished
        }
      }
      
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

  const handleChoice = (val: string) => {
    if (askUserResolverRef.current) {
      addDisplayMsg('user', `Selected: ${val}`);
      askUserResolverRef.current(val);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #333', background: '#1e1e1e' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={14} color={isLoading ? "#ff0000" : "#666"} className={isLoading ? "animate-spin" : ""} />
            <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Vult Agent</span>
          </div>
          <div style={{ fontSize: '10px', color: '#00ff00', marginTop: '2px', fontWeight: 'bold', fontFamily: 'monospace', textShadow: '0 0 5px rgba(0,255,0,0.3)' }}>
            TOKENS: {tokens.total.toLocaleString()} {currentTurn > 0 && `| TURN: ${currentTurn}/${provider === 'gemini' ? '50' : '30'}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'transparent', border: 'none', color: (provider === 'gemini' && apiKey) || provider === 'openai' ? '#00ff00' : '#888', cursor: 'pointer' }}>
            <Settings size={16} />
          </button>
        </div>
      </div>
      
      {showSettings && (
        <div style={{ padding: '12px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="radio" checked={provider === 'gemini'} onChange={() => handleSaveSettings('gemini', endpoint, apiKey, modelName)} />
              GEMINI
            </label>
            <label style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="radio" checked={provider === 'openai'} onChange={() => handleSaveSettings('openai', endpoint, apiKey, modelName)} />
              LOCAL/OAI
            </label>
          </div>
          {provider === 'openai' && (
            <input type="text" placeholder="Endpoint URL..." value={endpoint} onChange={(e) => handleSaveSettings(provider, e.target.value, apiKey, modelName)} style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
          )}
          <input type="password" placeholder="API Key..." value={apiKey} onChange={(e) => handleSaveSettings(provider, endpoint, e.target.value, modelName)} style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
          <input type="text" placeholder="Model ID..." value={modelName} onChange={(e) => handleSaveSettings(provider, endpoint, apiKey, e.target.value)} style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
          <button 
            onClick={() => { setTokens({ prompt: 0, completion: 0, total: 0 }); localStorage.removeItem('llm_tokens'); }}
            style={{ fontSize: '9px', background: '#444', color: '#fff', border: 'none', padding: '4px', borderRadius: '2px', cursor: 'pointer' }}
          >
            RESET TOKEN COUNTER
          </button>
          <button 
            onClick={handleClearChat}
            style={{ fontSize: '9px', background: '#441111', color: '#ff4444', border: '1px solid #ff4444', padding: '4px', borderRadius: '2px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            CLEAR CHAT HISTORY
          </button>
        </div>
      )}

      <div style={{ height: '4px', width: '100%', background: '#000', position: 'relative', overflow: 'hidden', borderBottom: '1px solid #333' }}>
        {isLoading && <div className="agent-scanner" />}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', scrollBehavior: 'smooth' }}>
        {displayMessages.map((m) => (
          <div key={m.id} style={{ 
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            width: m.role === 'system' || m.role === 'thought' ? '100%' : 'auto',
            background: m.role === 'user' ? '#007acc' : (m.role === 'assistant' ? '#2d2d2d' : 'transparent'),
            borderLeft: m.role === 'system' ? '2px solid #444' : (m.role === 'thought' ? '2px solid #333' : 'none'),
            color: m.role === 'system' ? '#888' : (m.role === 'thought' ? '#555' : '#fff'),
            padding: m.role === 'system' || m.role === 'thought' ? '4px 12px' : '10px 14px',
            borderRadius: '12px',
            maxWidth: m.role === 'system' || m.role === 'thought' ? '100%' : '85%',
            fontSize: m.role === 'system' || m.role === 'thought' ? '11px' : '13px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: m.role === 'system' || m.role === 'thought' ? 'monospace' : 'inherit',
            boxShadow: m.role === 'system' || m.role === 'thought' ? 'none' : '0 2px 8px rgba(0,0,0,0.2)',
            position: 'relative'
          }}>
            {m.role === 'thought' ? (
              <div>
                <div onClick={() => toggleThought(m.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none' }}>
                  {expandedThoughts.has(m.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />} THOUGHTS
                </div>
                {expandedThoughts.has(m.id) && (
                  <div style={{ marginTop: '4px', borderTop: '1px solid #222', paddingTop: '4px', color: '#666' }}>{m.content}</div>
                )}
              </div>
            ) : (
              <>
                <div style={{ position: 'absolute', top: '-14px', left: m.role === 'user' ? 'auto' : '4px', right: m.role === 'user' ? '4px' : 'auto', fontSize: '8px', color: '#555', fontWeight: 'bold' }}>
                  {m.role === 'user' ? 'YOU' : (m.role === 'assistant' ? 'VULT AGENT' : '')}
                </div>
                {m.content}
                {m.choices && (
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {m.choices.map(c => (
                      <button key={c.value} onClick={() => handleChoice(c.value)} style={{ background: '#333', border: '1px solid #444', color: '#ffcc00', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>{c.label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {status && (
          <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
            <Loader2 size={12} className="animate-spin" /> {status}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', gap: '8px', background: '#1a1a1a' }}>
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && (isLoading ? handleStop() : handleSend())} 
          placeholder={askUserResolverRef.current ? "Type your answer..." : "Ask the Vult Agent..."} 
          style={{ 
            flex: 1, 
            background: '#252526', 
            border: '1px solid #444', 
            borderRadius: '20px', 
            padding: '8px 16px', 
            color: '#fff', 
            fontSize: '13px', 
            outline: 'none' 
          }} 
        />
        <button 
          onClick={isLoading ? handleStop : handleSend} 
          disabled={!isLoading && !input.trim()} 
          style={{ 
            background: isLoading ? '#ff4444' : (!input.trim() ? '#333' : '#007acc'), 
            border: 'none', 
            borderRadius: '50%', 
            width: '36px', 
            height: '36px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer', 
            color: '#fff', 
            transition: 'all 0.2s' 
          }}
        >
          {isLoading ? <StopCircle size={18} /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
};

export default LLMPane;
