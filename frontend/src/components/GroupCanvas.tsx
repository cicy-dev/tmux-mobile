import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { ArrowLeft, Grid, Move, Users, X, Send, RefreshCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { TtydGroupDetail } from '../types';
import { TtydFrame } from './TtydFrame';
import { PanePicker } from './PanePicker';
import { calculateAutoGrid } from '../utils/autoGrid';
import { getApiUrl, getTtydUrl } from '../services/apiUrl';
import { sendCommandToTmux } from '../services/mockApi';

interface TtydConfig {
  name: string;
  title?: string;
  port: number;
  token: string;
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
  const [editingPane, setEditingPane] = useState<{ target: string; title: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{ name: string; description: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'restart' | 'delete'; target: string; title: string } | null>(null);
  const [paneCommands, setPaneCommands] = useState<Record<string, string>>({});
  const [paneSending, setPaneSending] = useState<Record<string, boolean>>({});

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
        body: JSON.stringify({ title: editingPane.title }),
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
    if (!confirmAction || !token) return;
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(confirmAction.target)}/restart`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmAction(null);
    } catch (e) { console.error(e); }
  };

  const handleDeletePane = async () => {
    if (!confirmAction || !token) return;
    try {
      await fetch(getApiUrl(`/api/tmux/panes/${encodeURIComponent(confirmAction.target)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfirmAction(null);
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
            return (
              <Rnd
                key={layout.pane_id}
                position={{ x: layout.pos_x, y: layout.pos_y }}
                size={{ width: layout.width, height: layout.height }}
                onDragStart={() => { setActivePane(layout.pane_id); setIsDragging(true); }}
                onDragStop={(_e, d) => handleDragStop(layout.pane_id, d)}
                onResizeStart={() => setIsResizing(true)}
                onResizeStop={(_e, dir, ref, delta, pos) =>
                  handleResizeStop(layout.pane_id, _e, dir, ref, delta, pos)
                }
                minWidth={200}
                minHeight={150}
                bounds="parent"
                dragHandleClassName="drag-handle"
                style={{ zIndex: activePane === layout.pane_id ? 1000 : layout.z_index, overflow: 'hidden', borderRadius: '8px' }}
              >
                <div className={`flex flex-col w-full h-full overflow-hidden shadow-xl bg-black ${activePane === layout.pane_id ? 'ring-2 ring-purple-500 border border-purple-500 shadow-lg shadow-purple-900/30' : 'border border-gray-700'}`} onClick={() => setActivePane(layout.pane_id)}>
                  {/* TipBar (drag handle) */}
                  <div
                    className={`drag-handle flex items-center justify-between px-2 h-7 border-b flex-shrink-0 cursor-move select-none transition-colors group/titlebar ${
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
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingPane({ target: layout.pane_id, title: paneTitles[layout.pane_id] }); }}
                      className="opacity-0 group-hover/titlebar:opacity-100 p-1 rounded text-gray-300 hover:text-white hover:bg-gray-600 transition-all flex-shrink-0"
                      title="Edit pane"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                    </button>
                    )}
                  </div>
                  {/* Terminal */}
                  <div className="flex-1 relative overflow-hidden">
                    {config ? (
                      <TtydFrame
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
                        onChange={(e) => setPaneCommands(prev => ({ ...prev, [layout.pane_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendToPane(layout.pane_id); }}
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
                </div>
              </Rnd>
            );
          })
        )}
      </div>

      {/* Edit pane modal */}
      {editingPane && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => setEditingPane(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-white">Edit Pane Title</h3>
              <button onClick={() => setEditingPane(null)} className="p-1 rounded text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Pane ID</label>
                <p className="text-xs text-gray-500 font-mono">{editingPane.target}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editingPane.title}
                  onChange={e => setEditingPane({ ...editingPane, title: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  placeholder="Enter pane title"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    if (confirm(`Restart ${editingPane.target}?`)) {
                      handleRestartPane();
                    }
                  }}
                  className="px-3 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-500 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={14} /> Restart
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${editingPane.target}?`)) {
                      handleDeletePane();
                      setEditingPane(null);
                    }
                  }}
                  className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-500 transition-colors flex items-center gap-1"
                >
                  <X size={14} /> Delete
                </button>
                <button
                  onClick={() => setEditingPane(null)}
                  className="flex-1 py-2 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePaneTitle}
                  className="flex-1 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};
