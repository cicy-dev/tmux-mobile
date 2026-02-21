import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, RefreshCw, Loader2, Clipboard, Layers, Plus,X } from 'lucide-react';
import { IframeTopbar } from './components/IframeTopbar';
import { TtydFrame, TtydFrameHandle } from './components/TtydFrame';
import { CommandPanel, CommandPanelHandle } from './components/CommandPanel'; 
import { LoginForm } from './components/LoginForm';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { GroupCanvas } from './components/GroupCanvas';
import { GroupSidebar } from './components/GroupSidebar';
import { getApiUrl, getTtydUrl } from './services/apiUrl';
import { sendCommandToTmux } from './services/mockApi';
import { Position, Size, TtydGroup, TtydGroupDetail, SidebarMode, MainMode } from './types';

interface TmuxPane {
  session: string;
  window: string;
  pane: string;
  target: string;
  botName: string;
}

interface TtydConfig {
  name: string;
  title?: string;
  port: number;
  token: string;
  url?: string;
  workspace?: string;
  init_script?: string;
  proxy?: string;
  tg_token?: string;
  tg_chat_id?: string;
  tg_enable?: boolean;
  active?: boolean;
}

export const WebTerminalApp: React.FC = () => {
  // --- Auth & Pane state ---
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [tmuxPanes, setTmuxPanes] = useState<TmuxPane[]>([]);
  const [ttydConfigs, setTtydConfigs] = useState<Record<string, TtydConfig>>({});
  const [selectedPane, setSelectedPane] = useState<TmuxPane | null>(null);
  const [showPaneList, setShowPaneList] = useState(true);
  const [isLoadingPanes, setIsLoadingPanes] = useState(false);
  const iframeRefs = useRef<Record<string, TtydFrameHandle | null>>({});

  // --- Group management state ---
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('session');
  const [groups, setGroups] = useState<TtydGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<TtydGroupDetail | null>(null);
  const [mainMode, setMainMode] = useState<MainMode>('terminal');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ win_name: '', title: '', proxy: '', init_script: 'pwd' });
  const [isCreating, setIsCreating] = useState(false);

  const [editingPane, setEditingPane] = useState<{
    target: string; title: string; url?: string; workspace?: string;
    init_script?: string; proxy?: string; tg_token?: string; tg_chat_id?: string; tg_enable?: boolean; active?: boolean;
  } | null>(null);

  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);

  // --- FloatingPanel state (from App.tsx) ---
  const [isInteracting, setIsInteracting] = useState(false);
  const [panelPosition, setPanelPosition] = useState<Position>({ x: 20, y: Math.max(60, window.innerHeight - 220) });
  const [panelSize, setPanelSize] = useState<Size>({ width: 340, height: 160 });

  const [readOnly, setReadOnly] = useState(true);
  const [showVoiceControl, setShowVoiceControl] = useState(false);
  const [voiceButtonPosition, setVoiceButtonPosition] = useState<Position>({ x: 40, y: 200 });
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef<'append' | 'direct'>('append');
  const commandPanelRef = useRef<CommandPanelHandle>(null);

  // --- Auth ---
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

  useEffect(() => {
    if (token) {
      loadTmuxPanes();
      loadGroups();
    }
  }, [token]);

  const loadGroups = async () => {
    if (!token) return;
    try {
      const res = await fetch(getApiUrl('/api/groups'), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (e) { console.error(e); }
  };

  const handleSelectGroup = async (groupId: number) => {
    if (!token) return;
    setSelectedGroupId(groupId);
    try {
      const res = await fetch(getApiUrl(`/api/groups/${groupId}`), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (res.ok) {
        const group: TtydGroupDetail = await res.json();
        setSelectedGroup(group);
        setMainMode('group');
        // Preload configs for panes in the group
        for (const p of group.panes) {
          if (!ttydConfigs[p.pane_id]) getTtydConfig(p.pane_id);
        }
      }
    } catch (e) { console.error(e); }
  };

  // --- Pane loading ---
  const getTtydConfig = useCallback(async (paneTarget: string): Promise<TtydConfig | null> => {
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
        const config: TtydConfig = {
          name: paneTarget, title: data.title || paneTarget,
          port: data.port, token: data.token, url: data.url,
          workspace: data.workspace, init_script: data.init_script,
          proxy: data.proxy, tg_token: data.tg_token,
          tg_chat_id: data.tg_chat_id, tg_enable: data.tg_enable, active: data.active ?? true
        };
        setTtydConfigs(prev => ({ ...prev, [paneTarget]: config }));
        return config;
      }
    } catch (e) { console.error(e); }
    return null;
  }, [token, ttydConfigs]);

  const loadTmuxPanes = async () => {
    if (!token) return;
    setIsLoadingPanes(true);
    try {
      const res = await fetch(getApiUrl('/api/ttyd/list'), {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      const configs = data?.configs || data?.data?.configs || [];
      const panes: TmuxPane[] = configs
        .filter((c: { active?: boolean | number }) => c.active)
        .map((c: { pane_id: string; title?: string }) => {
          const [sessionName, rest] = c.pane_id.split(':');
          const [windowName, paneNum] = (rest || '').split('.');
          return {
            session: sessionName,
            window: windowName,
            pane: paneNum || '0',
            target: c.pane_id,
            botName: c.title || windowName,
          };
        });
      setTmuxPanes(panes);
      setSelectedPane(prev => {
        if (prev && panes.find(p => p.target === prev.target)) return prev;
        if (panes.length > 0) return panes[0];
        return null;
      });
        // Preload all configs for instant switching
        for (const p of panes) {
          fetch(getApiUrl(`/api/ttyd/start/${encodeURIComponent(p.target)}`), {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
          }).then(r => r.ok ? r.json() : null).then(d => {
            if (d?.port && d?.token) {
              const config: TtydConfig = {
                name: p.target, title: d.title || p.target,
                port: d.port, token: d.token, url: d.url,
                workspace: d.workspace, init_script: d.init_script,
                proxy: d.proxy, tg_token: d.tg_token,
                tg_chat_id: d.tg_chat_id, tg_enable: d.tg_enable, active: d.active ?? true
              };
              setTtydConfigs(prev => ({ ...prev, [p.target]: config }));
            }
          }).catch(() => {});
        }
    } catch (e) { console.error(e); }
    finally { setIsLoadingPanes(false); }
  };

  const handleSelectPane = (pane: TmuxPane) => {
    setSelectedPane(pane);
    setMainMode('terminal');
    if (!ttydConfigs[pane.target]) getTtydConfig(pane.target);
    // scroll to bottom so latest output is visible (no iframe reload needed)
    setTimeout(() => iframeRefs.current[pane.target]?.scrollToBottom(), 50);
  };

  // --- Window creation ---
  const handleCreateWindow = async () => {
    const { win_name, title, proxy, init_script } = createForm;
    if (!win_name.trim() || !token) return;
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = { win_name: win_name.trim(), session_name: 'worker', dev: false };
      if (title.trim()) body.title = title.trim();
      if (proxy.trim()) body.proxy = proxy.trim();
      if (init_script.trim()) body.init_script = init_script.trim();

      const res = await fetch(getApiUrl('/api/tmux/create'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateDialog(false);
        setCreateForm({ win_name: '', title: '', proxy: '', init_script: 'pwd' });
        await loadTmuxPanes();
        if (data.pane_id) {
          const newPane: TmuxPane = { target: data.pane_id, session: 'worker', window: win_name.trim(), pane: '0', botName: win_name.trim() };
          if (data.ttyd_port) {
            const config: TtydConfig = {
              name: data.pane_id, title: data.title || data.pane_id,
              port: data.ttyd_port, token: token || '', url: data.url,
              workspace: data.workspace, init_script: data.init_script,
              proxy: data.proxy
            };
            setTtydConfigs(prev => ({ ...prev, [data.pane_id]: config }));
          }
          setSelectedPane(newPane);
        }
      } else {
        const err = await res.json();
        alert('Error: ' + (err.detail || err.error || JSON.stringify(err)));
      }
    } catch (e) {
      alert('Failed: ' + String(e));
    } finally {
      setIsCreating(false);
    }
  };

  // --- Pane management ---
  const handleCapturePane = async () => {
    if (!token || !selectedPane || isCapturing) return;
    setIsCapturing(true);
    try {
      const res = await fetch(getApiUrl('/api/tmux/capture_pane'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pane_id: selectedPane.target, start: -200 })
      });
      if (res.ok) {
        const data = await res.json();
        setCaptureOutput(data.output || '');
      }
    } catch (e) { console.error(e); }
    finally { setIsCapturing(false); }
  };

  const handleEditPane = async (paneTarget: string, currentTitle: string) => {
    if (!token) return;
    try {
      const res = await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneTarget)}`), {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setEditingPane({
          target: paneTarget, title: data.title || currentTitle,
          url: data.url, workspace: data.workspace, init_script: data.init_script,
          proxy: data.proxy, tg_token: data.tg_token, tg_chat_id: data.tg_chat_id, tg_enable: data.tg_enable,
          active: data.active ?? true
        });
      }
    } catch {
      const config = ttydConfigs[paneTarget];
      setEditingPane({ target: paneTarget, title: currentTitle, url: config?.url, workspace: config?.workspace, init_script: config?.init_script, proxy: config?.proxy });
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editingPane) return;
    const { target, title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable, active } = editingPane;
    await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(target)}`), {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable })
    });
    await fetch(getApiUrl(`/api/ttyd/config/${encodeURIComponent(target)}`), {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    setTtydConfigs(prev => ({ ...prev, [target]: { ...prev[target], title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable, active } }));
    setEditingPane(null);
    loadTmuxPanes();
  };

  const handleDeletePane = async () => {
    if (!token || !editingPane) return;
    if (!confirm(`Delete pane "${editingPane.target}"?`)) return;
    const res = await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(editingPane.target)}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (res.ok) { setEditingPane(null); loadTmuxPanes(); }
  };

  // --- Voice ---
  const handleVoiceResult = useCallback(async (text: string) => {
    if (voiceModeRef.current === 'direct' && text.trim() && selectedPane) {
      try {
        await sendCommandToTmux(text.trim(), selectedPane.target);
      } catch (e) { console.error(e); }
    }
  }, [selectedPane]);

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';
      recognition.onstart = () => { setIsListening(true); };
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
        }
        if (finalTranscript) handleVoiceResult(finalTranscript.trim());
      };
      recognition.onerror = () => { setIsListening(false); };
      recognition.onend = () => { setIsListening(false); };
      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // --- Network health ---
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
        } else setNetworkStatus('offline');
      } catch { setNetworkStatus('offline'); }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [token]);

  if (isCheckingAuth) return <div className="bg-black w-screen h-screen flex items-center justify-center"><div className="text-white">Loading...</div></div>;
  if (!token) return <LoginForm onLogin={(t) => { localStorage.setItem('token', t); setToken(t); }} />;

  const selectedConfig = selectedPane ? ttydConfigs[selectedPane.target] : null;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans flex">
      {/* Icon sidebar */}
      <div className="w-16 h-full bg-gray-900 border-r border-gray-800 flex flex-col justify-between py-4 z-[40] flex-shrink-0">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
            <Terminal size={20} className="text-white" />
          </div>
          <button
            onClick={() => { setSidebarMode('session'); setShowPaneList(true); }}
            className={`p-2 rounded ${sidebarMode === 'session' && showPaneList ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
            title="Chats"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </button>
          <button
            onClick={() => { setSidebarMode('group'); setShowPaneList(true); }}
            className={`p-2 rounded ${sidebarMode === 'group' && showPaneList ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
            title="Groups"
          >
            <Layers size={20} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => { localStorage.removeItem('token'); setToken(null); }} className="p-2 rounded text-gray-400 hover:bg-gray-800 hover:text-red-400" title="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Session/Group sidebar */}
      <div className={`h-full bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 transition-all duration-300 ${showPaneList ? 'w-60' : 'w-0 overflow-hidden'}`}>
        {sidebarMode === 'group' ? (
          <GroupSidebar
            token={token}
            groups={groups}
            onGroupsChange={setGroups}
            onSelectGroup={handleSelectGroup}
            selectedGroupId={selectedGroupId}
          />
        ) : (
        <>
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="text-white font-semibold">Chats</div>
          <div className="flex items-center gap-1">
            <button
            onClick={async () => {
              const autoName = `pane_${Date.now()}`;
              setCreateForm(prev => ({ ...prev, win_name: autoName }));
              setIsCreating(true);
              try {
                const res = await fetch(getApiUrl('/api/tmux/create'), {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({ win_name: autoName, session_name: 'worker', dev: false })
                });
                if (res.ok) {
                  const data = await res.json();
                  await loadTmuxPanes();
                  if (data.pane_id) {
                    const newPane: TmuxPane = { target: data.pane_id, session: 'worker', window: autoName, pane: '0', botName: autoName };
                    if (data.ttyd_port) {
                      const config: TtydConfig = {
                        name: data.pane_id, title: data.title || data.pane_id,
                        port: data.ttyd_port, token: token || '', url: data.url,
                        workspace: data.workspace, init_script: data.init_script,
                        proxy: data.proxy
                      };
                      setTtydConfigs(prev => ({ ...prev, [data.pane_id]: config }));
                    }
                    setSelectedPane(newPane);
                  }
                }
              } finally {
                setIsCreating(false);
              }
            }}
            disabled={isCreating}
            className="p-1 rounded text-green-400 hover:bg-gray-800 disabled:opacity-50"
            title="Create pane"
          >
            {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-0.5">
            {tmuxPanes.map((pane, idx) => {
              const config = ttydConfigs[pane.target];
              const title = config?.title || pane.botName || pane.target;
              const isSelected = selectedPane?.target === pane.target;
              const tgColors = ['#E17076','#7BC862','#65AADD','#A695E7','#EE7AAE','#6EC9CB','#FAA774','#5FBEEF'];
              const l = title.toLowerCase();
              // Known services: brand color + SVG icon
              const knownAvatar: { bg: string; icon: React.ReactNode } | null = (() => {
                if (l.includes('chatgpt') || (l.includes('gpt') && !l.includes('gemini')))
                  return { bg: '#10a37f', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="white">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                    </svg>
                  )};
                if (l.includes('gemini'))
                  return { bg: '#1a73e8', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="white">
                      <path d="M12 2C12 7.5 7.5 12 2 12c5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10z"/>
                    </svg>
                  )};
                if (l.includes('claude'))
                  return { bg: '#d97757', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M4 17.5C7 17.5 12 16 15 10.5S17.5 3 17.5 3"/>
                      <path d="M20 17.5C17 17.5 12 16 9 10.5S6.5 3 6.5 3"/>
                    </svg>
                  )};
                if (l.includes('grok'))
                  return { bg: '#111111', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" stroke="white" strokeWidth="2.8" strokeLinecap="round" fill="none">
                      <line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>
                    </svg>
                  )};
                if (l.includes('kiro'))
                  return { bg: '#FF9900', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                      <line x1="6" y1="4" x2="6" y2="20"/>
                      <polyline points="6,12 18,4"/><polyline points="6,12 18,20"/>
                    </svg>
                  )};
                if (l.includes('opencode') || l.includes('open code'))
                  return { bg: '#6366f1', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                      <polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/>
                    </svg>
                  )};
                if (l.includes('cursor'))
                  return { bg: '#000000', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="white">
                      <path d="M4 4l7 16 3-7 7-3z"/>
                    </svg>
                  )};
                if (l.includes('copilot'))
                  return { bg: '#24292e', icon: (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="white">
                      <circle cx="9" cy="10" r="3"/><circle cx="15" cy="10" r="3"/>
                      <path d="M6 14c0 3 2 5 6 5s6-2 6-5"/>
                    </svg>
                  )};
                return null;
              })();
              // Fallback: Telegram color + emoji
              const fallbackBg = tgColors[idx % tgColors.length];
              const fallbackEmoji = (() => {
                const pool = ['🌟','🎯','🚀','💡','🔥','🎮','🌈','🦋','🎨','💫','🧩','🎲'];
                let h = 0;
                for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) & 0xffff;
                return pool[h % pool.length];
              })();
              const avatarBg = knownAvatar ? knownAvatar.bg : fallbackBg;
              const avatarContent = knownAvatar ? knownAvatar.icon : <span className="text-base">{fallbackEmoji}</span>;
              const isEditingTitle = editingTitle === pane.target;
              return (
                <div key={pane.target} className={`flex items-center gap-1 rounded-lg group ${isSelected ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                  <button onClick={() => handleSelectPane(pane)} className="flex-1 text-left px-2 py-2 rounded-lg flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: avatarBg }}>
                      {avatarContent}
                    </div>
                    {isEditingTitle ? (
                      <input
                        autoFocus
                        className="flex-1 bg-gray-700 text-white text-sm px-1 py-0.5 rounded outline-none"
                        defaultValue={title}
                        onBlur={async (e) => {
                          const newTitle = e.target.value.trim();
                          if (newTitle && newTitle !== title) {
                            await fetch(getApiUrl(`/api/ttyd/config/${encodeURIComponent(pane.target)}`), {
                              method: 'PATCH',
                              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ title: newTitle })
                            });
                            setTtydConfigs(prev => ({ ...prev, [pane.target]: { ...prev[pane.target], title: newTitle } }));
                          }
                          setEditingTitle(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingTitle(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className={`truncate text-sm cursor-text ${isSelected ? 'text-white' : 'text-gray-300'}`}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(pane.target); }}
                      >{title}</span>
                    )}
                  </button>
                  {!isEditingTitle && (
                  <button onClick={(e) => { e.stopPropagation(); handleEditPane(pane.target, title); }} className={`p-1.5 rounded ${isSelected ? 'text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-700 opacity-0 group-hover:opacity-100'}`} title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  )}
                </div>
              );
            })}
            {tmuxPanes.length === 0 && !isLoadingPanes && (
              <div className="text-gray-600 text-xs text-center py-4">No chats</div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 relative bg-black overflow-hidden">

        {/* Terminal section — always mounted, hidden when viewing a group */}
        <div className="absolute inset-0" style={{ display: mainMode === 'group' ? 'none' : 'block' }}>

        {/* Pane topbar */}
        {selectedPane && (
          <IframeTopbar
            title={selectedConfig?.title || selectedPane.target}
            workspace={selectedConfig?.workspace}
            proxy={selectedConfig?.proxy}
            networkLatency={networkLatency}
            networkStatus={networkStatus}
            rightActions={
              <>
                <button
                  onClick={handleCapturePane}
                  disabled={isCapturing || !selectedPane}
                  className="p-1 rounded text-yellow-400 hover:bg-gray-700 disabled:opacity-40"
                  title="Capture pane output"
                >
                  {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Clipboard size={14} />}
                </button>
                <button
                  onClick={loadTmuxPanes}
                  disabled={isLoadingPanes}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40"
                  title="Refresh sessions"
                >
                  <RefreshCw size={14} className={isLoadingPanes ? 'animate-spin' : ''} />
                </button>
                {selectedConfig?.url && (
                  <a
                    href={selectedConfig.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 text-xs border border-blue-500/30 hover:border-blue-400/50 transition-colors"
                    title="Open in popup mode (ttyd + FloatingPanel only)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Open
                  </a>
                )}
              </>
            }
          />
        )}

        {/* Iframe area (below topbar) */}
        <div className="absolute inset-0" style={{ top: selectedPane ? '32px' : 0 }}>
          {tmuxPanes.map(pane => {
            const config = ttydConfigs[pane.target];
            return (
              <div key={pane.target} style={{ display: selectedPane?.target === pane.target ? 'block' : 'none' }} className="absolute inset-0">
                {config
                  ? <TtydFrame ref={el => { iframeRefs.current[pane.target] = el; }} url={getTtydUrl(pane.target, config.token)} isInteractingWithOverlay={isInteracting || readOnly} />
                  : <div className="flex items-center justify-center h-full text-gray-500"><Loader2 className="animate-spin" size={32} /></div>
                }
              </div>
            );
          })}
          {tmuxPanes.length === 0 && !isLoadingPanes && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Terminal size={48} className="mx-auto mb-4 opacity-50" />
                <p>No sessions</p>
                <p className="text-sm mt-2">Click + to create a new window</p>
              </div>
            </div>
          )}
        </div>

        {/* Floating command panel */}
        {selectedPane && !showVoiceControl && (
          <CommandPanel
            ref={commandPanelRef}
            paneTarget={selectedPane.target}
            title={selectedConfig?.title || selectedPane?.botName || selectedPane?.target || ''}
            token={token}
            panelPosition={panelPosition}
            panelSize={panelSize}
            readOnly={readOnly}
            onReadOnlyToggle={() => setReadOnly(v => !v)}
            onVoiceModeToggle={() => setShowVoiceControl(true)}
            onInteractionStart={() => setIsInteracting(true)}
            onInteractionEnd={() => setIsInteracting(false)}
            onChange={(pos, sz) => { setPanelPosition(pos); setPanelSize(sz); }}
          />
        )}

        {/* Read-only mask — transparent blocker, click to focus command input */}
        {readOnly && selectedPane && (
          <div
            className="absolute inset-0 z-10 pointer-events-auto cursor-text"
            style={{ top: '32px' }}
            onClick={() => commandPanelRef.current?.focusTextarea()}
          />
        )}

        {/* Voice mode: return to prompt button + VoiceFloatingButton */}
        {selectedPane && showVoiceControl && (
          <>
            <button
              onClick={() => { setShowVoiceControl(false); stopVoiceRecording(); }}
              className="absolute top-4 right-4 z-40 p-3 bg-blue-600/80 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all backdrop-blur-sm"
              title="Back to prompt mode"
            >
              <Terminal size={20} />
            </button>
            <VoiceFloatingButton
              initialPosition={voiceButtonPosition}
              onPositionChange={setVoiceButtonPosition}
              onRecordStart={() => startVoiceRecording('direct')}
              onRecordEnd={() => { stopVoiceRecording(); }}
              isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
            />
          </>
        )}
        </div>{/* end terminal section */}

        {/* Group canvas section — mounted once a group is selected, hidden in terminal mode */}
        {selectedGroup && (
          <div className="absolute inset-0 flex flex-col" style={{ display: mainMode === 'group' ? 'flex' : 'none' }}>
            <GroupCanvas
              group={selectedGroup}
              token={token}
              ttydConfigs={ttydConfigs}
              tmuxPanes={tmuxPanes}
              onBack={() => { setMainMode('terminal'); }}
              onGroupUpdated={setSelectedGroup}
            />
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Window</h3>
            <input
              type="text" placeholder="Title"
              value={createForm.win_name}
              onChange={e => setCreateForm(f => ({ ...f, win_name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleCreateWindow()}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {/* <input
              type="text" placeholder="Title (optional)"
              value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleCreateWindow()}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
            /> */}
            <div className="text-xs text-gray-500 mb-4">Session: worker &nbsp;·&nbsp; Configure init script & proxy in Edit after creation</div>
            <div className="flex gap-2">
              <button onClick={() => setShowCreateDialog(false)} className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">Cancel</button>
              <button onClick={handleCreateWindow} disabled={isCreating || !createForm.win_name.trim()} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2">
                {isCreating ? <Loader2 size={16} className="animate-spin" /> : null}
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit pane dialog */}
      {editingPane && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
          <div className="bg-gray-950 border border-gray-700/60 rounded-xl w-full h-full max-w-2xl md:max-h-[95vh] overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Edit Pane</h3>
                  <p className="text-xs text-gray-500 font-mono">{editingPane.target}</p>
                </div>
              </div>
              <button onClick={() => setEditingPane(null)} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Basic Info Section */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Basic Info</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5 font-medium">Display Title</label>
                    <input
                      type="text"
                      value={editingPane.title}
                      onChange={e => setEditingPane({ ...editingPane, title: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      placeholder="Human-readable name"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300 font-medium">Auto-start on Boot</p>
                      <p className="text-xs text-gray-500 mt-0.5">Server restart 后自动恢复此 session 和 ttyd</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div className={`relative w-10 h-5 rounded-full transition-colors ${editingPane.active !== false ? 'bg-green-600' : 'bg-gray-700'}`}
                        onClick={() => setEditingPane({ ...editingPane, active: editingPane.active === false ? true : false })}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editingPane.active !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5 font-medium">Workspace Directory</label>
                    <input
                      type="text"
                      value={editingPane.workspace || ''}
                      onChange={e => setEditingPane({ ...editingPane, workspace: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      placeholder="/home/w3c_offical/workers/my_app"
                    />
                    <p className="text-xs text-gray-600 mt-1">Shell starts in this directory on pane create/restart</p>
                  </div>
                  {editingPane.url && (
                    <div>
                      <label className="block text-sm text-gray-300 mb-1.5 font-medium">Popup URL</label>
                      <div className="flex gap-2">
                        <a href={editingPane.url} target="_blank" rel="noopener noreferrer"
                          className="flex-1 text-blue-400 hover:text-blue-300 bg-gray-800/60 border border-gray-700 px-3 py-2 rounded-lg text-xs font-mono block truncate hover:bg-gray-800 transition-colors">
                          {editingPane.url}
                        </a>
                        <button
                          onClick={() => navigator.clipboard?.writeText(editingPane.url || '')}
                          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 text-xs transition-colors"
                          title="Copy URL"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-800/80 mx-6" />

              {/* Startup Section */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Startup</p>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-300 font-medium">Init Script</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">sleep:N &nbsp;·&nbsp; key:X</span>
                        <button
                          type="button"
                          onClick={() => setEditingPane({ ...editingPane, init_script:
`pwd
echo Starting...
# myapp
# sleep:2
# key:t
# sleep:1
# echo Init done` })}
                          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                        >
                          Load template
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={editingPane.init_script || ''}
                      onChange={e => setEditingPane({ ...editingPane, init_script: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm resize-none font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      rows={7}
                      placeholder="pwd"
                    />
                    <p className="text-xs text-gray-600 mt-1">Runs line-by-line on pane create/restart &nbsp;·&nbsp; <code className="text-gray-500">sleep:2</code> waits 2s &nbsp;·&nbsp; <code className="text-gray-500">key:t</code> sends key without Enter</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5 font-medium">HTTP Proxy</label>
                    <input
                      type="text"
                      value={editingPane.proxy || ''}
                      onChange={e => setEditingPane({ ...editingPane, proxy: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      placeholder="http://proxy.example.com:8080"
                    />
                    <p className="text-xs text-gray-600 mt-1">Exported as http_proxy, https_proxy, ALL_PROXY before init script</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800/80 mx-6" />

              {/* Telegram Section */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Telegram Notifications</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${editingPane.tg_enable ? 'bg-purple-600' : 'bg-gray-700'}`}
                      onClick={() => setEditingPane({ ...editingPane, tg_enable: !editingPane.tg_enable })}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editingPane.tg_enable ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm text-gray-400">{editingPane.tg_enable ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>
                <div className={`space-y-3 transition-opacity ${editingPane.tg_enable ? 'opacity-100' : 'opacity-40'}`}>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5 font-medium">Bot Token</label>
                    <input
                      type="text"
                      value={editingPane.tg_token || ''}
                      onChange={e => setEditingPane({ ...editingPane, tg_token: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-colors"
                      placeholder="123456:ABC-DEF..."
                      disabled={!editingPane.tg_enable}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1.5 font-medium">Chat ID</label>
                    <input
                      type="text"
                      value={editingPane.tg_chat_id || ''}
                      onChange={e => setEditingPane({ ...editingPane, tg_chat_id: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-colors"
                      placeholder="-100123456789"
                      disabled={!editingPane.tg_enable}
                    />
                  </div>
                </div>
              </div>

              <div className="h-4" />
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-700/60 bg-gray-900/50 flex-shrink-0">
              <button
                onClick={handleDeletePane}
                className="px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-300 text-sm transition-colors"
              >
                Delete Pane
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setEditingPane(null)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture output modal */}
      {captureOutput !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]" onClick={() => setCaptureOutput(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-[90vw] max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">Capture: {selectedPane?.target}</span>
              <div className="flex items-center gap-2">
                <button onClick={handleCapturePane} disabled={isCapturing} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs disabled:opacity-50">
                  {isCapturing ? 'Refreshing...' : 'Refresh'}
                </button>
                <button onClick={() => setCaptureOutput(null)} className="text-gray-400 hover:text-white p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <pre className="p-4 text-green-400 text-xs font-mono overflow-auto max-h-[calc(80vh-60px)] whitespace-pre-wrap break-all">
              {captureOutput || '(empty)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebTerminalApp;
