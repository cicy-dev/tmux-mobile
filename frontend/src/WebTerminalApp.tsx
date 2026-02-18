import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Columns, Rows, Maximize2, X, Send, Loader2, CheckCircle, History, Wifi, WifiOff, Menu, RefreshCw, Mic, MicOff, Sparkles, Check, Plus, Eye, EyeOff } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { LoginForm } from './components/LoginForm';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { sendCommandToTmux } from './services/mockApi';
import { getApiUrl, getTtydUrl } from './services/apiUrl';

interface TmuxPane {
  session: string;
  window: string;
  pane: string;
  target: string;
  botName: string;
}

export const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [tmuxPanes, setTmuxPanes] = useState<TmuxPane[]>([]);
  const [ttydConfigs, setTtydConfigs] = useState<Record<string, {name: string, title?: string, port: number, token: string}>>({});
  const [selectedPane, setSelectedPane] = useState<TmuxPane | null>(null);
  const [showPaneList, setShowPaneList] = useState(true);
  const [isLoadingPanes, setIsLoadingPanes] = useState(false);
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Command state - use refs for direct DOM access
  const commandTextRef = useRef('');
  const [isSending, setIsSending] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);

  // Check auth on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      fetch(getApiUrl('/api/auth/verify'), {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      }).then(res => {
        if (res.ok) setToken(savedToken);
        else localStorage.removeItem('token');
      }).catch(() => {}).finally(() => setIsCheckingAuth(false));
    } else {
      setIsCheckingAuth(false);
    }
  }, []);

  // Load panes when token is available
  useEffect(() => {
    if (token) {
      loadTmuxPanes();
    }
  }, [token]);

  const loadTmuxPanes = async () => {
    if (!token) return;
    setIsLoadingPanes(true);
    try {
      const res = await fetch(getApiUrl('/api/tmux/tree'), { 
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } 
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.tree) {
        const panes: TmuxPane[] = [];
        const seenTargets = new Set<string>();
        for (const session of data.tree) {
          for (const win of session.windows || []) {
            const pane = win.pane;
            if (seenTargets.has(pane)) continue;
            seenTargets.add(pane);
            const parts = pane.split(':');
            if (parts.length === 2) {
              const [sessionName, rest] = parts;
              const [winName, paneNum] = rest.split('.');
              panes.push({ session: sessionName, window: String(win.index), pane: paneNum || '0', target: pane, botName: win.name });
            }
          }
        }
        setTmuxPanes([]);
        setTtydConfigs({});
        setTmuxPanes(panes);
        if (panes.length > 0) {
          if (!selectedPane || !panes.find(p => p.target === selectedPane.target)) {
            setSelectedPane(panes[0]);
            getTtydConfig(panes[0].target);
          }
        }
      }
    } catch (e) { console.error(e); } 
    finally { setIsLoadingPanes(false); }
  };

  const getTtydConfig = async (paneTarget: string) => {
    if (!token) return null;
    if (ttydConfigs[paneTarget]) return ttydConfigs[paneTarget];
    try {
      const res = await fetch(getApiUrl(`/api/ttyd/start/${encodeURIComponent(paneTarget)}`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.port && data?.token) {
        const config = { name: paneTarget, title: data.title || paneTarget, port: data.port, token: data.token };
        setTtydConfigs(prev => ({ ...prev, [paneTarget]: config }));
        return config;
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleUpdateTitle = async (paneTarget: string, currentTitle: string) => {
    if (!token) return;
    const newTitle = prompt('Enter new title:', currentTitle);
    if (newTitle) {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneTarget)}/title`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      setTtydConfigs(prev => ({ ...prev, [paneTarget]: { ...prev[paneTarget], title: newTitle } }));
      loadTmuxPanes();
    }
  };

  const handleSendCommand = async () => {
    const input = document.querySelector('#command-input') as HTMLInputElement;
    const cmd = input?.value?.trim();
    if (!cmd || !token) return;
    
    setIsSending(true);
    input.value = '';
    setCommandHistory(prev => [...prev, cmd]);
    
    try {
      await sendCommandToTmux(cmd, selectedPane?.target || '');
    } catch (e) { console.error(e); }
    finally { setIsSending(false); }
  };

  const handleCreateWindow = async () => {
    const input = document.querySelector('#create-dialog-input') as HTMLInputElement;
    const titleInput = document.querySelector('#create-dialog-title') as HTMLInputElement;
    const winName = input?.value?.trim();
    const title = titleInput?.value?.trim();
    if (!winName || !token) return;

    setShowCreateDialog(false);
    input.value = '';
    if (titleInput) titleInput.value = '';
    
    try {
      const res = await fetch(getApiUrl('/api/tmux/create'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ win_name: winName, session_name: 'worker', dev: false, title: title || undefined })
      });
      if (res.ok) {
        await loadTmuxPanes();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.detail || err.error || JSON.stringify(err)));
      }
    } catch (e) { 
      alert('Failed: ' + String(e)); 
    }
  };

  // Health check
  useEffect(() => {
    if (!token) return;
    const checkHealth = async () => {
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/health'), { cache: 'no-cache' });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          setNetworkLatency(latency);
          setNetworkStatus(latency < 100 ? 'excellent' : latency < 300 ? 'good' : 'poor');
        } else { setNetworkStatus('offline'); }
      } catch { setNetworkStatus('offline'); }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [token]);

  if (isCheckingAuth) return <div className="bg-black w-screen h-screen flex items-center justify-center"><div className="text-white">Loading...</div></div>;
  if (!token) return <LoginForm onLogin={handleLogin} />;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans flex">
      {/* Icon sidebar - 64px */}
      <div className="w-16 h-full bg-gray-900 border-r border-gray-800 flex flex-col justify-between py-4 z-30">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
            <Terminal size={20} className="text-white" />
          </div>
          <button onClick={() => setShowPaneList(!showPaneList)} className={`p-2 rounded ${showPaneList ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`} title="Sessions">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          </button>
          <button onClick={() => setShowCreateDialog(true)} className="p-2 rounded text-green-400 hover:bg-gray-800" title="Create">
            <Plus size={20} />
          </button>
          <button onClick={loadTmuxPanes} className="p-2 rounded text-gray-400 hover:bg-gray-800" title="Refresh">
            <RefreshCw size={20} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => { localStorage.removeItem('token'); setToken(null); }} className="p-2 rounded text-gray-400 hover:bg-gray-800 hover:text-red-400" title="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Session/Pane list sidebar - 240px */}
      <div className={`h-full bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 transition-all duration-300 ${showPaneList ? 'w-60' : 'w-0 overflow-hidden'}`}>
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="text-white font-semibold">Sessions</div>
          <div className="flex items-center gap-2 text-sm">
            {networkStatus === 'offline' ? <WifiOff size={14} className="text-red-400" /> : <Wifi size={14} className={networkStatus === 'excellent' ? 'text-green-400' : networkStatus === 'good' ? 'text-yellow-400' : 'text-red-400'} />}
            <span className="text-gray-400 font-mono text-xs">{networkLatency !== null ? `${networkLatency}ms` : '...'}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2 px-2">Panes ({tmuxPanes.length})</div>
          <div className="space-y-1">
            {tmuxPanes.map(pane => {
              const config = ttydConfigs[pane.target];
              const title = config?.title || pane.target;
              return (
                <div key={pane.target} className={`flex items-center gap-1 rounded ${selectedPane?.target === pane.target ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                  <button onClick={() => { setSelectedPane(pane); getTtydConfig(pane.target); }} className={`flex-1 text-left px-3 py-2 rounded text-sm truncate ${selectedPane?.target === pane.target ? 'text-white' : 'text-gray-300'}`}>
                    {title}
                  </button>
                  <button onClick={() => handleUpdateTitle(pane.target, title)} className={`p-2 rounded ${selectedPane?.target === pane.target ? 'text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-700'}`} title="Edit title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main area - ttyd iframe */}
      <div className="absolute top-0 right-0 bg-black" style={{ left: showPaneList ? '304px' : '64px', bottom: '60px' }}>
        {tmuxPanes.map(pane => {
          const config = ttydConfigs[pane.target];
          return (
            <div key={pane.target} style={{ display: selectedPane?.target === pane.target ? 'block' : 'none' }} className="absolute inset-0">
              {config ? <TtydFrame paneId={config.name} port={config.port} token={config.token} token2={token || ''} isInteractingWithOverlay={false} /> : <div className="flex items-center justify-center h-full text-gray-500"><Loader2 className="animate-spin" size={32} /></div>}
            </div>
          );
        })}
        {tmuxPanes.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Terminal size={48} className="mx-auto mb-4 opacity-50" />
              <p>No sessions</p>
              <p className="text-sm mt-2">Click + to create a new window</p>
            </div>
          </div>
        )}
      </div>

      {/* Command input */}
      <div className="absolute bottom-4 z-10" style={{ left: showPaneList ? '324px' : '84px', right: '16px' }}>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2">
          <input id="command-input" type="text" placeholder="Send command..." className="flex-1 bg-transparent text-white outline-none" onKeyDown={e => e.key === 'Enter' && handleSendCommand()} />
          <button onClick={handleSendCommand} disabled={isSending} className="p-1 text-blue-400 hover:text-blue-300"><Send size={18} /></button>
        </div>
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Window</h3>
            <input id="create-dialog-input" type="text" placeholder="Window name (e.g. my_terminal)" className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:border-blue-500" autoFocus />
            <input id="create-dialog-title" type="text" placeholder="Title (optional)" className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-blue-500" />
            <div className="text-xs text-gray-400 mb-4">Session: worker</div>
            <div className="flex gap-2">
              <button onClick={() => setShowCreateDialog(false)} className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">Cancel</button>
              <button id="create-dialog-confirm" onClick={handleCreateWindow} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebTerminalApp;
