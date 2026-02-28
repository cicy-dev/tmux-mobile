import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal,Mouse, Loader2, Clipboard, X, Keyboard, Mic, RotateCcw, Power, Pencil, Settings } from 'lucide-react';
import { TtydFrame, TtydFrameHandle } from './components/TtydFrame';
import { CommandPanel, CommandPanelHandle } from './components/CommandPanel';
import { IframeTopbar } from './components/IframeTopbar';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { MultiTerminalView } from './components/MultiTerminalView';
import { EditPaneDialog, EditPaneData } from './components/EditPaneDialog';
import { sendShortcut } from './services/mockApi';
import { getApiUrl,TTYD_BASE,API_BASE } from './services/apiUrl';
import { AppSettings, Position, Size } from './types';

// Read URL query params
const m = window.location.href.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
const BOT_NAME = decodeURIComponent(window.location.href.split("/")[4])

console.log({BOT_NAME})
// const BOT_NAME = new URLSearchParams(window.location.search).get('bot_name') || '';
const TMUX_TARGET = `${BOT_NAME}`;

const DEFAULT_SETTINGS: AppSettings = {
  panelPosition: { x: Math.max(20, window.innerWidth / 2 - 150), y: Math.max(60, window.innerHeight - 160) },
  panelSize: { width: 300, height: 140 },
  forwardEvents: true,
  lastDraft: '',
  showPrompt: true,
  showVoiceControl: false,
  voiceButtonPosition: { x: 40, y: 36 },
  commandHistory: []
};

