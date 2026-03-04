import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Terminal,Mouse, Loader2, Clipboard, X, Keyboard, Mic, RotateCcw, Power, Pencil, Settings } from 'lucide-react';
import { TtydFrame, TtydFrameHandle } from './components/TtydFrame';
import { CommandPanel, CommandPanelHandle } from './components/CommandPanel';
import { IframeTopbar } from './components/IframeTopbar';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { MultiTerminalView } from './components/MultiTerminalView';
import { EditPaneDialog, EditPaneData } from './components/EditPaneDialog';
import { SettingsView } from './components/SettingsView';
import { AgentsView } from './components/AgentsView';
import { AgentsListView } from './components/AgentsListView';
import { CaptureDialog } from './components/CaptureDialog';
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
  panelPosition: { x: Math.max(20, window.innerWidth - 380), y: Math.max(60, window.innerHeight - 240) },
  panelSize: { width: 360, height: 220 },
  forwardEvents: true,
  lastDraft: '',
  showPrompt: true,
  showVoiceControl: false,
  voiceButtonPosition: { x: 40, y: 36 },
  commandHistory: [],
  agent_duty: ''
};

const STORAGE_KEY = `ttyd_app_settings_v1_${BOT_NAME}`;

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const App: React.FC = () => {
  const MODE = new URLSearchParams(window.location.search).get('mode') || null;
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [paneTitle, setPaneTitle] = useState<string>('');
  const [paneWorkspace, setPaneWorkspace] = useState<string>('');
  const [paneAgentDuty, setPaneAgentDuty] = useState<string>('');
  const [paneAgentType, setPaneAgentType] = useState<string>('');
  const [paneInitScript, setPaneInitScript] = useState<string>('');
  const [paneConfig, setPaneConfig] = useState<string>('');
  const [paneTgToken, setPaneTgToken] = useState<string>('');
  const [paneTtydPreview, setPaneTtydPreview] = useState<string>('');
  const [paneTgChatId, setPaneTgChatId] = useState<string>('');
  const [paneTgEnable, setPaneTgEnable] = useState<boolean>(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [contextUsage, setContextUsage] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [ttydWidth, setTtydWidth] = useState(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_ttydWidth`);
    return saved ? parseInt(saved) : 640;
  });
  const [ttydPreviewHeight, setTtydPreviewHeight] = useState(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_ttydPreviewHeight`);
    return saved ? parseInt(saved) : 300;
  });
  const [commandPanelHeight, setCommandPanelHeight] = useState(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_commandPanelHeight`);
    return saved ? parseInt(saved) : 220;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isCodeServerLoading, setIsCodeServerLoading] = useState(true);
  const [isTtydLoading, setIsTtydLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Code' | 'Services' | 'Docs' | 'Preview' | 'Agents' | 'Settings'>(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_activeTab`);
    return (saved as any) || 'Settings';
  });
  const [servicesTab, setServicesTab] = useState<'Electron' | 'Mysql' | 'Monitor' | 'VNC'>(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_servicesTab`);
    return (saved as any) || 'Electron';
  });
  const [docsTab, setDocsTab] = useState<'Fast-api' | 'Electron'>(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_docsTab`);
    return (saved as any) || 'Fast-api';
  });
  const [previewTab, setPreviewTab] = useState<number>(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_previewTab`);
    return saved ? parseInt(saved) : 0;
  });
  const [boundAgents, setBoundAgents] = useState<string[]>([]);
  const [showHistoryOverlay, setShowHistoryOverlay] = useState(false);
  const [historyData, setHistoryData] = useState<{history: string[], onSelect: (cmd: string) => void} | null>(null);
  const [showCorrectionResult, setShowCorrectionResult] = useState(false);
  const [correctionData, setCorrectionData] = useState<[string, string] | null>(null);
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  const [agentCaptureOpen, setAgentCaptureOpen] = useState(false);
  const [showTtydInCode, setShowTtydInCode] = useState(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_showTtydInCode`);
    return saved === 'true';
  });

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
  const mainIframeRef = useRef<HTMLIFrameElement>(null);

  const iframeUrl = `${TTYD_BASE}/ttyd/${BOT_NAME}/?token=${token || ''}`;
  const [mouseMode, setMouseMode] = useState<'on' | 'off'>('off');

  const hasPermission = (perm: string) => userPerms.includes('api_full') || userPerms.includes(perm);

  // Close correction panel with Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCorrectionResult) {
        setShowCorrectionResult(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCorrectionResult]);

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
            if (parsed.showVoiceControl && MODE !== 'ttyd') parsed.showPrompt = false;
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          } catch (e) { console.error('Failed to parse settings', e); }
        } else {
          setSettings(DEFAULT_SETTINGS);
        }

        try {
          const paneIdToLoad = BOT_NAME.includes(':') ? BOT_NAME : `${BOT_NAME}:main.0`;
          const res = await fetch(`${API_BASE}/api/ttyd/config/${encodeURIComponent(paneIdToLoad)}`, {
            headers: { 'Accept': 'application/json' }
          });
          if (res.ok) {
            const data = await res.json();
            const title = data.title || BOT_NAME;
            setPaneTitle(title);
            setPaneWorkspace(data.workspace || '');
            setPaneAgentDuty(data.agent_duty || '');
            setPaneAgentType(data.agent_type || '');
            setPaneInitScript(data.init_script || '');
            setPaneTgToken(data.tg_token || '');
            setPaneTgChatId(data.tg_chat_id || '');
            setPaneTtydPreview(data.ttyd_preview || '');
            setPaneTgEnable(data.tg_enable || false);
            
            // Parse config JSON
            let config: any = {};
            try {
              config = data.config ? JSON.parse(data.config) : {};
            } catch (e) {
              console.error('Failed to parse config:', e);
            }
            setPaneConfig(data.config || '{}');
            setPreviewUrls(config.previewUrls || []);
            
            document.title = title;
            
            // Fetch bound agents
            try {
              const agentsRes = await fetch(`${API_BASE}/api/agents/pane/${encodeURIComponent(BOT_NAME)}`, {
                headers: { 'Authorization': `Bearer ${urlToken}` }
              });
              if (agentsRes.ok) {
                const agents = await agentsRes.json();
                setBoundAgents(agents.map((a: any) => a.name));
              }
            } catch (e) {
              console.error('Failed to fetch agents', e);
            }
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

  // Reload config when switching to Preview tab
  useEffect(() => {
    if (activeTab === 'Preview' && token) {
      fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(BOT_NAME)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.config) {
            try {
              const config = JSON.parse(data.config);
              setPreviewUrls(config.previewUrls || []);
            } catch (e) {
              console.error('Failed to parse config:', e);
            }
          }
        })
        .catch(err => console.error('Failed to reload config:', err));
    }
  }, [activeTab, token]);

  // --- Agent status polling (also updates network status) ---
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      const startTime = performance.now();
      try {
        const { data } = await axios.get(
          `${API_BASE}/api/tmux/status?id=${encodeURIComponent(BOT_NAME)}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 1500
          }
        );
        const latency = Math.round(performance.now() - startTime);
        console.debug(`[agent-status] ${data.status} | ${data.raw}`, data);
        setAgentStatus(data.status);
        if (data.contextUsage != null) setContextUsage(data.contextUsage);
        setNetworkLatency(latency);
        setNetworkStatus(latency < 100 ? 'excellent' : latency < 300 ? 'good' : 'poor');
      } catch {
        setNetworkStatus('offline');
        setNetworkLatency(null);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [token]);

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

  
  const handlePanelChange = (pos: Position, size: Size) => {
    setSettings(prev => ({ ...prev, panelPosition: pos, panelSize: size }));
  };

  const handleCapturePane = async (pane_id?: string, lines?: number) => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const res = await fetch(`${API_BASE}/api/tmux/capture_pane`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ pane_id: pane_id || TMUX_TARGET, lines: lines || 100 })
      });
      if (res.ok) {
        const data = await res.json();
        setCaptureOutput(data.output || '');
      }
    } catch (e) { console.error(e); }
    finally { setIsCapturing(false); }
  };

  const handleRestart = async (pane_id?: string) => {
    const targetPane = pane_id || BOT_NAME;
    if (!confirm(`Restart tmux and ttyd for ${targetPane}?`)) return;
    setIsRestarting(true);
    try {
      await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(targetPane)}/restart`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch(`${API_BASE}/api/ttyd/status/${encodeURIComponent(targetPane)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'running') {
              setTimeout(() => location.reload(), 500);
              return;
            }
          }
        } catch {}
      }
      alert('Restart timeout');
    } catch (e) {
      console.error(e);
      alert('Restart failed');
    } finally {
      setIsRestarting(false);
    }
  };

  const [tempPaneData, setTempPaneData] = useState<EditPaneData | null>(null);

  const handleSavePane = async () => {
    const dataToSave = {
      target: TMUX_TARGET, 
      title: tempPaneData?.title ?? paneTitle, 
      workspace: tempPaneData?.workspace ?? paneWorkspace, 
      agent_duty: tempPaneData?.agent_duty ?? paneAgentDuty, 
      agent_type: tempPaneData?.agent_type ?? paneAgentType, 
      init_script: tempPaneData?.init_script ?? paneInitScript,
      config: tempPaneData?.config ?? paneConfig,
      tg_token: tempPaneData?.tg_token ?? paneTgToken,
      tg_chat_id: tempPaneData?.tg_chat_id ?? paneTgChatId,
      tg_enable: tempPaneData?.tg_enable ?? paneTgEnable,
      ttyd_preview: tempPaneData?.ttyd_preview ?? paneTtydPreview
    };
    
    // Validate and set default config
    let configToSave = dataToSave.config?.trim() || '';
    if (!configToSave) {
      configToSave = '{"previewUrls": []}';
    } else {
      try {
        JSON.parse(configToSave);
      } catch (e) {
        alert('Invalid JSON in Config field. Please fix the syntax.');
        return;
      }
    }
    dataToSave.config = configToSave;
    
    setIsSavingPane(true);
    try {
      // Add :main.0 suffix if not present
      const paneIdToSave = BOT_NAME.includes(':') ? BOT_NAME : `${BOT_NAME}:main.0`;
      const res = await fetch(`${API_BASE}/api/ttyd/config/${encodeURIComponent(paneIdToSave)}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      if (res.ok) {
        setPaneTitle(dataToSave.title || BOT_NAME);
        setPaneWorkspace(dataToSave.workspace || '');
        setPaneAgentDuty(dataToSave.agent_duty || '');
        setPaneAgentType(dataToSave.agent_type || '');
        setPaneInitScript(dataToSave.init_script || '');
        setPaneConfig(configToSave);
        setPaneTgToken(dataToSave.tg_token || '');
        setPaneTgChatId(dataToSave.tg_chat_id || '');
        setPaneTgEnable(dataToSave.tg_enable || false);
        setPaneTtydPreview(dataToSave.ttyd_preview || '');
        
        // Update previewUrls from saved config
        try {
          const config = JSON.parse(configToSave);
          setPreviewUrls(config.previewUrls || []);
        } catch (e) {
          console.error('Failed to parse config:', e);
        }
        
        document.title = dataToSave.title || BOT_NAME;
        setTempPaneData(null);
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


  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans" >
     
      
      {/* Title bar — hidden by default, click menu btn to show */}
      {MODE !== 'ttyd' && !captureOutput && !agentCaptureOpen && !editingPane && (
      <div
        id="fixTopbar"
        className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 transition-transform duration-200 rounded-lg"
        style={{position:"fixed",zIndex:99999998,top:8,right:8,width:90,height:32}}
      >
        <div className="h-full flex items-center justify-center px-3 gap-1">
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
        </div>
      </div>
      )}




      {/* Floating command panel */}
      {MODE !== 'ttyd' && settings.showPrompt && hasPermission('prompt') && (
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
          mouseMode={mouseMode}
          onDraggingChange={setIsDragging}
          isTogglingMouse={isTogglingMouse}
          onToggleMouse={handleToggleMouse}
          onReload={() => {
            if (mainIframeRef.current) {
              mainIframeRef.current.src = mainIframeRef.current.src;
            }
          }}
          boundAgents={boundAgents}
          onRestart={handleRestart}
          isRestarting={isRestarting}
          hasEditPermission={hasPermission('agent_manage')}
          hasRestartPermission={hasPermission('prompt')}
          hasCapturePermission={hasPermission('ttyd_read')}
          networkLatency={networkLatency}
          networkStatus={networkStatus}
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
      <CaptureDialog 
        output={captureOutput}
        onClose={() => setCaptureOutput(null)}
        onRefresh={(paneId, lines) => handleCapturePane(paneId, lines)}
        isRefreshing={isCapturing}
        paneId={BOT_NAME}
      />




      {/* ReadOnly mask */}
      {MODE !== 'ttyd' && settings.showVoiceControl && (
        <div 
          className="fixed"
          style={{inset: '32px 0px 0px', zIndex: 999998, cursor: 'not-allowed'}}
          onClick={() => {
            setToast('Click unlock button to edit');
            setTimeout(() => setToast(null), 1000);
            commandPanelRef.current?.focusTextarea();
          }}
        />
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
