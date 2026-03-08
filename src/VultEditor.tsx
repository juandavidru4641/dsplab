import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';

interface VultEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  markers?: any[];
}

const VultEditor: React.FC<VultEditorProps> = ({ code, onChange, markers = [] }) => {
  const lastCodeRef = useRef(code);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      monacoRef.current.editor.setModelMarkers(
        editorRef.current.getModel(),
        'vult',
        markers
      );
    }
  }, [markers]);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

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

  const handleOnChange = (value: string | undefined) => {
    if (value !== lastCodeRef.current) {
      lastCodeRef.current = value || '';
      onChange(value);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%' }}>
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
          glyphMargin: true
        }}
      />
    </div>
  );
};

export default VultEditor;
