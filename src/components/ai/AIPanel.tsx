import React, { forwardRef } from 'react';
import LLMPane from '../../LLMPane';
import type { LLMPaneHandle } from '../../LLMPane';
import './AIPanel.css';

// Re-export the handle type
export type { LLMPaneHandle as AIPanelHandle };

// AIPanel wraps LLMPane with restyled container
const AIPanel = forwardRef<LLMPaneHandle, any>((props, ref) => {
  return (
    <div className="ai-panel">
      <LLMPane ref={ref} {...props} />
    </div>
  );
});

AIPanel.displayName = 'AIPanel';
export { AIPanel };
