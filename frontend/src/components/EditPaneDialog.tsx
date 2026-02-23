import React from 'react';
import { X, RefreshCw } from 'lucide-react';

export interface EditPaneData {
  target: string;
  title: string;
  workspace?: string;
  active?: boolean;
  init_script?: string;
  proxy?: string;
  tg_enable?: boolean;
  tg_token?: string;
  tg_chat_id?: string;
  url?: string;
}

interface EditPaneDialogProps {
  open: boolean;
  pane: EditPaneData | null;
  mode?: 'simple' | 'full';
  onChange: (pane: EditPaneData) => void;
  onClose: () => void;
  onSave: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
}

export const EditPaneDialog: React.FC<EditPaneDialogProps> = ({
  open,
  pane,
  mode = 'simple',
  onChange,
  onClose,
  onSave,
  onRestart,
  onDelete,
}) => {
  if (!open || !pane) return null;

  const isFull = mode === 'full';

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col" onClick={onClose}>
      <div
        className="bg-gray-900 w-full h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-white">Edit Pane</h3>
            <p className="text-xs text-gray-500 font-mono">{pane.target}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={pane.title}
              onChange={e => onChange({ ...pane, title: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
              placeholder="Enter pane title"
              autoFocus={!isFull}
            />
          </div>

          {isFull && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Auto-start</p>
                  <p className="text-xs text-gray-500">Auto restore on server restart</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${pane.active !== false ? 'bg-green-600' : 'bg-gray-700'}`}
                    onClick={() => onChange({ ...pane, active: pane.active === false ? true : false })}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pane.active !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Workspace</label>
                <input
                  type="text"
                  value={pane.workspace || ''}
                  onChange={e => onChange({ ...pane, workspace: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  placeholder="/home/user/project"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Init Script</label>
                <textarea
                  value={pane.init_script || ''}
                  onChange={e => onChange({ ...pane, init_script: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 resize-none"
                  rows={4}
                  placeholder="pwd&#10;# sleep:2&#10;# key:t"
                />
                <p className="text-xs text-gray-600 mt-1">sleep:N waits Ns, key:X sends key</p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">HTTP Proxy</label>
                <input
                  type="text"
                  value={pane.proxy || ''}
                  onChange={e => onChange({ ...pane, proxy: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                  placeholder="http://proxy:8080"
                />
              </div>

              <div className="pt-2 border-t border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Telegram Notifications</span>
                  <label className="flex items-center cursor-pointer">
                    <div
                      className={`relative w-8 h-4 rounded-full transition-colors ${pane.tg_enable ? 'bg-purple-600' : 'bg-gray-700'}`}
                      onClick={() => onChange({ ...pane, tg_enable: !pane.tg_enable })}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${pane.tg_enable ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </div>
                <div className={`space-y-2 ${pane.tg_enable ? '' : 'opacity-40 pointer-events-none'}`}>
                  <input
                    type="text"
                    value={pane.tg_token || ''}
                    onChange={e => onChange({ ...pane, tg_token: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2 py-1 focus:outline-none focus:border-purple-500"
                    placeholder="Bot Token"
                  />
                  <input
                    type="text"
                    value={pane.tg_chat_id || ''}
                    onChange={e => onChange({ ...pane, tg_chat_id: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-600 text-white text-sm font-mono rounded px-2 py-1 focus:outline-none focus:border-purple-500"
                    placeholder="Chat ID"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
          {onRestart && (
            <button
              onClick={() => { if (confirm(`Restart ${pane.target}?`)) onRestart(); }}
              className="px-3 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-500 transition-colors flex items-center gap-1"
            >
              <RefreshCw size={14} /> Restart
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => { if (confirm(`Delete ${pane.target}?`)) { onDelete(); onClose(); } }}
              className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-500 transition-colors flex items-center gap-1"
            >
              <X size={14} /> Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
