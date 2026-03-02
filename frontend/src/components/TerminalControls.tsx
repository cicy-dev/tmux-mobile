import React from 'react';
import { Mouse, FileText, Loader2 } from 'lucide-react';

interface TerminalControlsProps {
  mouseMode?: 'on' | 'off';
  onToggleMouse?: () => void;
  isTogglingMouse?: boolean;
  onCapture?: () => void;
  isCapturing?: boolean;
}

export const TerminalControls: React.FC<TerminalControlsProps> = ({
  mouseMode,
  onToggleMouse,
  isTogglingMouse,
  onCapture,
  isCapturing
}) => {
  return (
    <>
      {onToggleMouse && (
        <button
          type="button"
          onClick={onToggleMouse}
          disabled={isTogglingMouse}
          className={`p-1 rounded transition-colors ${mouseMode === 'on' ? 'text-green-400 bg-green-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          title={mouseMode === 'on' ? "鼠标: 开" : "鼠标: 关"}
        >
          {isTogglingMouse ? <Loader2 size={14} className="animate-spin" /> : <Mouse size={14} />}
        </button>
      )}
      {onCapture && (
        <button
          onClick={onCapture}
          disabled={isCapturing}
          className="p-1 rounded text-yellow-400 hover:text-yellow-300 hover:bg-gray-700 disabled:opacity-40"
          title="Capture pane"
        >
          {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        </button>
      )}
    </>
  );
};
