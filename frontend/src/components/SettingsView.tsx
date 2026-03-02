import React, { useState } from 'react';
import { EditPaneData } from './EditPaneDialog';
import { Loader2 } from 'lucide-react';

interface SettingsViewProps {
  pane: EditPaneData;
  onChange: (pane: EditPaneData) => void;
  onSave: () => void;
  isSaving?: boolean;
}

const tabs = ['General', 'Agent', 'Config', 'Telegram'] as const;
type Tab = typeof tabs[number];

export const SettingsView: React.FC<SettingsViewProps> = ({ pane, onChange, onSave, isSaving = false }) => {
  const [tab, setTab] = useState<Tab>('General');

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex border-b border-gray-700 px-4 flex-shrink-0">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >{t}</button>
        ))}
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        {tab === 'General' && (<>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input type="text" value={pane.title}
              onChange={e => onChange({ ...pane, title: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
              placeholder="Enter pane title" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Auto-start</p>
              <p className="text-xs text-gray-500">Auto restore on server restart</p>
            </div>
            <div className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${pane.active !== false ? 'bg-green-600' : 'bg-gray-700'}`}
              onClick={() => onChange({ ...pane, active: pane.active === false ? true : false })}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pane.active !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Workspace</label>
            <input type="text" value={pane.workspace || ''}
              onChange={e => onChange({ ...pane, workspace: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
              placeholder="/home/user/project" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Init Script</label>
            <textarea value={pane.init_script || ''}
              onChange={e => onChange({ ...pane, init_script: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 resize-none"
              rows={4} placeholder={"pwd\n# sleep:2\n# key:t"} />
            <p className="text-xs text-gray-600 mt-1">sleep:N waits Ns, key:X sends key</p>
          </div>
        </>)}

        {tab === 'Agent' && (<>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Agent Duty</label>
            <textarea value={pane.agent_duty || ''}
              onChange={e => onChange({ ...pane, agent_duty: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 resize-none"
              rows={6} placeholder="Describe agent's role and responsibilities..." />
          </div>
        </>)}

        {tab === 'Config' && (<>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Config (JSON)</label>
            <textarea value={pane.config || '{}'}
              onChange={e => onChange({ ...pane, config: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 resize-none"
              rows={12} placeholder='{"previewUrls": ["https://example.com"]}' />
            <div className="text-xs text-gray-500 mt-2 space-y-1">
              <p className="font-medium text-gray-400">Example:</p>
              <pre className="bg-gray-800 border border-gray-700 rounded p-2 overflow-x-auto">{`{
  "previewUrls": [
    {"name": "Homepage", "url": "https://example.com"},
    {"name": "Dashboard", "url": "https://dashboard.example.com"}
  ],
  "proxy": {
    "enable": true,
    "url": "https://proxy.example.com"
  }
}`}</pre>
            </div>
          </div>
        </>)}

        {tab === 'Telegram' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Enable Telegram</label>
              <input type="checkbox" checked={pane.tg_enable || false}
                onChange={(e) => onChange({ ...pane, tg_enable: e.target.checked })}
                className="w-4 h-4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Bot Token</label>
              <input type="text" value={pane.tg_token || ''} 
                onChange={(e) => onChange({ ...pane, tg_token: e.target.value })}
                className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" 
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Chat ID</label>
              <input type="text" value={pane.tg_chat_id || ''} 
                onChange={(e) => onChange({ ...pane, tg_chat_id: e.target.value })}
                className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" 
                placeholder="-1001234567890" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-700 flex-shrink-0">
        <button onClick={onSave} disabled={isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded transition-colors flex items-center justify-center gap-2">
          {isSaving && <Loader2 size={16} className="animate-spin" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};
