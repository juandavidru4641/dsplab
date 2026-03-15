import './RightPanel.css';

interface RightPanelProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onUndock: () => void;
  children: React.ReactNode;
}

export function RightPanel({ visible, title, onClose, onUndock, children }: RightPanelProps) {
  return (
    <div className={`right-panel${visible ? '' : ' right-panel--hidden'}`}>
      <div className="right-panel__header">
        <span className="right-panel__title">{title}</span>
        <button className="right-panel__action" onClick={onUndock} title="Undock">
          &#x29C9;
        </button>
        <button className="right-panel__action" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      <div className="right-panel__body">{children}</div>
    </div>
  );
}
