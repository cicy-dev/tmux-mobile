import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, RotateCw, ExternalLink } from 'lucide-react';
import { API_BASE, getApiUrl } from '../services/apiUrl';

interface Agent {
  id: number;
  name: string;
  status: string;
  title?: string;
}

interface AgentsListViewProps {
  paneId: string;
  token: string | null;
  ttydPreview?: string;
  isDragging?: boolean;
  onAgentsChange?: (agents: string[]) => void;
  onCaptureOpen?: (isOpen: boolean) => void;
}

export const AgentsListView: React.FC<AgentsListViewProps> = ({ paneId, token, ttydPreview, isDragging, onAgentsChange, onCaptureOpen }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [iframeKeys, setIframeKeys] = useState<Record<string, number>>({});
  const [heights, setHeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(`${paneId}_agentHeights`);
    return saved ? JSON.parse(saved) : {};
  });
  const [resizing, setResizing] = useState<string | null>(null);
  const [startHeight, setStartHeight] = useState<number>(0);
  const [startY, setStartY] = useState<number>(0);

  useEffect(() => {
    fetchAllAgents();
  }, [paneId]);

  useEffect(() => {
    if (allAgents.length > 0) {
      fetchAgents();
    }
  }, [paneId, allAgents.length]);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/agents/pane/${paneId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Fetch titles from allAgents
        const agentsWithTitles = data.map((agent: Agent) => {
          const agentInfo = allAgents.find(a => a.pane_id === agent.name);
          return { ...agent, title: agentInfo?.title || agent.name };
        });
        setAgents(agentsWithTitles);
        onAgentsChange?.(data.map((a: Agent) => a.name));
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAgents = async () => {
    try {
      const res = await fetch(getApiUrl('/api/ttyd/list'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllAgents(data.configs || data);
      }
    } catch (err) {
      console.error('Failed to fetch all agents:', err);
    }
  };

  const handleAddAgent = async () => {
    if (!selectedAgent) return;
    try {
      const res = await fetch(getApiUrl('/api/agents/bind'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pane_id: paneId, agent_name: selectedAgent })
      });
      if (res.ok) {
        fetchAgents();
        setSelectedAgent('');
      } else {
        const error = await res.json();
        console.error('Failed to add agent:', error);
        alert(`Failed to add agent: ${error.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to add agent:', err);
      alert(`Error: ${err}`);
    }
  };

  const handleRemoveAgent = async (agentId: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/agents/unbind/${agentId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAgents();
      }
    } catch (err) {
      console.error('Failed to remove agent:', err);
    }
  };

  const handleReloadIframe = (agentName: string) => {
    setIframeKeys(prev => ({ ...prev, [agentName]: (prev[agentName] || 0) + 1 }));
  };


  const handleMouseDown = (agentName: string, e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(agentName);
    setStartY(e.clientY);
    setStartHeight(heights[agentName] || 150);
  };

  useEffect(() => {
    if (resizing === null) return;

    let currentHeight = startHeight;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - startY;
      const newHeight = Math.max(200, startHeight + delta);
      currentHeight = newHeight;
      setHeights(prev => ({ ...prev, [resizing]: newHeight }));
    };

    const handleMouseUp = () => {
      if (resizing !== null) {
        setHeights(prev => {
          const newHeights = { ...prev, [resizing]: currentHeight };
          localStorage.setItem(`${paneId}_agentHeights`, JSON.stringify(newHeights));
          return newHeights;
        });
      }
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, startY, startHeight]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 p-3">
      <div className="flex gap-2 mb-3">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="w-64 bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select an agent...</option>
          {allAgents
            .filter(agent => agent.pane_id !== paneId && agent.pane_id !== ttydPreview && !agents.find(a => a.name === agent.pane_id))
            .map(agent => (
              <option key={agent.pane_id} value={agent.pane_id}>{agent.title || agent.pane_id}</option>
            ))}
        </select>
        <button
          onClick={handleAddAgent}
          disabled={!selectedAgent}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-3 py-1 rounded flex items-center gap-1 text-sm"
        >
          <Plus size={14} /> Add
        </button>
        <button
          onClick={async () => {
            try {
              const res = await fetch(getApiUrl('/api/tmux/create'), {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  win_name: `SubAgent(${paneId})`,
                  workspace: '',
                  init_script: 'pwd'
                })
              });
              const data = await res.json();
              if (res.ok && data.pane_id) {
                await fetch(getApiUrl('/api/agents/bind'), {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ pane_id: paneId, agent_name: data.pane_id })
                });
                fetchAgents();
                fetchAllAgents();
              } else {
                alert(`Failed: ${data.detail || data.error || 'Unknown error'}`);
              }
            } catch (err) {
              console.error(err);
              alert(`Error: ${err}`);
            }
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded flex items-center gap-1 text-sm"
        >
          <Plus size={14} /> New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">No agents bound</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 h-full overflow-auto">
          {agents.filter(a => a.name !== ttydPreview).map(agent => (
            <div 
              key={agent.id} 
              className="bg-gray-800 border border-gray-700 rounded relative" 
              style={{height: `${heights[agent.name] || 150}px`}}
              onMouseLeave={(e) => {
                const target = e.currentTarget.querySelector('.ttyd-mask') as HTMLElement;
                if (target) target.style.display = 'block';
              }}
            >
              {resizing !== null && (
                <div className="absolute inset-0 z-20 bg-transparent" />
              )}
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-gray-900/80 rounded p-1">
                <span className="text-white text-sm font-medium px-2 py-1">
                  {agent.title || agent.name.replace(':main.0', '')}
                </span>
                <button
                  onClick={() => window.open(`https://ttyd-dev.cicy.de5.net/ttyd/${agent.name}/?token=${token}&mode=ttyd`, '_blank')}
                  className="text-green-400 hover:text-green-300 bg-gray-900/80 p-1 rounded"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => handleReloadIframe(agent.name)}
                  className="text-blue-400 hover:text-blue-300 bg-gray-900/80 p-1 rounded"
                >
                  <RotateCw size={14} />
                </button>
                <button
                  onClick={() => handleRemoveAgent(agent.id)}
                  className="text-red-400 hover:text-red-300 bg-gray-900/80 p-1 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <iframe
                loading="lazy"
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                key={iframeKeys[agent.name] || 0}
                src={`https://ttyd-proxy.cicy.de5.net/ttyd/${agent.name}/?token=${token}&mode=1`}
                className="w-full h-full rounded align-top"
                style={{verticalAlign: 'top'}}
              />
              <div 
                className="ttyd-mask absolute inset-0 bg-transparent"
                style={{display: 'none', pointerEvents: 'auto'}}
                onClick={(e) => {
                  window.dispatchEvent(new CustomEvent('selectPane', { detail: { paneId: agent.name } }));
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              {isDragging && <div className="absolute inset-0 z-20"></div>}
              <div
                onMouseDown={(e) => handleMouseDown(agent.name, e)}
                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-500/20 transition-colors"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
