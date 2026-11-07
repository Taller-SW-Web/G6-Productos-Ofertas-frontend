import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/oswald/latin-700.css";
import { theme, cssVariablesResolver } from "./theme/theme";
import "./theme/global.css";
import { createOptionalAuthSession } from "./app/config/authSessionRuntime";
import { AuthSessionContext } from "./app/config/AuthSessionContext";
import { resolveDataMode } from "./app/config/dataMode";
import { AuthEntry } from "./features/auth/components/AuthEntry";
import { canAdminister } from "./features/auth/authorization";
import { setMockIdentity } from "./features/shared/mockIdentity";
import { loginDestination } from "./app/routes/loginDestination";

const root = createRoot(document.getElementById("root")!);
const mode = resolveDataMode(import.meta.env.VITE_DATA_MODE, import.meta.env.DEV);
const gatewayOrigin = import.meta.env.VITE_GATEWAY_ORIGIN as string | undefined;
const securityApiBase = import.meta.env.VITE_G7_API_BASE as string | undefined;
// Public URLs from the same configuration consumed by the transports. The gate
// compares these values with independent approvals, then restricts real traffic.
const integrations = document.createElement("meta");
integrations.name = "g6-auth-integrations";
integrations.content = JSON.stringify({ g7ApiBase: securityApiBase ?? null, gatewayOrigin: gatewayOrigin ?? null });
document.head.append(integrations);
let notice: unknown;
try {
  notice = sessionStorage.getItem("g6:session-notice");
  sessionStorage.removeItem("g6:session-notice");
} catch { /* Storage denial only removes the optional feedback, never the guard. */ }
const session = createOptionalAuthSession(securityApiBase, notice === "expired" || notice === "logout" ? notice : undefined);
const publicDemo = import.meta.env.VITE_G6_READ_DEMO === "true" && (location.pathname === "/demo/g6" || location.pathname.startsWith("/demo/g6/"));
const bypass = import.meta.env.DEV && mode === "mock" && location.pathname !== "/login";
let identity: string | null = null;
let starting = false;
function start() {
  if (starting) return;
  starting = true;
  void import("./startApplication").then(module => module.startApplication(root, mode, session, gatewayOrigin, securityApiBase)).catch(() => {
    root.render(<p role="alert">No se pudo iniciar la aplicación.</p>);
  });
}
// A new JavaScript realm discards every provider, pending edit and module cache.
// Only mock domain data persists, under its identity namespace. No credential is
// put in storage, URLs or history. Logout revocation uses keepalive in G7Session.
session?.subscribe(() => {
  const user = session.snapshot().user;
  if (identity && (user?.id !== identity || !canAdminister(user))) {
    try { sessionStorage.setItem("g6:session-notice", session.snapshot().noticeSemantic === "info" ? "logout" : "expired"); } catch { /* Optional feedback only. */ }
    history.replaceState(null, "", "/login");
    location.reload();
    return;
  }
  if (user && canAdminister(user) && !identity) {
    identity = user.id;
    setMockIdentity(user.id);
    history.replaceState(null, "", loginDestination(history.state?.usr?.from));
    start();
  }
});
if (bypass) start();
else {
  if (!publicDemo && location.pathname !== "/login") {
    const from = location.pathname + location.search + location.hash;
    history.replaceState({ usr: { from }, key: "login", idx: 0 }, "", "/login");
  }
  const PublicDemo = lazy(() => import("./features/catalog/pages/G6ReadDemoApp").then(module => ({ default: module.G6ReadDemoApp })));
  root.render(<StrictMode><MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light">
    <AuthSessionContext.Provider value={session}><BrowserRouter><Routes>
      {publicDemo && <Route path="/demo/g6/*" element={<Suspense fallback={<p role="status">Cargando catálogo…</p>}><PublicDemo /></Suspense>} />}
      <Route path="*" element={<AuthEntry />} />
    </Routes></BrowserRouter></AuthSessionContext.Provider>
  </MantineProvider></StrictMode>);
}
