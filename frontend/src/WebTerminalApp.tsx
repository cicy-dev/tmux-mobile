import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Wifi, WifiOff, RefreshCw, Plus, Loader2 } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { LoginForm } from './components/LoginForm';
import { getApiUrl, getTtydUrl } from './services/apiUrl';

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
}

export const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [tmuxPanes, setTmuxPanes] = useState<TmuxPane[]>([]);
  const [ttydConfigs, setTtydConfigs] = useState<Record<string, TtydConfig>>({});
  const [selectedPane, setSelectedPane] = useState<TmuxPane | null>(null);
  const [showPaneList, setShowPaneList] = useState(true);
  const [isLoadingPanes, setIsLoadingPanes] = useState(false);
  const [iframeKeys, setIframeKeys] = useState<Record<string, number>>({});

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ win_name: '', title: '', proxy: '' });
  const [isCreating, setIsCreating] = useState(false);

  const [editingPane, setEditingPane] = useState<{
    target: string; title: string; url?: string; workspace?: string;
    init_script?: string; proxy?: string; tg_token?: string; tg_chat_id?: string; tg_enable?: boolean;
  } | null>(null);

  const [restartingPane, setRestartingPane] = useState<string | null>(null);
  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

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

  useEffect(() => {
    if (token) loadTmuxPanes();
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
              const [, paneNum] = rest.split('.');
              panes.push({ session: sessionName, window: String(win.index), pane: paneNum || '0', target: pane, botName: win.name });
            }
          }
        }
        setTmuxPanes(panes);
        setSelectedPane(prev => {
          if (prev && panes.find(p => p.target === prev.target)) return prev;
          if (panes.length > 0) {
            getTtydConfig(panes[0].target);
            return panes[0];
          }
          return null;
        });
      }
    } catch (e) { console.error(e); }
    finally { setIsLoadingPanes(false); }
  };

  const getTtydConfig = async (paneTarget: string): Promise<TtydConfig | null> => {
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
          tg_chat_id: data.tg_chat_id, tg_enable: data.tg_enable
        };
        setTtydConfigs(prev => ({ ...prev, [paneTarget]: config }));
        return config;
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const handleSelectPane = (pane: TmuxPane) => {
    setSelectedPane(pane);
    getTtydConfig(pane.target);
  };

  const handleCreateWindow = async () => {
    const { win_name, title, proxy } = createForm;
    if (!win_name.trim() || !token) return;
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = { win_name: win_name.trim(), session_name: 'worker', dev: false };
      if (title.trim()) body.title = title.trim();
      if (proxy.trim()) body.proxy = proxy.trim();

      const res = await fetch(getApiUrl('/api/tmux/create'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateDialog(false);
        setCreateForm({ win_name: '', title: '', proxy: '' });
        await loadTmuxPanes();
        if (data.pane_id) {
          const newPane: TmuxPane = { target: data.pane_id, session: 'worker', window: win_name.trim(), pane: '0', botName: win_name.trim() };
          // Store config from create response directly (ttyd already started)
          if (data.ttyd_token && data.ttyd_port) {
            const config: TtydConfig = {
              name: data.pane_id, title: data.title || data.pane_id,
              port: data.ttyd_port, token: data.ttyd_token, url: data.url,
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

  const handleRestartPane = async (paneTarget: string) => {
    if (!token || restartingPane) return;
    setRestartingPane(paneTarget);
    // Clear old config so iframe re-fetches after restart
    setTtydConfigs(prev => { const next = { ...prev }; delete next[paneTarget]; return next; });
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(paneTarget)}/restart`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      // Poll until ttyd is ready, then reload config
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch(getApiUrl(`/api/ttyd/status/${encodeURIComponent(paneTarget)}`), {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.ready === true) {
              // Re-fetch fresh config (new token after restart)
              await getTtydConfig(paneTarget);
              // Bump iframe key to force reload
              setIframeKeys(prev => ({ ...prev, [paneTarget]: (prev[paneTarget] || 0) + 1 }));
              break;
            }
          }
        } catch {}
      }
    } catch (e) { console.error(e); }
    finally { setRestartingPane(null); }
  };

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
          proxy: data.proxy, tg_token: data.tg_token, tg_chat_id: data.tg_chat_id, tg_enable: data.tg_enable
        });
      }
    } catch {
      const config = ttydConfigs[paneTarget];
      setEditingPane({ target: paneTarget, title: currentTitle, url: config?.url, workspace: config?.workspace, init_script: config?.init_script, proxy: config?.proxy });
    }
  };

  const handleSaveEdit = async () => {
    if (!token || !editingPane) return;
    const { target, title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable } = editingPane;
    await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(target)}`), {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable })
    });
    setTtydConfigs(prev => ({ ...prev, [target]: { ...prev[target], title, workspace, init_script, proxy, tg_token, tg_chat_id, tg_enable } }));
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
        } else setNetworkStatus('offline');
      } catch { setNetworkStatus('offline'); }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [token]);

  if (isCheckingAuth) return <div className="bg-black w-screen h-screen flex items-center justify-center"><div className="text-white">Loading...</div></div>;
  if (!token) return <LoginForm onLogin={(t) => { localStorage.setItem('token', t); setToken(t); }} />;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans flex">
      {/* Icon sidebar */}
      <div className="w-16 h-full bg-gray-900 border-r border-gray-800 flex flex-col justify-between py-4 z-[40] flex-shrink-0">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
            <Terminal size={20} className="text-white" />
          </div>
          <button onClick={() => setShowPaneList(!showPaneList)} className={`p-2 rounded ${showPaneList ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`} title="Sessions">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </button>
          <button onClick={() => setShowCreateDialog(true)} className="p-2 rounded text-green-400 hover:bg-gray-800" title="Create">
            <Plus size={20} />
          </button>
          <button onClick={loadTmuxPanes} disabled={isLoadingPanes} className="p-2 rounded text-gray-400 hover:bg-gray-800 disabled:opacity-50" title="Refresh">
            <RefreshCw size={20} className={isLoadingPanes ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleCapturePane} disabled={!selectedPane || isCapturing} className="p-2 rounded text-yellow-400 hover:bg-gray-800 disabled:opacity-50" title="Capture pane output">
            {isCapturing
              ? <Loader2 size={20} className="animate-spin" />
              : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            }
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => { localStorage.removeItem('token'); setToken(null); }} className="p-2 rounded text-gray-400 hover:bg-gray-800 hover:text-red-400" title="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Session/Pane list sidebar */}
      <div className={`h-full bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 transition-all duration-300 ${showPaneList ? 'w-60' : 'w-0 overflow-hidden'}`}>
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="text-white font-semibold">Sessions</div>
          <div className="flex items-center gap-2">
            {networkStatus === 'offline' ? <WifiOff size={14} className="text-red-400" /> : <Wifi size={14} className={networkStatus === 'excellent' ? 'text-green-400' : networkStatus === 'good' ? 'text-yellow-400' : 'text-red-400'} />}
            <span className="text-gray-400 font-mono text-xs">{networkLatency !== null ? `${networkLatency}ms` : '...'}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {tmuxPanes.map(pane => {
              const config = ttydConfigs[pane.target];
              const title = config?.title || pane.botName || pane.target;
              const isRestarting = restartingPane === pane.target;
              const isSelected = selectedPane?.target === pane.target;
              return (
                <div key={pane.target} className={`flex items-center gap-1 rounded group ${isSelected ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                  <button onClick={() => handleSelectPane(pane)} className={`flex-1 text-left px-3 py-2 rounded text-sm truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                    {title}
                  </button>
                  {/* Restart */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRestartPane(pane.target); }}
                    disabled={!!restartingPane}
                    className={`p-1.5 rounded disabled:opacity-40 ${isSelected ? 'text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-700 opacity-0 group-hover:opacity-100'}`}
                    title="Restart"
                  >
                    <RefreshCw size={13} className={isRestarting ? 'animate-spin' : ''} />
                  </button>
                  {/* Edit */}
                  <button onClick={(e) => { e.stopPropagation(); handleEditPane(pane.target, title); }} className={`p-1.5 rounded ${isSelected ? 'text-white hover:bg-blue-700' : 'text-gray-500 hover:bg-gray-700 opacity-0 group-hover:opacity-100'}`} title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                </div>
              );
            })}
            {tmuxPanes.length === 0 && !isLoadingPanes && (
              <div className="text-gray-600 text-xs text-center py-4">No panes</div>
            )}
          </div>
        </div>
      </div>

      {/* Main terminal area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {tmuxPanes.map(pane => {
          const config = ttydConfigs[pane.target];
          const iframeKey = iframeKeys[pane.target] || 0;
          return (
            <div key={pane.target} style={{ display: selectedPane?.target === pane.target ? 'block' : 'none' }} className="absolute inset-0">
              {config
                ? <TtydFrame key={iframeKey} url={getTtydUrl(pane.target, config.token)} isInteractingWithOverlay={false} />
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

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Window</h3>
            <input
              type="text" placeholder="Window name (e.g. my_terminal)"
              value={createForm.win_name}
              onChange={e => setCreateForm(f => ({ ...f, win_name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text" placeholder="Title (optional)"
              value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text" placeholder="Proxy (optional, e.g. http://proxy:8080)"
              value={createForm.proxy}
              onChange={e => setCreateForm(f => ({ ...f, proxy: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-gray-400 mb-4">Session: worker</div>
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-[90vw] max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-gray-800/50">
              <h3 className="text-lg font-semibold text-white">Edit Pane</h3>
              <button onClick={() => setEditingPane(null)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-140px)] space-y-4">
              <div>
                <label className="block text-gray-400 text-xs mb-1">Pane ID</label>
                <div className="text-white bg-gray-800/50 px-3 py-2 rounded text-sm font-mono">{editingPane.target}</div>
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Title</label>
                <input type="text" value={editingPane.title} onChange={e => setEditingPane({ ...editingPane, title: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm" />
              </div>
              {editingPane.url && (
                <div>
                  <label className="block text-gray-400 text-xs mb-1">TTYD URL</label>
                  <a href={editingPane.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline bg-gray-800/50 px-3 py-2 rounded text-xs font-mono block truncate">{editingPane.url}</a>
                </div>
              )}
              <div>
                <label className="block text-gray-400 text-xs mb-1">Workspace</label>
                <input type="text" value={editingPane.workspace || ''} onChange={e => setEditingPane({ ...editingPane, workspace: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="~/workers/my_app" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Init Script</label>
                <textarea value={editingPane.init_script || ''} onChange={e => setEditingPane({ ...editingPane, init_script: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm resize-none" rows={3} />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1">Proxy</label>
                <input type="text" value={editingPane.proxy || ''} onChange={e => setEditingPane({ ...editingPane, proxy: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="http://proxy:8080" />
              </div>
              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">Telegram Notifications</p>
                <div className="space-y-2">
                  <input type="text" value={editingPane.tg_token || ''} onChange={e => setEditingPane({ ...editingPane, tg_token: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="Bot Token" />
                  <input type="text" value={editingPane.tg_chat_id || ''} onChange={e => setEditingPane({ ...editingPane, tg_chat_id: e.target.value })} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm" placeholder="Chat ID" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingPane.tg_enable || false} onChange={e => setEditingPane({ ...editingPane, tg_enable: e.target.checked })} className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-300">Enable notifications</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-700 bg-gray-800/30">
              <button onClick={handleDeletePane} className="px-4 py-2 bg-red-600/80 text-white rounded-lg hover:bg-red-600 text-sm">Delete</button>
              <div className="flex-1" />
              <button onClick={() => setEditingPane(null)} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Capture output modal */}
      {captureOutput !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]" onClick={() => setCaptureOutput(null)}>
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
