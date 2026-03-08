import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Settings, Activity, StopCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface LLMPaneProps {
  currentCode: string;
  onUpdateCode: (code: string) => Promise<{success: boolean, error?: string}>;
  onSetKnob: (cc: number, value: number) => void;
  onTriggerGenerator: (index: number) => void;
  onConfigureInput: (index: number, config: any) => void;
  onLoadPreset: (name: string) => void;
  getPresets: () => string[];
  getTelemetry: () => Record<string, any>;
  getSpectrum: () => number[];
  getAudioMetrics: () => Record<string, number>;
  systemPrompt: string;
}

type MessagePart = { 
  text?: string; 
  thought?: string; 
  functionCall?: any; 
  functionResponse?: any 
};
type Message = { role: 'user' | 'model', parts: MessagePart[] };

const LLMPane: React.FC<LLMPaneProps> = ({ 
  currentCode, onUpdateCode, onSetKnob, onTriggerGenerator, 
  onConfigureInput, onLoadPreset, getPresets, getTelemetry, getSpectrum, getAudioMetrics, systemPrompt 
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(currentCode);
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
  }, []);

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
      const next = {
        prompt: prev.prompt + (usage.prompt_token_count || usage.prompt_tokens || 0),
        completion: prev.completion + (usage.candidates_token_count || usage.completion_tokens || 0),
        total: prev.total + (usage.total_token_count || usage.total_tokens || 0)
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
        description: "Replaces the entire Vult code in the editor with new code. ALWAYS provide the COMPLETE code file.",
        parameters: {
          type: "OBJECT",
          properties: { new_code: { type: "STRING", description: "The complete, updated Vult code." } },
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
        name: "get_spectrum_data",
        description: "Retrieves a snapshot of the current 1024-band frequency spectrum of the output signal. Use this to verify audio activity or filter performance.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "get_audio_metrics",
        description: "Retrieves real-time audio metrics: Peak Level, RMS, Clipping Count, and Headroom (dB). Use this to check if the output is clipping or distorted.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "ask_user",
        description: "Asks the user a question.",
        parameters: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING", description: "The question to ask." }
          },
          required: ["question"]
        }
      },
      {
        name: "user_message",
        description: "Displays a status message or update to the user about what you are currently doing.",
        parameters: {
          type: "OBJECT",
          properties: {
            message: { type: "STRING", description: "The message to display." }
          },
          required: ["message"]
        }
      }
    ];
  };

  const callGeminiStream = async (currentMessages: Message[]) => {
    const payload = {
      contents: currentMessages,
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
      throw new Error(err.error?.message || response.statusText);
    }
    return response.body;
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
      throw new Error(err.error?.message || response.statusText);
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
    
    try {
      while (!stopFlagRef.current) {
        setStatus("Thinking...");
        
        let modelParts: MessagePart[] = [];
        let currentTextId = "";
        let currentThoughtId = "";

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
                  if (data.usageMetadata) updateTokens(data.usageMetadata);
                  const incomingParts = data.candidates?.[0]?.content?.parts || [];
                  for (const part of incomingParts) {
                    modelParts.push(part);
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
                  }
                } catch (e) {}
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

        if (currentTextId) finalizeStreamingMsg(currentTextId);
        if (currentThoughtId) finalizeStreamingMsg(currentThoughtId);

        if (stopFlagRef.current) break;

        currentConversation.push({ role: 'model', parts: modelParts });

        const functionCalls = modelParts.filter(p => !!p.functionCall).map(p => p.functionCall);

        if (functionCalls.length > 0) {
          let functionResponses: MessagePart[] = [];
          for (const fc of functionCalls) {
            if (stopFlagRef.current) break;
            const name = fc.name.includes(':') ? fc.name.split(':').pop() : fc.name;
            setStatus(`Executing ${name}...`);
            
            let result: any = {};
            if (name === 'get_current_code') {
              addDisplayMsg('system', `🛠️ Tool: get_current_code`);
              result = { code: codeRef.current };
            } else if (name === 'grep_search') {
              addDisplayMsg('system', `🛠️ Tool: grep_search("${fc.args.pattern}")`);
              const lines = codeRef.current.split('\n');
              try {
                const regex = new RegExp(fc.args.pattern, 'i');
                const matches = lines.map((l, i) => regex.test(l) ? `${i+1}: ${l}` : null).filter(Boolean);
                result = { matches: matches.length > 0 ? matches : ["No matches found."] };
              } catch(e: any) { result = { error: e.message }; }
            } else if (name === 'apply_diff') {
              addDisplayMsg('system', `🛠️ Tool: apply_diff`);
              const { old_string, new_string } = fc.args;
              if (codeRef.current.includes(old_string)) {
                const newCode = codeRef.current.replace(old_string, new_string);
                const res = await onUpdateCode(newCode);
                if (res.success) {
                  addDisplayMsg('system', `✅ Applied diff. Trial compilation successful.`);
                  result = { success: true, message: "Search-and-replace successful. Code is valid. Please verify the output on the scope." };
                } else {
                  addDisplayMsg('system', `❌ Diff failed to compile:\n${res.error}`);
                  result = { success: false, error: res.error, context: "Your surgical replacement caused a compilation error. Re-check the logic." };
                }
              } else {
                addDisplayMsg('system', `❌ Error: 'old_string' not found.`);
                result = { success: false, error: "Pattern not found." };
              }
            } else if (name === 'edit_lines') {
              addDisplayMsg('system', `🛠️ Tool: edit_lines(${fc.args.start_line}-${fc.args.end_line})`);
              const { start_line, end_line, new_code } = fc.args;
              const lines = codeRef.current.split('\n');
              if (start_line > 0 && end_line >= start_line && start_line <= lines.length) {
                const before = lines.slice(0, start_line - 1);
                const after = lines.slice(end_line);
                const updatedCode = [...before, new_code, ...after].join('\n');
                const res = await onUpdateCode(updatedCode);
                if (res.success) {
                  addDisplayMsg('system', `✅ Lines ${start_line}-${end_line} replaced. Trial compilation successful.`);
                  result = { success: true, message: `Lines ${start_line}-${end_line} updated. Code is valid. You should now use get_live_telemetry or get_spectrum_data to verify behavior.` };
                } else {
                  addDisplayMsg('system', `❌ Edit failed to compile:\n${res.error}`);
                  result = { success: false, error: res.error, context: "The code you provided resulted in a compilation error. Please analyze the error and fix the logic." };
                }
              } else {
                addDisplayMsg('system', `❌ Invalid line numbers.`);
                result = { success: false, error: "Invalid line ranges." };
              }
            } else if (name === 'update_code') {
              addDisplayMsg('system', `🛠️ Tool: update_code`);
              const res = await onUpdateCode(fc.args.new_code);
              if (res.success) {
                addDisplayMsg('system', `✅ Code updated and trial-compiled.`);
                result = { success: true, message: "Full code update successful. Waiting for user approval. Perform verification tools if needed." };
              } else {
                addDisplayMsg('system', `❌ Compilation failed:\n${res.error}`);
                result = { success: false, error: res.error };
              }
            } else if (name === 'set_knob') {
              addDisplayMsg('system', `🛠️ Tool: set_knob(${fc.args.cc}, ${fc.args.value})`);
              onSetKnob(fc.args.cc, fc.args.value);
              result = { success: true };
            } else if (name === 'send_midi_cc') {
              addDisplayMsg('system', `🛠️ Tool: send_midi_cc(${fc.args.cc}, ${fc.args.value})`);
              onSetKnob(fc.args.cc, fc.args.value);
              result = { success: true };
            } else if (name === 'trigger_generator') {
              addDisplayMsg('system', `🛠️ Tool: trigger_generator(${fc.args.index})`);
              onTriggerGenerator(fc.args.index);
              result = { success: true };
            } else if (name === 'configure_lab_input') {
              addDisplayMsg('system', `🛠️ Tool: configure_lab_input`);
              onConfigureInput(fc.args.index, fc.args);
              result = { success: true };
            } else if (name === 'load_preset') {
              addDisplayMsg('system', `🛠️ Tool: load_preset("${fc.args.name}")`);
              onLoadPreset(fc.args.name);
              result = { success: true };
            } else if (name === 'list_presets') {
              result = { presets: getPresets() };
            } else if (name === 'get_live_telemetry') {
              result = { telemetry: getTelemetry() };
            } else if (name === 'get_spectrum_data') {
              result = { spectrum: getSpectrum() };
            } else if (name === 'get_audio_metrics') {
              result = { metrics: getAudioMetrics() };
            } else if (name === 'user_message') {
              addDisplayMsg('assistant', fc.args.message);
              result = { success: true };
            } else if (name === 'ask_user') {
              setStatus("Waiting for user...");
              addDisplayMsg('assistant', fc.args.question);
              const userResponse = await new Promise<string>((resolve) => {
                askUserResolverRef.current = resolve;
              });
              askUserResolverRef.current = null;
              result = { response: userResponse };
            }

            functionResponses.push({ functionResponse: { name: fc.name, response: result } });
          }
          currentConversation.push({ role: 'user', parts: functionResponses });
        } else {
          break; // Agent finished
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addDisplayMsg('assistant', `⚠️ Error: ${err.message}`);
        console.error("Agent Error:", err);
      }
    } finally {
      setIsLoading(false);
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
            <Activity size={14} color={isLoading ? "#00ff00" : "#666"} className={isLoading ? "animate-spin" : ""} />
            <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Vult Agent</span>
          </div>
          <div style={{ fontSize: '10px', color: '#00ff00', marginTop: '2px', fontWeight: 'bold', fontFamily: 'monospace' }}>
            TOKENS: {tokens.total.toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isLoading && (
            <button onClick={handleStop} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }} title="Stop Agent">
              <StopCircle size={16} />
            </button>
          )}
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
        </div>
      )}

      <div style={{ height: '2px', width: '100%', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ position: 'absolute', height: '100%', width: '30%', background: '#007acc', boxShadow: '0 0 10px #007acc', animation: 'agent-progress 1.5s infinite linear' }} />
        )}
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
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={askUserResolverRef.current ? "Type your answer..." : "Ask the Vult Agent..."} disabled={isLoading && !askUserResolverRef.current} style={{ flex: 1, background: '#252526', border: '1px solid #444', borderRadius: '20px', padding: '8px 16px', color: '#fff', fontSize: '13px', outline: 'none' }} />
        <button onClick={handleSend} disabled={(isLoading && !askUserResolverRef.current) || !input.trim()} style={{ background: (isLoading && !askUserResolverRef.current) || !input.trim() ? '#333' : '#007acc', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.2s' }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default LLMPane;
