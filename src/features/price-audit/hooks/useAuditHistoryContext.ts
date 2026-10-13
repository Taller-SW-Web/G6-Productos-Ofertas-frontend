import { useOutletContext } from "react-router-dom";

export interface AuditHistoryContext {
  denyAccess: (message: string) => void;
}
export function useAuditHistoryContext() {
  return useOutletContext<AuditHistoryContext>();
}
