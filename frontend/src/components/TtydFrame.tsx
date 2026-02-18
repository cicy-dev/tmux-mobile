import React from 'react';
import { getTtydUrl } from '../services/apiUrl';

interface TtydFrameProps {
  paneId: string;
  port: number;
  token: string;
  token2: string;
  isInteractingWithOverlay: boolean;
}

export const TtydFrame: React.FC<TtydFrameProps> = ({ paneId, token, isInteractingWithOverlay }) => {
  const ttydUrl = getTtydUrl(paneId, token);

  return (
    <div className="absolute inset-0 z-0 bg-black overflow-hidden">
      <iframe
        src={ttydUrl}
        title="ttyd"
        className={`w-full h-full border-none absolute inset-0 ${isInteractingWithOverlay ? 'pointer-events-none opacity-90' : 'pointer-events-auto opacity-100'}`}
        allowFullScreen
      />
    </div>
  );
};
