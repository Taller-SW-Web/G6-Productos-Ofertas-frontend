import { useContext, useSyncExternalStore } from "react";
import type { SessionView } from "../../features/promotions/adapters/g7Session";
import { AuthSessionContext } from "./AuthSessionContext";

const unavailable: SessionView = {
  user: null, mfa: false, busy: false, notice: "", expiresAt: null,
};
const snapshot = () => unavailable;
const subscribe = () => () => {};

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  const view = useSyncExternalStore(session?.subscribe ?? subscribe, session?.snapshot ?? snapshot);
  return { session, view };
}
