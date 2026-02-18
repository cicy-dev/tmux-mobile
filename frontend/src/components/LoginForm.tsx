import React from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { getApiUrl } from '../services/apiUrl';

interface LoginFormProps {
  onLogin: (token: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = document.querySelector('#login-token-input') as HTMLInputElement;
    const tokenValue = input?.value?.trim() || '';
    
    if (!tokenValue) return;

    try {
      const res = await fetch(getApiUrl('/api/auth/verify'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenValue}`, 'Accept': 'application/json' }
      });

      if (res.ok) {
        localStorage.setItem('token', tokenValue);
        onLogin(tokenValue);
      } else {
        alert('Invalid token');
      }
    } catch (err) {
      alert('Connection failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
            <Lock size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">VNC Proxy</h1>
          <p className="text-gray-400 text-sm mt-2">Enter your access token</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Access Token</label>
            <input
              id="login-token-input"
              type="password"
              placeholder="Enter your token..."
              className="w-full bg-black border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Login
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          Contact your administrator for access
        </div>
      </div>
    </div>
  );
};
