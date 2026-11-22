import { AuthSessionContext } from "../../src/app/config/AuthSessionContext";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/oswald/latin-700.css";
import "../../src/theme/global.css";
import { theme, cssVariablesResolver } from "../../src/theme/theme";
import { DataModeContext } from "../../src/app/config/DataModeContext";
import { CatalogServicesContext } from "../../src/features/catalog/services/CatalogServicesContext";
import { createCatalogHttpServices } from "../../src/features/catalog/services/catalogHttpRuntime";
import { createAuthenticatedGatewayClient } from "../../src/app/config/authenticatedGatewayClient";
import { G7Session, type SessionView } from "../../src/features/promotions/adapters/g7Session";
import { PricingProvider } from "../../src/features/pricing/components/PricingProvider";
import { createPricingRuntime } from "../../src/features/pricing/services/pricingService";

declare global { interface Window { __G6_CATALOG_E2E_JWT__?: string; __G6_CATALOG_E2E_CORRELATION__?: string; __G6_CATALOG_E2E_API_ORIGIN__?: string } }
if (!import.meta.env.DEV) throw new Error("Entrada exclusiva de E2E local.");
const requestedPath = new URLSearchParams(location.search).get("path");
const path = requestedPath ?? "/productos/nuevo";
const token = window.__G6_CATALOG_E2E_JWT__;
const apiOrigin = window.__G6_CATALOG_E2E_API_ORIGIN__;
if (!token) throw new Error("Falta identidad JWT del Gateway local.");
if (!apiOrigin) throw new Error("Falta el origen loopback de la API local.");
const session = new G7Session(location.origin);
const view: SessionView = {
  user: { id: "00000000-0000-4000-8000-000000000050", nombreCompleto: "Gestor E2E", correo: "catalog-e2e@example.invalid", roles: ["GESTOR_COMERCIAL"] },
  mfa: false, busy: false, notice: "", expiresAt: Date.now() + 600_000,
};
session.snapshot = () => view;
session.getAccessToken = async (signal: AbortSignal) => { signal.throwIfAborted(); return token; };
session.refreshAccessToken = async () => null;
session.invalidateAccessToken = () => undefined;
const client = createAuthenticatedGatewayClient(apiOrigin, session);
const services = createCatalogHttpServices({
  request: (path, init) => client.request(path, { method: init.method, signal: init.signal, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) }),
});
const pricing = await createPricingRuntime("api");
const { FeatureTestApp: App } = await import("./FeatureTestApp");
createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
    <AuthSessionContext.Provider value={session}>
      <DataModeContext.Provider value="api"><CatalogServicesContext.Provider value={services}>
        <PricingProvider runtime={pricing}><App initialEntry={path} /></PricingProvider>
      </CatalogServicesContext.Provider></DataModeContext.Provider>
    </AuthSessionContext.Provider>
  </MantineProvider>,
);
