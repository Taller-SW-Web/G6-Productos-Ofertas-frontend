import { Suspense } from "react";
import { ContextNote } from "../../../components/shared";
import { useAuditRuntime } from "../services/AuditRuntimeContext";

export function AuditDataNotice() {
  const runtime = useAuditRuntime();
  const Tools = runtime.ReviewTools;
  return (
    <>
      {runtime.notice && (
        <ContextNote title="Datos de demostración">
          {runtime.notice}
        </ContextNote>
      )}
      {Tools && (
        <Suspense fallback={null}>
          <Tools />
        </Suspense>
      )}
    </>
  );
}
