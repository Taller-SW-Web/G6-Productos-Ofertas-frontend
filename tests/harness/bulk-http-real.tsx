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
import { verifyBulkHomologationManifest } from "../../src/features/bulk/adapters/bulkHomologationManifest";
import { createBulkFetchTransport, createHttpBulkRepository } from "../../src/features/bulk/adapters/httpBulkRepository";
import { BulkLayout } from "../../src/features/bulk/pages/BulkLayout";
import { BulkUploadPage } from "../../src/features/bulk/pages/BulkUploadPage";
import { BulkReviewPage } from "../../src/features/bulk/pages/BulkReviewPage";
import { BulkProgressPage } from "../../src/features/bulk/pages/BulkProgressPage";
import { BulkResultPage } from "../../src/features/bulk/pages/BulkResultPage";
import { BulkDownloadsPage } from "../../src/features/bulk/pages/BulkDownloadsPage";
import type { G7Session, SessionUser, SessionView } from "../../src/features/promotions/adapters/g7Session";

type TestIdentity = "owner-a" | "owner-b" | "forbidden" | "anonymous";

declare global {
  interface Window {
    __G6_BULK_E2E_JWT__?: string;
    __G6_BULK_E2E_OWNER_B_JWT__?: string;
    __G6_BULK_E2E_FORBIDDEN_JWT__?: string;
    __G6_BULK_E2E_API_ORIGIN__?: string;
    __G6_BULK_E2E_MANIFEST__?: {
      manifestJson: string;
      authorizedReleaseId: string;
      authorizedManifestSha256: string;
    };
    __G6_BULK_E2E_SET_IDENTITY__?: (identity: TestIdentity) => void;
  }
}

if (!import.meta.env.DEV) throw new Error("Entrada exclusiva de E2E Bulk.");
const rawApiOrigin = window.__G6_BULK_E2E_API_ORIGIN__;
if (!rawApiOrigin || !window.__G6_BULK_E2E_JWT__) throw new Error("Falta identidad o Gateway de pruebas.");
const apiOrigin: string = rawApiOrigin;

const users: Record<TestIdentity, SessionUser | null> = {
  "owner-a": { id: "00000000-0000-4000-8000-000000000050", nombreCompleto: "Gestor E2E", correo: "bulk-e2e@example.invalid", roles: ["GESTOR_COMERCIAL"] },
  "owner-b": { id: "00000000-0000-4000-8000-000000000051", nombreCompleto: "Gestor E2E B", correo: "bulk-e2e-b@example.invalid", roles: ["GESTOR_COMERCIAL"] },
  forbidden: { id: "00000000-0000-4000-8000-000000000052", nombreCompleto: "Sin Rol", correo: "bulk-no-role@example.invalid", roles: [] },
  anonymous: null,
};
let identity: TestIdentity = "owner-a";
let view: SessionView = { user: users[identity], mfa: false, busy: false, notice: "", expiresAt: Date.now() + 600_000 };
const listeners = new Set<() => void>();
const session = {
  getAccessToken: async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (identity === "owner-a") return window.__G6_BULK_E2E_JWT__ ?? null;
    if (identity === "owner-b") return window.__G6_BULK_E2E_OWNER_B_JWT__ ?? window.__G6_BULK_E2E_FORBIDDEN_JWT__ ?? null;
    if (identity === "forbidden") return window.__G6_BULK_E2E_FORBIDDEN_JWT__ ?? null;
    return null;
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

async function mount() {
  const manifestInput = window.__G6_BULK_E2E_MANIFEST__;
  const homologationManifest = manifestInput ? await verifyBulkHomologationManifest(manifestInput) : undefined;
  if (manifestInput && !homologationManifest) throw new Error("Manifiesto de capacidades Bulk E2E inválido.");
  const enabled = Boolean(homologationManifest);
  const repository = createHttpBulkRepository(createBulkFetchTransport(apiOrigin), session, {
    reconciliationEnabled: enabled,
    replayEnabled: enabled,
    resumeEnabled: enabled,
    homologationManifest,
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
}

void mount();
