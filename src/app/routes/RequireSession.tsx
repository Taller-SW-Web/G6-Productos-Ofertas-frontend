import { useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DataModeContext } from "../config/DataModeContext";
import { useAuthSession } from "../config/useAuthSession";
import { canAdminister } from "../../features/auth/authorization";
import { AccessDenied } from "../../features/auth/components/AccessDenied";

export function RequireSession() {
  const mode = useContext(DataModeContext);
  // Local fixtures only: never compiled as an administrative bypass in production.
  if (import.meta.env.DEV && mode === "mock") return <Outlet />;
  return <AuthenticatedRoutes />;
}

function AuthenticatedRoutes() {
  const { session, view } = useAuthSession();
  const location = useLocation();
  const [validated, setValidated] = useState<{
    session: typeof session;
    userId: string;
  } | null>(null);
  const userId = view.user?.id;
  useEffect(() => {
    if (!session || !userId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const validate = async () => {
      // Keep an already validated identity mounted during the shared refresh.
      // Transports still await getAccessToken; expired tokens cannot authorize
      // new operations. A null result or session invalidation closes access.
      const token = await session.getAccessToken(controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      if (token) setValidated({ session, userId });
      else setValidated(null);
      const expiresAt = session.snapshot().expiresAt;
      if (token && expiresAt) timer = setTimeout(() => { void validate().catch(() => {}); }, Math.max(1, expiresAt - Date.now()));
    };
    void validate().catch(() => {});
    return () => { controller.abort(); clearTimeout(timer); };
  }, [session, userId]);
  if (!view.user || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  if (!canAdminister(view.user)) return <AccessDenied />;
  if (validated?.session !== session || validated?.userId !== userId) {
    return <p role="status">Validando sesión…</p>;
  }
  return <Outlet />;
}
