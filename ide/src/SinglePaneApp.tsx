import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Loader2, Keyboard, Mic, SplitSquareHorizontal, SplitSquareVertical, XSquare, RotateCcw, Power, Home, RefreshCw, MoreVertical, History, GripHorizontal, Plus, Folder } from 'lucide-react';
import { IframeTopbar } from './components/IframeTopbar';
import { TtydFrameHandle } from './components/TtydFrame';
import { CommandPanel, CommandPanelHandle } from './components/CommandPanel';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { EditPaneDialog, EditPaneData } from './components/EditPaneDialog';
import { SettingsView } from './components/SettingsView';
import { AgentControls } from './components/AgentControls';
import { AgentsListView } from './components/AgentsListView';
import { CaptureDialog } from './components/CaptureDialog';
import { getApiUrl,TTYD_BASE,API_BASE } from './services/apiUrl';
import { AppSettings, Position, Size } from './types';
import { WebFrame } from './components/WebFrame';

// Read URL query params
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
  const MODE = "ttyd";

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
  const [isAgentsMinimized, setIsAgentsMinimized] = useState(false);
  const [isAgentsMaximized, setIsAgentsMaximized] = useState(false);
  const [commandPanelHeight, setCommandPanelHeight] = useState(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_commandPanelHeight`);
    return saved ? parseInt(saved) : 220;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'Code' | 'Services' | 'Docs' | 'Preview' | 'Agents' | 'Settings'>(() => {
    const saved = localStorage.getItem(`${BOT_NAME}_activeTab`);
    return (saved as any) || 'Code';
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
    return saved !== 'false';
  });
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDesktopDialog, setShowDesktopDialog] = useState(false);

  const [isInteracting, setIsInteracting] = useState(false);
  const [multiTerminalMode, setMultiTerminalMode] = useState(false);
  const [editingPane, setEditingPane] = useState<EditPaneData | null>(null);
  const [isSavingPane, setIsSavingPane] = useState(false);
  const [showFavorDirs, setShowFavorDirs] = useState(false);
  const [favorDirs, setFavorDirs] = useState<string[]>([]);

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

  const navigateToPath = async (path: string, forceRefresh = false) => {
    console.log('navigateToPath called:', path, 'forceRefresh:', forceRefresh);
    if (!path) return;
    
    const frame = document.querySelector('.code-server-iframe') as HTMLIFrameElement | HTMLElement;
    if (!frame) {
      console.log('Frame not found');
      return;
    }
    
    // Check if already on this path
    if (!forceRefresh) {
      try {
        const currentSrc = (frame as any).src || frame.getAttribute('src');
        console.log('Current src:', currentSrc);
        if (currentSrc) {
          const currentUrl = new URL(currentSrc);
          const currentFolder = currentUrl.searchParams.get('folder');
          console.log('Current folder:', currentFolder, 'Target path:', path);
          if (currentFolder === path) {
            console.log('Already on this path, returning');
            return;
          }
        }
      } catch (e) {
        console.error('Error checking current path:', e);
      }
    }
    
    // Path is different, check if exists
    try {
      const res = await fetch(`${API_BASE}/api/utils/file/exists?path=${encodeURIComponent(path)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('Path exists check:', data);
      if (!data.exists) {
        setToast(`Path not found: ${path}`);
        setTimeout(() => setToast(null), 3000);
        return;
      }
      // Reload webframe (iframe or webview)
      const newUrl = `https://code.cicy.de5.net/?folder=${encodeURIComponent(path)}`;
      console.log('Setting new URL:', newUrl);
      
      // Stop current loading for webview
      if ((frame as any).stop) {
        (frame as any).stop();
      }
      
      if ((frame as any).src !== undefined) {
        (frame as any).src = newUrl;
      } else {
        frame.setAttribute('src', newUrl);
      }
      setPaneWorkspace(path);
    } catch (err) {
      console.error('Failed to check path:', err);
      setToast('Failed to check path');
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Close correction panel and history with Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDesktopDialog) {
          setShowDesktopDialog(false);
        } else if (showCorrectionResult) {
          setShowCorrectionResult(false);
        } else if (showHistoryOverlay) {
          setShowHistoryOverlay(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCorrectionResult, showHistoryOverlay, showDesktopDialog]);

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

  // Fetch favor dirs
  useEffect(() => {
    if (token) {
      const fetchFavorDirs = () => {
        console.log('Fetching favor dirs...');
        fetch(`${API_BASE}/api/settings/global`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => {
            console.log('Favor dirs data:', data);
            if (data.favor?.dir) {
              setFavorDirs(data.favor.dir);
            }
          })
          .catch(err => console.error('Failed to fetch favor dirs:', err));
      };
      
      fetchFavorDirs();
      
      // Listen for settings update
      const handleSettingsUpdate = () => {
        console.log('globalSettingsUpdated event received');
        fetchFavorDirs();
      };
      window.addEventListener('globalSettingsUpdated', handleSettingsUpdate);
      return () => window.removeEventListener('globalSettingsUpdated', handleSettingsUpdate);
    }
  }, [token]);

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
      const paneIdClean = targetPane.replace(':main.0', '');
      await fetch(`${API_BASE}/api/tmux/panes/${encodeURIComponent(paneIdClean)}/restart`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch(`${API_BASE}/api/ttyd/status/${encodeURIComponent(paneIdClean)}`, {
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
      // Even on timeout, reload — the service likely restarted
      setTimeout(() => location.reload(), 500);
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
    <div className="bg-vsc-bg w-screen h-screen flex items-center justify-center">
      <Loader2 size={48} className="text-vsc-accent animate-spin" />
    </div>
  );

  if (!token) return <LoginForm onLogin={handleLogin} />;

  if (!isLoaded) return <div className="bg-vsc-bg w-screen h-screen" />;


  return (
    <div className="relative w-screen h-screen overflow-hidden font-sans" >
      {
        MODE === "ttyd" && <div id="mainIfame" className="fixed inset-0"> 

        <div id="mainCodeServer" className="absolute inset-0 bg-vsc-bg" style={{width: `calc(100vw - ${ttydWidth}px - 4px)`}}>
          <div className="absolute top-0 left-0 right-0 h-10 bg-vsc-bg-titlebar border-b border-vsc-border flex items-center gap-1 px-2 z-10">
            {([ 'Code', 'Preview', 'Settings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  localStorage.setItem(`${BOT_NAME}_activeTab`, tab);
                }}
                className={`px-4 py-1 rounded text-sm ${activeTab === tab ? 'bg-vsc-bg text-vsc-text' : 'text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-hover'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          {isInteracting && <div className="absolute inset-0 z-20"></div>}
            {paneWorkspace && (
              <div className="absolute inset-0 flex flex-col" style={{marginTop: '40px', display: activeTab === 'Code' ? 'flex' : 'none'}}>
                {/* 区域 A: Code Server - 蓝色背景 */}
                <div className="w-full flex-1 overflow-hidden flex flex-col" style={{display: isAgentsMaximized ? 'none' : 'flex', backgroundColor: 'rgba(0, 100, 255, 0.1)'}}>
                  {/* Home + Path Input */}
                  <div className="h-8 bg-vsc-bg-titlebar border-b border-vsc-border flex items-center px-2 gap-2 flex-shrink-0">
                    <button 
                      onClick={() => navigateToPath(paneWorkspace, true)}
                      className="p-1 text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-hover rounded"
                      title="Home"
                    >
                      <Home size={16} />
                    </button>
                    <div className="relative">
                      <button 
                        onClick={() => setShowFavorDirs(!showFavorDirs)}
                        className="p-1 text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-hover rounded"
                        title="Favorite Directories"
                      >
                        <Folder size={16} />
                      </button>
                      {showFavorDirs && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowFavorDirs(false)}></div>
                          <div className="absolute top-full left-0 mt-1 bg-vsc-bg-secondary border border-vsc-border rounded shadow-lg z-20 min-w-[400px] max-w-[600px]">
                            {favorDirs.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-vsc-text-secondary">No favorite directories</div>
                            ) : (
                              favorDirs.map((dir, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    navigateToPath(dir);
                                    setShowFavorDirs(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-vsc-text hover:bg-vsc-bg-hover"
                                >
                                  {dir}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <input 
                      className="flex-1 bg-vsc-bg text-vsc-text px-2 py-1 text-sm border border-vsc-border rounded" 
                      value={paneWorkspace} 
                      onChange={(e) => setPaneWorkspace(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          navigateToPath(paneWorkspace);
                        }
                      }}
                    />
                  </div>
                  <WebFrame codeServer loading="lazy" src={`https://code.cicy.de5.net/?folder=${paneWorkspace}`} className="code-server-iframe w-full flex-1" />
                </div>
                {showTtydInCode && (
                  <>
                    <div 
                      className="w-full h-1 bg-vsc-border hover:bg-vsc-accent cursor-row-resize flex-shrink-0"
                      style={{display: (isAgentsMinimized || isAgentsMaximized) ? 'none' : 'block'}}
                      onMouseDown={(e) => {
                        if (isAgentsMinimized || isAgentsMaximized) return;
                        e.preventDefault();
                        setIsDragging(true);
                        const startY = e.clientY;
                        const startHeight = ttydPreviewHeight;
                        const onMouseMove = (e: MouseEvent) => {
                          const newHeight = Math.max(100, Math.min(window.innerHeight - 200, startHeight + (startY - e.clientY)));
                          setTtydPreviewHeight(newHeight);
                        };
                        const onMouseUp = () => {
                          setIsDragging(false);
                          localStorage.setItem(`${BOT_NAME}_ttydPreviewHeight`, ttydPreviewHeight.toString());
                          document.removeEventListener('mousemove', onMouseMove);
                          document.removeEventListener('mouseup', onMouseUp);
                        };
                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                      }}
                    ></div>
                    {isDragging && <div className="absolute inset-0 z-20"></div>}
                    {/* 区域 B: Agents - 红色背景 */}
                    <div className="agents-container w-full flex-shrink-0 flex flex-col" style={{height: `${ttydPreviewHeight}px`, backgroundColor: 'rgba(255, 0, 0, 0.1)'}}>
                      <div className="h-8 bg-vsc-bg-secondary border-t border-vsc-border flex items-center justify-between px-3 flex-shrink-0">
                        <span className="text-xs text-vsc-text-secondary">Agents</span>
                        <div className="flex gap-4 items-center">
                          {!isAgentsMinimized && (
                            <AgentControls 
                              paneId={BOT_NAME} 
                              token={token} 
                              boundAgents={boundAgents}
                              onAgentAdded={() => {
                                console.log('Current boundAgents:', boundAgents);
                              }} 
                            />
                          )}
                          <button
                            onClick={() => {
                              const container = document.querySelector('.agents-container') as HTMLElement;
                              const agentsList = container?.querySelector('.flex-1') as HTMLElement;
                              if (agentsList) {
                                agentsList.style.display = 'none';
                              }
                              setTtydPreviewHeight(32);
                              setIsAgentsMinimized(true);
                              setIsAgentsMaximized(false);
                              localStorage.setItem(`${BOT_NAME}_ttydPreviewHeight`, '32');
                            }}
                            className="text-vsc-text-secondary hover:text-vsc-text text-xs"
                            title="Minimize"
                          >
                            _
                          </button>
                          <button
                            onClick={() => {
                              const container = document.querySelector('.agents-container') as HTMLElement;
                              const agentsList = container?.querySelector('.flex-1') as HTMLElement;
                              if (agentsList) {
                                agentsList.style.display = 'block';
                              }
                              setTtydPreviewHeight(300);
                              setIsAgentsMinimized(false);
                              setIsAgentsMaximized(false);
                              localStorage.setItem(`${BOT_NAME}_ttydPreviewHeight`, '300');
                            }}
                            className="text-vsc-text-secondary hover:text-vsc-text text-xs"
                            title="Medium"
                          >
                            □
                          </button>
                          <button
                            onClick={() => {
                              const container = document.querySelector('.agents-container') as HTMLElement;
                              const agentsList = container?.querySelector('.flex-1') as HTMLElement;
                              if (agentsList) {
                                agentsList.style.display = 'block';
                              }
                              setTtydPreviewHeight(window.innerHeight - 72);
                              setIsAgentsMinimized(false);
                              setIsAgentsMaximized(true);
                              localStorage.setItem(`${BOT_NAME}_ttydPreviewHeight`, (window.innerHeight - 72).toString());
                            }}
                            className="text-vsc-text-secondary hover:text-vsc-text text-xs"
                            title="Maximize"
                          >
                            ▢
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <AgentsListView 
                          paneId={BOT_NAME} 
                          token={token} 
                          isDragging={isDragging} 
                          onAgentsChange={(agents) => setBoundAgents(agents)} 
                          onCaptureOpen={setAgentCaptureOpen}
                          onRestart={handleRestart}
                          onCapture={handleCapturePane}
                          onToggleMouse={async (paneId) => {
                            try {
                              await fetch(getApiUrl(`/api/tmux/mouse/toggle?pane_id=${encodeURIComponent(paneId)}`), {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                            } catch (err) {
                              console.error('Failed to toggle mouse:', err);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
                {isDragging && <div className="absolute inset-0 z-20"></div>}
              </div>
            )}
          {activeTab === 'Preview' && (
            <>
              {previewUrls.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full bg-vsc-bg" style={{marginTop: '40px'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-vsc-text-muted mb-4">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                  <p className="text-vsc-text-muted text-sm">No preview URLs found</p>
                </div>
              ) : (
                <>
                  <div style={{position: 'absolute', top: '40px', left: 0, right: 0, height: '32px', background: '#2a2d2e', borderBottom: '1px solid #474747', display: 'flex', gap: '4px', padding: '4px'}}>
                    {previewUrls.map((item: any, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setPreviewTab(idx);
                          localStorage.setItem(`${BOT_NAME}_previewTab`, idx.toString());
                        }}
                        style={{
                          padding: '4px 12px',
                          fontSize: '13px',
                          background: previewTab === idx ? '#474747' : 'transparent',
                          color: previewTab === idx ? '#fff' : '#858585',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {item.name || `URL ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                  {previewUrls.map((item: any, idx) => (
                    <div key={idx} className="absolute inset-0" style={{marginTop: '72px', display: previewTab === idx ? 'block' : 'none'}}>
                      <WebFrame
                        src={item.url || item}
                        className="w-full h-full"
                      />
                      {isDragging && <div className="absolute inset-0 z-20"></div>}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          {activeTab === 'Settings' && (
            <div style={{marginTop: '40px', height: 'calc(100% - 40px)'}}>
              <SettingsView 
                token={token}
                pane={{
                  target: TMUX_TARGET, 
                  title: paneTitle, 
                  workspace: paneWorkspace, 
                  agent_duty: paneAgentDuty, 
                  agent_type: paneAgentType, 
                  init_script: paneInitScript,
                  config: paneConfig,
                  tg_token: paneTgToken,
                  tg_chat_id: paneTgChatId,
                  tg_enable: paneTgEnable,
                  ttyd_preview: paneTtydPreview
                }}
                onChange={(pane) => {
                  setPaneTitle(pane.title);
                  setPaneWorkspace(pane.workspace || '');
                  setPaneAgentDuty(pane.agent_duty || '');
                  setPaneAgentType(pane.agent_type || '');
                  setPaneInitScript(pane.init_script || '');
                  setPaneConfig(pane.config || '{}');
                  setPaneTgToken(pane.tg_token || '');
                  setPaneTgChatId(pane.tg_chat_id || '');
                  setPaneTgEnable(pane.tg_enable || false);
                  setPaneTtydPreview(pane.ttyd_preview || '');
                  setPaneTgChatId(pane.tg_chat_id || '');
                  setPaneTgEnable(pane.tg_enable || false);
                  
                  // Update previewUrls from config
                  try {
                    const config = JSON.parse(pane.config || '{}');
                    setPreviewUrls(config.previewUrls || []);
                  } catch (e) {
                    console.error('Failed to parse config:', e);
                  }
                  
                  setTempPaneData(pane);
                }}
                onSave={handleSavePane}
                isSaving={isSavingPane}
              />
            </div>
          )}
          {isDragging && activeTab !== 'Settings' && activeTab !== 'Agents' && <div className="absolute inset-0 z-20"></div>}
        </div>
        <div id="drag" 
          className="absolute inset-y-0 w-1 bg-vsc-border hover:bg-vsc-accent cursor-col-resize z-10"
          style={{left: `calc(100vw - ${ttydWidth}px - 4px)`}}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
            const startX = e.clientX;
            const startWidth = ttydWidth;
            let currentWidth = startWidth;
            const onMouseMove = (e: MouseEvent) => {
              const newWidth = Math.max(200, Math.min(window.innerWidth - 200, startWidth - (e.clientX - startX)));
              currentWidth = newWidth;
              setTtydWidth(newWidth);
            };
            const onMouseUp = () => {
              setIsDragging(false);
              localStorage.setItem(`${BOT_NAME}_ttydWidth`, currentWidth.toString());
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        ></div>
        <div 
          id="maicnTtyd" 
          className="absolute inset-0" 
          style={{width: `${ttydWidth}px`, left: `calc(100vw - ${ttydWidth}px)`}}
          onMouseLeave={(e) => {
            const target = e.currentTarget.querySelector('.ttyd-mask') as HTMLElement;
            if (target) target.style.display = 'block';
          }}
        >
          <div className="h-10 bg-vsc-bg-titlebar border-b border-vsc-border flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 rounded text-sm bg-vsc-bg text-vsc-text hover:bg-vsc-bg-hover"
              >
                ttyd
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-hover"
                title="Add"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-vsc-text-secondary">
                <div className={`w-2 h-2 rounded-full ${networkStatus === 'excellent' ? 'bg-green-500' : networkStatus === 'good' ? 'bg-yellow-500' : networkStatus === 'poor' ? 'bg-orange-500' : 'bg-red-500'}`}></div>
                <span>{networkLatency}ms</span>
              </div>
              <div className="relative">
                <button 
                  type="button" 
                  onClick={() => setShowMoreMenu(!showMoreMenu)} 
                  className="p-1 rounded text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-active transition-colors" 
                  title="More"
                >
                  <MoreVertical size={16} />
                </button>
                {showMoreMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)}></div>
                    <div className="absolute right-0 top-full mt-1 bg-vsc-bg border border-vsc-border rounded shadow-lg z-50 min-w-[180px]">
                      <button 
                        type="button" 
                        onClick={async () => {
                          const paneId = BOT_NAME.replace(':main.0', '');
                          await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/choose-session`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
                          setShowMoreMenu(false);
                        }} 
                        className="w-full px-3 py-2 text-left text-xs text-vsc-text hover:bg-vsc-bg-hover"
                      >
                        ^bs Choose Session
                      </button>
                      <button 
                        type="button" 
                        onClick={async () => {
                          const paneId = BOT_NAME.replace(':main.0', '');
                          await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/split?direction=v`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
                          setShowMoreMenu(false);
                        }} 
                        className="w-full px-3 py-2 text-left text-xs text-vsc-text hover:bg-vsc-bg-hover flex items-center gap-2"
                      >
                        <SplitSquareVertical size={12} /> Split Horizontal
                      </button>
                      <button 
                        type="button" 
                        onClick={async () => {
                          const paneId = BOT_NAME.replace(':main.0', '');
                          await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/split?direction=h`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
                          setShowMoreMenu(false);
                        }} 
                        className="w-full px-3 py-2 text-left text-xs text-vsc-text hover:bg-vsc-bg-hover flex items-center gap-2"
                      >
                        <SplitSquareHorizontal size={12} /> Split Vertical
                      </button>
                      <button 
                        type="button" 
                        onClick={async () => {
                          const paneId = BOT_NAME.replace(':main.0', '');
                          await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneId)}/unsplit`), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
                          setShowMoreMenu(false);
                        }} 
                        className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-vsc-bg-hover flex items-center gap-2"
                      >
                        <XSquare size={12} /> Close Split
                      </button>
                      <div className="border-t border-vsc-border my-1"></div>
                      <button 
                        type="button" 
                        onClick={() => {
                          if (confirm('Reload this page?')) {
                            if (mainIframeRef.current) {
                              mainIframeRef.current.src = mainIframeRef.current.src;
                            }
                          }
                          setShowMoreMenu(false);
                        }} 
                        className="w-full px-3 py-2 text-left text-xs text-vsc-text hover:bg-vsc-bg-hover flex items-center gap-2"
                      >
                        <RefreshCw size={12} /> Reload
                      </button>
                      {hasPermission('prompt') && (
                        <button 
                          type="button" 
                          onClick={() => {
                            handleRestart();
                            setShowMoreMenu(false);
                          }} 
                          className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-vsc-bg-hover flex items-center gap-2"
                        >
                          <RefreshCw size={12} className={isRestarting ? 'animate-spin' : ''} /> Restart
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="relative w-full" style={{height: 'calc(100% - 40px)'}}>
            <WebFrame
              ref={mainIframeRef}
              loading="lazy"
              src={`https://ttyd-proxy.cicy.de5.net/ttyd/${BOT_NAME}/?token=${token}&mode=1`}
              className="w-full h-full"
              style={{height: MODE === 'ttyd' && hasPermission('prompt') ? `calc(100% - ${commandPanelHeight}px)` : '100%'}}
            />
            {showHistoryOverlay && historyData && (
              <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: MODE === 'ttyd' && hasPermission('prompt') ? `calc(100% - ${commandPanelHeight}px)` : '100%', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1, display: 'flex', flexDirection: 'column'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #474747', backgroundColor: '#1e1e1e'}}>
                  <span style={{fontSize: '14px', color: '#cccccc', fontWeight: 500}}>Command History</span>
                  <button onClick={() => setShowHistoryOverlay(false)} style={{color: '#858585', background: 'none', border: 'none', cursor: 'pointer'}}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div style={{flex: 1, overflowY: 'auto'}}>
                  {historyData.history.map((cmd, idx) => (
                    <div 
                      key={idx}
                      style={{padding: '12px 16px', borderBottom: '1px solid #2a2d2e', cursor: 'pointer', color: '#cccccc', backgroundColor: '#1e1e1e', display: 'flex', alignItems: 'center', gap: '8px'}}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2a2d2e';
                        const btn = e.currentTarget.querySelector('.delete-btn') as HTMLElement;
                        if (btn) btn.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1e1e1e';
                        const btn = e.currentTarget.querySelector('.delete-btn') as HTMLElement;
                        if (btn) btn.style.opacity = '0';
                      }}
                    >
                      <span 
                        style={{fontSize: '14px', fontFamily: 'monospace', flex: 1}}
                        onClick={() => {
                          historyData.onSelect(cmd);
                          setShowHistoryOverlay(false);
                        }}
                      >{cmd}</span>
                      <button 
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newHistory = historyData.history.filter((_, i) => i !== idx);
                          setHistoryData({...historyData, history: newHistory});
                        }}
                        style={{opacity: 0, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'opacity 0.2s'}}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div 
              className="ttyd-mask absolute inset-0 bg-transparent z-10"
              style={{display: 'none', pointerEvents: 'auto'}}
              onClick={(e) => {
                window.dispatchEvent(new CustomEvent('selectPane', { detail: { paneId: TMUX_TARGET } }));
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          {isDragging && <div className="absolute inset-0 z-20"></div>}
          {isInteracting && <div className="absolute inset-0 z-20"></div>}
          {MODE === 'ttyd' && hasPermission('prompt') && (
            <div className="absolute bottom-0 left-0 right-0" style={{height: `${commandPanelHeight}px`}}>
              {/* Correction Result */}
              {showCorrectionResult && correctionData ? (
                <div style={{position: 'absolute', bottom: `${commandPanelHeight + 4}px`, left: 0, right: 0, maxHeight: "300px", minHeight: "140px"}}>
                  <div style={{width: '100%', height: '100%', backgroundColor: '#1e1e1e', border: '1px solid #474747', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', position: 'relative'}}>
                    {/* Top bar */}
                    <div style={{height: '32px', backgroundColor: '#252526', borderBottom: '1px solid #474747', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0}}>
                      <span style={{fontSize: '12px', color: '#858585', fontWeight: 600, letterSpacing: '0.5px'}}>CORRECTION</span>
                      <button 
                        onClick={() => setShowCorrectionResult(false)}
                        style={{color: '#6a6a6a', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', transition: 'all 0.2s', display: 'flex', alignItems: 'center'}}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#474747';
                          e.currentTarget.style.color = '#cccccc';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = '#6a6a6a';
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', backgroundColor: '#474747', overflow: 'hidden'}}>
                      {/* English */}
                      <div 
                        style={{flex: 1, padding: '16px', backgroundColor: '#1e1e1e', position: 'relative', overflowY: 'auto'}}
                        onMouseEnter={(e) => {
                          const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement;
                          if (btns) btns.style.setProperty('opacity', '1', 'important');
                        }}
                        onMouseLeave={(e) => {
                          const btns = e.currentTarget.querySelector('.action-btns') as HTMLElement;
                          if (btns) btns.style.setProperty('opacity', '0', 'important');
                        }}
                      >
                        <div style={{fontSize: '15px', color: '#cccccc', fontFamily: 'monospace', lineHeight: '1.6', fontWeight: 500, paddingRight: '60px'}}>{correctionData?.[0]}</div>
                        <div className="action-btns" style={{opacity: 0, position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', transition: 'opacity 0.2s'}}>
                          <button 
                            onClick={() => navigator.clipboard.writeText(correctionData?.[0] || '')}
                            style={{padding: '6px', backgroundColor: '#252526', color: '#858585', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center'}}
                            onMouseEnter={(e) => {e.currentTarget.style.backgroundColor = '#474747'; e.currentTarget.style.color = '#cccccc';}}
                            onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = '#252526'; e.currentTarget.style.color = '#858585';}}
                            title="Copy"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                          <button 
                            onClick={() => {
                              commandPanelRef.current?.setPrompt(correctionData?.[0] || '');
                              setShowCorrectionResult(false);
                            }}
                            style={{padding: '6px', backgroundColor: '#252526', color: '#858585', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center'}}
                            onMouseEnter={(e) => {e.currentTarget.style.backgroundColor = '#474747'; e.currentTarget.style.color = '#cccccc';}}
                            onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = '#252526'; e.currentTarget.style.color = '#858585';}}
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </div>
                      </div>
                      {/* Chinese */}
                      <div 
                        style={{flex: 1, padding: '16px', backgroundColor: '#252526', position: 'relative', overflowY: 'auto'}}
                        onMouseEnter={(e) => {
                          const btns = e.currentTarget.querySelector('.action-btns-cn') as HTMLElement;
                          if (btns) btns.style.setProperty('opacity', '1', 'important');
                        }}
                        onMouseLeave={(e) => {
                          const btns = e.currentTarget.querySelector('.action-btns-cn') as HTMLElement;
                          if (btns) btns.style.setProperty('opacity', '0', 'important');
                        }}
                      >
                        <div style={{fontSize: '15px', color: '#858585', fontFamily: 'monospace', lineHeight: '1.6', paddingRight: '60px'}}>{correctionData?.[1]}</div>
                        <div className="action-btns-cn" style={{opacity: 0, position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', transition: 'opacity 0.2s'}}>
                          <button 
                            onClick={() => navigator.clipboard.writeText(correctionData?.[1] || '')}
                            style={{padding: '6px', backgroundColor: '#252526', color: '#858585', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center'}}
                            onMouseEnter={(e) => {e.currentTarget.style.backgroundColor = '#474747'; e.currentTarget.style.color = '#cccccc';}}
                            onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = '#252526'; e.currentTarget.style.color = '#858585';}}
                            title="Copy"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                          <button 
                            onClick={() => {
                              commandPanelRef.current?.setPrompt(correctionData?.[1] || '');
                              setShowCorrectionResult(false);
                            }}
                            style={{padding: '6px', backgroundColor: '#252526', color: '#858585', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center'}}
                            onMouseEnter={(e) => {e.currentTarget.style.backgroundColor = '#474747'; e.currentTarget.style.color = '#cccccc';}}
                            onMouseLeave={(e) => {e.currentTarget.style.backgroundColor = '#252526'; e.currentTarget.style.color = '#858585';}}
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              
              <div 
                className="absolute top-0 left-0 right-0 h-1 bg-vsc-border hover:bg-vsc-accent cursor-row-resize"
                style={{zIndex: 9999999}}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                  const startY = e.clientY;
                  const startHeight = commandPanelHeight;
                  const onMouseMove = (e: MouseEvent) => {
                    const newHeight = Math.max(150, Math.min(window.innerHeight - 100, startHeight - (e.clientY - startY)));
                    setCommandPanelHeight(newHeight);
                  };
                  const onMouseUp = () => {
                    setIsDragging(false);
                    localStorage.setItem(`${BOT_NAME}_commandPanelHeight`, commandPanelHeight.toString());
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              ></div>
              <CommandPanel
                ref={commandPanelRef}
                paneTarget={TMUX_TARGET}
                title={paneTitle || BOT_NAME}
                token={token}
                panelPosition={{x: 0, y: 0}}
                panelSize={{width: ttydWidth, height: commandPanelHeight}}
                readOnly={readOnly}
                onReadOnlyToggle={() => setReadOnly(v => !v)}
                onInteractionStart={() => setIsInteracting(true)}
                onInteractionEnd={() => setIsInteracting(false)}
                onChange={(pos, size) => setSettings(prev => ({ ...prev, panelSize: size }))}
                onCapturePane={handleCapturePane}
                isCapturing={isCapturing}
                canSend={agentStatus === 'idle' || agentStatus === 'wait_startup'}
                mode={MODE}
                onShowHistory={(history, onSelect) => {
                  setHistoryData({history, onSelect});
                  setShowHistoryOverlay(true);
                  setShowCorrectionResult(false);
                }}
                onShowCorrection={(result) => {
                  if (result === null) {
                    setCorrectionData(null);
                    setShowCorrectionResult(false);
                  } else {
                    setCorrectionData(result);
                    setShowCorrectionResult(true);
                    setShowHistoryOverlay(false);
                  }
                }}
                onCorrectionLoading={(loading) => {
                  setIsCorrectingEnglish(loading);
                }}
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
                disableDrag={true}
                showVoiceControl={settings.showVoiceControl}
                onToggleVoiceControl={() => {
                  setSettings(prev => ({ ...prev, showVoiceControl: !prev.showVoiceControl}))
                }}
              />
            </div>
          )}
        </div>

      </div>
      }
      
      {/* Title bar — hidden by default, click menu btn to show */}
      {MODE !== 'ttyd' && !captureOutput && !agentCaptureOpen && !editingPane && (
      <div
        id="fixTopbar"
        className="bg-vsc-bg/80 backdrop-blur-sm border border-vsc-border-subtle transition-transform duration-200 rounded-lg"
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
              className={`p-1.5 rounded transition-colors ${settings.showPrompt ? 'text-vsc-link bg-blue-500/20' : 'text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-active'}`}
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
              className={`p-1.5 rounded transition-colors ${settings.showVoiceControl ? 'text-red-400 bg-red-500/20' : 'text-vsc-text-secondary hover:text-vsc-text hover:bg-vsc-bg-active'}`}
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
        <div className="fixed bottom-4 right-4 px-4 py-3 bg-red-600 text-white text-sm font-medium rounded shadow-xl" style={{zIndex: 999999999}}>
          {toast}
        </div>
      )}

      {/* Desktop Dialog */}
      {showDesktopDialog && (
        <div className="fixed inset-0 bg-black/80 z-[9999999] flex items-center justify-center" onClick={() => setShowDesktopDialog(false)}>
          <div className="w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="h-10 bg-vsc-bg-titlebar border-b border-vsc-border flex items-center justify-between px-3">
              <span className="text-sm text-vsc-text font-medium">Desktop</span>
              <button onClick={() => setShowDesktopDialog(false)} className="p-1 hover:bg-vsc-bg-hover rounded text-vsc-text-secondary hover:text-vsc-text">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <iframe src={`https://desktop.cicy.de5.net/?token=${token}`} className="flex-1 w-full border-none" />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
