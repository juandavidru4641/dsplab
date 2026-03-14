import { forwardRef, useRef, useState, useCallback, useImperativeHandle } from 'react';
import VultEditor from '../../VultEditor';
import type { VultEditorHandle } from '../../VultEditor';
import './EditorPane.css';

interface EditorPaneProps {
  fileName: string;
  code: string;
  onChange: (code: string) => void;
  markers?: any[];
  onStateUpdate?: (callback: (state: Record<string, any>) => void) => () => void;
  diffCode?: string;
  diffMode?: boolean;
}

const EditorPane = forwardRef<VultEditorHandle, EditorPaneProps>(
  ({ fileName, code, onChange, markers, onStateUpdate, diffCode, diffMode }, ref) => {
    const editorRef = useRef<VultEditorHandle>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorCol, setCursorCol] = useState(1);

    useImperativeHandle(ref, () => ({
      insertAtCursor(text: string) {
        editorRef.current?.insertAtCursor(text);
      },
      setValue(value: string) {
        editorRef.current?.setValue(value);
      },
    }));

    // Wrap the onStateUpdate registration function to intercept state for cursor position
    const handleStateUpdate = useCallback(
      (callback: (state: Record<string, any>) => void) => {
        const wrappedCallback = (state: Record<string, any>) => {
          if (state.cursorPosition) {
            setCursorLine(state.cursorPosition.lineNumber ?? 1);
            setCursorCol(state.cursorPosition.column ?? 1);
          }
          callback(state);
        };
        if (onStateUpdate) {
          return onStateUpdate(wrappedCallback);
        }
        // Return a no-op unsubscribe if no onStateUpdate provided
        return () => {};
      },
      [onStateUpdate],
    );

    const handleChange = useCallback(
      (value: string | undefined) => {
        onChange(value ?? '');
      },
      [onChange],
    );

    return (
      <div className="editor-pane">
        <div className="editor-pane__tabs">
          <div className="editor-pane__tab editor-pane__tab--active">
            <span>{fileName}</span>
            <span className="editor-pane__tab-close">&times;</span>
          </div>
          <span className="editor-pane__cursor-pos">
            Ln {cursorLine}, Col {cursorCol}
          </span>
        </div>
        <div className="editor-pane__editor">
          <VultEditor
            ref={editorRef}
            code={code}
            onChange={handleChange}
            markers={markers}
            onStateUpdate={handleStateUpdate}
            diffMode={diffMode}
            originalCode={diffCode}
          />
        </div>
      </div>
    );
  },
);

EditorPane.displayName = 'EditorPane';

export default EditorPane;
export type { EditorPaneProps };
