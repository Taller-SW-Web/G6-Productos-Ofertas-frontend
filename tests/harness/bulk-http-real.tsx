import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/oswald/latin-700.css";
import "../../src/theme/global.css";
import { HashRouter, Route, Routes } from "react-router-dom";
import { DataModeContext } from "../../src/app/config/DataModeContext";
import { PromotionSessionContext } from "../../src/app/config/PromotionSessionContext";
import { theme, cssVariablesResolver } from "../../src/theme/theme";
import { BulkRepositoryContext } from "../../src/features/bulk/services/BulkRepositoryContext";
import { createBulkFetchTransport, createHttpBulkRepository } from "../../src/features/bulk/adapters/httpBulkRepository";
import { BulkLayout } from "../../src/features/bulk/pages/BulkLayout";
import { BulkUploadPage } from "../../src/features/bulk/pages/BulkUploadPage";
import { BulkReviewPage } from "../../src/features/bulk/pages/BulkReviewPage";
import { BulkProgressPage } from "../../src/features/bulk/pages/BulkProgressPage";
import { BulkResultPage } from "../../src/features/bulk/pages/BulkResultPage";
import { BulkDownloadsPage } from "../../src/features/bulk/pages/BulkDownloadsPage";
import type { G7Session, SessionUser, SessionView } from "../../src/features/promotions/adapters/g7Session";

declare global {
  interface Window {
    __G6_BULK_E2E_JWT__?: string;
    __G6_BULK_E2E_FORBIDDEN_JWT__?: string;
    __G6_BULK_E2E_API_ORIGIN__?: string;
    __G6_BULK_E2E_SET_IDENTITY__?: (identity: "owner-a" | "owner-b") => void;
  }
}

if (!import.meta.env.DEV) throw new Error("Entrada exclusiva de E2E Bulk.");
const apiOrigin = window.__G6_BULK_E2E_API_ORIGIN__;
if (!apiOrigin || !window.__G6_BULK_E2E_JWT__) throw new Error("Falta identidad o Gateway de pruebas.");

const users: Record<"owner-a" | "owner-b", SessionUser> = {
  "owner-a": { id: "00000000-0000-4000-8000-000000000050", nombreCompleto: "Gestor E2E", correo: "bulk-e2e@example.invalid", roles: ["GESTOR_COMERCIAL"] },
  "owner-b": { id: "00000000-0000-4000-8000-000000000051", nombreCompleto: "Gestor E2E B", correo: "bulk-e2e-b@example.invalid", roles: ["GESTOR_COMERCIAL"] },
};
let identity: "owner-a" | "owner-b" = "owner-a";
let view: SessionView = { user: users[identity], mfa: false, busy: false, notice: "", expiresAt: Date.now() + 600_000 };
const listeners = new Set<() => void>();
const session = {
  getAccessToken: async (signal: AbortSignal) => {
    signal.throwIfAborted();
    return identity === "owner-a" ? window.__G6_BULK_E2E_JWT__ ?? null : window.__G6_BULK_E2E_FORBIDDEN_JWT__ ?? null;
  },
  refreshAccessToken: async () => null,
  invalidateAccessToken: () => undefined,
  snapshot: () => view,
  subscribe: (notify: () => void) => { listeners.add(notify); return () => listeners.delete(notify); },
} as unknown as G7Session;
window.__G6_BULK_E2E_SET_IDENTITY__ = (next) => {
  identity = next;
  view = { ...view, user: users[next] };
  listeners.forEach((notify) => notify());
};

const repository = createHttpBulkRepository(createBulkFetchTransport(apiOrigin), session, {
  reconciliationEnabled: false,
  replayEnabled: false,
  resumeEnabled: false,
});
createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
    <DataModeContext.Provider value="api"><PromotionSessionContext.Provider value={session}><BulkRepositoryContext.Provider value={repository}><HashRouter>
      <Routes><Route element={<BulkLayout />}>
        <Route path="/carga-masiva" element={<BulkUploadPage />} />
        <Route path="/carga-masiva/revisar" element={<BulkReviewPage />} />
        <Route path="/carga-masiva/importaciones/:batchId" element={<BulkProgressPage />} />
        <Route path="/carga-masiva/importaciones/:batchId/resultado" element={<BulkResultPage />} />
        <Route path="/carga-masiva/descargas" element={<BulkDownloadsPage />} />
      </Route></Routes>
    </HashRouter></BulkRepositoryContext.Provider></PromotionSessionContext.Provider></DataModeContext.Provider>
  </MantineProvider>,
);
