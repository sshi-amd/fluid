import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppProvider } from './context/AppContext';
import { BuildQueueProvider } from './context/BuildQueueContext';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <BuildQueueProvider>
        <App />
      </BuildQueueProvider>
    </AppProvider>
  </React.StrictMode>
);
