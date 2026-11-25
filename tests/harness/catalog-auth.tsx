import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/oswald/latin-700.css';
import '../../src/theme/global.css';
import { theme, cssVariablesResolver } from '../../src/theme/theme';
import { AuthSessionContext } from '../../src/app/config/AuthSessionContext';
import { DataModeContext } from '../../src/app/config/DataModeContext';
import { AdminApiContext } from '../../src/app/config/AdminApiContext';
import { createAuthenticatedGatewayClient } from '../../src/app/config/authenticatedGatewayClient';
import { CatalogServicesContext } from '../../src/features/catalog/services/CatalogServicesContext';
import { createCatalogHttpServices } from '../../src/features/catalog/services/catalogHttpRuntime';
import { G7Session, type SessionView } from '../../src/features/promotions/adapters/g7Session';
import { PricingProvider } from '../../src/features/pricing/components/PricingProvider';
import { createPricingRuntime } from '../../src/features/pricing/services/pricingService';

if (!import.meta.env.DEV) throw new Error('Harness exclusivo de pruebas locales.');
const params = new URLSearchParams(location.search);
const path = params.get('path') ?? '/productos';
history.replaceState(null, '', path);
const mode = params.get('session') ?? 'valid';
const role = mode === 'wrong-role' ? 'GESTOR_TAXONOMIA' : 'GESTOR_COMERCIAL';
const tokenBytes = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const accessToken = mode === 'expired'
  ? `${tokenBytes({ alg: 'none', typ: 'JWT' })}.${tokenBytes({ sub: 'h5-synthetic-user', exp: Math.floor(Date.now() / 1000) - 60 })}.${crypto.randomUUID().replaceAll('-', '')}`
  : `h5-local-${crypto.randomUUID()}`;

const session = new G7Session(location.origin);
let view: SessionView = {
  user: { id: 'h5-synthetic-user', nombreCompleto: 'Usuario H5 sintético', correo: 'h5.user@example.invalid', roles: [role] },
  mfa: false, busy: false, notice: '', expiresAt: Date.now() + 300_000,
};
const listeners = new Set<() => void>();
session.snapshot = () => view;
session.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
session.getAccessToken = async signal => { signal.throwIfAborted(); return accessToken; };
session.refreshAccessToken = async () => null;
const clearSession = () => {
  view = { ...view, user: null, expiresAt: null, notice: 'La sesión terminó. Inicia sesión de nuevo.' };
  for (const listener of listeners) listener();
};
session.invalidateAccessToken = clearSession;
session.logout = async () => clearSession();

const client = createAuthenticatedGatewayClient('https://gateway.test', session);
const transport = {
  request: (path: string, init: RequestInit & { method: 'GET' | 'POST' | 'POST_READ' | 'PATCH' }) =>
    client.request(path, { method: init.method, signal: init.signal ?? undefined, headers: init.headers as Record<string, string>, ...(init.body == null ? {} : { body: init.body }) }),
};
const services = createCatalogHttpServices(transport);
const pricing = await createPricingRuntime('api');
const { AppRoutes } = await import('../../src/app/routes/AppRoutes');
createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
    <AuthSessionContext.Provider value={mode === 'none' ? null : session}>
      <DataModeContext.Provider value="api">
        <AdminApiContext.Provider value>
          <CatalogServicesContext.Provider value={services}>
            <PricingProvider runtime={pricing}><AppRoutes /></PricingProvider>
          </CatalogServicesContext.Provider>
        </AdminApiContext.Provider>
      </DataModeContext.Provider>
    </AuthSessionContext.Provider>
  </MantineProvider>,
);
