import React, { useEffect ,useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, CheckCircle, Sparkles, History, X, Check, Clipboard, Mouse, SplitSquareHorizontal, SplitSquareVertical, XSquare, RotateCcw, Power, Wifi, WifiOff, Mic } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { TerminalControls } from './TerminalControls';
import { Position, Size } from '../types';
import { sendCommandToTmux } from '../services/mockApi';
import { getApiUrl } from '../services/apiUrl';

const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
document.head.appendChild(style);

interface CommandPanelProps {
  paneTarget: string;
  title: string;
  token: string | null;
  panelPosition: Position;
  panelSize: Size;
  readOnly: boolean;
  onReadOnlyToggle: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onChange: (pos: Position, size: Size) => void;
  onCapturePane?: (pane_id?: string) => void;
  isCapturing?: boolean;
  canSend?: boolean;
  agentStatus?: string;
  contextUsage?: number | null;
  mouseMode?: 'on' | 'off';
  isTogglingMouse?: boolean;
  onToggleMouse?: () => void;
  onEditPane?: () => void;
  onReload?: () => void;
  onRestart?: (pane_id?: string) => void;
  isRestarting?: boolean;
  hasEditPermission?: boolean;
  hasRestartPermission?: boolean;
  hasCapturePermission?: boolean;
  networkLatency?: number | null;
  networkStatus?: 'excellent' | 'good' | 'poor' | 'offline';
  onDraggingChange?: (isDragging: boolean) => void;
  boundAgents?: string[];
  onPaneTargetChange?: (target: string) => void;
  disableDrag?: boolean;
  showVoiceControl?: boolean;
  onToggleVoiceControl?: () => void;
  mode?: string | null;
  onShowHistory?: (history: string[], onSelect: (cmd: string) => void) => void;
  onShowCorrection?: (result: [string, string]) => void;
}

export interface CommandPanelHandle {
  focusTextarea: () => void;
  setPrompt: (text: string) => void;
  correctedResult: string | null;
}

