import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Inter empacotada no build — PWA offline-first não depende de fonte externa
// (e a CSP não precisa abrir buraco pro fonts.googleapis.com).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { App } from '@/app/App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root não encontrado');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
