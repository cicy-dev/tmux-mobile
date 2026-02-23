import { getApiUrl } from './apiUrl';

const getToken = () => {
  const stored = localStorage.getItem('token');
  if (stored) return stored;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('token') || '';
};
const authHeaders = () => ({ 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + getToken() });

// 发送命令到 tmux
export const sendCommandToTmux = async (command: string, tmuxTarget: string): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(getApiUrl('/api/tmux/send'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ win_id: tmuxTarget, text: command }),
  });
  const data = await res.json();
  
  if (data.success) {
    await fetch(getApiUrl('/api/tmux/send'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ win_id: tmuxTarget, keys: 'Enter' }),
    });
  }
  
  return { success: data.success, message: data.success ? 'Sent to tmux' : data.detail };
};

// 转发快捷键
export const sendShortcut = async (key: string, target?: string): Promise<void> => {
  await fetch(getApiUrl('/api/key'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ key, target }),
  }).catch(() => {});
};
