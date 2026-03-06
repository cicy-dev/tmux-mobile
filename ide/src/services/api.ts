import { getApiUrl } from './apiUrl';

class ApiClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = getApiUrl(endpoint);
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Agents
  async getAgents() {
    return this.request('/api/tmux/status/all');
  }

  async createAgent(data: { win_name: string; workspace: string; init_script: string }) {
    return this.request('/api/tmux/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(paneId: string) {
    return this.request(`/api/tmux/panes/${paneId}`, { method: 'DELETE' });
  }

  async unbindAgent(agentId: number) {
    return this.request(`/api/agents/unbind/${agentId}`, { method: 'DELETE' });
  }

  async bindAgent(paneId: string, agentName: string) {
    return this.request('/api/agents/bind', {
      method: 'POST',
      body: JSON.stringify({ pane_id: paneId, agent_name: agentName }),
    });
  }

  async restartAgent(paneId: string) {
    return this.request(`/api/tmux/panes/${paneId}/restart`, { method: 'POST' });
  }

  async toggleMouse(paneId: string) {
    return this.request(`/api/tmux/mouse/toggle?pane_id=${encodeURIComponent(paneId)}`, {
      method: 'POST',
    });
  }

  // Panes
  async getPanes() {
    return this.request('/api/tmux/panes');
  }

  async getPane(paneId: string) {
    return this.request(`/api/tmux/panes/${paneId}`);
  }

  async getPaneConfig(paneId: string) {
    return this.request(`/api/ttyd/config/${paneId}`);
  }

  async updatePaneConfig(paneId: string, config: any) {
    return this.request(`/api/ttyd/config/${paneId}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async capturePane(paneId: string) {
    return this.request(`/api/tmux/capture?pane_id=${encodeURIComponent(paneId)}`);
  }

  // Commands
  async sendCommand(target: string, command: string) {
    return this.request('/api/tmux/send', {
      method: 'POST',
      body: JSON.stringify({ target, command }),
    });
  }

  async correctEnglish(text: string) {
    return this.request('/api/correctEnglish', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }
}

export default ApiClient;
