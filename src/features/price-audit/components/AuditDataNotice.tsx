import { Suspense } from "react";
import { FeedbackAlert } from "../../../components/shared";
import { useAuditRuntime } from "../services/AuditRuntimeContext";

export function AuditDataNotice() {
  const runtime = useAuditRuntime();
  const Tools = runtime.ReviewTools;
  return (
    <>
      {runtime.notice && (
        <FeedbackAlert semantic="info" title="Datos de demostración">
          {runtime.notice}
        </FeedbackAlert>
      )}
      {Tools && (
        <Suspense fallback={null}>
          <Tools />
        </Suspense>
      )}
    </>
  );
}
