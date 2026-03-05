import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { getApiUrl } from '../services/apiUrl';

interface AgentControlsProps {
  paneId: string;
  token: string;
  boundAgents?: string[];
  onAgentAdded?: () => void;
}

export const AgentControls: React.FC<AgentControlsProps> = ({ paneId, token, boundAgents = [], onAgentAdded }) => {
  const [allAgents, setAllAgents] = useState<Array<{ pane_id: string; title?: string }>>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchAllAgents();
  }, [paneId]);

  const fetchAllAgents = async () => {
    try {
      const res = await fetch(getApiUrl('/api/tmux/panes'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Fetched agents:', data);
        setAllAgents(Array.isArray(data) ? data : (data.panes || []));
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
        const newAgent = await res.json();
        setSelectedAgent('');
        // 触发事件并携带新 agent 信息
        window.dispatchEvent(new CustomEvent('addAgent', { detail: { 
          id: newAgent.id, 
          name: selectedAgent, 
          status: newAgent.status || 'active',
          title: selectedAgent
        }}));
        onAgentAdded?.();
      } else {
        const error = await res.json();
        // 如果已经绑定，提示用户
        if (error.detail?.includes('already bound')) {
          alert(`This agent is already bound. Please unbind it first or refresh the page.`);
        } else {
          alert(`Failed to add agent: ${error.detail || 'Unknown error'}`);
        }
      }
    } catch (err) {
      alert(`Error: ${err}`);
    }
  };

  const handleNewAgent = async () => {
    if (!confirm('Create a new agent?')) return;
    setIsCreating(true);
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
        const bindRes = await fetch(getApiUrl('/api/agents/bind'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pane_id: paneId, agent_name: data.pane_id })
        });
        if (bindRes.ok) {
          const newAgent = await bindRes.json();
          await fetchAllAgents();
          // 触发事件并携带新 agent 信息
          window.dispatchEvent(new CustomEvent('addAgent', { detail: { 
            id: newAgent.id, 
            name: data.pane_id, 
            status: newAgent.status || 'active',
            title: `SubAgent(${paneId})`
          }}));
          onAgentAdded?.();
        } else {
          alert(`Failed to bind: ${await bindRes.text()}`);
        }
      } else {
        alert(`Failed: ${data.detail || data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-vsc-bg border border-vsc-border rounded p-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-vsc-text border-t-transparent"></div>
            <span className="text-vsc-text">Creating agent...</span>
          </div>
        </div>
      )}
      <div className="flex gap-2 items-center">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="bg-vsc-bg border border-vsc-border text-vsc-text px-2 py-0.5 rounded text-xs max-w-[120px]"
        >
          <option value="">Select agent</option>
          {allAgents.filter(a => a.pane_id !== paneId && !boundAgents.includes(a.pane_id)).map(agent => (
            <option key={agent.pane_id} value={agent.pane_id}>
              {agent.title || agent.pane_id}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddAgent}
          disabled={!selectedAgent}
          className="bg-vsc-button hover:bg-vsc-button-hover disabled:bg-vsc-bg-active disabled:cursor-not-allowed text-white px-2 py-0.5 rounded flex items-center gap-1 text-xs"
        >
          <Plus size={12} /> Bind
        </button>
        <button
          onClick={handleNewAgent}
          className="bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded flex items-center gap-1 text-xs"
        >
          <Plus size={12} /> New Agent
        </button>
      </div>
    </>
  );
};
