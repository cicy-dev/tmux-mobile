import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../services/apiUrl';

interface AgentsRightViewProps {
  token: string;
  onAddAgent: (paneId: string, title:string,url: string) => void;
  existingTabs: string[];
}

interface Agent {
  pane_id: string;
  status?: string;
  title?: string;
  [key: string]: any;
}

export const AgentsRightView: React.FC<AgentsRightViewProps> = ({ token, onAddAgent, existingTabs }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Load from cache first
    const cached = localStorage.getItem('agents_cache');
    if (cached) {
      try {
        setAgents(JSON.parse(cached));
      } catch (e) {
        console.error('Failed to parse cache:', e);
      }
    }
    
    setLoading(false);

    // Fetch from API
    fetch(getApiUrl('/api/tmux/status/all'), {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        console.log('API response:', data);
        const agentsList = Object.values(data);
        setAgents(agentsList);
        localStorage.setItem('agents_cache', JSON.stringify(agentsList));
      })
      .catch(err => {
        console.error('Failed to fetch:', err);
      });
  }, [token]);

  const filteredAgents = agents
    .filter(agent => !existingTabs.includes(agent.pane_id))
    .filter(agent => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (agent.title?.toLowerCase().includes(s)) || 
             (agent.pane_id?.toLowerCase().includes(s));
    });

  const handleAgentClick = (agent: Agent) => {
    const url = `https://ttyd-proxy.cicy.de5.net/ttyd/${agent.pane_id}/?token=${token}&mode=1`;
    onAddAgent(agent.pane_id,agent.title, url);
  };

  return (
    <div className="absolute inset-0 bg-vsc-bg/95 backdrop-blur-sm z-50 overflow-auto">
      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-vsc-text-secondary">Loading agents...</div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-vsc-text-secondary mb-2">No available agents</div>
            <div className="text-xs text-vsc-text-muted">All agents are already open</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="flex-shrink-0 p-4 border-b border-vsc-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full px-3 py-2 bg-vsc-bg-secondary border border-vsc-border rounded text-sm text-vsc-text placeholder-vsc-text-muted focus:outline-none focus:border-vsc-button"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-4xl mx-auto space-y-2">
              {filteredAgents.map((agent, idx) => (
                <div 
                  key={agent.pane_id || idx}
                  onClick={() => handleAgentClick(agent)}
                  className="group flex items-center gap-3 bg-vsc-bg-secondary border border-vsc-border rounded-lg p-3 cursor-pointer hover:border-vsc-button hover:bg-vsc-bg-hover transition-all"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${agent.status === 'idle' ? 'bg-green-500' : agent.status === 'thinking' ? 'bg-yellow-500' : 'bg-gray-500'}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-vsc-text truncate">
                      {agent.title || agent.pane_id || 'unknown'}
                    </div>
                    <div className="text-xs text-vsc-text-muted truncate">{agent.pane_id}</div>
                  </div>
                  <div className="text-xs text-vsc-text-secondary flex-shrink-0">
                    {agent.status || 'unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
