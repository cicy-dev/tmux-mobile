import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, Loader2, Clipboard, X, Keyboard, Mic, RotateCcw, Power } from 'lucide-react';
import { TtydFrame, TtydFrameHandle } from './components/TtydFrame';
import { CommandPanel, CommandPanelHandle } from './components/CommandPanel';
import { IframeTopbar } from './components/IframeTopbar';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { MultiTerminalView } from './components/MultiTerminalView';
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
  voiceButtonPosition: { x: 40, y: 200 },
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [paneTitle, setPaneTitle] = useState<string>('');
  const [paneWorkspace, setPaneWorkspace] = useState<string>('');
  const [readOnly, setReadOnly] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const [isInteracting, setIsInteracting] = useState(false);
  const [multiTerminalMode, setMultiTerminalMode] = useState(false);

  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [toast, setToast] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const voiceModeRef = useRef<'append' | 'direct'>('append');
  const recognitionRef = useRef<any>(null);
  const commandPanelRef = useRef<CommandPanelHandle>(null);
  const iframeRef = useRef<TtydFrameHandle>(null);

  const iframeUrl = `${TTYD_BASE}/ttyd/${BOT_NAME}/?token=${token || ''}`;

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

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, isLoaded]);

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
      const timer = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLogin = (newToken: string) => setToken(newToken);

  // --- Voice ---
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
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
        }
        // In direct mode, commands are sent from VoiceFloatingButton via onRecordEnd
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
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

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      {/* Title bar — hidden when in iframe */}
      {!isInIframe && (
      <div className="bg-black" style={{position:"fixed",zIndex:111111111,top:0,right:0,left:0,height:32}}>

        <IframeTopbar
        title={paneTitle || BOT_NAME}
        workspace={paneWorkspace || undefined}
        networkLatency={networkLatency}
        networkStatus={networkStatus}
        rightActions={
          <>
            <button
              onClick={() => setSettings(prev => ({ ...prev, showPrompt: !prev.showPrompt }))}
              className={`p-1.5 rounded transition-colors ${settings.showPrompt ? 'text-blue-400 bg-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={settings.showPrompt ? "Hide command panel" : "Show command panel"}
            >
              <Keyboard size={14} />
            </button>
            <button
              onClick={() => setSettings(prev => ({ ...prev, showVoiceControl: !prev.showVoiceControl }))}
              className={`p-1.5 rounded transition-colors ${settings.showVoiceControl ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              title={settings.showVoiceControl ? "Hide voice mode" : "Show voice mode"}
            >
              <Mic size={14} />
            </button>
            <button
              onClick={() => {location.reload()}}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Reload page"
            >
              <RotateCcw size={14} />
            </button>
            {!settings.showPrompt && (
            <button
              onClick={handleCapturePane}
              disabled={isCapturing}
              className="p-1 rounded text-yellow-400 hover:text-yellow-300 hover:bg-gray-700 disabled:opacity-40"
              title="Capture pane output"
            >
              {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Clipboard size={14} />}
            </button>
            )}
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
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              title="Restart tmux and ttyd"
            >
              <Power size={14} className={isRestarting ? 'animate-pulse' : ''} />
            </button>
          </>
        }
      />
      </div>
      )}

        {readOnly && (
          <div
            className="fixed inset-0 z-10 pointer-events-auto cursor-text"
            style={{zIndex:999998}}
            onClick={() => { setToast('Click the panel to focus'); commandPanelRef.current?.focusTextarea(); }}
          />
        )}


      {/* Floating command panel */}
      {settings.showPrompt && (
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
        />
      )}

      {/* Voice floating button */}
      {settings.showVoiceControl && (
        <div style={{position:"fixed",zIndex:1111111,top:0,right:0,left:0,height:32}}>
        <VoiceFloatingButton
          initialPosition={settings.voiceButtonPosition}
          onPositionChange={pos => setSettings(prev => ({ ...prev, voiceButtonPosition: pos }))}
          onRecordStart={() => startVoiceRecording('direct')}
          onRecordEnd={() => stopVoiceRecording()}
          isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
        />
        </div>
      )}

      {/* Capture output modal - full page */}
      {captureOutput !== null && (
        <div className="fixed inset-0 z-[9999999] flex flex-col bg-black" onClick={() => setCaptureOutput(null)}>
          <div className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-900 flex-shrink-0 pointer-events-none">
            <span className="text-sm font-semibold text-white">Pane Output</span>
            <span className="ml-auto text-xs text-gray-500 pointer-events-auto" onClick={() => setCaptureOutput(null)}>Click to close</span>
          </div>
          <pre className="flex-1 overflow-auto p-4 text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-black">
            {captureOutput || '(empty)'}
          </pre>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="absolute bottom-4 left-4 z-50 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-lg border-2 border-blue-400">
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
