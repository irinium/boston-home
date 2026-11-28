// Composition root: the only place that knows about Supabase and the browser environment.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AuthService } from './application/authService';
import { ModerationService } from './application/moderationService';
import { detectLanguage } from './i18n/i18n';
import { SupabaseAuthGateway } from './infrastructure/supabaseAuthGateway';
import { createSupabasePorts } from './infrastructure/supabaseClient';
import { SupabaseModerationGateway } from './infrastructure/supabaseModerationGateway';
import { App } from './ui/App';
import './ui/styles.css';

const ports = createSupabasePorts(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const services = {
  moderation: new ModerationService(new SupabaseModerationGateway(ports.rpc)),
  auth: new AuthService(new SupabaseAuthGateway(ports.auth, ports.rpc)),
};

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App services={services} initialLanguage={detectLanguage(navigator.languages)} />
  </StrictMode>,
);
