const API_BASE = import.meta.env.VITE_API_URL || '';
const TTYD_BASE = import.meta.env.VITE_TTYD_URL || '';
const TTYD_WEB_BASE = import.meta.env.VITE_TTYD_WEB_URL || '';

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
