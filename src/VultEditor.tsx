import React, { useRef, useEffect, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';

interface VultEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  markers?: any[];
  onStateUpdate: (callback: (state: Record<string, any>) => void) => () => void;
  diffMode?: boolean;
  originalCode?: string;
}

interface HoverData {
  word: string;
  x: number;
  y: number;
  value: any;
}

const VultEditor: React.FC<VultEditorProps> = ({ 
  code, onChange, markers = [], onStateUpdate, diffMode = false, originalCode = "" 
}) => {
  const lastCodeRef = useRef(code);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<any>(null);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const currentStateRef = useRef<Record<string, any>>({});

  // Unified 15Hz subscription for sparklines and hover
  useEffect(() => {
    const unsubscribe = onStateUpdate((state) => {
      currentStateRef.current = state;

      // Update history for sparklines
      setHistory(prev => {
        const next = { ...prev };
        for (const key in state) {
          if (typeof state[key] === 'number') {
            if (!next[key]) next[key] = [];
            next[key] = [...next[key].slice(-39), state[key]];
          }
        }
        return next;
      });

      // Update hover data value if currently hovering
      setHoverData(current => {
        if (!current) return null;
        const newValue = state[current.word];
        if (newValue === undefined) return null;
        return { ...current, value: newValue };
      });
    });
    return unsubscribe;
  }, [onStateUpdate]);

  useEffect(() => {
    if (monacoRef.current && editorRef.current && !diffMode) {
      monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'vult', markers);
    }
  }, [markers, diffMode]);

  const setupMonaco = (monaco: Monaco) => {
    if (monaco.languages.getLanguages().some((l: any) => l.id === 'vult')) return;
    
    monaco.languages.register({ id: 'vult' });
    monaco.languages.setMonarchTokensProvider('vult', {
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\b(fun|mem|val|if|else|return|true|false|real|int|bool|and)\b/, 'keyword'],
          [/\b\d+(\.\d+)?\b/, 'number'],
          [/[{}()[\],;]/, 'delimiter'],
          [/[+\-*/%=<>!&|]/, 'operator'],
          [/[a-zA-Z_]\w*/, 'variable'],
        ],
      },
    });
  };

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setupMonaco(monaco);

    // Handle mouse movement for live hover
    editor.onMouseMove((e: any) => {
      if (diffMode) return; // Disable hover in diff mode for now
      if (e.target && e.target.range) {
        const word = editor.getModel().getWordAtPosition(e.target.range.getStartPosition());
        if (word) {
          const state = currentStateRef.current;
          if (state[word.word] !== undefined) {
            setHoverData({
              word: word.word,
              x: e.event.posx + 15,
              y: e.event.posy + 15,
              value: state[word.word]
            });
            return;
          }
        }
      }
      setHoverData(null);
    });

    editor.onMouseLeave(() => setHoverData(null));
  };

  const handleDiffMount = (editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    setupMonaco(monaco);
    // Automatically scroll to the first difference
    setTimeout(() => {
      if (editor.revealFirstDiff) editor.revealFirstDiff();
    }, 100);
  };

  const handleOnChange = (value: string | undefined) => {
    if (value !== lastCodeRef.current) {
      lastCodeRef.current = value || '';
      onChange(value);
    }
  };

  // Render mini Sparkline SVG
  const renderSparkline = (word: string) => {
    const data = history[word];
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const pts = data.map((v, i) => `${i * 3},${30 - ((v - min) / range) * 30}`).join(' ');
    
    return (
      <svg width="120" height="35" style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '4px' }}>
        <polyline points={pts} fill="none" stroke="#ffcc00" strokeWidth="1.5" />
      </svg>
    );
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {diffMode ? (
        <DiffEditor
          height="100%"
          original={originalCode}
          modified={code}
          language="vult"
          theme="vs-dark"
          onMount={handleDiffMount}
          options={{
            renderSideBySide: true,
            readOnly: true,
            fontSize: 14,
            automaticLayout: true,
            fontFamily: "'Fira Code', monospace",
          }}
        />
      ) : (
        <Editor
          height="100%"
          defaultLanguage="vult"
          value={code}
          theme="vs-dark"
          onChange={handleOnChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            fontFamily: "'Fira Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            glyphMargin: true,
            hover: { enabled: false }
          }}
        />
      )}

      {/* LIVE FLOATING HOVER */}
      {hoverData && !diffMode && (
        <div style={{
          position: 'fixed',
          left: hoverData.x,
          top: hoverData.y,
          background: '#252526',
          border: '1px solid #454545',
          borderRadius: '4px',
          padding: '8px 12px',
          zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', marginBottom: '2px' }}>LIVE STATE: {hoverData.word}</div>
          <div style={{ fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }}>
            {typeof hoverData.value === 'number' ? hoverData.value.toFixed(6) : String(hoverData.value)}
          </div>
          {typeof hoverData.value === 'number' && renderSparkline(hoverData.word)}
        </div>
      )}
    </div>
  );
};

export default VultEditor;
