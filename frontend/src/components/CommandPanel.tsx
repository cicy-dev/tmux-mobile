import React, { useEffect ,useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, CheckCircle, Sparkles, History, X, Check, Mic, Clipboard } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { Position, Size } from '../types';
import { sendCommandToTmux } from '../services/mockApi';
import { getApiUrl } from '../services/apiUrl';

interface CommandPanelProps {
  paneTarget: string;
  title: string;
  token: string | null;
  panelPosition: Position;
  panelSize: Size;
  readOnly: boolean;
  onReadOnlyToggle: () => void;
  onVoiceModeToggle: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onChange: (pos: Position, size: Size) => void;
  onCapturePane?: () => void;
  isCapturing?: boolean;
}

export interface CommandPanelHandle {
  focusTextarea: () => void;
}

export const CommandPanel = forwardRef<CommandPanelHandle, CommandPanelProps>(({
  paneTarget,
  title,
  token,
  panelPosition,
  panelSize,
  readOnly,
  onReadOnlyToggle,
  onVoiceModeToggle,
  onInteractionStart,
  onInteractionEnd,
  onChange,
  onCapturePane,
  isCapturing,
}, ref) => {
  const [promptText, setPromptText] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempDraft, setTempDraft] = useState('');

  const tempPaneId = paneTarget.replace(/[^a-zA-Z0-9]/g, '_');

  const CMD_HISTORY_KEY = `cmd_history_${tempPaneId}`;

  useEffect(() => {
    const saved = localStorage.getItem(CMD_HISTORY_KEY);
    if (saved) {
      try { setCommandHistory(JSON.parse(saved)); } catch {}
    }
  }, [paneTarget]);

  const saveCommandHistory = (history: string[]) => {
    localStorage.setItem(CMD_HISTORY_KEY, JSON.stringify(history));
  };

  const DRAFT_KEY = `cmd_draft_${tempPaneId}`;
  const saveDraft = (text: string) => {
    localStorage.setItem(DRAFT_KEY, text);
  };

  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      setPromptText(savedDraft);
    }
  }, [paneTarget]);

  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [correctedText, setCorrectedText] = useState('');
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focusTextarea: () => { setTimeout(() => textareaRef.current?.focus(), 50); },
  }));

  const handleSendPrompt = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cmd = promptText.trim();
    if (!cmd || !paneTarget) return;
    const newHistory = [cmd, ...commandHistory.filter(c => c !== cmd)].slice(0, 50);
    setCommandHistory(newHistory);
    saveCommandHistory(newHistory);
    setHistoryIndex(-1);
    setTempDraft('');
    setPromptText('');
    saveDraft('');
    setIsSending(true);
    setSendSuccess(false);
    try {
      await sendCommandToTmux(cmd, paneTarget);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (e) { console.error(e); }
    finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [promptText, paneTarget]);

  const handleCorrectEnglish = async () => {
    if (!promptText.trim() || isCorrectingEnglish || !token) return;
    setIsCorrectingEnglish(true);
    setCorrectedText('');
    try {
      const res = await fetch(getApiUrl('/api/correctEnglish'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: promptText })
      });
      const data = await res.json();
      if (data.success && data.correctedText) setCorrectedText(data.correctedText);
    } catch (e) { console.error(e); }
    finally { setIsCorrectingEnglish(false); }
  };

  const handleAcceptCorrection = () => {
    setPromptText(correctedText);
    setCorrectedText('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSelectHistory = (cmd: string) => {
    setPromptText(cmd);
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <FloatingPanel
      title={title}
      initialPosition={panelPosition}
      initialSize={panelSize}
      minSize={{ width: 340, height: 140 }}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
      onChange={onChange}
      headerActions={
        <>
          {onCapturePane && (
            <button
              onClick={onCapturePane}
              disabled={isCapturing}
              className="p-1.5 rounded text-yellow-400 hover:bg-gray-700 disabled:opacity-40"
              title="Capture pane output"
            >
              {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Clipboard size={14} />}
            </button>
          )}
          <button
            onClick={onReadOnlyToggle}
            className={`p-1.5 rounded transition-colors ${readOnly ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            title={readOnly ? 'Read-only ON (click to disable)' : 'Enable read-only'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
          <button
            onClick={onVoiceModeToggle}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-600 hover:text-white transition-all"
            title="Switch to voice mode"
          >
            <Mic size={18} />
          </button>
        </>
      }
    >
      <form onSubmit={handleSendPrompt} className="relative h-full flex flex-col p-2">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex-1 flex flex-col min-h-0">
            <textarea
              ref={textareaRef}
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                saveDraft(e.target.value);
                if (historyIndex === -1) setTempDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSendPrompt();
                } else if (e.key === 'ArrowUp') {
                  const textarea = e.currentTarget;
                  const isOnFirstLine = !textarea.value.substring(0, textarea.selectionStart).includes('\n');
                  if (isOnFirstLine && commandHistory.length > 0) {
                    e.preventDefault();
                    if (historyIndex === -1) {
                      setTempDraft(promptText);
                      setHistoryIndex(0);
                      setPromptText(commandHistory[0]);
                    } else if (historyIndex < commandHistory.length - 1) {
                      const ni = historyIndex + 1;
                      setHistoryIndex(ni);
                      setPromptText(commandHistory[ni]);
                    }
                  }
                } else if (e.key === 'ArrowDown') {
                  const textarea = e.currentTarget;
                  const isOnLastLine = !textarea.value.substring(textarea.selectionStart).includes('\n');
                  if (isOnLastLine) {
                    e.preventDefault();
                    if (historyIndex > 0) {
                      const ni = historyIndex - 1;
                      setHistoryIndex(ni);
                      setPromptText(commandHistory[ni]);
                    } else if (historyIndex === 0) {
                      setHistoryIndex(-1);
                      setPromptText(tempDraft);
                    }
                  }
                }
              }}
              placeholder="Type command..."
              className="w-full h-full bg-black/50 text-white rounded-lg border border-gray-700 p-2 pr-2 pb-10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-sm shadow-inner placeholder:text-gray-600 placeholder:opacity-50"
              disabled={isSending}
            />
            <div className="absolute bottom-3 right-2 flex gap-1">
              <button
                type="button"
                onClick={() => setShowHistory(v => !v)}
                className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                title="Command history"
              >
                <History size={14} />
              </button>
              <button
                type="button"
                onClick={handleCorrectEnglish}
                disabled={!promptText.trim() || isCorrectingEnglish}
                className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                title="Correct English with AI"
              >
                {isCorrectingEnglish ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
              <button
                type="submit"
                disabled={!promptText.trim() || isSending}
                className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : sendSuccess ? <CheckCircle size={14} className="text-green-400" /> : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                )}
              </button>
            </div>
          </div>

          {correctedText && (
            <div className="mt-2 p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-400 flex-shrink-0" />
                  <span className="text-xs text-purple-300 font-medium">Corrected Text:</span>
                </div>
                <button onClick={() => setCorrectedText('')} className="text-gray-400 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              <p className="text-sm text-white mb-3 whitespace-pre-wrap">{correctedText}</p>
              <button
                onClick={handleAcceptCorrection}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <Check size={14} />
                Use This Text
              </button>
            </div>
          )}

          {showHistory && (
            <div className="mt-2 flex-1 overflow-y-auto bg-black/30 rounded-lg border border-gray-700 flex flex-col max-h-40">
              {commandHistory.length > 0 ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900/50 flex-shrink-0">
                    <span className="text-xs text-gray-400">History</span>
                    <button onClick={() => setCommandHistory([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                  </div>
                  <div className="divide-y divide-gray-800 overflow-y-auto">
                    {commandHistory.map((cmd, idx) => (
                      <div key={idx} onClick={() => handleSelectHistory(cmd)}
                        className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-gray-300 hover:text-white group">
                        <div className="flex items-center gap-2">
                          <History size={12} className="text-gray-500 flex-shrink-0" />
                          <span className="truncate text-sm flex-1">{cmd}</span>
                          <button onClick={(e) => { e.stopPropagation(); setCommandHistory(prev => prev.filter((_, i) => i !== idx)); }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-4 py-3 text-gray-500 text-center text-sm">No history yet</div>
              )}
            </div>
          )}
        </div>
      </form>
    </FloatingPanel>
  );
});
