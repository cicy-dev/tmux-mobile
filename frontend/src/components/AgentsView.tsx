import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { getApiUrl } from '../services/apiUrl';

interface Agent {
  id: number;
  name: string;
  status: string;
}

interface AgentsViewProps {
  paneId: string;
  token: string | null;
}

export const AgentsView: React.FC<AgentsViewProps> = ({ paneId, token }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  useEffect(() => {
    fetchAgents();
    fetchAllAgents();
  }, [paneId]);

  const fetchAgents = async () => {
    try {
      const res = await fetch(getApiUrl(`/api/agents/pane/${paneId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAgents = async () => {
    try {
      const res = await fetch(getApiUrl('/api/tmux/list'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllAgents(data);
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
      }
    } catch (err) {
      console.error('Failed to add agent:', err);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 p-4">
      <h2 className="text-lg font-semibold text-white mb-4">Bound Agents</h2>
      
      <div className="flex gap-2 mb-4">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select an agent...</option>
          {allAgents.map(agent => (
            <option key={agent.name} value={agent.name}>{agent.name}</option>
          ))}
        </select>
        <button
          onClick={handleAddAgent}
          disabled={!selectedAgent}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto">
        {agents.length === 0 ? (
          <p className="text-gray-500 text-sm">No agents bound to this pane</p>
        ) : (
          agents.map(agent => (
            <div key={agent.id} className="bg-gray-800 border border-gray-700 rounded p-3 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{agent.name}</p>
                <p className="text-xs text-gray-400">{agent.status}</p>
              </div>
              <button
                onClick={() => handleRemoveAgent(agent.id)}
                className="text-red-400 hover:text-red-300 p-2"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
