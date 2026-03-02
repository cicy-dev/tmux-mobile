import React, { useEffect ,useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, CheckCircle, Sparkles, History, X, Check, Clipboard, Mouse, SplitSquareHorizontal, SplitSquareVertical, XSquare, RotateCcw, Power, Wifi, WifiOff } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { TerminalControls } from './TerminalControls';
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
}

export interface CommandPanelHandle {
  focusTextarea: () => void;
  setPrompt: (text: string) => void;
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
      await sendCommandToTmux(cmd, selectedPane);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (e) { console.error(e); }
    finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [promptText, paneTarget, canSend]);

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
      headerActions={
        <>
          <button
            onClick={handleCorrectEnglish}
            disabled={!promptText.trim() || isCorrectingEnglish}
            className="p-1.5 rounded text-purple-400 hover:bg-gray-700 disabled:opacity-40 transition-colors"
            title="Correct English with AI"
          >
            {isCorrectingEnglish ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            className={`p-1.5 rounded transition-colors ${showHistory ? 'text-orange-400 bg-orange-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            title="Command history"
          >
            <History size={14} />
          </button>
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
                } else  if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing) {
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
{correctedText && (
  <div 
    className="fixed z-[50] animate-in fade-in zoom-in duration-200"
    style={{ 
      right: 40,
      top: 40, // 增加一点间距
      width: Math.max(currentSize.width, 320), // 确保不至于太窄
    }}
  >
    {/* 主容器：玻璃拟态效果 */}
    <div className="bg-gray-950/90 border border-purple-500/30 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col p-4 ring-1 ring-white/10">
      
      {/* 头部：简洁且有品牌感 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-purple-500/20 rounded-md">
            <Sparkles size={14} className="text-purple-400" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-300/80">
            AI Suggestion
          </span>
        </div>
        <button 
          onClick={() => setCorrectedText('')} 
          className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* 内容区：高对比度、易读 */}
      <div className="relative group mb-4">
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg blur opacity-50"></div>
        <p className="relative text-sm text-gray-100 leading-relaxed whitespace-pre-wrap bg-black/40 border border-white/5 p-3 rounded-lg max-h-48 overflow-y-auto custom-scrollbar">
          {correctedText}
        </p>
      </div>

      {/* 操作区：主次分明 */}
      <div className="flex gap-3">
        <button 
          onClick={() => setCorrectedText('')} 
          className="flex-1 px-3 py-2 text-gray-400 hover:text-white text-xs font-medium transition-colors border border-transparent hover:border-white/10 rounded-lg"
        >
          Discard
        </button>
        <button 
          onClick={handleAcceptCorrection} 
          className="flex-[2] px-3 py-2 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.3)]"
        >
          <Check size={14} strokeWidth={3} />
          Apply Correction
        </button>
      </div>
    </div>
  </div>
)}


    {/* 历史记录面板 */}
    {showHistory && commandHistory.length > 0 && (
      <div 
        className="fixed bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl backdrop-blur-sm z-[50] flex flex-col max-h-80"
        style={{ 
      right: 40,
      top: 40, // 增加一点间距
          width: currentSize.width
        }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900/50 flex-shrink-0">
          <span className="text-xs text-gray-400">History</span>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                const text = commandHistory.join('\n');
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${paneTarget}_history_${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Export
            </button>
            <button onClick={() => setCommandHistory([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white"><X size={14} /></button>
          </div>
        </div>
        <div className="divide-y divide-gray-800 overflow-y-auto">
          {commandHistory.map((cmd, idx) => (
            <div key={idx} onClick={() => { handleSelectHistory(cmd); setShowHistory(false); }}
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
      </div>
    )}

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
