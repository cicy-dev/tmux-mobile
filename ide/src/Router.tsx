import React from 'react';
import SinglePaneApp from './SinglePaneApp';
import { AppProvider } from './contexts/AppContext';

export const Router: React.FC = () => {
  return (
    <AppProvider>
      <SinglePaneApp />
    </AppProvider>
  );
};
