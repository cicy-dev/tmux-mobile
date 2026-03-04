import React, { ReactNode } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface IframeTopbarProps {
  title: string;
  workspace?: string;
  proxy?: string;
  networkLatency: number | null;
  networkStatus: 'excellent' | 'good' | 'poor' | 'offline';
  rightActions?: ReactNode;
}

export const IframeTopbar: React.FC<IframeTopbarProps> = ({
  title,
  workspace,
  proxy,
  networkLatency,
  networkStatus,
  rightActions,
}) => {
  return (
    <div className="absolute top-0 left-0 right-0 h-10 bg-vsc-bg-titlebar/80 backdrop-blur-sm border-b border-vsc-border-subtle flex items-center justify-between px-3 z-30">
      <div className="flex items-center gap-2 min-w-0 mr-2">
        <span className="text-xs text-white font-medium truncate">{title}</span>
        {workspace && (
          <span className="text-xs text-vsc-text-secondary truncate">📁 {workspace}</span>
        )}
        {proxy && (
          <span className="text-xs text-orange-400 truncate hidden md:block" title={`Proxy: ${proxy}`}>🌐 proxy</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded"
          title={networkLatency !== null ? `Latency: ${networkLatency}ms` : 'Offline'}
        >
          {networkStatus === 'excellent' && <Wifi size={12} className="text-green-400" />}
          {networkStatus === 'good' && <Wifi size={12} className="text-yellow-400" />}
          {networkStatus === 'poor' && <Wifi size={12} className="text-orange-400" />}
          {networkStatus === 'offline' && <WifiOff size={12} className="text-red-400" />}
          <span className="text-xs text-vsc-text-muted font-mono">
            {networkLatency !== null ? `${networkLatency}ms` : 'offline'}
          </span>
        </div>
        {rightActions}
      </div>
    </div>
  );
};
