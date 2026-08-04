import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App.js';
import { AuthProvider } from '@/cloud/AuthProvider';
import CloudSync from '@/cloud/CloudSync';
import '@/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CloudSync />
      <App />
      <Analytics />
      <SpeedInsights />
    </AuthProvider>
  </StrictMode>,
);
