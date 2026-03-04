export const API_BASE = "https://g-fast-api.cicy.de5.net"
export const TTYD_BASE = "https://ttyd-proxy.cicy.de5.net"
export const TTYD_WEB_BASE = 'https://ide.cicy.de5.net';

export const config = {
  apiBase: API_BASE,
  ttydBase: TTYD_BASE,
  ttydWebBase: TTYD_WEB_BASE,
};

export const API_PATHS = {
  TMUX_LIST: '/api/tmux',
  TMUX_CREATE: '/api/tmux/create',
  TMUX_SEND: '/api/tmux/send',
  TMUX_CAPTURE: '/api/tmux/capture_pane',
  TMUX_PANE: (paneId: string) => `/api/tmux/panes/${encodeURIComponent(paneId)}`,
  TMUX_PANE_RESTART: (paneId: string) => `/api/tmux/panes/${encodeURIComponent(paneId)}/restart`,
  TMUX_MOUSE_TOGGLE: (action: 'on' | 'off') => `/api/tmux/mouse/${action}`,
  TMUX_MOUSE_STATUS: '/api/tmux/mouse/status',
  
  TTYD_LIST: '/api/ttyd/list',
  TTYD_START: (paneId: string) => `/api/ttyd/start/${encodeURIComponent(paneId)}`,
  TTYD_CONFIG: (paneId: string) => `/api/ttyd/config/${encodeURIComponent(paneId)}`,
  
  GROUPS: '/api/groups',
  GROUP: (groupId: number) => `/api/groups/${groupId}`,
  GROUP_LAYOUT: (groupId: number) => `/api/groups/${groupId}/layout`,
  GROUP_STATE: (groupId: number) => `/api/groups/${groupId}/state`,
  GROUP_PANES: (groupId: number) => `/api/groups/${groupId}/panes`,
  GROUP_PANE_LAYOUT: (groupId: number, paneId: string) => `/api/groups/${groupId}/panes/${encodeURIComponent(paneId)}/layout`,
  
  AUTH_VERIFY: '/api/auth/verify',
  HEALTH: '/api/health',
  REFRESH_CACHE: '/api/refresh-cache',
  KEY: '/api/key',
  CORRECT_ENGLISH: '/api/correctEnglish',
};

export const getApiUrl = (path: string) => {
  if (path.startsWith('/ttyd/') && !path.startsWith('/ttyd/status')) {
    return TTYD_BASE + path;
  }
  return API_BASE + path;
};

export const getTtydUrl = (paneId: string, token: string) => {
  return `${TTYD_BASE}/ttyd/${paneId}/?token=${token}`;
};

export const getTtydWebUrl = (paneId: string, token: string) => {
  return `${TTYD_WEB_BASE}/?token=${token}&bot_name=${paneId}`;
};

export const apiFetch = async (url: string, options?: RequestInit) => {
  const fullUrl = url.startsWith('http') ? url : getApiUrl(url);
  return fetch(fullUrl, options);
};