const STORAGE_KEY = `ttyd_app_settings_v1_${BOT_NAME}`;

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const App: React.FC = () => {
  const isInIframe = new URLSearchParams(window.location.search).get('iframe') === '1';
  const [showTopbar, setShowTopbar] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [paneTitle, setPaneTitle] = useState<string>('');
  const [paneWorkspace, setPaneWorkspace] = useState<string>('');
  const [readOnly, setReadOnly] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [contextUsage, setContextUsage] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const [isInteracting, setIsInteracting] = useState(false);
  const [multiTerminalMode, setMultiTerminalMode] = useState(false);
  const [editingPane, setEditingPane] = useState<EditPaneData | null>(null);
  const [isSavingPane, setIsSavingPane] = useState(false);

  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [toast, setToast] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const voiceModeRef = useRef<'append' | 'direct'>('append');
  const voiceTranscriptRef = useRef<string>('');
  const commandPanelRef = useRef<CommandPanelHandle>(null);
  const iframeRef = useRef<TtydFrameHandle>(null);

  const iframeUrl = `${TTYD_BASE}/ttyd/${BOT_NAME}/?token=${token || ''}`;
  const [mouseMode, setMouseMode] = useState<'on' | 'off'>('off');

  const hasPermission = (perm: string) => userPerms.includes('api_full') || userPerms.includes(perm);

  const [isTogglingMouse, setIsTogglingMouse] = useState(false);

    const handleToggleMouse = async () => {
      if (isTogglingMouse) return;
      setIsTogglingMouse(true);
      const newMode = mouseMode === 'on' ? 'off' : 'on';
      try {
        const res = await fetch(getApiUrl(`/api/tmux/mouse/${newMode}`), { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setMouseMode(newMode);
      } catch {}
      setIsTogglingMouse(false);
    };
  
  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      const urlToken = new URLSearchParams(window.location.search).get('token');
      if (urlToken) {
        localStorage.setItem('token', urlToken);
        setToken(urlToken);
        setIsCheckingAuth(false);

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (!parsed.commandHistory) parsed.commandHistory = [];
            if (parsed.showVoiceControl) parsed.showPrompt = false;
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          } catch (e) { console.error('Failed to parse settings', e); }
        } else {
          setSettings(DEFAULT_SETTINGS);
        }

        try {
          const res = await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(BOT_NAME)}`, {
            headers: { 'Authorization': `Bearer ${urlToken}`, 'Accept': 'application/json' }
          });
          if (res.ok) {
            const data = await res.json();
            const title = data.title || BOT_NAME;
            setPaneTitle(title);
            setPaneWorkspace(data.workspace || '');
            document.title = title;
          } else {
            setPaneTitle(BOT_NAME);
            document.title = BOT_NAME;
          }
        } catch {
          setPaneTitle(BOT_NAME);
          document.title = BOT_NAME;
        }

        setIsLoaded(true);
        return;
      }

      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        try {
          const res = await fetch(getApiUrl('/api/tmux'), {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${savedToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '', target: TMUX_TARGET })
          });
          if (res.ok || res.status === 200) setToken(savedToken);
          else localStorage.removeItem('token');
        } catch (e) {
          console.error('Token verification failed', e);
          localStorage.removeItem('token');
        }
      }
      setIsCheckingAuth(false);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (!parsed.commandHistory) parsed.commandHistory = [];
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch (e) { console.error('Failed to parse settings', e); }
      }
      setIsLoaded(true);
    };
    init();
  }, []);

  // Verify token and get permissions
  useEffect(() => {
    if (!token) return;
    
    fetch(`${API_BASE}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
      .then(res => res.json())
      .then(data => {
        if (data.valid && data.perms) {
          setUserPerms(data.perms);
        }
      })
      .catch(err => console.error('Failed to verify token:', err));
  }, [token]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, isLoaded]);

  // --- Agent status polling ---
  useEffect(() => {
    if (!token) return;
    const poll = () => fetch(`${API_BASE}/api/tmux/pane/agent/status/${encodeURIComponent(BOT_NAME)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json()).then(d => { console.log(`[agent-status] ${d.status} | ${d.raw}`); setAgentStatus(d.status); if (d.contextUsage != null) setContextUsage(d.contextUsage); }).catch(() => {});
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [token]);

  // --- Network health ---
  useEffect(() => {
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        const response = await fetch(`${API_BASE}/api/health`, { method: 'GET', cache: 'no-cache' });
        const latency = Math.round(performance.now() - startTime);
        if (response.ok) {
          setNetworkLatency(latency);
          setNetworkStatus(latency < 100 ? 'excellent' : latency < 300 ? 'good' : 'poor');
        } else {
          setNetworkStatus('offline');
          setNetworkLatency(null);
        }
      } catch {
        setNetworkStatus('offline');
        setNetworkLatency(null);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLogin = (newToken: string) => setToken(newToken);

  // --- Voice ---
  const voiceShouldSendRef = useRef(false);

  const sendVoiceTranscript = async () => {
    const text = voiceTranscriptRef.current.trim();
    voiceTranscriptRef.current = '';
    if (!text) return;
    try {
      await fetch(getApiUrl('/api/tmux'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target: TMUX_TARGET })
      });
    } catch (e) {
      console.error('Failed to send voice command:', e);
    }
  };

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Pre-acquire mic permission when voice mode enabled
  useEffect(() => {
    if (settings.showVoiceControl) {
      navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
        mediaStreamRef.current = stream;
        stream.getTracks().forEach(t => t.enabled = false);
      }).catch(() => {});
    }
  }, [settings.showVoiceControl]);

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    voiceTranscriptRef.current = '';
    voiceShouldSendRef.current = false;
    try {
      let stream = mediaStreamRef.current;
      if (!stream || stream.getTracks().every(t => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
      }
      stream.getTracks().forEach(t => t.enabled = true);
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      setReadOnly(true);
    } catch (e) {
      console.error('Mic error:', e);
      setIsListening(false);
      setReadOnly(false);
    }
  };

  const stopVoiceRecording = (shouldSend: boolean) => {
    voiceShouldSendRef.current = shouldSend;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        setIsListening(false);
        mediaStreamRef.current?.getTracks().forEach(t => t.enabled = false);
        try {
          if (!voiceShouldSendRef.current) return;
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          if (blob.size < 100) return;
          const fd = new FormData();
          fd.append('file', blob, 'voice.webm');
          fd.append('engine', 'google');
          const r = await fetch('https://g-15003.cicy.de5.net/stt', { method: 'POST', body: fd });
          const d = await r.json();
          if (d.text) {
            voiceTranscriptRef.current = d.text;
            sendVoiceTranscript();
          }
        } catch (e) {
          console.error('STT error:', e);
        } finally {
          setReadOnly(false);
        }
      };
      recorder.stop();
    } else {
      setIsListening(false);
      setReadOnly(false);
    }
  };

  // --- Event forwarding ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!settings.showPrompt && !settings.showVoiceControl) return;
    if (!settings.forwardEvents) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      sendShortcut('escape', TMUX_TARGET);
      return;
    }
    
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['c', 'v', 'a', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      sendShortcut(`ctrl+${e.key.toLowerCase()}`);
    }
  }, [settings.forwardEvents, settings.showPrompt, settings.showVoiceControl]);



  // useEffect(() => {
  //   window.addEventListener('keydown', handleKeyDown);
  //   return () => window.removeEventListener('keydown', handleKeyDown);
  // }, [handleKeyDown]);

  const handlePanelChange = (pos: Position, size: Size) => {
    setSettings(prev => ({ ...prev, panelPosition: pos, panelSize: size }));
  };

  const handleCapturePane = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const res = await fetch(`${API_BASE}/api/tmux/capture_pane`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pane_id: BOT_NAME, start: -200 })
      });
      if (res.ok) {
        const data = await res.json();
        setCaptureOutput(data.output || '');
      }
    } catch (e) { console.error(e); }
    finally { setIsCapturing(false); }
  };

  const handleOpenEditPane = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(BOT_NAME)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setEditingPane({
          target: BOT_NAME,
          title: data.title || '',
          workspace: data.workspace || '',
          active: data.active,
          init_script: data.init_script || '',
          proxy: data.proxy || '',
          tg_enable: data.tg_enable,
          tg_token: data.tg_token || '',
          tg_chat_id: data.tg_chat_id || '',
        });
      }
    } catch (e) { console.error('Failed to load pane details:', e); }
  };

  const handleSavePane = async () => {
    if (!editingPane) return;
    setIsSavingPane(true);
    try {
      const res = await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(BOT_NAME)}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPane),
      });
      if (res.ok) {
        setPaneTitle(editingPane.title || BOT_NAME);
        setPaneWorkspace(editingPane.workspace || '');
        document.title = editingPane.title || BOT_NAME;
        setEditingPane(null);
      }
    } catch (e) { console.error('Failed to save pane:', e); }
    finally { setIsSavingPane(false); }
  };

  // --- Render ---
  if (isCheckingAuth) return (
    <div className="bg-black w-screen h-screen flex items-center justify-center">
      <Loader2 size={48} className="text-blue-500 animate-spin" />
    </div>
  );

  if (!token) return <LoginForm onLogin={handleLogin} />;

  if (!isLoaded) return <div className="bg-black w-screen h-screen" />;

  if (multiTerminalMode) return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <MultiTerminalView
        initialBotName={BOT_NAME}
        token={token}
        isInteracting={isInteracting}
        onInteractionStart={() => setIsInteracting(true)}
        onInteractionEnd={() => setIsInteracting(false)}
        onClose={() => setMultiTerminalMode(false)}
      />
    </div>
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans" >
      {/* 右上角菜单按钮 */}
      {!isInIframe && !showTopbar && (
        <button
          onClick={() => setShowTopbar(v => !v)}
          style={{position:'fixed',top:6,right:6,zIndex:111111112,width:28,height:28,borderRadius:6,background:'rgba(30,41,59,0.7)',border:'1px solid rgba(71,85,105,0.5)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#94a3b8',backdropFilter:'blur(4px)'}}
          onMouseEnter={e=>(e.currentTarget.style.background='rgba(51,65,85,0.9)')}
          onMouseLeave={e=>(e.currentTarget.style.background='rgba(30,41,59,0.7)')}
          title="Show toolbar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>
      )}
      {/* Title bar — hidden by default, click menu btn to show */}
      {!isInIframe && (
      <div
        className="bg-black transition-transform duration-200"
        style={{position:"fixed",zIndex: readOnly ? 999997 : 111111111,top:0,right:0,left:0,height:32,transform:(showTopbar)?'translateY(0)':'translateY(-100%)'}}
      >

        <IframeTopbar
        title={paneTitle || BOT_NAME}
        workspace={paneWorkspace || undefined}
        networkLatency={networkLatency}
        networkStatus={networkStatus}
        rightActions={
          <>


          <button
            type="button"
            onClick={handleToggleMouse}
            disabled={isTogglingMouse}
            className={`p-1.5 rounded transition-colors ${mouseMode === 'on' ? 'text-green-400 bg-green-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            title={mouseMode === 'on' ? "鼠标: 开 (可滚动)" : "鼠标: 关 (可复制)"}
          >
            {isTogglingMouse ? <Loader2 size={14} className="animate-spin" /> : <Mouse size={14} />}
          </button>
           {hasPermission('ttyd_read') && (
            <button
              onClick={handleCapturePane}
              disabled={isCapturing}
              className="p-1 rounded text-yellow-400 hover:text-yellow-300 hover:bg-gray-700 disabled:opacity-40"
              title="Capture pane output"
            >
              {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Clipboard size={14} />}
            </button>
            )}
            {hasPermission('agent_manage') && (
            <button
              onClick={handleOpenEditPane}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Edit pane"
            >
              <Pencil size={14} />
            </button>
            )}
            {hasPermission('prompt') && (
            <button
              onClick={() => {
                  if(settings.showVoiceControl){
                    setSettings(prev => ({ ...prev,showVoiceControl:false, showPrompt: !prev.showPrompt }))
                  }else{
                    setSettings(prev => ({ ...prev, showPrompt: !prev.showPrompt }))
                  }
              }}
              className={`p-1.5 rounded transition-colors ${settings.showPrompt ? 'text-blue-400 bg-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={settings.showPrompt ? "Hide command panel" : "Show command panel"}
            >
              <Keyboard size={14} />
            </button>
            )}
            {hasPermission('prompt') && (
            <button
              onClick={() => {
                if(settings.showPrompt){
                  setSettings(prev => ({ ...prev, showPrompt:false,showVoiceControl: !prev.showVoiceControl}))
                }else{
                  setSettings(prev => ({ ...prev, showVoiceControl: !prev.showVoiceControl}))
                }
                
              }}
              className={`p-1.5 rounded transition-colors ${settings.showVoiceControl ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={settings.showVoiceControl ? "Hide voice mode" : "Show voice mode"}
            >
              <Mic size={14} />
            </button>
            )}
            <button
              onClick={() => {location.reload()}}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Reload page"
            >
              <RotateCcw size={14} />
            </button>
           
            {hasPermission('prompt') && (
            <button
              onClick={async () => {
                if (!confirm('Restart tmux and ttyd?')) return;
                setIsRestarting(true);
                try {
                  await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(BOT_NAME)}/restart`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                  });
                  for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                      const res = await fetch(`${API_BASE}/api/ttyd/status/${encodeURIComponent(BOT_NAME)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.ready === true) { setIframeKey(k => k + 1); break; }
                      }
                    } catch { /* poll */ }
                  }
                } catch (e) { console.error(e); }
                finally { setIsRestarting(false); }
              }}
              disabled={isRestarting}
              className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              title="Restart tmux and ttyd"
            >
              <Power size={14} className={isRestarting ? 'animate-pulse' : ''} />
            </button>
            )}
            <button
              onClick={() => setShowTopbar(false)}
              className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors ml-1"
              title="Hide toolbar"
            >
              <X size={14} />
            </button>
          </>
        }
      />
      </div>
      )}




      {/* Floating command panel */}
      {settings.showPrompt && hasPermission('prompt') && (
        <CommandPanel
          ref={commandPanelRef}
          paneTarget={TMUX_TARGET}
          title={paneTitle || BOT_NAME}
          token={token}
          panelPosition={settings.panelPosition}
          panelSize={settings.panelSize}
          readOnly={readOnly}
          onReadOnlyToggle={() => setReadOnly(v => !v)}
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
          onChange={handlePanelChange}
          onCapturePane={handleCapturePane}
          isCapturing={isCapturing}
          canSend={agentStatus === 'idle' || agentStatus === 'wait_startup'}
          agentStatus={agentStatus}
          contextUsage={contextUsage}
        />
      )}

      {settings.showVoiceControl && hasPermission('prompt') && (
        <div style={{position:"fixed",zIndex:1111111,top:0,right:0,left:0,height:32,pointerEvents:"none"}}><div style={{pointerEvents:"auto",display:"inline-block"}}>
        <VoiceFloatingButton
          initialPosition={settings.voiceButtonPosition}
          onPositionChange={pos => setSettings(prev => ({ ...prev, voiceButtonPosition: pos }))}
          onRecordStart={() => startVoiceRecording('direct')}
          onRecordEnd={(shouldSend) => stopVoiceRecording(shouldSend)}
          isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
          disabled={false}
        />
        </div></div>
      )}

      {/* Edit pane dialog - full page */}
      <EditPaneDialog
        open={!!editingPane}
        pane={editingPane}
        mode="full"
        onChange={setEditingPane}
        onClose={() => setEditingPane(null)}
        onSave={handleSavePane}
      />

      {/* Capture output modal - full page */}
      {captureOutput !== null && (
        <div className="fixed z-[9999999] flex flex-col bg-black" style={{top:0,right:0,bottom:0,left:0,zIndex:999999999}}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900 flex-shrink-0" style={{height:32}}>
            <span className="text-sm font-semibold text-white">Pane Output</span>
            <div className="flex gap-2">
              <button onClick={handleCapturePane} disabled={isCapturing} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs disabled:opacity-50">
                {isCapturing ? '...' : 'Refresh'}
              </button>
              <button 
                onClick={() => {
                  const blob = new Blob([captureOutput || ''], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${BOT_NAME}_capture_${Date.now()}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs"
              >
                Export
              </button>
              <button onClick={() => setCaptureOutput(null)} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs">Close</button>
            </div>
          </div>
          <pre ref={el => { if (el) el.scrollTop = el.scrollHeight; }} className="flex-1 overflow-auto p-4 text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-black">
            {captureOutput || '(empty)'}
          </pre>
        </div>
      )}




      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 left-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-lg border-2 border-blue-400" style={{zIndex: 999999999}}>
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
