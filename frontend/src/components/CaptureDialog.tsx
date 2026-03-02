import React, { useEffect } from 'react';

interface CaptureDialogProps {
  output: string | null;
  onClose: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  paneId?: string;
}

export const CaptureDialog: React.FC<CaptureDialogProps> = ({ output, onClose, onRefresh, isRefreshing, paneId }) => {
  const contentRef = React.useRef<HTMLPreElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && output !== null) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [output, onClose]);

  useEffect(() => {
    if (output && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [output]);

  if (output === null) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-black" style={{zIndex: 99999999}}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
        <span className="text-sm font-semibold text-white">Captured Output</span>
        <div className="flex gap-2">
          {onRefresh && (
            <button onClick={onRefresh} disabled={isRefreshing} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs disabled:opacity-50">
              {isRefreshing ? '...' : 'Refresh'}
            </button>
          )}
          {paneId && (
            <button 
              onClick={() => {
                const blob = new Blob([output || ''], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${paneId}_capture_${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs"
            >
              Export
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs">Close</button>
        </div>
      </div>
      <pre ref={contentRef} className="flex-1 overflow-auto p-4 text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-black">
        {output || '(empty)'}
      </pre>
    </div>
  );
};
