import { forwardRef, useRef, useState, useCallback, useEffect, useImperativeHandle } from 'react';
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
  /** AI-suggested code to show as ghost text at the cursor position. */
  aiSuggestion?: string;
}

const EditorPane = forwardRef<VultEditorHandle, EditorPaneProps>(
  ({ fileName, code, onChange, markers, onStateUpdate, diffCode, diffMode, aiSuggestion }, ref) => {
    const editorRef = useRef<VultEditorHandle>(null);
    const suggestionDisposableRef = useRef<any>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorCol, setCursorCol] = useState(1);

    useImperativeHandle(ref, () => ({
      insertAtCursor(text: string) {
        editorRef.current?.insertAtCursor(text);
      },
      setValue(value: string) {
        editorRef.current?.setValue(value);
      },
      getEditor() {
        return editorRef.current?.getEditor();
      },
      getMonaco() {
        return editorRef.current?.getMonaco() ?? null;
      },
    }));

    // Register/update inline completions provider when aiSuggestion changes
    useEffect(() => {
      const monaco = editorRef.current?.getMonaco();
      const editor = editorRef.current?.getEditor();

      // Clean up previous provider
      if (suggestionDisposableRef.current) {
        suggestionDisposableRef.current.dispose();
        suggestionDisposableRef.current = null;
      }

      if (!monaco || !editor || !aiSuggestion) return;

      const disposable = monaco.languages.registerInlineCompletionsProvider('vult', {
        provideInlineCompletions(
          model: any,
          position: any,
        ) {
          return {
            items: [
              {
                insertText: aiSuggestion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          };
        },
        freeInlineCompletions() {
          // no-op
        },
      });

      suggestionDisposableRef.current = disposable;

      // Trigger inline suggestion display
      editor.trigger('ai', 'editor.action.inlineSuggest.trigger', {});

      return () => {
        disposable.dispose();
        suggestionDisposableRef.current = null;
      };
    }, [aiSuggestion]);

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
