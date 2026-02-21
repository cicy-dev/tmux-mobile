import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { ArrowLeft, Grid, Move, Users, X, Send, Clipboard, ExternalLink, Sparkles, Check, Minus, Square, RefreshCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { TtydGroupDetail } from '../types';
import { TtydFrame } from './TtydFrame';
import { PanePicker } from './PanePicker';
import { EditPaneDialog, EditPaneData } from './EditPaneDialog';
import { calculateAutoGrid } from '../utils/autoGrid';
import { getApiUrl, getTtydUrl } from '../services/apiUrl';
import { sendCommandToTmux, sendShortcut } from '../services/mockApi';

interface TtydConfig {
  name: string;
  title?: string;
  port: number;
  token: string;
  workspace?: string;
  active?: boolean;
  init_script?: string;
  proxy?: string;
  tg_enable?: boolean;
  tg_token?: string;
  tg_chat_id?: string;
}

interface TmuxPane {
  target: string;
  botName: string;
}

interface Props {
  group: TtydGroupDetail;
  token: string | null;
  ttydConfigs: Record<string, TtydConfig>;
  tmuxPanes: TmuxPane[];
  onBack: () => void;
  onGroupUpdated: (group: TtydGroupDetail) => void;
}

interface LocalLayout {
  pane_id: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
}

const TOPBAR_H = 32;
const PROMPT_H = 56;

export const GroupCanvas: React.FC<Props> = ({
  group,
  token,
  ttydConfigs,
  tmuxPanes,
  onBack,
  onGroupUpdated,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [layouts, setLayouts] = useState<LocalLayout[]>(
    group.panes.map(p => ({ ...p }))
  );
  const [showPicker, setShowPicker] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activePane, setActivePane] = useState<string | null>(layouts[0]?.pane_id || null);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [editingPane, setEditingPane] = useState<EditPaneData | null>(null);
  const [editingGroup, setEditingGroup] = useState<{ name: string; description: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'restart' | 'delete'; target: string; title: string } | null>(null);
  const [paneCommands, setPaneCommands] = useState<Record<string, string>>({});
  const [paneSending, setPaneSending] = useState<Record<string, boolean>>({});
  const [paneHistory, setPaneHistory] = useState<Record<string, string[]>>({});
  const [paneHistoryIndex, setPaneHistoryIndex] = useState<Record<string, number>>({});
  const [paneDraft, setPaneDraft] = useState<Record<string, string>>({});
  const [captureOutput, setCaptureOutput] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [minimizedPanes, setMinimizedPanes] = useState<Record<string, boolean>>({});
  const [paneReloadKeys, setPaneReloadKeys] = useState<Record<string, number>>({});

  const togglePaneMinimize = (paneId: string) => {
    setMinimizedPanes(prev => ({ ...prev, [paneId]: !prev[paneId] }));
  };

  const handleReloadPane = (paneId: string) => {
    setPaneReloadKeys(prev => ({ ...prev, [paneId]: (prev[paneId] || 0) + 1 }));
  };

  const handleCapturePaneFor = async (paneId: string) => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const res = await fetch(getApiUrl('/api/tmux/capture_pane'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ pane_id: paneId, start: -200 }),
      });
      if (res.ok) {
        const data = await res.json();
        setCaptureOutput(data.output || '');
      }
    } catch (e) { console.error(e); }
    finally { setIsCapturing(false); }
  };

  const handleCorrectEnglishForPane = async (paneId: string) => {
    const text = paneCommands[paneId]?.trim();
    if (!text || isCorrecting || !token) return;
    setIsCorrecting(true);
    try {
      const res = await fetch(getApiUrl('/api/correctEnglish'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.success && data.correctedText) {
        setCorrectedText(data.correctedText);
      }
    } catch (e) { console.error(e); }
    finally { setIsCorrecting(false); }
  };

  const handleUseCorrectedText = () => {
    if (!correctedText || !activePane) return;
    setPaneCommands(prev => ({ ...prev, [activePane]: correctedText }));
    savePaneDraft(activePane, correctedText);
    setCorrectedText(null);
  };

  useEffect(() => {
    const loadedHistory: Record<string, string[]> = {};
    const loadedDrafts: Record<string, string> = {};
    layouts.forEach(l => {
      const h = localStorage.getItem(`cmd_history_${l.pane_id}`);
      if (h) try { loadedHistory[l.pane_id] = JSON.parse(h); } catch {}
      const d = localStorage.getItem(`cmd_draft_${l.pane_id}`);
      if (d) loadedDrafts[l.pane_id] = d;
    });
    setPaneHistory(loadedHistory);
    setPaneDraft(loadedDrafts);
    setPaneCommands(loadedDrafts);
  }, [layouts.map(l => l.pane_id).join(',')]);

  const savePaneHistory = (paneId: string, history: string[]) => {
    localStorage.setItem(`cmd_history_${paneId}`, JSON.stringify(history));
  };

  const savePaneDraft = (paneId: string, draft: string) => {
    localStorage.setItem(`cmd_draft_${paneId}`, draft);
  };

  const STORAGE_KEY = `group_${group.id}_state`;
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync when group changes
  useEffect(() => {
    setLayouts(group.panes.map(p => ({ ...p })));
    setActivePane(group.panes[0]?.pane_id || null);

    // Load from localStorage if exists
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const { activePane: ap, layoutMode: lm } = JSON.parse(cached);
        setActivePane(ap || group.panes[0]?.pane_id || null);
        setLayoutMode(lm || 'horizontal');
      } catch (e) { console.error('Failed to parse cached group state', e); }
    }
  }, [group.id]);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // Save state to localStorage and sync to API
  useEffect(() => {
    // Save to localStorage
    const stateToCache = { activePane, layoutMode };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToCache));

    // Setup periodic sync to MySQL
    if (syncTimer.current) clearInterval(syncTimer.current);
    syncTimer.current = setInterval(() => {
      fetch(getApiUrl(`/api/groups/${group.id}/state`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ activePane, layoutMode }),
      }).catch(console.error);
    }, 30000); // Sync every 30 seconds

    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  }, [activePane, layoutMode, group.id, token]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape' && activePane) {
        e.preventDefault();
        e.stopPropagation();
        sendShortcut('Escape', activePane);
        return false;
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activePane]);

  // Throttled layout save for single pane
  const scheduleSave = useCallback(
    (paneId: string, layout: Omit<LocalLayout, 'pane_id'>) => {
      if (saveTimers.current[paneId]) clearTimeout(saveTimers.current[paneId]);
      saveTimers.current[paneId] = setTimeout(() => {
        fetch(getApiUrl(`/api/groups/${group.id}/panes/${encodeURIComponent(paneId)}/layout`), {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify(layout),
        }).catch(console.error);
      }, 500);
    },
    [group.id, token]
  );

  const handleDragStop = (paneId: string, d: { x: number; y: number }) => {
    setIsDragging(false);
    setLayouts(prev =>
      prev.map(l => l.pane_id === paneId ? { ...l, pos_x: d.x, pos_y: d.y } : l)
    );
    const layout = layouts.find(l => l.pane_id === paneId);
    if (layout) {
      scheduleSave(paneId, { ...layout, pos_x: d.x, pos_y: d.y });
    }
  };

  const handleResizeStop = (
    paneId: string,
    _e: unknown,
    _dir: unknown,
    ref: HTMLElement,
    _delta: unknown,
    position: { x: number; y: number }
  ) => {
    const width = ref.offsetWidth;
    const height = ref.offsetHeight;
    setLayouts(prev =>
      prev.map(l => l.pane_id === paneId
        ? { ...l, width, height, pos_x: position.x, pos_y: position.y }
        : l
      )
    );
    const layout = layouts.find(l => l.pane_id === paneId);
    if (layout) {
      scheduleSave(paneId, { ...layout, width, height, pos_x: position.x, pos_y: position.y });
    }
    setIsResizing(false);
  };

  const handleAutoGrid = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight + TOPBAR_H + PROMPT_H;
    const paneIds = layouts.map(l => l.pane_id);
    const N = paneIds.length;

    let gridLayouts;
    if (layoutMode === 'vertical') {
      // Vertical: 1 column, many rows
      const cellW = canvasW - 40;
      const cellH = (canvasH - TOPBAR_H - PROMPT_H - 20) / N;
      gridLayouts = paneIds.map((id, i) => ({
        pane_id: id,
        pos_x: 20,
        pos_y: TOPBAR_H + i * cellH + 10,
        width: cellW,
        height: Math.max(150, cellH - 10),
      }));
    } else {
      // Horizontal: auto grid
      gridLayouts = calculateAutoGrid(paneIds, {
        canvasW,
        canvasH,
        topbarH: TOPBAR_H,
        promptBarH: PROMPT_H,
      });
    }

    const newLayouts = gridLayouts.map(gl => ({
      ...gl,
      z_index: layouts.find(l => l.pane_id === gl.pane_id)?.z_index || 1,
    }));
    setLayouts(newLayouts);

    // Batch save
    try {
      await fetch(getApiUrl(`/api/groups/${group.id}/layout`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ panes: newLayouts }),
      });
    } catch (e) { console.error(e); }
  }, [layouts, group.id, token, layoutMode]);

  const applyLayout = useCallback((mode: 'horizontal' | 'vertical') => {
    setLayoutMode(mode);
    // Use setTimeout to ensure state update before grid calculation
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasW = canvas.offsetWidth;
      const canvasH = canvas.offsetHeight + TOPBAR_H + PROMPT_H;
      const paneIds = layouts.map(l => l.pane_id);
      const N = paneIds.length;

      let gridLayouts;
      if (mode === 'vertical') {
        const cellW = canvasW - 40;
        const cellH = (canvasH - TOPBAR_H - PROMPT_H - 20) / N;
        gridLayouts = paneIds.map((id, i) => ({
          pane_id: id,
          pos_x: 20,
          pos_y: TOPBAR_H + i * cellH + 10,
          width: cellW,
          height: Math.max(150, cellH - 10),
        }));
      } else {
        gridLayouts = calculateAutoGrid(paneIds, {
          canvasW,
          canvasH,
          topbarH: TOPBAR_H,
          promptBarH: PROMPT_H,
        });
      }

      const newLayouts = gridLayouts.map(gl => ({
        ...gl,
        z_index: layouts.find(l => l.pane_id === gl.pane_id)?.z_index || 1,
      }));
      setLayouts(newLayouts);

      fetch(getApiUrl(`/api/groups/${group.id}/layout`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ panes: newLayouts }),
      }).catch(console.error);
    }, 0);
  }, [layouts, group.id, token]);

  const handlePickerConfirm = async (paneIds: string[]) => {
    setShowPicker(false);
    try {
      const res = await fetch(getApiUrl(`/api/groups/${group.id}/panes`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ pane_ids: paneIds }),
      });
      if (res.ok) {
        // Reload group detail
        const gRes = await fetch(getApiUrl(`/api/groups/${group.id}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (gRes.ok) {
          const newGroup: TtydGroupDetail = await gRes.json();
          onGroupUpdated(newGroup);
          setLayouts(newGroup.panes.map(p => ({ ...p })));
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleSavePaneTitle = async () => {
    if (!editingPane || !token) return;
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(editingPane.target)}`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          title: editingPane.title,
          active: editingPane.active,
          workspace: editingPane.workspace,
          init_script: editingPane.init_script,
          proxy: editingPane.proxy,
          tg_enable: editingPane.tg_enable,
          tg_token: editingPane.tg_token,
          tg_chat_id: editingPane.tg_chat_id,
        }),
      });
      setEditingPane(null);
    } catch (e) { console.error(e); }
  };

  const handleSaveGroup = async () => {
    if (!editingGroup || !token) return;
    try {
      const res = await fetch(getApiUrl(`/api/groups/${group.id}`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ name: editingGroup.name, description: editingGroup.description }),
      });
      if (res.ok) {
        setEditingGroup(null);
        // Optionally reload group data
        const gRes = await fetch(getApiUrl(`/api/groups/${group.id}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (gRes.ok) {
          const newGroup: TtydGroupDetail = await gRes.json();
          onGroupUpdated(newGroup);
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleRestartPane = async () => {
    const target = editingPane?.target || confirmAction?.target;
    if (!target || !token) return;
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(target)}/restart`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmAction(null);
    } catch (e) { console.error(e); }
  };

  const handleDeletePane = async () => {
    const target = editingPane?.target || confirmAction?.target;
    if (!target || !token) return;
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(target)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmAction(null);
      setEditingPane(null);
      const gRes = await fetch(getApiUrl(`/api/groups/${group.id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (gRes.ok) {
        const newGroup: TtydGroupDetail = await gRes.json();
        onGroupUpdated(newGroup);
      }
    } catch (e) { console.error(e); }
  };

  const handleSendToPane = async (paneId: string) => {
    const cmd = paneCommands[paneId]?.trim();
    if (!cmd) return;
    const newHistory = [cmd, ...(paneHistory[paneId] || []).filter(c => c !== cmd)].slice(0, 50);
    setPaneHistory(prev => ({ ...prev, [paneId]: newHistory }));
    savePaneHistory(paneId, newHistory);
    setPaneHistoryIndex(prev => ({ ...prev, [paneId]: -1 }));
    setPaneDraft(prev => ({ ...prev, [paneId]: '' }));
    savePaneDraft(paneId, '');
    setPaneSending(prev => ({ ...prev, [paneId]: true }));
    try {
      await sendCommandToTmux(cmd, paneId);
      setPaneCommands(prev => ({ ...prev, [paneId]: '' }));
    } catch (e) {
      console.error(e);
    } finally {
      setPaneSending(prev => ({ ...prev, [paneId]: false }));
    }
  };

  const paneTitles: Record<string, string> = {};
  layouts.forEach(l => {
    paneTitles[l.pane_id] = ttydConfigs[l.pane_id]?.title || l.pane_id;
  });

  return (
    <div className="flex flex-col w-full h-full bg-black">
      {/* TopBar */}
      <div className="flex items-center justify-between px-3 h-8 bg-gray-900 border-b border-gray-800 flex-shrink-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Back to terminal"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-white text-sm font-medium truncate max-w-[200px]">{group.name}</span>
          <span className="text-gray-500 text-xs">{layouts.length} pane{layouts.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 text-xs transition-colors"
            title="Manage panes"
          >
            <Users size={13} />
            Panes
          </button>
          <button
            onClick={handleAutoGrid}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 text-xs transition-colors"
            title="Auto-grid layout"
          >
            <Grid size={13} />
            Grid
          </button>
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-gray-800 border border-gray-700">
            <button
              onClick={() => applyLayout('horizontal')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                layoutMode === 'horizontal'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Horizontal layout"
            >
              ⇄
            </button>
            <button
              onClick={() => applyLayout('vertical')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                layoutMode === 'vertical'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Vertical layout"
            >
              ⇅
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: '#0d0d0d' }}
      >
        {layouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <Users size={40} className="mb-3 opacity-40" />
            <p className="text-sm">No panes in this group</p>
            <button
              onClick={() => setShowPicker(true)}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 transition-colors"
            >
              Add panes
            </button>
          </div>
        ) : (
          layouts.map(layout => {
            const config = ttydConfigs[layout.pane_id];
            const title = paneTitles[layout.pane_id];
            const isMin = minimizedPanes[layout.pane_id];
            return (
              <Rnd
                key={layout.pane_id}
                position={{ x: layout.pos_x, y: layout.pos_y }}
                size={{ width: layout.width, height: isMin ? 28 : layout.height }}
                onDragStart={() => { setActivePane(layout.pane_id); setIsDragging(true); }}
                onDragStop={(_e, d) => handleDragStop(layout.pane_id, d)}
                onResizeStart={() => { if (isMin) return; setIsResizing(true); }}
                onResizeStop={(_e, dir, ref, delta, pos) =>
                  handleResizeStop(layout.pane_id, _e, dir, ref, delta, pos)
                }
                minWidth={200}
                minHeight={28}
                bounds="parent"
                dragHandleClassName="drag-handle"
                style={{ zIndex: activePane === layout.pane_id ? 1000 : layout.z_index, overflow: 'hidden' }}
                disableDragging={false}
                enableResizing={!isMin}
              >
                <div className={`flex flex-col w-full h-full overflow-hidden shadow-xl bg-black rounded-t-lg ${activePane === layout.pane_id ? 'ring-2 ring-purple-500 border border-purple-500 shadow-lg shadow-purple-900/30' : 'border border-gray-700'}`} onClick={() => setActivePane(layout.pane_id)}>
                  {/* TipBar (drag handle) */}
                  <div
                    className={`drag-handle flex items-center justify-between px-2 h-7 flex-shrink-0 cursor-move select-none transition-colors group/titlebar ${
                      activePane === layout.pane_id
                        ? 'bg-purple-800'
                        : 'bg-gray-900 hover:bg-gray-800'
                    }`}
                    >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Move size={11} className={activePane === layout.pane_id ? 'text-white' : 'text-gray-600'} />
                      <span className={`text-xs truncate ${activePane === layout.pane_id ? 'text-white font-medium' : 'text-gray-400'}`}>{title}</span>
                    </div>
                    {activePane === layout.pane_id && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCorrectEnglishForPane(layout.pane_id); }}
                        disabled={!paneCommands[layout.pane_id]?.trim() || isCorrecting}
                        className="p-0.5 mr-1 rounded text-purple-400 hover:text-purple-300 disabled:opacity-40"
                        title="Correct English"
                      >
                        {isCorrecting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCapturePaneFor(layout.pane_id); }}
                        disabled={isCapturing}
                        className="p-0.5 mr-1 rounded text-yellow-400 hover:text-yellow-300 disabled:opacity-40"
                        title="Capture pane"
                      >
                        {isCapturing ? <Loader2 size={11} className="animate-spin" /> : <Clipboard size={11} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(getTtydUrl(layout.pane_id, config?.token), '_blank'); }}
                        className="p-0.5 mr-1 rounded text-gray-400 hover:text-white"
                        title="Open in new window"
                      >
                        <ExternalLink size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReloadPane(layout.pane_id); }}
                        className="p-0.5 mr-1 rounded text-gray-400 hover:text-white"
                        title="Reload"
                      >
                        <RefreshCw size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const paneConfig = ttydConfigs[layout.pane_id];
                          setEditingPane({
                            target: layout.pane_id,
                            title: paneTitles[layout.pane_id],
                            workspace: paneConfig?.workspace,
                            active: paneConfig?.active,
                            init_script: paneConfig?.init_script,
                            proxy: paneConfig?.proxy,
                            tg_enable: paneConfig?.tg_enable,
                            tg_token: paneConfig?.tg_token,
                            tg_chat_id: paneConfig?.tg_chat_id,
                            url: getTtydUrl(layout.pane_id, paneConfig?.token || ''),
                          });
                        }}
                        className="mr-1"
                        title="Edit pane"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePaneMinimize(layout.pane_id); }}
                        className={`p-0.5 rounded transition-colors ${minimizedPanes[layout.pane_id] ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-white'}`}
                        title={minimizedPanes[layout.pane_id] ? 'Maximize' : 'Minimize'}
                      >
                        {minimizedPanes[layout.pane_id] ? <Square size={11} /> : <Minus size={11} />}
                      </button>
                    </>
                    )}
                  </div>
                  {/* Terminal */}
                  {!minimizedPanes[layout.pane_id] && (
                  <div className="flex-1 relative overflow-hidden">
                    {config ? (
                      <TtydFrame
                        key={`${layout.pane_id}-${paneReloadKeys[layout.pane_id] || 0}`}
                        url={getTtydUrl(layout.pane_id, config.token)}
                        isInteractingWithOverlay={false}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-600">
                        <Loader2 size={24} className="animate-spin" />
                      </div>
                    )}
                    {/* Event mask to prevent iframe from capturing events during drag/resize */}
                    <div className={`absolute inset-0 z-10 ${isResizing || isDragging ? 'pointer-events-auto bg-black/30' : 'pointer-events-none'}`} />
                    {/* Per-pane command input */}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-1 py-1 bg-gray-900/90 border-t border-gray-700 z-20">
                      <input
                        type="text"
                        value={paneCommands[layout.pane_id] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPaneCommands(prev => ({ ...prev, [layout.pane_id]: v }));
                          savePaneDraft(layout.pane_id, v);
                          if ((paneHistoryIndex[layout.pane_id] ?? -1) === -1) {
                            setPaneDraft(prev => ({ ...prev, [layout.pane_id]: v }));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleSendToPane(layout.pane_id);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const history = paneHistory[layout.pane_id] || [];
                            if (history.length > 0) {
                              const curIdx = paneHistoryIndex[layout.pane_id] ?? -1;
                              if (curIdx === -1) {
                                setPaneDraft(prev => ({ ...prev, [layout.pane_id]: paneCommands[layout.pane_id] || '' }));
                              }
                              const newIdx = Math.min(curIdx + 1, history.length - 1);
                              setPaneHistoryIndex(prev => ({ ...prev, [layout.pane_id]: newIdx }));
                              setPaneCommands(prev => ({ ...prev, [layout.pane_id]: history[newIdx] }));
                            }
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const history = paneHistory[layout.pane_id] || [];
                            const curIdx = paneHistoryIndex[layout.pane_id] ?? -1;
                            if (curIdx > 0) {
                              const newIdx = curIdx - 1;
                              setPaneHistoryIndex(prev => ({ ...prev, [layout.pane_id]: newIdx }));
                              setPaneCommands(prev => ({ ...prev, [layout.pane_id]: history[newIdx] }));
                            } else if (curIdx === 0) {
                              setPaneHistoryIndex(prev => ({ ...prev, [layout.pane_id]: -1 }));
                              setPaneCommands(prev => ({ ...prev, [layout.pane_id]: paneDraft[layout.pane_id] || '' }));
                            }
                          }
                        }}
                        placeholder="cmd..."
                        disabled={paneSending[layout.pane_id]}
                        className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
                      />
                      <button
                        onClick={() => handleSendToPane(layout.pane_id)}
                        disabled={!paneCommands[layout.pane_id]?.trim() || paneSending[layout.pane_id]}
                        className="p-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white"
                      >
                        {paneSending[layout.pane_id] ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              </Rnd>
            );
          })
        )}
      </div>

      {/* Pane Picker */}
      {showPicker && (
        <PanePicker
          panes={tmuxPanes}
          ttydConfigs={ttydConfigs}
          currentPaneIds={layouts.map(l => l.pane_id)}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Edit pane dialog */}
      <EditPaneDialog
        open={!!editingPane}
        pane={editingPane}
        mode="full"
        onChange={setEditingPane}
        onClose={() => setEditingPane(null)}
        onSave={handleSavePaneTitle}
        onRestart={() => { handleRestartPane(); }}
        onDelete={() => { handleDeletePane(); }}
      />

      {/* Edit group modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => setEditingGroup(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-white">Edit Group</h3>
              <button onClick={() => setEditingGroup(null)} className="p-1 rounded text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Group Name</label>
                <input
                  type="text"
                  value={editingGroup.name}
                  onChange={e => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  placeholder="Enter group name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea
                  value={editingGroup.description}
                  onChange={e => setEditingGroup({ ...editingGroup, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Enter group description (optional)"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditingGroup(null)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGroup}
                  className="flex-1 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capture output dialog - full page */}
      {captureOutput !== null && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col" onClick={() => setCaptureOutput(null)}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-sm font-semibold text-white">Pane Output: {activePane}</span>
            <button onClick={() => setCaptureOutput(null)} className="p-1 rounded text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <pre className="flex-1 overflow-auto p-4 text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-black" onClick={e => e.stopPropagation()}>
            {captureOutput || '(empty)'}
          </pre>
        </div>
      )}

      {/* Corrected English dialog */}
      {correctedText !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => setCorrectedText(null)}>
          <div className="bg-gray-900 border border-purple-700/50 rounded-lg shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-400" />
                <span className="text-sm font-semibold text-white">Corrected Text</span>
              </div>
              <button onClick={() => setCorrectedText(null)} className="p-1 rounded text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-white whitespace-pre-wrap mb-4">{correctedText}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCorrectedText(null)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUseCorrectedText}
                  className="flex-1 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-500 transition-colors flex items-center justify-center gap-1"
                >
                  <Check size={14} /> Use This
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
