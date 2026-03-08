import React, { useState, useEffect } from 'react';
import { Send, Loader2, Key } from 'lucide-react';

interface LLMPaneProps {
  onGenerateCode: (code: string) => void;
  systemPrompt: string;
}

const LLMPane: React.FC<LLMPaneProps> = ({ onGenerateCode, systemPrompt }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string }[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user' as const, content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    if (!apiKey) {
      setTimeout(() => {
        const mockResponse = "You need to set a Gemini API key first! (Click the Key icon).\n\n```vult\n// Mock code\nfun process(input: real) : real { return input; }\n```";
        setMessages([...newMessages, { role: 'assistant', content: mockResponse }]);
        setIsLoading(false);
      }, 500);
      return;
    }

    try {
      // Format messages for Gemini API
      const geminiMessages = newMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      // Prepend system prompt to the first user message if system instruction is not supported or just inject it
      const systemInstruction = {
        role: 'user',
        parts: [{ text: `SYSTEM INSTRUCTION: ${systemPrompt}` }]
      };

      const payload = {
        contents: [systemInstruction, ...geminiMessages],
        generationConfig: {
          temperature: 0.2,
        }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error parsing response";
      
      setMessages([...newMessages, { role: 'assistant', content: assistantResponse }]);
      
      // Extract code
      const codeMatch = assistantResponse.match(/```(?:vult)?([\s\S]*?)```/);
      if (codeMatch) {
        onGenerateCode(codeMatch[1].trim());
      }
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Failed to fetch from Gemini API: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #333', background: '#1e1e1e' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '14px', color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Gemini Vult Assistant</span>
        <button 
          onClick={() => setShowKeyInput(!showKeyInput)}
          style={{ background: 'transparent', border: 'none', color: apiKey ? '#00ff00' : '#888', cursor: 'pointer' }}
          title="Set Gemini API Key"
        >
          <Key size={14} />
        </button>
      </div>
      
      {showKeyInput && (
        <div style={{ padding: '12px', background: '#252526', borderBottom: '1px solid #333' }}>
          <input 
            type="password"
            placeholder="Enter Gemini API Key..."
            value={apiKey}
            onChange={(e) => handleSaveKey(e.target.value)}
            style={{ width: '100%', background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '12px' }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ 
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.role === 'user' ? '#007acc' : '#333',
            padding: '8px 12px',
            borderRadius: '12px',
            maxWidth: '90%',
            fontSize: '13px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {m.content}
          </div>
        ))}
        {isLoading && <Loader2 className="animate-spin" size={16} style={{ margin: '8px auto', color: '#aaa' }} />}
      </div>
      <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask for an audio effect..."
          style={{ 
            flex: 1, 
            background: '#252526', 
            border: '1px solid #444', 
            borderRadius: '4px', 
            padding: '8px', 
            color: '#fff',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button onClick={handleSend} style={{ background: '#007acc', border: 'none', borderRadius: '4px', padding: '8px', cursor: 'pointer', color: '#fff' }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default LLMPane;
