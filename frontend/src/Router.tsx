import React, { useState, useEffect } from 'react';
import SinglePaneApp from './SinglePaneApp';
import TelegramWebView from './TelegramWebView';
import WebTerminalApp from './WebTerminalApp';

type Route = 'telegram' | 'terminal' | 'web';

export const Router: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<Route>('telegram');
  const [isTelegramMode, setIsTelegramMode] = useState(true);

  useEffect(() => {
    // Check if token is in URL (Telegram mode)
    const urlParams = new URLSearchParams(window.location.search);
    const hasTokenParam = urlParams.has('token');
    setIsTelegramMode(hasTokenParam);

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      
      if (hash === 'terminal' || hash === 'split') {
        setCurrentRoute('terminal');
      } else if (hash === 'web') {
        setCurrentRoute('web');
      } else {
        setCurrentRoute('telegram');
      }
    };

    // Initial route detection
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return <SinglePaneApp />;
};
