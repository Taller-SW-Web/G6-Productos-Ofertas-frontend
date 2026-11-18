import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
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

const gateway = new URLSearchParams(location.search).get("gateway");
if (!gateway) throw new Error("Falta servidor HTTP de prueba.");
let currentUser: SessionUser = {
  id: "g7-h4-owner-a",
  nombreCompleto: "Usuario H4 A",
  correo: "h4-owner-a@example.invalid",
  roles: ["GESTOR_COMERCIAL", "ADMINISTRADOR"],
};
let sessionView: SessionView = { user: currentUser, mfa: false, busy: false, notice: "", expiresAt: null };
const listeners = new Set<() => void>();
declare global { interface Window { h4SessionIdentity(): string | null } }
window.h4SessionIdentity = () => currentUser.id;
window.addEventListener("h4:identity", ((event: CustomEvent<SessionUser>) => {
  currentUser = event.detail;
  sessionView = { ...sessionView, user: currentUser };
  listeners.forEach((notify) => notify());
}) as EventListener);
const session = {
  getAccessToken: async () => "test.header.signature",
  refreshAccessToken: async () => null,
  invalidateAccessToken: () => undefined,
  snapshot: () => sessionView,
  subscribe: (notify: () => void) => { listeners.add(notify); return () => listeners.delete(notify); },
} as unknown as G7Session;
const repository = createHttpBulkRepository(createBulkFetchTransport(gateway), session);
createRoot(document.getElementById("root")!).render(
  <StrictMode><MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
    <DataModeContext.Provider value="api"><PromotionSessionContext.Provider value={session}><BulkRepositoryContext.Provider value={repository}><HashRouter>
      <Routes><Route element={<BulkLayout />}>
        <Route path="/carga-masiva" element={<BulkUploadPage />} />
        <Route path="/carga-masiva/revisar" element={<BulkReviewPage />} />
        <Route path="/carga-masiva/importaciones/:batchId" element={<BulkProgressPage />} />
        <Route path="/carga-masiva/importaciones/:batchId/resultado" element={<BulkResultPage />} />
        <Route path="/carga-masiva/descargas" element={<BulkDownloadsPage />} />
      </Route></Routes>
    </HashRouter></BulkRepositoryContext.Provider></PromotionSessionContext.Provider></DataModeContext.Provider>
  </MantineProvider></StrictMode>,
);
