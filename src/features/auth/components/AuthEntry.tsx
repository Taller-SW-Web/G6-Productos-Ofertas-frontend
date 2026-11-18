import { useAuthSession } from "../../../app/config/useAuthSession";
import { canAdminister } from "../authorization";
import { LoginPage } from "../pages/LoginPage";

export function AuthEntry() {
  const { view } = useAuthSession();
  return canAdminister(view.user) ? <p role="status">Cargando panel…</p> : <LoginPage />;
}