export const CommandPanel = forwardRef<CommandPanelHandle, CommandPanelProps>(({
  paneTarget,
  title,
  token,
  panelPosition,
  panelSize,
  readOnly,
  onReadOnlyToggle,
  onInteractionStart,
  onInteractionEnd,
  onChange,
  onCapturePane,
  isCapturing,
  canSend = true,
  agentStatus = 'idle',
  contextUsage,
  mouseMode = 'off',
  isTogglingMouse = false,
  onToggleMouse,
  onEditPane,
  onReload,
  onRestart,
  isRestarting = false,
  hasEditPermission = false,
  hasRestartPermission = false,
  hasCapturePermission = false,
  networkLatency = null,
  networkStatus = 'good',
  onDraggingChange,
  boundAgents = [],
  onPaneTargetChange,
  disableDrag = false,
  showVoiceControl = false,
  onToggleVoiceControl,
  mode = null,
  onShowHistory,
  onShowCorrection,
}, ref) => {
  const [selectedPane, setSelectedPane] = useState(paneTarget);
  const [promptText, setPromptText] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempDraft, setTempDraft] = useState('');
  const [paneModes, setPaneModes] = useState<Record<string, 'on' | 'off'>>(() => {
    const saved = localStorage.getItem('pane_mouse_modes');
    return saved ? JSON.parse(saved) : {};
  });

  const tempPaneId = selectedPane.replace(/[^a-zA-Z0-9]/g, '_');

  const CMD_HISTORY_KEY = `cmd_history_${tempPaneId}`;

  // 当切换 pane 时，应用该 pane 的鼠标模式
  useEffect(() => {
    const mode = paneModes[selectedPane] || mouseMode;
    if (mode !== mouseMode && onToggleMouse) {
      fetch(getApiUrl(`/api/tmux/mouse/${mode}?pane_id=${encodeURIComponent(selectedPane)}`), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
    }
  }, [selectedPane]);

  useEffect(() => {
    const handleSelectPane = (e: CustomEvent) => {
      const paneId = e.detail?.paneId;
      console.log('[CommandPanel] Received selectPane event:', paneId);
      console.log('[CommandPanel] Current boundAgents:', boundAgents);
      console.log('[CommandPanel] paneTarget:', paneTarget);
      if (paneId) {
        setSelectedPane(paneId);
        console.log('[CommandPanel] Updated selectedPane to:', paneId);
      }
    };
    window.addEventListener('selectPane', handleSelectPane as EventListener);
    return () => window.removeEventListener('selectPane', handleSelectPane as EventListener);
  }, [boundAgents, paneTarget]);

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
  const [correctedResult, setCorrectedResult] = useState<string | null>(null);
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  const [autoCorrectEnabled, setAutoCorrectEnabled] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const sendQueueRef = useRef<string[]>([]);
  const [queueLen, setQueueLen] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentPos, setCurrentPos] = useState(panelPosition);
  const [currentSize, setCurrentSize] = useState(panelSize);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setCurrentPos(panelPosition);
    setCurrentSize(panelSize);
  }, [panelPosition, panelSize]);

  useImperativeHandle(ref, () => ({
    focusTextarea: () => { setTimeout(() => textareaRef.current?.focus(), 50); },
    setPrompt: (text: string) => { setPromptText(text); setTimeout(() => textareaRef.current?.focus(), 50); },
    correctedResult: correctedResult,
  }));

  const handleSendPrompt = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cmd = promptText.trim();
    
    // If prompt is empty but correction result exists, send the corrected English
    if (!cmd && correctedResult) {
      const correctedCmd = correctedResult;
      const newHistory = [correctedCmd, ...commandHistory.filter(c => c !== correctedCmd)].slice(0, 50);
      setCommandHistory(newHistory);
      saveCommandHistory(newHistory);
      setCorrectedResult(null);
      if (onShowCorrection) {
        onShowCorrection(null as any);
      }
      setIsSending(true);
      setSendSuccess(false);
      try {
        await sendCommandToTmux(correctedCmd, selectedPane);
        setSendSuccess(true);
        setTimeout(() => setSendSuccess(false), 2000);
      } catch (e) { 
        console.error(e);
      }
      finally {
        setIsSending(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
      return;
    }
    
    if (!cmd || !paneTarget) return;
    
    // If auto-correct is enabled, correct first
    if (autoCorrectEnabled && token) {
      setPromptText('');
      saveDraft('');
      setIsCorrectingEnglish(true);
      try {
        const res = await fetch(getApiUrl('/api/correctEnglish'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cmd })
        });
        const data = await res.json();
        if (data.success && data.result && typeof data.result === "string") {
          setCorrectedResult(data.result);
          if (onShowCorrection) {
            onShowCorrection(data.result);
          }
        }
      } catch (e) { 
        console.error('Correct English error:', e); 
      } finally { 
        setIsCorrectingEnglish(false); 
      }
      return;
    }
    
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
      await sendCommandToTmux(cmd, selectedPane);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (e) { console.error(e); }
    finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [promptText, paneTarget, canSend, autoCorrectEnabled, token, correctedResult, commandHistory, selectedPane, onShowCorrection]);

  // 队列自动发送已禁用
  // useEffect(() => {
  //   if (!canSend || sendQueueRef.current.length === 0) return;
  //   const queued = sendQueueRef.current.join('\n');
  //   sendQueueRef.current = [];
  //   setQueueLen(0);
  //   setIsSending(true);
  //   sendCommandToTmux(queued, paneTarget)
  //     .then(() => { setSendSuccess(true); setTimeout(() => setSendSuccess(false), 2000); })
  //     .catch(console.error)
  //     .finally(() => { setIsSending(false); });
  // }, [canSend, paneTarget]);

  const handleCorrectEnglish = async () => {
    if (!promptText.trim() || isCorrectingEnglish || !token) return;
    setIsCorrectingEnglish(true);
    setCorrectedResult(null);
    try {
      const res = await fetch(getApiUrl('/api/correctEnglish'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: promptText })
      });
      const data = await res.json();
      console.log('Correct English result:', data);
      if (data.success && data.result && typeof data.result === "string") {
        // result is [English, Chinese]
        setCorrectedResult(data.result);
        if (onShowCorrection) {
          onShowCorrection(data.result);
        }
      }
    } catch (e) { 
      console.error('Correct English error:', e); 
    } finally { 
      setIsCorrectingEnglish(false); 
    }
  };

  const handleAcceptCorrection = () => {
    if (correctedResult) {
      setPromptText(correctedResult[0]);
      setCorrectedResult(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleSelectHistory = (cmd: string) => {
    setPromptText(cmd);
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <>
      <FloatingPanel
        title={
          boundAgents.length > 0 ? (
            <div className="flex items-center gap-1">
              <select 
                value={selectedPane} 
                onChange={(e) => setSelectedPane(e.target.value)}
                className="bg-transparent text-white text-xs border-none outline-none cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <option value={paneTarget}>{title}</option>
                {boundAgents.map(agent => (
                  <option key={agent} value={agent}>{agent.replace(':main.0', '')}</option>
                ))}
              </select>
              {selectedPane === paneTarget && (
                <span className="text-yellow-400 text-xs font-bold">Master</span>
              )}
            </div>
          ) : title
        }
        initialPosition={panelPosition}
        initialSize={panelSize}
      minSize={{ width: 360, height: 180 }}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
      onChange={(pos, size) => {
        setCurrentPos(pos);
        setCurrentSize(size);
        onChange(pos, size);
      }}
      onDraggingChange={onDraggingChange}
      disableDrag={disableDrag}
      headerActions={
        <>
          {onToggleVoiceControl && (
            <button
              onClick={onToggleVoiceControl}
              className={`p-1.5 rounded transition-colors ${showVoiceControl ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={showVoiceControl ? "Hide voice mode" : "Show voice mode"}
            >
              <Mic size={14} />
            </button>
          )}
          {mode === 'ttyd' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (onShowHistory) {
                    onShowHistory(commandHistory, handleSelectHistory);
                  } else {
                    setShowHistory(v => !v);
                  }
                }}
                className={`p-1.5 rounded transition-colors ${showHistory ? 'text-orange-400 bg-orange-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                title="Command history"
              >
                <History size={14} />
              </button>
            </>
          )}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded"
            title={networkLatency !== null ? `Latency: ${networkLatency}ms` : 'Offline'}
          >
            {networkStatus === 'excellent' && <Wifi size={12} className="text-green-400" />}
            {networkStatus === 'good' && <Wifi size={12} className="text-yellow-400" />}
            {networkStatus === 'poor' && <Wifi size={12} className="text-orange-400" />}
            {networkStatus === 'offline' && <WifiOff size={12} className="text-red-400" />}
            <span className="text-xs text-gray-500 font-mono">
              {networkLatency !== null ? `${networkLatency}ms` : 'offline'}
            </span>
          </div>
        </>
      }
    >
      <form onSubmit={handleSendPrompt} className="relative h-full flex flex-col p-2">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex-1 flex flex-col min-h-0">
            <textarea
              id="prompt-textarea"
              ref={textareaRef}
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                saveDraft(e.target.value);
                if (historyIndex === -1) setTempDraft(e.target.value);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={async (e) => {
                // Ctrl+Enter = trigger correction or send result
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  
                  // If no text but has correction result, send it
                  if (!promptText.trim() && correctedResult) {
                    const cmd = correctedResult;
                    const newHistory = [cmd, ...commandHistory.filter(c => c !== cmd)].slice(0, 50);
                    setCommandHistory(newHistory);
                    saveCommandHistory(newHistory);
                    setCorrectedResult(null);
                    if (onShowCorrection) {
                      onShowCorrection(null as any);
                    }
                    setIsSending(true);
                    setSendSuccess(false);
                    sendCommandToTmux(cmd, selectedPane)
                      .then(() => { setSendSuccess(true); setTimeout(() => setSendSuccess(false), 2000); })
                      .catch(console.error)
                      .finally(() => { setIsSending(false); setTimeout(() => textareaRef.current?.focus(), 50); });
                    return;
                  }
                  
                  // Otherwise, trigger correction
                  const cmd = promptText.trim();
                  if (cmd && token) {
                    setPromptText('');
                    saveDraft('');
                    setIsCorrectingEnglish(true);
                    fetch(getApiUrl('/api/correctEnglish'), {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: cmd })
                    })
                      .then(res => res.json())
                      .then(data => {
                        if (data.success && data.result && typeof data.result === 'string') {
                          setCorrectedResult(data.result);
                          if (onShowCorrection) {
                            onShowCorrection(data.result);
                          }
                        }
                      })
                      .catch(e => console.error('Correct English error:', e))
                      .finally(() => setIsCorrectingEnglish(false));
                  }
                  return;
                }

  
               if ((
                  e.key === 'Escape'|| e.key === 'Backspace' || e.key === 'Enter'
                ) && !promptText) {
                  e.preventDefault();

                  const key_map = {
                      "backspace": "BSpace",
                      "enter": "Enter",
                      "escape": "Escape",
                      "esc": "Escape",
                      "tab": "Tab",
                      "up": "Up",
                      "down": "Down",
                      "left": "Left",
                      "right": "Right",
                      "space": "Space",
                  }
                  await fetch(getApiUrl('/api/tmux/send-keys'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ win_id: selectedPane, keys: key_map[e.key.toLowerCase()] }) });
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !promptText) {
                  e.preventDefault();
                  await fetch(getApiUrl('/api/tmux/send-keys'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ win_id: selectedPane, keys: "C-c" }) });
                } else  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  if (e.shiftKey) {
                    // Shift+Enter = newline (default behavior)
                    return;
                  } else {
                    // Enter = send directly (no correction)
                    e.preventDefault();
                    if (!promptText.trim() && correctedResult) {
                      // Empty prompt + has result = fill prompt with result
                      setPromptText(correctedResult);
                      setCorrectedResult(null);
                      if (onShowCorrection) {
                        onShowCorrection(null as any);
                      }
                    } else {
                      const cmd = promptText.trim();
                      if (cmd) {
                        const newHistory = [cmd, ...commandHistory.filter(c => c !== cmd)].slice(0, 50);
                        setCommandHistory(newHistory);
                        saveCommandHistory(newHistory);
                        setHistoryIndex(-1);
                        setTempDraft('');
                        setPromptText('');
                        saveDraft('');
                        setIsSending(true);
                        setSendSuccess(false);
                        sendCommandToTmux(cmd, selectedPane)
                          .then(() => { setSendSuccess(true); setTimeout(() => setSendSuccess(false), 2000); })
                          .catch(console.error)
                          .finally(() => { setIsSending(false); setTimeout(() => textareaRef.current?.focus(), 50); });
                      }
                    }
                  }
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
              className="w-full h-full bg-black/50 text-white rounded-lg border border-gray-700 p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-sm shadow-inner placeholder:text-gray-600 placeholder:opacity-50"
              disabled={isSending}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <div className="text-xs flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${agentStatus === 'idle' ? 'bg-green-400' : agentStatus === 'wait_auth' ? 'bg-yellow-400 animate-pulse' : agentStatus === 'compacting' ? 'bg-blue-400 animate-pulse' : agentStatus === 'wait_startup' ? 'bg-gray-400' : 'bg-cyan-400 animate-pulse'}`} />
              <span className="text-gray-500 capitalize">{agentStatus}</span>
              {contextUsage != null && <span className={contextUsage >= 80 ? 'text-red-400' : contextUsage >= 50 ? 'text-yellow-400' : 'text-gray-600'}>· {contextUsage}%</span>}
              {queueLen > 0 && <span className="text-orange-400 animate-pulse">· Q:{queueLen}</span>}
            </div>
            <div className="flex gap-1">
              <select
                className="bg-gray-800 text-gray-300 text-xs rounded-md border border-gray-700 px-1.5 py-1.5 outline-none cursor-pointer hover:bg-gray-700"
                value=""
                onChange={async (e) => {
                  const v = e.target.value;
                  if (!v) return;
                  e.target.value = '';
                  if (['Left', 'Down', 'Up', 'Right'].includes(v)) {
                    await fetch(getApiUrl('/api/tmux/send'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') }, body: JSON.stringify({ win_id: selectedPane, keys: v }) });
                  } else {
                    await sendCommandToTmux(v, selectedPane);
                  }
                }}
              >
                <option value="">⚡</option>
                <option value="Left">← Left</option>
                <option value="Down">↓ Down</option>
                <option value="Up">↑ Up</option>
                <option value="Right">→ Right</option>
                <option value="/compact">/compact</option>
                <option value="/model">/model</option>
                <option value="/tools trust-all">Trust All</option>
                <option value="t">Trust (t)</option>
                <option value="y">Yes (y)</option>
                <option value="n">No (n)</option>
              </select>
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

          {/* Bottom action buttons */}
          <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
            <TerminalControls
              mouseMode={paneModes[selectedPane] || mouseMode}
              onToggleMouse={() => {
                const newMode = (paneModes[selectedPane] || mouseMode) === 'on' ? 'off' : 'on';
                const updated = { ...paneModes, [selectedPane]: newMode };
                setPaneModes(updated);
                localStorage.setItem('pane_mouse_modes', JSON.stringify(updated));
                onToggleMouse?.();
              }}
              isTogglingMouse={isTogglingMouse}
              onCapture={hasCapturePermission ? () => onCapturePane?.(selectedPane) : undefined}
              isCapturing={isCapturing}
            />
            <button type="button" onClick={async () => {
              const paneId = selectedPane.replace(':main.0', '');
              await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/choose-session`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
            }} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors shadow" title="会话选择">^bs</button>
            <button type="button" onClick={async () => {
              const paneId = selectedPane.replace(':main.0', '');
              await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/split?direction=v`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
            }} className="p-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-md transition-colors shadow" title="水平分屏(上下)"><SplitSquareVertical size={14} /></button>
            <button type="button" onClick={async () => {
              const paneId = selectedPane.replace(':main.0', '');
              await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/split?direction=h`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
            }} className="p-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-md transition-colors shadow" title="垂直分屏(左右)"><SplitSquareHorizontal size={14} /></button>
            <button type="button" onClick={async () => {
              const paneId = selectedPane.replace(':main.0', '');
              await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/unsplit`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
            }} className="p-1.5 bg-red-700 hover:bg-red-600 text-white rounded-md transition-colors shadow" title="关闭分屏"><XSquare size={14} /></button>
            {onReload && (
              <button
                onClick={onReload}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Reload page"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {hasRestartPermission && onRestart && (
              <button
                onClick={() => onRestart(selectedPane)}
                className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
                title="Restart tmux and ttyd"
              >
                <Power size={14} className={isRestarting ? 'animate-pulse' : ''} />
              </button>
            )}
          </div>

        </div>
      </form>
    </FloatingPanel>


    {/* 队列显示面板 */}
    {queueLen > 0 && (
      <div 
        className="fixed bg-gray-900/95 border border-orange-500/50 rounded-lg p-2 shadow-xl backdrop-blur-sm z-[50]"
        style={{ 
          left: currentPos.x,
          top: currentPos.y + currentSize.height + 8,
          width: currentSize.width
        }}
      >
        <div className="text-xs text-gray-300 mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap bg-black/30 p-2 rounded">
          {sendQueueRef.current.join('\n\n')}
        </div>
        <button
          onClick={() => {
            const merged = sendQueueRef.current.join('\n\n');
            setPromptText(merged);
            sendQueueRef.current = [];
            setQueueLen(0);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          className="w-full text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          Edit
        </button>
      </div>
    )}
  </>
  );
});
